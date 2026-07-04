// ===================================
// TennisWorld — Head to Head
// ===================================

(function () {
    'use strict';

    // ── State ─────────────────────────────────────────────────────────────────
    let playerListCache = null;
    const h2hCache      = new Map();

    let playerA = null;
    let playerB = null;
    let currentSurface = 'all';
    let currentData    = null;

    // ── Surface resolution ────────────────────────────────────────────────────
    // New API backend includes a real `surface` field per match.
    // Fall back to name-based inference for any match that lacks it.

    const GRASS_RE = /wimbledon|queen.{0,5}club|halle|eastbourne|newport|s-hertog|birmingham/i;
    const CLAY_RE  = /roland.garros|monte.carlo|barcelona|rome\b|madrid|hamburg|munich|lyon|estoril|bucharest|istanbul|marrakech|houston|rio.open|buenos.aires|santiago|bastad|geneva|belgrade|umag|kitzbuhel|gstaad|nordea/i;

    function inferSurface(match) {
        const text = `${match.tournamentName || ''} ${match.round || ''}`;
        if (GRASS_RE.test(text)) return 'grass';
        if (CLAY_RE.test(text))  return 'clay';
        return 'hard';
    }

    function getMatchSurface(match) {
        return match.surface || inferSurface(match);
    }

    // ── Player list (autocomplete data) ───────────────────────────────────────

    async function getPlayers() {
        if (playerListCache) return playerListCache;
        const [atp, wta] = await Promise.allSettled([
            apiFetch('/api/standings?tour=ATP'),
            apiFetch('/api/standings?tour=WTA'),
        ]);
        const list = [];
        if (atp.status === 'fulfilled') list.push(...(atp.value || []).map(p => ({ ...p, tour: 'ATP' })));
        if (wta.status === 'fulfilled') list.push(...(wta.value || []).map(p => ({ ...p, tour: 'WTA' })));
        playerListCache = list;
        return list;
    }

    // ── Autocomplete dropdown ─────────────────────────────────────────────────

    function renderDropdown(query, players, onSelect, dropEl) {
        const q = query.trim().toLowerCase();
        if (!q || !players.length) { dropEl.hidden = true; return; }

        const hits = players.filter(p => p.name.toLowerCase().includes(q)).slice(0, 8);
        if (!hits.length) { dropEl.hidden = true; return; }

        dropEl.innerHTML = hits.map(p => `
            <div class="h2h-drop-item" data-key="${p.playerKey}">
                <span class="h2h-drop-flag">${flag(p.country)}</span>
                <span class="h2h-drop-name">${p.name}</span>
                <span class="h2h-drop-meta">#${p.rank} ${p.tour}</span>
            </div>`).join('');
        dropEl.hidden = false;

        dropEl.querySelectorAll('.h2h-drop-item').forEach(item => {
            item.addEventListener('mousedown', e => {
                e.preventDefault();
                const player = players.find(p => p.playerKey === item.dataset.key);
                if (player) onSelect(player);
            });
        });
    }

    function wireSearch(inputEl, dropEl, slot, compareBtn) {
        let debounce;
        let players = [];
        getPlayers().then(list => { players = list; });

        const pick = player => {
            inputEl.value = player.name;
            dropEl.hidden = true;
            if (slot === 'A') playerA = player; else playerB = player;
            compareBtn.disabled = !(playerA && playerB);
        };

        inputEl.addEventListener('input', () => {
            // Clear slot when user edits
            if (slot === 'A') playerA = null; else playerB = null;
            compareBtn.disabled = true;
            clearTimeout(debounce);
            debounce = setTimeout(() => renderDropdown(inputEl.value, players, pick, dropEl), 140);
        });

        inputEl.addEventListener('focus', () => {
            if (inputEl.value) renderDropdown(inputEl.value, players, pick, dropEl);
        });

        inputEl.addEventListener('blur', () => setTimeout(() => { dropEl.hidden = true; }, 160));

        inputEl.addEventListener('keydown', e => {
            if (e.key === 'Escape') { dropEl.hidden = true; inputEl.blur(); }
        });
    }

    // ── H2H fetch ─────────────────────────────────────────────────────────────

    async function fetchH2H(keyA, keyB, tour) {
        const ckey = `${[keyA, keyB].sort().join('|')}|${tour}`;
        if (h2hCache.has(ckey)) return h2hCache.get(ckey);
        const data = await apiFetch(`/api/h2h?playerKeyA=${keyA}&playerKeyB=${keyB}&tour=${tour}`);
        h2hCache.set(ckey, data);
        return data;
    }

    // ── Splits ────────────────────────────────────────────────────────────────

    function didAWin(match) {
        const p1IsA = match.player1Key === playerA.playerKey;
        const winnerIsP1 = match.winner === 'First Player';
        return p1IsA ? winnerIsP1 : !winnerIsP1;
    }

    function computeSplits(matches) {
        const out = {
            all:   { a: 0, b: 0 },
            hard:  { a: 0, b: 0 },
            clay:  { a: 0, b: 0 },
            grass: { a: 0, b: 0 },
        };
        for (const m of matches) {
            const aWon = didAWin(m);
            const surf = getMatchSurface(m);
            if (aWon) { out.all.a++; out[surf].a++; }
            else      { out.all.b++; out[surf].b++; }
        }
        return out;
    }

    // ── Score string (winner's games listed first, standard notation) ─────────

    function buildScoreStr(match) {
        if (!match.setScores || !match.setScores.length) return match.finalResult || '—';
        const winnerIsP1 = match.winner === 'First Player';
        return match.setScores.map(s => {
            const hi = winnerIsP1 ? s.p1 : s.p2;
            const lo = winnerIsP1 ? s.p2 : s.p1;
            const tb = s.tiebreak ? `(${Math.min(s.tiebreak.p1, s.tiebreak.p2)})` : '';
            return `${hi}–${lo}${tb}`;
        }).join('  ');
    }

    // ── Match row ─────────────────────────────────────────────────────────────

    function matchRow(m) {
        const aWon  = didAWin(m);
        const score = buildScoreStr(m);

        // "Sinner def. Alcaraz" — last name only for brevity
        const wName = (aWon ? playerA : playerB).name.split(' ').pop();
        const lName = (aWon ? playerB : playerA).name.split(' ').pop();

        // Strip redundant tournament name prefix from round string
        const roundClean = (m.round || '').replace(/^[^–\-]+-\s*/i, '').trim();
        const tournamentName = m.tournamentName || '—';
        const roundLabel  = roundClean && roundClean.toLowerCase() !== tournamentName.toLowerCase()
            ? ` — ${roundClean}` : '';

        const year = m.date ? m.date.substring(0, 4) : '';
        const tour = (playerA?.tour || playerB?.tour || 'ATP').toUpperCase();
        const tournament = (m.tournamentKey && m.tournamentName)
            ? `<a class="h2h-tournament-link" href="draws.html?tournamentKey=${m.tournamentKey}&season=${year}&name=${encodeURIComponent(m.tournamentName)}&tour=${tour}">${m.tournamentName}</a>`
            : tournamentName;

        const dateStr = m.date
            ? new Date(m.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
            : '—';

        const surf = getMatchSurface(m);

        return `
            <div class="h2h-match-row">
                <div class="h2h-match-meta">
                    <span class="h2h-match-date">${dateStr}</span>
                    <span class="h2h-surf-dot h2h-surf-${surf}" title="${surf.charAt(0).toUpperCase() + surf.slice(1)}"></span>
                    <span class="h2h-match-event">${tournament}${roundLabel}</span>
                </div>
                <div class="h2h-match-result">
                    <span class="h2h-match-def ${aWon ? 'def-a' : 'def-b'}">${wName} def. ${lName}</span>
                    <span class="h2h-match-score">${score}</span>
                </div>
            </div>`;
    }

    // ── Record bar ────────────────────────────────────────────────────────────

    function recordBarHTML(sp) {
        const total  = sp.a + sp.b;
        const aWidth = total ? Math.round((sp.a / total) * 100) : 50;
        return `
            <div class="h2h-bar-wrap">
                <span class="h2h-bar-count h2h-bar-count-a">${sp.a}</span>
                <div class="h2h-bar-track">
                    <div class="h2h-bar-a" style="width:${aWidth}%"></div>
                    <div class="h2h-bar-b" style="width:${100 - aWidth}%"></div>
                </div>
                <span class="h2h-bar-count h2h-bar-count-b">${sp.b}</span>
            </div>
            <div class="h2h-bar-labels">
                <span>${playerA.name}</span>
                <span class="h2h-total-label">${total} match${total !== 1 ? 'es' : ''}</span>
                <span>${playerB.name}</span>
            </div>`;
    }

    // ── Surface tabs ──────────────────────────────────────────────────────────

    function surfaceTabsHTML(splits, active) {
        return ['all', 'hard', 'clay', 'grass'].map(s => {
            const cnt  = s === 'all' ? splits.all.a + splits.all.b : splits[s].a + splits[s].b;
            const label = s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1);
            return `<button class="h2h-surf-tab${s === active ? ' active' : ''}" data-surface="${s}">
                ${label}${cnt ? `<span class="h2h-surf-count">${cnt}</span>` : ''}
            </button>`;
        }).join('');
    }

    // ── Full modal content ────────────────────────────────────────────────────

    function renderContent(data, surface) {
        const finished = (data.h2hMatches || []).filter(m => m.status === 'Finished');
        const splits   = computeSplits(finished);
        const filtered = surface === 'all'
            ? finished
            : finished.filter(m => getMatchSurface(m) === surface);
        const sorted   = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date));

        const sp = splits[surface] || splits.all;

        const matchListHTML = sorted.length
            ? sorted.map(matchRow).join('')
            : `<div class="h2h-empty">No ${surface === 'all' ? '' : surface + ' '}matches found.</div>`;

        return `
            <div class="h2h-modal-header">
                <span class="h2h-name-a">${flag(playerA.country)} ${playerA.name}</span>
                <span class="h2h-modal-vs">vs</span>
                <span class="h2h-name-b">${playerB.name} ${flag(playerB.country)}</span>
            </div>

            <div class="h2h-record" id="h2hRecord">
                ${recordBarHTML(sp)}
            </div>

            <div class="h2h-surf-tabs" id="h2hSurfTabs">
                ${surfaceTabsHTML(splits, surface)}
            </div>

            <div class="h2h-match-list" id="h2hMatchList">
                ${matchListHTML}
            </div>`;
    }

    // ── Modal open / close ────────────────────────────────────────────────────

    function openModal() {
        const modal = document.getElementById('h2hModal');
        modal.setAttribute('aria-hidden', 'false');
        modal.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        const modal = document.getElementById('h2hModal');
        if (!modal) return;
        modal.setAttribute('aria-hidden', 'true');
        modal.classList.remove('open');
        document.body.style.overflow = '';
        currentSurface = 'all';
        currentData    = null;
    }

    // ── Surface tab delegation (runs after content renders) ───────────────────

    function bindTabs(contentEl) {
        contentEl.querySelector('#h2hSurfTabs')?.addEventListener('click', e => {
            const tab = e.target.closest('.h2h-surf-tab');
            if (!tab || !currentData) return;

            currentSurface = tab.dataset.surface;
            contentEl.querySelector('#h2hSurfTabs').innerHTML =
                surfaceTabsHTML(computeSplits(
                    (currentData.h2hMatches || []).filter(m => m.status === 'Finished')
                ), currentSurface);

            // Rebind after innerHTML swap
            bindTabs(contentEl);

            // Update record bar + match list without full re-render
            const finished = (currentData.h2hMatches || []).filter(m => m.status === 'Finished');
            const splits   = computeSplits(finished);
            const sp       = splits[currentSurface] || splits.all;
            const filtered = currentSurface === 'all' ? finished : finished.filter(m => getMatchSurface(m) === currentSurface);
            const sorted   = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date));

            contentEl.querySelector('#h2hRecord').innerHTML = recordBarHTML(sp);
            contentEl.querySelector('#h2hMatchList').innerHTML = sorted.length
                ? sorted.map(matchRow).join('')
                : `<div class="h2h-empty">No ${currentSurface === 'all' ? '' : currentSurface + ' '}matches found.</div>`;
        });
    }

    // ── Init ──────────────────────────────────────────────────────────────────

    function init() {
        const inputA     = document.getElementById('h2hInputA');
        const inputB     = document.getElementById('h2hInputB');
        const dropA      = document.getElementById('h2hDropA');
        const dropB      = document.getElementById('h2hDropB');
        const compareBtn = document.getElementById('h2hCompareBtn');
        const modal      = document.getElementById('h2hModal');
        const content    = document.getElementById('h2hModalContent');

        if (!inputA || !modal) return;

        wireSearch(inputA, dropA, 'A', compareBtn);
        wireSearch(inputB, dropB, 'B', compareBtn);

        compareBtn.addEventListener('click', async () => {
            if (!playerA || !playerB) return;
            currentSurface = 'all';

            // Loading state
            content.innerHTML = `
                <div class="h2h-modal-header">
                    <span class="h2h-name-a">${flag(playerA.country)} ${playerA.name}</span>
                    <span class="h2h-modal-vs">vs</span>
                    <span class="h2h-name-b">${playerB.name} ${flag(playerB.country)}</span>
                </div>
                <div class="h2h-loading">
                    ${skeletonHTML(5)}
                </div>`;
            openModal();

            try {
                const tour = playerA.tour || playerB.tour || 'ATP';
                currentData = await fetchH2H(playerA.playerKey, playerB.playerKey, tour);
                content.innerHTML = renderContent(currentData, 'all');
                bindTabs(content);
                mountH2HPrediction(content, tour);
            } catch (err) {
                content.innerHTML = errorCardHTML('Could not load head-to-head data. Try again later.');
            }
        });

        // ── "TennisWorld Prediction" section (additive, reuses TW.ProbBar) ────
        // Appended after the H2H content renders; renders nothing if the
        // prediction API is unreachable or ProbBar isn't loaded.
        function mountH2HPrediction(contentEl, tour) {
            if (typeof TW === 'undefined' || !TW.ProbBar || !playerA || !playerB) return;
            try {
                const section = document.createElement('div');
                section.className = 'h2h-pred';
                section.innerHTML = '<h4 class="h2h-pred-title">TennisWorld Prediction</h4>';
                const barHost = document.createElement('div');
                section.appendChild(barHost);
                contentEl.appendChild(section);
                TW.ProbBar.mount(barHost, {
                    player1Key:  playerA.playerKey,
                    player1Name: playerA.name,
                    player2Key:  playerB.playerKey,
                    player2Name: playerB.name,
                    tour,
                }, { tour }).then(mounted => { if (!mounted) section.remove(); });
            } catch (_) { /* graceful absence */ }
        }

        document.getElementById('h2hModalClose')?.addEventListener('click', closeModal);
        document.getElementById('h2hModalBackdrop')?.addEventListener('click', closeModal);
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
        });
    }

    document.addEventListener('DOMContentLoaded', init);

}());
