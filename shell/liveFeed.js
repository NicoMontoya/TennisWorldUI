// Same-origin schedule feed for the Sprint 1 shell.
// GETs /api/fixtures and /api/livescore only. No other endpoints.
// Fixture rows are not stored in the browser. Strings stay data.

import {
    SCHEDULE_UPDATING,
    chooseFetchedAt,
    knownMatchStatus,
    readTier,
} from './derive.js';
import { RELEASE_GATES } from './dataSource.js';

export const FIXTURES_PATH = '/api/fixtures';
export const LIVESCORE_PATHS = ['/api/livescore?tour=ATP', '/api/livescore?tour=WTA'];

const ALLOWED = [/^\/api\/fixtures$/, /^\/api\/livescore\?tour=(ATP|WTA)$/];
const FINISHED = new Set(['finished', 'ended', 'retired', 'walkover']);

export function routeToken(value) {
    const text = String(value == null ? '' : value).trim();
    return /^[A-Za-z0-9_-]{1,128}$/.test(text) ? text : '';
}

export function deriveTour(row) {
    const eventType = String(row && row.eventType || '');
    const name = String(row && row.tournamentName || '');
    const explicit = String(row && row.tour || '').trim().toUpperCase();
    if (explicit === 'ATP' || explicit === 'WTA') return explicit;
    const blob = `${eventType} ${name}`;
    if (/\bWTA\b/i.test(blob) || /\bW(?:15|35|50|75|100)\b/.test(blob)) return 'WTA';
    return 'ATP';
}

function calendarDay(value) {
    const raw = String(value || '').trim();
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
    return match ? match[1] : '';
}

function usableStart(value) {
    if (value == null || value === '') return null;
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) return null;
    return new Date(parsed).toISOString();
}

function finishedStatus(status) {
    return FINISHED.has(String(status == null ? '' : status).trim().toLowerCase());
}

function winnerKey(row) {
    if (!row) return null;
    const winner = row.winner;
    if (winner === 'player1' || winner === 'First Player') return row.player1Key || null;
    if (winner === 'player2' || winner === 'Second Player') return row.player2Key || null;
    if (typeof winner === 'string' && winner.trim()) return winner.trim();
    if (row.winnerId != null && String(row.winnerId) !== '') return row.winnerId;
    return null;
}

function setScoreText(set) {
    if (set == null || set === '') return '';
    if (typeof set === 'string') return set;
    if (typeof set === 'object' && set.p1 != null && set.p2 != null) {
        const base = `${set.p1}-${set.p2}`;
        if (set.tiebreak && set.tiebreak.p1 != null && set.tiebreak.p2 != null) {
            return `${base}(${Math.min(set.tiebreak.p1, set.tiebreak.p2)})`;
        }
        return base;
    }
    return '';
}

function setScoreList(value) {
    if (!Array.isArray(value)) return [];
    return value.map(setScoreText).filter(Boolean);
}

function surfaceOf(rows) {
    for (let i = 0; i < rows.length; i += 1) {
        const surface = String(rows[i] && rows[i].surface || '').trim().toLowerCase();
        if (surface === 'clay' || surface === 'grass' || surface === 'hard') return surface;
    }
    return '';
}

function tierLabel(tier, tour) {
    if (tier === 'tour') return tour === 'WTA' ? 'WTA' : 'ATP';
    if (tier === 'challenger') return 'Challenger';
    if (tier === 'itf') return 'ITF';
    return '';
}

function tournamentTier(rows) {
    const values = new Set((rows || []).map((row) => readTier(row)));
    if (values.size !== 1) return '';
    return [...values][0];
}

function playerRecord(players, key, name, tour) {
    const id = routeToken(key);
    if (!id) return null;
    if (!players.has(id)) {
        players.set(id, {
            id,
            tour,
            name: String(name || '').trim(),
            country: '',
            rank: null,
            rankMove: 0,
            age: null,
            recentResults: [],
            surfaces: null,
            career: [],
        });
    } else if (name && !players.get(id).name) {
        players.get(id).name = String(name).trim();
    }
    return id;
}

function emptyDataset() {
    return { tournaments: [], matches: [], players: [], meetings: [] };
}

export function normalizeFixtures(fixtureRows, liveRows) {
    const liveByKey = new Map();
    (liveRows || []).forEach((row) => {
        if (!row || row.matchKey == null) return;
        liveByKey.set(String(row.matchKey), row);
    });

    const tournaments = new Map();
    const players = new Map();
    const matches = [];

    (fixtureRows || []).forEach((row, index) => {
        if (!row) return;
        const id = routeToken(row.matchKey);
        const tournamentId = routeToken(row.tournamentKey) || routeToken(row.tournamentName);
        if (!id || !tournamentId) return;
        const tier = readTier(row);
        const tour = deriveTour(row);
        const live = liveByKey.get(String(row.matchKey));
        let status = knownMatchStatus(row.status);
        const liveStatus = knownMatchStatus(live && live.status);
        if ((status === '' || status === 'Not Started') && liveStatus && liveStatus !== 'Not Started') {
            status = liveStatus;
        }
        const terminal = status === 'Finished' || status === 'Walkover' || status === 'Cancelled';
        const finished = terminal || finishedStatus(row.status) || finishedStatus(live && live.status);
        const liveNow = status === 'Live' || (
            !terminal
            && status !== 'Delayed'
            && !finished
            && (row.isLive === true || !!(live && live.isLive === true))
        );
        const scores = setScoreList(live && live.setScores && live.setScores.length ? live.setScores : row.setScores);
        const start = usableStart(row.startsAtUtc);
        const day = calendarDay(row.date) || (start ? start.slice(0, 10) : '');
        const p1 = playerRecord(players, row.player1Key, row.player1Name, tour);
        const p2 = playerRecord(players, row.player2Key, row.player2Name, tour);
        const winner = winnerKey(live) || winnerKey(row);

        if (!tournaments.has(tournamentId)) {
            tournaments.set(tournamentId, {
                id: tournamentId,
                tour,
                name: String(row.tournamentName || '').trim(),
                tier: '',
                tierClass: '',
                surface: '',
                startDate: day,
                endDate: day,
                season: row.season != null ? String(row.season) : '',
                rows: [],
            });
        }
        const tournament = tournaments.get(tournamentId);
        tournament.rows.push(row);
        if (day && (!tournament.startDate || day < tournament.startDate)) tournament.startDate = day;
        if (day && (!tournament.endDate || day > tournament.endDate)) tournament.endDate = day;
        if (!tournament.name && row.tournamentName) tournament.name = String(row.tournamentName).trim();

        matches.push({
            id,
            tournamentId,
            roundId: Number.isFinite(Number(row.roundId)) ? Number(row.roundId) : null,
            roundName: row.round == null ? '' : String(row.round),
            slotIndex: index,
            player1Id: p1 || '',
            player2Id: p2 || '',
            player1Seed: row.player1Seed == null ? '' : String(row.player1Seed),
            player2Seed: row.player2Seed == null ? '' : String(row.player2Seed),
            startsAtUtc: start,
            date: day,
            tierClass: tier,
            isLive: liveNow,
            winnerId: winner == null ? null : String(winner),
            finished,
            setScores: scores,
            status,
        });
    });

    const tournamentList = [...tournaments.values()].map((tournament) => {
        const surface = surfaceOf(tournament.rows);
        const tierClass = tournamentTier(tournament.rows);
        return {
            id: tournament.id,
            tour: tournament.tour,
            name: tournament.name,
            tier: tierLabel(tierClass, tournament.tour),
            tierClass,
            surface,
            startDate: tournament.startDate,
            endDate: tournament.endDate,
            season: tournament.season,
        };
    });

    return {
        tournaments: tournamentList,
        matches,
        players: [...players.values()],
        meetings: [],
    };
}

function shellFrom(dataset, fetchedAt, now, empty, statusAsOf) {
    const body = empty ? emptyDataset() : dataset;
    return {
        mode: 'live',
        now,
        fetchedAt: fetchedAt || null,
        statusAsOf: typeof statusAsOf === 'string' ? statusAsOf : '',
        stale: false,
        error: empty ? SCHEDULE_UPDATING : null,
        neverHadData: empty,
        callsNetwork: true,
        tournaments: body.tournaments,
        matches: body.matches,
        players: body.players,
        meetings: body.meetings,
        gates: RELEASE_GATES.slice(),
    };
}

export function liveShellFromFeed(feed, now) {
    const clock = Number.isFinite(now) ? now : Date.now();
    const statusAsOf = feed && typeof feed.statusAsOf === 'string' ? feed.statusAsOf : '';
    if (!feed || !feed.ok || !feed.dataset || !feed.dataset.matches.length) {
        return shellFrom(emptyDataset(), feed && feed.fetchedAt, clock, true, '');
    }
    return shellFrom(feed.dataset, feed.fetchedAt, clock, false, statusAsOf);
}

async function readApi(fetchImpl, url) {
    if (!ALLOWED.some((pattern) => pattern.test(String(url)))) {
        throw new Error('schedule feed refused an unknown path');
    }
    try {
        const response = await fetchImpl(url, {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });
        const header = response && response.headers && typeof response.headers.get === 'function'
            ? response.headers.get('X-Fetched-At')
            : null;
        let body = null;
        try {
            body = await response.json();
        } catch (err) {
            body = null;
        }
        const ok = !!(response && response.ok && body && body.ok === true && Array.isArray(body.data));
        const rawStamp = ok && body && typeof body.statusAsOf === 'string' ? body.statusAsOf : '';
        const statusAsOf = rawStamp && !Number.isNaN(Date.parse(rawStamp)) ? rawStamp : '';
        return { ok, rows: ok ? body.data : [], fetchedAtHeader: header, statusAsOf };
    } catch (err) {
        return { ok: false, rows: [], fetchedAtHeader: null };
    }
}

export async function loadLiveFeed(options = {}) {
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    const now = Number.isFinite(options.now) ? options.now : Date.now();
    const fixtures = await readApi(fetchImpl, FIXTURES_PATH);
    const liveParts = await Promise.all(LIVESCORE_PATHS.map((path) => readApi(fetchImpl, path)));
    const liveRows = liveParts.reduce((acc, part) => acc.concat(part.ok ? part.rows : []), []);
    const fetchedAt = chooseFetchedAt(
        [fixtures.fetchedAtHeader].concat(liveParts.map((part) => part.fetchedAtHeader)),
        now,
    );
    const dataset = fixtures.ok ? normalizeFixtures(fixtures.rows, liveRows) : emptyDataset();
    const feed = {
        ok: fixtures.ok && dataset.matches.length > 0,
        fetchedAt,
        statusAsOf: fixtures.statusAsOf || '',
        dataset,
    };
    return { ...feed, shell: liveShellFromFeed(feed, now) };
}
