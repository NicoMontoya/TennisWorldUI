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
        'matchKeyOf', 'isFinishedStatus', 'isDelayedStatus', 'matchPhase', 'phaseLabel',
        'pairRoundKey', 'dedupePairRoundMatches',
        'matchTimeMs', 'mergeHubMatches', 'sortFlatMatches',
        'liveByKeyFrom', 'mergeLiveOverlay', 'overlayMatchesForHub',
    ];
    const body = names.map(n => extractFn(scoresSrc, n)).join('\n');
    return new Function(body + '; return { matchKeyOf, isFinishedStatus, isDelayedStatus, matchPhase, phaseLabel, pairRoundKey, dedupePairRoundMatches, matchTimeMs, mergeHubMatches, sortFlatMatches, liveByKeyFrom, mergeLiveOverlay, overlayMatchesForHub };')();
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
        expect(apply).toMatch(/flashText\(sets/);
        expect(apply).toMatch(/flashText\(game/);
        expect(apply).not.toMatch(/innerHTML/);
        expect(apply).not.toMatch(/insertAdjacentHTML/);
        expect(apply).not.toMatch(/replaceChildren/);
        expect(apply).not.toMatch(/renderMatchRow/);
        expect(apply).not.toMatch(/scoresList/);
        expect(scoresSrc).toMatch(/querySelectorAll\('\.smr\[data-match-key\]'\)/);
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

    it('4. PUBLIC_GET hub/livescore/calendar unchanged; SW is tw-v39', () => {
        const sharedSrc = readFileSync(new URL('./shared.js', import.meta.url), 'utf8');
        expect(sharedSrc).toMatch(/const PUBLIC_GET_PATHS = \['\/api\/hub', '\/api\/livescore', '\/api\/calendar'\]/);
        expect(scoresSrc).toMatch(/apiFetch\(`\/api\/hub\?tour=\$\{encodeURIComponent\(tour\)\}`,\s*\{\s*auth:\s*false\s*\}\)/);
        expect(liveSrc).toMatch(/apiFetch\(`\/api\/livescore\?tour=\$\{encodeURIComponent\(t\)\}`,\s*\{\s*auth:\s*false\s*\}\)/);
        expect(swSrc).toMatch(/CACHE_VERSION\s*=\s*'tw-v39'/);
        expect(swSrc).not.toMatch(/tw-v37/);
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
        expect(phaseLabel({ status: 'Finished' })).toBe('Finished');
        expect(phaseLabel({ status: 'Walkover' })).toBe('Finished');
        expect(scoresSrc).toMatch(/label\.textContent = phaseLabel\(/);
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

describe('service worker tw-v39', () => {
    it('bumps cache and still precaches scores.html without peakOverlap', () => {
        expect(swSrc).toMatch(/CACHE_VERSION\s*=\s*'tw-v39'/);
        expect(swSrc).not.toMatch(/tw-v38/);
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
