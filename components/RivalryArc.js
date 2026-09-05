// ===================================
// TennisWorld — RivalryArc
// ===================================
// SVG sparkline of finished H2H meetings. In-repo only — no CDN, no chart lib.
// Mount: TW.RivalryArc.mount(el, { meetings, player1Key, player2Key })
// Names/captions use textContent only. Never interpolate API strings into HTML.

(function (root) {
    'use strict';

    const NS = 'http://www.w3.org/2000/svg';
    const MAX_NODES = 5;
    const SURFACES = { hard: 'hard', clay: 'clay', grass: 'grass' };

    function svgEl(name, attrs) {
        const node = document.createElementNS(NS, name);
        if (attrs) {
            Object.keys(attrs).forEach(k => {
                if (attrs[k] != null) node.setAttribute(k, String(attrs[k]));
            });
        }
        return node;
    }

    function normalizeSurface(raw) {
        const s = String(raw == null ? '' : raw).toLowerCase();
        if (s.indexOf('clay') !== -1) return 'clay';
        if (s.indexOf('grass') !== -1) return 'grass';
        return 'hard';
    }

    function winnerKey(match) {
        if (!match) return null;
        const w = match.winner;
        if (w === 'First Player' || w === 'player1' || w === 'p1') return match.player1Key;
        if (w === 'Second Player' || w === 'player2' || w === 'p2') return match.player2Key;
        return null;
    }

    function finishedMeetings(meetings) {
        return (Array.isArray(meetings) ? meetings : [])
            .filter(m => m && (m.status === 'Finished' || m.status === 'finished'))
            .slice()
            .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    }

    function lastName(name) {
        const parts = String(name || '').trim().split(/\s+/);
        return parts[parts.length - 1] || '';
    }

    function nameForKey(meetings, key, fallback) {
        if (fallback) return String(fallback);
        for (let i = 0; i < meetings.length; i++) {
            const m = meetings[i];
            if (String(m.player1Key) === String(key) && m.player1Name) return String(m.player1Name);
            if (String(m.player2Key) === String(key) && m.player2Name) return String(m.player2Name);
        }
        return '';
    }

    function deriveStreak(meetings, player1Key, player2Key) {
        const finished = finishedMeetings(meetings);
        if (!finished.length) {
            return { holderKey: null, count: 0, lastWinnerKey: null, label: 'No finished meetings' };
        }
        let holder = null;
        let count = 0;
        for (let i = finished.length - 1; i >= 0; i--) {
            const w = winnerKey(finished[i]);
            if (!w) break;
            if (holder == null) {
                holder = w;
                count = 1;
                continue;
            }
            if (String(w) === String(holder)) count++;
            else break;
        }
        return {
            holderKey: holder,
            count,
            lastWinnerKey: holder,
            label: null,
        };
    }

    function streakCaption(meetings, player1Key, player2Key, names) {
        const finished = finishedMeetings(meetings);
        const streak = deriveStreak(finished, player1Key, player2Key);
        const n1 = names && names.player1Name;
        const n2 = names && names.player2Name;
        const nameOf = (key) => {
            if (String(key) === String(player1Key)) return lastName(nameForKey(finished, player1Key, n1)) || 'P1';
            if (String(key) === String(player2Key)) return lastName(nameForKey(finished, player2Key, n2)) || 'P2';
            return 'Player';
        };
        if (!finished.length) return 'No finished meetings';
        if (streak.count >= 2 && streak.holderKey) {
            return nameOf(streak.holderKey) + ' — ' + streak.count + '-match streak';
        }
        if (streak.holderKey) {
            return nameOf(streak.holderKey) + ' won the last meeting';
        }
        return finished.length + ' finished meeting' + (finished.length === 1 ? '' : 's');
    }

    function buildSvg(nodes) {
        const w = 220;
        const h = 48;
        const padX = 16;
        const midY = 22;
        const svg = svgEl('svg', {
            class: 'rivalry-arc-svg',
            viewBox: '0 0 ' + w + ' ' + h,
            width: '100%',
            height: '100%',
            role: 'img',
            'aria-hidden': 'true',
        });
        if (!nodes.length) return svg;

        const inner = w - padX * 2;
        const step = nodes.length === 1 ? 0 : inner / (nodes.length - 1);
        const line = svgEl('line', {
            class: 'rivalry-arc-line',
            x1: padX,
            y1: midY,
            x2: padX + inner,
            y2: midY,
        });
        svg.appendChild(line);

        nodes.forEach((n, i) => {
            const x = padX + step * i;
            const y = n.winnerSide === 'a' ? midY - 8 : n.winnerSide === 'b' ? midY + 8 : midY;
            const surfClass = n.surface === 'clay'
                ? 'rivalry-arc-node-clay'
                : n.surface === 'grass'
                    ? 'rivalry-arc-node-grass'
                    : 'rivalry-arc-node-hard';
            const circle = svgEl('circle', {
                class: 'rivalry-arc-node ' + surfClass,
                cx: x,
                cy: y,
                r: 5.5,
            });
            svg.appendChild(circle);
        });
        return svg;
    }

    function mount(el, opts) {
        if (!el) return false;
        el.replaceChildren();
        const meetings = opts && opts.meetings;
        const player1Key = opts && opts.player1Key;
        const player2Key = opts && opts.player2Key;
        if (!player1Key || !player2Key) {
            el.hidden = true;
            return false;
        }
        const finished = finishedMeetings(meetings);
        if (!finished.length) {
            el.hidden = true;
            return false;
        }

        const recent = finished.slice(-MAX_NODES);
        const nodes = recent.map(m => {
            const wKey = winnerKey(m);
            let winnerSide = '';
            if (wKey != null && String(wKey) === String(player1Key)) winnerSide = 'a';
            else if (wKey != null && String(wKey) === String(player2Key)) winnerSide = 'b';
            return {
                surface: normalizeSurface(m.surface),
                winnerSide,
            };
        });

        const wrap = document.createElement('div');
        wrap.className = 'rivalry-arc';
        wrap.setAttribute('role', 'img');

        const chart = document.createElement('div');
        chart.className = 'rivalry-arc-chart';
        chart.appendChild(buildSvg(nodes));

        const caption = document.createElement('p');
        caption.className = 'rivalry-arc-caption';
        caption.textContent = streakCaption(finished, player1Key, player2Key, opts);

        const n1 = lastName(nameForKey(finished, player1Key, opts.player1Name)) || 'P1';
        const n2 = lastName(nameForKey(finished, player2Key, opts.player2Name)) || 'P2';
        wrap.setAttribute(
            'aria-label',
            'Rivalry arc, last ' + nodes.length + ' meetings. ' + caption.textContent + '. ' + n1 + ' vs ' + n2 + '.'
        );

        wrap.appendChild(chart);
        wrap.appendChild(caption);
        el.hidden = false;
        el.appendChild(wrap);
        return true;
    }

    const api = {
        mount,
        finishedMeetings,
        deriveStreak,
        streakCaption,
        normalizeSurface,
        winnerKey,
        MAX_NODES,
    };

    root.TW = root.TW || {};
    root.TW.RivalryArc = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : globalThis));
