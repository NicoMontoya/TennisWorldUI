import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderPicks } from './shell/account.js';
import { applyNav, planClick } from './shell/navPlan.js';
import { hrefFor, parseLocation } from './shell/router.js';
import {
    PICKS_API_FIXTURES,
    PICKS_COPY,
    accuracyOf,
    actionFromSave,
    displayNameOf,
    emptyBoardState,
    lockLabel,
    meRecordLine,
    presentPicks,
    rateLimitMessage,
    readLeaderboardPayload,
    readMinePayload,
    readOpenPayload,
    readSavePayload,
    reducePicks,
    rowOffScreen,
    voidReasonLabel,
} from './shell/picks.js';
import { loadMemberPicks, pickRequestBody, savePick } from './shell/picksClient.js';
import { shouldFetchPicks } from './shell/session.js';

const root = new URL('./', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, root), 'utf8');
const SCRIPT_NAME = '<script>alert(1)</script>';
const DAY_START = '2026-11-16T23:00:00.000Z';
const BEFORE_DAY = Date.parse('2026-11-15T12:00:00.000Z');

function createElement(tag) {
    const node = {
        tagName: String(tag).toUpperCase(),
        className: '',
        children: [],
        attrs: {},
        listeners: {},
        disabled: false,
        hidden: false,
        value: '',
        type: '',
        id: '',
        appendChild(child) {
            this.children.push(child);
            return child;
        },
        setAttribute(name, value) { this.attrs[name] = String(value); },
        getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; },
        addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
        set textContent(value) {
            this.children = [{ tagName: '#text', textContent: value == null ? '' : String(value), children: [] }];
        },
        get textContent() {
            return this.children.map((child) => child.textContent || '').join('');
        },
        set innerHTML(_value) { throw new Error('innerHTML'); },
    };
    return node;
}

function mount() {
    const host = createElement('div');
    globalThis.document = { createElement };
    return host;
}

function walk(node, acc = []) {
    acc.push(node);
    (node.children || []).forEach((child) => walk(child, acc));
    return acc;
}

function openMatch(extra = {}) {
    return {
        matchKey: 'm1',
        tournamentKey: 'nitto-2026',
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
        savedPick: null,
        locked: false,
        generation: 0,
        ...extra,
    };
}

function ready(open) {
    return { phase: 'ready', open, mine: [], board: [], errors: {} };
}

describe('picks contract matches the API payloads', () => {
    it('reads open, mine, save, and leaderboard fixtures', () => {
        const open = readOpenPayload(PICKS_API_FIXTURES.open);
        expect(open.map((match) => match.lockKind)).toEqual(['start', 'day_start']);
        expect(open[1].locksAtUtc).toBe(DAY_START);
        expect(open[1].pick).toBe('zverev');
        expect(open[0].savedPick).toBeNull();

        const mine = readMinePayload(PICKS_API_FIXTURES.mine);
        expect(mine.map((row) => row.result)).toEqual([
            'correct', 'wrong', 'pending', 'void', 'void', 'void', 'void',
        ]);
        expect(mine.map((row) => voidReasonLabel(row.result === 'void' ? row.voidReason : 'unused'))).toContain('Walkover');

        const board = readLeaderboardPayload(PICKS_API_FIXTURES.leaderboard);
        expect(board[1].displayName).toBe('Member');
        expect(board[0]).toEqual({ rank: 1, displayName: 'Ada', points: 4, graded: 5 });
        expect(accuracyOf(board[0].points, board[0].graded)).toBeCloseTo(4 / 5);
        expect(accuracyOf(board[2].points, board[2].graded)).toBeCloseTo(1 / 3);
        expect(accuracyOf(1, 0)).toBeNull();

        const saved = readSavePayload(PICKS_API_FIXTURES.save);
        expect(saved).toEqual({
            matchKey: 'atp-finals-sf1',
            pickedPlayerKey: 'sinner',
            result: 'pending',
            voidReason: null,
            locksAtUtc: '2026-11-21T19:30:00.000Z',
        });
        const published = JSON.stringify({
            open: PICKS_API_FIXTURES.open,
            mine: PICKS_API_FIXTURES.mine,
            leaderboard: PICKS_API_FIXTURES.leaderboard,
            save: PICKS_API_FIXTURES.save,
        });
        expect(published).not.toMatch(/rank_gap|memberId|email|@/);
    });

    it('drops private and scoring fields from a response', () => {
        const [match] = readOpenPayload(PICKS_API_FIXTURES.polluted);
        const blob = JSON.stringify(match);
        expect(blob).not.toMatch(/email|memberId|rank_gap|odds|score|points/);
        expect(Object.keys(match).sort()).toEqual([
            'date', 'generation', 'lockKind', 'locked', 'locksAtUtc', 'matchKey',
            'pick', 'player1Key', 'player1Name', 'player2Key', 'player2Name',
            'round', 'savedPick', 'startsAtUtc', 'status', 'tier', 'tour', 'tournamentKey', 'tournamentName',
        ].sort());
    });

    it('posts only matchKey and playerKey', async () => {
        expect(pickRequestBody('atp-finals-sf1', 'sinner')).toEqual({
            matchKey: 'atp-finals-sf1',
            playerKey: 'sinner',
        });
        const calls = [];
        await savePick('atp-finals-sf1', 'sinner', {
            fetch: async (url, opts) => {
                calls.push({ url, opts });
                return new Response(JSON.stringify({ ok: true, data: PICKS_API_FIXTURES.save }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            },
        });
        expect(calls[0].url).toBe('/api/picks');
        expect(calls[0].opts.method).toBe('POST');
        expect(calls[0].opts.credentials).toBe('include');
        expect(calls[0].opts.headers['Content-Type']).toBe('application/json');
        expect(calls[0].opts.headers.Authorization).toBeUndefined();
        expect(JSON.parse(calls[0].opts.body)).toEqual({ matchKey: 'atp-finals-sf1', playerKey: 'sinner' });
        expect(Object.keys(JSON.parse(calls[0].opts.body)).sort()).toEqual(['matchKey', 'playerKey']);
    });

    it('loads the three member reads and stops on 401 and 403', async () => {
        const paths = [];
        const ok = await loadMemberPicks({
            fetch: async (url, opts) => {
                paths.push(url);
                expect(opts.credentials).toBe('include');
                expect(opts.method).toBe('GET');
                expect(opts.body).toBeUndefined();
                if (url === '/api/picks/open') {
                    return new Response(JSON.stringify({ ok: true, data: PICKS_API_FIXTURES.open }), { status: 200 });
                }
                if (url === '/api/picks/mine') {
                    return new Response(JSON.stringify({ ok: true, data: PICKS_API_FIXTURES.mine }), { status: 200 });
                }
                return new Response(JSON.stringify({ ok: true, data: PICKS_API_FIXTURES.leaderboard }), { status: 200 });
            },
        });
        expect(paths).toEqual(['/api/picks/open', '/api/picks/mine', '/api/leaderboard']);
        expect(ok.state.open).toHaveLength(2);
        expect(ok.state.mine).toHaveLength(7);
        expect(ok.state.board[1].displayName).toBe('Member');

        const denied = await loadMemberPicks({
            fetch: async (url) => new Response(JSON.stringify({ ok: false, error: 'Sign in' }), {
                status: url === '/api/leaderboard' ? 401 : 200,
            }),
        });
        expect(denied.auth).toBe('signed-out');

        const guest = await loadMemberPicks({
            fetch: async () => new Response(JSON.stringify({ ok: false, error: 'Forbidden' }), { status: 403 }),
        });
        expect(guest.auth).toBe('guest');
        expect(shouldFetchPicks()).toBe(false);
        expect(shouldFetchPicks({ status: 'member', sampleSession: true })).toBe(false);
        expect(shouldFetchPicks({ status: 'member', sampleSession: false })).toBe(true);
        expect(shouldFetchPicks({ status: 'guest' })).toBe(false);
    });
});

describe('lock copy and void reasons', () => {
    const locksAt = '2026-11-21T19:30:00.000Z';
    const at = Date.parse(locksAt);

    it('switches from a clock to a countdown at 60 minutes', () => {
        const match = { lockKind: 'start', locksAtUtc: locksAt };
        expect(lockLabel(match, at - 60 * 60 * 1000, 'America/Phoenix')).toMatch(/^Locks at /);
        expect(lockLabel(match, at - 60 * 60 * 1000 + 1, 'America/Phoenix')).toBe('Locks in 60 min');
        expect(lockLabel(match, at - 42 * 60 * 1000, 'UTC')).toBe('Locks in 42 min');
        expect(lockLabel(match, at - 1, 'UTC')).toBe('Locks in 1 min');
        expect(lockLabel(match, at, 'UTC')).toBe('Locked');
        expect(lockLabel({ ...match, locked: true }, at - 3 * 60 * 60 * 1000, 'UTC')).toBe('Locked');
        expect(lockLabel({ lockKind: 'slot', locksAtUtc: locksAt }, at - 90 * 60 * 1000, 'UTC')).toMatch(/^Locks at /);
    });

    it('formats a day_start lock in Phoenix and Rome', () => {
        const match = { lockKind: 'day_start', locksAtUtc: DAY_START };
        expect(lockLabel(match, BEFORE_DAY, 'America/Phoenix')).toBe('Locks Mon 4:00 PM');
        expect(lockLabel(match, BEFORE_DAY, 'Europe/Rome')).toBe('Locks Tue 12:00 AM');
        expect(lockLabel(match, Date.parse(DAY_START) - 30 * 60 * 1000, 'America/Phoenix')).toBe('Locks Mon 4:00 PM');
    });

    it('labels every void reason and a missing one', () => {
        expect(voidReasonLabel('walkover')).toBe('Walkover');
        expect(voidReasonLabel('cancelled')).toBe('Cancelled');
        expect(voidReasonLabel('player_changed')).toBe('Player changed');
        expect(voidReasonLabel(null)).toBe('Void');
        expect(voidReasonLabel(undefined)).toBe('Void');
        expect(voidReasonLabel('')).toBe('Void');
        expect(voidReasonLabel('other')).toBe('Void');
        expect(displayNameOf('')).toBe('Member');
        expect(displayNameOf(null)).toBe('Member');
        expect(displayNameOf('  ')).toBe('Member');
        expect(meRecordLine(readMinePayload(PICKS_API_FIXTURES.mine))).toBe('1\u20131 \u00b7 1 pts');
        expect(meRecordLine([])).toBe('');
        expect(rateLimitMessage(9)).toBe('Too many changes. Try again in 9s.');
        expect(rateLimitMessage(null)).toBe('Too many changes. Try again in 60s.');
    });

    it('never uses the retired midnight sentence', () => {
        const banned = `Locks by ${'midnight'}`;
        const skip = new Set(['node_modules', '.git']);
        const files = [];
        function walkDir(dir) {
            readdirSync(dir).forEach((name) => {
                if (skip.has(name)) return;
                const full = join(dir, name);
                const stat = statSync(full);
                if (stat.isDirectory()) walkDir(full);
                else if (/\.(js|html|css|mjs|json|md)$/.test(name)) files.push(full);
            });
        }
        walkDir(fileURLToPath(root));
        expect(files.length).toBeGreaterThan(10);
        files.forEach((file) => {
            expect(readFileSync(file, 'utf8'), file).not.toContain(banned);
        });
    });
});

describe('optimistic pick, revert, and 409', () => {
    it('fills the pick, ignores a second tap, and reverts on a save error', () => {
        const tapped = reducePicks(ready([openMatch()]), { type: 'tap', matchKey: 'm1', playerKey: 'sinner' });
        expect(tapped.request).toEqual({ matchKey: 'm1', playerKey: 'sinner', generation: 1 });
        expect(tapped.state.open[0].pick).toBe('sinner');
        const again = reducePicks(tapped.state, { type: 'tap', matchKey: 'm1', playerKey: 'sinner' });
        expect(again.request).toBeNull();
        expect(again.state.open[0].pick).toBe('sinner');

        const failed = reducePicks(tapped.state, actionFromSave(tapped.request, { ok: false, status: 400, retryAfter: null }));
        expect(failed.state.open[0].pick).toBeNull();
        expect(failed.state.errors.m1).toBe(PICKS_COPY.saveError);

        const limited = reducePicks(tapped.state, actionFromSave(tapped.request, {
            ok: false,
            status: 429,
            retryAfter: '12',
        }));
        expect(limited.state.open[0].pick).toBeNull();
        expect(limited.state.errors.m1).toBe('Too many changes. Try again in 12s.');

        const signedOut = reducePicks(tapped.state, actionFromSave(tapped.request, { ok: false, status: 401 }));
        expect(signedOut.state.auth).toBe('signed-out');
        expect(signedOut.state.open[0].pick).toBeNull();
        const guest = reducePicks(tapped.state, actionFromSave(tapped.request, { ok: false, status: 403 }));
        expect(guest.state.auth).toBe('guest');
    });

    it('flips a 409 into a locked card and keeps the pick', () => {
        const tapped = reducePicks(ready([openMatch({ pick: 'alcaraz', savedPick: 'alcaraz' })]), {
            type: 'tap',
            matchKey: 'm1',
            playerKey: 'sinner',
        });
        const locked = reducePicks(tapped.state, actionFromSave(tapped.request, { ok: false, status: 409 }));
        expect(locked.state.open[0].locked).toBe(true);
        expect(locked.state.open[0].pick).toBe('sinner');
        expect(locked.state.errors.m1).toBe('That match is locked.');
        expect(lockLabel(locked.state.open[0], Date.parse('2026-11-21T12:00:00.000Z'), 'UTC')).toBe('Locked');

        const view = presentPicks(locked.state, {
            segment: 'open',
            now: Date.parse('2026-11-21T12:00:00.000Z'),
            timeZone: 'UTC',
        });
        const host = mount();
        renderPicks(host, { status: 'member', ...view });
        expect(host.textContent).toContain('Locked');
        expect(host.textContent).toContain('That match is locked.');
        expect(host.textContent).toContain('Jannik Sinner');
        const picked = walk(host).find((node) => node.getAttribute && node.getAttribute('aria-pressed') === 'true');
        expect(picked.disabled).toBe(true);
        expect(picked.getAttribute('aria-label')).toBe('Locked, Jannik Sinner');
    });

    it('renders names with textContent and aria-label attributes', () => {
        const state = ready([openMatch({
            player1Name: SCRIPT_NAME,
            player2Name: '<img src=x onerror=alert(1)>',
        })]);
        const view = presentPicks({
            ...state,
            board: readLeaderboardPayload([
                { rank: 1, displayName: SCRIPT_NAME, points: 2, graded: 2 },
            ]),
        }, { segment: 'leaders', displayName: SCRIPT_NAME, now: Date.now(), timeZone: 'UTC' });
        const host = mount();
        renderPicks(host, { status: 'member', ...view });
        expect(host.textContent).toContain(SCRIPT_NAME);
        expect(walk(host).some((node) => node.tagName === 'SCRIPT' || node.tagName === 'IMG')).toBe(false);
        const name = walk(host).find((node) => node.className === 's1-board-name');
        expect(name.textContent).toBe(SCRIPT_NAME);
        expect(name.getAttribute('aria-label')).toBeNull();

        const openView = presentPicks(state, { segment: 'open', now: Date.parse('2026-11-20T00:00:00.000Z'), timeZone: 'UTC' });
        const openHost = mount();
        renderPicks(openHost, { status: 'member', ...openView });
        const button = walk(openHost).find((node) => node.getAttribute && node.getAttribute('data-player-key') === 'sinner');
        expect(button.getAttribute('aria-label')).toBe(`Pick ${SCRIPT_NAME}`);
        expect(button.textContent).toContain(SCRIPT_NAME);
        expect(walk(openHost).some((node) => node.tagName === 'SCRIPT' || node.tagName === 'IMG')).toBe(false);
        ['shell/account.js', 'shell/picks.js', 'shell/picksClient.js', 'shell/sprint1.js'].forEach((file) => {
            expect(read(file)).not.toMatch(/innerHTML|insertAdjacentHTML|document\.write/);
        });
    });

    it('shows each mine row state from the fixture', () => {
        const view = presentPicks({
            phase: 'ready',
            open: [],
            mine: readMinePayload(PICKS_API_FIXTURES.mine),
            board: [],
            errors: {},
        }, { segment: 'mine', now: Date.now(), timeZone: 'UTC' });
        const host = mount();
        renderPicks(host, { status: 'member', ...view });
        expect(host.textContent).toContain('1\u20131');
        expect(host.textContent).toContain('1 pts');
        expect(host.textContent).toContain('Correct');
        expect(host.textContent).toContain('Wrong');
        expect(host.textContent).toContain('Pending');
        expect(host.textContent).toContain('Walkover');
        expect(host.textContent).toContain('Cancelled');
        expect(host.textContent).toContain('Player changed');
        expect(host.textContent).toContain('\u2713');
        expect(host.textContent).toContain('+1');
        expect(host.textContent).toContain('\u2717');
        const labels = view.mine.rows.map((row) => row.label);
        expect(labels).toEqual(['Correct', 'Wrong', 'Pending', 'Walkover', 'Cancelled', 'Player changed', 'Void']);
    });
});

describe('picks segment stays on back', () => {
    it('restores Leaderboard after leaving the tab', () => {
        const stack = [];
        let index = -1;
        const api = {
            getScroll: () => 0,
            setScroll() {},
            getState: () => (index >= 0 ? stack[index].state : null),
            commitScroll() {},
            pushState(state, href) {
                stack.splice(index + 1);
                stack.push({ state, href });
                index += 1;
            },
            replaceState(state, href) { stack[index] = { state, href }; },
            back() { if (index > 0) index -= 1; },
        };
        const picks = parseLocation('/picks', '');
        api.pushState({ tw: true, navDepth: 0 }, hrefFor(picks, '/picks'));
        const toBoard = planClick(picks, { kind: 'filter', patch: { board: 'leaders' } });
        expect(toBoard.method).toBe('replace');
        applyNav(api, { ...toBoard, href: hrefFor(toBoard.route, '/picks') });
        expect(stack[index].href).toBe('/picks?board=leaders');
        const toMe = planClick(parseLocation('/picks', '?board=leaders'), {
            kind: 'view',
            route: { view: 'me', fileMode: false },
        });
        applyNav(api, { ...toMe, href: hrefFor(toMe.route, '/picks') });
        expect(stack[index].href).toBe('/me');
        api.back();
        const restored = stack[index].href;
        expect(restored).toBe('/picks?board=leaders');
        expect(parseLocation('/picks', '?board=leaders').board).toBe('leaders');
        const empty = presentPicks(emptyBoardState(), { segment: 'leaders' });
        const host = mount();
        renderPicks(host, { status: 'member', ...empty });
        expect(host.textContent).toContain(PICKS_COPY.emptyBoard);
        const mine = presentPicks(emptyBoardState(), { segment: 'mine' });
        const mineHost = mount();
        renderPicks(mineHost, { status: 'member', ...mine });
        expect(mineHost.textContent).toContain(PICKS_COPY.emptyMine);
    });

    it('pins my row only when it is outside the frame', () => {
        expect(rowOffScreen(
            { top: 900, bottom: 960, height: 60 },
            { top: 80, bottom: 700, insetBottom: 56 },
        )).toBe(true);
        expect(rowOffScreen(
            { top: 120, bottom: 180, height: 60 },
            { top: 80, bottom: 700, insetBottom: 56 },
        )).toBe(false);
        const board = readLeaderboardPayload(PICKS_API_FIXTURES.leaderboard);
        const view = presentPicks({
            phase: 'ready',
            open: [],
            mine: [],
            board,
            errors: {},
        }, { segment: 'leaders', displayName: 'Ada', now: Date.now(), timeZone: 'UTC' });
        expect(view.board.rows[0].mine).toBe(true);
        expect(view.board.rows[0].accuracyLabel).toBe('80%');
        expect(view.board.rows[1].displayName).toBe('Member');
        expect(view.board.rows[1].mine).toBe(false);
    });
});

describe('service worker tw-v55', () => {
    it('never caches /api/picks or /api/leaderboard', () => {
        const sw = read('sw.js');
        expect(sw).toMatch(/CACHE_VERSION\s*=\s*'tw-v55'/);
        expect(sw).toMatch(/pathname === '\/api\/picks' \|\| pathname\.startsWith\('\/api\/picks\/'\)/);
        expect(sw).toMatch(/pathname === '\/api\/leaderboard' \|\| pathname\.startsWith\('\/api\/leaderboard\/'\)/);
        expect(sw).toMatch(/if \(isPrivateApi\(url\.pathname\)\)/);
        expect(read('sprint1.html')).toMatch(/shell\/sprint1\.js\?v=tw55/);
        expect(read('sprint1.html')).not.toMatch(/script src="https?:/);
    });
});

function fileURLToPath(url) {
    return decodeURIComponent(url.pathname);
}
