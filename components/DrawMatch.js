// ===================================
// TennisWorld — DrawMatch component
// ===================================
// Renders a single draw match as a <tr> row.
//
// TW.DrawMatch(match) → HTML string (<tr>…</tr>)
//
// Depends on: formatSetScores, formatGameScore (shared.js)

window.TW = window.TW || {};

TW.DrawMatch = function DrawMatch(m) {
    function statusType(match) {
        if (match.isLive || match.status === '1') return 'live';
        if (match.status === 'Finished')          return 'finished';
        if (match.status === 'Cancelled')         return 'cancelled';
        return 'upcoming';
    }

    function formatDateShort(iso) {
        if (!iso) return '—';
        const d = new Date(iso + 'T00:00:00');
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    const status = statusType(m);
    const winner = m.winner === 'First Player'  ? 'p1'
                 : m.winner === 'Second Player' ? 'p2'
                 : null;
    const p1Won = winner === 'p1';
    const p2Won = winner === 'p2';

    // ── Score cell ─────────────────────────────────────────────────────────
    let score;
    if (status === 'finished') {
        if (m.setScores && m.setScores.length) {
            score = m.setScores.map(function (s) {
                const base = s.p1 + '-' + s.p2;
                if (s.tiebreak) {
                    const loser = Math.min(s.tiebreak.p1, s.tiebreak.p2);
                    return base + '<sup>' + loser + '</sup>';
                }
                return base;
            }).join(' ');
        } else {
            const parts = (m.finalResult || '').split(' - ');
            score = parts.length === 2 ? parts[0] + '–' + parts[1] : '—';
        }
    } else if (status === 'live') {
        const pts    = m.currentGame ? ' <small>' + formatGameScore(m.currentGame) + '</small>' : '';
        const setStr = (m.setScores && m.setScores.length) ? formatSetScores(m.setScores) : '';
        score = '<span class="draw-live">● ' + setStr + pts + '</span>';
    } else if (status === 'cancelled') {
        score = '—';
    } else {
        score = m.time || 'TBD';
    }

    const p1Class = 'draw-p1' + (p1Won ? ' draw-winner' : (status === 'finished' ? ' draw-loser' : ''));
    const p2Class = 'draw-p2' + (p2Won ? ' draw-winner' : (status === 'finished' ? ' draw-loser' : ''));

    return '<tr class="draw-row ' + status + '">' +
        '<td class="' + p1Class + '">' + (m.player1Name || '—') + '</td>' +
        '<td class="draw-score">' + score + '</td>' +
        '<td class="' + p2Class + '">' + (m.player2Name || '—') + '</td>' +
        '<td class="draw-date">' + formatDateShort(m.date) + '</td>' +
        '</tr>';
};

// Renders a full round table from an array of matches
TW.DrawRoundTable = function DrawRoundTable(matches) {
    if (!matches || !matches.length) {
        return '<p style="padding:1rem 0;color:#999;font-size:.875rem">No matches in this round yet.</p>';
    }
    return '<table class="draw-table"><tbody>' +
        matches.map(TW.DrawMatch).join('') +
        '</tbody></table>';
};
