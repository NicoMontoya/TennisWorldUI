import { existsSync, readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const drawsHtml = read('./draws.html');
const drawsSrc = read('./draws.js');
const makerSrc = read('./components/BracketMaker.js');
const stylesSrc = read('./styles.css');
const swSrc = read('./sw.js');

describe('Circle View removed from Draws', () => {
    it('does not ship or load RadialBracket', () => {
        expect(existsSync(new URL('./components/RadialBracket.js', import.meta.url))).toBe(false);
        expect(drawsHtml).not.toMatch(/RadialBracket/);
        expect(swSrc).not.toMatch(/RadialBracket/);
    });

    it('always renders column DrawBracket and ignores old layout prefs', () => {
        expect(drawsSrc).not.toMatch(/RadialBracket/);
        expect(drawsSrc).not.toMatch(/getItem\(['"]tw-bracket-layout['"]\)/);
        expect(drawsSrc).toMatch(/TW\.DrawBracket\(/);
        expect(drawsSrc).toMatch(/localStorage\.removeItem\(['"]tw-bracket-layout['"]\)/);
    });

    it('drops the Circle / Column layout toggle', () => {
        expect(makerSrc).not.toMatch(/Circle View|Column View/);
        expect(makerSrc).not.toMatch(/tw-bracket-layout/);
        expect(makerSrc).not.toMatch(/bm-btn-layout/);
        expect(makerSrc).toMatch(/Official Draw/);
        expect(makerSrc).toMatch(/Build My Bracket/);
        expect(makerSrc).toMatch(/Leaders/);
    });

    it('removes radial CSS so it cannot affect column layout', () => {
        expect(stylesSrc).not.toMatch(/Radial \(circle\)/);
        expect(stylesSrc).not.toMatch(/\.rb-scroll|\.rb-outer|\.rb-svg|\.rb-card|\.rb-center/);
        expect(stylesSrc).toMatch(/\.db-wrap/);
    });

    it('bumps the service worker cache past RadialBracket', () => {
        expect(swSrc).toMatch(/CACHE_VERSION\s*=\s*'tw-v43'/);
        expect(swSrc).not.toMatch(/tw-v42/);
        expect(swSrc).toMatch(/'\/components\/DrawBracket\.js'/);
        expect(drawsHtml).toMatch(/styles\.css\?v=tw43/);
    });

    it('keeps empty / loading / error copy unchanged', () => {
        expect(drawsSrc).toMatch(/No draw data available yet — check back once the tournament begins\./);
        expect(drawsSrc).toMatch(/Loading draw…/);
        expect(drawsSrc).toMatch(/Could not load draw\./);
        expect(drawsSrc).toMatch(/No events this month\./);
        expect(drawsSrc).toMatch(/No data available for this period\./);
    });
});
