// Plain view models for the Sprint 1 shell. Strings only — the DOM layer
// assigns them with textContent. No probabilities and no email field.

import {
    defaultSegment,
    deriveMatchPhase,
    formatAsOf,
    formatCalendarRange,
    formatStartLocal,
    isSameLocalDay,
    rankMoveLabel,
    roundLabel,
    scoreLine,
    tournamentBucket,
    tournamentChip,
} from './derive.js';
import { hrefFor } from './router.js';

const SAMPLE_BANNER = 'Sample data. Fictional players and tournaments. The Live chip follows the sample clock, not a real match. Not probabilities. Not personal records.';
const HOLD_BANNER = 'Production fixtures are not loaded. ATP/WTA live data is empty, the shared quota stop is unchanged, and this page does not call the paid feed.';

export function sanitizeDisplayName(first, last) {
    const raw = `${first || ''} ${last || ''}`.trim();
    if (raw.includes('@')) return '';
    const cleaned = raw.replace(/[^\p{L}\p{M}\p{N} '.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40);
    return cleaned;
}

export function viewerFromUser(user) {
    if (!user || typeof user !== 'object') {
        return { signedIn: false, displayName: '', follows: [], sampleSession: false };
    }
    const follows = Array.isArray(user.favorites) ? user.favorites : [];
    return {
        signedIn: true,
        displayName: sanitizeDisplayName(user.firstName, user.lastName) || 'Member',
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
        return { id: '', name: 'Sample player', seed: seed || '', rank: '', href: '' };
    }
    return {
        id: player.id,
        name: player.name,
        seed: seed || '',
        rank: player.rank != null ? `#${player.rank}` : '',
        href: hrefFor({ ...route, view: 'player', entityId: player.id, matchId: null }, route.fileMode ? '/sprint1.html' : '/today'),
    };
}

function matchRow(match, tournament, players, route, now, timeZone) {
    const phase = deriveMatchPhase(match, now);
    const local = formatStartLocal(match.startsAtUtc, timeZone);
    const p1 = players.get(match.player1Id);
    const p2 = players.get(match.player2Id);
    let primary = '';
    if (phase === 'final' || phase === 'live') primary = scoreLine(match);
    if (!primary && local) primary = local.label;
    if (phase === 'unconfirmed') primary = local ? `${local.label} · score unconfirmed` : 'Score unconfirmed';
    const chip = phase === 'live'
        ? 'Live'
        : phase === 'final'
            ? 'Final'
            : phase === 'upcoming'
                ? 'Upcoming'
                : 'Unconfirmed';
    return {
        id: match.id,
        href: hrefFor({ ...route, view: 'tournament', entityId: tournament.id, matchId: match.id }, route.fileMode ? '/sprint1.html' : '/today'),
        round: roundLabel(match.roundId),
        roundId: String(match.roundId),
        phase,
        chip,
        primary,
        startLabel: local ? local.label : '',
        surface: tournament.surface,
        tournamentId: tournament.id,
        tournamentName: tournament.name,
        p1: playerSide(p1, match.player1Seed, route),
        p2: playerSide(p2, match.player2Seed, route),
    };
}

function cardModel(tournament, matches, route, now, timeZone) {
    const chip = tournamentChip(tournament, matches, now, timeZone);
    const bucket = tournamentBucket(tournament, matches, now, timeZone);
    const upcoming = matches
        .filter((match) => deriveMatchPhase(match, now) === 'upcoming')
        .sort((a, b) => Date.parse(a.startsAtUtc) - Date.parse(b.startsAtUtc));
    const nextLocal = upcoming[0] ? formatStartLocal(upcoming[0].startsAtUtc, timeZone) : null;
    return {
        id: tournament.id,
        name: tournament.name,
        tier: tournament.tier,
        surface: tournament.surface,
        dates: formatCalendarRange(tournament.startDate, tournament.endDate),
        chip: chip.text,
        chipKind: chip.kind,
        bucket,
        month: String(tournament.startDate || '').slice(0, 7),
        nextLabel: nextLocal ? `Next ${nextLocal.label}` : '',
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
            round: roundLabel(roundId),
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

function scheduleModel(data, route, now, timeZone) {
    const tourneys = (data.tournaments || []).filter((tournament) => tournament.tour === route.tour);
    const buckets = tourneys.map((tournament) => tournamentBucket(
        tournament,
        (data.matches || []).filter((match) => match.tournamentId === tournament.id),
        now,
        timeZone,
    ));
    const segment = route.segment || defaultSegment(buckets);
    const months = [...new Set(tourneys.map((tournament) => String(tournament.startDate).slice(0, 7)))].sort();
    const cards = tourneys.map((tournament) => cardModel(
        tournament,
        (data.matches || []).filter((match) => match.tournamentId === tournament.id),
        route,
        now,
        timeZone,
    )).filter((card) => card.bucket === segment && (!route.month || card.month === route.month));
    let empty = '';
    if (data.neverHadData) empty = 'No schedule has been stored yet.';
    else if (!cards.length) empty = 'No sample tournaments in this range.';
    return {
        segment,
        segments: [
            { id: 'past', label: 'Past' },
            { id: 'now', label: 'Now' },
            { id: 'upnext', label: 'Up Next' },
        ],
        months: months.map((key) => ({ key, label: monthLabel(key), active: route.month === key })),
        cards,
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
    }).sort((a, b) => Date.parse(a.match.startsAtUtc) - Date.parse(b.match.startsAtUtc));
    const live = rows.filter((item) => item.row.phase === 'live').map((item) => item.row);
    const upNext = rows.filter((item) => item.row.phase === 'upcoming' && isSameLocalDay(item.match.startsAtUtc, now, timeZone))
        .map((item) => item.row);
    const next = rows.find((item) => item.row.phase === 'upcoming');
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
        empty: data.neverHadData ? 'No rankings have been stored yet.' : rows.length ? '' : 'No sample rankings for this tour.',
    };
}

function playerModel(data, route, players, now, timeZone) {
    const player = players.get(route.entityId);
    if (!player) return null;
    const related = (data.matches || []).filter((match) => match.player1Id === player.id || match.player2Id === player.id);
    const next = related
        .map((match) => ({ match, phase: deriveMatchPhase(match, now) }))
        .filter((item) => item.phase === 'live' || item.phase === 'upcoming')
        .sort((a, b) => Date.parse(a.match.startsAtUtc) - Date.parse(b.match.startsAtUtc))[0];
    let nextRow = null;
    if (next) {
        const tournament = (data.tournaments || []).find((item) => item.id === next.match.tournamentId);
        if (tournament) nextRow = matchRow(next.match, tournament, players, route, now, timeZone);
    }
    const recent = related
        .filter((match) => deriveMatchPhase(match, now) === 'final')
        .sort((a, b) => Date.parse(b.startsAtUtc) - Date.parse(a.startsAtUtc))
        .slice(0, 5)
        .map((match) => {
            const tournament = data.tournaments.find((item) => item.id === match.tournamentId);
            const opponentId = match.player1Id === player.id ? match.player2Id : match.player1Id;
            const opponent = players.get(opponentId);
            const won = match.winnerId === player.id;
            return {
                text: `${won ? 'W' : 'L'} vs ${opponent ? opponent.name : 'Sample player'} · ${scoreLine(match)} · ${tournament ? tournament.name : 'Sample'}`,
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
        rank: `#${player.rank}`,
        move: rankMoveLabel(player.rankMove),
        age: `Age ${player.age}`,
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
        .sort((a, b) => a.slotIndex - b.slotIndex || Date.parse(a.startsAtUtc) - Date.parse(b.startsAtUtc));
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
        rounds: [{ id: 'all', label: 'All' }].concat(rounds.map((id) => ({ id, label: roundLabel(Number(id)) }))),
        round: route.round,
        matches: route.tab === 'draw' ? rows : visible,
        empty: visible.length || route.tab === 'draw' ? '' : 'No sample matches in this round.',
        draw: drawModel(tournament, matches, players, now),
    };
}

export function buildView({ data, route, now, timeZone, viewer }) {
    const sample = data.mode === 'sample';
    const players = playersById(data.players);
    const clock = sample && Number.isFinite(now) ? now : data.now;
    const bannerClock = sample && clock ? formatAsOf(new Date(clock).toISOString(), timeZone) : '';
    const baseRoute = { ...route, sample };
    const view = {
        mode: data.mode,
        sample,
        banner: sample
            ? `${SAMPLE_BANNER} Sample clock ${bannerClock}.`
            : HOLD_BANNER,
        stale: data.stale && data.fetchedAt ? formatAsOf(new Date(data.fetchedAt).toISOString(), timeZone) : '',
        error: data.error || '',
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
    if (route.view === 'schedule') view.schedule = scheduleModel(data, baseRoute, clock, timeZone);
    if (route.view === 'rankings') view.rankings = rankingsModel(data, baseRoute, players);
    if (route.view === 'picks') {
        view.picks = {
            label: 'Picks open soon',
            note: 'Scoring and saving picks are not in this preview. Membership for pick routes is a server gate, not a browser check.',
        };
    }
    if (route.view === 'me') {
        view.me = {
            signedIn: Boolean(viewer.signedIn),
            sampleSession: Boolean(viewer.sampleSession),
            displayName: viewer.signedIn ? viewer.displayName : '',
            follows: viewer.signedIn
                ? (viewer.follows || []).map((favorite) => {
                    const player = [...players.values()].find((item) => item.id === favorite.playerKey);
                    return {
                        name: player ? player.name : favorite.name,
                        href: player ? playerSide(player, '', baseRoute).href : '',
                    };
                })
                : [],
            signedOutNote: 'Sign in with the existing TennisWorld account dialog. Creating an account does not grant membership. Invite checks stay on the server.',
            recordNote: 'Pick record coming soon.',
            sampleNote: viewer.sampleSession ? 'Sample sign-in. Not a real account and not stored.' : '',
        };
    }
    if (route.view === 'tournament') view.tournament = tournamentModel(data, baseRoute, players, clock, timeZone);
    if (route.view === 'player') {
        view.player = playerModel(data, baseRoute, players, clock, timeZone) || { missing: true };
    }

    if (route.matchId && sample && !data.neverHadData) {
        const match = (data.matches || []).find((item) => item.id === route.matchId);
        const tournament = match && (data.tournaments || []).find((item) => item.id === match.tournamentId);
        if (match && tournament) {
            view.sheet = sheetModel(match, tournament, players, data.meetings, baseRoute, clock, timeZone);
        }
    }
    return view;
}
