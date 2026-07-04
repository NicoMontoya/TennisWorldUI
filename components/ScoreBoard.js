// ===================================
// TennisWorld — ScoreBoard component
// ===================================
// Renders the set-score columns for one player inside a match card.
//
// TW.ScoreBoard(match, player, status) → HTML string
//   match  — normalised match object (setScores, finalResult, etc.)
//   player — 'p1' | 'p2'
//   status — 'live' | 'finished' | 'upcoming' | 'cancelled'
//
// Outputs a sequence of <span class="hub-set …"> elements.

window.TW = window.TW || {};

TW.ScoreBoard = function ScoreBoard(m, player, status) {
    const isLive = status === 'live';

    if (m.setScores && m.setScores.length) {
        return m.setScores.map(function (s, i) {
            const last = (i === m.setScores.length - 1);
            // New API: string like "6-2"; old API: object {p1, p2, tiebreak?}
            if (typeof s === 'string') {
                const parts = s.split('-');
                const val = Number(player === 'p1' ? parts[0] : parts.slice(1).join('-'));
                const opp = Number(player === 'p1' ? parts.slice(1).join('-') : parts[0]);
                const cls = (isLive && last) ? 'hub-set-c'
                           : val > opp       ? 'hub-set-w'
                           : val < opp       ? 'hub-set-l'
                           : '';
                return '<span class="hub-set ' + cls + '">' + val + '</span>';
            }
            const val  = player === 'p1' ? s.p1 : s.p2;
            const opp  = player === 'p1' ? s.p2 : s.p1;
            const cls  = (isLive && last) ? 'hub-set-c'
                       : val > opp        ? 'hub-set-w'
                       : val < opp        ? 'hub-set-l'
                       : '';
            const tbSup = s.tiebreak
                ? '<sup>' + (player === 'p1' ? s.tiebreak.p1 : s.tiebreak.p2) + '</sup>'
                : '';
            return '<span class="hub-set ' + cls + '">' + val + tbSup + '</span>';
        }).join('');
    }

    // Fallback: sets-won count from finalResult "2 - 0"
    const parts = (m.finalResult || '').split(' - ');
    if (parts.length === 2) {
        const val = Number(player === 'p1' ? parts[0] : parts[1]);
        const opp = Number(player === 'p1' ? parts[1] : parts[0]);
        const cls = val > opp ? 'hub-set-w' : val < opp ? 'hub-set-l' : '';
        return '<span class="hub-set ' + cls + '">' + val + '</span>';
    }

    return '<span class="hub-set">–</span>';
};
