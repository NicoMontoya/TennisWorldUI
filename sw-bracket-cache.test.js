import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, it, expect } from 'vitest';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const swSrc = read('./sw.js');
const authSrc = read('./auth.js');
const sharedSrc = read('./shared.js');
const profileSrc = read('./profile.js');

const ORIGIN = 'https://tennisworld.dev';

function extractFunction(src, name) {
    const start = src.indexOf(`function ${name}(`);
    if (start < 0) throw new Error(`${name} not found`);
    let depth = 0;
    for (let i = src.indexOf('{', start); i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(start, i + 1);
        }
    }
    throw new Error(`${name} is unbalanced`);
}

function memoryStorage(initial = {}) {
    const data = { ...initial };
    return {
        getItem(key) {
            return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
        },
        setItem(key, value) { data[key] = String(value); },
        removeItem(key) { delete data[key]; },
    };
}

async function flush(times = 30) {
    for (let i = 0; i < times; i++) await Promise.resolve();
}

function loadServiceWorker() {
    const listeners = {};
    const opened = [];
    const puts = [];
    const matches = [];
    const fetchCalls = [];
    const deleted = [];
    const cacheEntries = new Map();
    let network = async () => new Response(
        JSON.stringify({ ok: true, data: { source: 'network' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

    const cache = {
        put(request, response) {
            puts.push({ url: request.url, response });
            cacheEntries.set(request.url, response);
            return Promise.resolve();
        },
        match(request) {
            const url = typeof request === 'string' ? request : request.url;
            matches.push(url);
            return Promise.resolve(cacheEntries.get(url));
        },
    };

    const caches = {
        open(name) {
            opened.push(name);
            return Promise.resolve(cache);
        },
        keys() {
            return Promise.resolve([
                'tw-v47-api',
                'tw-v47-shell',
                'tw-v46-api',
                'tw-v48-api',
                'tw-v48-shell',
                'tw-v48-other',
            ]);
        },
        delete(name) {
            deleted.push(name);
            return Promise.resolve(true);
        },
    };

    const self = {
        location: { origin: ORIGIN },
        addEventListener(type, fn) { listeners[type] = fn; },
        skipWaiting() { return Promise.resolve(); },
        clients: {
            claimed: false,
            claim() {
                this.claimed = true;
                return Promise.resolve();
            },
        },
    };

    vm.runInContext(swSrc, vm.createContext({
        self,
        caches,
        fetch(input) {
            fetchCalls.push(input);
            return network(input);
        },
        URL,
        Response,
        console,
    }));

    function handleFetch(path, { method = 'GET', mode = 'same-origin' } = {}) {
        let responded;
        listeners.fetch({
            request: { url: ORIGIN + path, method, mode },
            respondWith(promise) { responded = promise; },
        });
        return responded;
    }

    return {
        listeners,
        opened,
        puts,
        matches,
        fetchCalls,
        deleted,
        self,
        handleFetch,
        seed(url, response) { cacheEntries.set(url, response); },
        setNetwork(fn) { network = fn; },
    };
}

function loadClearSwApiCache(caches) {
    const context = vm.createContext({ caches, Promise, console });
    vm.runInContext(extractFunction(sharedSrc, 'clearSwApiCache'), context);
    return context.clearSwApiCache;
}

function pageDocument(listeners) {
    return {
        addEventListener(type, fn) {
            (listeners[type] ||= []).push(fn);
        },
        removeEventListener() {},
        dispatchEvent() { return true; },
        querySelector() { return null; },
        getElementById() { return null; },
        createElement() { return null; },
    };
}

function loadAuth({ caches, apiFetch, storage }) {
    const listeners = {};
    const context = vm.createContext({
        document: pageDocument(listeners),
        localStorage: storage,
        caches,
        apiFetch,
        window: {},
        CustomEvent,
        Promise,
        console,
    });
    vm.runInContext(extractFunction(sharedSrc, 'clearSwApiCache'), context);
    vm.runInContext(authSrc, context);
    return { context, listeners, auth: context.window.TW.auth };
}

function stubEl() {
    return {
        style: {},
        textContent: '',
        value: '',
        className: '',
        dataset: {},
        innerHTML: '',
        disabled: false,
        addEventListener() {},
        setAttribute() {},
        appendChild() {},
        replaceChildren() {},
        prepend() {},
        remove() {},
        focus() {},
        reset() {},
    };
}

function loadProfile({ caches, apiFetch, storage }) {
    const listeners = {};
    const context = vm.createContext({
        document: {
            addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
            removeEventListener() {},
            getElementById() { return stubEl(); },
            createElement() { return stubEl(); },
            querySelector() { return null; },
        },
        localStorage: storage,
        caches,
        apiFetch,
        window: { location: { href: '' } },
        Promise,
        console,
    });
    vm.runInContext(extractFunction(sharedSrc, 'clearSwApiCache'), context);
    vm.runInContext(profileSrc, context);
    return { listeners };
}

const BRACKET_PATHS = [
    '/api/bracket/mine',
    '/api/bracket/save',
    '/api/bracket/leaders?tour=ATP',
    '/api/bracket/public?tour=ATP&season=2026',
    '/api/bracket/future-route',
];

describe('service worker bracket bypass', () => {
    it('never reads or writes /api/bracket/ (or auth/favorites) through any cache', async () => {
        const sw = loadServiceWorker();
        const previous = new Response('{"ok":true,"data":{"brackets":[{"owner":"previous"}]}}', { status: 200 });
        sw.setNetwork(async () => new Response('unauthorized', { status: 401 }));
        for (const path of BRACKET_PATHS) {
            sw.seed(ORIGIN + path, previous.clone());
            expect(sw.handleFetch(path)).toBeUndefined();
            expect(sw.handleFetch(path, { method: 'POST' })).toBeUndefined();
        }
        expect(sw.handleFetch('/api/auth/me')).toBeUndefined();
        expect(sw.handleFetch('/api/favorites')).toBeUndefined();
        expect(sw.handleFetch('/api/favorites/toggle')).toBeUndefined();
        expect(sw.opened).toEqual([]);
        expect(sw.puts).toEqual([]);
        expect(sw.matches).toEqual([]);
        expect(sw.fetchCalls).toEqual([]);
    });

    it('does not replay a cached /api/bracket/mine when a later request would 401', () => {
        const sw = loadServiceWorker();
        sw.seed(
            ORIGIN + '/api/bracket/mine',
            new Response('{"ok":true,"data":{"brackets":[{"owner":"previous"}]}}', { status: 200 }),
        );
        sw.setNetwork(async () => new Response('unauthorized', { status: 401 }));
        expect(sw.handleFetch('/api/bracket/mine')).toBeUndefined();
        expect(sw.matches).toEqual([]);
    });

    it('still network-first caches other public API GETs in tw-v48-api', async () => {
        const paths = [
            '/api/hub?tour=ATP',
            '/api/livescore?tour=ATP',
            '/api/calendar?tour=ATP',
            '/api/standings?tour=ATP',
            '/api/draws?tournamentKey=1&season=2026',
        ];
        for (const path of paths) {
            const sw = loadServiceWorker();
            const responded = sw.handleFetch(path);
            expect(typeof responded?.then).toBe('function');
            const res = await responded;
            expect(res.status).toBe(200);
            expect(await res.json()).toEqual({ ok: true, data: { source: 'network' } });
            expect(sw.opened).toEqual(['tw-v48-api']);
            expect(sw.puts.map((put) => put.url)).toEqual([ORIGIN + path]);
            expect(sw.fetchCalls).toHaveLength(1);
        }
    });

    it('still falls back to the API cache for a public GET when the network 401s', async () => {
        const sw = loadServiceWorker();
        const cachedBody = '{"ok":true,"data":{"from":"cache"}}';
        sw.seed(ORIGIN + '/api/hub?tour=ATP', new Response(cachedBody, {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));
        sw.setNetwork(async () => new Response('denied', { status: 401 }));
        const res = await sw.handleFetch('/api/hub?tour=ATP');
        expect(await res.text()).toBe(cachedBody);
        expect(sw.opened).toEqual(['tw-v48-api']);
        expect(sw.puts).toEqual([]);
        expect(sw.matches).toEqual([ORIGIN + '/api/hub?tour=ATP']);
    });

    it('activate deletes old API caches and keeps tw-v48 shell and api', async () => {
        expect(swSrc).toMatch(/CACHE_VERSION\s*=\s*'tw-v48'/);
        const sw = loadServiceWorker();
        let waited;
        sw.listeners.activate({
            waitUntil(promise) { waited = promise; },
        });
        await waited;
        expect(sw.deleted).toEqual([
            'tw-v47-api',
            'tw-v47-shell',
            'tw-v46-api',
            'tw-v48-other',
        ]);
        expect(sw.self.clients.claimed).toBe(true);
    });
});

describe('clearSwApiCache', () => {
    it('deletes every *-api cache and leaves the shell cache', async () => {
        const deleted = [];
        const clear = loadClearSwApiCache({
            keys: () => Promise.resolve(['tw-v46-api', 'tw-v47-api', 'tw-v48-api', 'tw-v48-shell', 'notes']),
            delete(name) {
                deleted.push(name);
                return Promise.resolve(true);
            },
        });
        await clear();
        expect(deleted).toEqual(['tw-v46-api', 'tw-v47-api', 'tw-v48-api']);
    });

    it('resolves when Cache Storage is missing', async () => {
        const context = vm.createContext({ Promise, console });
        vm.runInContext(extractFunction(sharedSrc, 'clearSwApiCache'), context);
        await expect(context.clearSwApiCache()).resolves.toBeUndefined();
    });

    it('resolves when caches.keys throws or rejects', async () => {
        const throwing = loadClearSwApiCache({
            keys() { throw new Error('SecurityError'); },
            delete() { throw new Error('should not delete'); },
        });
        const rejecting = loadClearSwApiCache({
            keys: () => Promise.reject(new Error('QuotaExceededError')),
            delete() { throw new Error('should not delete'); },
        });
        await expect(throwing()).resolves.toBeUndefined();
        await expect(rejecting()).resolves.toBeUndefined();
    });

    it('keeps deleting the remaining API caches when one delete rejects', async () => {
        const deleted = [];
        const clear = loadClearSwApiCache({
            keys: () => Promise.resolve(['tw-v47-api', 'tw-v48-api']),
            delete(name) {
                deleted.push(name);
                if (name === 'tw-v47-api') return Promise.reject(new Error('nope'));
                return Promise.resolve(true);
            },
        });
        await expect(clear()).resolves.toBeDefined();
        expect(deleted).toEqual(['tw-v47-api', 'tw-v48-api']);
    });
});

describe('sign-out clears the API cache', () => {
    it('TW.auth.signOut drops the session and awaits API-cache deletion', async () => {
        const deleted = [];
        let releaseDelete;
        const gate = new Promise((resolve) => { releaseDelete = resolve; });
        const storage = memoryStorage({
            'tw-auth-token': 'secret-token',
            'tw-auth-user': JSON.stringify({ firstName: 'Ada', lastName: 'Lovelace' }),
        });
        const { auth } = loadAuth({
            storage,
            apiFetch: () => Promise.reject(new Error('offline')),
            caches: {
                keys: () => Promise.resolve(['tw-v48-api', 'tw-v47-api', 'tw-v48-shell']),
                delete(name) {
                    deleted.push(name);
                    return gate.then(() => true);
                },
            },
        });

        let settled = false;
        const pending = auth.signOut().then(() => { settled = true; });
        await flush();
        expect(settled).toBe(false);
        expect(storage.getItem('tw-auth-token')).toBeNull();
        expect(storage.getItem('tw-auth-user')).toBeNull();
        expect(deleted).toEqual(['tw-v48-api', 'tw-v47-api']);

        releaseDelete();
        await pending;
        expect(settled).toBe(true);
    });

    it('still signs out when cache cleanup throws', async () => {
        const storage = memoryStorage({
            'tw-auth-token': 'secret-token',
            'tw-auth-user': '{}',
        });
        const { auth, context } = loadAuth({
            storage,
            apiFetch: () => Promise.resolve({}),
            caches: {
                keys: () => Promise.resolve([]),
                delete: () => Promise.resolve(true),
            },
        });
        context.clearSwApiCache = () => { throw new Error('SecurityError'); };
        await expect(auth.signOut()).resolves.toBeUndefined();
        expect(storage.getItem('tw-auth-token')).toBeNull();
        expect(storage.getItem('tw-auth-user')).toBeNull();
    });

    it('clears the API cache when /api/auth/me fails and auth.js drops the token', async () => {
        const deleted = [];
        const storage = memoryStorage({
            'tw-auth-token': 'secret-token',
            'tw-auth-user': JSON.stringify({ firstName: 'Ada', lastName: 'Lovelace' }),
        });
        const { listeners } = loadAuth({
            storage,
            apiFetch: () => Promise.reject(new Error('HTTP 401')),
            caches: {
                keys: () => Promise.resolve(['tw-v48-api', 'tw-v48-shell']),
                delete(name) {
                    deleted.push(name);
                    return Promise.resolve(true);
                },
            },
        });

        for (const fn of listeners.DOMContentLoaded) fn();
        await flush();
        expect(storage.getItem('tw-auth-token')).toBeNull();
        expect(storage.getItem('tw-auth-user')).toBeNull();
        expect(deleted).toEqual(['tw-v48-api']);
    });

    it('clears the API cache when profile.js drops the token after /api/auth/me fails', async () => {
        const deleted = [];
        const storage = memoryStorage({
            'tw-auth-token': 'secret-token',
            'tw-auth-user': JSON.stringify({
                firstName: 'Ada',
                lastName: 'Lovelace',
                email: 'ada@example.com',
                favorites: [],
            }),
        });
        const { listeners } = loadProfile({
            storage,
            apiFetch: () => Promise.reject(new Error('HTTP 401')),
            caches: {
                keys: () => Promise.resolve(['tw-v48-api', 'tw-v47-api', 'tw-v48-shell']),
                delete(name) {
                    deleted.push(name);
                    return Promise.resolve(true);
                },
            },
        });

        for (const fn of listeners.DOMContentLoaded) fn();
        await flush();
        expect(storage.getItem('tw-auth-token')).toBeNull();
        expect(storage.getItem('tw-auth-user')).toBeNull();
        expect(deleted).toEqual(['tw-v48-api', 'tw-v47-api']);
    });
});
