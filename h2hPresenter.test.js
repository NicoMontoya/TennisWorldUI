import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';

const presenterSrc = readFileSync(new URL('./components/H2HPresenter.js', import.meta.url), 'utf8');
const h2hSrc = readFileSync(new URL('./h2h.js', import.meta.url), 'utf8');
const playerSrc = readFileSync(new URL('./player.js', import.meta.url), 'utf8');
const playerHtml = readFileSync(new URL('./player.html', import.meta.url), 'utf8');
const analyticsHtml = readFileSync(new URL('./analytics.html', import.meta.url), 'utf8');
const scoresHtml = readFileSync(new URL('./scores.html', import.meta.url), 'utf8');
const scoresSrc = readFileSync(new URL('./scores.js', import.meta.url), 'utf8');
const swSrc = readFileSync(new URL('./sw.js', import.meta.url), 'utf8');

function formatSetScores(setScores) {
    if (!setScores || !setScores.length) return '';
    return setScores.map(s => {
        if (s == null) return '–';
        if (typeof s === 'string') return s;
        const base = `${s.p1}-${s.p2}`;
        if (s.tiebreak) return `${base}(${Math.min(s.tiebreak.p1, s.tiebreak.p2)})`;
        return base;
    }).join(' ');
}

function createNode(tag) {
    const node = {
        tagName: String(tag).toUpperCase(),
        className: '',
        id: '',
        hidden: false,
        textContent: '',
        href: '',
        title: '',
        type: '',
        style: {},
        dataset: {},
        attrs: {},
        children: [],
        parent: null,
        listeners: {},
        setAttribute(k, v) {
            this.attrs[k] = v;
            if (k === 'id') this.id = v;
        },
        getAttribute(k) { return this.attrs[k]; },
        appendChild(c) {
            if (typeof c === 'string') c = { textContent: c, children: [], className: '' };
            c.parent = this;
            this.children.push(c);
            return c;
        },
        replaceChildren(...c) {
            this.children.forEach(ch => { ch.parent = null; });
            this.children = c;
            c.forEach(ch => { ch.parent = this; });
        },
        addEventListener(type, fn) {
            this.listeners[type] = this.listeners[type] || [];
            this.listeners[type].push(fn);
        },
        querySelector(sel) {
            return find(this, sel, true);
        },
        querySelectorAll(sel) {
            const out = [];
            walk(this, n => { if (matches(n, sel)) out.push(n); });
            return out;
        },
        closest(sel) {
            let cur = this;
            while (cur) {
                if (matches(cur, sel)) return cur;
                cur = cur.parent;
            }
            return null;
        },
        click() {
            (this.listeners.click || []).forEach(fn => fn({ target: this }));
        },
    };
    return node;
}

function matches(n, sel) {
    if (!n || !n.tagName) return false;
    if (sel.startsWith('#')) return n.id === sel.slice(1) || n.attrs.id === sel.slice(1);
    if (sel.startsWith('.')) {
        return String(n.className || '').split(/\s+/).includes(sel.slice(1));
    }
    return false;
}

function walk(n, visit) {
    (n.children || []).forEach(child => {
        visit(child);
        walk(child, visit);
    });
}

function find(root, sel, first) {
    let hit = null;
    walk(root, n => {
        if (hit && first) return;
        if (matches(n, sel)) hit = hit || n;
    });
    return hit;
}

function flattenText(n) {
    if (!n) return '';
    const own = n.textContent || '';
    const kids = (n.children || []).map(flattenText).join('');
    return own + kids;
}

function loadPresenter(rivalryMount) {
    const documentMock = {
        createElement: createNode,
        createTextNode(t) { return { textContent: t, children: [] }; },
        addEventListener() {},
        getElementById() { return null; },
    };
    const rivalry = {
        mount: rivalryMount || vi.fn(() => true),
    };
    const fn = new Function(
        'window',
        'globalThis',
        'module',
        'document',
        'formatSetScores',
        'flag',
        'parseTour',
        'URLSearchParams',
        presenterSrc + '; return module.exports;'
    );
    const g = { TW: { RivalryArc: rivalry }, document: documentMock };
    const api = fn(g, g, { exports: {} }, documentMock, formatSetScores, (c) => c || '', (t) => {
        const x = String(t || '').toUpperCase();
        return x === 'ATP' || x === 'WTA' ? x : null;
    }, URLSearchParams);
    return { api, rivalry, documentMock };
}

function meeting(overrides) {
    return {
        status: 'Finished',
        date: '2024-01-01',
        winner: 'First Player',
        player1Key: '47275',
        player2Key: '33648',
        player1Name: 'Jannik Sinner',
        player2Name: 'Carlos Alcaraz',
        surface: 'hard',
        tournamentName: 'Australian Open',
        tournamentKey: '580',
        round: 'Final',
        setScores: [{ p1: 6, p2: 3 }, { p1: 6, p2: 4 }],
        finalResult: '6-3 6-4',
        ...overrides,
    };
}

const p1 = { playerKey: '47275', name: 'Jannik Sinner', country: 'Italy', tour: 'ATP' };
const p2 = { playerKey: '33648', name: 'Carlos Alcaraz', country: 'Spain', tour: 'ATP' };

describe('H2HPresenter source contracts', () => {
    it('exposes mount(host, { data, player1, player2 }) and never uses innerHTML', () => {
        expect(presenterSrc).toMatch(/function mount\(host, opts\)/);
        expect(presenterSrc).toMatch(/TW\.H2HPresenter/);
        expect(presenterSrc).toMatch(/id = 'h2hRivalryArc'|id = "h2hRivalryArc"/);
        expect(presenterSrc).toMatch(/TW\.RivalryArc\.mount/);
        expect(presenterSrc).toMatch(/formatSetScores/);
        expect(presenterSrc).toMatch(/createElement/);
        expect(presenterSrc).toMatch(/textContent/);
        expect(presenterSrc).not.toMatch(/\.innerHTML\s*=/);
        expect(presenterSrc).not.toMatch(/insertAdjacentHTML/);
        expect(presenterSrc).not.toMatch(/cdn\.jsdelivr/);
        expect(presenterSrc).not.toMatch(/slice\(0,\s*10\)/);
    });

    it('hides RivalryArc when fewer than two meetings', () => {
        expect(presenterSrc).toMatch(/finished\.length < 2/);
    });
});

describe('shared wiring', () => {
    it('Profile and Analytics call the same presenter and /api/h2h', () => {
        expect(h2hSrc).toMatch(/TW\.H2HPresenter/);
        expect(h2hSrc).toMatch(/\/api\/h2h\?playerKeyA=\$\{encodeURIComponent\(a\)\}&playerKeyB=\$\{encodeURIComponent\(b\)\}/);
        expect(playerSrc).toMatch(/TW\.H2HPresenter/);
        expect(playerSrc).toMatch(/\/api\/h2h\?playerKeyA=\$\{encodeURIComponent\(a\)\}&playerKeyB=\$\{encodeURIComponent\(b\)\}/);
        expect(playerSrc).not.toMatch(/slice\(0,\s*10\)/);
        expect(playerHtml).toMatch(/components\/H2HPresenter\.js/);
        expect(playerHtml).toMatch(/components\/RivalryArc\.js/);
        expect(analyticsHtml).toMatch(/components\/H2HPresenter\.js/);
        expect(analyticsHtml).toMatch(/h2h\.js/);
    });

    it('keeps autocomplete XSS-safe on both dropdowns', () => {
        expect(h2hSrc).toMatch(/createElement/);
        expect(h2hSrc).toMatch(/textContent/);
        expect(h2hSrc).toMatch(/dataset\.key/);
        expect(h2hSrc).not.toMatch(/\.innerHTML\s*=/);
        expect(playerSrc).toMatch(/h2hEl\('li', 'h2h-dropdown-item'\)/);
        expect(playerSrc).toMatch(/dataset\.key/);
        expect(playerSrc).not.toMatch(/dropdown\.innerHTML/);
    });

    it('Scores does not load H2HPresenter or RivalryArc', () => {
        expect(scoresHtml).not.toMatch(/H2HPresenter/);
        expect(scoresHtml).not.toMatch(/RivalryArc/);
        expect(scoresSrc).not.toMatch(/TW\.H2HPresenter/);
        expect(scoresSrc).not.toMatch(/TW\.RivalryArc/);
    });
});

describe('mount layout + record', () => {
    it('renders header record, rivalry slot, surface tabs, and full history', () => {
        const { api, rivalry } = loadPresenter();
        const host = createNode('div');
        const meetings = [
            meeting({ date: '2024-01-01', winner: 'First Player', surface: 'hard' }),
            meeting({ date: '2024-06-01', winner: 'Second Player', surface: 'clay', setScores: [{ p1: 3, p2: 6 }, { p1: 4, p2: 6 }] }),
            meeting({ date: '2025-01-01', winner: 'First Player', surface: 'hard' }),
        ];
        api.mount(host, { data: { h2hMatches: meetings }, player1: p1, player2: p2 });

        const header = find(host, '.h2h-modal-header', true);
        expect(header).toBeTruthy();
        const record = header.children.find(c => String(c.className).includes('h2h-overall-record'));
        expect(record.textContent).toBe('2–1');
        expect(flattenText(header)).toContain('Jannik Sinner');
        expect(flattenText(header)).toContain('Carlos Alcaraz');

        const slot = find(host, '#h2hRivalryArc', true);
        expect(slot).toBeTruthy();
        expect(slot.hidden).toBe(false);
        expect(rivalry.mount).toHaveBeenCalledTimes(1);
        expect(rivalry.mount.mock.calls[0][0]).toBe(slot);
        expect(rivalry.mount.mock.calls[0][1].meetings).toHaveLength(3);

        expect(find(host, '#h2hSurfTabs', true)).toBeTruthy();
        expect(find(host, '#h2hRecord', true)).toBeTruthy();
        expect(find(host, '.h2h-modal-scroll', true)).toBeTruthy();

        const list = find(host, '#h2hMatchList', true);
        const rows = list.children.filter(c => String(c.className).includes('h2h-match-row'));
        expect(rows).toHaveLength(3);
        expect(find(host, '.h2h-coverage-note', true)).toBeNull();
    });

    it('shows all 17 meetings without truncating', () => {
        const { api } = loadPresenter();
        const host = createNode('div');
        const meetings = Array.from({ length: 17 }, (_, i) => meeting({
            date: `202${i < 10 ? '4' : '5'}-${String((i % 12) + 1).padStart(2, '0')}-01`,
            winner: i % 2 === 0 ? 'First Player' : 'Second Player',
        }));
        api.mount(host, { data: { h2hMatches: meetings }, player1: p1, player2: p2 });
        const list = find(host, '#h2hMatchList', true);
        expect(list.children.filter(c => String(c.className).includes('h2h-match-row'))).toHaveLength(17);
        const header = find(host, '.h2h-modal-header', true);
        const record = header.children.find(c => String(c.className).includes('h2h-overall-record'));
        expect(record.textContent).toBe('9–8');
    });

    it('hides the arc below two meetings and shows No meetings found. when empty', () => {
        const { api, rivalry } = loadPresenter();
        const oneHost = createNode('div');
        api.mount(oneHost, { data: { h2hMatches: [meeting()] }, player1: p1, player2: p2 });
        expect(find(oneHost, '#h2hRivalryArc', true).hidden).toBe(true);
        expect(rivalry.mount).not.toHaveBeenCalled();

        const emptyHost = createNode('div');
        api.mount(emptyHost, { data: { h2hMatches: [] }, player1: p1, player2: p2 });
        expect(flattenText(find(emptyHost, '.h2h-empty', true))).toBe('No meetings found.');
        expect(find(emptyHost, '#h2hRivalryArc', true).hidden).toBe(true);
    });
});

describe('loading / error / coverage', () => {
    it('renders a loading skeleton and error + retry without innerHTML', () => {
        const { api } = loadPresenter();
        const host = createNode('div');
        api.mount(host, { loading: true, player1: p1, player2: p2 });
        expect(find(host, '.h2h-loading', true)).toBeTruthy();
        expect(find(host, '.skeleton-line', true)).toBeTruthy();

        const retry = vi.fn();
        api.mount(host, {
            error: true,
            message: 'Could not load head-to-head data.',
            player1: p1,
            player2: p2,
            onRetry: retry,
        });
        const btn = find(host, '.error-retry-btn', true);
        expect(btn).toBeTruthy();
        expect(btn.textContent).toBe('Try again');
        btn.click();
        expect(retry).toHaveBeenCalledTimes(1);
        expect(flattenText(find(host, '.error-card-msg', true))).toBe('Could not load head-to-head data.');
    });

    it('shows a coverage note only when the API provides meta', () => {
        const { api } = loadPresenter();
        expect(api.coverageText({ h2hMatches: [meeting(), meeting()] })).toBe('');
        expect(api.coverageText({ kvCount: 16 })).toBe('');
        expect(api.coverageText({ coverage: '16 archived · 1 live' })).toBe('16 archived · 1 live');
        expect(api.coverageText({ kvCount: 16, liveCount: 1 })).toBe('16 archived · 1 live');
        expect(api.coverageText({ meta: { kvCount: 16, liveCount: 1 } })).toBe('16 archived · 1 live');

        const host = createNode('div');
        api.mount(host, {
            data: { h2hMatches: [meeting(), meeting()], coverage: 'KV + live' },
            player1: p1,
            player2: p2,
        });
        expect(find(host, '.h2h-coverage-note', true).textContent).toBe('KV + live');
    });
});

describe('winner / set formatting + XSS', () => {
    it('formats string and object setScores through formatSetScores', () => {
        const { api } = loadPresenter();
        expect(api.formatMatchScore({
            setScores: [{ p1: 6, p2: 4 }, { p1: 3, p2: 6 }, { p1: 7, p2: 6, tiebreak: { p1: 7, p2: 5 } }],
        })).toBe('6-4 3-6 7-6(5)');
        expect(api.formatMatchScore({ setScores: ['6-3', '6-4'] })).toBe('6-3 6-4');
        expect(api.formatMatchScore({ setScores: [], finalResult: 'W/O' })).toBe('W/O');
    });

    it('puts malicious names, tournaments, and scores in textContent', () => {
        const { api } = loadPresenter();
        const host = createNode('div');
        const xssName = '<img src=x onerror=alert(1)>Sinner';
        const xssTour = '<script>alert(1)</script>AO';
        api.mount(host, {
            data: {
                h2hMatches: [
                    meeting({
                        date: '2025-01-01',
                        tournamentName: xssTour,
                        tournamentKey: '',
                        setScores: ['6-4 <img>'],
                    }),
                    meeting({ date: '2024-06-01' }),
                ],
            },
            player1: { ...p1, name: xssName },
            player2: p2,
        });
        const header = find(host, '.h2h-modal-header', true);
        expect(flattenText(header)).toContain(xssName);
        const event = find(host, '.h2h-match-event', true);
        expect(flattenText(event)).toContain(xssTour);
        const score = find(host, '.h2h-match-score', true);
        expect(score.textContent).toBe('6-4 <img>');
        expect(host.innerHTML).toBeUndefined();
    });
});

describe('service worker tw-v48', () => {
    it('precaches H2HPresenter and bumps the shell cache', () => {
        expect(swSrc).toMatch(/CACHE_VERSION\s*=\s*'tw-v48'/);
        expect(swSrc).toMatch(/'\/components\/H2HPresenter\.js'/);
        expect(swSrc).toMatch(/'\/components\/RivalryArc\.js'/);
        expect(swSrc).not.toMatch(/tw-v43/);
    });
});
