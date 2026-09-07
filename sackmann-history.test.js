import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const playerSrc = readFileSync(new URL('./player.js', import.meta.url), 'utf8');
const playerHtml = readFileSync(new URL('./player.html', import.meta.url), 'utf8');
const homeSrc = readFileSync(new URL('./home.js', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const histSrc = readFileSync(new URL('./rankings-history.js', import.meta.url), 'utf8');
const swSrc = readFileSync(new URL('./sw.js', import.meta.url), 'utf8');

describe('player ranking history', () => {
    it('fetches /api/player-ranking-history with encoded ATP/WTA keys', () => {
        expect(playerSrc).toMatch(/encodeURIComponent\(playerKey\)/);
        expect(playerSrc).toMatch(/encodeURIComponent\(tour\)/);
        expect(playerSrc).toMatch(/api\/player-ranking-history\?tour=\$\{qsTour\}&playerKey=\$\{qsPlayer\}/);
    });

    it('renders a clear empty state and never invents points', () => {
        expect(playerSrc).toMatch(/No ranking history available/);
        expect(playerSrc).not.toMatch(/Building ranking history/);
        expect(playerHtml).toMatch(/No ranking history available/);
        expect(playerSrc).toMatch(/rankHistory\?\.history|rankHistory && Array\.isArray\(rankHistory\.history\)/);
        expect(playerSrc).toMatch(/points\.length < 2/);
    });

    it('keeps the page up for Sackmann-only identity (s-keys / URL name)', () => {
        expect(playerSrc).toMatch(/!rankHistory && !urlName/);
        expect(playerSrc).toMatch(/vintage-roster\?tour=ATP/);
        expect(playerSrc).toMatch(/r\.legend/);
    });
});

describe('vintage curves legends', () => {
    it('requests ATP vintage routes with encoded playerKey (s-prefix safe)', () => {
        expect(homeSrc).toMatch(/const TOUR\s*=\s*'ATP'/);
        expect(homeSrc).toMatch(
            /api\/player-vintage\?tour=\$\{encodeURIComponent\(TOUR\)\}&playerKey=\$\{encodeURIComponent\(id\)\}/
        );
        expect(homeSrc).toMatch(/s'-prefixed \(Sackmann\)/);
        expect(homeSrc).toMatch(/Never coerce to Number/);
    });

    it('shows a clear empty state when roster or curves are missing', () => {
        expect(indexHtml).toMatch(/id="vintageEmpty"/);
        expect(homeSrc).toMatch(/Legend career curves are not loaded yet/);
        expect(homeSrc).toMatch(/No vintage roster available/);
        expect(homeSrc).toMatch(/No career curves available/);
        expect(homeSrc).toMatch(/error === 'not-loaded'/);
    });
});

describe('Time Machine weekly rankings', () => {
    it('reads ATP date-keyed /api/rankings-history only', () => {
        expect(histSrc).toMatch(/\/api\/rankings-history\?tour=ATP&meta=1/);
        expect(histSrc).toMatch(/\/api\/rankings-history\?tour=ATP&date=\$\{encodeURIComponent\(date\)\}/);
        expect(histSrc).not.toMatch(/tour=WTA/);
        expect(histSrc).toMatch(/liveTour\(\) !== 'ATP'/);
    });

    it('links historical rows via s+Sackmann pid and clears empty weeks', () => {
        expect(histSrc).toMatch(/'s' \+ pid|'s'\s*\+\s*pid/);
        expect(histSrc).toMatch(/player\.html\?/);
        expect(histSrc).toMatch(/No historical rankings loaded yet/);
        expect(histSrc).toMatch(/No rankings for this week/);
        expect(histSrc).toMatch(/No players match/);
    });
});

describe('service worker', () => {
    it('precaches home.js and the history client on tw-v39', () => {
        expect(swSrc).toMatch(/CACHE_VERSION\s*=\s*'tw-v39'/);
        expect(swSrc).toMatch(/'\/home\.js'/);
        expect(swSrc).toMatch(/'\/rankings-history\.js'/);
        expect(swSrc).toMatch(/'\/player\.js'/);
    });
});
