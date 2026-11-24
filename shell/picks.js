// Member picks view model. The server is the only authority on lock, validity,
// and points. This module renders locksAtUtc and grades it already received.
// It never sends times, scores, odds, or points.

import { formatClock, formatStartLocal } from './derive.js';

export const PICKS_COPY = {
    open: 'Open',
    mine: 'My picks',
    leaders: 'Leaderboard',
    emptyOpen: 'No matches to pick right now. Check back soon.',
    emptyMine: "You haven't made any picks yet.",
    emptyBoard: 'No results yet. Points show up after the first match finishes.',
    locked: 'Locked',
    lockedError: 'That match is locked.',
    saveError: "Couldn't save your pick. Try again.",
    pending: 'Pending',
    correct: 'Correct',
    wrong: 'Wrong',
    plus: '+1',
    check: '\u2713',
    cross: '\u2717',
    member: 'Member',
    tba: 'Time TBA',
};

export const PICK_SEGMENTS = [
    { id: 'open', label: PICKS_COPY.open },
    { id: 'mine', label: PICKS_COPY.mine },
    { id: 'leaders', label: PICKS_COPY.leaders },
];

const HOUR_MS = 60 * 60 * 1000;

export function displayNameOf(value) {
    if (typeof value !== 'string') return PICKS_COPY.member;
    const name = value.trim();
    return name || PICKS_COPY.member;
}

export function voidReasonLabel(reason) {
    if (reason === 'walkover') return 'Walkover';
    if (reason === 'cancelled') return 'Cancelled';
    if (reason === 'player_changed') return 'Player changed';
    return 'Void';
}

export function accuracyOf(points, graded) {
    const scored = Number(points);
    const decided = Number(graded);
    if (!Number.isFinite(scored) || !Number.isFinite(decided) || decided <= 0) return null;
    return scored / decided;
}

export function accuracyLabel(points, graded) {
    const value = accuracyOf(points, graded);
    if (value == null) return '';
    return `${Math.round(value * 100)}%`;
}

export function retryAfterSeconds(header, now = Date.now()) {
    if (header == null || header === '') return null;
    const text = String(header).trim();
    if (/^\d+(\.\d+)?$/.test(text)) return Math.max(0, Math.ceil(Number(text)));
    const when = Date.parse(text);
    if (!Number.isFinite(when)) return null;
    return Math.max(0, Math.ceil((when - now) / 1000));
}

export function rateLimitMessage(seconds) {
    if (seconds == null || seconds === '') return 'Too many changes. Try again in 60s.';
    const parsed = Number(seconds);
    const n = Number.isFinite(parsed) && parsed >= 0 ? Math.ceil(parsed) : 60;
    return `Too many changes. Try again in ${n}s.`;
}

function weekdayShort(iso, timeZone) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    try {
        return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date);
    } catch {
        return '';
    }
}

export function lockLabel(match, now, timeZone) {
    const row = match || {};
    if (row.locked) return PICKS_COPY.locked;
    const at = Date.parse(row.locksAtUtc || '');
    const clock = Number(now);
    if (!Number.isFinite(at) || !Number.isFinite(clock)) return '';
    if (at <= clock) return PICKS_COPY.locked;
    if (row.lockKind === 'day_start') {
        const day = weekdayShort(row.locksAtUtc, timeZone);
        const time = formatClock(row.locksAtUtc, timeZone);
        if (!day || !time) return '';
        return `Locks ${day} ${time}`;
    }
    const remaining = at - clock;
    if (remaining < HOUR_MS) {
        return `Locks in ${Math.ceil(remaining / 60000)} min`;
    }
    const time = formatClock(row.locksAtUtc, timeZone);
    return time ? `Locks at ${time}` : '';
}

export function matchSubline(match, timeZone) {
    const round = match && typeof match.round === 'string' ? match.round.trim() : '';
    let time = PICKS_COPY.tba;
    if (match && match.startsAtUtc) {
        const local = formatStartLocal(match.startsAtUtc, timeZone);
        if (local && local.label) time = local.label;
    }
    return round ? `${round} \u00b7 ${time}` : time;
}

function text(value) {
    return typeof value === 'string' ? value : value == null ? '' : String(value);
}

export function readOpenPayload(data) {
    const rows = data && Array.isArray(data.matches) ? data.matches : [];
    return rows.map((row) => {
        if (!row || typeof row !== 'object') return null;
        const matchKey = text(row.matchKey).trim();
        if (!matchKey) return null;
        const pick = typeof row.pick === 'string' && row.pick ? row.pick : null;
        return {
            matchKey,
            tournamentKey: text(row.tournamentKey),
            tournamentName: text(row.tournamentName),
            tour: text(row.tour),
            tier: text(row.tier),
            round: text(row.round),
            date: text(row.date),
            startsAtUtc: text(row.startsAtUtc),
            locksAtUtc: text(row.locksAtUtc),
            lockKind: text(row.lockKind),
            status: text(row.status),
            player1Key: text(row.player1Key),
            player1Name: text(row.player1Name),
            player2Key: text(row.player2Key),
            player2Name: text(row.player2Name),
            pick,
            savedPick: pick,
            locked: false,
            generation: 0,
        };
    }).filter(Boolean);
}

export function readMinePayload(data) {
    const rows = data && Array.isArray(data.picks) ? data.picks : [];
    return rows.map((row) => {
        if (!row || typeof row !== 'object') return null;
        const matchKey = text(row.matchKey).trim();
        if (!matchKey) return null;
        const result = row.result === 'correct' || row.result === 'wrong' || row.result === 'void'
            ? row.result
            : 'pending';
        return {
            matchKey,
            tournamentName: text(row.tournamentName),
            round: text(row.round),
            status: text(row.status),
            result,
            voidReason: result === 'void' ? (row.voidReason == null ? null : text(row.voidReason)) : null,
            pickedPlayerKey: text(row.pickedPlayerKey),
            pickedPlayerName: text(row.pickedPlayerName),
            player1Key: text(row.player1Key),
            player1Name: text(row.player1Name),
            player2Key: text(row.player2Key),
            player2Name: text(row.player2Name),
        };
    }).filter(Boolean);
}

export function readLeaderboardPayload(data) {
    const rows = Array.isArray(data) ? data : [];
    return rows.map((row) => {
        if (!row || typeof row !== 'object') return null;
        const points = Number(row.points);
        const graded = Number(row.graded);
        return {
            rank: Number.isFinite(Number(row.rank)) ? Number(row.rank) : 0,
            displayName: displayNameOf(row.displayName),
            points: Number.isFinite(points) ? points : 0,
            graded: Number.isFinite(graded) ? graded : 0,
        };
    }).filter(Boolean);
}

export function readSavePayload(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    return {
        matchKey: text(data.matchKey),
        pickedPlayerKey: text(data.pickedPlayerKey),
        result: text(data.result || 'pending') || 'pending',
        voidReason: data.voidReason == null ? null : text(data.voidReason),
        locksAtUtc: text(data.locksAtUtc),
    };
}

function tourRank(tour) {
    if (tour === 'ATP') return 0;
    if (tour === 'WTA') return 1;
    return 2;
}

export function groupOpenMatches(matches) {
    const groups = new Map();
    (matches || []).forEach((match) => {
        const key = match.tournamentKey || match.tournamentName || 'tournament';
        if (!groups.has(key)) {
            groups.set(key, {
                key,
                name: match.tournamentName || 'Tournament',
                tour: match.tour || '',
                matches: [],
            });
        }
        groups.get(key).matches.push(match);
    });
    const list = [...groups.values()];
    list.sort((a, b) => tourRank(a.tour) - tourRank(b.tour) || a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
    list.forEach((group) => {
        group.matches.sort((a, b) => {
            const as = a.startsAtUtc || a.locksAtUtc || '';
            const bs = b.startsAtUtc || b.locksAtUtc || '';
            if (as !== bs) return as < bs ? -1 : 1;
            return String(a.matchKey).localeCompare(String(b.matchKey));
        });
    });
    return list;
}

export function tallyPicks(rows) {
    let correct = 0;
    let wrong = 0;
    (rows || []).forEach((row) => {
        if (row.result === 'correct') correct += 1;
        else if (row.result === 'wrong') wrong += 1;
    });
    return { correct, wrong, points: correct };
}

export function meRecordLine(rows) {
    if (!rows || !rows.length) return '';
    const tally = tallyPicks(rows);
    return `${tally.correct}\u2013${tally.wrong} \u00b7 ${tally.points} pts`;
}

function pickedName(match, playerKey) {
    if (playerKey && playerKey === match.player1Key) return match.player1Name || 'Player';
    if (playerKey && playerKey === match.player2Key) return match.player2Name || 'Player';
    return '';
}

function mineRowView(row) {
    const names = [row.player1Name || 'Player', row.player2Name || 'Player'].join(' vs ');
    let label = PICKS_COPY.pending;
    let mark = '';
    let extra = '';
    if (row.result === 'correct') {
        label = PICKS_COPY.correct;
        mark = PICKS_COPY.check;
        extra = PICKS_COPY.plus;
    } else if (row.result === 'wrong') {
        label = PICKS_COPY.wrong;
        mark = PICKS_COPY.cross;
    } else if (row.result === 'void') {
        label = voidReasonLabel(row.voidReason);
    }
    return {
        matchKey: row.matchKey,
        names,
        picked: row.pickedPlayerName || pickedName(row, row.pickedPlayerKey),
        meta: [row.tournamentName, row.round].filter(Boolean).join(' \u00b7 '),
        result: row.result,
        label,
        mark,
        extra,
    };
}

export function presentPicks(state, options = {}) {
    const source = state || {};
    const segment = PICK_SEGMENTS.some((item) => item.id === options.segment) ? options.segment : 'open';
    const now = Number.isFinite(options.now) ? options.now : Date.now();
    const timeZone = options.timeZone || 'UTC';
    const phase = source.phase || 'ready';
    const loading = phase === 'idle' || phase === 'loading';
    const mineRows = Array.isArray(source.mine) ? source.mine : [];
    const tally = tallyPicks(mineRows);
    const myName = typeof options.displayName === 'string' ? options.displayName.trim() : '';
    const boardRows = (Array.isArray(source.board) ? source.board : []).map((row) => ({
        rank: row.rank,
        displayName: row.displayName,
        points: row.points,
        graded: row.graded,
        accuracy: accuracyOf(row.points, row.graded),
        accuracyLabel: accuracyLabel(row.points, row.graded),
        pointsLabel: `${row.points} pts`,
        mine: Boolean(myName) && row.displayName === myName,
    }));
    const groups = groupOpenMatches(source.open).map((group) => ({
        key: group.key,
        name: group.name,
        tour: group.tour,
        matches: group.matches.map((match) => {
            const lockText = lockLabel(match, now, timeZone);
            const picked = match.pick || '';
            return {
                matchKey: match.matchKey,
                subline: matchSubline(match, timeZone),
                lockText,
                locked: lockText === PICKS_COPY.locked,
                error: source.errors && source.errors[match.matchKey] ? source.errors[match.matchKey] : '',
                players: [
                    {
                        key: match.player1Key,
                        name: match.player1Name || 'Player',
                        picked: Boolean(picked) && picked === match.player1Key,
                    },
                    {
                        key: match.player2Key,
                        name: match.player2Name || 'Player',
                        picked: Boolean(picked) && picked === match.player2Key,
                    },
                ],
            };
        }),
    }));
    const ready = phase === 'ready';
    return {
        segment,
        loading,
        loadError: phase === 'error' ? (source.loadError || '') : '',
        groups,
        emptyOpen: ready && !groups.length ? PICKS_COPY.emptyOpen : '',
        mine: {
            showRecord: ready && mineRows.length > 0,
            record: `${tally.correct}\u2013${tally.wrong}`,
            points: `${tally.points} pts`,
            rows: mineRows.map(mineRowView),
            empty: ready && !mineRows.length ? PICKS_COPY.emptyMine : '',
        },
        board: {
            rows: boardRows,
            empty: ready && !boardRows.length ? PICKS_COPY.emptyBoard : '',
        },
        meLine: meRecordLine(mineRows),
    };
}

function replaceMatch(open, matchKey, map) {
    return (open || []).map((match) => (match.matchKey === matchKey ? map(match) : match));
}

function upsertMine(mine, match, playerKey) {
    const row = {
        matchKey: match.matchKey,
        tournamentName: match.tournamentName || '',
        round: match.round || '',
        status: match.status || '',
        result: 'pending',
        voidReason: null,
        pickedPlayerKey: playerKey,
        pickedPlayerName: pickedName(match, playerKey),
        player1Key: match.player1Key,
        player1Name: match.player1Name,
        player2Key: match.player2Key,
        player2Name: match.player2Name,
    };
    return [row, ...(mine || []).filter((item) => item.matchKey !== match.matchKey)];
}

export function reducePicks(state, action) {
    const current = state || { phase: 'ready', open: [], mine: [], board: [], errors: {} };
    const open = Array.isArray(current.open) ? current.open : [];
    const errors = { ...(current.errors || {}) };
    const base = {
        ...current,
        open,
        mine: Array.isArray(current.mine) ? current.mine : [],
        board: Array.isArray(current.board) ? current.board : [],
        errors,
        auth: '',
    };
    if (!action || !action.matchKey) return { state: base, request: null };
    const match = open.find((item) => item.matchKey === action.matchKey);
    if (!match) return { state: base, request: null };

    if (action.type === 'tap') {
        if (match.locked || !action.playerKey || match.pick === action.playerKey) {
            return { state: base, request: null };
        }
        const generation = Number(match.generation || 0) + 1;
        delete errors[match.matchKey];
        return {
            state: {
                ...base,
                errors,
                open: replaceMatch(open, match.matchKey, (item) => ({
                    ...item,
                    pick: action.playerKey,
                    generation,
                })),
            },
            request: { matchKey: match.matchKey, playerKey: action.playerKey, generation },
        };
    }

    if (action.type === 'ok') {
        if (action.generation != null && action.generation !== match.generation) {
            return {
                state: {
                    ...base,
                    open: replaceMatch(open, match.matchKey, (item) => ({
                        ...item,
                        savedPick: action.playerKey,
                    })),
                },
                request: null,
            };
        }
        delete errors[match.matchKey];
        const nextMatch = { ...match, pick: action.playerKey, savedPick: action.playerKey };
        return {
            state: {
                ...base,
                errors,
                open: replaceMatch(open, match.matchKey, () => nextMatch),
                mine: upsertMine(base.mine, nextMatch, action.playerKey),
            },
            request: null,
        };
    }

    if (action.type === 'fail') {
        if (action.status === 409) {
            errors[match.matchKey] = PICKS_COPY.lockedError;
            const playerKey = action.generation === match.generation ? (action.playerKey || match.pick) : match.pick;
            const nextMatch = { ...match, pick: playerKey, savedPick: playerKey, locked: true };
            return {
                state: { ...base, errors, open: replaceMatch(open, match.matchKey, () => nextMatch) },
                request: null,
            };
        }
        if (action.generation != null && action.generation !== match.generation) {
            return { state: base, request: null };
        }
        const auth = action.status === 401 ? 'signed-out' : action.status === 403 ? 'guest' : '';
        if (action.status === 429) errors[match.matchKey] = rateLimitMessage(action.retryAfter);
        else if (!auth) errors[match.matchKey] = PICKS_COPY.saveError;
        else delete errors[match.matchKey];
        return {
            state: {
                ...base,
                auth,
                errors,
                open: replaceMatch(open, match.matchKey, (item) => ({
                    ...item,
                    pick: item.savedPick || null,
                })),
            },
            request: null,
        };
    }

    return { state: base, request: null };
}

export function actionFromSave(pending, result) {
    const common = {
        matchKey: pending.matchKey,
        playerKey: pending.playerKey,
        generation: pending.generation,
    };
    if (!result || result.network || result.status === 0) return { type: 'fail', status: 0, ...common };
    if (result.ok) return { type: 'ok', ...common };
    return {
        type: 'fail',
        status: result.status,
        retryAfter: retryAfterSeconds(result.retryAfter),
        ...common,
    };
}

export function rowOffScreen(row, frame) {
    if (!row || !frame) return false;
    if (!row.height && !row.bottom && !row.top) return false;
    const inset = Number(frame.insetBottom) || 0;
    const bottom = frame.bottom - inset;
    return row.top < frame.top || row.bottom > bottom;
}

export function emptyBoardState() {
    return { phase: 'ready', open: [], mine: [], board: [], errors: {} };
}

export function idleBoard() {
    return { phase: 'idle', open: [], mine: [], board: [], errors: {} };
}

export function sampleBoard(now) {
    const clock = Number.isFinite(now) ? now : Date.now();
    const inHours = (hours) => new Date(clock + hours * HOUR_MS).toISOString();
    const inMinutes = (minutes) => new Date(clock + minutes * 60000).toISOString();
    return {
        phase: 'ready',
        errors: {},
        open: readOpenPayload({
            matches: [
                {
                    matchKey: 'sample-sf-1',
                    tournamentKey: 'sample-hard',
                    tournamentName: 'Preview Hard Open',
                    tour: 'ATP',
                    tier: 'tour',
                    round: 'Semifinal',
                    date: '2026-11-24',
                    startsAtUtc: inHours(3),
                    locksAtUtc: inHours(3),
                    lockKind: 'start',
                    status: 'Not Started',
                    player1Key: 'p-casey',
                    player1Name: 'Casey Preview',
                    player2Key: 'p-avery',
                    player2Name: 'Avery Sample',
                    pick: 'p-casey',
                },
                {
                    matchKey: 'sample-sf-2',
                    tournamentKey: 'sample-hard',
                    tournamentName: 'Preview Hard Open',
                    tour: 'ATP',
                    tier: 'tour',
                    round: 'Semifinal',
                    date: '2026-11-24',
                    startsAtUtc: inMinutes(42),
                    locksAtUtc: inMinutes(42),
                    lockKind: 'start',
                    status: 'Not Started',
                    player1Key: 'p-blake',
                    player1Name: 'Blake Fixture',
                    player2Key: 'p-drew',
                    player2Name: 'Drew Harness',
                    pick: null,
                },
                {
                    matchKey: 'sample-rr-1',
                    tournamentKey: 'sample-finals',
                    tournamentName: 'Sample ATP Finals',
                    tour: 'ATP',
                    tier: 'tour',
                    round: 'Round Robin',
                    date: '2026-11-25',
                    startsAtUtc: '',
                    locksAtUtc: inHours(26),
                    lockKind: 'day_start',
                    status: 'Not Started',
                    player1Key: 'p-ellis',
                    player1Name: 'Ellis Dataset',
                    player2Key: 'p-finn',
                    player2Name: 'Finn Placeholder',
                    pick: null,
                },
                {
                    matchKey: 'sample-wta-qf',
                    tournamentKey: 'sample-wta',
                    tournamentName: 'Sample WTA Hard',
                    tour: 'WTA',
                    tier: 'tour',
                    round: 'Quarterfinal',
                    date: '2026-11-24',
                    startsAtUtc: inHours(5),
                    locksAtUtc: inHours(5),
                    lockKind: 'start',
                    status: 'Not Started',
                    player1Key: 'p-jordan',
                    player1Name: 'Jordan Sample',
                    player2Key: 'p-kendall',
                    player2Name: 'Kendall Fixture',
                    pick: null,
                },
            ],
        }),
        mine: readMinePayload({
            picks: [
                mineFixture('sample-final', 'correct', null, 'Casey Preview', 'Casey Preview', 'Avery Sample', 'Preview Hard Open', 'Final'),
                mineFixture('sample-sf', 'correct', null, 'Jordan Sample', 'Jordan Sample', 'Kendall Fixture', 'Sample WTA Hard', 'Semifinal'),
                mineFixture('sample-qf', 'wrong', null, 'Blake Fixture', 'Blake Fixture', 'Drew Harness', 'Preview Hard Open', 'Quarterfinal'),
                mineFixture('sample-live', 'pending', null, 'Ellis Dataset', 'Ellis Dataset', 'Finn Placeholder', 'Sample ATP Finals', 'Round Robin'),
                mineFixture('sample-wo', 'void', 'walkover', 'Gray Example', 'Gray Example', 'Harper Mock', 'Preview Hard Open', 'Round of 16'),
                mineFixture('sample-cx', 'void', 'cancelled', 'Logan Preview', 'Logan Preview', 'Morgan Harness', 'Sample WTA Hard', 'Round of 16'),
                mineFixture('sample-swap', 'void', 'player_changed', 'Avery Sample', 'Avery Sample', 'Casey Preview', 'Sample ATP Finals', 'Semifinal'),
                mineFixture('sample-unknown', 'void', null, 'Drew Harness', 'Drew Harness', 'Finn Placeholder', 'Preview Hard Open', 'Round Robin'),
            ],
        }),
        board: readLeaderboardPayload([
            { rank: 1, displayName: 'Jordan Sample', points: 5, graded: 6 },
            { rank: 2, displayName: 'Sample Member', points: 3, graded: 4 },
            { rank: 3, displayName: '', points: 2, graded: 5 },
            { rank: 4, displayName: 'Blake Fixture', points: 1, graded: 4 },
        ]),
    };
}

function mineFixture(matchKey, result, voidReason, picked, p1, p2, tournament, round) {
    const key = picked === p1 ? 'p1' : 'p2';
    return {
        matchKey,
        tournamentName: tournament,
        round,
        status: result === 'pending' ? 'Not Started' : 'Finished',
        result,
        voidReason,
        pickedPlayerKey: key,
        pickedPlayerName: picked,
        player1Key: 'p1',
        player1Name: p1,
        player2Key: 'p2',
        player2Name: p2,
    };
}

export const PICKS_API_FIXTURES = {
    open: {
        matches: [
            {
                matchKey: 'atp-finals-sf1',
                tournamentKey: 'nitto-2026',
                tournamentName: 'Nitto ATP Finals',
                tour: 'ATP',
                tier: 'tour',
                round: 'Semifinal',
                date: '2026-11-21',
                time: '20:30',
                startsAtUtc: '2026-11-21T19:30:00.000Z',
                locksAtUtc: '2026-11-21T19:30:00.000Z',
                lockKind: 'start',
                status: 'Not Started',
                player1Key: 'sinner',
                player1Name: 'Jannik Sinner',
                player2Key: 'alcaraz',
                player2Name: 'Carlos Alcaraz',
                pick: null,
            },
            {
                matchKey: 'atp-finals-rr2',
                tournamentKey: 'nitto-2026',
                tournamentName: 'Nitto ATP Finals',
                tour: 'ATP',
                tier: 'tour',
                round: 'Round Robin',
                date: '2026-11-17',
                time: '',
                startsAtUtc: '',
                locksAtUtc: '2026-11-16T23:00:00.000Z',
                lockKind: 'day_start',
                status: 'Not Started',
                player1Key: 'zverev',
                player1Name: 'Alexander Zverev',
                player2Key: 'fritz',
                player2Name: 'Taylor Fritz',
                pick: 'zverev',
            },
        ],
    },
    mine: {
        picks: [
            {
                matchKey: 'm-correct',
                tournamentName: 'Nitto ATP Finals',
                round: 'Final',
                status: 'Finished',
                result: 'correct',
                voidReason: null,
                pickedPlayerKey: 'sinner',
                pickedPlayerName: 'Jannik Sinner',
                player1Key: 'sinner',
                player1Name: 'Jannik Sinner',
                player2Key: 'alcaraz',
                player2Name: 'Carlos Alcaraz',
                updatedAt: 1763800000000,
                lockedAt: 1763790000000,
            },
            {
                matchKey: 'm-wrong',
                tournamentName: 'Nitto ATP Finals',
                round: 'Semifinal',
                status: 'Finished',
                result: 'wrong',
                voidReason: null,
                pickedPlayerKey: 'fritz',
                pickedPlayerName: 'Taylor Fritz',
                player1Key: 'zverev',
                player1Name: 'Alexander Zverev',
                player2Key: 'fritz',
                player2Name: 'Taylor Fritz',
                updatedAt: 1763700000000,
                lockedAt: 1763690000000,
            },
            {
                matchKey: 'm-pending',
                tournamentName: 'Nitto ATP Finals',
                round: 'Round Robin',
                status: 'Not Started',
                result: 'pending',
                voidReason: null,
                pickedPlayerKey: 'sinner',
                pickedPlayerName: 'Jannik Sinner',
                player1Key: 'sinner',
                player1Name: 'Jannik Sinner',
                player2Key: 'medvedev',
                player2Name: 'Daniil Medvedev',
                updatedAt: 1763600000000,
                lockedAt: null,
            },
            {
                matchKey: 'm-walkover',
                tournamentName: 'Nitto ATP Finals',
                round: 'Round Robin',
                status: 'Walkover',
                result: 'void',
                voidReason: 'walkover',
                pickedPlayerKey: 'rublev',
                pickedPlayerName: 'Andrey Rublev',
                player1Key: 'rublev',
                player1Name: 'Andrey Rublev',
                player2Key: 'de-minaur',
                player2Name: 'Alex de Minaur',
                updatedAt: 1763500000000,
                lockedAt: 1763490000000,
            },
            {
                matchKey: 'm-cancelled',
                tournamentName: 'Nitto ATP Finals',
                round: 'Round Robin',
                status: 'Cancelled',
                result: 'void',
                voidReason: 'cancelled',
                pickedPlayerKey: 'ruud',
                pickedPlayerName: 'Casper Ruud',
                player1Key: 'ruud',
                player1Name: 'Casper Ruud',
                player2Key: 'rune',
                player2Name: 'Holger Rune',
                updatedAt: 1763400000000,
                lockedAt: 1763390000000,
            },
            {
                matchKey: 'm-changed',
                tournamentName: 'Nitto ATP Finals',
                round: 'Semifinal',
                status: 'Finished',
                result: 'void',
                voidReason: 'player_changed',
                pickedPlayerKey: 'sinner',
                pickedPlayerName: 'Jannik Sinner',
                player1Key: 'alcaraz',
                player1Name: 'Carlos Alcaraz',
                player2Key: 'fritz',
                player2Name: 'Taylor Fritz',
                updatedAt: 1763300000000,
                lockedAt: 1763290000000,
            },
            {
                matchKey: 'm-void-unknown',
                tournamentName: 'Nitto ATP Finals',
                round: 'Round Robin',
                status: 'Finished',
                result: 'void',
                voidReason: null,
                pickedPlayerKey: 'zverev',
                pickedPlayerName: 'Alexander Zverev',
                player1Key: 'zverev',
                player1Name: 'Alexander Zverev',
                player2Key: 'sinner',
                player2Name: 'Jannik Sinner',
                updatedAt: 1763200000000,
                lockedAt: 1763190000000,
            },
        ],
    },
    leaderboard: [
        { rank: 1, displayName: 'Ada', points: 4, graded: 5 },
        { rank: 1, displayName: '', points: 4, graded: 5 },
        { rank: 3, displayName: 'Nico', points: 1, graded: 3 },
    ],
    save: {
        matchKey: 'atp-finals-sf1',
        pickedPlayerKey: 'sinner',
        result: 'pending',
        voidReason: null,
        locksAtUtc: '2026-11-21T19:30:00.000Z',
    },
    polluted: {
        matches: [
            {
                matchKey: 'atp-finals-sf1',
                tournamentName: 'Nitto ATP Finals',
                tour: 'ATP',
                tier: 'tour',
                round: 'Semifinal',
                startsAtUtc: '2026-11-21T19:30:00.000Z',
                locksAtUtc: '2026-11-21T19:30:00.000Z',
                lockKind: 'start',
                player1Key: 'sinner',
                player1Name: 'Jannik Sinner',
                player2Key: 'alcaraz',
                player2Name: 'Carlos Alcaraz',
                pick: null,
                email: 'ada@example.com',
                memberId: 'member-9',
                rank_gap: 4,
                odds: 1.4,
                points: 3,
                score: '6-4 6-3',
            },
        ],
    },
};
