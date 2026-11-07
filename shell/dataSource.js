// In-memory sample data, or an honest production hold.
// Never fetches, never writes localStorage, Cache Storage, or D1.

export const RELEASE_GATES = [
    'Invite codes are not checked in the browser. Redemption has to be single-use, stored hashed, and rate-limited on the server, or use a Nico-approved allowlist.',
    'Picks, profile, and leaderboard routes need server 401/403 unless the caller is signed in and a member. This preview does not decide membership.',
    'Production ATP/WTA fixtures are still empty. Live readiness has not passed. The shared quota stop stays as it is. No backfill runs from this UI.',
    'EXP-01 stays parked. This preview does not show model probabilities, estimates, or betting language.',
    'noindex is set on this preview. Existing public pages still ship index,follow until a site-wide v1 change.',
    'Picks do not save. There is no scoring write path in this preview.',
];

export const STALE_AT = Date.parse('2026-11-01T17:00:00.000Z');

const EMPTY = {
    tournaments: [],
    matches: [],
    players: [],
    meetings: [],
};

function cloneData(dataset) {
    return {
        tournaments: structuredClone(dataset.tournaments || []),
        matches: structuredClone(dataset.matches || []),
        players: structuredClone(dataset.players || []),
        meetings: structuredClone(dataset.meetings || []),
    };
}

function hold(extra) {
    return {
        mode: 'production-hold',
        now: null,
        fetchedAt: null,
        stale: false,
        error: null,
        neverHadData: true,
        callsNetwork: false,
        ...EMPTY,
        gates: RELEASE_GATES.slice(),
        ...extra,
    };
}

export function loadShellData({ allowed, state, dataset, now }) {
    if (!allowed) return hold();
    const clock = Number(now);
    if (!dataset || !Array.isArray(dataset.tournaments)) {
        return {
            mode: 'sample',
            now: Number.isFinite(clock) ? clock : null,
            fetchedAt: null,
            stale: false,
            error: 'Sample feed is unavailable.',
            neverHadData: true,
            callsNetwork: false,
            ...EMPTY,
            gates: RELEASE_GATES.slice(),
        };
    }
    const body = cloneData(dataset);
    if (state === 'empty') {
        return {
            mode: 'sample',
            now: clock,
            fetchedAt: null,
            stale: false,
            error: null,
            neverHadData: true,
            callsNetwork: false,
            ...EMPTY,
            gates: RELEASE_GATES.slice(),
        };
    }
    if (state === 'error') {
        return {
            mode: 'sample',
            now: clock,
            fetchedAt: STALE_AT,
            stale: true,
            error: 'Could not refresh the sample feed.',
            neverHadData: false,
            callsNetwork: false,
            ...body,
            gates: RELEASE_GATES.slice(),
        };
    }
    if (state === 'stale') {
        return {
            mode: 'sample',
            now: clock,
            fetchedAt: STALE_AT,
            stale: true,
            error: null,
            neverHadData: false,
            callsNetwork: false,
            ...body,
            gates: RELEASE_GATES.slice(),
        };
    }
    return {
        mode: 'sample',
        now: clock,
        fetchedAt: clock,
        stale: false,
        error: null,
        neverHadData: false,
        callsNetwork: false,
        ...body,
        gates: RELEASE_GATES.slice(),
    };
}
