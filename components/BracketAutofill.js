// ===================================
// TennisWorld — Model auto-fill ("Fill with model")
// ===================================
// Fills undecided matches with the model's favorite, round by round.
//
// Design contract (ISA ## Decisions, point 6):
//   - Rounds are SEQUENTIAL: round N+1 needs round N's winners. We resolve a
//     round, pick its empty matches, COMMIT those picks, then re-derive so the
//     next round sees the advanced players.
//   - Concurrency is capped WITHIN a round (no unbounded fan-out on a 128 draw).
//   - Partial-failure safe: one /api/predict error skips that match; the fill
//     continues.
//   - Stale-guard token: if the user clicks (picks) mid-fill, the caller bumps the
//     token; in-flight fill detects the mismatch and aborts before committing more.
//   - Fill ONLY empty matches; NEVER overwrite a Finished result or an existing
//     user pick.
//
// Depends on TW.BracketPicks (derivation) and apiFetch (shared.js).
// ─────────────────────────────────────────────────────────────────────────────

window.TW = window.TW || {};

(function () {
    'use strict';

    const BP = function () { return window.TW.BracketPicks; };

    // Default per-round concurrency cap.
    const DEFAULT_CONCURRENCY = 4;

    // Run an async mapper over items with a concurrency cap. Never rejects:
    // failures resolve to { ok:false }. Returns array aligned to items.
    async function mapCapped(items, cap, fn) {
        const results = new Array(items.length);
        let i = 0;
        async function worker() {
            while (i < items.length) {
                const idx = i++;
                try {
                    results[idx] = { ok: true, value: await fn(items[idx], idx) };
                } catch (err) {
                    results[idx] = { ok: false, error: err };
                }
            }
        }
        const n = Math.max(1, Math.min(cap, items.length));
        await Promise.all(Array.from({ length: n }, worker));
        return results;
    }

    // Ask the model which player is favored for a match. Returns the favored
    // playerKey, or null on any failure / tie-with-no-signal.
    async function predictFavorite(match, ctx) {
        const qs = new URLSearchParams({
            playerKeyA: match.player1Key,
            playerKeyB: match.player2Key,
            tour: (ctx && ctx.tour) || match.tour || 'ATP',
        });
        if (ctx && ctx.surface) qs.set('surface', ctx.surface);
        if (match.round) qs.set('round', match.round);
        const pred = await apiFetch('/api/predict?' + qs.toString()); // throws → caller catches
        if (!pred || typeof pred.probA !== 'number' || typeof pred.probB !== 'number') return null;
        return pred.probA >= pred.probB ? match.player1Key : match.player2Key;
    }

    // ── fill ─────────────────────────────────────────────────────────────────
    // officialDraw: API rounds. startPicks: current picks (preserved/not overwritten).
    // opts: { tour, surface, concurrency, getToken, token, onProgress }.
    //   getToken() → current stale-guard token; we abort if it != opts.token.
    // Returns { picks, filled, skipped, aborted }.
    async function fill(officialDraw, startPicks, opts) {
        opts = opts || {};
        const bp = BP();
        if (!bp || !officialDraw) return { picks: startPicks || {}, filled: 0, skipped: 0, aborted: false };

        const cap = opts.concurrency || DEFAULT_CONCURRENCY;
        const token = opts.token;
        const getToken = typeof opts.getToken === 'function' ? opts.getToken : function () { return token; };
        const stale = function () { return token !== undefined && getToken() !== token; };

        // Never start from a corrupt pick set.
        let picks = bp.pruneInvalid(startPicks || {}, officialDraw);
        let filled = 0, skipped = 0;

        // Resolve the bracket once to learn how many rounds there are.
        let slots = bp.resolveAdvancement(officialDraw, picks);
        const roundCount = slots.length;

        for (let ri = 0; ri < roundCount; ri++) {
            if (stale()) return { picks: picks, filled: filled, skipped: skipped, aborted: true };

            // Re-derive so this round reflects winners committed in earlier rounds.
            slots = bp.resolveAdvancement(officialDraw, picks);
            const round = slots[ri] || [];

            // Candidate matches: pickable, not finished, not already picked, empty.
            const candidates = round.filter(function (m) {
                if (!bp.isPickable(m)) return false;          // also excludes TBD/bye
                if (picks[m.matchKey]) return false;          // don't overwrite a pick
                return true;
            });
            if (!candidates.length) continue;

            const ctx = { tour: opts.tour, surface: opts.surface };
            const outcomes = await mapCapped(candidates, cap, function (m) {
                return predictFavorite(m, ctx);
            });

            if (stale()) return { picks: picks, filled: filled, skipped: skipped, aborted: true };

            // Commit this round's results to a working copy, then swap in.
            const nextPicks = Object.assign({}, picks);
            candidates.forEach(function (m, idx) {
                const r = outcomes[idx];
                if (!r || !r.ok || !r.value) { skipped++; return; } // partial-failure safe
                if (m.status === 'Finished') return;                // never overwrite truth
                nextPicks[m.matchKey] = String(r.value);
                filled++;
            });
            picks = nextPicks;

            if (typeof opts.onProgress === 'function') {
                try { opts.onProgress({ round: ri, filled: filled, skipped: skipped }); } catch (_) {}
            }
        }

        return { picks: picks, filled: filled, skipped: skipped, aborted: false };
    }

    TW.BracketAutofill = { fill: fill, mapCapped: mapCapped };
})();
