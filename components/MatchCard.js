// ===================================
// TennisWorld — MatchCard component
// ===================================
// Renders the featured match panel (hub section).
//
// TW.MatchCard(match, tournamentName) → HTML string
//
// Depends on: TW.ScoreBoard, formatGameScore (shared.js)

window.TW = window.TW || {};

TW.MatchCard = function MatchCard(m, tournamentName) {
    if (!m) {
        return '<div style="padding:2rem;text-align:center;color:#999">No featured match available.</div>';
    }

    // ── Helpers ──────────────────────────────────────────────────────────
    function statusType(match) {
        if (match.isLive || match.status === '1') return 'live';
        if (match.status === 'Finished')          return 'finished';
        if (match.status === 'Cancelled')         return 'cancelled';
        return 'upcoming';
    }

    function winner(match) {
        // New API uses 'player1'/'player2'; old API used 'First Player'/'Second Player'
        if (match.winner === 'player1' || match.winner === 'First Player')  return 'p1';
        if (match.winner === 'player2' || match.winner === 'Second Player') return 'p2';
        const parts = (match.finalResult || '').split(' - ');
        if (parts.length === 2) {
            const a = Number(parts[0]), b = Number(parts[1]);
            if (a > b) return 'p1';
            if (b > a) return 'p2';
        }
        return null;
    }

    function formatMatchDate(match) {
        if (!match.date) return match.time || 'TBD';
        const d = new Date(match.date);
        if (isNaN(d)) return match.time || 'TBD';
        const now = new Date();
        const isToday = d.toDateString() === now.toDateString();
        const opts = { timeZone: 'UTC', hour12: false };
        const hasTime = match.date.includes('T') && !match.date.endsWith('T00:00:00') && !match.date.endsWith('T00:00:00Z');
        if (isToday) {
            if (hasTime) {
                return d.toLocaleTimeString('en-US', { ...opts, hour: '2-digit', minute: '2-digit' }) + ' UTC';
            }
            return 'Today';
        }
        const dateStr = d.toLocaleDateString('en-US', { ...opts, month: 'short', day: 'numeric' });
        if (hasTime) {
            return dateStr + ' · ' + d.toLocaleTimeString('en-US', { ...opts, hour: '2-digit', minute: '2-digit' }) + ' UTC';
        }
        return dateStr;
    }

    const ROUND_LABELS = {
        'final':'Final','finals':'Final',
        '1/2-finals':'Semifinals','semi-finals':'Semifinals','semifinal':'Semifinals','semifinals':'Semifinals',
        '1/4-finals':'Quarterfinals','quarter-finals':'Quarterfinals','quarterfinal':'Quarterfinals',
        '1/8-finals':'R16','round of 16':'R16',
        '1/16-finals':'R32','round of 32':'R32',
        '1/32-finals':'R64','1/64-finals':'R128',
    };
    function cleanRound(round) {
        if (!round) return '';
        const parts = round.split(' - ');
        const r = (parts[parts.length - 1] || round).trim();
        return ROUND_LABELS[r.toLowerCase()] || r;
    }

    // ── Derived values ────────────────────────────────────────────────────
    const status  = statusType(m);
    const win     = winner(m);
    const round   = cleanRound(m.round);
    const p1Score = TW.ScoreBoard(m, 'p1', status);
    const p2Score = TW.ScoreBoard(m, 'p2', status);

    // Status pill
    const statusPill = status === 'live'
        ? '<div class="hub-live-pill">● Live</div>'
        : status === 'finished'
        ? '<div class="hub-live-pill" style="color:var(--text-secondary)">Finished</div>'
        : '<div class="hub-live-pill" style="color:var(--text-muted)">Upcoming · ' + formatMatchDate(m) + '</div>';

    // Live point score
    const gameScoreHtml = (status === 'live' && m.currentGame)
        ? '<div class="hub-game-score">' + formatGameScore(m.currentGame) + '</div>'
        : '';

    // Set column headers (only show if there are scores)
    const setCount  = (m.setScores && m.setScores.length) || (status === 'upcoming' ? 0 : 1);
    const setLabels = setCount > 0
        ? Array.from({ length: setCount }, function (_, i) {
            return '<span class="hub-set hub-set-label">S' + (i + 1) + '</span>';
          }).join('')
        : '';

    return '\n    <div class="hub-player hub-player-left">\n' +
        '        <div class="hub-player-identity">\n' +
        '            <div>\n' +
        '                <div class="hub-player-name' + (win === 'p1' ? ' is-winner' : '') + '">' + m.player1Name + '</div>\n' +
        '                <div class="hub-player-sub">' + (status === 'finished' && win === 'p1' ? '● Winner' : '') + '</div>\n' +
        '            </div>\n' +
        '        </div>\n' +
        '        <div class="hub-sets">' + p1Score + '</div>\n' +
        '    </div>\n' +
        '    <div class="hub-center">\n' +
        '        ' + statusPill + '\n' +
        '        ' + gameScoreHtml + '\n' +
        '        <div class="hub-set-headers">' + setLabels + '</div>\n' +
        '        <div class="hub-round-center">' + tournamentName + ' · ' + round + '</div>\n' +
        '    </div>\n' +
        '    <div class="hub-player hub-player-right">\n' +
        '        <div class="hub-sets">' + p2Score + '</div>\n' +
        '        <div class="hub-player-identity hub-player-identity-r">\n' +
        '            <div>\n' +
        '                <div class="hub-player-name' + (win === 'p2' ? ' is-winner' : '') + '">' + m.player2Name + '</div>\n' +
        '                <div class="hub-player-sub">' + (status === 'finished' && win === 'p2' ? '● Winner' : '') + '</div>\n' +
        '            </div>\n' +
        '        </div>\n' +
        '    </div>';
};
