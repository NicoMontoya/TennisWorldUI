// ===================================
// TennisWorld — Head to Head
// ===================================
// Autocomplete and modal content use createElement + textContent / dataset.
// Never interpolate API strings (names, keys, tournaments, scores) into innerHTML.

(function () {
    'use strict';

    // ── State ─────────────────────────────────────────────────────────────────
    let playerListCache = null;
    const h2hCache      = new Map();

    let playerA = null;
    let playerB = null;
    let currentSurface = 'all';
    let currentData    = null;
    let tabsBound      = false;

    // ── DOM helpers ───────────────────────────────────────────────────────────

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null && text !== '') node.textContent = text;
        return node;
    }

    // Allow RapidAPI numeric keys and Sackmann `s{id}` legends. Reject markup.
    function safePlayerKey(raw) {
        const s = String(raw == null ? '' : raw).trim();
        if (!s || s.length > 32) return '';
        if (/^s?\d+$/i.test(s)) return s;
        if (/^[A-Za-z0-9_-]+$/.test(s)) return s;
        return '';
    }

    function safeTour(raw) {
        if (typeof parseTour === 'function') return parseTour(raw) || '';
        const t = String(raw == null ? '' : raw).trim().toUpperCase();
        return t === 'ATP' || t === 'WTA' ? t : '';
    }

    function flagEmoji(country) {
        return typeof flag === 'function' ? flag(country) : '';
    }

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
        const raw = match && match.surface ? String(match.surface).toLowerCase() : inferSurface(match);
        if (raw.indexOf('clay') !== -1) return 'clay';
        if (raw.indexOf('grass') !== -1) return 'grass';
        return 'hard';
    }

    // ── Player list (autocomplete data) ───────────────────────────────────────

    async function getPlayers() {
        if (playerListCache) return playerListCache;
        // Active roster (full standings) + retired legends (from the vintage roster).
        // The legends carry an 's'+SackmannId key that the H2H backend resolves to a
        // complete Sackmann-sourced career log — so a retired opponent is selectable
        // AND returns full head-to-head history.
        const [atp, wta, vAtp, vWta] = await Promise.allSettled([
            apiFetch('/api/standings?tour=ATP'),
            apiFetch('/api/standings?tour=WTA'),
            apiFetch('/api/vintage-roster?tour=ATP'),
            apiFetch('/api/vintage-roster?tour=WTA'),
        ]);

        const list = [];
        const seen = new Set();                       // dedupe by tour+name; standings win
        const add = (p, tour) => {
            const key = safePlayerKey(p.playerKey);
            const t = safeTour(tour) || safeTour(p.tour);
            const k = `${t}:${(p.name || '').toLowerCase()}`;
            if (!p.name || !key || !t || seen.has(k)) return;
            seen.add(k);
            list.push({ ...p, playerKey: key, tour: t });
        };

        if (atp.status === 'fulfilled') (atp.value || []).forEach(p => add(p, 'ATP'));
        if (wta.status === 'fulfilled') (wta.value || []).forEach(p => add(p, 'WTA'));

        // vintage-roster items: { position, id, name, countryAcr, legend } → picker shape
        const legends = v => ((v && v.roster) || [])
            .filter(r => r.legend)
            .map(r => ({ playerKey: r.id, name: r.name, country: r.countryAcr, rank: r.position, legend: true }));
        if (vAtp.status === 'fulfilled') legends(vAtp.value).forEach(p => add(p, 'ATP'));
        if (vWta.status === 'fulfilled') legends(vWta.value).forEach(p => add(p, 'WTA'));

        playerListCache = list;
        return list;
    }

    // ── Autocomplete dropdown ─────────────────────────────────────────────────

    function renderDropdown(query, players, onSelect, dropEl) {
        const q = query.trim().toLowerCase();
        dropEl.replaceChildren();
        if (!q || !players.length) { dropEl.hidden = true; return; }

        const hits = players.filter(p => (p.name || '').toLowerCase().includes(q)).slice(0, 8);
        if (!hits.length) { dropEl.hidden = true; return; }

        hits.forEach(p => {
            const key = safePlayerKey(p.playerKey);
            if (!key) return;
            const item = el('div', 'h2h-drop-item');
            item.dataset.key = key;
            item.setAttribute('role', 'option');

            item.appendChild(el('span', 'h2h-drop-flag', flagEmoji(p.country)));
            item.appendChild(el('span', 'h2h-drop-name', p.name || ''));

            const tour = safeTour(p.tour);
            const rankBit = p.legend ? 'Legend' : (p.rank != null && p.rank !== '' ? '#' + p.rank : '');
            const meta = [rankBit, tour].filter(Boolean).join(' ');
            item.appendChild(el('span', 'h2h-drop-meta', meta));

            item.addEventListener('mousedown', e => {
                e.preventDefault();
                const player = players.find(x => safePlayerKey(x.playerKey) === item.dataset.key);
                if (player) onSelect(player);
            });
            dropEl.appendChild(item);
        });
        dropEl.hidden = !dropEl.childElementCount;
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
        const a = safePlayerKey(keyA);
        const b = safePlayerKey(keyB);
        const t = safeTour(tour) || 'ATP';
        if (!a || !b) throw new Error('Invalid player key');
        const ckey = `${[a, b].sort().join('|')}|${t}`;
        if (h2hCache.has(ckey)) return h2hCache.get(ckey);
        const data = await apiFetch(
            `/api/h2h?playerKeyA=${encodeURIComponent(a)}&playerKeyB=${encodeURIComponent(b)}&tour=${encodeURIComponent(t)}`
        );
        h2hCache.set(ckey, data);
        return data;
    }

    // ── Splits ────────────────────────────────────────────────────────────────

    function didAWin(match) {
        const p1IsA = String(match.player1Key) === String(playerA.playerKey);
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

    function matchRowEl(m) {
        const aWon  = didAWin(m);
        const score = buildScoreStr(m);

        const wName = String((aWon ? playerA : playerB).name || '').split(' ').pop();
        const lName = String((aWon ? playerB : playerA).name || '').split(' ').pop();

        const roundClean = (m.round || '').replace(/^[^–\-]+-\s*/i, '').trim();
        const tournamentName = m.tournamentName || '—';
        const roundLabel  = roundClean && roundClean.toLowerCase() !== tournamentName.toLowerCase()
            ? ` — ${roundClean}` : '';

        const year = m.date ? String(m.date).substring(0, 4) : '';
        const tour = safeTour(playerA?.tour || playerB?.tour) || 'ATP';

        const dateStr = m.date
            ? new Date(m.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
            : '—';

        const surf = getMatchSurface(m);

        const row = el('div', 'h2h-match-row');
        const meta = el('div', 'h2h-match-meta');
        meta.appendChild(el('span', 'h2h-match-date', dateStr));

        const dot = el('span', 'h2h-surf-dot h2h-surf-' + surf);
        dot.title = surf.charAt(0).toUpperCase() + surf.slice(1);
        meta.appendChild(dot);

        const event = el('span', 'h2h-match-event');
        if (m.tournamentKey && m.tournamentName) {
            const link = el('a', 'h2h-tournament-link', m.tournamentName);
            const qs = new URLSearchParams();
            qs.set('tournamentKey', String(m.tournamentKey));
            qs.set('season', year);
            qs.set('name', m.tournamentName);
            qs.set('tour', tour);
            link.href = 'draws.html?' + qs.toString();
            event.appendChild(link);
        } else {
            event.appendChild(document.createTextNode(tournamentName));
        }
        if (roundLabel) event.appendChild(document.createTextNode(roundLabel));
        meta.appendChild(event);

        const result = el('div', 'h2h-match-result');
        result.appendChild(el('span', 'h2h-match-def ' + (aWon ? 'def-a' : 'def-b'), wName + ' def. ' + lName));
        result.appendChild(el('span', 'h2h-match-score', score));

        row.appendChild(meta);
        row.appendChild(result);
        return row;
    }

    // ── Record bar ────────────────────────────────────────────────────────────

    function mountRecordBar(host, sp) {
        host.replaceChildren();
        const total  = sp.a + sp.b;
        const aWidth = total ? Math.round((sp.a / total) * 100) : 50;

        const wrap = el('div', 'h2h-bar-wrap');
        wrap.appendChild(el('span', 'h2h-bar-count h2h-bar-count-a', String(sp.a)));
        const track = el('div', 'h2h-bar-track');
        const barA = el('div', 'h2h-bar-a');
        barA.style.width = aWidth + '%';
        const barB = el('div', 'h2h-bar-b');
        barB.style.width = (100 - aWidth) + '%';
        track.appendChild(barA);
        track.appendChild(barB);
        wrap.appendChild(track);
        wrap.appendChild(el('span', 'h2h-bar-count h2h-bar-count-b', String(sp.b)));

        const labels = el('div', 'h2h-bar-labels');
        labels.appendChild(el('span', null, playerA.name || ''));
        labels.appendChild(el('span', 'h2h-total-label', total + ' match' + (total !== 1 ? 'es' : '')));
        labels.appendChild(el('span', null, playerB.name || ''));

        host.appendChild(wrap);
        host.appendChild(labels);
    }

    // ── Surface tabs ──────────────────────────────────────────────────────────

    function mountSurfTabs(host, splits, active) {
        host.replaceChildren();
        ['all', 'hard', 'clay', 'grass'].forEach(s => {
            const cnt = s === 'all' ? splits.all.a + splits.all.b : splits[s].a + splits[s].b;
            const label = s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1);
            const btn = el('button', 'h2h-surf-tab' + (s === active ? ' active' : ''));
            btn.type = 'button';
            btn.dataset.surface = s;
            btn.appendChild(document.createTextNode(label));
            if (cnt) btn.appendChild(el('span', 'h2h-surf-count', String(cnt)));
            host.appendChild(btn);
        });
    }

    function mountMatchList(host, matches, surface) {
        host.replaceChildren();
        if (!matches.length) {
            const label = surface === 'all' ? '' : surface + ' ';
            host.appendChild(el('div', 'h2h-empty', 'No ' + label + 'matches found.'));
            return;
        }
        matches.forEach(m => host.appendChild(matchRowEl(m)));
    }

    function mountNamesHeader() {
        const header = el('div', 'h2h-modal-header');
        header.appendChild(el('span', 'h2h-name-a', (flagEmoji(playerA.country) + ' ' + (playerA.name || '')).trim()));
        header.appendChild(el('span', 'h2h-modal-vs', 'vs'));
        header.appendChild(el('span', 'h2h-name-b', ((playerB.name || '') + ' ' + flagEmoji(playerB.country)).trim()));
        return header;
    }

    function mountSkeleton(host, n) {
        host.replaceChildren();
        for (let i = 0; i < n; i++) {
            const line = el('div', 'skeleton-line');
            line.style.width = (70 + (i % 3) * 10) + '%';
            host.appendChild(line);
        }
    }

    function mountError(host, message) {
        host.replaceChildren();
        const card = el('div', 'error-card');
        card.setAttribute('role', 'alert');
        card.appendChild(el('span', 'error-card-icon', '⚠'));
        card.appendChild(el('span', 'error-card-msg', message));
        host.appendChild(card);
    }

    // ── Full modal content ────────────────────────────────────────────────────

    function renderContent(contentEl, data, surface) {
        const finished = (data.h2hMatches || []).filter(m => m.status === 'Finished');
        const splits   = computeSplits(finished);
        const filtered = surface === 'all'
            ? finished
            : finished.filter(m => getMatchSurface(m) === surface);
        const sorted   = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date));
        const sp = splits[surface] || splits.all;

        contentEl.replaceChildren();

        const fixed = el('div', 'h2h-modal-fixed');
        fixed.appendChild(mountNamesHeader());

        const record = el('div', 'h2h-record');
        record.id = 'h2hRecord';
        mountRecordBar(record, sp);
        fixed.appendChild(record);

        const slot = el('div', 'h2h-rivalry-slot h2h-rivalry-arc');
        slot.id = 'h2hRivalryArc';
        slot.hidden = true;
        fixed.appendChild(slot);
        contentEl.appendChild(fixed);

        const scroll = el('div', 'h2h-modal-scroll');
        const tabs = el('div', 'h2h-surf-tabs');
        tabs.id = 'h2hSurfTabs';
        mountSurfTabs(tabs, splits, surface);

        const list = el('div', 'h2h-match-list');
        list.id = 'h2hMatchList';
        mountMatchList(list, sorted, surface);

        scroll.appendChild(tabs);
        scroll.appendChild(list);
        contentEl.appendChild(scroll);

        bindTabs(contentEl);
        mountRivalryArc(contentEl);
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
        if (tabsBound) return;
        tabsBound = true;
        contentEl.addEventListener('click', e => {
            const tab = e.target.closest('.h2h-surf-tab');
            if (!tab || !currentData) return;

            const next = tab.dataset.surface;
            if (next !== 'all' && next !== 'hard' && next !== 'clay' && next !== 'grass') return;
            currentSurface = next;

            const finished = (currentData.h2hMatches || []).filter(m => m.status === 'Finished');
            const splits   = computeSplits(finished);
            const sp       = splits[currentSurface] || splits.all;
            const filtered = currentSurface === 'all'
                ? finished
                : finished.filter(m => getMatchSurface(m) === currentSurface);
            const sorted   = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date));

            const tabs = contentEl.querySelector('#h2hSurfTabs');
            const record = contentEl.querySelector('#h2hRecord');
            const list = contentEl.querySelector('#h2hMatchList');
            if (tabs) mountSurfTabs(tabs, splits, currentSurface);
            if (record) mountRecordBar(record, sp);
            if (list) mountMatchList(list, sorted, currentSurface);
        });
    }

    // Fixed slot after header/record, before the scrolling match list.
    function mountRivalryArc(contentEl) {
        const slot = contentEl.querySelector('#h2hRivalryArc');
        if (!slot || typeof TW === 'undefined' || !TW.RivalryArc || !currentData || !playerA || !playerB) {
            if (slot) slot.hidden = true;
            return;
        }
        const finished = (currentData.h2hMatches || []).filter(m => m.status === 'Finished');
        const ok = TW.RivalryArc.mount(slot, {
            meetings: finished,
            player1Key: playerA.playerKey,
            player2Key: playerB.playerKey,
            player1Name: playerA.name,
            player2Name: playerB.name,
        });
        if (!ok) slot.hidden = true;
    }

    // ── "TennisWorld Prediction" section (additive, reuses TW.ProbBar) ────
    // Appended after the H2H content renders; renders nothing if the
    // prediction API is unreachable or ProbBar isn't loaded.
    function mountH2HPrediction(contentEl, tour) {
        if (typeof TW === 'undefined' || !TW.ProbBar || !playerA || !playerB) return;
        try {
            const section = el('div', 'h2h-pred');
            section.appendChild(el('h4', 'h2h-pred-title', 'TennisWorld Prediction'));
            const barHost = el('div');
            section.appendChild(barHost);
            const scroll = contentEl.querySelector('.h2h-modal-scroll') || contentEl;
            scroll.appendChild(section);
            TW.ProbBar.mount(barHost, {
                player1Key:  playerA.playerKey,
                player1Name: playerA.name,
                player2Key:  playerB.playerKey,
                player2Name: playerB.name,
                tour,
            }, { tour }).then(mounted => { if (!mounted) section.remove(); });
        } catch (_) { /* graceful absence */ }
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

            content.replaceChildren();
            content.appendChild(mountNamesHeader());
            const loading = el('div', 'h2h-loading');
            mountSkeleton(loading, 5);
            content.appendChild(loading);
            openModal();

            try {
                const tour = safeTour(playerA.tour || playerB.tour) || 'ATP';
                currentData = await fetchH2H(playerA.playerKey, playerB.playerKey, tour);
                renderContent(content, currentData, 'all');
                mountH2HPrediction(content, tour);
            } catch (err) {
                mountError(content, 'Could not load head-to-head data. Try again later.');
            }
        });

        document.getElementById('h2hModalClose')?.addEventListener('click', closeModal);
        document.getElementById('h2hModalBackdrop')?.addEventListener('click', closeModal);
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
        });
    }

    document.addEventListener('DOMContentLoaded', init);

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { renderDropdown, safePlayerKey, safeTour };
    }

}());
