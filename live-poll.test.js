import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, it, expect } from 'vitest';

const liveSrc = readFileSync(new URL('./live.js', import.meta.url), 'utf8');

function loadLiveEngine(initialRows = []) {
    const timers = [];
    let nextId = 1;
    let rows = initialRows;
    const calls = [];
    const events = [];
    const documentListeners = {};
    const document = {
        hidden: false,
        addEventListener(type, fn) { documentListeners[type] = fn; },
    };
    const context = {
        document,
        window: {
            dispatchEvent(ev) {
                events.push({ type: ev.type, detail: ev.detail });
            },
        },
        setTimeout(fn, ms) {
            const id = nextId++;
            timers.push({ id, fn, ms, cleared: false });
            return id;
        },
        clearTimeout(id) {
            const timer = timers.find(t => t.id === id);
            if (timer) timer.cleared = true;
        },
        apiFetch(url) {
            calls.push(url);
            return Promise.resolve(rows);
        },
        console,
        URL,
        CustomEvent: class CustomEvent {
            constructor(type, init) {
                this.type = type;
                this.detail = init && init.detail;
            }
        },
    };
    context.globalThis = context;
    vm.runInContext(liveSrc + '\nglobalThis.LiveEngine = LiveEngine;', vm.createContext(context));

    function pending() {
        return timers.filter(t => !t.cleared);
    }

    async function flush() {
        for (let i = 0; i < 20; i++) await Promise.resolve();
    }

    async function fireNext() {
        const timer = pending()[0];
        expect(timer).toBeTruthy();
        timer.cleared = true;
        timer.fn();
        await flush();
    }

    return {
        engine: context.LiveEngine,
        calls,
        events,
        pending,
        fireNext,
        flush,
        setRows(next) { rows = next; },
        document,
        documentListeners,
        async boot() {
            documentListeners.DOMContentLoaded();
            await flush();
        },
    };
}

describe('LiveEngine livescore polling', () => {
    it('polls every 30s while a match is live and pauses while the tab is hidden', async () => {
        const live = loadLiveEngine([{ isLive: true, matchKey: 'm1' }]);
        await live.boot();
        expect(live.calls).toEqual(['/api/livescore?tour=ATP']);
        expect(live.engine.lastResponseHadLive()).toBe(true);
        expect(live.pending().map(t => t.ms)).toEqual([30_000]);

        await live.fireNext();
        expect(live.calls).toHaveLength(2);
        expect(live.pending().map(t => t.ms)).toEqual([30_000]);

        const pendingTick = live.pending()[0];
        live.document.hidden = true;
        live.documentListeners.visibilitychange();
        expect(pendingTick.cleared).toBe(true);
        expect(live.pending()).toEqual([]);
        expect(live.calls).toHaveLength(2);

        live.document.hidden = false;
        live.documentListeners.visibilitychange();
        await live.flush();
        expect(live.calls).toHaveLength(3);
        expect(live.pending()).toHaveLength(1);
        expect(live.pending()[0]).not.toBe(pendingTick);
        expect(live.pending().map(t => t.ms)).toEqual([30_000]);
    });

    it('fetches immediately when a visible tab still had time left on the 30s tick', async () => {
        const live = loadLiveEngine([{ isLive: true, matchKey: 'm1' }]);
        await live.boot();
        const leftover = live.pending()[0];
        expect(leftover.ms).toBe(30_000);

        live.document.hidden = true;
        live.documentListeners.visibilitychange();
        live.document.hidden = false;
        live.documentListeners.visibilitychange();
        await live.flush();

        expect(leftover.cleared).toBe(true);
        expect(live.calls).toHaveLength(2);
        expect(live.pending().map(t => t.ms)).toEqual([30_000]);
    });

    it('stamps updatedAt on every successful fetch, including an unchanged payload', async () => {
        const live = loadLiveEngine([{ isLive: true, matchKey: 'm1' }]);
        await live.boot();
        await live.fireNext();

        const updates = live.events.filter(e => e.type === 'tw:live-update');
        const statuses = live.events.filter(e => e.type === 'tw:live-status' && e.detail.updatedAt);
        expect(updates).toHaveLength(1);
        expect(statuses).toHaveLength(2);
        expect(statuses.every(e => typeof e.detail.updatedAt === 'string' && e.detail.updatedAt)).toBe(true);
        expect(live.events.some(e => e.type === 'tw:live-status' && e.detail.status === 'disconnected')).toBe(false);
    });

    it('stops after 4 empty polls and does not schedule another', async () => {
        const live = loadLiveEngine([]);
        await live.boot();
        expect(live.engine.lastResponseHadLive()).toBe(false);
        expect(live.pending()).toHaveLength(1);

        await live.fireNext();
        await live.fireNext();
        await live.fireNext();

        expect(live.calls).toHaveLength(4);
        expect(live.pending()).toEqual([]);
        expect(live.engine.lastResponseHadLive()).toBe(false);
        expect(live.engine.getLastMatches()).toEqual([]);
    });

    it('does not poll on a hidden tab', async () => {
        const live = loadLiveEngine([{ isLive: true }]);
        live.document.hidden = true;
        await live.boot();
        expect(live.calls).toEqual([]);
        expect(live.pending()).toEqual([]);
    });
});
