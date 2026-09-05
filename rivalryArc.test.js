import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const src = readFileSync(new URL('./components/RivalryArc.js', import.meta.url), 'utf8');
const homeSrc = readFileSync(new URL('./home.js', import.meta.url), 'utf8');
const scoresSrc = readFileSync(new URL('./scores.js', import.meta.url), 'utf8');
const scoresHtml = readFileSync(new URL('./scores.html', import.meta.url), 'utf8');
const h2hSrc = readFileSync(new URL('./h2h.js', import.meta.url), 'utf8');
const panelSrc = readFileSync(new URL('./player-panel.js', import.meta.url), 'utf8');
const swSrc = readFileSync(new URL('./sw.js', import.meta.url), 'utf8');

describe('RivalryArc source contracts', () => {
    it('exposes mount(el, { meetings, player1Key, player2Key })', () => {
        expect(src).toMatch(/function mount\(el, opts\)/);
        expect(src).toMatch(/TW\.RivalryArc/);
        expect(src).toMatch(/meetings/);
        expect(src).toMatch(/player1Key/);
        expect(src).toMatch(/player2Key/);
    });

    it('builds SVG in-repo and never uses innerHTML for API strings', () => {
        expect(src).toMatch(/createElementNS/);
        expect(src).toMatch(/textContent/);
        expect(src).not.toMatch(/innerHTML/);
        expect(src).not.toMatch(/cdn\.jsdelivr/);
        expect(src).not.toMatch(/chart\.js/i);
    });

    it('colors nodes with hard/clay/grass classes', () => {
        expect(src).toMatch(/rivalry-arc-node-hard/);
        expect(src).toMatch(/rivalry-arc-node-clay/);
        expect(src).toMatch(/rivalry-arc-node-grass/);
    });
});

describe('streak derivation', () => {
    it('counts consecutive wins from the most recent finished meeting', () => {
        const fn = new Function(
            'window',
            'globalThis',
            'module',
            'document',
            src + '; return module.exports;'
        );
        const api = fn({}, {}, { exports: {} }, {
            createElementNS: () => ({ setAttribute() {}, appendChild() {} }),
            createElement: () => ({
                className: '',
                hidden: false,
                textContent: '',
                setAttribute() {},
                appendChild() {},
                replaceChildren() {},
            }),
        });
        const meetings = [
            { status: 'Finished', date: '2024-01-01', winner: 'First Player', player1Key: 'A', player2Key: 'B', surface: 'hard' },
            { status: 'Finished', date: '2024-06-01', winner: 'Second Player', player1Key: 'A', player2Key: 'B', surface: 'clay' },
            { status: 'Finished', date: '2025-01-01', winner: 'Second Player', player1Key: 'A', player2Key: 'B', surface: 'grass' },
            { status: 'Finished', date: '2025-06-01', winner: 'Second Player', player1Key: 'A', player2Key: 'B', surface: 'hard' },
        ];
        const streak = api.deriveStreak(meetings, 'A', 'B');
        expect(streak.holderKey).toBe('B');
        expect(streak.count).toBe(3);
        expect(api.streakCaption(meetings, 'A', 'B', { player2Name: 'Carlos Alcaraz' }))
            .toBe('Alcaraz — 3-match streak');
    });
});

describe('mount surfaces', () => {
    it('Analytics modal keeps the arc slot above the scrolling match list', () => {
        expect(h2hSrc).toMatch(/h2h-modal-fixed/);
        expect(h2hSrc).toMatch(/h2hRivalrySlot/);
        expect(h2hSrc).toMatch(/TW\.RivalryArc\.mount/);
        expect(h2hSrc).toMatch(/h2h-modal-scroll/);
    });

    it('player panel has a collapsible Rivalries section', () => {
        expect(panelSrc).toMatch(/ppRivalries/);
        expect(panelSrc).toMatch(/Rivalries/);
        expect(panelSrc).toMatch(/TW\.RivalryArc\.mount/);
    });

    it('Scores mounts under featured H2H and hides without keys+h2h', () => {
        expect(scoresHtml).toMatch(/hubRivalryArc/);
        expect(scoresHtml).not.toMatch(/chart\.js/i);
        expect(scoresSrc).toMatch(/TW\.RivalryArc\.mount/);
        expect(scoresSrc).toMatch(/hubRivalryArc/);
    });
});

describe('home overlap security', () => {
    it('parses digit ids only and paints chips/captions via textContent', () => {
        expect(homeSrc).toMatch(/parseOverlapQuery/);
        expect(homeSrc).toMatch(/eraTwin/);
        expect(homeSrc).toMatch(/textContent/);
        expect(homeSrc).not.toMatch(/overlapEl\.innerHTML/);
        expect(homeSrc).not.toMatch(/eraTwins\.innerHTML/);
    });
});

describe('service worker tw-v37', () => {
    it('bumps cache and precaches new UI assets', () => {
        expect(swSrc).toMatch(/CACHE_VERSION\s*=\s*'tw-v37'/);
        expect(swSrc).not.toMatch(/tw-v36/);
        expect(swSrc).toMatch(/'\/peakOverlap\.js'/);
        expect(swSrc).toMatch(/'\/components\/RivalryArc\.js'/);
    });
});
