// Deterministic fictional sample set for the Sprint 1 preview.
// Names, events, and records are made up. There is no status string, no
// probability, and no personal account data. Nothing here is fetched.

export const SAMPLE_NOW = '2026-11-07T18:00:00.000Z';

const HISTORY_START = Date.parse('2026-09-01T15:00:00.000Z');

function formFrom(pattern, surface) {
    return pattern.split('').map((outcome, index) => ({
        outcome,
        surface,
        event: 'Sample history',
        startsAtUtc: new Date(HISTORY_START + index * 86400000).toISOString(),
    }));
}

function career(points) {
    return points.map(([age, wins]) => ({ age, wins }));
}

function player(spec) {
    return {
        id: spec.id,
        tour: spec.tour,
        name: spec.name,
        country: 'Sampleland',
        rank: spec.rank,
        rankMove: spec.rankMove,
        age: spec.age,
        recentResults: formFrom(spec.form, spec.formSurface),
        surfaces: spec.surfaces,
        career: career(spec.career),
    };
}

const PLAYERS = [
    player({
        id: 'p-avery', tour: 'ATP', name: 'Avery Sample', rank: 1, rankMove: 1, age: 24,
        form: 'WWLWWWLWWL', formSurface: 'hard',
        surfaces: { hard: { won: 4, lost: 2 }, clay: { won: 3, lost: 1 }, grass: { won: 1, lost: 1 } },
        career: [[18, 2], [19, 8], [20, 15], [21, 24], [22, 36], [23, 48], [24, 61]],
    }),
    player({
        id: 'p-blake', tour: 'ATP', name: 'Blake Fixture', rank: 2, rankMove: -1, age: 27,
        form: 'LWLWWLWLWW', formSurface: 'hard',
        surfaces: { hard: { won: 3, lost: 3 }, clay: { won: 2, lost: 2 }, grass: { won: 1, lost: 2 } },
        career: [[18, 1], [20, 9], [22, 20], [24, 33], [26, 47], [27, 55]],
    }),
    player({
        id: 'p-casey', tour: 'ATP', name: 'Casey Preview', rank: 3, rankMove: 4, age: 22,
        form: 'WWWWLWWWLW', formSurface: 'hard',
        surfaces: { hard: { won: 5, lost: 1 }, clay: { won: 2, lost: 2 }, grass: { won: 0, lost: 1 } },
        career: [[18, 4], [19, 12], [20, 22], [21, 34], [22, 46]],
    }),
    player({
        id: 'p-drew', tour: 'ATP', name: 'Drew Harness', rank: 4, rankMove: 0, age: 29,
        form: 'LLWWLWLWLW', formSurface: 'hard',
        surfaces: { hard: { won: 2, lost: 4 }, clay: { won: 3, lost: 2 }, grass: { won: 2, lost: 1 } },
        career: [[19, 3], [22, 14], [25, 28], [27, 40], [29, 52]],
    }),
    player({
        id: 'p-ellis', tour: 'ATP', name: 'Ellis Dataset', rank: 5, rankMove: 2, age: 21,
        form: 'WLWWLWWLWL', formSurface: 'hard',
        surfaces: { hard: { won: 4, lost: 3 }, clay: { won: 1, lost: 2 }, grass: { won: 1, lost: 0 } },
        career: [[17, 1], [18, 6], [19, 14], [20, 25], [21, 37]],
    }),
    player({
        id: 'p-finn', tour: 'ATP', name: 'Finn Placeholder', rank: 6, rankMove: -3, age: 26,
        form: 'LWWLLWLWWL', formSurface: 'hard',
        surfaces: { hard: { won: 3, lost: 4 }, clay: { won: 1, lost: 1 }, grass: { won: 2, lost: 2 } },
        career: [[18, 2], [21, 11], [23, 22], [25, 34], [26, 41]],
    }),
    player({
        id: 'p-gray', tour: 'ATP', name: 'Gray Example', rank: 7, rankMove: 1, age: 23,
        form: 'WWLLWWLWLW', formSurface: 'hard',
        surfaces: { hard: { won: 3, lost: 2 }, clay: { won: 2, lost: 3 }, grass: { won: 1, lost: 1 } },
        career: [[18, 2], [19, 7], [21, 16], [22, 27], [23, 35]],
    }),
    player({
        id: 'p-harper', tour: 'ATP', name: 'Harper Mock', rank: 8, rankMove: -2, age: 30,
        form: 'LWLWLWWLLW', formSurface: 'hard',
        surfaces: { hard: { won: 2, lost: 5 }, clay: { won: 4, lost: 2 }, grass: { won: 1, lost: 2 } },
        career: [[18, 1], [22, 12], [26, 29], [28, 44], [30, 58]],
    }),
    player({
        id: 'p-jordan', tour: 'WTA', name: 'Jordan Sample', rank: 1, rankMove: 2, age: 25,
        form: 'WWLWWLWWWL', formSurface: 'hard',
        surfaces: { hard: { won: 5, lost: 2 }, clay: { won: 2, lost: 1 }, grass: { won: 1, lost: 1 } },
        career: [[18, 3], [20, 14], [22, 28], [24, 42], [25, 51]],
    }),
    player({
        id: 'p-kendall', tour: 'WTA', name: 'Kendall Fixture', rank: 2, rankMove: -1, age: 23,
        form: 'LWWLWLWWLW', formSurface: 'hard',
        surfaces: { hard: { won: 3, lost: 2 }, clay: { won: 2, lost: 2 }, grass: { won: 1, lost: 0 } },
        career: [[18, 2], [20, 10], [22, 21], [23, 30]],
    }),
    player({
        id: 'p-logan', tour: 'WTA', name: 'Logan Preview', rank: 3, rankMove: 0, age: 28,
        form: 'WLWLWWLWLW', formSurface: 'hard',
        surfaces: { hard: { won: 3, lost: 3 }, clay: { won: 1, lost: 2 }, grass: { won: 2, lost: 1 } },
        career: [[19, 2], [22, 13], [25, 27], [28, 39]],
    }),
    player({
        id: 'p-morgan', tour: 'WTA', name: 'Morgan Harness', rank: 4, rankMove: 3, age: 20,
        form: 'WWWLLWLWWW', formSurface: 'hard',
        surfaces: { hard: { won: 4, lost: 1 }, clay: { won: 1, lost: 1 }, grass: { won: 0, lost: 1 } },
        career: [[17, 2], [18, 8], [19, 16], [20, 24]],
    }),
];

function match(spec) {
    return {
        id: spec.id,
        tournamentId: spec.tournamentId,
        roundId: spec.roundId,
        slotIndex: spec.slotIndex,
        player1Id: spec.player1Id,
        player2Id: spec.player2Id,
        player1Seed: spec.player1Seed,
        player2Seed: spec.player2Seed,
        startsAtUtc: spec.startsAtUtc,
        isLive: spec.isLive === true,
        winnerId: spec.winnerId || null,
        setScores: spec.setScores || [],
    };
}

const MATCHES = [
    match({
        id: 'm-clay-sf1', tournamentId: 'sample-clay', roundId: 10, slotIndex: 0,
        player1Id: 'p-avery', player2Id: 'p-blake', player1Seed: 1, player2Seed: 2,
        startsAtUtc: '2026-10-10T16:00:00.000Z', winnerId: 'p-avery', setScores: ['6-3', '6-4'],
    }),
    match({
        id: 'm-clay-sf2', tournamentId: 'sample-clay', roundId: 10, slotIndex: 1,
        player1Id: 'p-casey', player2Id: 'p-drew', player1Seed: 3, player2Seed: 4,
        startsAtUtc: '2026-10-10T19:00:00.000Z', winnerId: 'p-casey', setScores: ['7-5', '6-2'],
    }),
    match({
        id: 'm-clay-f', tournamentId: 'sample-clay', roundId: 12, slotIndex: 0,
        player1Id: 'p-avery', player2Id: 'p-casey', player1Seed: 1, player2Seed: 3,
        startsAtUtc: '2026-10-11T15:00:00.000Z', winnerId: 'p-avery', setScores: ['6-4', '3-6', '6-2'],
    }),
    match({
        id: 'm-hard-qf1', tournamentId: 'sample-hard', roundId: 9, slotIndex: 0,
        player1Id: 'p-avery', player2Id: 'p-blake', player1Seed: 1, player2Seed: 2,
        startsAtUtc: '2026-11-06T18:00:00.000Z', winnerId: 'p-avery', setScores: ['6-4', '6-2'],
    }),
    match({
        id: 'm-hard-qf2', tournamentId: 'sample-hard', roundId: 9, slotIndex: 1,
        player1Id: 'p-casey', player2Id: 'p-drew', player1Seed: 3, player2Seed: 4,
        startsAtUtc: '2026-11-07T17:20:00.000Z', isLive: true, setScores: ['6-4', '3-3'],
    }),
    match({
        id: 'm-hard-qf3', tournamentId: 'sample-hard', roundId: 9, slotIndex: 2,
        player1Id: 'p-ellis', player2Id: 'p-finn', player1Seed: 5, player2Seed: 6,
        startsAtUtc: '2026-11-07T21:30:00.000Z',
    }),
    match({
        id: 'm-hard-qf4', tournamentId: 'sample-hard', roundId: 9, slotIndex: 3,
        player1Id: 'p-gray', player2Id: 'p-harper', player1Seed: 7, player2Seed: 8,
        startsAtUtc: '2026-11-08T16:00:00.000Z',
    }),
    match({
        id: 'm-grass-sf1', tournamentId: 'sample-grass', roundId: 10, slotIndex: 0,
        player1Id: 'p-avery', player2Id: 'p-ellis', player1Seed: 1, player2Seed: 4,
        startsAtUtc: '2026-11-16T17:00:00.000Z',
    }),
    match({
        id: 'm-grass-sf2', tournamentId: 'sample-grass', roundId: 10, slotIndex: 1,
        player1Id: 'p-blake', player2Id: 'p-finn', player1Seed: 2, player2Seed: 3,
        startsAtUtc: '2026-11-16T20:00:00.000Z',
    }),
    match({
        id: 'm-wta-qf1', tournamentId: 'sample-wta', roundId: 9, slotIndex: 0,
        player1Id: 'p-jordan', player2Id: 'p-kendall', player1Seed: 1, player2Seed: 2,
        startsAtUtc: '2026-11-06T18:00:00.000Z', winnerId: 'p-jordan', setScores: ['6-2', '6-4'],
    }),
    match({
        id: 'm-wta-qf2', tournamentId: 'sample-wta', roundId: 9, slotIndex: 1,
        player1Id: 'p-logan', player2Id: 'p-morgan', player1Seed: 3, player2Seed: 4,
        startsAtUtc: '2026-11-07T22:00:00.000Z',
    }),
];

const TOURNAMENTS = [
    {
        id: 'sample-clay',
        tour: 'ATP',
        name: 'Sample Clay Cup',
        tier: 'Sample 250',
        surface: 'clay',
        startDate: '2026-10-05',
        endDate: '2026-10-11',
    },
    {
        id: 'sample-hard',
        tour: 'ATP',
        name: 'Preview Hard Open',
        tier: 'Sample 500',
        surface: 'hard',
        startDate: '2026-11-02',
        endDate: '2026-11-08',
    },
    {
        id: 'sample-grass',
        tour: 'ATP',
        name: 'Upcoming Grass Exhibition',
        tier: 'Exhibition',
        surface: 'grass',
        startDate: '2026-11-16',
        endDate: '2026-11-22',
    },
    {
        id: 'sample-wta',
        tour: 'WTA',
        name: 'Sample WTA Hard',
        tier: 'Sample 500',
        surface: 'hard',
        startDate: '2026-11-04',
        endDate: '2026-11-09',
    },
];

const MEETINGS = [
    {
        id: 'h-ab-1',
        player1Id: 'p-avery',
        player2Id: 'p-blake',
        winnerId: 'p-avery',
        surface: 'clay',
        event: 'Sample Clay Cup',
        startsAtUtc: '2026-10-10T16:00:00.000Z',
        setScores: ['6-3', '6-4'],
    },
    {
        id: 'h-ab-2',
        player1Id: 'p-avery',
        player2Id: 'p-blake',
        winnerId: 'p-blake',
        surface: 'hard',
        event: 'Sample history',
        startsAtUtc: '2026-08-12T17:00:00.000Z',
        setScores: ['4-6', '6-3', '6-4'],
    },
    {
        id: 'h-ab-3',
        player1Id: 'p-avery',
        player2Id: 'p-blake',
        winnerId: 'p-avery',
        surface: 'grass',
        event: 'Sample history',
        startsAtUtc: '2026-06-20T15:00:00.000Z',
        setScores: ['7-6', '6-4'],
    },
    {
        id: 'h-cd-1',
        player1Id: 'p-casey',
        player2Id: 'p-drew',
        winnerId: 'p-casey',
        surface: 'hard',
        event: 'Sample history',
        startsAtUtc: '2026-09-18T18:00:00.000Z',
        setScores: ['6-4', '7-5'],
    },
    {
        id: 'h-cd-2',
        player1Id: 'p-casey',
        player2Id: 'p-drew',
        winnerId: 'p-drew',
        surface: 'clay',
        event: 'Sample history',
        startsAtUtc: '2026-05-02T16:00:00.000Z',
        setScores: ['6-1', '3-6', '6-3'],
    },
];

export const SAMPLE_FOLLOWS = [
    { playerKey: 'p-avery', name: 'Avery Sample' },
    { playerKey: 'p-casey', name: 'Casey Preview' },
];

export function buildSampleDataset() {
    return {
        tournaments: structuredClone(TOURNAMENTS),
        matches: structuredClone(MATCHES),
        players: structuredClone(PLAYERS),
        meetings: structuredClone(MEETINGS),
    };
}
