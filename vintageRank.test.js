import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { describe, it, expect } from 'vitest';

function loadRank() {
    const src = readFileSync(new URL('./vintageRank.js', import.meta.url), 'utf8');
    const sandbox = { window: { TW: {} } };
    vm.runInNewContext(src, sandbox);
    return sandbox.window.TW.VintageRank;
}

const Rank = loadRank();
const require = createRequire(import.meta.url);
const Chart = require('./vendor/chart.umd.min.js');

const homeSrc = readFileSync(new URL('./home.js', import.meta.url), 'utf8');
const rankSrc = readFileSync(new URL('./vintageRank.js', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const playerHtml = readFileSync(new URL('./player.html', import.meta.url), 'utf8');
const swSrc = readFileSync(new URL('./sw.js', import.meta.url), 'utf8');
const chartFile = readFileSync(new URL('./vendor/chart.umd.min.js', import.meta.url), 'utf8');

const HOSTILE = '<img src=x onerror=alert(1)>';

function federerYear(extra) {
    return Object.assign({
        age: 22,
        rank: 1,
        weeksAtRank: 26.9,
        rankedWeeks: 52.3,
        partial: false,
    }, extra || {});
}

describe('rank series gaps', () => {
    it('breaks the line at a missing age and never draws a zero', () => {
        const points = Rank.seriesPoints([
            federerYear(),
            { age: 24, rank: 1, weeksAtRank: 30.2, rankedWeeks: 52.0, partial: false },
            { age: 25, rank: 0, weeksAtRank: 10, rankedWeeks: 40, partial: false },
            { age: 26, rank: 3, weeksAtRank: 20, rankedWeeks: 12.9, partial: false },
        ]);
        expect(points.map(p => [p.x, p.y])).toEqual([
            [22, 1],
            [23, null],
            [24, 1],
        ]);
        expect(points.some(p => p.y === 0)).toBe(false);
        expect(Rank.gapsAreBroken(points)).toBe(true);
        expect(Rank.hasGap(points)).toBe(true);
        const ds = Rank.rankDataset({ name: 'Roger Federer', asOf: '2026-06-08', points }, '#2a78d6', 'Roger Federer');
        expect(ds.spanGaps).toBe(false);
        expect(ds.pointRadius({ raw: points[1] })).toBe(0);
        expect(ds.pointRadius({ raw: points[0] })).toBe(3);
    });
});

describe('rank tooltip', () => {
    it('rounds weeks to whole numbers', () => {
        expect(Rank.formatRankTooltip({
            name: 'Roger Federer',
            age: 22,
            rank: 1,
            weeksAtRank: 26.9,
            rankedWeeks: 52.3,
            partial: false,
            asOf: '2026-06-08',
        })).toBe('Federer · age 22 · No. 1 · held 27 of 52 ranked weeks');
    });

    it('appends the partial suffix from the asOf digits', () => {
        expect(Rank.formatAsOf('2026-06-08')).toBe('Jun 8, 2026');
        expect(Rank.formatAsOf('2026-12-01')).toBe('Dec 1, 2026');
        expect(Rank.formatAsOf('2026-06-08T00:00:00.000Z')).toBe('');
        expect(rankSrc).not.toMatch(/new Date/);
        expect(Rank.formatRankTooltip({
            name: 'Roger Federer',
            age: 44,
            rank: 1,
            weeksAtRank: 26.9,
            rankedWeeks: 52.3,
            partial: true,
            asOf: '2026-06-08',
        })).toBe('Federer · age 44 · No. 1 · held 27 of 52 ranked weeks · through Jun 8, 2026');
        const ds = Rank.rankDataset(
            Rank.classify({
                tour: 'ATP',
                available: true,
                name: 'Roger Federer',
                asOf: '2026-06-08',
                years: [federerYear({ age: 44, partial: true })],
            }),
            '#2a78d6',
            'Roger Federer'
        );
        expect(ds.pointBackgroundColor({ raw: ds.data[0] })).toBe('transparent');
        expect(ds.pointBackgroundColor({ raw: { x: 22, y: 1, partial: false } })).toBe('#2a78d6');
    });
});

describe('pre-1973 note', () => {
    it('appears only when a visible age is below ageAtRankingsStart', () => {
        expect(Rank.showPre1973(null, [15, 16, 22])).toBe(false);
        expect(Rank.showPre1973(2, [15, 16, 22, 40])).toBe(false);
        expect(Rank.showPre1973(18, [18, 19, 30])).toBe(false);
        expect(Rank.showPre1973(18, [15, 16, 22])).toBe(true);

        const sampras = Rank.classify({
            tour: 'ATP',
            available: true,
            name: 'Pete Sampras',
            ageAtRankingsStart: 2,
            asOf: '2026-06-08',
            years: [
                { age: 22, rank: 1, weeksAtRank: 40, rankedWeeks: 52, partial: false },
                { age: 23, rank: 1, weeksAtRank: 40, rankedWeeks: 52, partial: false },
            ],
        });
        const early = Rank.classify({
            tour: 'ATP',
            available: true,
            name: 'Ken Rosewall',
            ageAtRankingsStart: 18,
            asOf: '2026-06-08',
            years: [
                { age: 19, rank: 5, weeksAtRank: 20, rankedWeeks: 40, partial: false },
                { age: 20, rank: 4, weeksAtRank: 20, rankedWeeks: 40, partial: false },
            ],
        });
        const visible = Rank.visibleAxisAges([15.2, 22, 30.4]);
        expect(visible[0]).toBe(15);
        expect(Rank.notesFor([sampras], visible)).not.toContain(Rank.NOTE_PRE1973);
        expect(Rank.notesFor([early], visible)).toContain(Rank.NOTE_PRE1973);
        expect(Rank.notesFor([early], [19, 20])).not.toContain(Rank.NOTE_PRE1973);
    });
});

describe('rank empty states', () => {
    it('shows the WTA coming-soon note and draws nothing', () => {
        const wta = Rank.classify({
            tour: 'WTA',
            available: false,
            reason: 'wta-ranking-history-not-loaded',
            name: 'Serena Williams',
            years: [federerYear()],
        });
        expect(wta.wta).toBe(true);
        expect(wta.points).toEqual([]);
        const view = Rank.viewState([wta], [22]);
        expect(view.drawable).toBe(false);
        expect(view.note).toBe(Rank.NOTE_WTA);
        expect(view.empty).toBe('');
    });

    it('treats other available:false responses as an empty state with no line', () => {
        const missing = Rank.classify({
            tour: 'ATP',
            available: false,
            reason: 'unavailable',
            name: 'Roger Federer',
            years: [federerYear()],
        });
        expect(missing.points).toEqual([]);
        const view = Rank.viewState([missing], [22]);
        expect(view.drawable).toBe(false);
        expect(view.note).toBe('');
        expect(view.empty).toBe(Rank.NOTE_EMPTY);

        const none = Rank.classify({
            tour: 'ATP',
            available: true,
            reason: 'no-ranking-history',
            name: 'Roger Federer',
            years: [],
        });
        expect(Rank.viewState([none], []).note).toBe('No ATP ranking history for Roger Federer.');
    });

    it('falls back quietly on 404, 429, and a network error', () => {
        for (const status of [404, 429]) {
            const fail = Rank.failureFromStatus(status);
            expect(fail.quiet).toBe(true);
            expect(fail.points).toEqual([]);
            expect(fail.error).toBe(null);
            const view = Rank.viewState([fail], [22]);
            expect(view.note).toBe('');
            expect(view.empty).toBe(Rank.NOTE_EMPTY);
            expect(view.drawable).toBe(false);
        }
        const network = Rank.failureFromError(new TypeError('Failed to fetch'));
        expect(network.quiet).toBe(true);
        expect(network.points).toEqual([]);
        expect(Rank.failureFromError(new Error('HTTP 404')).quiet).toBe(true);
        expect(Rank.failureFromError(new Error('HTTP 429')).quiet).toBe(true);
        expect(homeSrc).toMatch(/rankCurves/);
        expect(homeSrc).toMatch(/\/api\/vintage-rank-by-age\?tour=\$\{encodeURIComponent\(TOUR\)\}&playerKey=\$\{encodeURIComponent\(id\)\}/);
        expect(homeSrc).toMatch(/\/api\/player-vintage\?tour=\$\{encodeURIComponent\(TOUR\)\}&playerKey=\$\{encodeURIComponent\(id\)\}/);
    });
});

describe('not-loaded rank note', () => {
    function missed(reason, chipName, apiName) {
        return Object.assign(Rank.classify({
            tour: 'ATP',
            available: false,
            reason: reason,
            name: apiName === undefined ? null : apiName,
            years: [federerYear()],
        }), { chipName: chipName });
    }

    it('names one selected player from the chip, not a null API name', () => {
        const state = missed('not-loaded', 'Jakub Mensik', null);
        expect(state.name).toBe('');
        expect(state.points).toEqual([]);
        const view = Rank.viewState([state], [22]);
        expect(view.drawable).toBe(false);
        expect(view.note).toBe('No ranking history yet for Jakub Mensik.');
        expect(Rank.noteForMetric('rk', view)).toBe(view.note);
        expect(Rank.noteForMetric('w', view)).toBe('');
        expect(Rank.noteForMetric('gs', view)).toBe('');
    });

    it('lists every selected player who is not loaded yet in one note', () => {
        const states = [
            missed('not-loaded', 'Jakub Mensik'),
            missed('rankings-not-loaded', 'Martin Landaluce', 'Ignored API Name'),
        ];
        expect(Rank.viewState(states, []).note).toBe(
            'No ranking history yet for Jakub Mensik, Martin Landaluce.'
        );
        expect(states[1].points).toEqual([]);
    });

    it('renders a hostile chip name as text and clears the note on deselect', () => {
        const hostile = missed('not-loaded', HOSTILE);
        const other = missed('rankings-not-loaded', 'Martin Landaluce');
        let selected = [hostile, other];
        const view = Rank.viewState(selected, []);
        expect(view.note).toBe('No ranking history yet for ' + HOSTILE + ', Martin Landaluce.');
        expect(view.note).not.toContain('&lt;');

        const writes = [];
        const el = {};
        Object.defineProperty(el, 'innerHTML', {
            set(v) { writes.push(v); },
            get() { return undefined; },
        });
        let text = '';
        Object.defineProperty(el, 'textContent', {
            set(v) { text = String(v); },
            get() { return text; },
        });
        Rank.paintText(el, Rank.noteForMetric('rk', view));
        expect(writes).toEqual([]);
        expect(text).toContain(HOSTILE);
        expect(text).toBe(view.note);

        selected = selected.filter(s => s.chipName !== HOSTILE);
        expect(Rank.viewState(selected, []).note).toBe('No ranking history yet for Martin Landaluce.');
        selected = [];
        expect(Rank.viewState(selected, []).note).toBe('');
        expect(Rank.noteForMetric('rk', Rank.viewState(selected, []))).toBe('');
        expect(homeSrc).toMatch(/chipName: p\.name/);
        expect(homeSrc).toMatch(/noteForMetric\(metric, view\)/);
        expect(homeSrc).toMatch(/if \(metric === 'rk'\)/);
    });
});

describe('rank text is never written with innerHTML', () => {
    it('keeps a hostile name in textContent and in the tooltip string', () => {
        const state = Rank.classify({
            tour: 'ATP',
            available: true,
            reason: 'no-ranking-history',
            name: HOSTILE,
            years: [],
        });
        const view = Rank.viewState([state], []);
        expect(view.note).toContain(HOSTILE);
        expect(view.note).not.toContain('&lt;');

        const writes = [];
        const el = {};
        Object.defineProperty(el, 'innerHTML', {
            set(v) { writes.push(v); },
            get() { return undefined; },
        });
        let text = '';
        Object.defineProperty(el, 'textContent', {
            set(v) { text = String(v); },
            get() { return text; },
        });
        Rank.paintText(el, view.note);
        expect(writes).toEqual([]);
        expect(text).toContain(HOSTILE);

        const tip = Rank.formatRankTooltip({
            name: HOSTILE,
            age: 22,
            rank: 1,
            weeksAtRank: 26.9,
            rankedWeeks: 52.3,
            partial: true,
            asOf: '2026-06-08',
        });
        expect(typeof tip).toBe('string');
        expect(tip).toContain('onerror=alert(1)>');
        expect(tip).not.toContain('&lt;');
        expect(tip).toBe('onerror=alert(1)> · age 22 · No. 1 · held 27 of 52 ranked weeks · through Jun 8, 2026');
        expect(rankSrc).not.toMatch(/innerHTML/);
        expect(homeSrc).not.toMatch(/innerHTML/);
        expect(homeSrc).toMatch(/els\.note\.textContent/);
        expect(homeSrc).toMatch(/name\.textContent = p\.name/);
    });
});

describe('rank axis copy', () => {
    it('uses an inverted log scale, Top 200 ticks, and the blank-year note', () => {
        expect(Rank.Y_TITLE).toBe('ATP rank (Top 200)');
        expect(Rank.Y_MIN).toBe(1);
        expect(Rank.Y_MAX).toBe(200);
        expect(Rank.RANK_TICKS).toEqual([1, 5, 10, 20, 50, 100, 200]);
        expect(Rank.GUIDE_RANKS).toEqual([1, 10]);
        expect(Rank.tickLabel(1)).toBe('1');
        expect(Rank.tickLabel(15)).toBe('');
        const scale = { ticks: [{ value: 2 }] };
        Rank.applyRankTicks(scale);
        expect(scale.ticks.map(t => t.value)).toEqual(Rank.RANK_TICKS);
        expect(homeSrc).toMatch(/type: 'logarithmic'/);
        expect(homeSrc).toMatch(/reverse: true/);
        expect(indexHtml).toMatch(/data-metric="rk"/);
        expect(indexHtml).toMatch(/>Rank</);

        const gapped = Rank.classify({
            tour: 'ATP',
            available: true,
            name: 'Roger Federer',
            ageAtRankingsStart: null,
            asOf: '2026-06-08',
            years: [
                federerYear(),
                { age: 24, rank: 1, weeksAtRank: 40, rankedWeeks: 52, partial: false },
            ],
        });
        expect(Rank.notesFor([gapped], [22, 23, 24])).toContain(Rank.NOTE_BLANK);
        expect(Rank.notesFor([gapped], [22, 23, 24])).not.toContain(Rank.NOTE_PRE1973);
    });
});

describe('self-hosted Chart.js', () => {
    it('serves Chart.js 4.4.0 from the repo and precaches it on tw-v49', () => {
        expect(Chart.version).toBe('4.4.0');
        expect(chartFile.startsWith('/*!')).toBe(true);
        expect(chartFile).toMatch(/Chart\.js v4\.4\.0/);
        expect(chartFile).not.toMatch(/jsdelivr/i);
        expect(indexHtml).toMatch(/src="vendor\/chart\.umd\.min\.js"/);
        expect(playerHtml).toMatch(/src="vendor\/chart\.umd\.min\.js"/);
        expect(indexHtml).not.toMatch(/cdn\.jsdelivr\.net\/npm\/chart\.js/);
        expect(playerHtml).not.toMatch(/cdn\.jsdelivr\.net\/npm\/chart\.js/);
        expect(swSrc).toMatch(/CACHE_VERSION\s*=\s*'tw-v49'/);
        expect(swSrc).toMatch(/'\/vendor\/chart\.umd\.min\.js'/);
        expect(swSrc).toMatch(/'\/vintageRank\.js'/);
        expect(swSrc).toMatch(/'\/home\.js'/);
    });
});
