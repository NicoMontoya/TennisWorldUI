// ===================================
// TennisWorld — Head to Head
// ===================================
// Autocomplete uses createElement + textContent / dataset.
// Modal body is TW.H2HPresenter — never interpolate API strings into innerHTML.

(function () {
    'use strict';

    // ── State ─────────────────────────────────────────────────────────────────
    let playerListCache = null;
    const h2hCache      = new Map();

    let playerA = null;
    let playerB = null;

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

    function presenter() {
        return (typeof TW !== 'undefined' && TW.H2HPresenter) ? TW.H2HPresenter : null;
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

    function present(contentEl, extra) {
        const api = presenter();
        if (!api) return;
        api.mount(contentEl, Object.assign({
            player1: playerA,
            player2: playerB,
        }, extra));
    }

    async function compare(contentEl) {
        if (!playerA || !playerB) return;
        const tour = safeTour(playerA.tour || playerB.tour) || 'ATP';
        present(contentEl, { loading: true });
        openModal();
        try {
            const data = await fetchH2H(playerA.playerKey, playerB.playerKey, tour);
            present(contentEl, { data });
            mountH2HPrediction(contentEl, tour);
        } catch (err) {
            present(contentEl, {
                error: true,
                message: 'Could not load head-to-head data. Try again later.',
                onRetry: () => compare(contentEl),
            });
        }
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

        compareBtn.addEventListener('click', () => compare(content));

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
