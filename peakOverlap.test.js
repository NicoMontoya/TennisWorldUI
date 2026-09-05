import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const src = readFileSync(new URL('./peakOverlap.js', import.meta.url), 'utf8');

function loadApi() {
    const fn = new Function('window', 'globalThis', 'module', src + '; return (typeof module !== "undefined" && module.exports) ? module.exports : (globalThis.TW && globalThis.TW.PeakOverlap);');
    return fn({}, {}, { exports: {} });
}

const PO = loadApi();

describe('parseOverlapQuery', () => {
    it('keeps digits-only ids and drops junk', () => {
        expect(PO.parseOverlapQuery('47275,68074')).toEqual(['47275', '68074']);
        expect(PO.parseOverlapQuery('47275,s123,abc,<img>,68074,47275')).toEqual(['47275', '68074']);
        expect(PO.parseOverlapQuery('not-an-id')).toEqual([]);
        expect(PO.parseOverlapQuery(null)).toEqual([]);
    });

    it('never returns raw query fragments', () => {
        const ids = PO.parseOverlapQuery('<script>alert(1)</script>,47275,javascript:alert(1)');
        expect(ids).toEqual(['47275']);
        expect(ids.join(',')).not.toMatch(/[<>:]/);
    });
});

describe('peakWindowFromHistory', () => {
    it('bounds weeks near career-high / top-10', () => {
        const history = [
            { date: '2018-01-01', rank: 80 },
            { date: '2022-06-01', rank: 4 },
            { date: '2023-06-01', rank: 2 },
            { date: '2024-06-01', rank: 1 },
            { date: '2025-06-01', rank: 3 },
            { date: '2026-01-01', rank: 40 },
        ];
        const w = PO.peakWindowFromHistory(history);
        expect(w.startYear).toBe(2022);
        expect(w.endYear).toBe(2025);
        expect(w.bestRank).toBe(1);
        expect(w.source).toBe('ranking-history');
    });

    it('returns null for empty or invalid history', () => {
        expect(PO.peakWindowFromHistory([])).toBe(null);
        expect(PO.peakWindowFromHistory([{ date: 'nope', rank: 1 }])).toBe(null);
    });
});

describe('peakWindowFromVintage', () => {
    it('maps the win-mass age span onto calendar years', () => {
        const points = [
            { age: 18, w: 10 },
            { age: 20, w: 40 },
            { age: 22, w: 120 },
            { age: 24, w: 200 },
            { age: 26, w: 220 },
        ];
        const w = PO.peakWindowFromVintage(points, '2001-08-16');
        expect(w.source).toBe('vintage');
        expect(w.startYear).toBeGreaterThanOrEqual(2019);
        expect(w.endYear).toBeGreaterThanOrEqual(w.startYear);
    });
});

describe('intersect + era twins + caption', () => {
    it('intersects peak windows and ranks era twins by overlap', () => {
        const a = { startYear: 2022, endYear: 2026 };
        const b = { startYear: 2020, endYear: 2024 };
        expect(PO.intersectWindows(a, b)).toEqual({ startYear: 2022, endYear: 2024, years: 3 });
        expect(PO.intersectWindows(a, { startYear: 2010, endYear: 2012 })).toBe(null);

        const twins = PO.suggestEraTwins(a, [
            { id: '1', name: 'Later', window: { startYear: 2025, endYear: 2026 } },
            { id: 2, name: '<img>', window: { startYear: 2020, endYear: 2026 } },
            { id: '3', name: 'Miss', window: { startYear: 2010, endYear: 2011 } },
        ], 4);
        expect(twins[0].id).toBe('2');
        expect(twins[0].years).toBe(5);
        expect(twins[0].name).toBe('<img>');
        expect(twins.map(t => t.id)).not.toContain('3');
    });

    it('builds captions without HTML', () => {
        const cap = PO.overlapCaption(
            [{ name: 'Jannik Sinner' }, { name: 'Carlos Alcaraz' }],
            { startYear: 2022, endYear: 2026, years: 5 }
        );
        expect(cap).toBe('Jannik Sinner and Carlos Alcaraz overlapped 2022–2026 (5 years).');
        expect(PO.overlapCaption([{ name: 'A' }], null)).toMatch(/at least two/i);
    });
});
