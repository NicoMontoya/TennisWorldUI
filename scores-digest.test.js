import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const scoresSrc = readFileSync(new URL('./scores.js', import.meta.url), 'utf8');
const liveSrc = readFileSync(new URL('./live.js', import.meta.url), 'utf8');
const swSrc = readFileSync(new URL('./sw.js', import.meta.url), 'utf8');
const drawsSrc = readFileSync(new URL('./draws.js', import.meta.url), 'utf8');
const scoresHtml = readFileSync(new URL('./scores.html', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const homeSrc = readFileSync(new URL('./home.js', import.meta.url), 'utf8');
const stylesSrc = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

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

function loadScoresHelpers() {
    const names = ['matchKeyOf', 'matchPhase', 'matchTimeMs', 'mergeHubMatches', 'sortFlatMatches'];
    const body = names.map(n => extractFn(scoresSrc, n)).join('\n');
    return new Function(body + '; return { matchKeyOf, matchPhase, matchTimeMs, mergeHubMatches, sortFlatMatches };')();
}

describe('scores digest security contracts', () => {
    it('flashes live score changes via classList + textContent only', () => {
        const flash = extractFn(scoresSrc, 'flashText');
        const apply = extractFn(scoresSrc, 'applyLiveToRow');
        expect(flash).toMatch(/node\.textContent = text/);
        expect(flash).toMatch(/node\.classList\.add\('score-flash'\)/);
        expect(apply).toMatch(/flashText|paintRow/);
        expect(apply).not.toMatch(/innerHTML/);
        expect(apply).not.toMatch(/insertAdjacentHTML/);
        expect(scoresSrc).toMatch(/applyLiveToRow\(row, live/);
        expect(scoresSrc).toMatch(/smr-sets/);
        expect(scoresSrc).toMatch(/smr-game/);
    });

    it('never interpolates the stored tour token into HTML', () => {
        expect(scoresSrc).not.toMatch(/innerHTML\s*=\s*`[^`]*\$\{(?:currentTour|tour)\}/);
        expect(scoresSrc).not.toMatch(/innerHTML[\s\S]{0,40}tw-tour/);
        expect(scoresSrc).toMatch(/parseTour\(btn\.dataset\.tour\)/);
        expect(scoresSrc).toMatch(/writeStoredTour/);
        expect(scoresSrc).toMatch(/\$\{currentTour\} live scores|\$\{currentTour\} scores/);
    });

    it('does not load Chart.js on Scores', () => {
        expect(scoresHtml).not.toMatch(/chart\.js/i);
        expect(scoresHtml).not.toMatch(/cdn\.jsdelivr/);
    });
});

describe('Scores is a flat list only', () => {
    it('drops ticker, featured hero, ProbBar, and Latest & H2H accordion', () => {
        expect(scoresHtml).not.toMatch(/scoreTicker/);
        expect(scoresHtml).not.toMatch(/hubFeaturedMatch/);
        expect(scoresHtml).not.toMatch(/hubProbBar/);
        expect(scoresHtml).not.toMatch(/digestContext/);
        expect(scoresHtml).not.toMatch(/Latest/);
        expect(scoresHtml).not.toMatch(/MatchCard/);
        expect(scoresHtml).not.toMatch(/ProbBar/);
        expect(scoresHtml).not.toMatch(/RivalryArc/);
        expect(scoresSrc).not.toMatch(/renderTicker/);
        expect(scoresSrc).not.toMatch(/mountFeaturedProbBar/);
        expect(scoresSrc).not.toMatch(/TW\.MatchCard/);
        expect(scoresSrc).not.toMatch(/TW\.ProbBar/);
        expect(scoresSrc).not.toMatch(/hubFeaturedMatch/);
    });

    it('keeps compact header, tour toggle, chips, and live status', () => {
        expect(scoresHtml).toMatch(/id="hubEyebrow"/);
        expect(scoresHtml).toMatch(/id="hubTournamentName"/);
        expect(scoresHtml).toMatch(/id="hubPageSub"/);
        expect(scoresHtml).toMatch(/id="tourToggle"/);
        expect(scoresHtml).toMatch(/data-filter="live"/);
        expect(scoresHtml).toMatch(/data-filter="upcoming"/);
        expect(scoresHtml).toMatch(/data-filter="finished"/);
        expect(scoresHtml).toMatch(/data-filter="all"/);
        expect(scoresHtml).toMatch(/id="liveStatusPill"/);
        expect(scoresHtml).toMatch(/id="digestUpdated"/);
        expect(scoresHtml).toMatch(/id="scoresList"/);
        expect(scoresSrc).toMatch(/Show all/);
        expect(scoresSrc).not.toMatch(/Live & recent/);
    });
});

describe('hub merge + All sort', () => {
    const { mergeHubMatches, sortFlatMatches, matchPhase } = loadScoresHelpers();

    it('dedupes featuredMatch and recentResults into todaysMatches by matchKey', () => {
        const merged = mergeHubMatches({
            todaysMatches: [
                { matchKey: 'a', player1Name: 'A', status: 'Not Started' },
                { matchKey: 'b', player1Name: 'B', isLive: true },
            ],
            featuredMatch: { matchKey: 'b', player1Name: 'B-featured', isLive: true, currentGame: '30 - 15' },
            recentResults: [
                { matchKey: 'c', player1Name: 'C', status: 'Finished' },
                { matchKey: 'a', player1Name: 'A-recent', status: 'Not Started', time: '14:00' },
            ],
        });
        expect(merged).toHaveLength(3);
        const byKey = Object.fromEntries(merged.map(m => [m.matchKey, m]));
        expect(byKey.b.currentGame).toBe('30 - 15');
        expect(byKey.a.time).toBe('14:00');
        expect(byKey.c.status).toBe('Finished');
    });

    it('sorts All as Live → Upcoming (time) → Finished (recent first)', () => {
        const sorted = sortFlatMatches([
            { matchKey: 'f1', status: 'Finished', date: '2026-09-05T10:00:00Z' },
            { matchKey: 'u2', status: 'Not Started', date: '2026-09-05T16:00:00Z' },
            { matchKey: 'f2', status: 'Finished', date: '2026-09-05T14:00:00Z' },
            { matchKey: 'live', isLive: true },
            { matchKey: 'u1', status: 'Not Started', date: '2026-09-05T12:00:00Z' },
        ]);
        expect(sorted.map(m => m.matchKey)).toEqual(['live', 'u1', 'u2', 'f2', 'f1']);
        expect(matchPhase(sorted[0])).toBe('live');
        expect(matchPhase(sorted[1])).toBe('upcoming');
        expect(matchPhase(sorted[4])).toBe('finished');
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

describe('service worker tw-v38', () => {
    it('bumps cache and still precaches scores.html without peakOverlap', () => {
        expect(swSrc).toMatch(/CACHE_VERSION\s*=\s*'tw-v38'/);
        expect(swSrc).not.toMatch(/tw-v37/);
        expect(swSrc).toMatch(/'\/scores\.html'/);
        expect(swSrc).not.toMatch(/peakOverlap/);
    });
});

describe('Peak Overlap / Era Twins removed', () => {
    it('leaves no overlap controls, scripts, deep-links, or CSS tokens', () => {
        expect(indexHtml).not.toMatch(/data-view="overlap"/);
        expect(indexHtml).not.toMatch(/overlapWrap|eraTwin|peakOverlap/);
        expect(indexHtml).not.toMatch(/overlap=/);
        expect(homeSrc).not.toMatch(/overlap|eraTwin|PeakOverlap/i);
        expect(stylesSrc).not.toMatch(/--overlap-/);
        expect(stylesSrc).not.toMatch(/era-twin/);
        expect(stylesSrc).not.toMatch(/\.overlap-/);
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
