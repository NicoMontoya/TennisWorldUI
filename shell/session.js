// Cookie session for the invite gate.
// The only credential is the __Host-tw_session cookie. Nothing here reads or
// writes a bearer token. localStorage may hold tw-member-hint ('1' or '0')
// for the first paint; the server's answer replaces it.

export const NETWORK_ERROR = "Couldn't reach TennisWorld. Try again.";
export const COOLDOWN_SECONDS = 60;

const HINT_KEY = 'tw-member-hint';
const LEGACY_KEYS = ['tw-auth-token', 'tw-auth-user'];

function bin(storage) {
    if (storage) return storage;
    try {
        return globalThis.localStorage || null;
    } catch {
        return null;
    }
}

export function clearLegacyAuthKeys(storage) {
    const store = bin(storage);
    if (!store) return;
    LEGACY_KEYS.forEach((key) => {
        try { store.removeItem(key); } catch { /* private mode */ }
    });
}

export function readMemberHint(storage) {
    const store = bin(storage);
    if (!store) return false;
    try {
        return store.getItem(HINT_KEY) === '1';
    } catch {
        return false;
    }
}

export function writeMemberHint(isMember, storage) {
    const store = bin(storage);
    if (!store) return;
    try {
        store.setItem(HINT_KEY, isMember ? '1' : '0');
    } catch { /* quota */ }
}

export function hintedStatus(storage) {
    return readMemberHint(storage) ? 'member' : 'signed-out';
}

export function displayNameFromUser(user) {
    if (!user || typeof user !== 'object') return '';
    const named = typeof user.displayName === 'string' ? user.displayName.trim() : '';
    if (named) return named;
    const first = typeof user.firstName === 'string' ? user.firstName.trim() : '';
    const last = typeof user.lastName === 'string' ? user.lastName.trim() : '';
    return [first, last].filter(Boolean).join(' ');
}

export function followsFromUser(user) {
    const list = user && Array.isArray(user.favorites) ? user.favorites : [];
    return list.map((item) => {
        const name = item && typeof item.name === 'string' ? item.name : '';
        return name ? { name } : null;
    }).filter(Boolean);
}

export function shouldFetchPicks() {
    return false;
}

function userFromJson(json) {
    if (!json || typeof json !== 'object') return null;
    const data = Object.prototype.hasOwnProperty.call(json, 'data') ? json.data : json;
    if (!data || typeof data !== 'object') return null;
    if (data.user && typeof data.user === 'object') return data.user;
    if ('member' in data || data.displayName || data.firstName || data.email || data.favorites) {
        return data;
    }
    return null;
}

export async function readAuthResponse(response) {
    let json = null;
    try {
        json = await response.json();
    } catch {
        json = null;
    }
    const user = userFromJson(json);
    const error = json && typeof json.error === 'string' ? json.error : '';
    const ok = Boolean(response.ok && (!json || json.ok !== false));
    return {
        ok,
        status: response.status,
        user,
        error,
        cooldown: response.status === 429 ? COOLDOWN_SECONDS : 0,
    };
}

function authHeaders() {
    return {
        'Content-Type': 'application/json',
        Accept: 'application/json',
    };
}

export async function postAuth(path, body, deps = {}) {
    clearLegacyAuthKeys(deps.storage);
    const fetchImpl = deps.fetch || globalThis.fetch;
    let response;
    try {
        response = await fetchImpl(path, {
            method: 'POST',
            credentials: 'same-origin',
            headers: authHeaders(),
            body: JSON.stringify(body == null ? {} : body),
        });
    } catch {
        return { ok: false, status: 0, user: null, error: NETWORK_ERROR, cooldown: 0 };
    }
    const result = await readAuthResponse(response);
    if (result.ok && result.user) writeMemberHint(result.user.member === true, deps.storage);
    return result;
}

export function registerAccount(body, deps) {
    return postAuth('/api/auth/register', {
        inviteCode: body.inviteCode,
        firstName: body.firstName,
        email: body.email,
        password: body.password,
    }, deps);
}

export function loginAccount(body, deps) {
    return postAuth('/api/auth/login', {
        email: body.email,
        password: body.password,
    }, deps);
}

export function redeemInvite(body, deps) {
    return postAuth('/api/auth/redeem', { inviteCode: body.inviteCode }, deps);
}

export function saveDisplayName(displayName, deps) {
    return postAuth('/api/auth/update-profile', { displayName }, deps);
}

export async function logoutAccount(deps = {}) {
    const result = await postAuth('/api/auth/logout', {}, deps);
    writeMemberHint(false, deps.storage);
    clearLegacyAuthKeys(deps.storage);
    try {
        const clear = globalThis.clearSwApiCache;
        if (typeof clear === 'function') await clear();
    } catch { /* Cache Storage missing */ }
    return result;
}

export async function loadViewer(deps = {}) {
    clearLegacyAuthKeys(deps.storage);
    const fetchImpl = deps.fetch || globalThis.fetch;
    let response;
    try {
        response = await fetchImpl('/api/auth/me', {
            method: 'GET',
            credentials: 'same-origin',
            headers: authHeaders(),
        });
    } catch {
        return { status: 'offline', displayName: '', follows: [], error: NETWORK_ERROR, user: null };
    }
    if (response.status === 401) {
        writeMemberHint(false, deps.storage);
        return { status: 'signed-out', displayName: '', follows: [], error: '', user: null };
    }
    const result = await readAuthResponse(response);
    if (!result.ok || !result.user) {
        return {
            status: 'offline',
            displayName: '',
            follows: [],
            error: result.error || NETWORK_ERROR,
            user: null,
        };
    }
    const member = result.user.member === true;
    writeMemberHint(member, deps.storage);
    return {
        status: member ? 'member' : 'guest',
        displayName: displayNameFromUser(result.user),
        follows: member ? followsFromUser(result.user) : [],
        error: '',
        user: result.user,
    };
}

export function viewerFromSession(session) {
    const status = session && session.status;
    const signedIn = status === 'member' || status === 'guest';
    return {
        signedIn,
        member: status === 'member',
        displayName: signedIn ? (session.displayName || '') : '',
        follows: status === 'member' && Array.isArray(session.follows) ? session.follows : [],
        sampleSession: Boolean(session && session.sampleSession),
    };
}
