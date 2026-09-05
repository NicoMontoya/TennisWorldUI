import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const scoresSrc = readFileSync(new URL('./scores.js', import.meta.url), 'utf8');
const liveSrc = readFileSync(new URL('./live.js', import.meta.url), 'utf8');
const swSrc = readFileSync(new URL('./sw.js', import.meta.url), 'utf8');
const drawsSrc = readFileSync(new URL('./draws.js', import.meta.url), 'utf8');
const scoresHtml = readFileSync(new URL('./scores.html', import.meta.url), 'utf8');

function extractFn(src, name) {
    const start = src.indexOf(`function ${name}(`);
    if (start < 0) throw new Error(`${name} not found`);
    let i = src.indexOf('{', start);
    let depth = 0;
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(start, i + 1);
        }
    }
    throw new Error(`${name} unclosed`);
}

describe('scores digest security contracts', () => {
    it('flashes live score changes via classList + textContent only', () => {
        const flash = extractFn(scoresSrc, 'flashText');
        const apply = extractFn(scoresSrc, 'applyLiveToRow');
        expect(flash).toMatch(/node\.textContent = text/);
        expect(flash).toMatch(/node\.classList\.add\('score-flash'\)/);
        expect(apply).toMatch(/flashText/);
        expect(apply).not.toMatch(/innerHTML/);
        expect(apply).not.toMatch(/insertAdjacentHTML/);
        expect(scoresSrc).toMatch(/applyLiveToRow\(row, live\)/);
    });

    it('never interpolates the stored tour token into HTML', () => {
        expect(scoresSrc).not.toMatch(/innerHTML\s*=\s*`[^`]*\$\{(?:currentTour|tour)\}/);
        expect(scoresSrc).not.toMatch(/innerHTML[\s\S]{0,40}tw-tour/);
        expect(scoresSrc).toMatch(/parseTour\(btn\.dataset\.tour\)/);
        expect(scoresSrc).toMatch(/writeStoredTour/);
        expect(scoresSrc).toMatch(/sub\.textContent = `\$\{currentTour\}/);
    });

    it('does not load Chart.js on Scores', () => {
        expect(scoresHtml).not.toMatch(/chart\.js/i);
        expect(scoresHtml).not.toMatch(/cdn\.jsdelivr/);
    });
});

describe('LiveEngine tour + idle contract', () => {
    it('is tour-aware and keeps the 15s live floor', () => {
        expect(liveSrc).toMatch(/function currentTour\(/);
        expect(liveSrc).toMatch(/setTour\(/);
        expect(liveSrc).toMatch(/POLL_LIVE\s*=\s*15_000/);
        expect(liveSrc).toMatch(/document\.hidden/);
        expect(liveSrc).toMatch(/auth:\s*false/);
    });
});

describe('service worker tw-v36', () => {
    it('bumps cache and still precaches scores.html', () => {
        expect(swSrc).toMatch(/CACHE_VERSION\s*=\s*'tw-v36'/);
        expect(swSrc).not.toMatch(/tw-v35/);
        expect(swSrc).toMatch(/'\/scores\.html'/);
    });
});

describe('calendar month overlap', () => {
    const tournamentOverlapsMonth = new Function('return ' + extractFn(drawsSrc, 'tournamentOverlapsMonth'))();

    it('keeps September events in September and drops January', () => {
        expect(tournamentOverlapsMonth(
            { name: 'U.S. Open', startDate: '2026-08-31', endDate: '', status: 'live' },
            2026, 9
        )).toBe(true);
        expect(tournamentOverlapsMonth(
            { name: 'Japan Open', startDate: '2026-09-28', endDate: '', status: 'upcoming' },
            2026, 9
        )).toBe(true);
        expect(tournamentOverlapsMonth(
            { name: 'Australian Open', startDate: '2026-01-19', endDate: '2026-02-01', status: 'completed' },
            2026, 9
        )).toBe(false);
    });
});
