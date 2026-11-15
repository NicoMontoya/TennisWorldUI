import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STALE_AT, loadShellData } from './shell/dataSource.js';
import { deriveMatchPhase, formatStartLocal, isSameLocalDay, tournamentChip } from './shell/derive.js';
import { SAMPLE_NOW, buildSampleDataset } from './shell/fixtures.js';
import { applyNav, planClick } from './shell/navPlan.js';
import { sampleFixturesAllowed } from './shell/previewGate.js';
import { hrefFor, parseLocation } from './shell/router.js';
import { buildView, sanitizeDisplayName, viewerFromUser } from './shell/viewModel.js';
import { classify, ensureSample } from './scripts/sprint1-preview.mjs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const ZONE = 'America/Denver';
const NOW = Date.parse(SAMPLE_NOW);

function keysDeep(value, acc = []) {
    if (Array.isArray(value)) value.forEach((item) => keysDeep(item, acc));
    else if (value && typeof value === 'object') {
        Object.entries(value).forEach(([key, item]) => {
            acc.push(key);
            keysDeep(item, acc);
        });
    }
    return acc;
}

function stringsDeep(value, acc = []) {
    if (typeof value === 'string') acc.push(value);
    else if (Array.isArray(value)) value.forEach((item) => stringsDeep(item, acc));
    else if (value && typeof value === 'object') Object.values(value).forEach((item) => stringsDeep(item, acc));
    return acc;
}

function sampleView(route) {
    const data = loadShellData({
        allowed: true,
        state: route.state,
        dataset: buildSampleDataset(),
        now: NOW,
    });
    return buildView({
        data,
        route: { ...route, sample: true },
        now: NOW,
        timeZone: ZONE,
        viewer: { signedIn: false, displayName: '', follows: [], sampleSession: false },
    });
}

describe('preview gate', () => {
    const ok = { hostname: 'localhost', search: '?sample=1', preview: 'sprint1' };

    it('allows loopback only with the preview document and sample=1', () => {
        expect(sampleFixturesAllowed(ok)).toBe(true);
        expect(sampleFixturesAllowed({ ...ok, hostname: '127.0.0.1' })).toBe(true);
        expect(sampleFixturesAllowed({ ...ok, hostname: '[::1]' })).toBe(true);
    });

    it('stays off for production hosts, missing opt-in, and a forced hold', () => {
        expect(sampleFixturesAllowed({ ...ok, hostname: 'tennisworld.dev' })).toBe(false);
        expect(sampleFixturesAllowed({ ...ok, hostname: 'preview.tennisworld.dev' })).toBe(false);
        expect(sampleFixturesAllowed({ ...ok, search: '' })).toBe(false);
        expect(sampleFixturesAllowed({ ...ok, search: '?sample=true' })).toBe(false);
        expect(sampleFixturesAllowed({ ...ok, preview: 'home' })).toBe(false);
        expect(sampleFixturesAllowed({ ...ok, forceProduction: true })).toBe(false);
    });
});

describe('sample fixtures', () => {
    const data = buildSampleDataset();

    it('has no status, probability, estimate, odds, or email fields', () => {
        const keys = new Set(keysDeep(data));
        ['status', 'probability', 'estimate', 'odds', 'email', 'winProbability'].forEach((key) => {
            expect(keys.has(key)).toBe(false);
        });
        expect(stringsDeep(data).join('\n')).not.toMatch(/@/);
    });

    it('does not fetch or touch storage', () => {
        const src = read('./shell/fixtures.js');
        expect(src).not.toMatch(/\bfetch\s*\(/);
        expect(src).not.toMatch(/localStorage|sessionStorage|indexedDB|caches\./);
    });
});

describe('derived status and local time', () => {
    it('formats startsAtUtc in the viewer zone with a short zone label', () => {
        const local = formatStartLocal('2026-11-07T14:30:00.000Z', ZONE);
        expect(local.time).toBe('7:30 AM');
        expect(local.zone).toBe('MST');
        expect(local.label).toBe('7:30 AM MST');
        expect(local.date).toBe('Nov 7');
    });

    it('uses the viewer calendar day, not the feed day', () => {
        const iso = '2026-11-07T06:00:00.000Z';
        expect(isSameLocalDay(iso, NOW, 'Europe/London')).toBe(true);
        expect(isSameLocalDay(iso, NOW, ZONE)).toBe(false);
    });

    it('ignores a hard-coded status string', () => {
        const upcoming = {
            startsAtUtc: '2026-11-07T21:30:00.000Z',
            isLive: false,
            winnerId: null,
            status: 'Live',
        };
        expect(deriveMatchPhase(upcoming, NOW)).toBe('upcoming');
        const live = {
            startsAtUtc: '2026-11-07T17:20:00.000Z',
            isLive: true,
            winnerId: null,
            status: 'Scheduled',
        };
        expect(deriveMatchPhase(live, NOW)).toBe('live');
        expect(deriveMatchPhase({ ...live, winnerId: 'p-casey', status: 'Live' }, NOW)).toBe('final');
    });

    it('labels the sample tournaments Live, Final, and Starts', () => {
        const data = buildSampleDataset();
        const chip = (id) => {
            const tournament = data.tournaments.find((item) => item.id === id);
            const matches = data.matches.filter((item) => item.tournamentId === id);
            return tournamentChip(tournament, matches, NOW, ZONE).text;
        };
        expect(chip('sample-hard')).toBe('Live');
        expect(chip('sample-clay')).toBe('Final');
        expect(chip('sample-grass')).toBe('Starts Nov 16');
    });
});

describe('shell data and view', () => {
    const base = parseLocation('/schedule', '?sample=1');

    it('does not call the network for sample, empty, error, stale, or production', () => {
        const dataset = buildSampleDataset();
        ['ready', 'empty', 'error', 'stale'].forEach((state) => {
            const data = loadShellData({ allowed: true, state, dataset, now: NOW });
            expect(data.callsNetwork).toBe(false);
        });
        const held = loadShellData({ allowed: false, state: 'error', dataset, now: NOW });
        expect(held.mode).toBe('production-hold');
        expect(held.matches).toEqual([]);
        expect(held.callsNetwork).toBe(false);
        expect(held.fetchedAt).toBeNull();
    });

    it('keeps a stored sample copy on error and stamps a stale as-of', () => {
        const data = loadShellData({
            allowed: true,
            state: 'error',
            dataset: buildSampleDataset(),
            now: NOW,
        });
        expect(data.error).toMatch(/sample feed/);
        expect(data.matches.length).toBeGreaterThan(0);
        expect(data.fetchedAt).toBe(STALE_AT);
        expect(data.stale).toBe(true);
        const view = buildView({
            data,
            route: { ...base, state: 'error', sample: true },
            now: NOW,
            timeZone: ZONE,
            viewer: { signedIn: false, displayName: '', follows: [], sampleSession: false },
        });
        expect(view.error).toMatch(/sample feed/);
        expect(view.stale).toMatch(/^as of /);
        expect(view.schedule.cards.length).toBeGreaterThan(0);
    });

    it('uses the empty state only when nothing has been stored', () => {
        const view = sampleView({ ...base, state: 'empty' });
        expect(view.schedule.empty).toBe('No schedule has been stored yet.');
        expect(view.schedule.cards).toEqual([]);
        expect(view.banner).toMatch(/Sample data/);
    });

    it('opens Schedule, tournament, match, and player within three steps', () => {
        const schedule = sampleView(base);
        const card = schedule.schedule.cards.find((item) => item.id === 'sample-hard');
        expect(card.chip).toBe('Live');
        expect(card.href).toContain('/t/sample-hard');
        const tournament = sampleView(parseLocation('/t/sample-hard', '?sample=1'));
        const row = tournament.tournament.matches.find((item) => item.id === 'm-hard-qf2');
        expect(row.chip).toBe('Live');
        expect(row.primary).toBe('6-4 3-3');
        expect(row.startLabel).toContain('MST');
        expect(row.href).toContain('match=m-hard-qf2');
        const sheetRoute = parseLocation('/t/sample-hard', '?sample=1&match=m-hard-qf2');
        const opened = sampleView(sheetRoute);
        expect(opened.sheet.p1.name).toBe('Casey Preview');
        expect(opened.sheet.p1.href).toContain('/p/p-casey');
        expect(opened.sheet.pickLabel).toBe('Picks open soon');
        expect(opened.sheet.h2h.data.coverageNote).toMatch(/Sample/);
        const player = sampleView(parseLocation('/p/p-casey', '?sample=1'));
        expect(player.player.name).toBe('Casey Preview');
        expect(player.player.form).toHaveLength(10);
        const copy = stringsDeep(opened).join('\n').toLowerCase();
        expect(copy).toContain('not probabilities');
        expect(copy).not.toMatch(/model estimate|betting tip|win probability|\d+%/);
    });

    it('defaults Schedule to Now and falls forward only when Now is empty', () => {
        const view = sampleView({ ...base, tour: 'ATP' });
        expect(view.schedule.segment).toBe('now');
        expect(view.schedule.cards.map((card) => card.id)).toEqual(['sample-hard']);
        const past = sampleView({ ...base, segment: 'past' });
        expect(past.schedule.cards.map((card) => card.id)).toEqual(['sample-clay']);
        const next = sampleView({ ...base, segment: 'upnext' });
        expect(next.schedule.cards.map((card) => card.id)).toEqual(['sample-grass']);
    });

    it('shows Today live and later-today rows from the sample clock', () => {
        const view = sampleView(parseLocation('/today', '?sample=1'));
        expect(view.today.live.map((row) => row.id)).toEqual(['m-hard-qf2']);
        expect(view.today.upNext.map((row) => row.id)).toEqual(['m-hard-qf3']);
        expect(view.today.emptyLive).toBe(false);
    });

    it('keeps picks disabled and Me free of email', () => {
        const picks = sampleView(parseLocation('/picks', '?sample=1'));
        expect(picks.picks.label).toBe('Picks open soon');
        const user = viewerFromUser({
            firstName: 'Ada',
            lastName: 'Lovelace',
            email: 'ada@example.com',
            favorites: [{ playerKey: 'p-avery', name: 'Avery Sample', email: 'hidden@example.com' }],
        });
        expect(user.displayName).toBe('Ada Lovelace');
        expect(JSON.stringify(user)).not.toMatch(/@/);
        expect(sanitizeDisplayName('ada@example.com', '')).toBe('');
        const me = buildView({
            data: loadShellData({ allowed: true, state: 'ready', dataset: buildSampleDataset(), now: NOW }),
            route: { ...parseLocation('/me', '?sample=1'), sample: true },
            now: NOW,
            timeZone: ZONE,
            viewer: { ...user, sampleSession: false },
        });
        expect(me.me.displayName).toBe('Ada Lovelace');
        expect(me.me.recordNote).toBe('Pick record coming soon.');
        expect(JSON.stringify(me.me)).not.toMatch(/@/);
    });
});

describe('routing, back, and scroll', () => {
    it('round-trips tournament and match links', () => {
        const href = hrefFor({
            view: 'tournament',
            entityId: 'sample-hard',
            matchId: 'm-hard-qf2',
            sample: true,
            tour: 'ATP',
            fileMode: false,
        }, '/today');
        const route = parseLocation(href.split('?')[0], `?${href.split('?')[1]}`);
        expect(route.view).toBe('tournament');
        expect(route.entityId).toBe('sample-hard');
        expect(route.matchId).toBe('m-hard-qf2');
        expect(route.sample).toBe(true);
        expect(safeReject('<script>')).toBeNull();
    });

    it('restores the schedule scroll after tournament, sheet, and player', () => {
        const stack = [];
        let index = -1;
        let scroll = 480;
        const api = {
            getScroll: () => scroll,
            setScroll: (y) => { scroll = y; },
            getState: () => (index >= 0 ? stack[index].state : null),
            commitScroll(y) { stack[index].state = { ...stack[index].state, scrollY: y }; },
            pushState(state, href) {
                stack.splice(index + 1);
                stack.push({ state, href });
                index += 1;
            },
            replaceState(state, href) { stack[index] = { state, href }; },
            back() {
                if (index > 0) index -= 1;
                scroll = stack[index].state.scrollY;
            },
        };
        api.pushState({ tw: true, scrollY: 480, navDepth: 0 }, '/schedule?sample=1');
        const schedule = { view: 'schedule', sample: true, fileMode: false };
        scroll = 480;
        applyNav(api, { ...planClick(schedule, {
            kind: 'view',
            route: { ...schedule, view: 'tournament', entityId: 'sample-hard' },
        }), href: '/t/sample-hard?sample=1' });
        expect(scroll).toBe(0);
        scroll = 200;
        applyNav(api, { ...planClick(
            { ...schedule, view: 'tournament', entityId: 'sample-hard' },
            { kind: 'sheet', matchId: 'm-hard-qf2' },
        ), href: '/t/sample-hard?sample=1&match=m-hard-qf2' });
        expect(scroll).toBe(200);
        applyNav(api, { ...planClick(
            { view: 'tournament', entityId: 'sample-hard', matchId: 'm-hard-qf2' },
            { kind: 'view', route: { view: 'player', entityId: 'p-casey', sample: true, fileMode: false } },
        ), href: '/p/p-casey?sample=1' });
        expect(scroll).toBe(0);
        api.back();
        expect(scroll).toBe(200);
        expect(stack[index].href).toContain('match=m-hard-qf2');
        api.back();
        expect(scroll).toBe(200);
        api.back();
        expect(scroll).toBe(480);
        expect(stack[index].href).toContain('/schedule');
    });
});

function safeReject(value) {
    return parseLocation('/p/' + value, '').entityId;
}

describe('preview server and cache boundaries', () => {
    it('adds sample=1 only on shell routes and blocks the API', () => {
        expect(classify('/today')).toBe('shell');
        expect(classify('/t/sample-hard')).toBe('shell');
        expect(classify('/p/p-casey')).toBe('shell');
        expect(classify('/styles.css')).toBe('file');
        expect(classify('/api/fixtures')).toBe('block-api');
        expect(ensureSample('/schedule')).toBe('/schedule?sample=1');
        expect(ensureSample('/t/sample-hard?match=m-hard-qf2')).toBe('/t/sample-hard?match=m-hard-qf2&sample=1');
        expect(ensureSample('/today?sample=1')).toBeNull();
        expect(ensureSample('/styles.css')).toBeNull();
        expect(ensureSample('/api/hub')).toBeNull();
    });

    it('keeps the preview out of the service worker and does not register one', () => {
        const sw = read('./sw.js');
        const shared = read('./shared.js');
        const page = read('./sprint1.html');
        const app = read('./shell/sprint1.js');
        expect(sw).toMatch(/CACHE_VERSION\s*=\s*'tw-v51'/);
        expect(sw).toMatch(/pathname === '\/sprint1\.html'/);
        expect(sw).toMatch(/pathname\.startsWith\('\/shell\/'\)/);
        expect(sw).not.toMatch(/SHELL_ASSETS[\s\S]*fixtures\.js/);
        expect(shared).toMatch(/isSprint1PreviewDocument/);
        expect(shared).toMatch(/data-tw-preview'\) === 'sprint1'/);
        expect(page).toMatch(/noindex, nofollow/);
        expect(page).toMatch(/src="\/shared\.js"/);
        expect(page).toMatch(/src="\/shell\/sprint1\.js\?v=tw51"/);
        expect(page).not.toMatch(/src="shared\.js"/);
        expect(page).not.toMatch(/cloudflareinsights|innerHTML/);
        expect(app).not.toMatch(/innerHTML|apiFetch|insertAdjacentHTML/);
        expect(app).not.toMatch(/^import .*fixtures/m);
        expect(app).toMatch(/import\('\.\/fixtures\.js'\)/);
        expect(read('./shell/sprint1.css')).toMatch(/min-height:\s*44px/);
        expect(read('./shell/sprint1.css')).toMatch(/56px \+ env\(safe-area-inset-bottom\)/);
        expect(read('./shell/sprint1.css')).toMatch(/max-width:\s*767px/);
        expect(read('./shell/sprint1.css')).toMatch(/min-width:\s*1280px/);
        expect(read('./shell/sprint1.css')).toMatch(/90dvh/);
    });
});
