// ===================================
// TennisWorld — BracketPicks unit tests
// ===================================
// Runnable with zero new deps via Node's built-in runner:
//   node --test components/BracketPicks.test.js
//
// Proves: pick advancement, cascade invalidation via PURE derivation (change an
// upstream pick → downstream pick is gone from the derived draw), BYE/TBD not
// pickable, and load-against-changed-draw prunes safely.
// ─────────────────────────────────────────────────────────────────────────────

const test = require('node:test');
const assert = require('node:assert');
const BP = require('./BracketPicks.js');

// ── Test fixture: a 4-player single-elimination draw ─────────────────────────
//   R1 (roundId 9): m1 = A vs B,  m2 = C vs D
//   SF? Here roundId 9 = R16-ish; use 9 (R16) and 10 (QF) then 12 (Final)?
// To keep the bracket math simple we model a 4-slot → 2-slot → 1-slot bracket
// using bracket round IDs 9 (4 first-round slots? no) — instead use a clean
// 4-match-first-round shape with rounds 9 (R16: 4 matches? that's 8 players).
// Simplest valid 4-player draw: first round = QF(roundId 10) has 2 matches,
// then Final (roundId 12) has 1 match.
function fourPlayerDraw() {
    return [
        // Final-first order like the API, but derivation buckets by roundId so order is fine.
        { round: 'Final', matches: [
            { matchKey: '100', roundId: 12, status: 'Not Started', winner: null,
              player1Key: '', player1Name: 'TBD', player2Key: '', player2Name: 'TBD' },
        ]},
        { round: 'Semifinals', matches: [
            { matchKey: '10', roundId: 10, status: 'Not Started', winner: null,
              player1Key: 'A', player1Name: 'Player A', player2Key: 'B', player2Name: 'Player B' },
            { matchKey: '11', roundId: 10, status: 'Not Started', winner: null,
              player1Key: 'C', player1Name: 'Player C', player2Key: 'D', player2Name: 'Player D' },
        ]},
    ];
}

test('derivePickedDraw advances a picked winner (writes winner side)', () => {
    const draw = fourPlayerDraw();
    const picks = { '10': 'A' };               // pick A over B
    const derived = BP.derivePickedDraw(draw, picks);
    const sf = derived.find(r => r.round === 'Semifinals');
    const m10 = sf.matches.find(m => m.matchKey === '10');
    assert.strictEqual(m10.winner, 'player1', 'picked side A should be winner=player1');
    // Pure: official input is untouched.
    const origM10 = draw.find(r => r.round === 'Semifinals').matches.find(m => m.matchKey === '10');
    assert.strictEqual(origM10.winner, null, 'official draw must not be mutated');
});

test('resolveAdvancement places the picked winner in the next-round slot', () => {
    const draw = fourPlayerDraw();
    const picks = { '10': 'A', '11': 'C' };
    const slots = BP.resolveAdvancement(BP.derivePickedDraw(draw, picks));
    // slots[0] = QF (2 matches), slots[1] = Final (1 match)
    const finalMatch = slots[slots.length - 1][0];
    assert.strictEqual(String(finalMatch.player1Key), 'A', 'A advances into final slot p1');
    assert.strictEqual(String(finalMatch.player2Key), 'C', 'C advances into final slot p2');
});

test('cascade invalidation is EMERGENT: changing upstream removes downstream pick from derived draw', () => {
    const draw = fourPlayerDraw();
    // Pick A to win QF1, C to win QF2, then pick A to win the FINAL.
    let picks = { '10': 'A', '11': 'C', '100': 'A' };
    let slots = BP.resolveAdvancement(BP.derivePickedDraw(draw, picks));
    let finalMatch = slots[slots.length - 1][0];
    assert.strictEqual(finalMatch.winner, 'player1', 'A is the champion (final p1)');

    // Now CHANGE the upstream pick: B wins QF1 instead of A.
    picks = Object.assign({}, picks, { '10': 'B' });
    slots = BP.resolveAdvancement(BP.derivePickedDraw(draw, picks));
    finalMatch = slots[slots.length - 1][0];
    // The final now has B (not A) in p1; the old champion pick (A) can't resolve.
    assert.strictEqual(String(finalMatch.player1Key), 'B', 'B now occupies the final slot');
    assert.strictEqual(finalMatch.winner, null, 'stale champion pick (A) no longer resolves — no ghost');

    // pruneInvalid (storage hygiene) drops the orphaned final pick.
    const pruned = BP.pruneInvalid(picks, draw);
    assert.ok(!('100' in pruned) || pruned['100'] === 'B' === false,
        'orphaned final pick for A should be dropped by pruneInvalid');
    assert.strictEqual(pruned['100'], undefined, 'champion pick for A is gone after prune');
    assert.strictEqual(pruned['10'], 'B', 'valid upstream pick survives prune');
});

test('BYE / TBD / qualifier slots are not pickable', () => {
    const finalMatchTBD = { matchKey: '100', roundId: 12, status: 'Not Started', winner: null,
        player1Key: '', player1Name: 'TBD', player2Key: '', player2Name: 'TBD' };
    assert.strictEqual(BP.isPickable(finalMatchTBD), false, 'empty/TBD match not pickable');

    const byeMatch = { matchKey: '5', roundId: 10, status: 'Not Started', winner: null,
        player1Key: 'A', player1Name: 'Player A', player2Key: 'bye', player2Name: 'BYE' };
    assert.strictEqual(BP.isPickable(byeMatch), false, 'BYE match not pickable');

    const qualMatch = { matchKey: '6', roundId: 10, status: 'Not Started', winner: null,
        player1Key: 'A', player1Name: 'Player A', player2Key: 'q1', player2Name: 'Qualifier' };
    assert.strictEqual(BP.isPickable(qualMatch), false, 'Qualifier match not pickable');

    const real = { matchKey: '7', roundId: 10, status: 'Not Started', winner: null,
        player1Key: 'A', player1Name: 'Player A', player2Key: 'B', player2Name: 'Player B' };
    assert.strictEqual(BP.isPickable(real), true, 'two-known-player match IS pickable');
});

test('Finished match is locked: not pickable, derivation keeps official winner', () => {
    const draw = fourPlayerDraw();
    // QF1 already played: B beat A.
    draw.find(r => r.round === 'Semifinals').matches[0] = {
        matchKey: '10', roundId: 10, status: 'Finished', winner: 'player2',
        player1Key: 'A', player1Name: 'Player A', player2Key: 'B', player2Name: 'Player B',
    };
    assert.strictEqual(BP.isPickable(draw.find(r=>r.round==='Semifinals').matches[0]), false,
        'finished match not pickable');
    // A pick trying to override the finished result is ignored by derivation.
    const derived = BP.derivePickedDraw(draw, { '10': 'A' });
    const m10 = derived.find(r => r.round === 'Semifinals').matches.find(m => m.matchKey === '10');
    assert.strictEqual(m10.winner, 'player2', 'truth (B) beats the pick (A)');
    // pruneInvalid drops the pick against a finished match.
    const pruned = BP.pruneInvalid({ '10': 'A' }, draw);
    assert.strictEqual(pruned['10'], undefined, 'pick against finished match dropped');
});

test('load against a CHANGED draw prunes safely (player no longer in draw, no crash)', () => {
    const draw = fourPlayerDraw();
    // A saved bracket references player "Z" in a match that no longer has Z,
    // and a match key "999" that does not exist in the current draw.
    const savedPicks = { '10': 'Z', '999': 'A', '11': 'C' };
    let pruned;
    assert.doesNotThrow(() => { pruned = BP.pruneInvalid(savedPicks, draw); }, 'must not crash');
    assert.strictEqual(pruned['10'], undefined, 'pick for absent player Z dropped');
    assert.strictEqual(pruned['999'], undefined, 'pick for absent match dropped');
    assert.strictEqual(pruned['11'], 'C', 'still-valid pick survives');
});

test('championKey returns the picked final winner, null otherwise', () => {
    const draw = fourPlayerDraw();
    assert.strictEqual(BP.championKey(draw, {}), null, 'no champion with no picks');
    const picks = { '10': 'A', '11': 'C', '100': 'A' };
    assert.strictEqual(String(BP.championKey(draw, picks)), 'A', 'A is champion');
});

// ── Fill-to-champion: ONLY round 1 is official, picks must fill the whole tree ──
// An 8-player draw delivered pre-tournament: the API gives ONLY the first round
// (4 matches, roundId 9). R2 (SF) and the Final are NOT in the official draw — they
// must be PROJECTED by derivePickedDraw so picks can attach to them and the bracket
// fills all the way to a single champion through sequential picks. This is the crux
// bug: before the fix, only round 1 had slots and the bracket could never complete.
function eightPlayerR1Only() {
    return [
        { round: 'Round 1', order: 0, matches: [
            { matchKey: '1', roundId: 9, status: 'Not Started', winner: null,
              player1Key: 'A', player1Name: 'Player A', player2Key: 'B', player2Name: 'Player B' },
            { matchKey: '2', roundId: 9, status: 'Not Started', winner: null,
              player1Key: 'C', player1Name: 'Player C', player2Key: 'D', player2Name: 'Player D' },
            { matchKey: '3', roundId: 9, status: 'Not Started', winner: null,
              player1Key: 'E', player1Name: 'Player E', player2Key: 'F', player2Name: 'Player F' },
            { matchKey: '4', roundId: 9, status: 'Not Started', winner: null,
              player1Key: 'G', player1Name: 'Player G', player2Key: 'H', player2Name: 'Player H' },
        ]},
    ];
}

test('fill-to-champion: an only-round-1 draw fills completely through sequential picks', () => {
    const draw = eightPlayerR1Only();

    // ── Round 1: pick all four winners (A, C, E, G). ──
    let picks = { '1': 'A', '2': 'C', '3': 'E', '4': 'G' };
    let derived = BP.derivePickedDraw(draw, picks);

    // The derived draw must now have THREE columns (R1 → SF → Final), even though the
    // API only delivered one. Columns sorted earliest→latest by the model.
    assert.strictEqual(derived.length, 3, 'derived draw projects R1 + SF + Final (3 columns)');

    // Locate the projected SF column (2 matches) and the Final (1 match).
    const sf = derived.find(r => r.matches.length === 2);
    const final = derived.find(r => r.matches.length === 1);
    assert.ok(sf, 'projected SF column exists');
    assert.ok(final, 'projected Final column exists');

    // The R1 winners must now sit in the SF as REAL, pickable players with stable
    // '__inf_1_*' keys (column-index based, matching DrawBracket's renderer).
    const sf0 = sf.matches[0];
    const sf1 = sf.matches[1];
    assert.strictEqual(sf0.matchKey, '__inf_1_0', 'SF match 0 carries stable column-index key');
    assert.strictEqual(sf1.matchKey, '__inf_1_1', 'SF match 1 carries stable column-index key');
    assert.strictEqual(String(sf0.player1Key), 'A', 'A advanced into SF slot 0 p1');
    assert.strictEqual(String(sf0.player2Key), 'C', 'C advanced into SF slot 0 p2');
    assert.strictEqual(String(sf1.player1Key), 'E', 'E advanced into SF slot 1 p1');
    assert.strictEqual(String(sf1.player2Key), 'G', 'G advanced into SF slot 1 p2');
    assert.strictEqual(BP.isPickable(sf0), true, 'SF match 0 is pickable (two real players)');
    assert.strictEqual(BP.isPickable(sf1), true, 'SF match 1 is pickable (two real players)');

    // ── Round 2 (SF): pick both winners (A over C, E over G) under the stable keys. ──
    picks = Object.assign({}, picks, { '__inf_1_0': 'A', '__inf_1_1': 'E' });
    derived = BP.derivePickedDraw(draw, picks);
    const final2 = derived.find(r => r.matches.length === 1);
    const fm = final2.matches[0];
    assert.strictEqual(fm.matchKey, '__inf_2_0', 'Final carries stable column-index key');
    assert.strictEqual(String(fm.player1Key), 'A', 'A reached the Final');
    assert.strictEqual(String(fm.player2Key), 'E', 'E reached the Final');
    assert.strictEqual(BP.isPickable(fm), true, 'the Final is pickable');

    // ── Final: pick the champion (A). ──
    picks = Object.assign({}, picks, { '__inf_2_0': 'A' });
    const champ = BP.championKey(draw, picks);
    assert.strictEqual(String(champ), 'A', 'a single champion resolves from only-round-1 data');

    // Round-trip guard: the keys derive emits are the keys we picked under.
    const finalDerived = BP.derivePickedDraw(draw, picks).find(r => r.matches.length === 1).matches[0];
    assert.strictEqual(finalDerived.winner, 'player1', 'champion pick reads back on the projected Final');
});

test('fill-to-champion: keys derive emits round-trip (resolveAdvancement keys == derive keys)', () => {
    const draw = eightPlayerR1Only();
    const picks = { '1': 'A', '2': 'C', '3': 'E', '4': 'G', '__inf_1_0': 'A', '__inf_1_1': 'E', '__inf_2_0': 'A' };
    // Keys present in derive output (what DrawBracket renders into data-match-key).
    const deriveKeys = new Set();
    for (const r of BP.derivePickedDraw(draw, picks)) {
        for (const m of r.matches) deriveKeys.add(String(m.matchKey));
    }
    // Keys present in resolveAdvancement (what BracketMaker.decorate maps picks to).
    const resolveKeys = new Set();
    for (const col of BP.resolveAdvancement(draw, picks)) {
        for (const m of col) if (m) resolveKeys.add(String(m.matchKey));
    }
    // Every pick key must be addressable in BOTH so a pick stored under a rendered
    // card's key is read back by the next derive.
    for (const k of Object.keys(picks)) {
        assert.ok(deriveKeys.has(k), 'derive emits a card for pick key ' + k);
        assert.ok(resolveKeys.has(k), 'resolveAdvancement addresses pick key ' + k);
    }
});

test('depth-bounded: duplicate/glitch keys do not infinite-loop', () => {
    const draw = fourPlayerDraw();
    // Inject a duplicate matchKey to simulate a data glitch.
    draw[1].matches.push({ matchKey: '10', roundId: 10, status: 'Not Started', winner: null,
        player1Key: 'A', player1Name: 'Player A', player2Key: 'B', player2Name: 'Player B' });
    let slots;
    assert.doesNotThrow(() => { slots = BP.resolveAdvancement(BP.derivePickedDraw(draw, { '10': 'A' })); });
    assert.ok(Array.isArray(slots), 'resolves without hanging');
});

// ── Materialization: positional picks survive draw growth ────────────────────
// Pre-tournament the API delivers only the first round; later-round picks are
// stored under '__inf_{col}_{slot}'. When the API later delivers that round
// with real matchKeys, the pick must still render and pruneInvalid must
// migrate it to the real key.

function fourPlayerDrawWithRealFinal() {
    // Same draw, but SF matches are Finished (A and C won) and the Final now
    // EXISTS officially with matchKey '100' populated by the API.
    return [
        { round: 'Final', matches: [
            { matchKey: '100', roundId: 12, status: 'Not Started', winner: null,
              player1Key: 'A', player1Name: 'Player A', player2Key: 'C', player2Name: 'Player C' },
        ]},
        { round: 'Semifinals', matches: [
            { matchKey: '10', roundId: 10, status: 'Finished', winner: 'player1',
              player1Key: 'A', player1Name: 'Player A', player2Key: 'B', player2Name: 'Player B' },
            { matchKey: '11', roundId: 10, status: 'Finished', winner: 'player1',
              player1Key: 'C', player1Name: 'Player C', player2Key: 'D', player2Name: 'Player D' },
        ]},
    ];
}

test('positional __inf pick still decides the match after the round materializes', () => {
    // Pick was made pre-tournament: final = column 1, slot 0 → '__inf_1_0'.
    const picks = { '10': 'A', '11': 'C', '__inf_1_0': 'A' };
    const slots = BP.resolveAdvancement(fourPlayerDrawWithRealFinal(), picks);
    const finalMatch = slots[slots.length - 1][0];
    assert.strictEqual(String(finalMatch.matchKey), '100', 'final is the real API match');
    assert.strictEqual(finalMatch.winner, 'player1', 'old positional pick (A) still applies');
});

test('pruneInvalid migrates a positional pick to the real matchKey', () => {
    const picks = { '__inf_1_0': 'A' };
    const pruned = BP.pruneInvalid(picks, fourPlayerDrawWithRealFinal());
    assert.strictEqual(pruned['100'], 'A', 'pick re-keyed to the real final matchKey');
    assert.strictEqual(pruned['__inf_1_0'], undefined, 'positional alias removed');
});

test('real-key pick beats a stale positional alias for the same slot', () => {
    const picks = { '100': 'C', '__inf_1_0': 'A' };
    const pruned = BP.pruneInvalid(picks, fourPlayerDrawWithRealFinal());
    assert.strictEqual(pruned['100'], 'C', 'explicit real-key pick wins');
});
