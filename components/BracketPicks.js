// ===================================
// TennisWorld — Bracket pick-state model + derivation
// ===================================
// PURE DATA MODEL. No DOM. No globals (beyond the TW namespace export and an
// optional CommonJS export for node --test). The view is a function of
// (official draw + picks); see DrawBracket.js which renders f(draw).
//
// Design contract (ISA ## Decisions, advisor refinement):
//   - picks = { [slotId]: winnerPlayerKey }. slotId keys on STABLE match identity
//     (matchKey), never slot position. winnerKey is a stable playerKey.
//   - derivePickedDraw(officialDraw, picks) returns the official draw with each
//     decided pick written as that match's `winner`. DrawBracket then advances
//     the winner into the next-round slot for free (it reads `winner`). Cascade
//     invalidation is EMERGENT: if an upstream pick changes, the downstream slot
//     no longer contains the previously-picked player, so the stale downstream
//     pick simply does not resolve — no imperative clearDownstream() needed.
//   - pruneInvalid(picks, draw) is a SEPARATE storage-hygiene pass, used only
//     before save + before model-fill. It drops picks whose winner is no longer
//     reachable in the slot. It never runs during render (no feedback loop).
//   - BYE / qualifier advancement is part of the official draw (already encoded
//     as `winner` by the API), NOT a user pick. TBD / Qualifier / BYE slots are
//     not pickable.
// ─────────────────────────────────────────────────────────────────────────────

(function (root, factory) {
    const api = factory();
    // Browser global
    if (typeof window !== 'undefined') {
        window.TW = window.TW || {};
        window.TW.BracketPicks = api;
    }
    // node --test / CommonJS
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(this, function () {
    'use strict';

    // Bracket round IDs in earliest → latest order (mirror DrawBracket.RID_TO_IDX).
    const RID_TO_IDX = { 4: 0, 5: 1, 6: 2, 7: 3, 9: 4, 10: 5, 12: 6 };
    // Reverse: column index → canonical roundId (mirror DrawBracket.IDX_TO_RID).
    // Lets us project the FULL bracket tree (every round to the Final) from the
    // draw size even when the API delivered only the first round (pre-tournament).
    const IDX_TO_RID = { 0: 4, 1: 5, 2: 6, 3: 7, 4: 9, 5: 10, 6: 12 };

    // ── Helpers ───────────────────────────────────────────────────────────────
    function isRealKey(key) {
        return key && key !== 'null' && key !== 'undefined' && key !== '';
    }

    function isPlaceholderName(name) {
        return !name || /tbd|qualifier|\bbye\b/i.test(String(name).trim());
    }

    // A match is "Finished" (real result, locked) when the API says so.
    function isFinished(m) {
        return !!m && (m.status === 'Finished' || !!m.winner && m.status === 'Finished');
    }

    // Does the match already carry a real winner from the API (finished OR a
    // BYE/qualifier auto-advance the feed encoded)? That is official truth.
    function hasOfficialWinner(m) {
        return !!m && (m.winner === 'player1' || m.winner === 'player2') && m.status === 'Finished';
    }

    // Is this match a candidate for a USER pick?
    //   - both players must be real, known keys (not TBD/qualifier/bye)
    //   - the match must not be Finished (truth beats the pick)
    function isPickable(m) {
        if (!m) return false;
        if (isFinished(m)) return false;
        if (!isRealKey(m.player1Key) || !isRealKey(m.player2Key)) return false;
        if (isPlaceholderName(m.player1Name) || isPlaceholderName(m.player2Name)) return false;
        return true;
    }

    // Which side of the match does this winnerKey correspond to? null if neither.
    function sideForKey(m, winnerKey) {
        if (!m || !isRealKey(winnerKey)) return null;
        if (String(m.player1Key) === String(winnerKey)) return 'player1';
        if (String(m.player2Key) === String(winnerKey)) return 'player2';
        return null;
    }

    // ── derivePickedDraw ────────────────────────────────────────────────────────
    // Returns a NEW rounds structure (official deep-ish clone) where every decided
    // user pick is written as the match's `winner`. We deliberately do NOT mutate
    // the input. DrawBracket consumes `winner` to advance players, so this is all
    // that pick-mode needs from the renderer.
    //
    // Depth-bounded by round count: we iterate rounds earliest→latest exactly once,
    // resolving each round's picks against the players currently sitting in that
    // round (which already reflect earlier-round picks because we feed the renderer
    // the winner and it advances). To keep this module self-contained (no DOM, no
    // DrawBracket), we resolve advancement here too, so derivation is testable in
    // isolation and the picks model is the single source of truth.
    function derivePickedDraw(officialDraw, picks, opts) {
        picks = picks || {};
        if (!officialDraw || !Array.isArray(officialDraw)) return officialDraw;

        // Resolve the FULL projected bracket (every column to the Final) with picks
        // applied round-by-round. resolveAdvancement returns one array of slots per
        // column, indexed by COLUMN, with projected (non-official) matches carrying a
        // stable matchKey = '__inf_' + columnIdx + '_' + si and roundId =
        // IDX_TO_RID[columnIdx]. We emit ALL columns (official AND projected) as draw
        // rounds so DrawBracket receives the complete tree and renders each card with
        // data-match-key equal to the key we emit here — the round-trip BracketMaker
        // relies on when it reads a pick back under that same key.
        const slots = resolveAdvancement(officialDraw, picks, opts);
        if (!slots.length) return officialDraw;

        // Pull round labels from the official draw where we have them (keyed by the
        // canonical roundId of the column), so official columns keep their names.
        const labelByRid = {};
        const orderByRid = {};
        for (const r of officialDraw) {
            for (const m of (r.matches || [])) {
                const rid = Number(m.roundId);
                if (RID_TO_IDX[rid] === undefined) continue;
                if (!(rid in labelByRid)) {
                    labelByRid[rid] = r.round;
                    orderByRid[rid] = r.order;
                }
            }
        }

        // Map each resolved column to a draw round { round, order, matches:[...] }.
        // The column's canonical roundId is carried on its matches (resolveAdvancement
        // sets roundId per column), so we read it from the column rather than assuming
        // columns start at index 0.
        return slots.map(function (column, ci) {
            const rid = column.length && column[0] ? Number(column[0].roundId) : undefined;
            return {
                round: (rid != null && labelByRid[rid] != null) ? labelByRid[rid] : labelForColumn(column.length),
                order: (rid != null && orderByRid[rid] != null) ? orderByRid[rid] : ci,
                matches: column.map(function (m) {
                    return Object.assign({}, m);
                }),
            };
        });
    }

    // Round label from match count (mirror DrawBracket.slotLabel) — used only for
    // projected (future) columns the API hasn't delivered yet.
    function labelForColumn(n) {
        if (n >= 64) return 'R128';
        if (n >= 32) return 'R64';
        if (n >= 16) return 'R32';
        if (n >= 8) return 'R16';
        if (n >= 4) return 'QF';
        if (n >= 2) return 'SF';
        return 'F';
    }

    // ── resolveAdvancement ──────────────────────────────────────────────────────
    // Pure model of "who sits where" so we can test cascade invalidation without a
    // DOM. Mirrors DrawBracket's template-first bucketing: bucket by roundId, sort
    // by matchKey, then for round ri>0 the slot si is fed by slots 2*si and 2*si+1
    // of round ri-1. Picks are applied PER ROUND as we resolve, so a pick for a
    // later-round match (whose players only exist after earlier advancement) takes
    // effect once those players are in the slot.
    //
    // Cascade invalidation is EMERGENT: a later pick only resolves if the picked
    // player still sits in the slot after upstream picks are applied; otherwise it
    // simply does not become a winner (no ghost), with no imperative clearing.
    //
    // Depth-bounded by round count (the for-loop over ri), so duplicate or glitchy
    // keys cannot cause infinite recursion.
    //
    // Accepts either (officialDraw, picks) or a single already-derived draw arg
    // (picks defaults to {} — winners already encoded on the matches).
    //
    // opts.scratch (NEW, iteration 2): "prediction canvas" mode — the bracket a
    // fan fills FROM SCRATCH. First-round pairings come from the official draw
    // (they're the entry list), but real results NEVER pre-fill the canvas:
    // played first-round matches are pickable like any other, and every later
    // round derives solely from the user's picks. Only BYE/placeholder matches
    // keep their official auto-advance (there is nothing to predict). Reality is
    // used for GRADING (scoring, hit/miss chips), never for filling the canvas.
    function resolveAdvancement(officialDraw, picks, opts) {
        // Modes:
        //   - picks provided  → "re-decide": clear non-official winners, then apply
        //     picks per round (canonical engine; used everywhere internally).
        //   - picks omitted    → "trust the draw": keep whatever `winner` each match
        //     already carries (for an already-derived draw). The 1-arg form.
        //   - opts.scratch     → prediction canvas (see above).
        const hasPicks = picks != null;
        const scratch = !!(opts && opts.scratch);
        picks = picks || {};
        // Bucket by roundId.
        const byRound = {};
        for (const r of officialDraw) {
            for (const m of (r.matches || [])) {
                const rid = Number(m.roundId);
                if (RID_TO_IDX[rid] === undefined) continue;
                (byRound[rid] = byRound[rid] || []).push(m);
            }
        }
        const roundIds = Object.keys(byRound).map(Number)
            .sort(function (a, b) { return RID_TO_IDX[a] - RID_TO_IDX[b]; });
        if (!roundIds.length) return [];

        for (const rid of roundIds) {
            byRound[rid].sort(function (a, b) { return Number(a.matchKey) - Number(b.matchKey); });
        }

        // Project the FULL bracket depth from the draw size, not just the rounds the
        // API delivered (mirror DrawBracket). A 4-match first round = 8 players = 3
        // columns (R1, SF, F). Missing API rounds become projected columns whose
        // matches we synthesize with a STABLE key '__inf_' + columnIdx + '_' + si so
        // they round-trip with DrawBracket (which buckets by roundId and renders the
        // same key into data-match-key).
        const firstRid = roundIds[0];
        const drawSize = byRound[firstRid].length;
        const baseIdx = RID_TO_IDX[firstRid] != null ? RID_TO_IDX[firstRid] : 0;
        const isPow2 = drawSize > 0 && (drawSize & (drawSize - 1)) === 0;
        const numRounds = isPow2 ? Math.round(Math.log2(drawSize)) + 1 : roundIds.length;

        // One canonical roundId per column (full depth, capped at the Final / idx 6).
        const columnRids = [];
        for (let p = 0; p < numRounds && (baseIdx + p) <= 6; p++) {
            columnRids.push(IDX_TO_RID[baseIdx + p]);
        }

        const slots = columnRids.map(function (_, ri) {
            const n = Math.max(1, drawSize >> ri);
            return Array.from({ length: n }, function () { return null; });
        });

        // Apply a pick (or keep official winner) to a slot's match object, mutating
        // its `winner`. Truth (Finished/official winner) always wins.
        // Positional fallback: a pick made while this slot was still PROJECTED was
        // stored under '__inf_{col}_{slot}'. When the round later materializes with
        // a real matchKey, honor the old positional key so multi-day-tournament
        // picks survive draw growth (column/slot indexes are stable: matchKey-
        // ascending within round, base = first delivered round).
        function applyDecision(m, ci, si) {
            if (!m) return;
            if (hasOfficialWinner(m)) return;            // locked to real result
            let pick = picks[m.matchKey];
            if (!isRealKey(pick) && ci != null) pick = picks['__inf_' + ci + '_' + si];
            if (!isRealKey(pick)) { return; }            // leave winner as-is (likely null)
            if (!isPickable(m)) { return; }              // TBD/bye not pickable
            const side = sideForKey(m, pick);
            if (side) m.winner = side; else m.winner = m.winner || null;
        }

        function winnerOf(m) {
            if (!m) return null;
            if (m.winner === 'player1') return { key: m.player1Key, name: m.player1Name, seed: m.player1Seed };
            if (m.winner === 'player2') return { key: m.player2Key, name: m.player2Name, seed: m.player2Seed };
            return null;
        }

        // First round = clones of the given matches; apply their picks.
        byRound[firstRid].forEach(function (m, si) {
            if (si >= slots[0].length) return;
            const c = Object.assign({}, m);
            // Re-decide mode: reset non-official winner so a removed pick doesn't
            // linger. Trust mode (no picks): keep the encoded winner as-is.
            if (hasPicks && !hasOfficialWinner(c)) c.winner = null;
            // Scratch canvas: a real, played first-round match is STILL the user's
            // to predict — neutralize its result so it renders open and pickable.
            // BYE/placeholder matches keep the official auto-advance.
            if (scratch && !isPlaceholderName(c.player1Name) && !isPlaceholderName(c.player2Name)) {
                c.winner = null;
                c.status = 'Not Started';
                c.isLive = false;
                c.setScores = [];
            }
            applyDecision(c, 0, si);
            slots[0][si] = c;
        });

        // Later rounds: take the real API match for this slot if present, overlay
        // the advanced players from the previous round's winners, then apply the
        // pick for this (now-populated) match. Columns with no API matches are fully
        // projected; their synthesized matches carry the column-index inferred key.
        for (let ri = 1; ri < columnRids.length; ri++) {
            const rid = columnRids[ri];
            const real = byRound[rid] || [];
            for (let si = 0; si < slots[ri].length; si++) {
                const wA = winnerOf(slots[ri - 1][si * 2]);
                const wB = winnerOf(slots[ri - 1][si * 2 + 1]);
                // Scratch canvas: later rounds are ALWAYS synthesized from the
                // user's own advancement — a real match at this slot contributes
                // only its stable matchKey (so picks stay keyed consistently with
                // non-scratch flows and server scoring), never players or result.
                const base = scratch
                    ? {
                        matchKey: (real[si] && isRealKey(real[si].matchKey))
                            ? real[si].matchKey : '__inf_' + ri + '_' + si,
                        roundId: rid,
                        status: 'Not Started',
                        winner: null,
                    }
                    : (real[si] ? Object.assign({}, real[si]) : {
                        matchKey: '__inf_' + ri + '_' + si,
                        roundId: rid,
                        status: 'Not Started',
                        winner: null,
                    });
                const wasOfficial = hasOfficialWinner(base);
                // Overlay derived players (cascade truth) onto the slot.
                base.player1Key = wA ? wA.key : '';
                base.player1Name = wA ? wA.name : 'TBD';
                base.player1Seed = wA ? (wA.seed != null ? wA.seed : null) : null;
                base.player2Key = wB ? wB.key : '';
                base.player2Name = wB ? wB.name : 'TBD';
                base.player2Seed = wB ? (wB.seed != null ? wB.seed : null) : null;
                // Re-decide mode: clear stale winner before re-applying the pick.
                // Trust mode: keep the encoded winner only if that player still sits
                // here (cascade guard), else clear it.
                if (hasPicks) {
                    if (!wasOfficial) base.winner = null;
                } else {
                    if (base.winner === 'player1' && !(wA && String(wA.key) === String(base.player1Key))) base.winner = null;
                    if (base.winner === 'player2' && !(wB && String(wB.key) === String(base.player2Key))) base.winner = null;
                }
                applyDecision(base, ri, si);
                slots[ri][si] = base;
            }
        }
        return slots;
    }

    // ── pruneInvalid ────────────────────────────────────────────────────────────
    // Storage hygiene only (NOT render). Returns a NEW picks object containing only
    // picks that (a) target a real, present match and (b) name a player who is
    // actually reachable in that match's slot given the rest of the picks. Drops
    // ghosts: picks whose winner is no longer in the slot (cascade fallout), and
    // picks against Finished matches (truth wins).
    function pruneInvalid(picks, officialDraw, opts) {
        picks = picks || {};
        if (!officialDraw || !Array.isArray(officialDraw)) return {};

        // Resolve the full bracket with the current picks applied, so downstream
        // slots reflect upstream winners. In scratch mode the canvas semantics
        // apply — picks on real-played matches are VALID (reality only grades).
        const slots = resolveAdvancement(officialDraw, picks, opts);

        // Build matchKey → resolved {player1Key, player2Key, finished}.
        const resolvedByKey = new Map();
        for (const round of slots) {
            for (const m of round) {
                if (m && isRealKey(m.matchKey)) resolvedByKey.set(String(m.matchKey), m);
            }
        }
        // Also include first-round / any official matches not in resolved slots.
        for (const r of officialDraw) {
            for (const m of (r.matches || [])) {
                if (isRealKey(m.matchKey) && !resolvedByKey.has(String(m.matchKey))) {
                    resolvedByKey.set(String(m.matchKey), m);
                }
            }
        }

        const next = {};
        // Real-key picks are processed before positional aliases so the
        // "first write wins" guard below gives them precedence.
        const orderedIds = Object.keys(picks).sort(function (a, b) {
            return (a.indexOf('__inf_') === 0 ? 1 : 0) - (b.indexOf('__inf_') === 0 ? 1 : 0);
        });
        for (const slotId of orderedIds) {
            const winnerKey = picks[slotId];
            if (!isRealKey(winnerKey)) continue;
            let m = resolvedByKey.get(String(slotId));
            let storeKey = String(slotId);
            // Migration: a positional '__inf_{col}_{slot}' pick whose round has since
            // materialized re-keys to the real matchKey now sitting in that slot.
            if (!m) {
                const im = /^__inf_(\d+)_(\d+)$/.exec(String(slotId));
                if (im) {
                    const cand = (slots[Number(im[1])] || [])[Number(im[2])];
                    if (cand && isRealKey(cand.matchKey)) { m = cand; storeKey = String(cand.matchKey); }
                }
            }
            if (!m) continue;                          // match no longer in draw → drop
            if (isFinished(m)) continue;               // truth beats pick → drop
            if (!isPickable(m)) continue;              // TBD/bye now → drop
            const side = sideForKey(m, winnerKey);
            if (!side) continue;                       // ghost: player not in slot → drop
            if (next[storeKey] !== undefined) continue; // real-key pick wins over migrated alias
            next[storeKey] = String(winnerKey);
        }
        return next;
    }

    // ── championKey ─────────────────────────────────────────────────────────────
    // Returns the picked/decided champion playerKey, or null. The final round
    // is roundId 12 (or the last resolved round if 12 absent).
    function championKey(officialDraw, picks, opts) {
        const slots = resolveAdvancement(officialDraw, picks, opts);
        if (!slots.length) return null;
        const finalRound = slots[slots.length - 1];
        if (!finalRound || !finalRound.length) return null;
        const finalMatch = finalRound[0];
        if (!finalMatch) return null;
        if (finalMatch.winner === 'player1') return finalMatch.player1Key || null;
        if (finalMatch.winner === 'player2') return finalMatch.player2Key || null;
        return null;
    }

    return {
        RID_TO_IDX: RID_TO_IDX,
        isRealKey: isRealKey,
        isPlaceholderName: isPlaceholderName,
        isFinished: isFinished,
        hasOfficialWinner: hasOfficialWinner,
        isPickable: isPickable,
        sideForKey: sideForKey,
        derivePickedDraw: derivePickedDraw,
        resolveAdvancement: resolveAdvancement,
        pruneInvalid: pruneInvalid,
        championKey: championKey,
    };
});
