import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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

    it('does not special-case an event in the status rules', () => {
        const src = readFileSync(new URL('./drawOrder.js', import.meta.url), 'utf8');
        expect(src).not.toMatch(/Guadalajara|Monterrey|Sao Paulo|16745|16746|16741/);
    });
});

describe('verified chip tooltip', () => {
    const dated = 'Checked against the official ATP draw \u00B7 Sep 26';

    it('uses tour and a plain checkedAt date when slotOrderVerification is present', () => {
        const { rounds } = tree(true);
        const state = DrawOrder.resolve({
            slotOrderVerified: true,
            slotOrderVerification: {
                tour: 'ATP',
                sourceHost: 'atptour.com',
                checkedAt: '2026-09-26',
            },
        }, rounds, 'WTA');
        expect(state.status).toBe('verified');
        expect(state.label).toBe('Draw verified');
        expect(state.tooltip).toBe(dated);
        expect(state.tooltip).not.toMatch(/atptour|wtatennis|protennislive|sourceHost/);
        expect(state.defaultLayout).toBe('bracket');
    });

    it('accepts a lowercase tour and does not pad the day', () => {
        const { rounds } = tree(true);
        const state = DrawOrder.resolve({
            slotOrderVerified: true,
            slotOrderVerification: { tour: ' wta ', checkedAt: '2026-01-05' },
        }, rounds, 'ATP');
        expect(state.tooltip).toBe('Checked against the official WTA draw \u00B7 Jan 5');
    });

    it('falls back to the draw tour with no date when the object is absent', () => {
        const { payload, rounds } = tree(true);
        const state = DrawOrder.resolve(payload, rounds, 'WTA');
        expect(state.status).toBe('verified');
        expect(state.label).toBe('Draw verified');
        expect(state.tooltip).toBe('Checked against the official WTA draw');
        expect(state.tooltip).not.toMatch(/\u00B7|Sep|Jan/);
    });

    it('ignores a tour other than ATP or WTA and drops the date', () => {
        const { rounds } = tree(true);
        const state = DrawOrder.resolve({
            slotOrderVerified: true,
            slotOrderVerification: {
                tour: 'ITF',
                sourceHost: 'https://evil.example/draw',
                checkedAt: '2026-09-26',
            },
        }, rounds, 'wta');
        expect(state.status).toBe('verified');
        expect(state.tooltip).toBe('Checked against the official WTA draw');
        expect(state.tooltip).not.toMatch(/ITF|evil|2026|Sep/);
    });

    it('keeps the calendar day in zones on either side of UTC', () => {
        const file = fileURLToPath(new URL('./drawOrder.js', import.meta.url));
        const script = `
            const fs = require('node:fs');
            const vm = require('node:vm');
            const src = fs.readFileSync(${JSON.stringify(file)}, 'utf8');
            const sandbox = { window: { TW: {} } };
            vm.runInNewContext(src, sandbox);
            const state = sandbox.window.TW.DrawOrder.resolve({
                slotOrderVerified: true,
                slotOrderVerification: { tour: 'ATP', checkedAt: '2026-09-26', sourceHost: 'not-a-host.example' },
            }, [], 'WTA');
            process.stdout.write(state.tooltip);
        `;
        for (const tz of ['Pacific/Honolulu', 'Pacific/Kiritimati', 'UTC']) {
            const run = spawnSync(process.execPath, ['-e', script], {
                env: { ...process.env, TZ: tz },
                encoding: 'utf8',
            });
            expect(run.status, run.stderr).toBe(0);
            expect(run.stdout).toBe(dated);
        }
    });

    it('does not treat an instant or an impossible day as a calendar date', () => {
        const { rounds } = tree(true);
        const instant = DrawOrder.resolve({
            slotOrderVerified: true,
            slotOrderVerification: { tour: 'ATP', checkedAt: '2026-09-26T00:00:00.000Z' },
        }, rounds, 'WTA');
        expect(instant.tooltip).toBe('Checked against the official ATP draw');
        const impossible = DrawOrder.resolve({
            slotOrderVerified: true,
            slotOrderVerification: { tour: 'ATP', checkedAt: '2026-02-31' },
        }, rounds, 'WTA');
        expect(impossible.tooltip).toBe('Checked against the official ATP draw');
    });

    it('leaves unchecked and wrong chips without a verification tooltip', () => {
        const unchecked = tree(false);
        unchecked.payload.slotOrderVerification = {
            tour: 'ATP',
            sourceHost: 'atptour.com',
            checkedAt: '2026-09-26',
        };
        const uncheckedState = DrawOrder.resolve(unchecked.payload, unchecked.rounds, 'ATP');
        expect(uncheckedState.status).toBe('unchecked');
        expect(uncheckedState.label).toBe('Order unchecked');
        expect(uncheckedState.tooltip).toBe('');
        expect(uncheckedState.defaultLayout).toBe('bracket');
        expect(uncheckedState.banner).toBe('');

        const { rounds } = tree(true);
        const wrongState = DrawOrder.resolve({
            slotOrderVerified: true,
            slotOrderMismatch: true,
            slotOrderVerification: { tour: 'ATP', checkedAt: '2026-09-26', sourceHost: 'atptour.com' },
        }, rounds, 'ATP');
        expect(wrongState.status).toBe('wrong');
        expect(wrongState.label).toBe('Bracket order wrong');
        expect(wrongState.tooltip).toBe('');
        expect(wrongState.defaultLayout).toBe('list');
        expect(wrongState.banner).toMatch(/may be wrong/);
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
        payload.slotOrderVerification = { tour: 'ATP', checkedAt: '2026-09-26', sourceHost: 'atptour.com' };
        const state = DrawOrder.resolve(payload, rounds, 'ATP');
        expect(state.status).toBe('wrong');
        expect(state.tooltip).toBe('');
        expect(state.label).toBe('Bracket order wrong');
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
        expect(fnBody(drawsSrc, 'syncDrawOrderChrome')).toMatch(/setAttribute\('title', state\.tooltip\)/);
        expect(fnBody(drawsSrc, 'syncDrawOrderChrome')).toMatch(/textContent = state\.label/);
        expect(fnBody(drawsSrc, 'resolveDrawOrder')).toMatch(/currentDrawTour/);
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

    it('bumps the service worker to tw-v50 and precaches drawOrder.js', () => {
        expect(swSrc).toMatch(/CACHE_VERSION\s*=\s*'tw-v50'/);
        expect(swSrc).not.toMatch(/tw-v45/);
        expect(swSrc).toMatch(/'\/drawOrder\.js'/);
        expect(swSrc).toMatch(/'\/draws\.js'/);
        expect(drawsHtml).toMatch(/styles\.css\?v=tw45/);
    });
});
