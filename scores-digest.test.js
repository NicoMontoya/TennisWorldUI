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
    const names = [
        'parseEventType', 'parseDigestFilter', 'eventTypeOf', 'countByEventType',
        'hasAnyEventType', 'preferredCategory', 'matchesForCategory',
        'tournamentLabel', 'venueLabel', 'parseSetPair',
        'matchKeyOf', 'isFinishedStatus', 'isDelayedStatus', 'matchPhase', 'phaseLabel',
        'pairRoundKey', 'dedupePairRoundMatches',
        'matchTimeMs', 'mergeHubMatches', 'sortFlatMatches',
        'liveByKeyFrom', 'withLiveMeta', 'mergeLiveOverlay', 'overlayMatchesForHub',
        'formatMatchClock', 'statusText',
    ];
    const prelude = [
        extractConst(scoresSrc, 'EVENT_TYPES'),
        extractConst(scoresSrc, 'CATEGORY_TABS'),
        'function parseTour(value) { const t = String(value == null ? "" : value).trim().toUpperCase(); return t === "ATP" || t === "WTA" ? t : null; }',
    ].join('\n');
    const body = names.map(n => extractFn(scoresSrc, n)).join('\n');
    return new Function(prelude + '\n' + body + '; return { EVENT_TYPES, CATEGORY_TABS, parseEventType, parseDigestFilter, eventTypeOf, countByEventType, hasAnyEventType, preferredCategory, matchesForCategory, tournamentLabel, venueLabel, parseSetPair, matchKeyOf, isFinishedStatus, isDelayedStatus, matchPhase, phaseLabel, pairRoundKey, dedupePairRoundMatches, matchTimeMs, mergeHubMatches, sortFlatMatches, liveByKeyFrom, withLiveMeta, mergeLiveOverlay, overlayMatchesForHub, formatMatchClock, statusText };')();
}

function extractConst(src, name) {
    const start = src.indexOf(`const ${name} =`);
    if (start < 0) throw new Error(`${name} const not found`);
    let i = src.indexOf(';', start);
    if (i < 0) throw new Error(`${name} const unclosed`);
    return src.slice(start, i + 1);
}

describe('TW Security acceptance checklist', () => {
    it('1. API strings use textContent/createElement/dataset — never innerHTML from payload', () => {
        expect(scoresSrc).not.toMatch(/\.innerHTML\s*=/);
        expect(scoresSrc).not.toMatch(/insertAdjacentHTML/);
        expect(scoresSrc).toMatch(/textContent/);
        expect(scoresSrc).toMatch(/dataset\.playerKey/);
        expect(scoresSrc).toMatch(/dataset\.name/);
        expect(scoresSrc).not.toMatch(/data-name="\$\{/);
        expect(scoresHtml).not.toMatch(/RivalryArc/);
        expect(scoresSrc).not.toMatch(/TW\.RivalryArc/);
    });

    it('2. live flash is classList + textContent on score cells only', () => {
        const flash = extractFn(scoresSrc, 'flashText');
        const apply = extractFn(scoresSrc, 'applyLiveToRow');
        expect(flash).toMatch(/node\.textContent = text/);
        expect(flash).toMatch(/node\.classList\.add\('score-flash'\)/);
        expect(apply).toMatch(/paintSetColumns\(sets/);
        expect(apply).toMatch(/flashText\(game/);
        expect(apply).not.toMatch(/innerHTML/);
        expect(apply).not.toMatch(/insertAdjacentHTML/);
        expect(apply).not.toMatch(/replaceChildren/);
        expect(apply).not.toMatch(/renderMatchRow/);
        expect(apply).not.toMatch(/scoresList/);
        expect(scoresSrc).toMatch(/querySelectorAll\('\.smc\[data-match-key\]'\)/);
    });

    it('3. Scores loads no Chart.js/jsDelivr/GA; CF Insights beacon is the only third-party script exception', () => {
        expect(scoresHtml).not.toMatch(/chart\.js/i);
        expect(scoresHtml).not.toMatch(/cdn\.jsdelivr/);
        expect(scoresHtml).not.toMatch(/google-analytics|googletagmanager|gtag\(/i);
        expect(scoresHtml).toMatch(/<script src="auth\.js"><\/script>/);
        expect(scoresHtml).toMatch(/<script src="shared\.js"><\/script>/);
        const scriptSrcs = [...scoresHtml.matchAll(/<script[^>]+src=['"]([^'"]+)['"]/g)].map(m => m[1]);
        const thirdParty = scriptSrcs.filter(s => /^https?:\/\//.test(s));
        expect(thirdParty).toEqual(['https://static.cloudflareinsights.com/beacon.min.js']);
        expect(scoresHtml.match(/static\.cloudflareinsights\.com\/beacon\.min\.js/g)).toHaveLength(1);
        expect(scoresHtml).toContain('data-cf-beacon=\'{"token": "942ca2c26fd44a78b8f81b74b22f5f41"}\'');
    });

    it('4. PUBLIC_GET hub/livescore/calendar unchanged; SW is tw-v42', () => {
        const sharedSrc = readFileSync(new URL('./shared.js', import.meta.url), 'utf8');
        expect(sharedSrc).toMatch(/const PUBLIC_GET_PATHS = \['\/api\/hub', '\/api\/livescore', '\/api\/calendar'\]/);
        expect(scoresSrc).toMatch(/apiFetch\(`\/api\/hub\?tour=\$\{encodeURIComponent\(tour\)\}`,\s*\{\s*auth:\s*false\s*\}\)/);
        expect(liveSrc).toMatch(/apiFetch\(`\/api\/livescore\?tour=\$\{encodeURIComponent\(t\)\}`,\s*\{\s*auth:\s*false\s*\}\)/);
        expect(swSrc).toMatch(/CACHE_VERSION\s*=\s*'tw-v42'/);
        expect(swSrc).not.toMatch(/tw-v41/);
        expect(swSrc).not.toMatch(/peakOverlap/);
    });

    it('5. Peak Overlap is fully gone (files, toggle, chips, deep-link, CSS)', () => {
        expect(indexHtml).not.toMatch(/data-view="overlap"/);
        expect(indexHtml).not.toMatch(/overlapWrap|eraTwin|peakOverlap|overlap=/);
        expect(homeSrc).not.toMatch(/overlap|eraTwin|PeakOverlap/i);
        expect(stylesSrc).not.toMatch(/--overlap-/);
        expect(stylesSrc).not.toMatch(/era-twin/);
        expect(stylesSrc).not.toMatch(/\.overlap-/);
        expect(swSrc).not.toMatch(/peakOverlap/);
    });

    it('6. Tour allowlist ATP|WTA is still enforced via parseTour', () => {
        const sharedSrc = readFileSync(new URL('./shared.js', import.meta.url), 'utf8');
        expect(sharedSrc).toMatch(/return t === 'ATP' \|\| t === 'WTA' \? t : null/);
        expect(scoresSrc).toMatch(/parseTour\(btn\.dataset\.tour\)/);
        expect(scoresSrc).toMatch(/writeStoredTour/);
        expect(liveSrc).toMatch(/parseTour\(tour\)/);
        expect(liveSrc).toMatch(/parseTour\(next\)/);
    });
});

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
        expect(scoresSrc).toMatch(/smc-sets/);
        expect(scoresSrc).toMatch(/smc-game/);
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

const CF_BEACON = "<!-- Cloudflare Web Analytics --><script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{\"token\": \"942ca2c26fd44a78b8f81b74b22f5f41\"}'></script><!-- End Cloudflare Web Analytics -->";
const HTML_PAGES = [
    'index.html',
    'scores.html',
    'draws.html',
    'rankings.html',
    'analytics.html',
    'profile.html',
    'player.html',
];

describe('Cloudflare Web Analytics beacon', () => {
    it('is present exactly once on every HTML entry point', () => {
        for (const name of HTML_PAGES) {
            const html = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
            const hits = html.split(CF_BEACON).length - 1;
            expect(hits, name).toBe(1);
            expect(html).not.toMatch(/google-analytics|googletagmanager|gtag\(/i);
        }
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

    it('keeps compact header, tour toggle, category tabs, chips, and live status', () => {
        expect(scoresHtml).toMatch(/id="hubEyebrow"/);
        expect(scoresHtml).toMatch(/id="hubTournamentName"/);
        expect(scoresHtml).toMatch(/id="hubPageSub"/);
        expect(scoresHtml).toMatch(/id="tourToggle"/);
        expect(scoresHtml).toMatch(/id="categoryTabs"/);
        expect(scoresHtml).toMatch(/data-filter="live"/);
        expect(scoresHtml).toMatch(/data-filter="upcoming"/);
        expect(scoresHtml).toMatch(/data-filter="completed"/);
        expect(scoresHtml).toMatch(/data-filter="all"/);
        expect(scoresHtml).toMatch(/id="liveStatusPill"/);
        expect(scoresHtml).toMatch(/id="digestUpdated"/);
        expect(scoresHtml).toMatch(/id="scoresList"/);
        expect(scoresHtml).toMatch(/id="scoresTzNote"/);
        expect(scoresHtml).toMatch(/class="scores-grid"/);
        expect(scoresSrc).toMatch(/Show all/);
        expect(scoresSrc).toMatch(/No matches in this category/);
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

    it('sorts All as Live → Delayed → Upcoming (time) → Finished (recent first)', () => {
        const sorted = sortFlatMatches([
            { matchKey: 'f1', status: 'Finished', date: '2026-09-05T10:00:00Z' },
            { matchKey: 'u2', status: 'Not Started', date: '2026-09-05T16:00:00Z' },
            { matchKey: 'f2', status: 'Finished', date: '2026-09-05T14:00:00Z' },
            { matchKey: 'live', isLive: true },
            { matchKey: 'u1', status: 'Not Started', date: '2026-09-05T12:00:00Z' },
            { matchKey: 'd1', status: 'Delayed', date: '2026-09-05T11:00:00Z' },
        ]);
        expect(sorted.map(m => m.matchKey)).toEqual(['live', 'd1', 'u1', 'u2', 'f2', 'f1']);
        expect(matchPhase(sorted[0])).toBe('live');
        expect(matchPhase(sorted[1])).toBe('delayed');
        expect(matchPhase(sorted[2])).toBe('upcoming');
        expect(matchPhase(sorted[5])).toBe('finished');
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

    it('idle-stops only after several empty polls and exposes last live list', () => {
        expect(liveSrc).toMatch(/EMPTY_IDLE_STREAK\s*=\s*4/);
        expect(liveSrc).toMatch(/emptyStreak/);
        expect(liveSrc).toMatch(/getLastMatches\(/);
        expect(liveSrc).toMatch(/emptyStreak < EMPTY_IDLE_STREAK/);
        expect(liveSrc).not.toMatch(/running = hasLive \? running : false/);
    });
});

describe('hub reload preserves live overlay', () => {
    const { mergeLiveOverlay, overlayMatchesForHub, sortFlatMatches, matchPhase } = loadScoresHelpers();

    it('keeps isLive, setScores, currentGame, and status over hub Not Started', () => {
        const hub = [
            { matchKey: 'live-1', player1Name: 'A', player2Name: 'B', status: 'Not Started' },
            { matchKey: 'up-1', player1Name: 'C', player2Name: 'D', status: 'Not Started' },
        ];
        const live = [
            {
                matchKey: 'live-1',
                isLive: true,
                status: 'InPlay',
                setScores: [{ p1: 6, p2: 4 }, { p1: 3, p2: 2 }],
                currentGame: '30 - 15',
            },
        ];
        const merged = mergeLiveOverlay(hub, live);
        const byKey = Object.fromEntries(merged.map(m => [m.matchKey, m]));
        expect(byKey['live-1'].isLive).toBe(true);
        expect(byKey['live-1'].status).toBe('InPlay');
        expect(byKey['live-1'].setScores).toEqual([{ p1: 6, p2: 4 }, { p1: 3, p2: 2 }]);
        expect(byKey['live-1'].currentGame).toBe('30 - 15');
        expect(byKey['live-1'].player1Name).toBe('A');
        expect(byKey['up-1'].isLive).toBeFalsy();
        expect(matchPhase(sortFlatMatches(merged)[0])).toBe('live');
    });

    it('does not clobber a Finished hub row with a non-live overlay', () => {
        const hub = [{ matchKey: 'done', status: 'Finished', setScores: [{ p1: 6, p2: 3 }] }];
        const live = [{ matchKey: 'done', isLive: false, status: 'Finished', setScores: [{ p1: 1, p2: 0 }] }];
        const [row] = mergeLiveOverlay(hub, live);
        expect(row.isLive).toBe(false);
        expect(row.status).toBe('Finished');
        expect(row.setScores).toEqual([{ p1: 6, p2: 3 }]);
    });

    it('uses painted live rows when the engine has not polled yet', () => {
        const painted = [{ matchKey: 'live-1', isLive: true, currentGame: '15 - 0' }];
        expect(overlayMatchesForHub(null, painted)).toEqual(painted);
        expect(overlayMatchesForHub(undefined, painted)).toEqual(painted);
        expect(overlayMatchesForHub([], painted)).toEqual([]);
        expect(overlayMatchesForHub([{ matchKey: 'live-1', isLive: true }], painted)[0].matchKey).toBe('live-1');
    });

    it('keeps painted Finished rows in the pre-poll overlay fallback', () => {
        const painted = [{ matchKey: 'done', status: 'Finished' }];
        expect(overlayMatchesForHub(null, painted)).toEqual(painted);
    });

    it('promotes Finished livescore onto a Not Started hub row', () => {
        const hub = [{
            matchKey: 'andreeva',
            player1Name: 'Andreeva',
            player2Name: 'Opponent',
            status: 'Not Started',
        }];
        const live = [{
            matchKey: 'andreeva',
            isLive: false,
            status: 'Finished',
            setScores: [{ p1: 6, p2: 2 }, { p1: 6, p2: 3 }],
            currentGame: '',
            winner: 'player1',
        }];
        const [row] = mergeLiveOverlay(hub, live);
        expect(row.isLive).toBe(false);
        expect(row.status).toBe('Finished');
        expect(row.setScores).toEqual([{ p1: 6, p2: 2 }, { p1: 6, p2: 3 }]);
        expect(row.winner).toBe('player1');
        expect(row.currentGame).toBe('');
        expect(row.player1Name).toBe('Andreeva');
        expect(matchPhase(row)).toBe('finished');
    });

    it('promotes Retired / Walkover / Ended without inventing scores', () => {
        const hub = [{ matchKey: 'wo', status: 'Not Started' }];
        const live = [{ matchKey: 'wo', isLive: false, status: 'Walkover', winner: 'player2' }];
        const [row] = mergeLiveOverlay(hub, live);
        expect(row.status).toBe('Walkover');
        expect(row.winner).toBe('player2');
        expect(row.setScores).toBeUndefined();
        expect(matchPhase(row)).toBe('finished');
        expect(matchPhase({ status: 'retired' })).toBe('finished');
        expect(matchPhase({ status: 'ENDED' })).toBe('finished');
    });
});

describe('finished status + pair-round dedupe', () => {
    const { isFinishedStatus, matchPhase, dedupePairRoundMatches, sortFlatMatches } = loadScoresHelpers();

    it('treats Finished / Ended / Retired / Walkover as finished, case-insensitive', () => {
        expect(isFinishedStatus('Finished')).toBe(true);
        expect(isFinishedStatus('finished')).toBe(true);
        expect(isFinishedStatus('ENDED')).toBe(true);
        expect(isFinishedStatus(' Retired ')).toBe(true);
        expect(isFinishedStatus('walkover')).toBe(true);
        expect(isFinishedStatus('Not Started')).toBe(false);
        expect(isFinishedStatus('InPlay')).toBe(false);
        expect(isFinishedStatus('Delayed')).toBe(false);
        expect(matchPhase({ status: 'Walkover' })).toBe('finished');
        expect(matchPhase({ status: 'Not Started' })).toBe('upcoming');
        expect(matchPhase({ isLive: true, status: 'Finished' })).toBe('live');
    });

    it('drops a Not Started duplicate when Finished exists for the same pair+round', () => {
        const list = [
            { matchKey: 'ns-1', player1Key: 'A', player2Key: 'B', round: 'Final', status: 'Not Started' },
            { matchKey: 'done-1', player1Key: 'B', player2Key: 'A', round: 'Final', status: 'Finished', setScores: [{ p1: 6, p2: 4 }] },
            { matchKey: 'other', player1Key: 'C', player2Key: 'D', round: 'Final', status: 'Not Started' },
            { matchKey: 'sf', player1Key: 'A', player2Key: 'B', round: 'Semifinals', status: 'Not Started' },
        ];
        const deduped = dedupePairRoundMatches(list);
        expect(deduped.map(m => m.matchKey)).toEqual(['done-1', 'other', 'sf']);
        const sorted = sortFlatMatches(deduped);
        expect(sorted.map(m => m.matchKey)).toEqual(['other', 'sf', 'done-1']);
        expect(matchPhase(sorted[2])).toBe('finished');
    });
});

describe('MatchCard / DrawMatch finished-status equivalents', () => {
    it('treat the same terminal statuses as finished', () => {
        const matchCard = readFileSync(new URL('./components/MatchCard.js', import.meta.url), 'utf8');
        const drawMatch = readFileSync(new URL('./components/DrawMatch.js', import.meta.url), 'utf8');
        for (const src of [matchCard, drawMatch]) {
            expect(src).toMatch(/s === 'finished'/);
            expect(src).toMatch(/s === 'ended'/);
            expect(src).toMatch(/s === 'retired'/);
            expect(src).toMatch(/s === 'walkover'/);
            expect(src).toMatch(/isFinishedStatus\(match\.status\)/);
        }
    });
});

describe('Delayed status is not Upcoming', () => {
    const { isDelayedStatus, matchPhase, phaseLabel, mergeLiveOverlay, overlayMatchesForHub } = loadScoresHelpers();

    it('maps Delayed / Postponed / Suspended to delayed phase, case-insensitive', () => {
        expect(isDelayedStatus('Delayed')).toBe(true);
        expect(isDelayedStatus('delayed')).toBe(true);
        expect(isDelayedStatus(' POSTPONED ')).toBe(true);
        expect(isDelayedStatus('suspended')).toBe(true);
        expect(isDelayedStatus('Not Started')).toBe(false);
        expect(isDelayedStatus('Finished')).toBe(false);
        expect(isDelayedStatus('InPlay')).toBe(false);
        expect(matchPhase({ status: 'Delayed' })).toBe('delayed');
        expect(matchPhase({ status: 'postponed' })).toBe('delayed');
        expect(matchPhase({ status: 'SUSPENDED' })).toBe('delayed');
        expect(matchPhase({ status: 'Not Started' })).toBe('upcoming');
        expect(matchPhase({ isLive: true, status: 'Delayed' })).toBe('live');
        expect(matchPhase({ status: 'Finished' })).toBe('finished');
    });

    it('paints Delayed badge — never Upcoming — for Delayed API rows', () => {
        expect(phaseLabel({ status: 'Delayed' })).toBe('Delayed');
        expect(phaseLabel({ status: 'delayed' })).toBe('Delayed');
        expect(phaseLabel({ matchKey: '1023', status: 'Delayed' })).not.toBe('Upcoming');
        expect(phaseLabel({ matchKey: '933', status: 'Delayed' })).not.toBe('Upcoming');
        expect(phaseLabel({ status: 'Postponed' })).toBe('Delayed');
        expect(phaseLabel({ status: 'Suspended' })).toBe('Delayed');
        expect(phaseLabel({ status: 'Not Started' })).toBe('Upcoming');
        expect(phaseLabel({ isLive: true })).toBe('Live');
        expect(phaseLabel({ status: 'Finished' })).toBe('Completed');
        expect(phaseLabel({ status: 'Walkover' })).toBe('Completed');
        expect(scoresSrc).toMatch(/label\.textContent = statusText\(/);
        expect(extractFn(scoresSrc, 'paintStatus')).not.toMatch(/Upcoming' : 'Finished'/);
        expect(extractFn(scoresSrc, 'applyLiveToRow')).not.toMatch(/isDone \? 'Finished' : 'Upcoming'/);
    });

    it('excludes Delayed from the Upcoming filter bucket', () => {
        const rows = [
            { matchKey: '1023', status: 'Delayed' },
            { matchKey: '933', status: 'Delayed' },
            { matchKey: 'ns', status: 'Not Started' },
            { matchKey: 'live', isLive: true },
            { matchKey: 'done', status: 'Finished' },
        ];
        const upcoming = rows.filter(m => matchPhase(m) === 'upcoming');
        expect(upcoming.map(m => m.matchKey)).toEqual(['ns']);
        expect(rows.filter(m => matchPhase(m) === 'delayed').map(m => m.matchKey)).toEqual(['1023', '933']);
    });

    it('promotes Delayed livescore onto a Not Started hub row without inventing scores', () => {
        const hub = [{
            matchKey: '1023',
            player1Name: 'Andreeva',
            player2Name: 'Potapova',
            status: 'Not Started',
        }];
        const live = [{ matchKey: '1023', isLive: false, status: 'Delayed' }];
        const [row] = mergeLiveOverlay(hub, live);
        expect(row.isLive).toBe(false);
        expect(row.status).toBe('Delayed');
        expect(row.setScores).toBeUndefined();
        expect(row.player1Name).toBe('Andreeva');
        expect(matchPhase(row)).toBe('delayed');
        expect(phaseLabel(row)).toBe('Delayed');
        expect(phaseLabel(row)).not.toBe('Upcoming');
    });

    it('does not clobber Live overlay or Finished promotion', () => {
        const hub = [
            { matchKey: 'live-1', player1Name: 'A', status: 'Not Started' },
            { matchKey: 'done-1', player1Name: 'B', status: 'Not Started' },
            { matchKey: 'delay-1', player1Name: 'C', status: 'Delayed' },
        ];
        const live = [
            { matchKey: 'live-1', isLive: true, status: 'InPlay', setScores: [{ p1: 3, p2: 2 }], currentGame: '15 - 0' },
            { matchKey: 'done-1', isLive: false, status: 'Finished', setScores: [{ p1: 6, p2: 3 }], winner: 'player1' },
        ];
        const merged = mergeLiveOverlay(hub, live);
        const byKey = Object.fromEntries(merged.map(m => [m.matchKey, m]));
        expect(byKey['live-1'].isLive).toBe(true);
        expect(matchPhase(byKey['live-1'])).toBe('live');
        expect(byKey['done-1'].status).toBe('Finished');
        expect(matchPhase(byKey['done-1'])).toBe('finished');
        expect(byKey['delay-1'].status).toBe('Delayed');
        expect(matchPhase(byKey['delay-1'])).toBe('delayed');
    });

    it('keeps painted Delayed rows in the pre-poll overlay fallback', () => {
        const painted = [{ matchKey: '1023', status: 'Delayed' }];
        expect(overlayMatchesForHub(null, painted)).toEqual(painted);
    });
});

describe('MatchCard / DrawMatch / VisualBracket delayed-status equivalents', () => {
    it('treat Delayed / Postponed / Suspended as delayed, not upcoming', () => {
        const matchCard = readFileSync(new URL('./components/MatchCard.js', import.meta.url), 'utf8');
        const drawMatch = readFileSync(new URL('./components/DrawMatch.js', import.meta.url), 'utf8');
        const visual = readFileSync(new URL('./components/VisualBracket.js', import.meta.url), 'utf8');
        const draws = readFileSync(new URL('./draws.js', import.meta.url), 'utf8');
        for (const src of [matchCard, drawMatch, visual, draws]) {
            expect(src).toMatch(/s === 'delayed'/);
            expect(src).toMatch(/s === 'postponed'/);
            expect(src).toMatch(/s === 'suspended'/);
            expect(src).toMatch(/isDelayedStatus\(/);
        }
        expect(matchCard).toMatch(/>Delayed</);
        expect(drawMatch).toMatch(/score = 'Delayed'/);
        expect(draws).toMatch(/draw-badge-delayed/);
        expect(draws).toMatch(/\$\{delayed\.length\} delayed/);
    });
});

describe('Scores always starts LiveEngine', () => {
    it('refreshes LiveEngine on hub load without gating on hub isLive', () => {
        expect(scoresSrc).toMatch(/function ensureLiveEngine\(/);
        expect(scoresSrc).toMatch(/LiveEngine\.refresh\(\)/);
        expect(scoresSrc).toMatch(/dedupePairRoundMatches\(\s*mergeLiveOverlay\(mergeHubMatches\(data\), liveOverlaySource\(\)\)/);
        expect(scoresSrc).not.toMatch(/startLiveOverlayIfNeeded/);
        expect(scoresSrc).not.toMatch(/if \(live\) LiveEngine\.start/);
    });
});

describe('service worker tw-v42', () => {
    it('bumps cache and still precaches scores.html without peakOverlap', () => {
        expect(swSrc).toMatch(/CACHE_VERSION\s*=\s*'tw-v42'/);
        expect(swSrc).not.toMatch(/tw-v41/);
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

describe('eventType allowlist + category tabs', () => {
    const {
        EVENT_TYPES, CATEGORY_TABS, parseEventType, eventTypeOf, countByEventType,
        hasAnyEventType, preferredCategory, matchesForCategory, parseDigestFilter,
        withLiveMeta, mergeLiveOverlay,
    } = loadScoresHelpers();

    it('maps the five client tabs to Worker eventType enums only', () => {
        expect(EVENT_TYPES).toEqual([
            'ATP Singles', 'ATP Doubles', 'WTA Singles', 'WTA Doubles', 'Mixed Doubles',
        ]);
        expect(CATEGORY_TABS.map(t => t.eventType).sort()).toEqual([...EVENT_TYPES].sort());
        expect(CATEGORY_TABS.map(t => t.label)).toEqual([
            "Men's Singles", "Women's Singles", "Men's Doubles", "Women's Doubles", 'Mixed Doubles',
        ]);
        expect(parseEventType('ATP Singles')).toBe('ATP Singles');
        expect(parseEventType('WTA Doubles')).toBe('WTA Doubles');
        expect(parseEventType('Mixed Doubles')).toBe('Mixed Doubles');
    });

    it('drops unknown, empty, and tour-only labels — never invents a category', () => {
        expect(parseEventType(null)).toBeNull();
        expect(parseEventType('')).toBeNull();
        expect(parseEventType('ATP')).toBeNull();
        expect(parseEventType('WTA')).toBeNull();
        expect(parseEventType('atp singles')).toBeNull();
        expect(parseEventType('ITF')).toBeNull();
        expect(parseEventType('Challenger')).toBeNull();
        expect(parseEventType('Junior Boys')).toBeNull();
        expect(parseEventType('<script>alert(1)</script>')).toBeNull();
        expect(eventTypeOf({ eventType: 'ATP' })).toBeNull();
        expect(eventTypeOf({ eventType: 'ATP Singles' })).toBe('ATP Singles');
        expect(hasAnyEventType([{ status: 'Not Started' }])).toBe(false);
        expect(hasAnyEventType([{ eventType: 'ATP Singles' }])).toBe(true);
        expect(scoresSrc).not.toMatch(/eventType=\$\{/);
        expect(scoresSrc).not.toMatch(/searchParams\.set\('eventType'/);
        expect(scoresHtml).not.toMatch(/[?&]eventType=/);
    });

    it('filters only by allowlisted eventType and does not infer from names or tour', () => {
        const rows = [
            { matchKey: 's', eventType: 'ATP Singles', player1Name: 'Sinner' },
            { matchKey: 'd', eventType: 'ATP Doubles', player1Name: 'Ram / Salisbury' },
            { matchKey: 'bare', player1Name: 'Alcaraz / no-type' },
            { matchKey: 'junk', eventType: 'ITF', player1Name: 'Junior' },
        ];
        expect(matchesForCategory(rows, 'ATP Singles').map(m => m.matchKey)).toEqual(['s']);
        expect(matchesForCategory(rows, 'ATP Doubles').map(m => m.matchKey)).toEqual(['d']);
        expect(matchesForCategory(rows, 'WTA Singles')).toEqual([]);
        expect(matchesForCategory(rows, 'ITF')).toEqual(rows);
        expect(matchesForCategory(rows, null)).toEqual(rows);
        const counts = countByEventType(rows);
        expect(counts['ATP Singles']).toBe(1);
        expect(counts['ATP Doubles']).toBe(1);
        expect(counts['WTA Singles']).toBe(0);
        expect(counts['Mixed Doubles']).toBe(0);
    });

    it('prefers the tour gender category and never picks the other tour without data', () => {
        expect(preferredCategory('ATP', { 'ATP Singles': 3, 'WTA Singles': 2 })).toBe('ATP Singles');
        expect(preferredCategory('WTA', { 'ATP Singles': 3, 'WTA Singles': 2 })).toBe('WTA Singles');
        expect(preferredCategory('ATP', { 'WTA Singles': 4 })).toBeNull();
        expect(preferredCategory('WTA', { 'ATP Doubles': 2 })).toBeNull();
        expect(preferredCategory('ATP', { 'ATP Doubles': 1, 'Mixed Doubles': 1 })).toBe('ATP Doubles');
        expect(preferredCategory('WTA', { 'Mixed Doubles': 2 })).toBe('Mixed Doubles');
        expect(preferredCategory('ATP', {})).toBeNull();
    });

    it('copies allowlisted eventType / tournament / venue from live overlay only when hub lacks them', () => {
        const hub = { matchKey: '1', player1Name: 'A' };
        const live = {
            matchKey: '1',
            eventType: 'ATP Singles',
            tournamentName: 'US Open',
            venue: 'Arthur Ashe',
        };
        const next = withLiveMeta(hub, live, hub);
        expect(next.eventType).toBe('ATP Singles');
        expect(next.tournamentName).toBe('US Open');
        expect(next.venue).toBe('Arthur Ashe');
        expect(next).not.toBe(hub);

        const junk = withLiveMeta({ matchKey: '2' }, { eventType: 'Junior' }, { matchKey: '2' });
        expect(junk.eventType).toBeUndefined();

        const merged = mergeLiveOverlay(
            [{ matchKey: 'live-1', player1Name: 'A', status: 'Not Started' }],
            [{ matchKey: 'live-1', isLive: true, status: 'InPlay', eventType: 'ATP Singles', tournamentName: 'US Open' }]
        );
        expect(merged[0].eventType).toBe('ATP Singles');
        expect(merged[0].tournamentName).toBe('US Open');
        expect(merged[0].isLive).toBe(true);
    });

    it('allowlists digest chips and never accepts free-text filters', () => {
        expect(parseDigestFilter('live')).toBe('live');
        expect(parseDigestFilter('completed')).toBe('completed');
        expect(parseDigestFilter('upcoming')).toBe('upcoming');
        expect(parseDigestFilter('all')).toBe('all');
        expect(parseDigestFilter('finished')).toBeNull();
        expect(parseDigestFilter('ATP Singles')).toBeNull();
        expect(parseDigestFilter('<script>')).toBeNull();
    });
});

describe('match card fields + set columns', () => {
    const { tournamentLabel, venueLabel, parseSetPair, statusText, phaseLabel } = loadScoresHelpers();

    it('uses tournamentName when present and hides venue when missing', () => {
        expect(tournamentLabel({ tournamentName: 'US Open' }, 'Fallback')).toBe('US Open');
        expect(tournamentLabel({}, 'U.S. Open')).toBe('U.S. Open');
        expect(tournamentLabel({}, '')).toBe('');
        expect(venueLabel({ venue: 'Arthur Ashe Stadium' })).toBe('Arthur Ashe Stadium');
        expect(venueLabel({})).toBe('');
        expect(venueLabel({ venue: '   ' })).toBe('');
        expect(scoresSrc).toMatch(/venue\.hidden = !v/);
        expect(scoresSrc).toMatch(/tourney\.hidden = !name/);
        expect(scoresSrc).toMatch(/game\.hidden = !nextGame/);
    });

    it('parses object and string set scores into columns without inventing dashes', () => {
        expect(parseSetPair({ p1: 6, p2: 4 })).toEqual({ p1: 6, p2: 4, loserTb: null });
        expect(parseSetPair({ p1: 7, p2: 6, tiebreak: { p1: 7, p2: 5 } }))
            .toEqual({ p1: 7, p2: 6, loserTb: 5 });
        expect(parseSetPair('6-4')).toEqual({ p1: 6, p2: 4, loserTb: null });
        expect(parseSetPair('7-6(5)')).toEqual({ p1: 7, p2: 6, loserTb: 5 });
        expect(parseSetPair('')).toBeNull();
        expect(parseSetPair(null)).toBeNull();
        expect(extractFn(scoresSrc, 'paintSetColumns')).toMatch(/container\.hidden = true/);
    });

    it('paints Live / Completed / time and a winner marker on completed cards', () => {
        expect(phaseLabel({ isLive: true })).toBe('Live');
        expect(phaseLabel({ status: 'Finished' })).toBe('Completed');
        expect(statusText({ status: 'Not Started', time: '14:30' })).toBe('14:30');
        expect(statusText({ status: 'Delayed' })).toBe('Delayed');
        expect(scoresSrc).toMatch(/smc-winner/);
        expect(scoresSrc).toMatch(/aria-label', 'Winner'/);
        expect(scoresSrc).toMatch(/mark\.hidden = !won/);
    });
});

describe('Scores card grid + live overlay contracts', () => {
    it('builds uniform cards with createElement and patches by matchKey', () => {
        expect(scoresHtml).toMatch(/class="scores-grid"/);
        expect(scoresSrc).toMatch(/el\('article', 'smc/);
        expect(scoresSrc).toMatch(/function renderSkeleton\(/);
        expect(scoresSrc).toMatch(/smc-skeleton/);
        expect(scoresSrc).toMatch(/querySelectorAll\('\.smc\[data-match-key\]'\)/);
        expect(extractFn(scoresSrc, 'flashText')).toMatch(/motionOk\(\)/);
        expect(extractFn(scoresSrc, 'applyLiveToRow')).not.toMatch(/replaceChildren/);
        expect(extractFn(scoresSrc, 'applyLiveToRow')).not.toMatch(/innerHTML/);
        expect(scoresSrc).not.toMatch(/TW\.MatchCard/);
        expect(scoresSrc).not.toMatch(/TW\.ProbBar/);
        expect(scoresHtml).not.toMatch(/youtube|video|highlight/i);
    });

    it('lays out 1 column at 375 and 2 columns at 768, with scrolling category tabs', () => {
        expect(stylesSrc).toMatch(/@media \(min-width: 768px\)/);
        expect(stylesSrc).toMatch(/grid-template-columns: 1fr 1fr/);
        expect(stylesSrc).toMatch(/@media \(max-width: 375px\)/);
        expect(stylesSrc).toMatch(/\.category-tabs/);
        expect(stylesSrc).toMatch(/overflow-x: auto/);
        expect(stylesSrc).toMatch(/flex-wrap: nowrap/);
        expect(stylesSrc).toMatch(/\.smc-tournament/);
        expect(stylesSrc).toMatch(/\.smc-venue/);
        expect(stylesSrc).toMatch(/\.smc-set-col/);
    });
});
