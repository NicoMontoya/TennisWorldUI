// ===================================
// TennisWorld — PlayerHeader component
// ===================================
// Renders a player profile header section.
//
// TW.PlayerHeader(player) → HTML string
//   player — {
//     name, country, ranking, rankingPoints,
//     age, height, hand, turned_pro,
//     titles, grandSlams, winPct
//   }
//
// Depends on: flag (shared.js)

window.TW = window.TW || {};

TW.PlayerHeader = function PlayerHeader(p) {
    if (!p) return '';

    const countryFlag = typeof flag === 'function' ? flag(p.country) : '';
    const rankBadge   = p.ranking
        ? '<span class="player-rank-badge">#' + p.ranking + '</span>'
        : '';
    const pointsStr   = p.rankingPoints
        ? '<span class="player-rank-pts">' + Number(p.rankingPoints).toLocaleString() + ' pts</span>'
        : '';
    const handStr     = p.hand ? (p.hand === 'Right' ? 'R' : p.hand === 'Left' ? 'L' : p.hand) : '—';

    const stats = [
        { label: 'Ranking',    value: p.ranking   ? '#' + p.ranking   : '—' },
        { label: 'Points',     value: p.rankingPoints ? Number(p.rankingPoints).toLocaleString() : '—' },
        { label: 'Age',        value: p.age        || '—' },
        { label: 'Height',     value: p.height     || '—' },
        { label: 'Plays',      value: handStr },
        { label: 'Turned pro', value: p.turned_pro || '—' },
        { label: 'Titles',     value: p.titles != null ? p.titles : '—' },
        { label: 'GS titles',  value: p.grandSlams != null ? p.grandSlams : '—' },
    ].filter(function (s) { return s.value !== '—'; });

    const statsHtml = stats.map(function (s) {
        return '<div class="ph-stat">' +
            '<span class="ph-stat-val">' + s.value + '</span>' +
            '<span class="ph-stat-label">' + s.label + '</span>' +
            '</div>';
    }).join('');

    const winPctHtml = p.winPct != null
        ? '<div class="ph-winpct">' +
          '<div class="ph-winpct-bar"><div class="ph-winpct-fill" style="width:' + p.winPct + '%"></div></div>' +
          '<span class="ph-winpct-label">' + p.winPct + '% win rate</span>' +
          '</div>'
        : '';

    return '<div class="player-header">' +
        '<div class="ph-identity">' +
        '    <div class="ph-flag">' + countryFlag + '</div>' +
        '    <div class="ph-name-group">' +
        '        <h1 class="ph-name">' + (p.name || '—') + '</h1>' +
        '        <div class="ph-country">' + (p.country || '') + '</div>' +
        '    </div>' +
        '    <div class="ph-ranks">' + rankBadge + pointsStr + '</div>' +
        '</div>' +
        '<div class="ph-stats">' + statsHtml + '</div>' +
        winPctHtml +
        '</div>';
};
