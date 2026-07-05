// ===================================
// TennisWorld — RadialBracket (circular bracket renderer)
// ===================================
// Same contract as TW.DrawBracket: a PURE function of its draw input returning
// { el }. Rounds are concentric rings — the first round on the outer ring,
// advancing inward to the Final at the center (trophy). Winner flow, pick-mode
// decoration, prob strips, and the player panel all keep working because the
// DOM contract is identical: each match renders as
//   .db-card[data-match-key] > .db-prow × 2  (player1 row first)
// with [data-open-player][data-player-key] name spans, exactly like DrawBracket.
//
// Layout math: slot si of ring ci sits at angle -90° + (si + 0.5) · 360°/n_ci
// (clockwise from the top). A parent's angle is automatically the average of
// its two children's angles, so connectors never cross. Radii shrink linearly
// toward the center. Connectors are straight SVG lines child→parent underneath
// the cards.
//
// Slot structure comes from TW.BracketPicks.resolveAdvancement (1-arg trust
// mode) — the SAME model the pick engine uses, so the two geometries can never
// disagree about who sits where.

window.TW = window.TW || {};

(function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function lastName(name) {
        if (!name || /^tbd$/i.test(name.trim())) return 'TBD';
        const parts = name.trim().split(/\s+/);
        return parts[parts.length - 1];
    }

    function RadialBracket(apiRounds, tour, tournamentName, year) {
        const bp = window.TW.BracketPicks;
        const wrap = document.createElement('div');
        wrap.className = 'db-wrap rb-outer';
        if (!bp || !apiRounds || !apiRounds.length) return { el: wrap, mostActiveRid: null };

        // Trust-mode resolve: full-depth slots per column, winners as encoded.
        const slots = bp.resolveAdvancement(apiRounds);
        if (!slots.length) return { el: wrap, mostActiveRid: null };

        const C = slots.length;                    // number of rings (incl. final)
        const CARD_W = 92, CARD_H = 34;
        const outerN = slots[0].length;            // matches on the outer ring
        // Outer radius: enough arc length per card; floor keeps small draws round.
        const r0 = Math.max(220, Math.round((outerN * (CARD_W * 0.82)) / (2 * Math.PI)));
        const ringGap = C > 1 ? Math.max(90, Math.round((r0 - 70) / (C - 1))) : 0;
        const radius = ci => (ci >= C - 1 ? 0 : Math.max(70, r0 - ci * ringGap));
        const size = 2 * (r0 + CARD_W); // square canvas with margin
        const cx = size / 2, cy = size / 2;

        wrap.style.width = size + 'px';
        wrap.style.height = size + 'px';

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'rb-svg');
        svg.setAttribute('width', String(size));
        svg.setAttribute('height', String(size));
        wrap.appendChild(svg);

        const pos = (ci, si) => {
            const n = slots[ci].length;
            if (ci >= C - 1) return { x: cx, y: cy };          // final at center
            const a = -Math.PI / 2 + ((si + 0.5) * 2 * Math.PI) / n;
            const r = radius(ci);
            return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
        };

        // Connectors first (under the cards).
        for (let ci = 1; ci < C; ci++) {
            for (let si = 0; si < slots[ci].length; si++) {
                const p = pos(ci, si);
                for (const childSi of [si * 2, si * 2 + 1]) {
                    if (!slots[ci - 1][childSi]) continue;
                    const c = pos(ci - 1, childSi);
                    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                    line.setAttribute('x1', String(c.x)); line.setAttribute('y1', String(c.y));
                    line.setAttribute('x2', String(p.x)); line.setAttribute('y2', String(p.y));
                    line.setAttribute('class', 'rb-line');
                    svg.appendChild(line);
                }
            }
        }

        // Trophy + champion label above the central final card.
        const finalMatch = slots[C - 1][0];
        const champ = finalMatch && finalMatch.winner
            ? (finalMatch.winner === 'player1' ? finalMatch.player1Name : finalMatch.player2Name)
            : null;
        const center = document.createElement('div');
        center.className = 'rb-center';
        center.style.left = cx + 'px';
        center.style.top = (cy - CARD_H - 22) + 'px';
        center.innerHTML = '🏆' + (champ ? ' <strong>' + esc(lastName(champ)) + '</strong>' : '');
        wrap.appendChild(center);

        // Cards.
        for (let ci = 0; ci < C; ci++) {
            for (let si = 0; si < slots[ci].length; si++) {
                const m = slots[ci][si];
                if (!m) continue;
                const { x, y } = pos(ci, si);
                const card = document.createElement('div');
                const isTbd = !m.player1Key && !m.player2Key;
                card.className = 'db-card rb-card' +
                    (isTbd ? ' db-card-tbd' : '') +
                    (m.status === 'Finished' ? ' db-card-done' : '') +
                    (m.isLive ? ' db-card-live' : '');
                if (m.matchKey != null) card.dataset.matchKey = m.matchKey;
                card.style.left = x + 'px';
                card.style.top = y + 'px';

                card.appendChild(rowEl(m, 'player1', tour));
                card.appendChild(rowEl(m, 'player2', tour));
                wrap.appendChild(card);
            }
        }

        function rowEl(m, side, tour) {
            const key = m[side + 'Key'], name = m[side + 'Name'], seed = m[side + 'Seed'];
            const row = document.createElement('div');
            const won = (m.winner === side);
            row.className = 'db-prow rb-prow' + (won ? ' db-prow-won' : '');
            const realKey = key && key !== 'null' && key !== 'undefined';
            const nameHtml = realKey
                ? '<span class="rb-name" data-open-player data-player-key="' + esc(key) +
                  '" data-name="' + esc(name || '') + '" data-tour="' + esc(tour || 'ATP') +
                  '" data-country="">' + esc(lastName(name)) + '</span>'
                : '<span class="rb-name rb-name-tbd">' + esc(lastName(name) || 'TBD') + '</span>';
            row.innerHTML = (seed != null ? '<span class="rb-seed">' + esc(seed) + '</span>' : '') + nameHtml;
            return row;
        }

        // Outer scroll container so the big circle never widens the page body.
        const scroll = document.createElement('div');
        scroll.className = 'rb-scroll';
        scroll.appendChild(wrap);

        // Fit the whole wheel in the viewport (World-Cup-poster feel). Runs
        // after the caller attaches the element; zoom keeps hit-testing and
        // absolute geometry consistent (unlike transform: scale).
        requestAnimationFrame(function () {
            const w = scroll.clientWidth;
            if (w && w < size) wrap.style.zoom = Math.max(0.4, w / size);
        });
        return { el: scroll, mostActiveRid: null };
    }

    TW.RadialBracket = RadialBracket;
})();
