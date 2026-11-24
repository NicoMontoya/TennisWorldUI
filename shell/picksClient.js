// Same-origin JSON for member picks. Credentials travel as the session cookie.
// The body of a save is only matchKey and playerKey.

import { readLeaderboardPayload, readMinePayload, readOpenPayload } from './picks.js';

export function pickRequestBody(matchKey, playerKey) {
    return {
        matchKey: typeof matchKey === 'string' ? matchKey : '',
        playerKey: typeof playerKey === 'string' ? playerKey : '',
    };
}

function jsonHeaders() {
    return {
        Accept: 'application/json',
        'Content-Type': 'application/json',
    };
}

async function readResponse(response) {
    let json = null;
    try {
        json = await response.json();
    } catch {
        json = null;
    }
    const data = json && typeof json === 'object' && Object.prototype.hasOwnProperty.call(json, 'data')
        ? json.data
        : json;
    const retryAfter = response.headers && typeof response.headers.get === 'function'
        ? response.headers.get('Retry-After')
        : null;
    return {
        ok: Boolean(response.ok),
        status: response.status,
        data,
        retryAfter,
        network: false,
    };
}

async function request(path, options, deps) {
    const fetchImpl = (deps && deps.fetch) || globalThis.fetch;
    try {
        const response = await fetchImpl(path, options);
        return readResponse(response);
    } catch {
        return { ok: false, status: 0, data: null, retryAfter: null, network: true };
    }
}

export function loadOpen(deps) {
    return request('/api/picks/open', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
    }, deps);
}

export function loadMine(deps) {
    return request('/api/picks/mine', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
    }, deps);
}

export function loadLeaderboard(deps) {
    return request('/api/leaderboard', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
    }, deps);
}

export function savePick(matchKey, playerKey, deps) {
    const body = pickRequestBody(matchKey, playerKey);
    return request('/api/picks', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: jsonHeaders(),
        body: JSON.stringify(body),
    }, deps);
}

function authOf(results) {
    if (results.some((result) => result && result.status === 401)) return 'signed-out';
    if (results.some((result) => result && result.status === 403)) return 'guest';
    return '';
}

export async function loadMemberPicks(deps) {
    const [openResult, mineResult, boardResult] = await Promise.all([
        loadOpen(deps),
        loadMine(deps),
        loadLeaderboard(deps),
    ]);
    const results = [openResult, mineResult, boardResult];
    const auth = authOf(results);
    if (auth) return { auth, state: null };
    if (results.some((result) => !result.ok)) return { auth: '', state: null, error: true };
    return {
        auth: '',
        state: {
            phase: 'ready',
            open: readOpenPayload(openResult.data),
            mine: readMinePayload(mineResult.data),
            board: readLeaderboardPayload(boardResult.data),
            errors: {},
        },
    };
}
