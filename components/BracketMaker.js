// ===================================
// TennisWorld — Bracket Maker (interactive pick-mode controller)
// ===================================
// Wires the "Official Draw | My Picks" toggle, click-to-pick interaction,
// save-to-account + local copies, the per-tournament Leaders board with
// read-only compare view, and the pick insights (progress + success
// probability) — on top of the UNCHANGED TW.DrawBracket renderer.
//
// Architecture (LOAD-BEARING, per advisor gate):
//   TW.DrawBracket is a PURE function of its draw input. So pick-mode renders
//   TW.DrawBracket(derivePickedDraw(officialDraw, picks)). The renderer never
//   learns pick-mode exists; it just advances whatever winners the derived draw
//   carries. This controller adds a thin DECORATION layer on top of the rendered
//   SVG/cards for click affordances, path highlight, and the champion indicator.
//
// One-way data flow (no render-time writes → no feedback loop):
//   click → store.setState(picks) → subscriber → derive → render → decorate.
//
// Public API (consumed by draws.js):
//   TW.BracketMaker.mount({ wrapEl, controlsHostEl, officialDraw, tour,
//                           tournamentName, year, tournamentKey, renderBracket })
//   where renderBracket(draw) returns { el } (draws.js owns DrawBracket call so
//   prob bars / scroll logic stay in one place).
// ─────────────────────────────────────────────────────────────────────────────

window.TW = window.TW || {};

(function () {
    'use strict';

    function BP() { return window.TW.BracketPicks; }
    function Store() { return window.TW.BracketStore; }

    // Active controller (single draw open at a time). Lets us tear down listeners.
    let active = null;

    function teardown() {
        if (active && active.unsub) active.unsub();
        active = null;
    }

    // ── mount ──────────────────────────────────────────────────────────────────
    function mount(cfg) {
        teardown();
        const bp = BP(), store = Store();
        if (!bp || !store || !cfg || !cfg.wrapEl) return null;

        const tk = String(cfg.tournamentKey || cfg.tournamentName || 'unknown');
        const drawId = computeDrawId(cfg.officialDraw);
        // The pick canvas is built FROM SCRATCH (iteration 2): reality grades
        // picks, it never pre-fills them. All pick-model calls share this opt.
        const SCRATCH = { scratch: true };

        // Restore working picks (survive reload), pruning against the current draw.
        const working = store.getWorking(tk);
        let picks = bp.pruneInvalid(working.picks || {}, cfg.officialDraw, SCRATCH);
        // Warn (console only) if the saved draw version differs — picks pruned above.
        if (working.drawId && working.drawId !== drawId) {
            console.warn('[BracketMaker] draw changed since last visit — stale picks pruned.');
        }

        const pickStore = window.TW.createStore({ picks: picks });
        let mode = store.getMode(tk); // 'official' | 'picks'
        let changeToken = 0;          // stale-guard token bumped on every pick change
        let viewing = null;           // { name, picks, matches, score, maxPossible } — read-only view of another user's bracket

        const ctx = {
            cfg: cfg, tk: tk, drawId: drawId, store: store, bp: bp,
            pickStore: pickStore,
            getMode: function () { return mode; },
            setMode: setMode,
            setPicks: setPicks,
        };

        // Build controls (toggle, fill, save/manage) into the host.
        const controls = buildControls(ctx, cfg.controlsHostEl);

        // Render + decorate on every pick change.
        const unsub = pickStore.subscribe(function () { renderNow(); });
        active = { unsub: unsub, tk: tk };

        function currentPicks() { return pickStore.getState().picks; }

        function setPicks(next) {
            changeToken++; // any pick change invalidates in-flight async work
            pickStore.setState({ picks: next });
            // Persist working state (try/catch lives in BracketStore).
            store.setWorking(tk, next, drawId);
        }

        function setMode(next) {
            mode = (next === 'picks') ? 'picks' : 'official';
            store.setMode(tk, mode);
            controls.syncMode(mode);
            renderNow();
        }

        // ── Core render ──────────────────────────────────────────────────────
        function renderNow() {
            // Read-only view of someone else's bracket (from Leaders). Rendered
            // through the SAME derive-only path — official data never mutated.
            if (viewing) {
                cfg.renderBracket(bp.derivePickedDraw(cfg.officialDraw, viewing.picks, SCRATCH), 'official');
                if (cfg.wrapEl) cfg.wrapEl.classList.remove('bm-pickmode');
                controls.syncViewing(viewing);
                return;
            }
            controls.syncViewing(null);
            const draw = (mode === 'picks')
                ? bp.derivePickedDraw(cfg.officialDraw, currentPicks(), SCRATCH)
                : cfg.officialDraw;
            // draws.js owns the actual DrawBracket call (keeps prob bars + scroll).
            cfg.renderBracket(draw, mode);
            if (mode === 'picks') {
                decorate();
                updateInsights();
            } else if (cfg.wrapEl) {
                cfg.wrapEl.classList.remove('bm-pickmode'); // drop pick-mode styling hook
            }
            controls.syncChampion(bp.championKey(cfg.officialDraw, currentPicks(), SCRATCH), cfg);
        }

        // ── Insights: progress counter + success-probability bar ──────────────
        // Progress: picked / still-open matches in the full tree.
        // Success probability: mean model probability of each picked winner
        // (memoized /api/predict via TW.ProbBar) — an "agreement with the model"
        // aggregate, NOT a path product (which would be astronomically small).
        async function updateInsights() {
            const token = ++changeToken;
            const slots = bp.resolveAdvancement(cfg.officialDraw, currentPicks(), SCRATCH);
            let open = 0, picked = 0;
            const pickedMatches = [];
            slots.forEach(function (col) {
                col.forEach(function (m) {
                    if (!m) return;
                    if (bp.hasOfficialWinner(m)) return; // decided by real result
                    open++;
                    if (m.winner === 'player1' || m.winner === 'player2') {
                        picked++;
                        if (bp.isRealKey(m.player1Key) && bp.isRealKey(m.player2Key)) pickedMatches.push(m);
                    }
                });
            });
            controls.syncProgress(picked, open);

            if (!pickedMatches.length || typeof TW === 'undefined' || !TW.ProbBar || !TW.ProbBar.fetchPrediction) {
                controls.syncConfidence(null, 0);
                return;
            }
            let sum = 0, n = 0, i = 0;
            async function worker() {
                while (i < pickedMatches.length) {
                    const m = pickedMatches[i++];
                    try {
                        const pred = await TW.ProbBar.fetchPrediction({
                            player1Key: m.player1Key, player2Key: m.player2Key,
                            player1Name: m.player1Name, player2Name: m.player2Name,
                            tour: cfg.tour || 'ATP',
                        });
                        if (changeToken !== token) return; // stale — newer picks exist
                        if (pred && typeof pred.probA === 'number') {
                            sum += (m.winner === 'player1') ? pred.probA : pred.probB;
                            n++;
                        }
                    } catch (_) { /* graceful absence */ }
                }
            }
            await Promise.all(Array.from({ length: Math.min(4, pickedMatches.length) }, worker));
            if (changeToken === token) {
                controls.syncConfidence(n ? Math.round((sum / n) * 100) : null, n);
            }
        }

        // ── Decoration layer (pick-mode only) ──────────────────────────────────
        // Adds click handlers + path highlight onto the freshly rendered cards.
        function decorate() {
            const root = cfg.wrapEl;
            if (!root) return;
            root.classList.add('bm-pickmode');

            const slots = bp.resolveAdvancement(cfg.officialDraw, currentPicks(), SCRATCH);
            // matchKey → resolved match (for pickability + sides).
            const resolved = new Map();
            for (const round of slots) {
                for (const m of round) {
                    if (m && m.matchKey != null) resolved.set(String(m.matchKey), m);
                }
            }

            const cards = root.querySelectorAll('.db-card[data-match-key]');
            cards.forEach(function (card) {
                const key = card.dataset.matchKey;
                const m = resolved.get(String(key)) || matchFromCard(card);
                const rows = card.querySelectorAll('.db-prow');
                if (!m || rows.length < 2) return;

                const pickable = bp.isPickable(m);
                card.classList.toggle('bm-pickable', pickable);
                card.classList.toggle('bm-locked', bp.isFinished(m));

                const picked = currentPicks()[key];
                rows.forEach(function (row, i) {
                    const sideKey = i === 0 ? m.player1Key : m.player2Key;
                    const isPicked = picked && String(picked) === String(sideKey);
                    row.classList.toggle('bm-picked', !!isPicked);
                    if (!pickable || !bp.isRealKey(sideKey)) return;
                    // Clicking the player name opens the panel; clicking elsewhere on
                    // the row makes the pick. We attach to the row but ignore clicks
                    // that originate on the [data-open-player] name span.
                    row.classList.add('bm-clickable');
                    row.onclick = function (ev) {
                        if (ev.target.closest('[data-open-player]')) return; // let panel open
                        ev.stopPropagation();
                        makePick(key, sideKey);
                    };
                });
            });

            // Grade picks against reality. The canvas never pre-fills from real
            // results, but decided matches DO grade the user's pick: green when
            // their pick matched the real winner of that slot, red when not.
            const actual = new Map();
            for (const r of cfg.officialDraw) {
                for (const m of (r.matches || [])) {
                    if (!bp.hasOfficialWinner(m)) continue;
                    actual.set(String(m.matchKey),
                        m.winner === 'player1' ? String(m.player1Key) : String(m.player2Key));
                }
            }
            cards.forEach(function (card) {
                const key = String(card.dataset.matchKey);
                card.classList.remove('bm-hit', 'bm-miss');
                const pick = currentPicks()[key];
                if (!pick || !actual.has(key)) return;
                card.classList.add(String(pick) === actual.get(key) ? 'bm-hit' : 'bm-miss');
            });

            controls.syncHint(Object.keys(currentPicks()).length);
            highlightPath(root, slots);
        }

        // Set/replace the winner for a match. One-way: store → derive → render.
        function makePick(matchKey, winnerKey) {
            const next = Object.assign({}, currentPicks());
            if (String(next[matchKey]) === String(winnerKey)) return; // no-op
            next[matchKey] = String(winnerKey);
            // Storage hygiene runs ONLY here (not during render): drop any pick that
            // this change orphaned downstream, so the working copy stays clean.
            const pruned = bp.pruneInvalid(next, cfg.officialDraw, SCRATCH);
            setPicks(pruned);
        }

        // Highlight the picked path toward the final.
        function highlightPath(root, slots) {
            // For each card, if a winner is set, mark the winning row's path.
            // (Visual emphasis handled by .bm-picked above; here we add a class to
            // cards on a decided path for connector emphasis.)
            const cards = root.querySelectorAll('.db-card[data-match-key]');
            cards.forEach(function (card) {
                const won = card.querySelector('.bm-picked');
                card.classList.toggle('bm-onpath', !!won);
            });
        }

        // ── Save to account (server bracket — one active per tournament) ──────
        async function saveToAccount() {
            if (!(window.TW.auth && TW.auth.isLoggedIn)) {
                controls.flashStatus('Sign in to save your bracket');
                if (window.TW.auth && TW.auth.openModal) TW.auth.openModal('signin');
                return;
            }
            const pruned = bp.pruneInvalid(currentPicks(), cfg.officialDraw, SCRATCH);
            if (!Object.keys(pruned).length) {
                controls.flashStatus('Make some picks first');
                return;
            }
            controls.setAccountBusy(true);
            try {
                await apiFetch('/api/bracket/save', {
                    method: 'POST',
                    body: JSON.stringify({
                        tour: cfg.tour || 'ATP',
                        tournamentKey: tk,
                        season: String(cfg.year || ''),
                        tournamentName: cfg.tournamentName || '',
                        picks: pruned,
                    }),
                });
                controls.flashStatus('Bracket saved! See how you rank under Leaders.');
            } catch (e) {
                controls.flashStatus('Save failed — try again');
                console.warn('[BracketMaker] account save error', e);
            } finally {
                controls.setAccountBusy(false);
            }
        }

        // ── Leaders (per-tournament leaderboard) + read-only compare view ─────
        async function loadLeaders() {
            const qs = 'tournamentKey=' + encodeURIComponent(tk) + '&tour=' + encodeURIComponent(cfg.tour || 'ATP');
            return apiFetch('/api/bracket/leaders?' + qs);
        }

        async function viewBracket(entry) {
            try {
                const qs = 'id=' + encodeURIComponent(entry.publicId) +
                    '&tournamentKey=' + encodeURIComponent(tk) + '&tour=' + encodeURIComponent(cfg.tour || 'ATP');
                const data = await apiFetch('/api/bracket/public?' + qs);
                const mine = currentPicks();
                let matches = 0;
                for (const k of Object.keys(data.picks || {})) {
                    if (mine[k] !== undefined && String(mine[k]) === String(data.picks[k])) matches++;
                }
                viewing = {
                    name: data.displayName || 'Player',
                    picks: data.picks || {},
                    matches: matches,
                    score: data.score, maxPossible: data.maxPossible,
                };
                renderNow();
            } catch (e) {
                controls.flashStatus('Could not load that bracket');
            }
        }

        function exitViewing() {
            viewing = null;
            renderNow();
        }

        function clearPicks() {
            setPicks({});
        }

        // Save current working picks under a name.
        function saveAs(name) {
            const pruned = bp.pruneInvalid(currentPicks(), cfg.officialDraw, SCRATCH);
            return store.save({
                name: name, tournamentKey: tk, picks: pruned, drawId: drawId,
            });
        }

        function loadSaved(id) {
            const rec = store.load(id);
            if (!rec) return false;
            // Prune against the CURRENT draw (player may no longer be in draw).
            const pruned = bp.pruneInvalid(rec.picks || {}, cfg.officialDraw, SCRATCH);
            if (rec.drawId && rec.drawId !== drawId) {
                controls.flashStatus('Draw changed — some picks dropped');
            }
            setPicks(pruned);
            if (mode !== 'picks') setMode('picks');
            return true;
        }

        // Expose actions to the controls closure.
        ctx.actions = {
            clearPicks: clearPicks, saveAs: saveAs,
            loadSaved: loadSaved, currentPicks: currentPicks,
            saveToAccount: saveToAccount, loadLeaders: loadLeaders,
            viewBracket: viewBracket, exitViewing: exitViewing,
            rerender: renderNow,
        };
        controls.bindActions(ctx.actions);

        // Initial paint.
        controls.syncMode(mode);
        renderNow();

        return { renderNow: renderNow, teardown: teardown, setMode: setMode };
    }

    // ── Build a match object from a card's data attributes (fallback) ──────────
    function matchFromCard(card) {
        return {
            matchKey: card.dataset.matchKey,
            player1Key: card.dataset.p1Key || '',
            player2Key: card.dataset.p2Key || '',
            player1Name: '', player2Name: '',
            status: card.classList.contains('db-card-done') ? 'Finished' : 'Not Started',
            winner: null,
        };
    }

    // ── Stable draw fingerprint (version guard) ─────────────────────────────────
    function computeDrawId(officialDraw) {
        if (!officialDraw || !Array.isArray(officialDraw)) return '';
        const keys = [];
        for (const r of officialDraw) {
            for (const m of (r.matches || [])) {
                if (m.matchKey != null) keys.push(m.matchKey);
            }
        }
        keys.sort();
        // Cheap stable hash.
        let h = 0;
        const s = keys.join(',');
        for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
        return 'd' + (h >>> 0).toString(36) + '_' + keys.length;
    }

    // ── Controls UI (toggle, fill, save/manage) ─────────────────────────────────
    function buildControls(ctx, host) {
        // No host (e.g. RR draw) → no controls, but pick logic still works headless.
        const noop = {
            syncMode: function () {}, syncChampion: function () {},
            syncProgress: function () {}, syncConfidence: function () {},
            setAccountBusy: function () {}, syncViewing: function () {},
            syncHint: function () {},
            flashStatus: function () {}, bindActions: function () {}, el: null,
        };
        if (!host) return noop;

        host.innerHTML = '';
        const bar = document.createElement('div');
        bar.className = 'bm-controls';

        // Mode toggle.
        const toggle = document.createElement('div');
        toggle.className = 'bm-toggle';
        toggle.setAttribute('role', 'tablist');
        const btnOfficial = mkBtn('Official Draw', 'bm-toggle-btn');
        const btnPicks = mkBtn('Build My Bracket', 'bm-toggle-btn');
        btnOfficial.onclick = function () { ctx.setMode('official'); };
        btnPicks.onclick = function () { ctx.setMode('picks'); };
        toggle.appendChild(btnOfficial);
        toggle.appendChild(btnPicks);
        bar.appendChild(toggle);

        // Pick-mode action group (hidden in official mode).
        const actions = document.createElement('div');
        actions.className = 'bm-actions';
        const btnAccount = mkBtn('Save to My Account', 'bm-btn bm-btn-primary');
        const btnSave = mkBtn('Save Copy', 'bm-btn');
        const btnManage = mkBtn('My Brackets', 'bm-btn');
        const btnClear = mkBtn('Reset', 'bm-btn bm-btn-ghost');
        actions.appendChild(btnAccount);
        actions.appendChild(btnSave);
        actions.appendChild(btnManage);
        actions.appendChild(btnClear);
        bar.appendChild(actions);

        // Leaders is visible in BOTH modes — the leaderboard is a first-class tab.
        const btnLeaders = mkBtn('Leaders', 'bm-btn bm-btn-leaders');
        bar.appendChild(btnLeaders);

        // Layout toggle (columns ⇄ circle) — visible in both modes.
        function layoutPref() {
            try { return localStorage.getItem('tw-bracket-layout') || 'columns'; } catch (_) { return 'columns'; }
        }
        const btnLayout = mkBtn('', 'bm-btn bm-btn-layout');
        function syncLayoutLabel() {
            btnLayout.textContent = layoutPref() === 'circle' ? '▦ Column View' : '◎ Circle View';
        }
        syncLayoutLabel();
        bar.appendChild(btnLayout);

        const status = document.createElement('span');
        status.className = 'bm-status';
        status.setAttribute('role', 'status');
        bar.appendChild(status);

        // Onboarding hint — shown while the canvas has no picks yet.
        const hint = document.createElement('div');
        hint.className = 'bm-hint';
        hint.hidden = true;
        hint.textContent = 'Your bracket starts blank — click a player in each first-round match to advance them, round by round, all the way to your champion. Real results grade your picks (green = you called it) but never fill them in for you.';
        bar.appendChild(hint);

        // Insights row (pick mode): progress counter + success-probability bar.
        const insights = document.createElement('div');
        insights.className = 'bm-insights';
        insights.hidden = true;
        const progress = document.createElement('span');
        progress.className = 'bm-progress';
        const conf = document.createElement('div');
        conf.className = 'bm-conf';
        conf.title = 'Average model win probability of your picked winners — based on rankings, surface record, and head-to-head. For entertainment purposes.';
        conf.innerHTML =
            '<span class="bm-conf-label"></span>' +
            '<span class="bm-conf-track"><span class="bm-conf-fill" style="width:0%"></span></span>';
        conf.hidden = true;
        insights.appendChild(progress);
        insights.appendChild(conf);
        bar.appendChild(insights);

        const champ = document.createElement('div');
        champ.className = 'bm-champion';
        champ.hidden = true;
        bar.appendChild(champ);

        // Read-only "viewing someone else's bracket" banner.
        const viewBanner = document.createElement('div');
        viewBanner.className = 'bm-viewbanner';
        viewBanner.hidden = true;
        bar.appendChild(viewBanner);

        // Leaders panel (lazy-rendered).
        const leadersPanel = document.createElement('div');
        leadersPanel.className = 'bm-panel bm-leaders';
        leadersPanel.hidden = true;
        bar.appendChild(leadersPanel);

        // Management panel (saved brackets list) — built on demand.
        const panel = document.createElement('div');
        panel.className = 'bm-panel';
        panel.hidden = true;
        bar.appendChild(panel);

        host.appendChild(bar);

        let A = null; // actions, bound later

        function flashStatus(msg) {
            status.textContent = msg;
            clearTimeout(flashStatus._t);
            flashStatus._t = setTimeout(function () { status.textContent = ''; }, 4000);
        }

        function syncMode(mode) {
            const isPicks = mode === 'picks';
            btnPicks.classList.toggle('active', isPicks);
            btnOfficial.classList.toggle('active', !isPicks);
            actions.style.display = isPicks ? '' : 'none';
            insights.hidden = !isPicks;
            if (!isPicks) { panel.hidden = true; champ.hidden = true; hint.hidden = true; }
        }

        function syncProgress(picked, open) {
            progress.textContent = open ? picked + '/' + open + ' picked' : '';
        }

        function syncHint(nPicks) {
            hint.hidden = !(nPicks === 0 && btnPicks.classList.contains('active'));
        }

        function syncConfidence(pct, n) {
            if (pct == null || !n) { conf.hidden = true; return; }
            conf.hidden = false;
            conf.querySelector('.bm-conf-label').textContent =
                'Your Bracket Success Probability: ' + pct + '%';
            conf.querySelector('.bm-conf-fill').style.width = pct + '%';
            conf.setAttribute('aria-label',
                'Your bracket success probability ' + pct + ' percent, averaged across ' + n + ' picks. For entertainment purposes.');
        }

        function setAccountBusy(busy) {
            btnAccount.disabled = busy;
            btnAccount.textContent = busy ? 'Saving…' : 'Save to My Account';
        }

        function syncViewing(v) {
            if (!v) { viewBanner.hidden = true; viewBanner.innerHTML = ''; return; }
            viewBanner.hidden = false;
            const scoreBit = (v.score != null)
                ? ' · ' + v.score + ' pts (max ' + v.maxPossible + ')' : '';
            viewBanner.innerHTML =
                'Viewing <strong>' + escapeHtml(v.name) + '</strong>’s bracket' + scoreBit +
                ' · ' + v.matches + ' of your picks match ' +
                '<button type="button" class="bm-mini bm-view-back">Back to my bracket</button>';
            viewBanner.querySelector('.bm-view-back').onclick = function () { A.exitViewing(); };
            leadersPanel.hidden = true;
        }

        function renderLeaders(data) {
            leadersPanel.innerHTML = '';
            const title = document.createElement('div');
            title.className = 'bm-panel-title';
            title.textContent = 'Bracket Leaders';
            leadersPanel.appendChild(title);

            const entries = (data && data.entries) || [];
            if (!entries.length) {
                const empty = document.createElement('div');
                empty.className = 'bm-panel-empty';
                empty.textContent = 'No brackets yet — be the first! Make your picks and Save to My Account.';
                leadersPanel.appendChild(empty);
                return;
            }
            const table = document.createElement('table');
            table.className = 'bm-leaders-table';
            table.innerHTML = '<thead><tr>' +
                '<th>#</th><th>Player</th><th>Score</th><th>Max</th><th>Accuracy</th><th></th>' +
                '</tr></thead>';
            const tbody = document.createElement('tbody');
            entries.forEach(function (e) {
                const tr = document.createElement('tr');
                tr.innerHTML = '<td>' + e.rank + '</td>' +
                    '<td>' + escapeHtml(e.displayName || 'Player') + '</td>' +
                    '<td><strong>' + e.score + '</strong></td>' +
                    '<td>' + e.maxPossible + '</td>' +
                    '<td>' + (e.accuracy == null ? '—' : e.accuracy + '%') + '</td>';
                const td = document.createElement('td');
                const view = mkBtn('View', 'bm-mini');
                view.onclick = function () { A.viewBracket(e); };
                td.appendChild(view);
                tr.appendChild(td);
                tbody.appendChild(tr);
            });
            table.appendChild(tbody);
            leadersPanel.appendChild(table);
            if (data.total > entries.length) {
                const more = document.createElement('div');
                more.className = 'bm-panel-empty';
                more.textContent = 'Top ' + entries.length + ' of ' + data.total + ' brackets.';
                leadersPanel.appendChild(more);
            }
        }

        function syncChampion(championKey, cfg) {
            if (!championKey) { champ.hidden = true; champ.textContent = ''; return; }
            const name = playerNameForKey(cfg.officialDraw, championKey) || 'Your champion';
            champ.hidden = false;
            champ.innerHTML = '<span class="bm-champ-star">★</span> Champion: <strong>' +
                escapeHtml(name) + '</strong>';
        }

        function renderPanel(cfg) {
            const store = ctx.store;
            const saved = store.list(ctx.tk);
            panel.innerHTML = '';
            const title = document.createElement('div');
            title.className = 'bm-panel-title';
            title.textContent = 'Saved brackets';
            panel.appendChild(title);

            if (!saved.length) {
                const empty = document.createElement('div');
                empty.className = 'bm-panel-empty';
                empty.textContent = 'No saved brackets yet for this tournament.';
                panel.appendChild(empty);
            }

            saved.forEach(function (entry) {
                const row = document.createElement('div');
                row.className = 'bm-saved-row';
                const nm = document.createElement('span');
                nm.className = 'bm-saved-name';
                nm.textContent = entry.name;
                row.appendChild(nm);

                const load = mkBtn('Load', 'bm-mini');
                const ren = mkBtn('Rename', 'bm-mini');
                const del = mkBtn('Delete', 'bm-mini bm-mini-danger');
                load.onclick = function () { A.loadSaved(entry.id); panel.hidden = true; };
                ren.onclick = function () {
                    const nn = window.prompt('Rename bracket', entry.name);
                    if (nn && nn.trim()) { store.rename(entry.id, nn.trim()); renderPanel(cfg); }
                };
                del.onclick = function () {
                    if (window.confirm('Delete "' + entry.name + '"? This cannot be undone.')) {
                        store.remove(entry.id); renderPanel(cfg);
                    }
                };
                [load, ren, del].forEach(function (b) { row.appendChild(b); });
                panel.appendChild(row);
            });
        }

        function bindActions(actionsObj) {
            A = actionsObj;
            btnLayout.onclick = function () {
                try {
                    localStorage.setItem('tw-bracket-layout',
                        layoutPref() === 'circle' ? 'columns' : 'circle');
                } catch (_) {}
                syncLayoutLabel();
                A.rerender();
            };
            btnAccount.onclick = function () { A.saveToAccount(); };
            btnSave.onclick = function () {
                const name = window.prompt('Name this bracket copy', 'My Bracket');
                if (name && name.trim()) {
                    A.saveAs(name.trim());
                    flashStatus('Copy saved locally');
                }
            };
            btnManage.onclick = function () {
                if (panel.hidden) { renderPanel(ctx.cfg); panel.hidden = false; leadersPanel.hidden = true; }
                else panel.hidden = true;
            };
            btnLeaders.onclick = async function () {
                if (!leadersPanel.hidden) { leadersPanel.hidden = true; return; }
                panel.hidden = true;
                leadersPanel.hidden = false;
                leadersPanel.innerHTML = '<div class="bm-panel-title">Bracket Leaders</div>' +
                    '<div class="bm-panel-empty">Loading…</div>';
                try {
                    renderLeaders(await A.loadLeaders());
                } catch (e) {
                    leadersPanel.innerHTML = '<div class="bm-panel-title">Bracket Leaders</div>' +
                        '<div class="bm-panel-empty">Could not load the leaderboard. Try again.</div>';
                }
            };
            btnClear.onclick = function () {
                if (window.confirm('Reset all picks? Saved brackets are not affected.')) {
                    A.clearPicks();
                    flashStatus('Picks reset');
                }
            };
        }

        return {
            syncMode: syncMode, syncChampion: syncChampion,
            syncProgress: syncProgress, syncConfidence: syncConfidence,
            setAccountBusy: setAccountBusy, syncViewing: syncViewing,
            syncHint: syncHint,
            flashStatus: flashStatus, bindActions: bindActions, el: bar,
        };
    }

    // ── Small DOM/util helpers ──────────────────────────────────────────────────
    function mkBtn(label, cls) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = cls || '';
        b.textContent = label;
        return b;
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function playerNameForKey(officialDraw, key) {
        if (!officialDraw) return '';
        for (const r of officialDraw) {
            for (const m of (r.matches || [])) {
                if (String(m.player1Key) === String(key)) return m.player1Name;
                if (String(m.player2Key) === String(key)) return m.player2Name;
            }
        }
        return '';
    }

    TW.BracketMaker = { mount: mount, teardown: teardown, computeDrawId: computeDrawId };
})();
