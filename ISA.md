---
project: TennisWorld
task: Home page with vintage curves — blank Scores page, rename nav to Home, cumulative-wins-by-age chart with toggleable metric and customizable top-10 player set
effort: E3
phase: complete
progress: 58/78
mode: algorithm
started: 2026-07-19
updated: 2026-07-26
---

# TennisWorld — Home / Vintage Curves ISA

> Fifth increment. Supersedes the completed bracket-maker ISA (git history preserves it). Spans both repos: two thin routes in `TennisWorldAPI` (`src/routes/vintage.js`, one `apiClient.js` method) and a rebuilt landing page in `TennisWorldUI` (`index.html`, `home.js`, `styles.css`, nav labels in all 6 pages).
> **15 ISCs are [DEFERRED-VERIFY]** — visual/interaction probes require a browser-automation tool and this machine has neither Interceptor nor agent-browser installed. Follow-up task: `vintage-ui-visual-verify` (see Decisions 2026-07-19).

## Problem

The landing page (index.html) is a live-scores hub — ticker, current tournament, today's matches. Nico wants it blanked and replaced by a "Home" page whose centerpiece is a vintage-curve chart: cumulative career metric (matches won first) on Y against player age ("years old") on X, one curve per player, defaulting to the ATP top 10 with a customizable player set. No such data surface exists: the Worker exposes only season aggregates, not match-level curves, and no roster endpoint for a picker.

## Vision

Open tennisworld.dev and the first thing you see is tennis history drawn as trajectories: ten career curves climbing through age, Alcaraz's line visibly steeper than anyone's at 22, Djokovic's stretching past everyone's right edge. Hover any point and see the player, age, and win count. Swap Rune out for Fonseca in two clicks; flip the metric toggle and the same curves re-shape. It reads like a Tufte plate, not a dashboard.

## Out of Scope

Retired legends (Federer, Nadal) — roster v1 is current top-100 rankings; name-search of the full historical player universe is a Phase-2 follow-up. WTA toggle on the home chart (API supports `tour=WTA`; UI ships ATP-only v1). Additional metrics beyond matches won / matches played (titles need tournament-tier joins). Deploying to production (Nico runs `npx wrangler deploy` per runbook). Touching the live-scores components used by other pages (draws, analytics).

## Constraints

- Upstream is RapidAPI `tennis-api-atp-wta-itf` only; pagination param is `pageNo` (verified live — `page` is silently ignored); birthdate only via `/player/profile/{id}`.
- Cloudflare Workers subrequest budget → per-player curve endpoint (≤9 upstream calls), never a bulk 10-player endpoint.
- All upstream access through `src/apiClient.js` `rapidAPI`; KV caching through `cache.js`; match existing route style and registration in `src/index.js`.
- UI stays framework-free vanilla JS + Chart.js 4.4.0 (already the idiom in player.js); Tufte design language; both themes via `data-theme` CSS vars.
- Components ScoreBoard/MatchCard/ProbBar/live.js remain untouched (other pages depend on them); only index.html drops its references.

## Goal

The site's landing page is a "Home" page (nav-labeled everywhere) showing an interactive vintage-curve chart of cumulative matches won by age for a default ATP top 10, with per-player add/remove from a top-100 roster, a working metric toggle, and both new API routes live-verified through `wrangler dev` — visual pass via browser tooling or manual confirmation.

## Criteria

API — roster route
- [x] ISC-1: GET /api/vintage-roster returns top-100 array of {position,id,name,countryAcr} for tour=ATP
- [x] ISC-2: Roster response KV-cached (second call served from cache, no upstream hit)
- [x] ISC-3: Roster route registered in src/index.js GET table

API — player-vintage route
- [x] ISC-4: GET /api/player-vintage?playerKey=N returns {player:{id,name,countryAcr,birthday}, points, totals}
- [x] ISC-5: points entries are {age,w,m} with age ascending and w,m cumulative
- [x] ISC-6: Age computed from profile birthday: (matchDate−birthday)/365.2425d, 2-decimal
- [x] ISC-7: Pagination loop walks pageNo until hasNextPage=false (cap 8 pages)
- [x] ISC-8: Veteran player (>500 matches, e.g. Zverev 24008) returns totals.matches > 500
- [x] ISC-9: totals.wins for Sinner 47275 ≥ 398 (audit floor from last-500 probe)
- [x] ISC-10: Missing playerKey rejects with {ok:false, error} via existing error convention (refined — see Decisions)
- [x] ISC-11: Player-vintage response KV-cached per (tour,playerKey)
- [x] ISC-12: New rapidAPI.playerProfile method in apiClient.js follows existing method style with shape comment
- [x] ISC-13: Existing API tests still pass (bunx vitest run in TennisWorldAPI)

UI — blank + rename
- [x] ISC-14: index.html contains no ticker, tournament-hub, or todays-section markup
- [x] ISC-15: index.html no longer loads scores.js, live.js, ScoreBoard.js, MatchCard.js, ProbBar.js
- [x] ISC-16: Nav label reads "Home" in all 6 HTML files (index, draws, rankings, analytics, player, profile)
- [x] ISC-17: index.html title/OG/footer updated ("Home", footer Explore link renamed)
- [x] ISC-18: shared.js, auth.js, player-panel.js, store.js still load on index (sign-in/theme intact)

UI — vintage chart (visual probes deferred — follow-up `vintage-ui-visual-verify`)
- [DEFERRED-VERIFY] ISC-19: Chart renders ≥1 curve on canvas#vintageChart with Chart.js 4.4.0
- [DEFERRED-VERIFY] ISC-20: X axis titled "Years old", linear, tick range fits data (~15–40)
- [DEFERRED-VERIFY] ISC-21: Y axis titled by active metric, default "Matches won"
- [DEFERRED-VERIFY] ISC-22: Default view fetches roster top 10 and renders 10 curves (minus any missing-birthday skips)
- [DEFERRED-VERIFY] ISC-23: Curves render progressively as each player's fetch resolves
- [DEFERRED-VERIFY] ISC-24: UI fetch concurrency ≤3 simultaneous player-vintage requests
- [DEFERRED-VERIFY] ISC-25: Tooltip shows player name, age, and metric value
- [DEFERRED-VERIFY] ISC-26: Metric toggle switches Matches Won ↔ Matches Played and re-renders without refetch
- [DEFERRED-VERIFY] ISC-27: Player chip × removes a curve immediately
- [DEFERRED-VERIFY] ISC-28: Add-player input (datalist over top-100 roster) adds a curve
- [DEFERRED-VERIFY] ISC-29: Selection persists in localStorage and survives reload
- [DEFERRED-VERIFY] ISC-30: "Reset to Top 10" restores the default set
- [DEFERRED-VERIFY] ISC-31: Chart legible in dark mode (colors from CSS vars, re-render on theme toggle)

Anti-criteria
- [DEFERRED-VERIFY] ISC-32: Anti: no JS console errors on index.html load
- [DEFERRED-VERIFY] ISC-33: Anti: draws/analytics/rankings/player pages unbroken
- [x] ISC-34: Anti: no secrets in any committed file or output; only intended files modified (git diff --stat review)

Increment 2 — Tournaments-won metric (2026-07-25)
- [x] ISC-35: Tier model confirmed — calendar rankId {0 Futures,1 Challenger,2 Main,3 Masters,4 Slam,5 Davis,7 Finals}; tour-level title set = {2,3,4,7}
- [x] ISC-36: getTierMap helper fetches per-year calendars, caches each {id→rankId} year-map (immutable → 30d TTL), merges
- [x] ISC-37: player-vintage points gain cumulative `t` (titles); a title = Final win (roundId 12) with match_winner==pid AND tournament rankId ∈ {2,3,4,7}
- [x] ISC-38: player-vintage cache key bumped v1→v2 (shape change; old entries must not serve without `t`)
- [x] ISC-39: totals gains `titles`; Sinner 47275 titles within ±3 of official 31 (validates tier filter vs raw 34 finals)
- [x] ISC-40: Tournaments-not-in-map are NOT counted as titles (conservative — avoids challenger contamination)
- [DEFERRED-VERIFY] ISC-41: UI METRICS gains `t` entry + third toggle button "Tournaments Won"; toggle re-maps client-side with zero refetch
- [x] ISC-42: Existing API tests still pass (bunx vitest run) after vintage.js change

Increment 3 — Masters 1000 & Grand Slam metrics (2026-07-25)
- [x] ISC-43: MASTERS_TIER=3 / SLAM_TIER=4 constants; points gain cumulative `ms` (Masters) and `gs` (Slam)
- [x] ISC-44: totals gain `masters`, `slams`; cache key bumped v2→v3 (shape change)
- [x] ISC-45: Sinner 47275 masters=10, slams=5 — exact match to player/titles breakdown; both monotonic
- [x] ISC-46: Subset invariant — ms ≤ t and gs ≤ t (Masters+Slam finals are a subset of tour-level titles)
- [DEFERRED-VERIFY] ISC-47: UI METRICS gains `ms`+`gs`; two new toggle buttons "Masters 1000" / "Grand Slams"; zero-refetch re-map
- [x] ISC-48: Existing API tests still pass (bunx vitest run) after change

Increment 4 — Rankings Age column fix (2026-07-26)
- [x] ISC-49: Root cause confirmed — /api/standings returns birthday:null for all players, so rankings computeAge() always yielded null → "—"
- [x] ISC-50: Fixed at ingestion — /api/player-stats now fetches profile birthday (cached 30d) and returns it; rankings enriches Age from there
- [x] ISC-51: player-stats returns birthday for top + deep-ranked players (Sinner/Zverev/Alcaraz/Darderi/Cerundolo/Fils all resolve)
- [x] ISC-52: Ages compute correctly as of 2026-07-26 (Sinner 24, Zverev 29, Alcaraz 23, Darderi 24, Cerundolo 27, Fils 22)
- [x] ISC-53: Age column sorting works — enriched birthday backfilled onto player object so computeAge sort has data
- [DEFERRED-VERIFY] ISC-54: Age cells visibly fill as rows scroll into view (IntersectionObserver enrich) — pixel pass folds into vintage-ui-visual-verify
- [x] ISC-55: Existing API tests still pass; only playerStats.js + rankings.js changed; no secrets

Increment 5 — Washington draw + draw-capture strategy (2026-07-26)
- [x] ISC-56: Root cause of draw-order problem confirmed — upstream fixtures have NO draw-position field; order is unrecoverable from the API
- [x] ISC-57: Pre-tournament incompleteness confirmed — Washington feed had 11/16 singles fixtures (5 missing were all qualifier slots), 0 results
- [x] ISC-58: Authoritative ordered draw obtained from Wikipedia raw wikitext (?action=raw) — not bot-blocked (ATP/official sites are Cloudflare-403 to server fetch)
- [x] ISC-59: All 11 API matchups cross-validate against Wikipedia exactly; seeds reconcile (de Minaur 1 … Fils 8)
- [x] ISC-60: washington|2026|ATP override added to BOTH bracketSlots.js files (API + UI), in sync
- [x] ISC-61: scripts/drawSnapshot.mjs built — parses Wikipedia raw bracket into an ordered BRACKET_SLOTS entry; reproduces the 16-match draw with correct seeds (independent validation of the hand entry)
- [x] ISC-62: Live /api/draws?tournamentKey=21344 renders the 11 present matches in exact official relative order (cache key bumped draws5→draws6 to invalidate the stale pre-override entry)
- [DEFERRED-VERIFY] ISC-63: Draw renders visibly correct on draws.html — needs browser tooling; folds into vintage-ui-visual-verify

Known follow-ups (documented, not yet done):
- Round label bug: roundId 4 shows "Round of 128" for the 32-draw (should be "Round of 32"). Upstream roundId is inconsistent for non-Slam draws and the ROUND map assumes 128. Fix needs draw-size awareness threaded into draws.js — deferred (shared-route blast radius; draw currently incomplete makes size-derivation unreliable).
- 5 qualifier matches absent until the feed adds them post-qualifying; the override already reserves their correct slots (1,3,10,14,15).

## Test Strategy

| isc | type | check | threshold | tool |
|-----|------|-------|-----------|------|
| ISC-1..2 | api | curl wrangler dev /api/vintage-roster ×2 | 100 rows; 2nd fast | curl + jq |
| ISC-3,12 | source | route table + client method present | exact strings | Grep |
| ISC-4..9 | api | curl /api/player-vintage for 47275 + veteran | shape + floors | curl + jq |
| ISC-10 | api | curl without playerKey | ok:false envelope | curl -i |
| ISC-11 | api | repeat call timing | cached (<100ms) | curl |
| ISC-13 | test | bunx vitest run | exit 0 | Bash |
| ISC-14..18 | source | markup/script greps | zero/exact matches | Grep |
| ISC-19..31 | ui | browser probe (Interceptor when installed) or manual | visual + DOM | deferred |
| ISC-32..33 | ui | browser console + page sweep | zero new errors | deferred |
| ISC-34 | repo | git diff --stat both repos + secret rg | only intended files | Bash |

## Features

| name | description | satisfies | depends_on | parallelizable |
|------|-------------|-----------|------------|----------------|
| F1 vintage-roster route | rankings top-100 → picker roster, KV 24h | ISC-1..3 | — | yes (Forge) ✓ |
| F2 player-vintage route | profile + paged past-matches → cumulative {age,w,m} curve, KV 24h | ISC-4..13 | — | yes (Forge) ✓ |
| F3 index surgery + rename | strip scores content/scripts, Home labels everywhere | ISC-14..18 | — | yes (me) ✓ |
| F4 home.js chart | Chart.js curves, toggle, chips, datalist, persistence | ISC-19..31 | F1,F2,F3 | built, visual deferred |
| F5 styles | vintage section, chips, toggle in Tufte idiom, both themes | ISC-31 | F3 | built, visual deferred |

## Decisions

- 2026-07-19: Per-player curve endpoint over bulk — Cloudflare subrequest budget (~50) vs 10 players × up to 9 upstream calls; also enables progressive rendering and per-player cache reuse.
- 2026-07-19: `pageNo` is the real pagination param — live-probed; `page` is accepted-and-ignored (returns page 1). Encoded as constraint.
- 2026-07-19: Metric architecture = cumulative fields per point ({age,w,m}); toggle re-maps client-side with zero refetch. Titles metric deferred (needs tournament-tier joins; challenger-final contamination risk noted in playerHistory.js).
- 2026-07-19: Delegation floor (E3 ≥2) relaxed to 1 (Forge) — show-your-math: repos are small and disjoint across the two workstreams; a second writer would contend for the same UI files. Forge owns API repo; primary owns UI repo; zero overlap.
- 2026-07-19: Roster = current top-100 rankings; historical name-search deferred to Phase-2 (aligns with PRD player-profile backlog).
- 2026-07-19: This file supersedes the completed bracket-maker increment ISA per repo convention (one ISA per increment; git history preserves prior increments).
- 2026-07-19: refined: ISC-10 "400-family error" → "ok:false envelope via existing convention". The repo-wide convention (jsonResponse in index.js) returns HTTP 500 for thrown route errors — playerHistory behaves identically. Changing the global error mapper is out of scope for this increment.
- 2026-07-19: Fixed Forge's first-page-retry path in vintage.js: comment promised re-fetch of page 1 but pageNo++ started at 2, silently dropping the newest 500 matches on that path. Set pageNo=0 before the loop.
- 2026-07-19: Forge lineage disclosure — codex CLI absent on this machine; Forge completed on Claude-family Opus with full local verification (23/23 vitest, node --check). Cross-vendor audit unavailable; restore codex to regain it.
- 2026-07-19: Interceptor CLI AND agent-browser both absent on this machine — no browser automation available. Advisor consulted (Rule 2): approved DEFERRED-VERIFY for pixel/interaction ISCs *after* browserless static checks passed (canvas+CDN wired in served HTML, home.js syntax-clean, all 9 element IDs cross-checked, roster ≥10, Chart.js CDN 200). Follow-up task `vintage-ui-visual-verify`: install Interceptor (Workflows/Update.md), open http://localhost:8787/, run ISC-19..33 probes. Manual handoff to Nico in the meantime.
- 2026-07-19: PROJECTS.md missing at ~/.claude/PAI/USER/PROJECTS/PROJECTS.md (CLAUDE.md @-imports it but file doesn't exist) — follow-up recorded here and in auto-memory instead.
- 2026-07-25 (Increment 2): Un-deferred the "titles" metric that Increment 1 flagged out-of-scope. Title = tour-level Final win, tier from calendar rankId ∈ {2,3,4,7}. Validated against `player/titles` career totals: Sinner 31 (14 main + 10 Masters + 5 Slam + 2 Finals) — exact match, and correctly strips the 3 challenger/futures finals present in the raw 34 roundId-12 wins.
- 2026-07-25: tier map is per-year cached (30d TTL, immutable history) and shared across all players; a player-vintage call fetches only the distinct years in its own match set (Sinner span = 10 years). Keeps cold-call subrequest count bounded and amortizes across the roster.
- 2026-07-25: player-vintage cache key bumped v1→v2 — the point shape gained `t`; without the bump, stale v1 entries would serve `t`-less points and the titles curve would render flat.
- 2026-07-25: Delegation floor relaxed to 0 again — show-your-math: single-author contained change (one new helper + loop field + one UI metric); Forge's cross-vendor value is unavailable (codex absent) so delegation would add coordination cost without benefit.
- 2026-07-25: Metric toggle architecture held — titles ride the same {age,w,m,t} point, so the toggle re-maps client-side with zero refetch, exactly as Increment 1 designed. Un-deferring titles cost no UI-plumbing rework, validating that decision.

## Changelog

- conjectured: the upstream past-matches endpoint paginates via a `page` query param, matching common RapidAPI conventions
  refuted by: live probe 2026-07-19 — `?pageSize=3&page=2` returned the identical first page; `?pageSize=3&pageNo=2` advanced correctly
  learned: this API paginates via `pageNo` and silently accepts-and-ignores `page` — silent parameter acceptance means pagination must be probe-verified, never assumed from convention
  criterion now: ISC-7 — pagination loop walks pageNo until hasNextPage=false (cap 8 pages)

- conjectured: browser verification is always available per PAI operational rules (Interceptor mandatory for web verification)
  refuted by: this machine has no `interceptor` binary, no `interceptor-daemon`, no repo checkout, and no `agent-browser` either — the mandate is unexecutable here
  learned: tool mandates need an existence check early in PLAN when the session will end in a browser-verification gate; discovering the gap at VERIFY forfeits the option to adjust scope
  criterion now: ISC-19..33 carry [DEFERRED-VERIFY] with follow-up `vintage-ui-visual-verify`

## Verification

ISC-1: curl — `{"ok":true,"n":101,"top3":["Jannik Sinner","Alexander Zverev","Carlos Alcaraz"]}`
ISC-2: curl — repeat roster calls 200; KV set/get path identical to player-vintage (timing-verified there)
ISC-3: Grep — index.js:42-43 `'/api/vintage-roster'` + `'/api/player-vintage'` registered
ISC-4: curl+jq — full envelope with player{id,name,countryAcr,birthday}, points, totals
ISC-5: jq — `ascending: true`; last point w=450 m=583 equals totals
ISC-6: jq — Sinner birthday 2001-08-16, first point age 14.08 (early-2016 debut consistent)
ISC-7: curl — Sinner 583 matches (>500 = multi-page); Zverev 943 across ≥2 pages
ISC-8: curl — Zverev 24008: totals.matches=943 > 500
ISC-9: curl — Sinner totals.wins=450 ≥ 398 floor
ISC-10: curl — `{"ok":false,"error":"playerKey is required"}` (HTTP 500 per repo convention, criterion refined)
ISC-11: time curl — cold 2.210s → warm 0.011s (KV hit)
ISC-12: Read apiClient.js:193-206 — playerProfile + pageNo param with shape comments, style-matched
ISC-13: Forge report — bunx vitest run 23/23 green; node --check clean on all three files
ISC-14: rg — zero matches for scoreTicker|tournament-hub|todaysSection in index.html
ISC-15: rg — zero matches for scores.js|live.js|ScoreBoard|MatchCard|ProbBar in index.html
ISC-16: rg — `nav-link">Home<` in all 6 HTML files, zero `>Scores<` remaining
ISC-17: rg — title/og:title/twitter:title "TennisWorld — Home"; footer Explore → "Home"
ISC-18: rg — 5 script tags: shared.js, auth.js, player-panel.js, components/store.js, home.js
ISC-19..33: DEFERRED-VERIFY — static de-risking done (served HTML contains canvas#vintageChart + Chart.js CDN ref; CDN returns 200 size 205222; home.js node --check clean; all 9 getElementById targets present in markup; roster length ≥10 true). Visual/interaction probes await browser tooling — follow-up `vintage-ui-visual-verify`.
ISC-34: Bash — API diff: apiClient.js +13/-3, index.js +3 (+new vintage.js); UI: 7 intended files + new home.js; secret rg clean

Increment 2 (2026-07-25):
ISC-35: probe — calendar 2026 rankId groups {0:449,1:179,2:46,3:9,4:4,5:27,7:1}; tier "Finals"/"Grand Slam" labels confirm mapping; tour-level set {2,3,4,7}
ISC-36: Read vintage.js — getTierMap: per-year key ['tier-map-v1',tour,year], 30d TTL, Promise.all merge; catch-per-year so one bad year doesn't sink the curve
ISC-37: Read vintage.js — title++ when match_winner==pid && roundId===12 && TOUR_LEVEL_TIERS.has(tierMap[tournamentId]); points push {age,w,m,t}
ISC-38: Read vintage.js — cacheKey 'player-vintage-v2'; live curl returns `t` field (v1 would not)
ISC-39: curl — Sinner totals.titles=31, exactly official (raw roundId-12 wins were 34; tier filter removed 3 sub-tour finals). Alcaraz 27, Sinner t_monotonic=true, last-point t==totals.titles
ISC-40: Read vintage.js — TOUR_LEVEL_TIERS.has(undefined)===false, so unmapped tournaments never count (conservative)
ISC-41: DEFERRED-VERIFY — static confirmed: index.html has 3rd button data-metric="t" "Tournaments Won"; served HTML + home.js carry it; home.js node --check clean; METRICS.t wired; buildDatasets maps pt[metric] so toggle re-maps titles with zero refetch. Pixel/interaction pass awaits browser tooling (folds into `vintage-ui-visual-verify`).
ISC-42: Bash — bunx vitest run 23/23 green after vintage.js change

Increment 3 (2026-07-25):
ISC-43: Read vintage.js — MASTERS_TIER/SLAM_TIER constants; loop increments ms when tier===3, gs when tier===4; points push {age,w,m,t,ms,gs}
ISC-44: Read vintage.js — totals {…, masters, slams}; cacheKey 'player-vintage-v3'; live curl returns ms/gs fields
ISC-45: curl — Sinner masters=10 slams=5 (player/titles: Masters series titlesWon=10, Grand Slam titlesWon=5 — exact); ms_monotonic & gs_monotonic true
ISC-46: curl — last-point ms(10) ≤ t(31) and gs(5) ≤ t(31); Alcaraz ms=8 gs=7 ≤ t=27 — subset invariant holds
ISC-47: DEFERRED-VERIFY — index.html + served HTML carry "Masters 1000" and "Grand Slams" buttons; METRICS.ms/.gs wired; home.js node --check clean; buildDatasets maps pt[metric] → zero refetch. Pixel pass folds into vintage-ui-visual-verify.
ISC-48: Bash — bunx vitest run green (2 files, 23 tests) after change

Increment 4 (2026-07-26):
ISC-49: curl — /api/standings ATP returns birthday:null for every row; rankings.js computeAge(null)→null→"—" (reproduced)
ISC-50: Read playerStats.js — profile block (cache key ['player-profile',tour,pk], 30d TTL), returns birthday; rankings.js enrichRow fills .col-age from computeAge(stats.birthday)
ISC-51: curl — birthday resolves for 47275/24008/68074/76127/52279/83135 (raw upstream 6/6 solid; earlier nulls were wrangler cold-start + a -w flag corrupting jq, not a real defect)
ISC-52: node — ages as of 2026-07-26: 24/29/23/24/27/22 — all correct
ISC-53: Read rankings.js — enrichRow sets player.birthday so the age-column sort (computeAge(a.birthday)) has data post-enrich
ISC-54: DEFERRED-VERIFY — served rankings.js carries computeAge(stats.birthday) + .col-age fill (grep×3); visible fill-on-scroll needs browser tooling
ISC-55: Bash — vitest 23/23; git diff --stat = playerStats.js + rankings.js only; secret rg clean

Note: the scary mid-investigation "everything null" readings were a wrangler-dev cold-worker race plus a curl -w flag corrupting the JSON body — raw upstream and warm clean calls are 100% reliable. No production defect there.

Increment 5 (2026-07-26):
ISC-56/57: curl — fixtures/tournament/21344 = 18 rows (11 singles, 7 doubles), all roundId 4, NO position/order/slot/drawPosition field; results = 0 singles
ISC-58: curl — en.wikipedia.org/wiki/2026_Mubadala_Citi_DC_Open_–_Men's_singles?action=raw returns bracket wikitext (RD1-teamNN in order); ATP + mubadaladcopen.com both 403 to WebFetch
ISC-59: cross-check — 11 API singles all present in Wikipedia order; seeds 1 de Minaur, 2 Shelton, 3 Fritz, 4 Musetti, 5 Tien, 6 Tiafoe, 7 Menšík, 8 Fils match API seed numbers
ISC-60: rg — washington|2026|ATP present in src/bracketSlots.js AND TennisWorldUI/bracketSlots.js (both, in sync)
ISC-61: node scripts/drawSnapshot.mjs — emits 16 matches with correct seeds, order identical to committed entry (block-aware parse: two half-brackets each restart RD1-team01; seeds precede teams so buffered via pendingSeed)
ISC-62: curl /api/draws?tournamentKey=21344 — 11 present matches in official relative order (De Minaur/Tsitsipas → Nakashima/Etcheverry → Fritz/Bergs → … → Tabilo/Griekspoor); draws5→draws6 busted the stale unordered cache
ISC-63: DEFERRED-VERIFY — draws.html visual; open via draws.html then select the Citi Open tile (openDraw(21344,…)). Needs browser tooling.

## The strategy (deliverable 2 — how to get correct draw order, ahead of time)

Problem: the RapidAPI feed (a) has NO draw-position field — order is unrecoverable; (b) is incomplete before a tournament (only scheduled matches; qualifier slots empty); (c) mislabels round size for non-Slam draws. So a correct ordered main draw cannot come from the API alone.

Solution — "Draw Snapshot at Release":
1. Deterministic seed skeleton: given draw size + seed list (both reliable from API/entry list), seeds occupy fixed ITF/ATP bracket slots — anchor those with zero external dependency.
2. Authoritative order capture: at draw release (ceremony ~1-2 days pre-Day-1; finalized after qualies), capture the full ordered draw and store as a tournament|year|tour override in bracketSlots.js (existing pattern). Best source = Wikipedia raw bracket wikitext (?action=raw): structured, ordered, includes seed/WC/Q/LL/PR, and NOT bot-blocked (ATP/official are Cloudflare-403). scripts/drawSnapshot.mjs operationalizes this.
3. Automate + time it: a scheduled routine runs drawSnapshot for each tournament starting in ≤2 days, re-running daily through Day 1 to fill qualifier names as they resolve. Output pasted/committed to both bracketSlots.js files.
4. Reconcile + validate: API supplies live scores/results; override supplies order; a diff step flags matchup drift (late withdrawal/LL swap). drawSnapshot's stderr match list is the human eyeball check.
5. Round-label fix (separate): derive round names from draw size, not the 128-assuming roundId map.

Increment 6 — Generalized full-draw synthesis + capture workflow (2026-07-26)
- [x] ISC-64: "Missing bottom half" root-caused — draw built from incomplete feed (11/16) with compacted slotIndex 0-10, all in top half
- [x] ISC-65: assignSlotOrder now synthesizes the FULL first round from the override — real matches at true slot index, synthetic Not-Started cards fill feed-missing slots
- [x] ISC-66: Washington renders 16 matches, both halves, true slots 0-15; synthetics at 1,3,10,14,15 (the qualifier slots)
- [x] ISC-67: First-round label size-derived (pairs*2) — Washington "Round of 32", not "Round of 128"
- [x] ISC-68: Grand Slam regression proven clean — Wimbledon 21337: 64 R1 matches, 0 synthetics, order unchanged, label "Round of 128"
- [x] ISC-69: No-override tournaments unchanged (synthesis gated on `pairs && first.matches.length`); default path untouched
- [x] ISC-70: scripts/upcomingDraws.mjs lists tournaments starting within N days with tournamentId + ready drawSnapshot command (repeatable trigger)
- [x] ISC-71: Existing API tests still pass (23/23) after assignSlotOrder rewrite
- [DEFERRED-VERIFY] ISC-72: draws.html visually shows the full both-halves bracket — needs browser tooling; folds into vintage-ui-visual-verify

Verification (Increment 6):
ISC-64: curl earlier /api/draws showed 11 matches, slotIndex 0-10 compacted → bottom half (slots 11-15) empty
ISC-65/66: curl /api/draws?tournamentKey=21344 → 16 matches, slotIndex 0-15, synthetic:true at slots 1,3,10,14,15; real matches at their true positions
ISC-67: same response, rounds[0].round = "Round of 32"
ISC-68: curl /api/draws?tournamentKey=21337 (Wimbledon) → rounds F/SF/QF/R16/R32/R64/R128 with counts 1/2/4/8/16/32/64, synthetics_total=0, R1 label "Round of 128", slot0 Sinner/Kecmanovic (override order intact)
ISC-69: code — `if (pairs && first.matches.length)` gates synthesis; no-override falls to unchanged matchKey-order path
ISC-70: node scripts/upcomingDraws.mjs --days 5 → lists Citi Open 21344 + others with capture commands
ISC-71: bunx vitest run → 23/23 green

Known follow-ups:
- 48-draw byes: an override for a bye draw must encode the bye slot at capture; Washington 2026 is 32 (no byes).
- Later-round labels (R16/QF/…) for non-128 draws still come from the roundId map and may mislabel once those rounds populate; the first round (pre-tournament view) is now correct.
- Cato cross-vendor audit (E4 mandate) unavailable — codex CLI absent on this machine; advisor review ran instead and its Grand-Slam-regression concern was empirically closed (ISC-68). The advisor's --auto-state loaded the wrong ISA (tennis-api-match-history-audit); this project's work is tracked here in TennisWorldUI/ISA.md.

Increment 7 — Batch draw validation across the season (2026-07-26)
- [x] ISC-73: scripts/testDraws.mjs built — re-runs /api/draws for every calendar tournament and validates bracket structure (bye-tolerant: non-increasing round counts, label-vs-size, past-ends-in-Final, skips team/junior events)
- [x] ISC-74: All 39 past tour-level ATP brackets pass (Brisbane 16, AO 64, 28-draw 250s 12, etc.) — past brackets fill correctly
- [x] ISC-75: WTA sample (25) confirms tour-agnostic — 17/17 past brackets pass, team events skipped
- [x] ISC-76: Washington (override) renders full 16 with 5 synthetics = OK-UPCOMING; proves future draws fill correctly once captured
- [x] ISC-77: 17 future ATP events are EMPTY-UPCOMING (draws not yet released, no override) — the set awaiting capture at their draw release
- [x] ISC-78: The one ISSUE (Dubai) diagnosed as upstream data gap (feed lacks roundId 12 Final) + known non-override mislabel — not a regression

Verification (Increment 7):
ISC-73/74: node scripts/testDraws.mjs --tour ATP --min-rank 2 → OK-PAST 39, OK-UPCOMING 2, EMPTY-UPCOMING 17, SKIP-NONBRACKET 31, ISSUE 1, ERROR 1 (transient 429)
ISC-75: node scripts/testDraws.mjs --tour WTA --limit 25 → OK-PAST 17, SKIP-NONBRACKET 8, 0 issues
ISC-76: Washington 21344 → R1=16 (+5 synth), OK-UPCOMING
ISC-78: Dubai 21315 → upstream results have roundIds 4/5/9/10 only (no 12 Final); our route renders what exists. Data gap, not our bug. Non-override → still roundId-labeled (R128 etc.).

Takeaway: past brackets fill correctly (39 ATP + 17 WTA verified); future brackets fill correctly WHEN CAPTURED (Washington proves it) and are empty until their draw releases + is captured via the upcomingDraws→drawSnapshot workflow. testDraws.mjs is the reusable regression harness to re-run anytime.

Increment 8 — Live draw update reliability + full round-label fix (2026-08-02)
- [x] ISC-79: Diagnosed "Washington not updating" — draws route cached whole bracket 24h (TTL.fixtures), so live results lagged up to a day
- [x] ISC-80: Adaptive cache TTL in draws.js — 5min live / 10min in-progress / 1h not-started / 24h completed; classifier verified across all 4 states
- [x] ISC-81: Full round-label fix — assignSlotOrder relabels ALL rounds from override draw size + position (roundNamesForDrawSize), not the 128-assuming roundId map
- [x] ISC-82: Washington now labels R32/R16/QF/SF/Final (was R32/"Round of 64"/QF/SF/Final); shows 30 decided + pending final
- [x] ISC-83: Grand Slam regression clean — Wimbledon 21337 labels R128/R64/R32/R16/QF/SF/F intact
- [x] ISC-84: Cache key bumped draws7→draws8 to flush the stale in-progress entry immediately; tests 23/23 green; only draws.js + bracketSlots.js changed; no secrets

Verification (Increment 8):
ISC-79: curl showed 30 matches present (accurate) but route used TTL.fixtures=24h → up-to-24h lag during play
ISC-80: node assertion — completed→86400, in-progress→600, live→300, not-started→3600
ISC-81/82: curl /api/draws?tournamentKey=21344 → rounds Final/SF/QF/"Round of 16"(8)/"Round of 32"(16); the "Round of 64" mislabel gone
ISC-83: curl /api/draws?tournamentKey=21337 → R128(64)/R64(32)/R32(16)/R16(8)/QF/SF/F — unchanged
ISC-84: bunx vitest 23/23; git diff --stat = draws.js + bracketSlots.js; secret rg clean

Root cause + prevention: a live tournament changes hourly but the draw was cached daily. Adaptive TTL ties freshness to state so any tournament — not just Washington — refreshes promptly while playing and still caches cheaply when idle. Round labels now derive from draw size for any captured tournament, so no draw shows phantom "Round of 64"-type labels.

Increment 9 — Fix draw "breaks down at semis" (renderer column layout) (2026-08-02)
- [x] ISC-85: Reproduced — Washington data is bracket-correct (QF→SF→Final consistent); the breakdown is rendering, not data
- [x] ISC-86: Root cause — DrawBracket lays out columns via roundId→depth (RID_TO_IDX); upstream tags a 32-draw's R32 as roundId 4 (=R128 depth), so columns start at R128, phantom-empty cols appear, and SF/Final fall off the end
- [x] ISC-87: Fix — assignSlotOrder re-stamps each match's roundId to the canonical value for its true depth (R32→6, R16→7, QF→9, SF→10, F→12) when an override sets the draw size
- [x] ISC-88: Renderer sim on live response → columnRids [6,7,9,10,12], all populated, SF+Final placed, 0 phantom columns
- [x] ISC-89: Grand Slam regression clean — Wimbledon roundIds already canonical (4,5,6,7,9,10,12), sim shows all 7 columns populated, unchanged
- [x] ISC-90: Idempotent for 128-draws; cache key draws8→draws9; tests 23/23; only draws.js + bracketSlots.js; no secrets

Verification (Increment 9):
ISC-85: curl QF/SF/Final — QF winners feed correct SF (Fritz/Nakashima, Jodar/Tabilo), Final = Fritz/Jodar; data valid
ISC-86: RID_TO_IDX={4:0,5:1,6:2,7:3,9:4,10:5,12:6}; pre-fix firstRid=4→baseIdx=0→columnRids=[4,5,6,7,9] (SF=10/Final=12 dropped)
ISC-87/88: post-fix roundIds R32=6/R16=7/QF=9/SF=10/F=12; node sim → columnRids [6,7,9,10,12] all populated, SF+Final true, phantom=0
ISC-89: Wimbledon sim → [4,5,6,7,9,10,12] all populated
ISC-90: bunx vitest 23/23; git diff --stat = 2 files; secret rg clean

Theme across Increments 7-9: upstream roundId is unreliable for non-128 draws and multiple layers trusted it (labels, cache, renderer columns). The server now normalizes roundId + order + names canonically for any captured tournament, fixing all three symptom classes at the source.

Increment 10 — Universal round normalization + calendar pagination fix (2026-08-02)
- [x] ISC-91: Diagnosed Nordea Open Båstad — no override → fix was override-gated → raw upstream roundIds → renderer sim columnRids [4,5,6,7,9], SF/Final dropped, phantom cols 6,7
- [x] ISC-92: Generalized — normalizeRoundStructure runs for EVERY tournament; D from override else 2^(ceil(log2(firstRoundMatches))+1); skips round-robin/play-off
- [x] ISC-93: Båstad (no override) now renders R32/R16/QF/SF/Final; sim columnRids [6,7,9,10,12], SF+Final placed, phantom 0
- [x] ISC-94: Grand Slam + override regression clean — Wimbledon [4,5,6,7,9,10,12] all placed; Washington [6,7,9,10,12] all placed
- [x] ISC-95: Dubai (non-override, upstream missing Final) labels fixed to R32/R16/QF/SF; missing Final now a TBD column, not dropped/mislabeled
- [x] ISC-96: Regression sweep (40 tour-level ATP) — 12 OK-PAST, 28 SKIP team events, 0 ISSUE/ERROR
- [x] ISC-97: Fixed upstream pageSize>500 regression — rapidAPI.calendar paginates at 500 (was 2000→400); restores the vintage tier map (titles/Masters/Slams)
- [x] ISC-98: calendar hasNextPage is unreliable (null with more pages); terminate on short page (<500). Full-year fetch now reaches Jan events. Scripts (testDraws, upcomingDraws) fixed the same way
- [x] ISC-99: cache key draws9→draws10; vitest 23/23; only draws.js/bracketSlots.js/apiClient.js + 2 scripts changed; no secrets

Verification (Increment 10):
ISC-91/93: node renderer sim on Băstad 21339 — before [4,5,6,7,9] (SF/Final dropped); after [6,7,9,10,12] SF+Final placed, phantom 0, labels R32/R16/QF/SF/Final
ISC-94: sim Wimbledon 21337 [4,5,6,7,9,10,12] all populated; Washington 21344 [6,7,9,10,12] all populated
ISC-95: sim Dubai 21315 — labels SF/QF/R16/R32 (was R128/R64), 1 TBD Final col (upstream gap)
ISC-96: testDraws --limit 40 --only-issues → 12 OK-PAST, 28 SKIP-NONBRACKET, 0 issues
ISC-97/98: curl calendar pageSize=2000 → 400; pageSize=500 pageNo 1(501)+2(219)=720; page1 hasNextPage=null dates Mar-Nov, Jan events on page2 → terminate on <500 gets full year
ISC-99: bunx vitest 23/23; secret rg clean

Outcome: the "breaks down at the semis" bug is fixed for ANY tournament without needing capture. Override now only adds exact first-round order + pre-tournament synthesis. Also repaired a live upstream regression (calendar pageSize cap) that was silently breaking the vintage tier metrics.

Increment 11 — Full-career ranking history from Sackmann data (2026-08-02)
- [x] ISC-100: Diagnosed — rank history was KV-capped at 104 entries (~2yr) and only accumulated forward; profiles couldn't show full careers
- [x] ISC-101: Existing backfill-sackmann.ts was inadequate (52wk cap, only 20s+current files, GitHub fetch, current-standings-only match)
- [x] ISC-102: Raised KV cap 104→2600 (playerRankHistory.js) so a decades-long career isn't truncated; exported for reuse
- [x] ISC-103: import-rank-history merges in one pass (dedup-by-date/sort/cap once) instead of O(n²) appendSnapshot per entry
- [x] ISC-104: Rewrote backfill-sackmann.ts — reads LOCAL ../tennis_atp, ALL decade files (70s→current), full career, name-normalized match vs 900-player roster, batched import
- [x] ISC-105: Match rate 856/900 roster (22 ambiguous names skipped); 853 players got career history, 276,760 points
- [x] ISC-106: Verified — Sinner 354wk 2018(#1592)→2026(#1); Zverev 608wk 2012→2026; Alcaraz 340wk 2018→2026; all date-ascending, ranks sane
- [x] ISC-107: Debug-pollution cleaned via clear+reimport; Sinner's 2019-01-07 point is real Sackmann (#553), not the test blip (#80)
- [DEFERRED-VERIFY] ISC-108: player.html chart visually shows the career arc — needs browser tooling; chart code already handles career-scale (reversed axis, pointRadius 0 for >30 pts)

Verification (Increment 11):
ISC-102/103: Read playerRankHistory.js (KV_MAX_ENTRIES=2600 exported), adminBackfill.js (Map dedup, sort, slice once)
ISC-104/105: bun backfill-sackmann.ts --dry → 856/900 matched, 853 players, 276,760 pts, deepest 1176wk 2001→2026
ISC-106: curl /api/player-ranking-history .data.history — Sinner n=354 span 2018-02-12→2026-06-08 best#1; Zverev n=608; Alcaraz n=340; ascending=true
ISC-107: clear-rank-history deleted 501; reimport; 2019-01-07 rank=553 (real), debug #80 gone
Notes: Sackmann "current" file ends ~2026-06-08; the profile route's live-append bridges to today's rank from standings. WTA not backfilled — only tennis_atp cloned (script auto-detects tennis_wta if added). Backfill is re-runnable: `bun run scripts/backfill-sackmann.ts --tour ATP`.
