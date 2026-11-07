// Path and query routing for the Sprint 1 preview.
// Pretty paths (/today, /t/:id, /p/:id) on the preview server.
// sprint1.html?view= keeps the same screens on a static file server.

const VIEWS = new Set(['today', 'schedule', 'picks', 'rankings', 'me', 'tournament', 'player']);
const SEGMENTS = new Set(['past', 'now', 'upnext']);
const TABS = new Set(['matches', 'draw', 'results']);
const STATES = new Set(['ready', 'empty', 'error', 'stale']);

export function safeId(value) {
    const text = String(value == null ? '' : value);
    return /^[a-z0-9-]{1,64}$/.test(text) ? text : null;
}

export function parseTour(value) {
    const tour = String(value == null ? '' : value).trim().toUpperCase();
    return tour === 'ATP' || tour === 'WTA' ? tour : null;
}

function viewFromPath(path) {
    if (/\/t\/[^/]+$/.test(path)) return 'tournament';
    if (/\/p\/[^/]+$/.test(path)) return 'player';
    if (path.endsWith('/schedule')) return 'schedule';
    if (path.endsWith('/picks')) return 'picks';
    if (path.endsWith('/rankings')) return 'rankings';
    if (path.endsWith('/me')) return 'me';
    if (path.endsWith('/today') || path === '/' || path.endsWith('/sprint1') || path.endsWith('/sprint1.html')) {
        return 'today';
    }
    return null;
}

function entityFromPath(path) {
    const tournament = path.match(/\/t\/([^/]+)$/);
    if (tournament) return safeId(decodeURIComponent(tournament[1]));
    const player = path.match(/\/p\/([^/]+)$/);
    if (player) return safeId(decodeURIComponent(player[1]));
    return null;
}

export function parseLocation(pathname, search) {
    const path = String(pathname || '/').split('#')[0].replace(/\/+$/, '') || '/';
    const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
    const fileMode = path.endsWith('/sprint1.html') || path.endsWith('/sprint1');
    let view = viewFromPath(path) || 'today';
    let entityId = entityFromPath(path);

    if (fileMode) {
        const requested = params.get('view');
        if (requested === 'tournament') {
            view = 'tournament';
            entityId = safeId(params.get('id'));
        } else if (requested === 'player') {
            view = 'player';
            entityId = safeId(params.get('id'));
        } else if (VIEWS.has(requested)) {
            view = requested;
            entityId = null;
        }
    }

    const segment = SEGMENTS.has(params.get('segment')) ? params.get('segment') : null;
    const tab = TABS.has(params.get('tab')) ? params.get('tab') : 'matches';
    const round = params.get('round') === 'all' || params.get('round') == null
        ? 'all'
        : (safeId(params.get('round')) || 'all');
    const month = /^\d{4}-\d{2}$/.test(params.get('month') || '') ? params.get('month') : null;
    const state = STATES.has(params.get('state')) ? params.get('state') : 'ready';
    const session = params.get('session') === 'sample' ? 'sample' : null;

    return {
        view,
        entityId,
        matchId: safeId(params.get('match')),
        segment,
        month,
        tab,
        round,
        tour: parseTour(params.get('tour')) || 'ATP',
        state,
        session,
        sample: params.get('sample') === '1',
        fileMode,
    };
}

export function hrefFor(route, currentPath) {
    const fileMode = route.fileMode != null
        ? route.fileMode
        : /sprint1\.html$/i.test(String(currentPath || ''));
    const params = new URLSearchParams();
    if (route.sample) params.set('sample', '1');
    if (route.tour && route.tour !== 'ATP') params.set('tour', route.tour);
    if (route.segment) params.set('segment', route.segment);
    if (route.month) params.set('month', route.month);
    if (route.tab && route.tab !== 'matches') params.set('tab', route.tab);
    if (route.round && route.round !== 'all') params.set('round', route.round);
    if (route.matchId) params.set('match', route.matchId);
    if (route.state && route.state !== 'ready') params.set('state', route.state);
    if (route.session === 'sample') params.set('session', 'sample');

    let path;
    if (fileMode) {
        path = '/sprint1.html';
        if (route.view && route.view !== 'today') params.set('view', route.view);
        if ((route.view === 'tournament' || route.view === 'player') && route.entityId) {
            params.set('id', route.entityId);
        }
    } else if (route.view === 'tournament' && route.entityId) {
        path = `/t/${encodeURIComponent(route.entityId)}`;
    } else if (route.view === 'player' && route.entityId) {
        path = `/p/${encodeURIComponent(route.entityId)}`;
    } else if (!route.view || route.view === 'today') {
        path = '/today';
    } else {
        path = `/${route.view}`;
    }

    const query = params.toString();
    return query ? `${path}?${query}` : path;
}
