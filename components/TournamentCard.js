// ===================================
// TennisWorld — TournamentCard component
// ===================================
// Renders a calendar tournament card.
//
// TW.TournamentCard(tournament, meta) → HTML string
//   tournament — API calendar item (name, status, surface, startDate, endDate, live, finished, upcoming)
//   meta       — result of getTournamentMeta(tournament.name)
//
// The component is pure: it takes data in, returns HTML out.
// Used by draws.js to replace its inline renderTournamentCard function.

window.TW = window.TW || {};

TW.TournamentCard = function TournamentCard(t, meta) {
    const isLive     = t.status === 'live';
    const isDone     = t.status === 'completed';
    const surfaceCls = (t.surface || '').toLowerCase();
    const catClass   = meta.category.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    function formatDateShort(iso) {
        if (!iso) return '—';
        const d = new Date(iso + 'T00:00:00');
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    function formatDateFull(iso) {
        if (!iso) return '—';
        const d = new Date(iso + 'T00:00:00');
        return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }

    const dateStr = t.startDate && t.endDate
        ? (t.startDate === t.endDate
            ? formatDateFull(t.startDate)
            : formatDateShort(t.startDate) + ' – ' + formatDateShort(t.endDate))
        : '—';

    const statusBadge = isLive
        ? '<span class="cal-card-status-live">● Live</span>'
        : isDone
        ? '<span class="cal-card-status-done">Completed</span>'
        : '<span class="cal-card-status-upcoming">Upcoming</span>';

    const statsLine = isLive && t.live > 0
        ? '<strong>' + t.live + '</strong> live · <strong>' + t.finished + '</strong> played'
        : t.finished > 0
        ? '<strong>' + t.finished + '</strong> matches played'
        : t.upcoming > 0
        ? '<strong>' + t.upcoming + '</strong> scheduled'
        : '';

    const fullNameDisplay = meta.fullName !== meta.city ? meta.fullName : t.name;
    const starBtn = (typeof TW !== 'undefined' && TW.starButton)
        ? TW.starButton('tournament', t.tournamentKey, fullNameDisplay)
        : '';

    return [
        '<div class="cal-t-card surface-' + surfaceCls + (isLive ? ' is-live' : '') + '"',
        '     data-key="' + t.tournamentKey + '" data-name="' + t.name + '" data-season="' + (t.season || new Date().getFullYear()) + '">',
        '    <div class="cal-card-top">',
        '        <span class="cat-badge cat-' + catClass + '">' + meta.category + '</span>',
        '        ' + statusBadge,
        '        ' + starBtn,
        '    </div>',
        '    <div class="cal-card-main">',
        '        <div class="cal-card-city">' + meta.city + (meta.flag ? ' ' + meta.flag : '') + '</div>',
        '        <div class="cal-card-fullname">' + fullNameDisplay + '</div>',
        '    </div>',
        '    <div class="cal-card-footer">',
        '        <span class="cal-card-dates">' + dateStr + '</span>',
        '        <span class="surface-pill ' + surfaceCls + '">' + (t.surface || '') + '</span>',
        '    </div>',
        statsLine ? '    <div class="cal-card-stats' + (isLive ? ' is-live' : '') + '">' + statsLine + '</div>' : '',
        '    <div class="cal-card-cta">View Full Draw</div>',
        '</div>',
    ].join('\n');
};
