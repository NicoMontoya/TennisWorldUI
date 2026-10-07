import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const rankingsSrc = read('./rankings.js');
const rankingsHtml = read('./rankings.html');
const homeSrc = read('./home.js');
const indexHtml = read('./index.html');
const scoresHtml = read('./scores.html');
const analyticsHtml = read('./analytics.html');
const swSrc = read('./sw.js');

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

function loadFns() {
    const start = rankingsSrc.indexOf('const SURFACE_FORM_VALUES');
    const last = extractFunction(rankingsSrc, 'formatSurfaceWL');
    const end = rankingsSrc.indexOf(last) + last.length;
    const src = rankingsSrc.slice(start, end);
    return new Function(`${src}
        return {
            parseSurfaceParam,
            surfaceFormPath,
            normalizeSurfaceFormRow,
            surfaceFormRowsFromPayload,
            surfaceFormStatusCopy,
            formatSurfaceWinPct,
            formatSurfaceWL,
        };
    `)();
}

const api = loadFns();

describe('surface form rankings', () => {
    it('calls the surface-form route and not the retired standings route', () => {
        expect(api.surfaceFormPath('ATP', 'hard'))
            .toBe('/api/rankings/surface-form?tour=ATP&surface=hard');
        expect(api.surfaceFormPath('WTA', 'clay'))
            .toBe('/api/rankings/surface-form?tour=WTA&surface=clay');
        expect(rankingsSrc).toMatch(/surfaceFormPath\(tour, allowed\)/);
        expect(rankingsSrc).not.toMatch(/\/api\/surface-standings/);
        expect(rankingsHtml).not.toMatch(/surface-standings/);
        expect(rankingsHtml).not.toMatch(/<script[^>]+src="https?:/);
    });

    it('allowlists surface and falls closed on anything else', () => {
        expect(api.parseSurfaceParam('hard')).toBe('hard');
        expect(api.parseSurfaceParam(' Clay ')).toBe('clay');
        expect(api.parseSurfaceParam('GRASS')).toBe('grass');
        expect(api.parseSurfaceParam('carpet')).toBeNull();
        expect(api.parseSurfaceParam('hard/../x')).toBeNull();
        expect(api.parseSurfaceParam('')).toBeNull();
        expect(api.parseSurfaceParam(null)).toBeNull();
    });

    it('formats a 0–1 winPct as a one-decimal percent', () => {
        expect(api.formatSurfaceWinPct({ winPct: 0.725, w: 29, l: 11 })).toBe('72.5%');
        expect(api.formatSurfaceWinPct({ winPct: 0.8, w: 8, l: 2 })).toBe('80.0%');
        expect(api.formatSurfaceWinPct({ winPct: 1, w: 8, l: 0 })).toBe('100.0%');
        expect(api.formatSurfaceWinPct({ winPct: 0, w: 0, l: 8 })).toBe('0.0%');
        expect(api.formatSurfaceWL({ w: 29, l: 4 })).toBe('29–4');
    });

    it('reads rows from the data envelope and keeps an empty reason as text', () => {
        const payload = {
            tour: 'ATP',
            surface: 'hard',
            rows: [{ rank: 1, playerKey: '7', name: 'Ada', country: 'Spain', age: 22, w: 10, l: 2, winPct: 0.8333 }],
        };
        expect(api.surfaceFormRowsFromPayload(payload)).toHaveLength(1);
        const row = api.normalizeSurfaceFormRow(payload.rows[0], 0);
        expect(row).toMatchObject({ rank: 1, name: 'Ada', w: 10, l: 2, winPct: 0.8333, age: 22 });
        expect(api.surfaceFormRowsFromPayload({ rows: [] })).toEqual([]);
        expect(api.surfaceFormRowsFromPayload(null)).toBeNull();
        expect(api.surfaceFormStatusCopy('clay', { rows: [] })).toBe(
            'Not enough Clay matches in the last 52 weeks yet.',
        );
        expect(api.surfaceFormStatusCopy('hard', { rows: [], reason: 'standings-not-loaded' }))
            .toMatch(/standings/);
        expect(api.surfaceFormStatusCopy('grass', { rows: [], reason: '<img src=x onerror=alert(1)>' }))
            .toBe('<img src=x onerror=alert(1)>');
    });

    it('puts form and not-official copy on chips and the W% header, not a subtitle', () => {
        expect(rankingsHtml).toMatch(/data-surface="overall"/);
        expect(rankingsHtml).toMatch(/Hard · form/);
        expect(rankingsHtml).toMatch(/Clay · form/);
        expect(rankingsHtml).toMatch(/Grass · form/);
        expect(rankingsHtml).not.toMatch(/id="rankingsSubtitle"/);
        expect(rankingsHtml).not.toMatch(/class="section-subtitle"/);
        expect(rankingsSrc).toMatch(/Surface win% \(not official ranking\)/);
        expect(rankingsSrc).toMatch(/Loading surface form…/);
        expect(rankingsSrc).toMatch(/Couldn’t load surface form\. Try Overall or refresh\./);
        const rowFn = extractFunction(rankingsSrc, 'renderSurfaceRow');
        const statusFn = extractFunction(rankingsSrc, 'showStatusRow');
        const cellFn = extractFunction(rankingsSrc, 'cell');
        expect(rowFn).not.toMatch(/innerHTML/);
        expect(rowFn).toMatch(/textContent/);
        expect(cellFn).toMatch(/node\.textContent = text/);
        expect(statusFn).not.toMatch(/innerHTML/);
        expect(statusFn).toMatch(/cell\('td', 'rankings-status', message\)/);
    });

    it('bumps the shell cache so rankings.html is not stuck on the previous precache', () => {
        expect(swSrc).toMatch(/CACHE_VERSION\s*=\s*'tw-v50'/);
        expect(rankingsHtml).toMatch(/styles\.css\?v=tw50/);
    });
});

describe('kill decorative subtitles and rename Career Trajectories', () => {
    it('removes title subtext on Home, Rankings, Analytics, and Scores', () => {
        for (const html of [indexHtml, rankingsHtml, analyticsHtml, scoresHtml]) {
            expect(html).not.toMatch(/class="section-subtitle"/);
            expect(html).not.toMatch(/class="vintage-sub"/);
            expect(html).not.toMatch(/id="vintageSub"/);
            expect(html).not.toMatch(/id="rankingsSubtitle"/);
            expect(html).not.toMatch(/id="hubPageSub"/);
            expect(html).not.toMatch(/class="hub-eyebrow"/);
        }
        expect(homeSrc).not.toMatch(/vintageSub/);
        expect(homeSrc).not.toMatch(/getElementById\('vintageSub'\)/);
    });

    it('names the home hero Career Trajectories and drops Vintage Curves from visible copy', () => {
        expect(indexHtml).toMatch(/<h1 class="vintage-title">Career Trajectories<\/h1>/);
        expect(indexHtml).toMatch(/<title>TennisWorld — Career Trajectories<\/title>/);
        expect(indexHtml).not.toMatch(/Vintage [Cc]urves/);
        expect(indexHtml).toMatch(/aria-label="Career trajectories: cumulative matches won by player age"/);
        expect(homeSrc).not.toMatch(/Vintage [Cc]urves/);
        expect(homeSrc).toMatch(/Career trajectories: ATP rank by player age/);
        expect(indexHtml).toMatch(/class="nav-link">Curves<\/a>/);
    });
});
