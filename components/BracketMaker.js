// ===================================
// TennisWorld — Bracket Maker (interactive pick-mode controller)
// ===================================
// Wires the "Official Draw | My Picks" toggle, click-to-pick interaction, the
// "Fill with model" button, and save/load/manage — on top of the UNCHANGED
// TW.DrawBracket renderer.
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
    function Autofill() { return window.TW.BracketAutofill; }

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

        // Restore working picks (survive reload), pruning against the current draw.
        const working = store.getWorking(tk);
        let picks = bp.pruneInvalid(working.picks || {}, cfg.officialDraw);
        // Warn (console only) if the saved draw version differs — picks pruned above.
        if (working.drawId && working.drawId !== drawId) {
            console.warn('[BracketMaker] draw changed since last visit — stale picks pruned.');
        }

        const pickStore = window.TW.createStore({ picks: picks });
        let mode = store.getMode(tk); // 'official' | 'picks'
        let fillToken = 0;            // stale-guard token bumped on every user pick
        let filling = false;

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
            fillToken++; // any pick change invalidates an in-flight fill commit
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
            const draw = (mode === 'picks')
                ? bp.derivePickedDraw(cfg.officialDraw, currentPicks())
                : cfg.officialDraw;
            // draws.js owns the actual DrawBracket call (keeps prob bars + scroll).
            cfg.renderBracket(draw, mode);
            if (mode === 'picks') {
                decorate();
            } else if (cfg.wrapEl) {
                cfg.wrapEl.classList.remove('bm-pickmode'); // drop pick-mode styling hook
            }
            controls.syncChampion(bp.championKey(cfg.officialDraw, currentPicks()), cfg);
        }

        // ── Decoration layer (pick-mode only) ──────────────────────────────────
        // Adds click handlers + path highlight onto the freshly rendered cards.
        function decorate() {
            const root = cfg.wrapEl;
            if (!root) return;
            root.classList.add('bm-pickmode');

            const slots = bp.resolveAdvancement(cfg.officialDraw, currentPicks());
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

            highlightPath(root, slots);
        }

        // Set/replace the winner for a match. One-way: store → derive → render.
        function makePick(matchKey, winnerKey) {
            const next = Object.assign({}, currentPicks());
            if (String(next[matchKey]) === String(winnerKey)) return; // no-op
            next[matchKey] = String(winnerKey);
            // Storage hygiene runs ONLY here (not during render): drop any pick that
            // this change orphaned downstream, so the working copy stays clean.
            const pruned = bp.pruneInvalid(next, cfg.officialDraw);
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

        // ── Auto-fill ──────────────────────────────────────────────────────────
        async function runFill() {
            const af = Autofill();
            if (!af || filling) return;
            filling = true;
            controls.setFillBusy(true);
            const myToken = ++fillToken;
            try {
                const res = await af.fill(cfg.officialDraw, currentPicks(), {
                    tour: cfg.tour,
                    surface: cfg.surface || '',
                    concurrency: 4,
                    token: myToken,
                    getToken: function () { return fillToken; },
                });
                if (!res.aborted) {
                    pickStore.setState({ picks: res.picks });
                    store.setWorking(tk, res.picks, drawId);
                }
                controls.flashStatus(res.aborted
                    ? 'Fill canceled'
                    : 'Filled ' + res.filled + (res.skipped ? ' · ' + res.skipped + ' skipped' : ''));
            } catch (e) {
                controls.flashStatus('Fill failed');
                console.warn('[BracketMaker] fill error', e);
            } finally {
                filling = false;
                controls.setFillBusy(false);
            }
        }

        function clearPicks() {
            setPicks({});
        }

        // Save current working picks under a name.
        function saveAs(name) {
            const pruned = bp.pruneInvalid(currentPicks(), cfg.officialDraw);
            return store.save({
                name: name, tournamentKey: tk, picks: pruned, drawId: drawId,
            });
        }

        function loadSaved(id) {
            const rec = store.load(id);
            if (!rec) return false;
            // Prune against the CURRENT draw (player may no longer be in draw).
            const pruned = bp.pruneInvalid(rec.picks || {}, cfg.officialDraw);
            if (rec.drawId && rec.drawId !== drawId) {
                controls.flashStatus('Draw changed — some picks dropped');
            }
            setPicks(pruned);
            if (mode !== 'picks') setMode('picks');
            return true;
        }

        // Expose actions to the controls closure.
        ctx.actions = {
            runFill: runFill, clearPicks: clearPicks, saveAs: saveAs,
            loadSaved: loadSaved, currentPicks: currentPicks,
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
            setFillBusy: function () {}, flashStatus: function () {},
            bindActions: function () {}, el: null,
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
        const btnPicks = mkBtn('My Picks', 'bm-toggle-btn');
        btnOfficial.onclick = function () { ctx.setMode('official'); };
        btnPicks.onclick = function () { ctx.setMode('picks'); };
        toggle.appendChild(btnOfficial);
        toggle.appendChild(btnPicks);
        bar.appendChild(toggle);

        // Pick-mode action group (hidden in official mode).
        const actions = document.createElement('div');
        actions.className = 'bm-actions';
        const btnFill = mkBtn('Fill with model', 'bm-btn bm-btn-primary');
        const btnSave = mkBtn('Save', 'bm-btn');
        const btnManage = mkBtn('My Brackets', 'bm-btn');
        const btnClear = mkBtn('Reset', 'bm-btn bm-btn-ghost');
        actions.appendChild(btnFill);
        actions.appendChild(btnSave);
        actions.appendChild(btnManage);
        actions.appendChild(btnClear);
        bar.appendChild(actions);

        const status = document.createElement('span');
        status.className = 'bm-status';
        status.setAttribute('role', 'status');
        bar.appendChild(status);

        const champ = document.createElement('div');
        champ.className = 'bm-champion';
        champ.hidden = true;
        bar.appendChild(champ);

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
            if (!isPicks) { panel.hidden = true; champ.hidden = true; }
        }

        function syncChampion(championKey, cfg) {
            if (!championKey) { champ.hidden = true; champ.textContent = ''; return; }
            const name = playerNameForKey(cfg.officialDraw, championKey) || 'Your champion';
            champ.hidden = false;
            champ.innerHTML = '<span class="bm-champ-star">★</span> Champion: <strong>' +
                escapeHtml(name) + '</strong>';
        }

        function setFillBusy(busy) {
            btnFill.disabled = busy;
            btnFill.textContent = busy ? 'Filling…' : 'Fill with model';
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
            btnFill.onclick = function () { A.runFill(); };
            btnSave.onclick = function () {
                const name = window.prompt('Name this bracket', 'My Bracket');
                if (name && name.trim()) {
                    A.saveAs(name.trim());
                    flashStatus('Saved');
                }
            };
            btnManage.onclick = function () {
                if (panel.hidden) { renderPanel(ctx.cfg); panel.hidden = false; }
                else panel.hidden = true;
            };
            btnClear.onclick = function () {
                if (window.confirm('Reset all picks? Saved brackets are not affected.')) {
                    A.clearPicks();
                    flashStatus('Picks reset');
                }
            };
        }

        return {
            syncMode: syncMode, syncChampion: syncChampion, setFillBusy: setFillBusy,
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
