// TennisWorld — DrawBracket component
// Template-first bracket: builds from the earliest round forward.
// Per-player set scores, winner/loser visual states, SVG connector lines.
// ─────────────────────────────────────────────────────────────────────────

window.TW = window.TW || {};

(function () {

    // ── Layout constants ──────────────────────────────────────────────────────
    const SLOT_H  = 60;   // px: vertical space per match in round 0 (doubles each round)
    const CARD_H  = 54;   // px: match card height
    const COL_W   = 224;  // px: column width
    const GAP_W   = 44;   // px: SVG connector gap between columns
    const LABEL_H = 40;   // px: round header height

    // ── Round tables ─────────────────────────────────────────────────────────
    const RID_TO_IDX = { 4:0, 5:1, 6:2, 7:3, 9:4, 10:5, 12:6 };
    // Reverse: column index → canonical roundId. Lets us project the FULL bracket
    // tree (every round to the Final) from the draw size, even when the API has
    // only delivered the first round (pre-tournament) — future rounds render as TBD.
    const IDX_TO_RID = { 0:4, 1:5, 2:6, 3:7, 4:9, 5:10, 6:12 };

    // Derive round label from match count so 16-match rounds in a 32-player
    // draw show "R32" instead of "R128", regardless of what roundId the API sends.
    function slotLabel(n) {
        if (n >= 64) return 'R128';
        if (n >= 32) return 'R64';
        if (n >= 16) return 'R32';
        if (n >= 8)  return 'R16';
        if (n >= 4)  return 'QF';
        if (n >= 2)  return 'SF';
        return 'F';
    }

    // ── Name normalisation for bracket-slot matching ──────────────────────────
    // Strips punctuation/spaces and lowercases so 'Van Assche' matches 'Van Assche L.'
    function norm(s) {
        return (s || '').toLowerCase().replace(/[^a-z]/g, '');
    }

    // Returns true if slot keyword appears within (or contains) the API player name
    function nameHits(apiName, slotKeyword) {
        const a = norm(apiName);
        const k = norm(slotKeyword);
        return a.includes(k) || k.includes(a);
    }

    // Given the 64-pair bracketSlots array, find which pair index this API match
    // belongs to (returns -1 if not found)
    function findPairIndex(pairs, name1, name2) {
        // Two-player match: check for both players in the same pair
        for (let i = 0; i < pairs.length; i++) {
            const [p1, p2] = pairs[i];
            if ((nameHits(name1, p1) && nameHits(name2, p2)) ||
                (nameHits(name1, p2) && nameHits(name2, p1))) return i;
        }
        // Fallback: single-player match (handles TBD or name mismatches)
        for (let i = 0; i < pairs.length; i++) {
            const [p1, p2] = pairs[i];
            if (nameHits(name1, p1) || nameHits(name1, p2) ||
                nameHits(name2, p1) || nameHits(name2, p2)) return i;
        }
        return -1;
    }

    // ── Public API ────────────────────────────────────────────────────────────
    // apiRounds: [{round, order, matches:[{roundId, matchKey, player1Key,
    //   player1Name, player1Seed, player2Key, player2Name, player2Seed,
    //   winner, setScores, status, isLive, …}]}]  (Final-first order from API)
    // tour:           'ATP' | 'WTA'
    // tournamentName: e.g. 'Roland Garros'  (used for bracketSlots lookup)
    // year:           e.g. 2026
    // Returns: { el: HTMLElement, mostActiveRid: number|null }
    TW.DrawBracket = function (apiRounds, tour, tournamentName, year) {
        // 1. Bucket matches by roundId
        const byRound = {};
        for (const r of apiRounds) {
            for (const m of r.matches) {
                const rid = Number(m.roundId);
                if (RID_TO_IDX[rid] === undefined) continue;
                (byRound[rid] = byRound[rid] || []).push(m);
            }
        }

        // Sort each bucket into slot order. The server stamps `slotIndex`
        // (official bracket order — single slot authority); matchKey is the
        // fallback for pre-slotIndex cached data.
        const slotVal = m => (m.slotIndex != null ? m.slotIndex : Number(m.matchKey));
        for (const rid of Object.keys(byRound)) {
            byRound[rid].sort((a, b) => slotVal(a) - slotVal(b));
        }

        // 2. Sort round IDs earliest → latest
        const roundIds = Object.keys(byRound).map(Number)
            .sort((a, b) => RID_TO_IDX[a] - RID_TO_IDX[b]);

        if (!roundIds.length) {
            return { el: mkEl('div', 'db-empty', 'No bracket data available.'), mostActiveRid: null };
        }

        // 3. Draw size = match count in first round
        const firstRid     = roundIds[0];
        const firstMatches = byRound[firstRid];
        const drawSize     = firstMatches.length;

        // 3b. If we have a static bracket order for this tournament, apply it now
        // so the first-round slots end up in the correct official bracket positions.
        const bracketPairs = (TW.getBracketSlots && tournamentName)
            ? TW.getBracketSlots(tournamentName, year, tour)
            : null;

        if (bracketPairs) {
            firstMatches.sort((a, b) => {
                const posA = findPairIndex(bracketPairs, a.player1Name, a.player2Name);
                const posB = findPairIndex(bracketPairs, b.player1Name, b.player2Name);
                return (posA === -1 ? 999 : posA) - (posB === -1 ? 999 : posB);
            });
        }

        // 3c. Project the FULL bracket depth from the draw size, not just the
        // rounds the API has delivered. A 64-match first round = 128 players =
        // 7 columns (R128…F). Pre-tournament draws thus render the whole tree
        // with future rounds as TBD, matching an official draw sheet — instead
        // of a single lonely column of first-round matches.
        const isPow2  = drawSize > 0 && (drawSize & (drawSize - 1)) === 0;
        const baseIdx = RID_TO_IDX[firstRid] ?? 0;
        const numRounds = isPow2 ? Math.round(Math.log2(drawSize)) + 1 : roundIds.length;

        const columnRids = [];
        for (let p = 0; p < numRounds && (baseIdx + p) <= 6; p++) {
            // Prefer the canonical rid for this column; fall back to any present rid.
            columnRids.push(IDX_TO_RID[baseIdx + p]);
        }

        // 4. Allocate slot grids — one column per bracket round (full depth)
        const slots = columnRids.map((_, ri) => {
            const n = Math.max(1, drawSize >> ri);
            return Array.from({ length: n }, () => ({ type: 'tbd', match: null }));
        });

        // 5. Populate first round
        firstMatches.forEach((m, si) => {
            if (si < slots[0].length) slots[0][si] = { type: 'match', match: m };
        });

        // 6. Build player-ID → {ri, si} tracking map
        const pMap = new Map();
        firstMatches.forEach((m, si) => {
            setPlayerSlot(pMap, m.player1Key, 0, si);
            setPlayerSlot(pMap, m.player2Key, 0, si);
        });

        // 7. Place later rounds via player tracking (no fallback to random slot).
        // Columns with no delivered matches stay TBD and are filled by winner
        // propagation (step 8) as results come in.
        for (let ri = 1; ri < columnRids.length; ri++) {
            const rid    = columnRids[ri];
            const prevRi = ri - 1;
            const matches = byRound[rid] || [];

            for (const m of matches) {
                const targetSi = resolveSlot(m, prevRi, pMap);
                if (targetSi !== null && targetSi >= 0 && targetSi < slots[ri].length) {
                    slots[ri][targetSi] = { type: 'match', match: m };
                    setPlayerSlot(pMap, m.player1Key, ri, targetSi);
                    setPlayerSlot(pMap, m.player2Key, ri, targetSi);
                }
                // No fallback — unresolvable matches are left as TBD
            }
        }

        // 8. Forward-propagate winners into remaining TBD slots
        propagateWinners(slots);

        // 9. Find most active round (highest with completed/live matches)
        let mostActiveRid = null;
        let highestIdx    = -1;
        for (const rid of roundIds) {
            const idx = RID_TO_IDX[rid];
            const hasActivity = (byRound[rid] || []).some(
                m => m.status === 'Finished' || m.isLive
            );
            if (hasActivity && idx > highestIdx) {
                highestIdx    = idx;
                mostActiveRid = rid;
            }
        }

        return { el: renderBracket(slots, columnRids, drawSize, tour), mostActiveRid };
    };

    // ── Player slot registration (skip null/invalid IDs) ─────────────────────
    function setPlayerSlot(pMap, key, ri, si) {
        if (key && key !== 'null' && key !== 'undefined' && key !== '') {
            pMap.set(key, { ri, si });
        }
    }

    // ── Determine a match's slot from player tracking ─────────────────────────
    function resolveSlot(m, prevRi, pMap) {
        const lookup = (key) => {
            if (!key || key === 'null' || key === 'undefined') return null;
            return pMap.get(key) || null;
        };

        const p1 = lookup(m.player1Key);
        const p2 = lookup(m.player2Key);

        // Best: player found at prevRi — they just won a match there
        if (p1 && p1.ri === prevRi) return Math.floor(p1.si / 2);
        if (p2 && p2.ri === prevRi) return Math.floor(p2.si / 2);

        // Fallback: player found in an earlier round — extrapolate
        const extrap = (p) => {
            if (!p) return null;
            const steps = prevRi - p.ri;
            return Math.floor(Math.floor(p.si / (1 << steps)) / 2);
        };
        return extrap(p1) ?? extrap(p2);
    }

    // ── Propagate winners into TBD slots ──────────────────────────────────────
    function propagateWinners(slots) {
        for (let ri = 1; ri < slots.length; ri++) {
            for (let si = 0; si < slots[ri].length; si++) {
                if (slots[ri][si].type !== 'tbd') continue;

                const a  = slots[ri - 1][si * 2];
                const b  = slots[ri - 1][si * 2 + 1];
                const wA = extractWinner(a);
                const wB = extractWinner(b);

                if (!wA && !wB) continue;

                slots[ri][si] = {
                    type: 'inferred',
                    match: {
                        matchKey:    `__inf_${ri}_${si}`,
                        player1Name: wA?.name || 'TBD',
                        player1Key:  wA?.key  || '',
                        player1Seed: wA?.seed ?? null,
                        player2Name: wB?.name || 'TBD',
                        player2Key:  wB?.key  || '',
                        player2Seed: wB?.seed ?? null,
                        winner:      null,
                        setScores:   [],
                        status:      'Not Started',
                        isLive:      false,
                    },
                };
            }
        }
    }

    function extractWinner(slot) {
        if (!slot || slot.type === 'tbd') return null;
        const m = slot.match;
        if (!m) return null;
        if (m.winner === 'player1') return { name: m.player1Name, key: m.player1Key, seed: m.player1Seed };
        if (m.winner === 'player2') return { name: m.player2Name, key: m.player2Key, seed: m.player2Seed };
        return null;
    }

    // ── Render bracket DOM ────────────────────────────────────────────────────
    function renderBracket(slots, roundIds, drawSize, tour) {
        const totalH = LABEL_H + drawSize * SLOT_H;
        const isFinal = roundIds[roundIds.length - 1] === 12; // has a Final column

        const wrap = document.createElement('div');
        wrap.className = 'db-wrap';

        const scroll = document.createElement('div');
        scroll.className = 'db-scroll';
        wrap.appendChild(scroll);

        const inner = document.createElement('div');
        inner.className = 'db-inner';
        inner.style.height = totalH + 'px';
        scroll.appendChild(inner);

        for (let ri = 0; ri < roundIds.length; ri++) {
            const rid   = roundIds[ri];
            const slotH = SLOT_H << ri;            // doubles every round
            const isF   = rid === 12 && isFinal;

            const col = buildColumn(slots[ri], rid, slotH, totalH, tour, isF);
            col.dataset.roundId = rid;
            col.dataset.ri      = ri;
            inner.appendChild(col);

            if (ri < roundIds.length - 1) {
                inner.appendChild(buildConnector(slots[ri].length, slotH, totalH));
            }
        }

        return wrap;
    }

    // ── One round column ──────────────────────────────────────────────────────
    function buildColumn(slotArr, roundId, slotH, totalH, tour, isFinalCol) {
        const col = document.createElement('div');
        col.className = 'db-col' + (isFinalCol ? ' db-col-final' : '');
        col.style.cssText = `width:${COL_W}px;height:${totalH}px;flex-shrink:0;position:relative;`;

        const lbl = document.createElement('div');
        lbl.className = 'db-col-label';
        lbl.style.cssText = `height:${LABEL_H}px;line-height:${LABEL_H}px;`;
        lbl.textContent = slotLabel(slotArr.length);
        col.appendChild(lbl);

        slotArr.forEach((slot, si) => {
            const top  = LABEL_H + si * slotH + Math.round((slotH - CARD_H) / 2);
            col.appendChild(buildCard(slot, top, tour));
        });

        return col;
    }

    // ── Match card ────────────────────────────────────────────────────────────
    function buildCard(slot, top, tour) {
        const el = document.createElement('div');
        el.style.cssText =
            `position:absolute;top:${top}px;left:6px;right:6px;height:${CARD_H}px;`;

        if (slot.type === 'tbd') {
            el.className = 'db-card db-card-tbd';
            el.innerHTML =
                `<div class="db-prow"><span class="db-seed-gap"></span><span class="db-pname db-tbd-name">TBD</span></div>` +
                `<div class="db-div"></div>` +
                `<div class="db-prow"><span class="db-seed-gap"></span><span class="db-pname db-tbd-name">TBD</span></div>`;
            return el;
        }

        const m      = slot.match;
        // Additive, mode-agnostic: expose stable identity + player keys so an
        // external decoration layer (pick-mode) can address cards without forking
        // this renderer. Harmless in official mode (pure data attributes).
        if (m.matchKey != null)    el.dataset.matchKey = m.matchKey;
        if (m.player1Key)          el.dataset.p1Key    = m.player1Key;
        if (m.player2Key)          el.dataset.p2Key    = m.player2Key;
        const p1Won  = m.winner === 'player1';
        const p2Won  = m.winner === 'player2';
        const isDone = m.status === 'Finished';
        const isLive = m.isLive;
        const isInf  = slot.type === 'inferred';
        const isChamp = isDone && slot.match.roundId === 12; // champion

        let cls = 'db-card';
        if (isDone)  cls += ' db-card-done';
        if (isLive)  cls += ' db-card-live';
        if (isInf)   cls += ' db-card-inferred';
        if (isChamp) cls += ' db-card-champ';
        el.className = cls;

        // Parse per-player set scores: first number = p1's games, second = p2's.
        // Handles both string "6-4" and object {p1:6, p2:4} formats from the API.
        const p1Sets = [];
        const p2Sets = [];
        for (const s of (m.setScores || [])) {
            if (typeof s === 'string') {
                const d = s.indexOf('-');
                if (d === -1) { p1Sets.push(s); p2Sets.push(''); continue; }
                p1Sets.push(s.substring(0, d));
                p2Sets.push(s.substring(d + 1).replace(/\([^)]*\)/, ''));
            } else if (s && typeof s === 'object') {
                p1Sets.push(String(s.p1 ?? ''));
                p2Sets.push(String(s.p2 ?? ''));
            }
        }

        el.innerHTML =
            pRowHtml(m.player1Name, m.player1Key, m.player1Seed,
                     p1Won, isDone && !p1Won, isDone ? p1Sets : [], isLive, isChamp && p1Won, tour, isInf) +
            `<div class="db-div"></div>` +
            pRowHtml(m.player2Name, m.player2Key, m.player2Seed,
                     p2Won, isDone && !p2Won, isDone ? p2Sets : [], isLive, isChamp && p2Won, tour, isInf);

        return el;
    }

    function pRowHtml(name, key, seed, won, lost, sets, isLive, isChamp, tour, isInferred) {
        const seedHtml = seed != null
            ? `<span class="db-seed">${seed}</span>`
            : `<span class="db-seed-gap"></span>`;

        let nameCls = 'db-pname';
        if (won)       nameCls += ' db-won';
        if (lost)      nameCls += ' db-lost';
        if (isInferred) nameCls += ' db-inf';

        const validKey = key && key !== 'null' && key !== 'undefined' && key !== '';
        const attrs = (validKey && !isInferred)
            ? ` data-open-player data-player-key="${key}" data-name="${(name||'').replace(/"/g,'&quot;')}" data-tour="${tour}" data-country=""`
            : '';

        const setsHtml = sets?.length
            ? `<span class="db-sets">${sets.map(s => `<span class="db-s">${s}</span>`).join('')}</span>`
            : (isLive ? `<span class="db-sets"><span class="db-s db-s-live">●</span></span>` : '');

        const champIcon = isChamp ? `<span class="db-champ-icon">★</span>` : '';

        return `<div class="db-prow${won ? ' db-prow-won' : ''}">` +
            seedHtml +
            `<span class="${nameCls}"${attrs}>${name || 'TBD'}</span>` +
            setsHtml +
            champIcon +
            `</div>`;
    }

    // ── SVG connector between adjacent round columns ──────────────────────────
    function buildConnector(slotCount, slotH, totalH) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width',  String(GAP_W));
        svg.setAttribute('height', String(totalH));
        svg.setAttribute('class',  'db-connector');
        svg.style.cssText = 'flex-shrink:0;display:block;';

        const pairs = Math.floor(slotCount / 2);
        const xV    = Math.round(GAP_W * 0.52); // vertical stem x
        const lines = [];

        for (let i = 0; i < pairs; i++) {
            const topY = LABEL_H + (2 * i)     * slotH + slotH / 2;
            const botY = LABEL_H + (2 * i + 1) * slotH + slotH / 2;
            const midY = (topY + botY) / 2;

            lines.push(
                `<line x1="0" y1="${topY}" x2="${xV}" y2="${topY}"/>`,
                `<line x1="0" y1="${botY}" x2="${xV}" y2="${botY}"/>`,
                `<line x1="${xV}" y1="${topY}" x2="${xV}" y2="${botY}"/>`,
                `<line x1="${xV}" y1="${midY}" x2="${GAP_W}" y2="${midY}"/>`,
            );
        }

        svg.innerHTML =
            `<g stroke="var(--db-line)" stroke-width="1" fill="none">${lines.join('')}</g>`;
        return svg;
    }

    // ── Utility ───────────────────────────────────────────────────────────────
    function mkEl(tag, cls, text) {
        const el = document.createElement(tag);
        if (cls)  el.className   = cls;
        if (text) el.textContent = text;
        return el;
    }

})();
