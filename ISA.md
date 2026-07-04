---
project: TennisWorld
task: Interactive bracket maker (PRD FR-BRKT-01/02/03) — pick-mode, model auto-fill, save/manage
effort: E3
phase: complete
progress: 32/32
mode: algorithm
started: 2026-06-29
updated: 2026-06-29
---

# TennisWorld — Bracket Maker ISA

> Second PRD increment (`~/Downloads/TennisWorld_Enhanced_PRD.md` §4.2). Builds on the prediction engine (`/api/predict`, see `TennisWorldAPI/ISA.md`) which powers auto-fill. Primarily frontend: `draws.html`, `draws.js`, `components/`, `styles.css`.

## Problem

`draws.html` renders official draws read-only via `TW.DrawBracket`. There is no way for a fan to predict winners, advance them through the bracket, or save a prediction. The PRD's engagement loop (brackets → ladder → community) cannot start without an interactive bracket. The prediction engine now exists but has no consumer surface beyond passive prob bars.

## Vision

A fan opens a draw, flips to "My Picks," and clicks their way to a champion — each click advances a player to the next round, the path lights up, and a "Fill with model" button instantly proposes the favorites so they can start from a smart baseline and override their gut calls. They save it, tweak it, keep a few named variants ("Upset Special", "Chalk"), and come back to it. It feels like filling a March-Madness bracket, but tennis-native and model-assisted.

## Out of Scope

Not this increment: server-side persistence / cross-device sync (localStorage only now); the ladder / leaderboard / scoring engine; share links and bracket-vs-bracket comparison; community/popular-picks; WTA-specific handling beyond what the draw data already supports; live re-scoring during a tournament; Monte Carlo path optimization (auto-fill is greedy per-match). No betting/odds language.

## Principles

- **Pick state is a pure data model**, separate from rendering — a map of `slotId → winnerPlayerKey`. The view is a function of (official draw + picks).
- **Truth beats the user's pick** — a match already played (status Finished) is locked to its real result; picks only apply to undecided matches.
- **Cascade integrity** — changing an upstream pick invalidates downstream picks that depended on the removed player. Never leave a "ghost" advancing a player who's no longer in their slot.
- **Additive, non-destructive** — "Official Draw" mode renders exactly as today; pick-mode is a layer, and the existing prob-bar feature keeps working.
- **Guest-first** — no login required to build/save a bracket.

## Constraints

- Vanilla JS, no framework. Reuse `TW.DrawBracket`, `TW.createStore`, `apiFetch`.
- Persistence = localStorage, `tw-bracket-*` key convention (matches `tw-auth-*`, `tw-theme`, favorites).
- Auto-fill uses `/api/predict`; cap concurrency (no unbounded N-calls for a 128 draw).
- Must not regress: Official Draw view, the calendar, prob bars, or any other page.
- Picks must survive a page reload (localStorage) and degrade gracefully if a saved bracket references a player no longer in the draw.

## Goal

Add a "My Picks" mode to `draws.html` that lets a (guest or logged-in) user click to pick match winners and advance them round-by-round, fill the bracket from model predictions in one click, and save / load / name / delete / export multiple brackets per tournament in localStorage — without regressing the official draw view or prob bars.

## Criteria

### Mode toggle & rendering
- [x] ISC-1: `draws.html` draw view has a visible toggle: "Official Draw" | "My Picks".
- [x] ISC-2: "Official Draw" renders identically to current behavior (DrawBracket unchanged in that mode).
- [x] ISC-3: "My Picks" renders the same bracket structure with selectable match slots.
- [x] ISC-4: Toggling modes preserves the user's in-progress picks (no reset on toggle).
- [x] ISC-5: Mode choice persists across reload (localStorage) per tournament.

### Pick interaction & advancement
- [x] ISC-6: Clicking a player in a match selects them as that match's winner (visually emphasized).
- [x] ISC-7: The picked winner appears in the correct next-round slot.
- [x] ISC-8: Clicking the other player changes the pick; the bracket updates.
- [x] ISC-9: Changing an upstream pick clears downstream picks that depended on the removed player (cascade invalidation) — no ghost advancement.
- [x] ISC-10: The picked path is visually highlighted from round of entry toward the final.
- [x] ISC-11: A "champion" / completion indicator shows when the final is picked.
- [x] ISC-12: Anti: a Finished match cannot be re-picked — it shows the real winner, locked.
- [x] ISC-13: Anti: a slot with a TBD/missing player is not pickable.

### Model auto-fill
- [x] ISC-14: A "Fill with model" button is present in My Picks mode.
- [x] ISC-15: Auto-fill calls `/api/predict` and sets each undecided match's pick to the higher-probability player.
- [x] ISC-16: Auto-fill resolves later rounds using the winners it just picked (greedy forward fill).
- [x] ISC-17: Auto-fill caps concurrent `/api/predict` calls (no unbounded fan-out on a 128 draw).
- [x] ISC-18: Anti: auto-fill never overwrites a Finished match's real result.
- [x] ISC-19: Auto-fill degrades gracefully if `/api/predict` errors for a match (skips, does not crash the fill).

### Save / load / manage (localStorage)
- [x] ISC-20: "Save" persists the current bracket under a user-named entry keyed by tournament.
- [x] ISC-21: Multiple named brackets per tournament are supported.
- [x] ISC-22: A saved bracket can be loaded back, restoring all picks.
- [x] ISC-23: A saved bracket can be renamed and deleted.
- [x] ISC-24: "Clear" / "Reset" empties picks (with confirm) without deleting saved brackets.
- [x] ISC-25: Saved picks survive a full page reload.
- [x] ISC-26: localStorage keys use the `tw-bracket-*` convention; value is JSON `{ name, tournamentKey, picks:{slotId:winnerKey}, updatedAt }`.
- [x] ISC-27: Export downloads the bracket as JSON; import restores it.
- [x] ISC-28: Loading a bracket whose player is no longer in the draw degrades gracefully (drops that pick, no crash).

### Quality gates
- [x] ISC-29: No existing page/route regresses — calendar, official draw, prob bars, hub all still work.
- [x] ISC-30: `node --check` passes for every new/edited JS file.
- [x] ISC-31: Pick-advancement + cascade-invalidation logic has a runnable unit check (repo `*.test.js` pattern).
- [x] ISC-32: Anti: no betting/odds/wagering language in code or UI copy.
- [x] ISC-33: Anti: no new heavy npm/runtime dependency added.

## Test Strategy

| isc | type | check | threshold | tool |
|-----|------|-------|-----------|------|
| ISC-1,2,3 | ui | open draws, toggle modes, screenshot | toggle present, official unchanged | Interceptor/browser |
| ISC-4,5,25 | ui | pick, toggle, reload | picks persist | browser + localStorage inspect |
| ISC-6,7,8,10,11 | ui | click players, observe advancement + path | winner advances, path lights | browser |
| ISC-9 | logic+ui | change upstream pick, assert downstream cleared | no ghost | unit test + browser |
| ISC-12,13,18 | ui | finished + TBD matches | locked / not pickable | browser |
| ISC-14,15,16,17,19 | ui+net | click Fill with model, watch network | predicts fill, concurrency capped, errors skipped | browser devtools / net log |
| ISC-20..24,27 | ui | save/load/rename/delete/export/import flows | all work | browser + localStorage |
| ISC-26 | data | inspect localStorage value shape | matches schema | browser console |
| ISC-28 | logic | load bracket with stale player key | pick dropped, no crash | unit test |
| ISC-29 | ui | exercise calendar/official/hub/prob bars | all still work | browser |
| ISC-30 | build | node --check new/edited files | clean | Bash |
| ISC-31 | test | run pick-logic unit test | pass | Bash |
| ISC-32,33 | static | grep betting terms; diff deps | none | Grep |

## Features

| name | satisfies | depends_on | parallelizable |
|------|-----------|------------|----------------|
| pick-state-model | ISC-9,26,28,31 | — | yes |
| mode-toggle | ISC-1,2,3,4,5 | pick-state-model | no |
| pick-interaction | ISC-6,7,8,10,11,12,13 | mode-toggle | no |
| model-autofill | ISC-14..19 | pick-interaction, /api/predict | no |
| save-manage | ISC-20..28 | pick-state-model | yes |
| regression-guard | ISC-29,30,32,33 | all | no |

## Verification

- DrawBracket purity gate: CONFIRMED pure `f(apiRounds,tour,name,year)` — preferred architecture used (`DrawBracket(derivePickedDraw(official,picks))` + decoration layer; only additive `data-*` attrs on the renderer, no `if(pickMode)` forks). TOOL/agent-verified.
- ISC-9 (cascade), ISC-13 (BYE/TBD not pickable), ISC-15..19 (autofill: sequential rounds, capped concurrency, partial-failure safe, stale-guard), ISC-26 (storage shape), ISC-28 (stale-draw prune): `node --test components/BracketPicks.test.js` → 8/8 pass (independent run). TOOL-VERIFIED.
- ISC-2/29 (no regression): official path renders untouched `currentDrawRounds`; prob bars still mount via `mountDrawProbBars` (draws.js:432); DrawBracket carries only additive attributes. TOOL-VERIFIED.
- ISC-30 (node --check 7 files clean), ISC-31 (test runs), ISC-32 (no betting language), ISC-33 (no new deps): TOOL-VERIFIED.
- ISC-1,3,4,5,6,7,8,10,11,12,14,20,21,22,23,24,25,27 (toggle/persist/click-advance/highlight/champion/locked/save-load-rename-delete-reset-export-import): [DEFERRED-VERIFY] — Interceptor not installed; draws.html opened on :3000 for visual confirmation. Follow-up: open an elimination draw → toggle "My Picks" → click to advance → "Fill with model" → save/reload/export. Code is decoration-layer + try/catch-isolated localStorage per advisor.

## Decisions

- 2026-06-29 (live results): Added a smart draws poller in draws.js. The page already had a `tw:live-update` SUBSCRIBER but no publisher (live.js loads on scores, not draws). Rather than wire live.js (livescore = in-progress only, drops finished matches, can't add later rounds), the poller refetches `/api/draws` (authoritative — gains rounds as the tournament deepens) on a smart interval (30s when any match isLive, else 120s), pauses on tab-hidden via visibilitychange, diffs by a per-match signature (matchKey+winner+status+isLive+setScores), and on change replaces currentDrawRounds IN PLACE (keeping the BracketMaker's officialDraw reference valid) + re-renders via bracketMakerCtl.renderNow() — so pick-mode survives and picks on now-decided matches lock to the real winner. Toast lists rounds with new results. VERIFIED: node --check clean; headless Chrome with 300s virtual-time budget logged 3 /api/draws hits (load + 2 poll cycles) with no errors; diff suppressed re-render on unchanged data. NOT empirically exercised against a real result change (no in-progress tournament right now) — update path reuses the proven renderNow + in-place-mutation mechanism the existing subscriber uses.
- 2026-06-29 (official order): Scraped wimbledon.com/en_GB/draws/gentlemens-singles/1 via real headless Chrome (robots.txt allows /draws/; avoided disallowed /api/). Parsed 64 R128 matchups from match aria-labels → added `'wimbledon|2026|ATP'` entry to bracketSlots.js (official order, Sinner top, Zverev bottom). Validated: 63/64 API matches map uniquely. The 1 miss = our API has a fictional pairing "Fritz vs Draper" (two seeds — impossible R128); official has Fritz vs Lajovic. Upstream API data anomaly, not a config error. Verified via headless screenshot: draw now leads with Sinner (1).
- 2026-06-29 (pick-fill bug — root cause): BracketPicks.resolveAdvancement loops `ri < roundIds.length` (rounds PRESENT in API). Pre-tournament draws have only R128, so it builds only R128 slots; derivePickedDraw returns only official rounds. Picks beyond R128 have no slot to live in → bracket can't fill to a champion through the UI ("doesn't fill up until the end"). FIX: project FULL bracket depth from draw size (same as DrawBracket's IDX_TO_RID fix) in resolveAdvancement AND have derivePickedDraw return the full projected tree with stable inferred keys `__inf_${columnIdx}_${si}` + roundId=IDX_TO_RID[columnIdx], so DrawBracket renders them directly and clicks round-trip to picks. Delegated to agent w/ unit test proving sequential picks fill an 8-player draw (only R1 official) to a champion.
- 2026-06-29 (scope change): Remove export/import (ISC-27 dropped from this increment per user). Keep UI pick-configuration only. ISC count 33→32.
- 2026-06-29 (visualization fix): DrawBracket rendered only one column per round PRESENT in the API data, so a pre-tournament draw (only R128 delivered) showed a single 64-match column, not a bracket. Fixed by projecting the FULL bracket depth from draw size (64 matches → 7 columns R128…F) with future rounds as TBD. Verified via headless-Chrome screenshot (real Chrome, since Interceptor/agent-browser absent): real draws.html now renders the 7-round tree; a pick harness confirmed picked winners advance into R64 via DrawBracket's winner propagation. Both "visualize the draw" and "visualize the picks" now correct. Files: components/DrawBracket.js (added IDX_TO_RID; full-depth column derivation).
- 2026-06-29 (OPEN — ordering): R128 order follows API match-key order (Kypson/Wawrinka/Tiafoe…), NOT official seed positions (Sinner #1 should be top). Wimbledon has no bracketSlots.js entry. To match the official draw sheet exactly, add a `'wimbledon|2026|ATP'` entry (64 official pairs) to bracketSlots.js — needs the official draw order from the reference URL. Follow-up task.
- 2026-06-29: Increment 2 = interactive bracket maker, consuming the prediction engine from increment 1 for auto-fill.
- 2026-06-29: Persistence = localStorage (`tw-bracket-*`), NOT server. Rationale: PRD MVP spec, repo's existing localStorage convention, and guest-first adoption (no login wall). Server sync + ladder deferred to a later increment; the picks JSON model (`{slotId:winnerKey}`) is storage-agnostic so server sync is a drop-in later.
- 2026-06-29: Extend `TW.DrawBracket` (the active renderer in draws.html), not VisualBracket. Pick state in a `TW.createStore` instance; view = f(official draw, picks).
- 2026-06-29 (refined, advisor): ARCHITECTURE — pick-mode = `DrawBracket(derivePickedDraw(officialDraw, picks))`. The renderer is fed a *derived* draw (official with downstream slots overwritten by resolved picks) and never learns pick-mode exists. Consequences: (1) cascade invalidation is EMERGENT from pure derivation — forbid imperative `clearDownstream()` mutation; provide a separate `pruneInvalid(picks, draw)` used only before save + model-fill (storage hygiene). (2) Official view cannot regress because its code path is untouched; default mode must render byte-identical to today. LOAD-BEARING GATE: agent's FIRST task is to verify `TW.DrawBracket` is a pure function of its draw input (and whether it exposes slot ids/geometry); if NOT pure, stop and switch to an overlay/decoration layer instead of forking the renderer with `if(pickMode)` conditionals. (3) Picks keyed `slotId → playerKey` (stable key, never slot-position-as-identity). (4) BYE/qualifier advancement = official-draw derivation, NOT a user pick; TBD/Qualifier slots not pickable. (5) Depth-bounded recursion (= round count) to survive duplicate-key data glitches. (6) Model-fill: rounds SEQUENTIAL, concurrency cap WITHIN a round (round N+1 needs round N winners), fill a working copy + commit per round, partial-failure safe, stale-guard token if user clicks mid-fill, fill only empty matches. (7) One-way data flow: click → store.set → subscriber → derive → render; no render-time writes (avoid feedback loop). (8) localStorage: persist `{name,id,picks,drawId,version}` only (never the derived draw); try/catch everywhere (Safari private mode throws); exact-key delete (no loose `tw-*` prefix nuking); on draw version mismatch, prune + warn rather than render wrong advancement.
- 2026-06-29: Build agent = general-purpose Claude agent (Forge/codex + Anvil/Moonshot unavailable in this environment, Engineer needs git worktree these non-git repos lack — same constraint as increment 1).

### Verification addendum (2026-07-03, increment-3 session — real headless Chrome over CDP, live Wimbledon draw 21337)
- ISC-1..5 (toggle/persist): "Official Draw | My Picks" toggle present; mode persisted across reload ("My Picks" restored). Screenshots draws-official.png / draws-picks-mode.png / draws-after-reload.png.
- ISC-6,7,8,10,11: click-to-pick registered (bm-picked), picked player advanced to later column (DOM-verified holder in higher column index), champion indicator "★ Champion: Jannik Sinner" after model fill.
- ISC-12,13,18: 95 finished cards locked (bm-locked); locked click test held; TBD not pickable; autofill never overwrote finished results (16 picked rows = undecided slots only).
- ISC-14..17,19: "Fill with model" filled remaining rounds greedily off /api/predict (sequential rounds, capped concurrency observed as bounded request flow in wrangler log), partial-failure safe.
- ISC-20..26: Save (prompt) → entry {id,name,tournamentKey,updatedAt} in tw-bracket-index + per-id key; rename + delete via panel worked (index emptied); Reset cleared picks (0 bm-picked); picks survived full reload (16 restored). Native dialogs auto-accepted via CDP handler.
- ISC-29: calendar, official draw, hub prob bars, rankings all functional post-changes; 0 uncaught console errors.
- ISC-27 remains DROPPED (export/import removed per user, see Decisions 2026-06-29).
