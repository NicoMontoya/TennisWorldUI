import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const src = readFileSync(new URL('./shared.js', import.meta.url), 'utf8');
const scoresSrc = readFileSync(new URL('./scores.js', import.meta.url), 'utf8');
const liveSrc = readFileSync(new URL('./live.js', import.meta.url), 'utf8');

function extract(fnName) {
    const match = src.match(new RegExp(`function ${fnName}\\([\\s\\S]*?\\n\\}`));
    if (!match) throw new Error(`${fnName} not found in shared.js`);
    return new Function('return ' + match[0])();
}

const normalizeNavPage = extract('normalizeNavPage');
const apiPathname = extract('apiPathname');

const publicChunk = src.match(/const PUBLIC_GET_PATHS[\s\S]*?function isAnonymousPublicGet\([\s\S]*?\n\}/);
if (!publicChunk) throw new Error('isAnonymousPublicGet chunk not found');
const { isAnonymousPublicGet } = new Function(
    publicChunk[0] + '; return { isAnonymousPublicGet };'
)();

describe('normalizeNavPage', () => {
    it('maps clean URLs and .html hrefs to the same key', () => {
        expect(normalizeNavPage('/scores')).toBe('scores.html');
        expect(normalizeNavPage('/scores.html')).toBe('scores.html');
        expect(normalizeNavPage('scores.html')).toBe('scores.html');
        expect(normalizeNavPage('/draws')).toBe('draws.html');
        expect(normalizeNavPage('draws.html')).toBe('draws.html');
        expect(normalizeNavPage('/')).toBe('index.html');
        expect(normalizeNavPage('/index.html')).toBe('index.html');
        expect(normalizeNavPage('index.html')).toBe('index.html');
        expect(normalizeNavPage('/rankings?q=sinner')).toBe('rankings.html');
    });
});

describe('isAnonymousPublicGet', () => {
    it('omits auth for hub, livescore, and calendar GETs', () => {
        expect(isAnonymousPublicGet('/api/hub?tour=ATP')).toBe(true);
        expect(isAnonymousPublicGet('/api/livescore?tour=ATP')).toBe(true);
        expect(isAnonymousPublicGet('/api/calendar?tour=ATP')).toBe(true);
    });

    it('honors explicit auth: false on any path', () => {
        expect(isAnonymousPublicGet('/api/favorites', { auth: false })).toBe(true);
    });

    it('still attaches auth for other methods and private GETs', () => {
        expect(isAnonymousPublicGet('/api/hub', { method: 'POST' })).toBe(false);
        expect(isAnonymousPublicGet('/api/favorites')).toBe(false);
        expect(isAnonymousPublicGet('/api/auth/me')).toBe(false);
    });
});

describe('apiPathname', () => {
    it('strips the query string', () => {
        expect(apiPathname('/api/hub?tour=ATP')).toBe('/api/hub');
    });
});

describe('scores hub XSS sinks', () => {
    it('does not concatenate player names into innerHTML or raw data-* attrs', () => {
        expect(scoresSrc).not.toMatch(/innerHTML\s*=\s*buildTickerItems/);
        expect(scoresSrc).not.toMatch(/track\.innerHTML/);
        expect(scoresSrc).not.toMatch(/data-name="\$\{/);
        expect(scoresSrc).not.toMatch(/data-player-key="\$\{/);
        expect(scoresSrc).not.toMatch(/innerHTML[\s\S]{0,120}\$\{m\.player1Name\}/);
        expect(scoresSrc).not.toMatch(/innerHTML[\s\S]{0,120}\$\{m\.player2Name\}/);
    });

    it('calls hub and livescore as anonymous public GETs', () => {
        expect(scoresSrc).toMatch(/apiFetch\(`\/api\/hub\?tour=\$\{encodeURIComponent\(tour\)\}`,\s*\{\s*auth:\s*false\s*\}\)/);
        expect(liveSrc).toMatch(/apiFetch\(`\/api\/livescore\?tour=\$\{encodeURIComponent\(t\)\}`,\s*\{\s*auth:\s*false\s*\}\)/);
        expect(scoresSrc).not.toMatch(/\/api\/fixtures/);
        expect(liveSrc).not.toMatch(/\/api\/fixtures/);
    });
});

describe('parseTour allowlist', () => {
    const chunk = src.match(/function parseTour\(value\) \{[\s\S]*?\n\}/);
    if (!chunk) throw new Error('parseTour not found');
    const parseTour = new Function('return ' + chunk[0])();

    it('accepts only ATP and WTA', () => {
        expect(parseTour('ATP')).toBe('ATP');
        expect(parseTour('wta')).toBe('WTA');
        expect(parseTour(' WTA ')).toBe('WTA');
    });

    it('ignores junk and never returns raw input', () => {
        expect(parseTour('<img src=x onerror=alert(1)>')).toBe(null);
        expect(parseTour('ITF')).toBe(null);
        expect(parseTour('atp;drop')).toBe(null);
        expect(parseTour('')).toBe(null);
        expect(parseTour(null)).toBe(null);
    });
});

describe('isoDateLocal', () => {
    const chunk = src.match(/function isoDateLocal\(date\) \{[\s\S]*?\n\}/);
    if (!chunk) throw new Error('isoDateLocal not found');
    const isoDateLocal = new Function('return ' + chunk[0])();

    it('formats local calendar dates without UTC shift', () => {
        const d = new Date(2026, 8, 1); // Sep 1 local
        expect(isoDateLocal(d)).toBe('2026-09-01');
        const late = new Date(2026, 0, 31, 23, 30);
        expect(isoDateLocal(late)).toBe('2026-01-31');
    });
});
