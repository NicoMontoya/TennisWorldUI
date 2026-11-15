import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    SCHEDULE_UPDATING,
    chooseFetchedAt,
    compareMatchOrder,
    formatTbaLabel,
    readTier,
    roundLabel,
} from './shell/derive.js';
import { FIXTURES_PATH, LIVESCORE_PATHS, loadLiveFeed, normalizeFixtures } from './shell/liveFeed.js';
import { parseLocation } from './shell/router.js';
import { buildView, partitionSchedule } from './shell/viewModel.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const ZONE = 'America/Denver';
const NOW = Date.parse('2026-11-15T18:00:00.000Z');

function row(spec) {
    return {
        matchKey: spec.id,
        tournamentKey: spec.tournamentKey,
        tournamentName: spec.tournamentName,
        date: spec.date,
        time: spec.time || '',
        startsAtUtc: spec.startsAtUtc,
        status: spec.status || 'Not Started',
        round: spec.round,
        roundId: spec.roundId,
        season: 2026,
        eventType: spec.eventType || '',
        tier: spec.tier,
        player1Key: spec.p1 || 'p1',
        player1Name: spec.p1Name || 'Player One',
        player2Key: spec.p2 || 'p2',
        player2Name: spec.p2Name || 'Player Two',
        surface: spec.surface || 'hard',
    };
}

function viewFrom(rows, liveRows, search) {
    const dataset = normalizeFixtures(rows, liveRows || []);
    return buildView({
        data: {
            mode: 'live',
            now: NOW,
            fetchedAt: '2026-11-15T23:40:00.000Z',
            stale: false,
            error: dataset.matches.length ? null : SCHEDULE_UPDATING,
            neverHadData: dataset.matches.length === 0,
            callsNetwork: true,
            ...dataset,
            gates: [],
        },
        route: parseLocation('/schedule', search || ''),
        now: NOW,
        timeZone: ZONE,
        viewer: { signedIn: false, displayName: '', follows: [], sampleSession: false },
    });
}

describe('tier comes only from the fixtures field', () => {
    it('accepts tour, challenger, and itf and ignores names', () => {
        expect(readTier({ tier: 'tour', tournamentName: 'M15 Monastir', eventType: 'ITF' })).toBe('tour');
        expect(readTier({ tier: 'Challenger', tournamentName: 'Australian Open' })).toBe('challenger');
        expect(readTier({ tier: 'ITF', tournamentName: 'Wimbledon' })).toBe('itf');
        expect(readTier({ tournamentName: 'Challenger Bratislava', eventType: 'M15' })).toBe('');
        expect(readTier({ tier: 'futures', tournamentName: 'ATP Finals' })).toBe('');
        expect(readTier({ tier: '' })).toBe('');
        expect(readTier({})).toBe('');
        const src = read('./shell/derive.js');
        const fn = src.slice(src.indexOf('export function readTier'), src.indexOf('export function roundLabel'));
        expect(fn).not.toMatch(/tournamentName|eventType|M15|Challenger/);
    });
});

describe('TBA matches', () => {
    const rows = [
        row({
            id: 'm-late',
            tournamentKey: 't-open',
            tournamentName: 'City Open',
            tier: 'tour',
            date: '2026-11-15',
            time: '14:00',
            startsAtUtc: '2026-11-15T21:00:00.000Z',
            round: 'Final',
            roundId: 12,
        }),
        row({
            id: 'm-tba',
            tournamentKey: 't-open',
            tournamentName: 'City Open',
            tier: 'tour',
            date: '2026-11-15',
            time: '09:30',
            startsAtUtc: null,
            round: 'Semifinals',
            roundId: 10,
            p1: 'p-xss',
            p1Name: '<script>alert(1)</script>',
        }),
        row({
            id: 'm-early',
            tournamentKey: 't-open',
            tournamentName: 'City Open',
            tier: 'tour',
            date: '2026-11-15',
            startsAtUtc: '2026-11-15T16:00:00.000Z',
            round: 'Semifinals',
            roundId: 10,
        }),
    ];

    it('labels the day, never a guessed clock, and sorts after timed matches', () => {
        expect(formatTbaLabel('2026-11-15', ZONE)).toBe('Nov 15 · Time TBA');
        const ordered = [...rows].sort((a, b) => compareMatchOrder(
            { ...a, id: a.matchKey, date: a.date },
            { ...b, id: b.matchKey, date: b.date },
            'UTC',
        ));
        expect(ordered.map((item) => item.matchKey)).toEqual(['m-early', 'm-late', 'm-tba']);
        const view = viewFrom(rows, [], '?');
        const tournament = buildView({
            data: {
                mode: 'live',
                now: NOW,
                fetchedAt: '2026-11-15T23:40:00.000Z',
                stale: false,
                error: null,
                neverHadData: false,
                ...normalizeFixtures(rows, []),
                gates: [],
            },
            route: parseLocation('/t/t-open', '?match=m-tba'),
            now: NOW,
            timeZone: ZONE,
            viewer: { signedIn: false, displayName: '', follows: [], sampleSession: false },
        });
        const listed = tournament.tournament.matches.map((item) => item.id);
        expect(listed.indexOf('m-early')).toBeLessThan(listed.indexOf('m-tba'));
        expect(listed.indexOf('m-late')).toBeLessThan(listed.indexOf('m-tba'));
        const tba = tournament.tournament.matches.find((item) => item.id === 'm-tba');
        expect(tba.primary).toBe('Nov 15 · Time TBA');
        expect(tba.primary).not.toMatch(/09:30|AM|PM|\d{1,2}:\d{2}/);
        expect(tba.timeMuted).toBe(true);
        expect(tba.chip).toBe('Scheduled');
        expect(tba.picksLocked).toBe(true);
        expect(tournament.sheet.primary).toBe('Nov 15 · Time TBA');
        expect(tournament.sheet.chip).toBe('Scheduled');
        expect(tournament.sheet.pickLabel).toBe('Picks open soon');
        expect(tournament.sheet.picksLocked).toBe(true);
        expect(tba.p1.name).toBe('<script>alert(1)</script>');
        expect(view.schedule.cards.map((card) => card.name)).toContain('City Open');
    });
});

describe('round labels and tier groups', () => {
    it('shows R1 for challenger and ITF roundId 4 and full names for tour', () => {
        expect(roundLabel(4, { tier: 'challenger', round: 'Round of 128' })).toBe('R1');
        expect(roundLabel(4, { tier: 'itf', round: 'Round of 128' })).toBe('R1');
        expect(roundLabel(4, { tier: 'tour', round: 'Round of 128' })).toBe('Round of 128');
        expect(roundLabel(9, { tier: 'tour', round: 'Quarterfinals' })).toBe('Quarterfinals');
        expect(roundLabel(4, { tier: '', round: 'Round of 128' })).toBe('R128');
    });

    it('lists tour events first and folds missing tiers into Challengers & ITF', () => {
        const rows = [
            row({
                id: 'wta-1',
                tournamentKey: 't-wta',
                tournamentName: 'WTA Finals',
                tier: 'tour',
                eventType: 'WTA Singles',
                date: '2026-11-15',
                startsAtUtc: '2026-11-15T20:00:00.000Z',
                round: 'Final',
                roundId: 12,
            }),
            row({
                id: 'atp-1',
                tournamentKey: 't-atp',
                tournamentName: 'ATP Finals',
                tier: 'tour',
                eventType: 'ATP Singles',
                date: '2026-11-15',
                startsAtUtc: '2026-11-15T18:00:00.000Z',
                round: 'Round of 128',
                roundId: 4,
            }),
            row({
                id: 'ch-1',
                tournamentKey: 't-ch',
                tournamentName: 'Wimbledon',
                tier: 'challenger',
                date: '2026-11-15',
                startsAtUtc: '2026-11-15T12:00:00.000Z',
                round: 'Round of 128',
                roundId: 4,
            }),
            row({
                id: 'itf-1',
                tournamentKey: 't-itf',
                tournamentName: 'Australian Open',
                tier: 'itf',
                date: '2026-11-15',
                startsAtUtc: '2026-11-15T13:00:00.000Z',
                round: 'Round of 128',
                roundId: 4,
            }),
            row({
                id: 'missing-1',
                tournamentKey: 't-miss',
                tournamentName: 'Challenger Bratislava M15',
                date: '2026-11-15',
                startsAtUtc: '2026-11-15T11:00:00.000Z',
                round: 'Round of 128',
                roundId: 4,
            }),
        ];
        const view = viewFrom(rows);
        expect(view.schedule.cards.map((card) => card.id)).toEqual(['t-atp', 't-wta']);
        expect(view.schedule.lowerHeading).toBe('Challengers & ITF');
        expect(view.schedule.lowerCards.map((card) => card.id).sort()).toEqual(['t-ch', 't-itf', 't-miss']);
        expect(view.schedule.seasonOver).toBe('');
        const grouped = partitionSchedule(view.schedule.cards.concat(view.schedule.lowerCards));
        expect(grouped.tour.map((card) => card.id)).toEqual(['t-atp', 't-wta']);
        const tournament = buildView({
            data: {
                mode: 'live',
                now: NOW,
                fetchedAt: '2026-11-15T23:40:00.000Z',
                error: null,
                neverHadData: false,
                ...normalizeFixtures(rows, []),
                gates: [],
            },
            route: parseLocation('/t/t-ch', ''),
            now: NOW,
            timeZone: ZONE,
            viewer: { signedIn: false, displayName: '', follows: [], sampleSession: false },
        });
        expect(tournament.tournament.matches[0].round).toBe('R1');
        const itf = buildView({
            data: {
                mode: 'live',
                now: NOW,
                fetchedAt: '2026-11-15T23:40:00.000Z',
                error: null,
                neverHadData: false,
                ...normalizeFixtures(rows, []),
                gates: [],
            },
            route: parseLocation('/t/t-itf', ''),
            now: NOW,
            timeZone: ZONE,
            viewer: { signedIn: false, displayName: '', follows: [], sampleSession: false },
        });
        expect(itf.tournament.matches[0].round).toBe('R1');
        const tour = buildView({
            data: {
                mode: 'live',
                now: NOW,
                fetchedAt: '2026-11-15T23:40:00.000Z',
                error: null,
                neverHadData: false,
                ...normalizeFixtures(rows, []),
                gates: [],
            },
            route: parseLocation('/t/t-atp', ''),
            now: NOW,
            timeZone: ZONE,
            viewer: { signedIn: false, displayName: '', follows: [], sampleSession: false },
        });
        expect(tour.tournament.matches[0].round).toBe('Round of 128');
    });

    it('says the tour season is over when the next tour event is later', () => {
        const rows = [
            row({
                id: 'ch-now',
                tournamentKey: 't-ch',
                tournamentName: 'Challenger Lyon',
                tier: 'challenger',
                date: '2026-11-15',
                startsAtUtc: '2026-11-15T15:00:00.000Z',
                round: 'Final',
                roundId: 12,
            }),
            row({
                id: 'next-tour',
                tournamentKey: 't-next',
                tournamentName: 'Brisbane Open',
                tier: 'tour',
                eventType: 'ATP Singles',
                date: '2026-12-01',
                startsAtUtc: '2026-12-01T18:00:00.000Z',
                round: 'Final',
                roundId: 12,
            }),
            row({
                id: 'fake-slam',
                tournamentKey: 't-fake',
                tournamentName: 'Australian Open',
                date: '2026-11-20',
                startsAtUtc: '2026-11-20T18:00:00.000Z',
                round: 'Final',
                roundId: 12,
            }),
        ];
        const view = viewFrom(rows);
        expect(view.schedule.cards).toEqual([]);
        expect(view.schedule.seasonOver).toBe("Tour season's over, next up: Brisbane Open Dec 1");
        expect(view.schedule.lowerCards.map((card) => card.id)).toContain('t-ch');
        expect(view.schedule.seasonOver).not.toMatch(/Australian Open/);
    });
});

describe('live feed errors, as-of time, and text safety', () => {
    it('ignores the 1970 sentinel and formats as-of in the viewer zone', () => {
        const fetchTime = Date.parse('2026-11-15T23:40:00.000Z');
        expect(chooseFetchedAt('1970-01-01T00:00:00.000Z', fetchTime)).toBe('2026-11-15T23:40:00.000Z');
        const view = buildView({
            data: {
                mode: 'live',
                now: NOW,
                fetchedAt: chooseFetchedAt('1970-01-01T00:00:00.000Z', fetchTime),
                stale: false,
                error: SCHEDULE_UPDATING,
                neverHadData: true,
                callsNetwork: true,
                tournaments: [],
                matches: [],
                players: [],
                meetings: [],
                gates: [],
            },
            route: parseLocation('/schedule', ''),
            now: NOW,
            timeZone: ZONE,
            viewer: { signedIn: false, displayName: '', follows: [], sampleSession: false },
        });
        expect(view.banner).toBe('Schedule is updating. Check back soon.');
        expect(view.asOf).toBe('as of Nov 15, 4:40 PM MST');
        expect(view.schedule.empty).toBe(SCHEDULE_UPDATING);
        expect(`${view.banner} ${view.asOf}`).not.toMatch(/quota|paid feed|1970/i);
    });

    it('uses only the fixtures and livescore endpoints and keeps names as text', async () => {
        const calls = [];
        const fetchImpl = async (url) => {
            calls.push(String(url));
            if (url === FIXTURES_PATH) {
                return {
                    ok: true,
                    headers: { get: () => '1970-01-01T00:00:00.000Z' },
                    json: async () => ({
                        ok: true,
                        data: [row({
                            id: 'm-live',
                            tournamentKey: 't-live',
                            tournamentName: 'City Open',
                            tier: 'tour',
                            date: '2026-11-15',
                            startsAtUtc: '2026-11-15T17:00:00.000Z',
                            round: 'Final',
                            roundId: 12,
                            p1Name: '<b>Ada</b>',
                        })],
                    }),
                };
            }
            if (String(url).startsWith('/api/livescore')) {
                return {
                    ok: true,
                    headers: { get: () => '2026-11-15T23:40:00.000Z' },
                    json: async () => ({
                        ok: true,
                        data: [{ matchKey: 'm-live', isLive: true, setScores: ['6-4', '2-2'] }],
                    }),
                };
            }
            throw new Error(`unexpected ${url}`);
        };
        const feed = await loadLiveFeed({ fetchImpl, now: NOW });
        expect(calls).toEqual([FIXTURES_PATH, ...LIVESCORE_PATHS]);
        expect(feed.shell.matches[0].isLive).toBe(true);
        expect(feed.shell.players.find((player) => player.id === 'p1').name).toBe('<b>Ada</b>');
        expect(feed.fetchedAt).toBe('2026-11-15T23:40:00.000Z');

        const failedCalls = [];
        const failed = await loadLiveFeed({
            fetchImpl: async (url) => {
                failedCalls.push(String(url));
                if (String(url).startsWith('/api/')) {
                    return { ok: false, headers: { get: () => null }, json: async () => ({ ok: false }) };
                }
                throw new Error(`unexpected ${url}`);
            },
            now: NOW,
        });
        expect(failedCalls).toEqual([FIXTURES_PATH, ...LIVESCORE_PATHS]);
        expect(failed.shell.neverHadData).toBe(true);
        expect(failed.shell.error).toBe(SCHEDULE_UPDATING);
        expect(failed.shell.matches).toEqual([]);

        const shellFiles = [
            './shell/sprint1.js',
            './shell/liveFeed.js',
            './shell/viewModel.js',
            './shell/derive.js',
        ];
        shellFiles.forEach((file) => {
            const src = read(file);
            expect(src).not.toMatch(/\.innerHTML|insertAdjacentHTML|outerHTML/);
            expect(src).not.toMatch(/localStorage|sessionStorage/);
        });
        expect(read('./shell/liveFeed.js')).not.toMatch(/\/api\/(?!fixtures|livescore)/);
        expect(read('./shell/dataSource.js')).not.toMatch(/quota|paid feed/i);
        expect(read('./shell/sprint1.js')).not.toMatch(/No sample|quota|paid feed/i);
        expect(read('./shell/viewModel.js')).not.toMatch(/No sample|quota|paid feed/i);
    });
});
