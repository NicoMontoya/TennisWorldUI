import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, it, expect } from 'vitest';

function loadDrawOrder() {
    const src = readFileSync(new URL('./drawOrder.js', import.meta.url), 'utf8');
    const sandbox = { window: { TW: {} } };
    vm.runInNewContext(src, sandbox);
    return sandbox.window.TW.DrawOrder;
}

const DrawOrder = loadDrawOrder();

function match(slot, k1, k2, winner, names) {
    const n = names || {};
    return {
        slotIndex: slot,
        player1Key: k1,
        player2Key: k2,
        player1Name: n.p1 != null ? n.p1 : String(k1),
        player2Name: n.p2 != null ? n.p2 : String(k2),
        winner: winner,
    };
}

function tree(verified) {
    const r16 = [
        match(0, 'A', 'B', 'player1'),
        match(1, 'C', 'D', 'player1'),
        match(2, 'E', 'F', 'player1'),
        match(3, 'G', 'H', 'player1'),
    ];
    const qf = [
        match(0, 'A', 'C', null),
        match(1, 'E', 'G', null),
    ];
    return {
        payload: { slotOrderVerified: verified },
        rounds: [
            { round: 'Quarter-finals', order: 3, slotOrderVerified: verified, matches: qf.map(m => ({ ...m, roundId: 9 })) },
            { round: 'Round of 16', order: 4, slotOrderVerified: verified, matches: r16.map(m => ({ ...m, roundId: 7 })) },
        ],
    };
}

describe('draw order chip', () => {
    it('Guadalajara shape: payload true is muted verified and bracket default', () => {
        const { payload, rounds } = tree(true);
        const state = DrawOrder.resolve(payload, rounds);
        expect(state.status).toBe('verified');
        expect(state.label).toBe('Draw verified');
        expect(state.defaultLayout).toBe('bracket');
        expect(state.banner).toBe('');
        expect(state.bracketSecondary).toBe(false);
        expect(state.listAvailable).toBe(true);
    });

    it('Sao Paulo / Monterrey shape: payload false is amber unchecked, bracket still default', () => {
        const { payload, rounds } = tree(false);
        const state = DrawOrder.resolve(payload, rounds);
        expect(state.status).toBe('unchecked');
        expect(state.label).toBe('Order unchecked');
        expect(state.defaultLayout).toBe('bracket');
        expect(state.listAvailable).toBe(true);
        expect(state.banner).toBe('');
        expect(state.bracketSecondary).toBe(false);
    });

    it('prefers payload slotOrderVerified over a disagreeing round flag', () => {
        const { rounds } = tree(false);
        const state = DrawOrder.resolve({ slotOrderVerified: true }, rounds);
        expect(state.status).toBe('verified');
    });

    it('falls back to round flags when the payload omits the field', () => {
        const { rounds } = tree(true);
        expect(DrawOrder.resolve({}, rounds).status).toBe('verified');
        const unverified = tree(false).rounds;
        expect(DrawOrder.resolve({}, unverified).status).toBe('unchecked');
    });

    it('missing flag is unchecked, not verified', () => {
        const state = DrawOrder.resolve({}, [{ round: 'Final', order: 1, matches: [] }]);
        expect(state.status).toBe('unchecked');
        expect(state.label).toBe('Order unchecked');
        expect(state.defaultLayout).toBe('bracket');
    });

    it('does not branch on tour or event', () => {
        const src = readFileSync(new URL('./drawOrder.js', import.meta.url), 'utf8');
        expect(src).not.toMatch(/WTA|ATP|Guadalajara|Monterrey|Sao Paulo|16745|16746|16741/);
    });
});

describe('adjacent-slot fail and ops mismatch', () => {
    it('red when adjacent winners do not feed the next round, list default', () => {
        const { payload, rounds } = tree(false);
        rounds[0].matches[0] = match(0, 'A', 'E', null);
        rounds[0].matches[0].roundId = 9;
        const state = DrawOrder.resolve(payload, rounds);
        expect(state.status).toBe('wrong');
        expect(state.label).toBe('Bracket order wrong');
        expect(state.defaultLayout).toBe('list');
        expect(state.bracketSecondary).toBe(true);
        expect(state.banner).toMatch(/may be wrong/);
        expect(state.banner).toMatch(/list/i);
    });

    it('verified flag does not hide a failed adjacent check', () => {
        const { payload, rounds } = tree(true);
        rounds[0].matches[0] = { ...match(0, 'A', 'E', null), roundId: 9 };
        expect(DrawOrder.resolve(payload, rounds).status).toBe('wrong');
    });

    it('trusts an explicit ops mismatch flag', () => {
        const { rounds } = tree(true);
        const state = DrawOrder.resolve({ slotOrderVerified: true, slotOrderMismatch: true }, rounds);
        expect(state.status).toBe('wrong');
        expect(state.defaultLayout).toBe('list');
        expect(state.banner).toMatch(/may be wrong/);
    });

    it('trusts adjacentSlotsOk false on a round', () => {
        const { payload, rounds } = tree(true);
        rounds[1].adjacentSlotsOk = false;
        expect(DrawOrder.resolve(payload, rounds).status).toBe('wrong');
    });

    it('does not upgrade to red when ops says the tree is ok', () => {
        const { rounds } = tree(false);
        rounds[0].matches[0] = { ...match(0, 'A', 'E', null), roundId: 9 };
        const state = DrawOrder.resolve({ slotOrderVerified: false, adjacentSlotsOk: true }, rounds);
        expect(state.status).toBe('unchecked');
        expect(state.defaultLayout).toBe('bracket');
    });

    it('missing slotIndex fails soft to the API flag', () => {
        const { payload, rounds } = tree(true);
        rounds.forEach(r => r.matches.forEach(m => { delete m.slotIndex; }));
        const state = DrawOrder.resolve(payload, rounds);
        expect(state.status).toBe('verified');
        expect(state.defaultLayout).toBe('bracket');
    });

    it('unfinished children are not a mismatch', () => {
        const { payload, rounds } = tree(false);
        rounds[1].matches.forEach(m => { m.winner = null; });
        expect(DrawOrder.resolve(payload, rounds).status).toBe('unchecked');
    });

    it('a bye winner still lines up', () => {
        const rounds = [
            {
                round: 'Quarter-finals', order: 3, matches: [
                    { ...match(0, 'A', 'C', null), roundId: 9 },
                ],
            },
            {
                round: 'Round of 16', order: 4, matches: [
                    { ...match(0, 'A', '', 'player1', { p1: 'A', p2: 'BYE' }), roundId: 7 },
                    { ...match(1, 'C', 'D', 'player1'), roundId: 7 },
                ],
            },
        ];
        expect(DrawOrder.resolve({ slotOrderVerified: false }, rounds).status).toBe('unchecked');
    });

    it('garbage input does not throw', () => {
        expect(() => DrawOrder.resolve(null, null)).not.toThrow();
        expect(() => DrawOrder.resolve({ slotOrderVerified: 'yes' }, [{ matches: null }])).not.toThrow();
        expect(DrawOrder.resolve(null, null).status).toBe('unchecked');
    });
});

describe('incomplete slots', () => {
    it('reports N of M when a slot has no real name', () => {
        const rounds = [{
            round: 'Round of 16',
            order: 4,
            matches: [
                { ...match(0, 'A', 'B', null), roundId: 7 },
                { ...match(1, 'C', 'D', null, { p1: 'C', p2: 'TBD' }), roundId: 7 },
                { ...match(2, 'E', '', null, { p1: 'E', p2: '' }), roundId: 7 },
                { ...match(3, 'G', 'H', null, { p1: 'G', p2: 'BYE' }), roundId: 7 },
            ],
        }];
        const state = DrawOrder.resolve({ slotOrderVerified: true }, rounds);
        expect(state.slotLabel).toBe('2 of 4 slots');
        expect(state.status).toBe('verified');
    });

    it('omits the count when every published slot is named', () => {
        const { payload, rounds } = tree(true);
        expect(DrawOrder.resolve(payload, rounds).slotLabel).toBe('');
    });

    it('displayPlayerName keeps BYE and never invents a surname', () => {
        expect(DrawOrder.displayPlayerName('BYE')).toBe('BYE');
        expect(DrawOrder.displayPlayerName('')).toBe('TBD');
        expect(DrawOrder.displayPlayerName('  tbd ')).toBe('TBD');
        expect(DrawOrder.displayPlayerName(null)).toBe('TBD');
        expect(DrawOrder.displayPlayerName('<img src=x onerror=alert(1)>')).toBe('<img src=x onerror=alert(1)>');
    });
});

describe('draws page wiring', () => {
    const drawsSrc = readFileSync(new URL('./draws.js', import.meta.url), 'utf8');
    const drawsHtml = readFileSync(new URL('./draws.html', import.meta.url), 'utf8');
    const swSrc = readFileSync(new URL('./sw.js', import.meta.url), 'utf8');
    const orderSrc = readFileSync(new URL('./drawOrder.js', import.meta.url), 'utf8');

    function fnBody(src, name) {
        const start = src.indexOf('function ' + name + '(');
        expect(start).toBeGreaterThan(-1);
        let depth = 0;
        let seen = false;
        for (let i = start; i < src.length; i++) {
            if (src[i] === '{') { depth++; seen = true; }
            else if (src[i] === '}') {
                depth--;
                if (seen && depth === 0) return src.slice(start, i + 1);
            }
        }
        throw new Error('unclosed ' + name);
    }

    it('loads drawOrder.js and paints chip, banner, and list with textContent', () => {
        expect(drawsHtml).toMatch(/<script src="drawOrder\.js"><\/script>\s*<script src="draws\.js"><\/script>/);
        expect(drawsHtml).toMatch(/id="drawOrderTools"/);
        expect(drawsHtml).toMatch(/id="drawOrderBanner"/);
        expect(orderSrc).not.toMatch(/innerHTML|insertAdjacentHTML|outerHTML|document\.write/);
        for (const name of ['syncDrawOrderChrome', 'renderSlotList', 'buildFlatRow', 'clearDrawOrderChrome']) {
            const body = fnBody(drawsSrc, name);
            expect(body).not.toMatch(/innerHTML|insertAdjacentHTML|outerHTML|document\.write/);
            expect(body).toMatch(/textContent/);
        }
        expect(fnBody(drawsSrc, 'syncDrawOrderChrome')).toMatch(/createElement/);
        expect(fnBody(drawsSrc, 'buildFlatRow')).toMatch(/displayPlayerName/);
    });

    it('renders bracket player names with textContent', () => {
        const bracketSrc = readFileSync(new URL('./components/DrawBracket.js', import.meta.url), 'utf8');
        expect(bracketSrc).toMatch(/function buildPlayerRow\(/);
        expect(bracketSrc).not.toMatch(/function pRowHtml\(/);
        const body = fnBody(bracketSrc, 'buildPlayerRow');
        expect(body).toMatch(/textContent/);
        expect(body).not.toMatch(/innerHTML|insertAdjacentHTML/);
    });

    it('does not add a CDN script on the draws page', () => {
        const srcs = [...drawsHtml.matchAll(/<script[^>]+src=['"]([^'"]+)['"]/g)].map(m => m[1]);
        const third = srcs.filter(s => /^https?:\/\//.test(s));
        expect(third).toEqual(['https://static.cloudflareinsights.com/beacon.min.js']);
    });

    it('bumps the service worker to tw-v45 and precaches drawOrder.js', () => {
        expect(swSrc).toMatch(/CACHE_VERSION\s*=\s*'tw-v45'/);
        expect(swSrc).not.toMatch(/tw-v44/);
        expect(swSrc).toMatch(/'\/drawOrder\.js'/);
        expect(drawsHtml).toMatch(/styles\.css\?v=tw45/);
    });
});
