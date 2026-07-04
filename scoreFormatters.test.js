import { describe, it, expect } from 'vitest';
import { formatSetScore, formatSetScores, formatGameScore } from './scoreFormatters.js';

// ── formatSetScore ─────────────────────────────────────────────────────────────
describe('formatSetScore', () => {
    it('formats a standard set', () => {
        expect(formatSetScore({ p1: 6, p2: 1, tiebreak: null })).toBe('6-1');
        expect(formatSetScore({ p1: 6, p2: 4, tiebreak: null })).toBe('6-4');
    });

    it('formats a tiebreak set showing loser score in parens', () => {
        // p1 wins 7-6, tiebreak 7-4 → loser score is 4
        expect(formatSetScore({ p1: 7, p2: 6, tiebreak: { p1: 7, p2: 4 } })).toBe('7-6(4)');
        // p2 wins 7-6, tiebreak 3-7 → loser score is 3
        expect(formatSetScore({ p1: 6, p2: 7, tiebreak: { p1: 3, p2: 7 } })).toBe('6-7(3)');
    });

    it('always shows the loser tiebreak score, not the winner', () => {
        // A 10-point tiebreak: 10-8 → loser got 8
        expect(formatSetScore({ p1: 7, p2: 6, tiebreak: { p1: 10, p2: 8 } })).toBe('7-6(8)');
    });

    it('returns dash for null/undefined input', () => {
        expect(formatSetScore(null)).toBe('–');
        expect(formatSetScore(undefined)).toBe('–');
    });

    it('handles a 6-0 bagel', () => {
        expect(formatSetScore({ p1: 6, p2: 0, tiebreak: null })).toBe('6-0');
    });
});

// ── formatSetScores ────────────────────────────────────────────────────────────
describe('formatSetScores', () => {
    it('formats multiple sets comma-separated', () => {
        const sets = [
            { p1: 6, p2: 1, tiebreak: null },
            { p1: 6, p2: 2, tiebreak: null },
        ];
        expect(formatSetScores(sets)).toBe('6-1, 6-2');
    });

    it('handles a three-set match with tiebreak', () => {
        const sets = [
            { p1: 6, p2: 4, tiebreak: null },
            { p1: 6, p2: 7, tiebreak: { p1: 4, p2: 7 } },
            { p1: 6, p2: 3, tiebreak: null },
        ];
        expect(formatSetScores(sets)).toBe('6-4, 6-7(4), 6-3');
    });

    it('returns empty string for empty/null input', () => {
        expect(formatSetScores([])).toBe('');
        expect(formatSetScores(null)).toBe('');
        expect(formatSetScores(undefined)).toBe('');
    });

    it('handles a single set (retired/walkover)', () => {
        expect(formatSetScores([{ p1: 3, p2: 1, tiebreak: null }])).toBe('3-1');
    });
});

// ── formatGameScore ────────────────────────────────────────────────────────────
describe('formatGameScore', () => {
    it('replaces spaced dash with en-dash', () => {
        expect(formatGameScore('30 - 15')).toBe('30–15');
        expect(formatGameScore('0 - 0')).toBe('0–0');
        expect(formatGameScore('40 - 40')).toBe('40–40');
    });

    it('handles deuce and advantage strings', () => {
        expect(formatGameScore('Deuce')).toBe('Deuce');
        expect(formatGameScore('Advantage - 0')).toBe('Advantage–0');
        expect(formatGameScore('0 - Advantage')).toBe('0–Advantage');
    });

    it('returns empty string for falsy input', () => {
        expect(formatGameScore(null)).toBe('');
        expect(formatGameScore(undefined)).toBe('');
        expect(formatGameScore('')).toBe('');
    });

    it('handles all standard point combinations', () => {
        const scores = ['0 - 15', '0 - 30', '0 - 40', '15 - 0', '15 - 15',
                        '15 - 30', '15 - 40', '30 - 0', '30 - 15', '30 - 30',
                        '30 - 40', '40 - 0', '40 - 15', '40 - 30'];
        for (const s of scores) {
            expect(formatGameScore(s)).toBe(s.replace(' - ', '–'));
        }
    });
});
