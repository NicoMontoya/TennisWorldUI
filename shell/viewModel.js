// Plain view models for the Sprint 1 shell. Strings only — the DOM layer
// assigns them with textContent. No probabilities and no email field.

import {
    LOWER_TIER_HEADING,
    SCHEDULE_UPDATING,
    compareMatchOrder,
    compareStatusOrder,
    defaultSegment,
    deriveMatchPhase,
    formatAsOf,
    formatCalendarRange,
    formatScheduleHeader,
    formatStartLocal,
    formatTbaLabel,
    hasStartsAt,
    isIgnoredFetchedAt,
    localDateISO,
    matchCalendarDay,
    presentMatch,
    rankMoveLabel,
    resolveMatchStatus,
    roundLabel,
    scoreLine,
    scoresBehindNote,
    seasonOverLine,
    tournamentBucket,
    tournamentChip,
    winnerIdOf,
} from './derive.js';
import { hrefFor } from './router.js';

const SAMPLE_BANNER = 'Sample data. Fictional players and tournaments. The Live chip follows the sample clock, not a real match. Not probabilities. Not personal records.';

export { SCHEDULE_UPDATING };

export const GATE_COPY = {
    meTitle: 'Me',
    tabInvite: 'I have an invite',
    tabSignIn: 'Sign in',
    join: 'Join TennisWorld',
    inviteOnly: 'TennisWorld is invite-only for now.',
    redeem: 'Redeem invite',
    record: 'Pick record coming soon',
    signOut: 'Sign out',
    edit: 'Edit',
    followed: 'Followed players',
    picksTitle: 'Picks',
    teaser: 'Pick winners with friends and family. Invite-only.',
    haveInvite: 'Have an invite?',
    picksSoon: 'Picks open soon',
};

export function guestLine(displayName) {
    const name = typeof displayName === 'string' ? displayName.trim() : '';
    if (!name) return 'You\'re signed in. Picks and the leaderboard are invite-only.';
    return `You're signed in as ${name}. Picks and the leaderboard are invite-only.`;
}

export function sanitizeDisplayName(first, last) {
    const raw = `${first || ''} ${last || ''}`.trim();
    if (raw.includes('@')) return '';
    const cleaned = raw.replace(/[^\p{L}\p{M}\p{N} '.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40);
    return cleaned;
}

export function viewerFromUser(user) {
    if (!user || typeof user !== 'object') {
        return { signedIn: false, member: false, displayName: '', follows: [], sampleSession: false };
    }
    const follows = Array.isArray(user.favorites) ? user.favorites : [];
    const named = sanitizeDisplayName(user.displayName, '') || sanitizeDisplayName(user.firstName, user.lastName);
    return {
        signedIn: true,
        member: user.member === true,
        displayName: named || 'Member',
        follows: follows.map((favorite) => ({
            playerKey: String(favorite.playerKey || ''),
            name: sanitizeDisplayName(favorite.name, '') || sanitizeDisplayName(favorite.firstName, favorite.lastName),
        })).filter((favorite) => favorite.name),
        sampleSession: false,
    };
}

function playersById(players) {
    return new Map((players || []).map((player) => [player.id, player]));
}

function playerSide(player, seed, route) {
    if (!player) {
        return { id: '', name: 'Player', seed: seed || '', rank: '', href: '' };
    }
    return {
        id: player.id,
        name: player.name,
        seed: seed || '',
        rank: player.rank != null ? `#${player.rank}` : '',
        href: hrefFor({ ...route, view: 'player', entityId: player.id, matchId: null }, route.fileMode ? '/sprint1.html' : '/today'),
    };
}

function labelRound(match, tournament) {
    const tier = match && Object.prototype.hasOwnProperty.call(match, 'tierClass')
        ? match.tierClass
        : (tournament && tournament.tierClass);
    return roundLabel(match && match.roundId, {
        tier,
        round: match && match.roundName,
    });
}

function matchRow(match, tournament, players, route, now, timeZone) {
    const phase = deriveMatchPhase(match, now);
    const timed = hasStartsAt(match);
    const local = timed ? formatStartLocal(match.startsAtUtc, timeZone) : null;
    const tba = formatTbaLabel(match.date, timeZone);
    const p1 = players.get(match.player1Id);
    const p2 = players.get(match.player2Id);
    const score = (phase === 'final' || phase === 'live') ? scoreLine(match) : '';
    let primary = '';
    let timeMuted = false;
    if (score) primary = score;
    else if (phase === 'unconfirmed' && local) primary = `${local.label} · score unconfirmed`;
    else if (!timed) {
        primary = tba;
        timeMuted = true;
    } else if (local) primary = local.label;
    const chip = phase === 'live'
        ? 'Live'
        : phase === 'final'
            ? 'Final'
            : phase === 'scheduled'
                ? 'Scheduled'
                : phase === 'upcoming'
                    ? 'Upcoming'
                    : 'Unconfirmed';
    const face = presentMatch(match, timeZone);
    const side1 = playerSide(p1, match.player1Seed, route);
    const side2 = playerSide(p2, match.player2Seed, route);
    const winner = winnerIdOf(match);
    const winnerSide = (face.status === 'Finished' || face.status === 'Walkover') && winner
        ? (winner === side1.id ? 'p1' : winner === side2.id ? 'p2' : '')
        : '';
    const liveScore = scoreLine(match);
    const liveLabel = face.status === 'Live'
        ? `Live, ${side1.name} vs ${side2.name}, ${liveScore}`
        : '';
    return {
        id: match.id,
        href: hrefFor({ ...route, view: 'tournament', entityId: tournament.id, matchId: match.id }, route.fileMode ? '/sprint1.html' : '/today'),
        round: labelRound(match, tournament),
        roundId: match.roundId == null ? '' : String(match.roundId),
        phase,
        chip,
        primary,
        timeMuted,
        picksLocked: !timed,
        startLabel: local ? local.label : tba,
        surface: tournament.surface,
        tournamentId: tournament.id,
        tournamentName: tournament.name,
        p1: side1,
        p2: side2,
        status: face.status,
        slot: face.slot,
        slotKind: face.slotKind,
        detail: face.detail,
        timeText: face.timeText,
        winnerSide,
        liveLabel,
    };
}

function groupHref(tournament, route) {
    return hrefFor({
        ...route,
        view: 'tournament',
        entityId: tournament.id,
        matchId: null,
        tab: 'matches',
        round: 'all',
    }, route.fileMode ? '/sprint1.html' : '/today');
}

function groupSort(a, b) {
    const tour = (a.tour === 'WTA' ? 1 : 0) - (b.tour === 'WTA' ? 1 : 0);
    if (tour !== 0) return tour;
    return String(a.name).localeCompare(String(b.name));
}

function groupsFromMatches(entries, route, now, timeZone, players) {
    const byT = new Map();
    entries.forEach(({ match, tournament }) => {
        if (!byT.has(tournament.id)) byT.set(tournament.id, { tournament, matches: [] });
        byT.get(tournament.id).matches.push(match);
    });
    return [...byT.values()].map(({ tournament, matches }) => ({
        id: tournament.id,
        name: tournament.name,
        tour: tournament.tour,
        tierClass: tournament.tierClass || '',
        href: groupHref(tournament, route),
        rows: matches
            .slice()
            .sort((a, b) => compareStatusOrder(a, b))
            .map((match) => matchRow(match, tournament, players, route, now, timeZone)),
    })).sort(groupSort);
}

function splitTierGroups(groups) {
    const tour = [];
    const lower = [];
    (groups || []).forEach((group) => {
        if (group.tierClass === 'tour') tour.push(group);
        else lower.push(group);
    });
    return { tour, lower };
}

function compareDateKey(a, b) {
    if (a === b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    return a < b ? -1 : 1;
}

function daysFromCards(cards, data, route, now, timeZone, players) {
    const allowed = new Set((cards || []).map((card) => card.id));
    const tournaments = new Map((data.tournaments || []).map((item) => [item.id, item]));
    const byDate = new Map();
    (data.matches || []).forEach((match) => {
        if (!allowed.has(match.tournamentId)) return;
        const tournament = tournaments.get(match.tournamentId);
        if (!tournament) return;
        const key = matchCalendarDay(match, timeZone) || '';
        if (!byDate.has(key)) byDate.set(key, []);
        byDate.get(key).push({ match, tournament });
    });
    return [...byDate.keys()].sort(compareDateKey).map((key) => ({
        date: key,
        label: key ? formatScheduleHeader(key) : 'Date TBA',
        groups: groupsFromMatches(byDate.get(key), route, now, timeZone, players),
    }));
}

function cardModel(tournament, matches, route, now, timeZone) {
    const chip = tournamentChip(tournament, matches, now, timeZone);
    const bucket = tournamentBucket(tournament, matches, now, timeZone);
    const upcoming = matches
        .filter((match) => {
            const phase = deriveMatchPhase(match, now);
            return phase === 'upcoming' || phase === 'scheduled';
        })
        .sort((a, b) => compareMatchOrder(a, b, timeZone));
    const next = upcoming[0];
    let nextLabel = '';
    if (next && hasStartsAt(next)) {
        const nextLocal = formatStartLocal(next.startsAtUtc, timeZone);
        if (nextLocal) nextLabel = `Next ${nextLocal.label}`;
    } else if (next) {
        nextLabel = formatTbaLabel(next.date, timeZone);
    }
    return {
        id: tournament.id,
        name: tournament.name,
        tour: tournament.tour,
        tier: tournament.tier,
        tierClass: tournament.tierClass || '',
        startDate: tournament.startDate || '',
        surface: tournament.surface,
        dates: formatCalendarRange(tournament.startDate, tournament.endDate),
        chip: chip.text,
        chipKind: chip.kind,
        bucket,
        month: String(tournament.startDate || '').slice(0, 7),
        nextLabel,
        href: hrefFor({
            ...route,
            view: 'tournament',
            entityId: tournament.id,
            matchId: null,
            tab: 'matches',
            round: 'all',
        }, route.fileMode ? '/sprint1.html' : '/today'),
    };
}

function meetingsBetween(meetings, idA, idB) {
    return (meetings || []).filter((meeting) => {
        const ids = [meeting.player1Id, meeting.player2Id];
        return ids.includes(idA) && ids.includes(idB) && meeting.winnerId;
    });
}

function h2hPayload(playerA, playerB, meetings) {
    if (!playerA || !playerB) return null;
    const rows = meetingsBetween(meetings, playerA.id, playerB.id);
    if (!rows.length) return null;
    return {
        player1: { name: playerA.name, playerKey: playerA.id, country: playerA.country || '' },
        player2: { name: playerB.name, playerKey: playerB.id, country: playerB.country || '' },
        data: {
            coverageNote: 'Sample meetings only.',
            h2hMatches: rows.map((meeting) => ({
                player1Key: meeting.player1Id,
                player2Key: meeting.player2Id,
                winner: meeting.winnerId === meeting.player1Id ? 'player1' : 'player2',
                setScores: meeting.setScores || [],
                surface: meeting.surface || '',
                tournamentName: meeting.event || 'Sample',
                round: 'Sample',
                status: 'finished',
            })),
        },
    };
}

function surfaceRecord(player, surface) {
    const record = player && player.surfaces && player.surfaces[surface];
    if (!record) return '';
    const label = surface ? surface.charAt(0).toUpperCase() + surface.slice(1) : 'Surface';
    return `Sample ${label.toLowerCase()} record: ${record.won} won, ${record.lost} lost`;
}

function formStrip(player) {
    const rows = Array.isArray(player && player.recentResults) ? player.recentResults : [];
    return rows.slice(-10).map((row) => (row.outcome === 'L' ? 'L' : 'W'));
}

function sheetModel(match, tournament, players, meetings, route, now, timeZone) {
    const row = matchRow(match, tournament, players, route, now, timeZone);
    const p1 = players.get(match.player1Id);
    const p2 = players.get(match.player2Id);
    return {
        ...row,
        title: `${row.p1.name} vs ${row.p2.name}`,
        form1: formStrip(p1),
        form2: formStrip(p2),
        surface1: surfaceRecord(p1, tournament.surface),
        surface2: surfaceRecord(p2, tournament.surface),
        h2h: h2hPayload(p1, p2, meetings),
        pickLabel: 'Picks open soon',
    };
}

function drawModel(tournament, matches, players, now) {
    const groups = new Map();
    matches.forEach((match) => {
        const phase = deriveMatchPhase(match, now);
        const p1 = players.get(match.player1Id);
        const p2 = players.get(match.player2Id);
        const row = {
            roundId: match.roundId,
            roundName: match.roundName || '',
            ...(Object.prototype.hasOwnProperty.call(match, 'tierClass') ? { tierClass: match.tierClass } : {}),
            matchKey: match.id,
            slotIndex: match.slotIndex,
            player1Key: p1 ? p1.id : '',
            player1Name: p1 ? p1.name : '',
            player1Seed: match.player1Seed,
            player2Key: p2 ? p2.id : '',
            player2Name: p2 ? p2.name : '',
            player2Seed: match.player2Seed,
            winner: phase === 'final' && p1 && match.winnerId === p1.id
                ? 'player1'
                : phase === 'final' && p2 && match.winnerId === p2.id
                    ? 'player2'
                    : null,
            setScores: match.setScores || [],
            isLive: phase === 'live',
            status: phase === 'final' ? 'finished' : '',
        };
        if (!groups.has(match.roundId)) groups.set(match.roundId, []);
        groups.get(match.roundId).push(row);
    });
    const rounds = [...groups.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([roundId, rows], index) => ({
            round: labelRound(rows[0], tournament),
            order: index,
            matches: rows,
        }));
    return { tour: tournament.tour, name: tournament.name, year: 2026, rounds };
}

function monthLabel(key) {
    const [year, month] = key.split('-').map(Number);
    if (!year || !month) return key;
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function tourRank(tour) {
    return tour === 'WTA' ? 1 : 0;
}

function isTourTier(card) {
    return card && card.tierClass === 'tour';
}

export function partitionSchedule(cards) {
    const tour = [];
    const lower = [];
    (cards || []).forEach((card) => {
        if (isTourTier(card)) tour.push(card);
        else lower.push(card);
    });
    const byListing = (a, b) => tourRank(a.tour) - tourRank(b.tour)
        || String(a.startDate).localeCompare(String(b.startDate))
        || String(a.name).localeCompare(String(b.name));
    tour.sort(byListing);
    lower.sort(byListing);
    return { tour, lower };
}

function nextTourEvent(tournaments, today) {
    return (tournaments || [])
        .filter((tournament) => tournament.tierClass === 'tour')
        .filter((tournament) => tournament.startDate && tournament.startDate >= today)
        .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate))
            || tourRank(a.tour) - tourRank(b.tour)
            || String(a.name).localeCompare(String(b.name)))[0] || null;
}

function scheduleModel(data, route, now, timeZone, players) {
    const tourneys = data.tournaments || [];
    const buckets = tourneys.map((tournament) => tournamentBucket(
        tournament,
        (data.matches || []).filter((match) => match.tournamentId === tournament.id),
        now,
        timeZone,
    ));
    const segment = route.segment || defaultSegment(buckets);
    const months = [...new Set(tourneys.map((tournament) => String(tournament.startDate).slice(0, 7)).filter((key) => key.length === 7))].sort();
    const cards = tourneys.map((tournament) => cardModel(
        tournament,
        (data.matches || []).filter((match) => match.tournamentId === tournament.id),
        route,
        now,
        timeZone,
    )).filter((card) => card.bucket === segment && (!route.month || card.month === route.month));
    const grouped = partitionSchedule(cards);
    const today = localDateISO(now, timeZone);
    const seasonOver = grouped.tour.length ? '' : seasonOverLine(nextTourEvent(tourneys, today));
    const days = daysFromCards(grouped.tour, data, route, now, timeZone, players);
    const lowerDays = daysFromCards(grouped.lower, data, route, now, timeZone, players);
    let empty = '';
    if (!grouped.tour.length && !grouped.lower.length && !seasonOver) {
        if (data.mode === 'sample' && data.neverHadData) empty = 'No schedule has been stored yet.';
        else if (data.mode !== 'sample') empty = SCHEDULE_UPDATING;
    }
    return {
        segment,
        segments: [
            { id: 'past', label: 'Past' },
            { id: 'now', label: 'Now' },
            { id: 'upnext', label: 'Up Next' },
        ],
        months: months.map((key) => ({ key, label: monthLabel(key), active: route.month === key })),
        cards: grouped.tour,
        lowerCards: grouped.lower,
        days,
        lowerDays,
        lowerHeading: LOWER_TIER_HEADING,
        seasonOver,
        empty,
    };
}

function todayModel(data, route, now, timeZone, viewer, players) {
    const tourMatches = (data.matches || []).filter((match) => {
        const tournament = (data.tournaments || []).find((item) => item.id === match.tournamentId);
        return tournament && tournament.tour === route.tour;
    });
    const rows = tourMatches.map((match) => {
        const tournament = data.tournaments.find((item) => item.id === match.tournamentId);
        return { match, row: matchRow(match, tournament, players, route, now, timeZone) };
    }).sort((a, b) => compareMatchOrder(a.match, b.match, timeZone));
    const live = rows.filter((item) => item.row.phase === 'live').map((item) => item.row);
    const today = localDateISO(now, timeZone);
    const upNext = rows.filter((item) => (item.row.phase === 'upcoming' || item.row.phase === 'scheduled')
        && matchCalendarDay(item.match, timeZone) === today)
        .map((item) => item.row);
    const next = rows.find((item) => item.row.phase === 'upcoming' || item.row.phase === 'scheduled');
    const visible = tourMatches.filter((match) => {
        if (resolveMatchStatus(match) === 'Live') return true;
        return matchCalendarDay(match, timeZone) === today;
    }).map((match) => {
        const tournament = data.tournaments.find((item) => item.id === match.tournamentId);
        return tournament ? { match, tournament } : null;
    }).filter(Boolean);
    const split = splitTierGroups(groupsFromMatches(visible, route, now, timeZone, players));
    const follows = (viewer.follows || []).map((favorite) => {
        const player = [...players.values()].find((item) => item.id === favorite.playerKey);
        return {
            name: player ? player.name : favorite.name,
            href: player ? playerSide(player, '', route).href : '',
            detail: player && route.sample ? `Sample rank #${player.rank}` : 'Followed player',
        };
    });
    return {
        live,
        upNext,
        emptyLive: live.length === 0,
        emptyLiveText: 'No live matches right now.',
        nextScheduled: live.length === 0 && next ? next.row : null,
        follows,
        groups: split.tour,
        lowerGroups: split.lower,
        scoresNote: scoresBehindNote(data.statusAsOf, now),
        followsNote: viewer.sampleSession
            ? 'Sample follows for the fictional member. Not your account.'
            : viewer.signedIn
                ? ''
                : 'Sign in to see players you follow. This preview does not invent a personal watch list.',
    };
}

function rankingsModel(data, route, players) {
    const rows = [...players.values()]
        .filter((player) => player.tour === route.tour)
        .sort((a, b) => a.rank - b.rank)
        .map((player) => ({
            id: player.id,
            rank: String(player.rank),
            name: player.name,
            country: player.country,
            age: String(player.age),
            move: rankMoveLabel(player.rankMove),
            href: playerSide(player, '', route).href,
        }));
    return {
        tour: route.tour,
        rows,
        empty: data.neverHadData
            ? (data.mode === 'sample' ? 'No rankings have been stored yet.' : SCHEDULE_UPDATING)
            : rows.length ? '' : (data.mode === 'sample' ? 'No rankings for this tour.' : SCHEDULE_UPDATING),
    };
}

function playerModel(data, route, players, now, timeZone) {
    const player = players.get(route.entityId);
    if (!player) return null;
    const related = (data.matches || []).filter((match) => match.player1Id === player.id || match.player2Id === player.id);
    const next = related
        .map((match) => ({ match, phase: deriveMatchPhase(match, now) }))
        .filter((item) => item.phase === 'live' || item.phase === 'upcoming' || item.phase === 'scheduled')
        .sort((a, b) => compareMatchOrder(a.match, b.match, timeZone))[0];
    let nextRow = null;
    if (next) {
        const tournament = (data.tournaments || []).find((item) => item.id === next.match.tournamentId);
        if (tournament) nextRow = matchRow(next.match, tournament, players, route, now, timeZone);
    }
    const recent = related
        .filter((match) => deriveMatchPhase(match, now) === 'final')
        .sort((a, b) => compareMatchOrder(b, a, timeZone))
        .slice(0, 5)
        .map((match) => {
            const tournament = data.tournaments.find((item) => item.id === match.tournamentId);
            const opponentId = match.player1Id === player.id ? match.player2Id : match.player1Id;
            const opponent = players.get(opponentId);
            const won = match.winnerId === player.id;
            return {
                text: `${won ? 'W' : 'L'} vs ${opponent ? opponent.name : 'Player'} · ${scoreLine(match)} · ${tournament ? tournament.name : ''}`,
            };
        });
    const opponent = next
        ? players.get(next.match.player1Id === player.id ? next.match.player2Id : next.match.player1Id)
        : null;
    const meetingOpponent = opponent || [...(data.meetings || [])]
        .filter((meeting) => meeting.player1Id === player.id || meeting.player2Id === player.id)
        .map((meeting) => players.get(meeting.player1Id === player.id ? meeting.player2Id : meeting.player1Id))
        .find(Boolean);
    return {
        id: player.id,
        name: player.name,
        rank: player.rank != null ? `#${player.rank}` : '',
        move: rankMoveLabel(player.rankMove),
        age: player.age != null ? `Age ${player.age}` : '',
        country: player.country,
        form: formStrip(player),
        surfaces: ['hard', 'clay', 'grass'].map((surface) => surfaceRecord(player, surface)).filter(Boolean),
        career: Array.isArray(player.career) ? player.career.map((point) => ({ age: point.age, wins: point.wins })) : [],
        next: nextRow,
        recent,
        h2h: meetingOpponent ? h2hPayload(player, meetingOpponent, data.meetings) : null,
        missing: false,
    };
}

function tournamentModel(data, route, players, now, timeZone) {
    const tournament = (data.tournaments || []).find((item) => item.id === route.entityId);
    if (!tournament) return { missing: true };
    const matches = (data.matches || [])
        .filter((match) => match.tournamentId === tournament.id)
        .sort((a, b) => compareStatusOrder(a, b));
    const rows = matches.map((match) => matchRow(match, tournament, players, route, now, timeZone));
    const rounds = [...new Set(rows.map((row) => row.roundId))];
    const visible = rows.filter((row) => {
        if (route.tab === 'results' && row.phase !== 'final') return false;
        if (route.tab !== 'draw' && route.round !== 'all' && row.roundId !== route.round) return false;
        return true;
    });
    const card = cardModel(tournament, matches, route, now, timeZone);
    return {
        missing: false,
        ...card,
        tab: route.tab,
        tabs: [
            { id: 'matches', label: 'Matches' },
            { id: 'draw', label: 'Draw' },
            { id: 'results', label: 'Results' },
        ],
        rounds: [{ id: 'all', label: 'All' }].concat(rounds.map((id) => {
            const sample = matches.find((match) => String(match.roundId) === id);
            return { id, label: labelRound(sample || { roundId: Number(id) }, tournament) };
        })),
        round: route.round,
        matches: route.tab === 'draw' ? rows : visible,
        empty: visible.length || route.tab === 'draw'
            ? ''
            : (data.mode === 'sample' ? 'No matches in this round.' : SCHEDULE_UPDATING),
        draw: drawModel(tournament, matches, players, now),
    };
}

export function buildView({ data, route, now, timeZone, viewer }) {
    const sample = data.mode === 'sample';
    const players = playersById(data.players);
    const clock = sample && Number.isFinite(now) ? now : (Number.isFinite(data.now) ? data.now : now);
    const bannerClock = sample && clock ? formatAsOf(new Date(clock).toISOString(), timeZone) : '';
    const asOf = !sample && !isIgnoredFetchedAt(data.fetchedAt)
        ? formatAsOf(data.fetchedAt, timeZone)
        : '';
    const updating = !sample && (data.neverHadData || Boolean(data.error));
    const baseRoute = { ...route, sample };
    const view = {
        mode: data.mode,
        sample,
        updating,
        asOf,
        banner: sample
            ? `${SAMPLE_BANNER} Sample clock ${bannerClock}.`
            : (updating ? SCHEDULE_UPDATING : ''),
        stale: sample && data.stale && data.fetchedAt ? formatAsOf(new Date(data.fetchedAt).toISOString(), timeZone) : '',
        error: sample ? (data.error || '') : '',
        neverHadData: Boolean(data.neverHadData),
        tab: ['tournament', 'player'].includes(route.view) ? '' : route.view,
        view: route.view,
        tour: route.tour,
        gates: data.gates || [],
        today: null,
        schedule: null,
        tournament: null,
        player: null,
        rankings: null,
        picks: null,
        me: null,
        sheet: null,
    };

    if (route.view === 'today' || data.neverHadData && route.view === 'today') {
        view.today = todayModel(data, baseRoute, clock, timeZone, viewer, players);
    }
    if (route.view === 'schedule') view.schedule = scheduleModel(data, baseRoute, clock, timeZone, players);
    if (route.view === 'rankings') view.rankings = rankingsModel(data, baseRoute, players);
    if (route.view === 'picks') {
        const member = Boolean(viewer.member);
        view.picks = member
            ? {
                gate: 'member',
                label: GATE_COPY.picksSoon,
                teaser: '',
                action: '',
            }
            : {
                gate: 'closed',
                label: '',
                teaser: GATE_COPY.teaser,
                action: GATE_COPY.haveInvite,
            };
    }
    if (route.view === 'me') {
        const signedIn = Boolean(viewer.signedIn);
        const member = Boolean(viewer.member);
        view.me = {
            signedIn,
            member,
            sampleSession: Boolean(viewer.sampleSession),
            displayName: signedIn ? viewer.displayName : '',
            follows: signedIn && member
                ? (viewer.follows || []).map((favorite) => {
                    const player = [...players.values()].find((item) => item.id === favorite.playerKey);
                    return {
                        name: player ? player.name : favorite.name,
                        href: player ? playerSide(player, '', baseRoute).href : '',
                    };
                })
                : [],
            tabInvite: GATE_COPY.tabInvite,
            tabSignIn: GATE_COPY.tabSignIn,
            joinLabel: GATE_COPY.join,
            inviteOnly: GATE_COPY.inviteOnly,
            redeemLabel: GATE_COPY.redeem,
            guestNote: signedIn && !member ? guestLine(viewer.displayName) : '',
            recordNote: member ? GATE_COPY.record : '',
            sampleNote: viewer.sampleSession ? 'Sample sign-in. Not a real account and not stored.' : '',
        };
    }
    if (route.view === 'tournament') view.tournament = tournamentModel(data, baseRoute, players, clock, timeZone);
    if (route.view === 'player') {
        view.player = playerModel(data, baseRoute, players, clock, timeZone) || { missing: true };
    }

    if (route.matchId && !data.neverHadData) {
        const match = (data.matches || []).find((item) => item.id === route.matchId);
        const tournament = match && (data.tournaments || []).find((item) => item.id === match.tournamentId);
        if (match && tournament) {
            view.sheet = sheetModel(match, tournament, players, data.meetings, baseRoute, clock, timeZone);
        }
    }
    return view;
}
