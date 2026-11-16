import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderMe, renderPicks } from './shell/account.js';
import { GATE_COPY, guestLine } from './shell/viewModel.js';
import {
    COOLDOWN_SECONDS,
    NETWORK_ERROR,
    clearLegacyAuthKeys,
    hintedStatus,
    loadViewer,
    loginAccount,
    registerAccount,
    shouldFetchPicks,
} from './shell/session.js';

const root = new URL('./', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, root), 'utf8');

const SCRIPT_NAME = '<script>alert(1)</script>';
const INVITE_ERROR = "That invite didn't work. Check the code or ask Nico for a new one.";
const RATE_ERROR = 'Too many attempts. Try again in a few minutes.';

function memoryStorage(initial = {}) {
    const data = { ...initial };
    return {
        data,
        getItem(key) {
            return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
        },
        setItem(key, value) { data[key] = String(value); },
        removeItem(key) { delete data[key]; },
    };
}

function jsonResponse(status, body) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function createElement(tag) {
    const node = {
        tagName: String(tag).toUpperCase(),
        className: '',
        children: [],
        attrs: {},
        listeners: {},
        disabled: false,
        value: '',
        type: '',
        id: '',
        htmlFor: '',
        maxLength: 0,
        autocomplete: '',
        noValidate: false,
        appendChild(child) {
            this.children.push(child);
            return child;
        },
        setAttribute(name, value) { this.attrs[name] = String(value); },
        getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; },
        addEventListener(type, fn) {
            (this.listeners[type] ||= []).push(fn);
        },
        set textContent(value) {
            const text = value == null ? '' : String(value);
            this.children = [{ tagName: '#text', textContent: text, children: [] }];
        },
        get textContent() {
            return this.children.map((child) => child.textContent || '').join('');
        },
        set innerHTML(_value) {
            throw new Error('innerHTML');
        },
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

function buttons(host) {
    return walk(host).filter((node) => node.tagName === 'BUTTON');
}

describe('invite gate copy and states', () => {
    it('renders a script display name as text', () => {
        const host = mount();
        renderMe(host, {
            status: 'member',
            displayName: SCRIPT_NAME,
            follows: [{ name: SCRIPT_NAME }],
        });
        expect(host.textContent).toContain(SCRIPT_NAME);
        expect(host.textContent).toContain('Pick record coming soon');
        expect(walk(host).some((node) => node.tagName === 'SCRIPT')).toBe(false);

        const guest = mount();
        renderMe(guest, { status: 'guest', displayName: SCRIPT_NAME });
        expect(guest.textContent).toContain(guestLine(SCRIPT_NAME));
        expect(guest.textContent).toContain(SCRIPT_NAME);
        expect(walk(guest).some((node) => node.tagName === 'SCRIPT')).toBe(false);
    });

    it('renders each Me state', () => {
        const signedOut = mount();
        renderMe(signedOut, { status: 'signed-out', tab: 'invite' });
        expect(signedOut.textContent).toContain('Me');
        expect(signedOut.textContent).toContain('I have an invite');
        expect(signedOut.textContent).toContain('Join TennisWorld');
        expect(signedOut.textContent).toContain('TennisWorld is invite-only for now.');
        expect(signedOut.textContent).toContain('First name');
        expect(signedOut.textContent).toContain('Email');
        expect(signedOut.textContent).toContain('Password');
        expect(signedOut.textContent).toContain('Invite code');
        const inviteTab = buttons(signedOut).find((node) => node.textContent === 'I have an invite');
        expect(inviteTab.getAttribute('aria-selected')).toBe('true');

        const signing = mount();
        renderMe(signing, { status: 'signed-out', tab: 'signin' });
        expect(signing.textContent).toContain('Sign in');
        expect(signing.textContent).not.toContain('Join TennisWorld');
        expect(buttons(signing).some((node) => node.textContent === 'Sign in' && node.type === 'submit')).toBe(true);

        const guest = mount();
        renderMe(guest, { status: 'guest', displayName: 'Nico' });
        expect(guest.textContent).toContain("You're signed in as Nico. Picks and the leaderboard are invite-only.");
        expect(guest.textContent).toContain('Redeem invite');
        expect(guest.textContent).not.toContain('nico@example.com');

        const member = mount();
        renderMe(member, {
            status: 'member',
            displayName: 'Nico',
            follows: [{ name: 'Ada Sample' }],
            editing: true,
            draft: 'Nico',
        });
        expect(member.textContent).toContain('4/24');
        expect(member.textContent).toContain('Followed players');
        expect(member.textContent).toContain('Ada Sample');
        expect(member.textContent).toContain(GATE_COPY.record);
        expect(member.textContent).toContain('Sign out');
    });

    it('shows the server message, a 60s countdown, and a disabled spinner', () => {
        const errored = mount();
        renderMe(errored, { status: 'signed-out', tab: 'invite', error: INVITE_ERROR });
        const alert = walk(errored).find((node) => node.className === 's1-error');
        expect(alert.textContent).toBe(INVITE_ERROR);

        const limited = mount();
        renderMe(limited, { status: 'guest', displayName: 'Nico', error: RATE_ERROR, cooldown: 60 });
        expect(limited.textContent).toContain(RATE_ERROR);
        expect(limited.textContent).toContain('Try again in 60s');
        const redeem = buttons(limited).find((node) => node.textContent.includes('Redeem invite'));
        expect(redeem.disabled).toBe(true);

        const busy = mount();
        renderMe(busy, { status: 'signed-out', tab: 'signin', submitting: true });
        const submit = buttons(busy).find((node) => node.type === 'submit');
        expect(submit.disabled).toBe(true);
        expect(walk(busy).some((node) => node.className === 's1-spinner')).toBe(true);
    });

    it('renders each Picks state and does not fetch picks', () => {
        const calls = [];
        globalThis.fetch = (...args) => {
            calls.push(args[0]);
            throw new Error('no fetch');
        };
        const closed = mount();
        renderPicks(closed, { status: 'signed-out' });
        expect(closed.textContent).toContain('Pick winners with friends and family. Invite-only.');
        expect(closed.textContent).toContain('Have an invite?');
        const link = walk(closed).find((node) => node.tagName === 'A');
        expect(link.getAttribute('href') || link.href).toBe('/me');
        expect(closed.textContent).not.toContain('Picks open soon');

        const guest = mount();
        renderPicks(guest, { status: 'guest' });
        expect(guest.textContent).toContain('Have an invite?');

        const member = mount();
        renderPicks(member, { status: 'member' });
        expect(member.textContent).toContain('Picks open soon');
        expect(member.textContent).not.toContain('Have an invite?');
        const soon = buttons(member)[0];
        expect(soon.disabled).toBe(true);
        expect(calls).toEqual([]);
        expect(shouldFetchPicks()).toBe(false);
        ['shell/account.js', 'shell/session.js', 'shell/sprint1.js'].forEach((file) => {
            expect(read(file)).not.toMatch(/\/api\/picks/);
        });
    });
});

describe('cookie session, no stored token', () => {
    it('does not keep a token after login and sends the cookie contract', async () => {
        const storage = memoryStorage({
            'tw-auth-token': 'secret-token',
            'tw-auth-user': '{"email":"ada@example.com"}',
        });
        const calls = [];
        const result = await loginAccount(
            { email: 'ada@example.com', password: 'correct horse' },
            {
                storage,
                fetch: async (url, opts) => {
                    calls.push({ url, opts });
                    return jsonResponse(200, {
                        ok: true,
                        data: {
                            token: 'secret-token',
                            user: { displayName: SCRIPT_NAME, member: true, email: 'ada@example.com' },
                        },
                    });
                },
            },
        );
        expect(result.ok).toBe(true);
        expect(result.user.displayName).toBe(SCRIPT_NAME);
        expect(storage.getItem('tw-auth-token')).toBeNull();
        expect(storage.getItem('tw-auth-user')).toBeNull();
        expect(JSON.stringify(storage.data)).not.toContain('secret-token');
        expect(storage.getItem('tw-member-hint')).toBe('1');
        expect(Object.keys(storage.data)).toEqual(['tw-member-hint']);
        expect(calls[0].url).toBe('/api/auth/login');
        expect(calls[0].opts.credentials).toBe('same-origin');
        expect(calls[0].opts.headers['Content-Type']).toBe('application/json');
        expect(calls[0].opts.headers.Authorization).toBeUndefined();
        expect(JSON.parse(calls[0].opts.body)).toEqual({
            email: 'ada@example.com',
            password: 'correct horse',
        });
    });

    it('registers with an invite code and shows the generic error and 429 countdown', async () => {
        const storage = memoryStorage();
        const bad = await registerAccount(
            { inviteCode: 'nope', firstName: 'Ada', email: 'ada@example.com', password: 'secret' },
            {
                storage,
                fetch: async (_url, opts) => {
                    expect(JSON.parse(opts.body).inviteCode).toBe('nope');
                    expect(opts.credentials).toBe('same-origin');
                    expect(opts.headers['Content-Type']).toBe('application/json');
                    return jsonResponse(400, { ok: false, error: INVITE_ERROR });
                },
            },
        );
        expect(bad.status).toBe(400);
        expect(bad.error).toBe(INVITE_ERROR);
        expect(bad.cooldown).toBe(0);

        const limited = await loginAccount(
            { email: 'ada@example.com', password: 'secret' },
            {
                storage,
                fetch: async () => jsonResponse(429, { ok: false, error: RATE_ERROR }),
            },
        );
        expect(limited.status).toBe(429);
        expect(limited.error).toBe(RATE_ERROR);
        expect(limited.cooldown).toBe(COOLDOWN_SECONDS);
        expect(COOLDOWN_SECONDS).toBe(60);
    });

    it('uses the network sentence when fetch fails, and the server answer replaces the hint', async () => {
        const storage = memoryStorage({ 'tw-member-hint': '1' });
        expect(hintedStatus(storage)).toBe('member');
        const offline = await loadViewer({
            storage,
            fetch: async () => { throw new Error('offline'); },
        });
        expect(offline.status).toBe('offline');
        expect(offline.error).toBe(NETWORK_ERROR);

        const guest = await loadViewer({
            storage,
            fetch: async (url, opts) => {
                expect(url).toBe('/api/auth/me');
                expect(opts.credentials).toBe('same-origin');
                expect(opts.headers['Content-Type']).toBe('application/json');
                return jsonResponse(200, {
                    ok: true,
                    data: {
                        member: false,
                        displayName: 'Nico',
                        email: 'nico@example.com',
                        favorites: [{ name: 'Ada', email: 'ada@example.com' }],
                    },
                });
            },
        });
        expect(guest.status).toBe('guest');
        expect(guest.displayName).toBe('Nico');
        expect(guest.follows).toEqual([]);
        expect(storage.getItem('tw-member-hint')).toBe('0');
        expect(JSON.stringify(storage.data)).not.toContain('nico@example.com');
        clearLegacyAuthKeys(storage);
        expect(storage.getItem('tw-auth-token')).toBeNull();
    });
});

describe('legacy sign-in is gone and pages are noindex', () => {
    const pages = readdirSync(root).filter((name) => name.endsWith('.html'));

    it('removes auth.js and the sign-in modal', () => {
        expect(existsSync(new URL('./auth.js', root))).toBe(false);
        expect(pages.length).toBeGreaterThan(0);
        for (const name of pages) {
            const html = read(name);
            expect(html, name).not.toMatch(/auth\.js/);
            expect(html, name).not.toMatch(/authModal|tw-auth-token|Create Account/);
            expect(html, name).toMatch(/<meta name="robots" content="noindex,nofollow">/);
            expect(html, name).toMatch(/href="\/me"/);
        }
        expect(read('shell/sprint1.js')).not.toMatch(/openModal|authModal/);
        expect(read('shell/account.js')).not.toMatch(/innerHTML|insertAdjacentHTML/);
        expect(read('shell/session.js')).not.toMatch(/setItem\(\s*['"]tw-auth-/);
    });

    it('bumps the service worker to tw-v53 and skips private API caches', () => {
        const sw = read('sw.js');
        expect(sw).toMatch(/CACHE_VERSION\s*=\s*'tw-v53'/);
        expect(sw).toMatch(/\/api\/picks/);
        expect(sw).toMatch(/\/api\/leaderboard/);
        expect(sw).toMatch(/\/api\/me/);
        expect(read('robots.txt')).toMatch(/Disallow:\s*\//);
    });
});
