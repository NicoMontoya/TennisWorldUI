// ===================================
// TennisWorld — Rankings page
// ===================================
// Overall: official standings (/api/standings).
// Hard / Clay / Grass: surface form board (/api/rankings/surface-form).
// winPct on that board is a 0–1 ratio. Do not use the retired surface-standings route.

const SURFACE_FORM_VALUES = ['hard', 'clay', 'grass'];
const SURFACE_FORM_LABELS = { hard: 'Hard', clay: 'Clay', grass: 'Grass' };
const SURFACE_FORM_LOADING = 'Loading surface form…';
const SURFACE_FORM_ERROR = 'Couldn’t load surface form. Try Overall or refresh.';
const SURFACE_WPCT_HEADER = 'Surface win% (not official ranking)';
const OVERALL_WPCT_HEADER = 'W%';
const SURFACE_FORM_REASON_COPY = {
    'standings-not-loaded': 'Overall standings aren’t loaded yet, so this surface form board is empty. Try Overall or refresh.',
};

function parseSurfaceParam(value) {
    const s = String(value == null ? '' : value).trim().toLowerCase();
    return SURFACE_FORM_VALUES.includes(s) ? s : null;
}

function surfaceFormPath(tour, surface) {
    return `/api/rankings/surface-form?tour=${encodeURIComponent(tour)}&surface=${encodeURIComponent(surface)}`;
}

function countOrNull(value) {
    if (value == null || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n);
}

function normalizeSurfaceFormRow(raw, index) {
    if (!raw || typeof raw !== 'object') return null;
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!name) return null;
    const rankNum = Number(raw.rank);
    const rank = Number.isFinite(rankNum) ? rankNum : index + 1;
    let age = null;
    if (raw.age != null && raw.age !== '') {
        const ageNum = Number(raw.age);
        if (Number.isFinite(ageNum) && ageNum >= 0) age = Math.floor(ageNum);
    }
    let winPct = null;
    if (raw.winPct != null && raw.winPct !== '' && Number.isFinite(Number(raw.winPct))) {
        winPct = Number(raw.winPct);
    }
    return {
        rank,
        playerKey: raw.playerKey != null ? String(raw.playerKey).trim() : '',
        name,
        country: typeof raw.country === 'string' ? raw.country : '',
        age,
        w: countOrNull(raw.w),
        l: countOrNull(raw.l),
        winPct,
    };
}

function surfaceFormRowsFromPayload(data) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.rows)) return null;
    return data.rows;
}

function surfaceFormStatusCopy(surface, data) {
    const reason = data && typeof data.reason === 'string' ? data.reason.trim() : '';
    if (reason && SURFACE_FORM_REASON_COPY[reason]) return SURFACE_FORM_REASON_COPY[reason];
    if (reason) return reason.slice(0, 240);
    const label = SURFACE_FORM_LABELS[surface] || 'Hard';
    return `Not enough ${label} matches in the last 52 weeks yet.`;
}

// winPct is a 0–1 ratio (4 decimal places). Show one decimal percent: 0.725 → 72.5%.
function formatSurfaceWinPct(row) {
    let ratio = null;
    if (row && row.winPct != null && row.winPct !== '' && Number.isFinite(Number(row.winPct))) {
        ratio = Number(row.winPct);
    } else if (row && row.w != null && row.l != null) {
        const w = Number(row.w);
        const l = Number(row.l);
        if (Number.isFinite(w) && Number.isFinite(l) && w + l > 0) ratio = w / (w + l);
    }
    if (ratio == null) return '—';
    const pct = ratio <= 1 ? ratio * 100 : ratio;
    const rounded = Math.round(pct * 10) / 10;
    return `${rounded.toFixed(1)}%`;
}

function formatSurfaceWL(row) {
    if (!row || row.w == null || row.l == null) return '—';
    return `${row.w}–${row.l}`;
}

function surfaceWinRatio(row) {
    if (!row) return -1;
    if (row.winPct != null && Number.isFinite(Number(row.winPct))) {
        const n = Number(row.winPct);
        return n <= 1 ? n : n / 100;
    }
    if (row.w != null && row.l != null && row.w + row.l > 0) return row.w / (row.w + row.l);
    return -1;
}

document.addEventListener('DOMContentLoaded', () => {

    const PAGE_SIZE = 100;

    let allPlayers  = [];   // full standings array, sorted by rank
    let currentPage = 0;
    let currentTour = 'ATP';
    let currentSort = { col: 'rank', dir: 'asc' };
    let boardMode = 'overall'; // 'overall' | 'hard' | 'clay' | 'grass'
    let boardToken = 0;
    let surfaceRows = [];
    let surfaceView = [];
    let surfaceHoldNote = false;

    // Per-player stats cache (memory, lives for the page session)
    const statsCache = new Map(); // playerKey → { titles, form, wins, losses, winPct }

    // ── Age helper ─────────────────────────────────────────────────────────────
    function computeAge(birthday) {
        if (!birthday) return null;
        const born = new Date(birthday);
        if (isNaN(born)) return null;
        const today = new Date();
        let age = today.getFullYear() - born.getFullYear();
        const m = today.getMonth() - born.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < born.getDate())) age--;
        return age;
    }

    // ── Form dots renderer ─────────────────────────────────────────────────────
    function renderForm(form) {
        if (!form || !form.length) return '<span class="form-empty">—</span>';
        return form.map(r =>
            `<span class="form-dot form-${r === 'W' ? 'w' : 'l'}" title="${r === 'W' ? 'Win' : 'Loss'}"></span>`
        ).join('');
    }

    // ── Row renderer ───────────────────────────────────────────────────────────
    function renderRow(p) {
        const age    = computeAge(p.birthday);
        const mvmt   = p.movement > 0 ? '▲' : p.movement < 0 ? '▼' : '–';
        const mvmtCl = p.movement > 0 ? 'mvmt-up' : p.movement < 0 ? 'mvmt-dn' : 'mvmt-nil';
        const star = typeof TW !== 'undefined' && TW.auth
            ? TW.auth.starButtonHTML(p.playerKey)
            : '';

        return `<tr data-player-key="${p.playerKey}" data-tour="${currentTour}"
                    data-rank="${p.rank}" data-name="${p.name}" data-pts="${p.points}"
                    data-country="${p.country}" data-birthday="${p.birthday || ''}"
                    data-age="${age ?? 0}" data-titles="" data-wpct="" data-form="">
            <td class="col-rank">
                ${p.rank}
                <span class="mvmt ${mvmtCl}" title="Ranking movement">${mvmt}</span>
            </td>
            <td class="col-flag">${flag(p.country)}</td>
            <td class="col-name">
                <span class="player-name" data-open-player>${p.name}</span>${star}
            </td>
            <td class="num col-age enrichable" data-field="age">${age != null ? age : '<span class="enrich-placeholder">·</span>'}</td>
            <td class="num col-pts">${p.points.toLocaleString()}</td>
            <td class="num col-titles enrichable" data-field="titles"><span class="enrich-placeholder">·</span></td>
            <td class="num col-wpct enrichable"   data-field="wpct"><span class="enrich-placeholder">·</span></td>
            <td class="col-form enrichable"        data-field="form"><span class="enrich-placeholder">···</span></td>
        </tr>`;
    }

    function cell(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    }

    function digitPlayerKey(value) {
        return /^\d{1,10}$/.test(String(value || ''));
    }

    // Surface rows: names, flags, and records are text nodes only.
    function renderSurfaceRow(p) {
        const tr = document.createElement('tr');
        tr.dataset.playerKey = p.playerKey;
        tr.dataset.tour = currentTour;
        tr.dataset.rank = String(p.rank);
        tr.dataset.name = p.name;
        tr.dataset.country = p.country || '';
        if (p.age != null) tr.dataset.age = String(p.age);

        tr.appendChild(cell('td', 'col-rank', String(p.rank)));
        tr.appendChild(cell('td', 'col-flag', typeof flag === 'function' ? flag(p.country) : ''));

        const nameTd = cell('td', 'col-name');
        const nameEl = cell('span', 'player-name', p.name);
        if (digitPlayerKey(p.playerKey)) nameEl.setAttribute('data-open-player', '');
        nameTd.appendChild(nameEl);
        if (digitPlayerKey(p.playerKey) && typeof TW !== 'undefined' && TW.auth) {
            const starred = TW.auth.isFavorite(p.playerKey);
            const star = document.createElement('button');
            star.type = 'button';
            star.className = 'star-btn' + (starred ? ' starred' : '');
            star.dataset.playerKey = p.playerKey;
            star.setAttribute('aria-label', starred ? 'Remove from watch list' : 'Add to watch list');
            star.textContent = starred ? '★' : '☆';
            nameTd.appendChild(star);
        }
        tr.appendChild(nameTd);

        tr.appendChild(cell('td', 'num col-age', p.age != null ? String(p.age) : '—'));
        tr.appendChild(cell('td', 'num col-wl', formatSurfaceWL(p)));
        tr.appendChild(cell('td', 'num col-wpct', formatSurfaceWinPct(p)));
        return tr;
    }

    function showStatusRow(message) {
        const tbody = document.getElementById('rankingsBody');
        if (!tbody) return;
        tbody.replaceChildren();
        const tr = document.createElement('tr');
        const td = cell('td', 'rankings-status', message);
        td.colSpan = boardMode === 'overall' ? 8 : 6;
        tr.appendChild(td);
        tbody.appendChild(tr);
        const pager = document.getElementById('rankingsPagination');
        if (pager) pager.replaceChildren();
    }

    // ── Render one page of the table ────────────────────────────────────────────
    function renderPage(page) {
        const tbody = document.getElementById('rankingsBody');
        if (!tbody) return;

        const start = page * PAGE_SIZE;
        const slice = allPlayers.slice(start, start + PAGE_SIZE);

        tbody.innerHTML = slice.map(renderRow).join('');

        // Bind favorites
        if (typeof TW !== 'undefined' && TW.auth?.bindStarButtons) TW.auth.bindStarButtons(tbody);

        // Observe every new row for lazy stats enrichment
        tbody.querySelectorAll('tr[data-player-key]').forEach(row => rowObserver.observe(row));

        renderPagination(allPlayers, turnOverall);
    }

    function renderSurfacePage(page) {
        const tbody = document.getElementById('rankingsBody');
        if (!tbody) return;
        surfaceHoldNote = false;
        const start = page * PAGE_SIZE;
        const slice = surfaceView.slice(start, start + PAGE_SIZE);
        const frag = document.createDocumentFragment();
        slice.forEach(p => frag.appendChild(renderSurfaceRow(p)));
        tbody.replaceChildren(frag);
        if (typeof TW !== 'undefined' && TW.auth?.bindStarButtons) TW.auth.bindStarButtons(tbody);
        renderPagination(surfaceView, turnSurface);
    }

    function turnOverall(page) {
        currentPage = page;
        renderPage(currentPage);
        window.scrollTo(0, 0);
    }

    function turnSurface(page) {
        currentPage = page;
        renderSurfacePage(currentPage);
        window.scrollTo(0, 0);
    }

    // ── Pagination ─────────────────────────────────────────────────────────────
    function renderPagination(list, turnPage) {
        const el = document.getElementById('rankingsPagination');
        if (!el) return;
        el.replaceChildren();
        const totalPages = Math.ceil(list.length / PAGE_SIZE);
        if (totalPages <= 1) return;

        const rangeStart = currentPage * PAGE_SIZE + 1;
        const rangeEnd   = Math.min(rangeStart + PAGE_SIZE - 1, list.length);

        const prev = document.createElement('button');
        prev.className = 'page-btn';
        prev.id = 'pagePrev';
        prev.type = 'button';
        prev.textContent = '← Prev';
        prev.disabled = currentPage === 0;
        prev.addEventListener('click', () => {
            if (currentPage > 0) turnPage(currentPage - 1);
        });

        const info = document.createElement('span');
        info.className = 'page-info';
        info.textContent = `Showing ${rangeStart}–${rangeEnd} of ${list.length}`;

        const next = document.createElement('button');
        next.className = 'page-btn';
        next.id = 'pageNext';
        next.type = 'button';
        next.textContent = 'Next →';
        next.disabled = currentPage >= totalPages - 1;
        next.addEventListener('click', () => {
            if (currentPage < totalPages - 1) turnPage(currentPage + 1);
        });

        el.append(prev, info, next);
    }

    // ── Concurrency limiter — max 4 simultaneous /api/player-stats calls ─────────
    // Prevents overwhelming RapidAPI when 20+ rows enter the viewport at once.
    const sem = { running: 0, max: 4, queue: [] };
    function semRun(fn) {
        return new Promise((res, rej) => {
            const exec = () => {
                sem.running++;
                fn().then(res, rej).finally(() => {
                    sem.running--;
                    if (sem.queue.length) sem.queue.shift()();
                });
            };
            sem.running < sem.max ? exec() : sem.queue.push(exec);
        });
    }

    // ── Lazy stats enrichment via IntersectionObserver ─────────────────────────
    const rowObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (entry.isIntersecting) {
                rowObserver.unobserve(entry.target);
                enrichRow(entry.target);
            }
        }
    }, { rootMargin: '200px' });

    async function enrichRow(row) {
        const playerKey = row.dataset.playerKey;
        const tour      = row.dataset.tour;
        if (!playerKey) return;
        // Surface form rows already carry W–L and W%. Do not enrich them.
        if (boardMode !== 'overall') return;

        // Use in-memory cache to avoid duplicate in-flight requests
        if (!statsCache.has(playerKey)) {
            // Placeholder promise so concurrent observers don't double-fetch
            let resolve;
            const pending = new Promise(r => { resolve = r; });
            statsCache.set(playerKey, pending);

            try {
                const stats = await semRun(() =>
                    apiFetch(`/api/player-stats?tour=${tour}&playerKey=${playerKey}`)
                );
                statsCache.set(playerKey, stats);
                resolve(stats);
            } catch (_) {
                statsCache.set(playerKey, null);
                resolve(null);
            }
        }

        const stats = await statsCache.get(playerKey);
        if (!stats) return;
        if (boardMode !== 'overall') return;

        // Update player object in allPlayers so column sorting works
        const player = (allPlayers._original || allPlayers).find(p => p.playerKey === playerKey);
        if (player) {
            player._titles = stats.titles;
            player._winPct = stats.winPct;
            // Standings omits birthday — backfill it so the Age column and its sort work.
            if (stats.birthday) player.birthday = stats.birthday;
        }

        // Update dataset for sorting
        row.dataset.titles = stats.titles ?? '';
        row.dataset.wpct   = stats.winPct ?? '';

        // Age (from profile birthday supplied by player-stats)
        const age = computeAge(stats.birthday);
        row.dataset.birthday = stats.birthday || '';
        row.dataset.age      = age ?? 0;
        const ageCell = row.querySelector('.col-age');
        if (ageCell) ageCell.textContent = age != null ? age : '—';

        row.querySelector('[data-field="titles"]').textContent =
            stats.titles != null ? stats.titles : '—';
        row.querySelector('[data-field="wpct"]').textContent =
            stats.winPct != null ? `${stats.winPct}%` : '—';
        row.querySelector('[data-field="form"]').innerHTML =
            renderForm(stats.form);
    }

    function resetSortUi(col, dir) {
        currentSort = { col, dir };
        const table = document.getElementById('rankingsTable');
        if (!table) return;
        table.querySelectorAll('.sort-arrow').forEach(a => {
            a.textContent = '';
            a.classList.remove('active-sort');
        });
        const th = table.querySelector(`th[data-sort="${col}"]`);
        const arrow = th && th.querySelector('.sort-arrow');
        if (arrow) {
            arrow.textContent = dir === 'asc' ? ' ↑' : ' ↓';
            arrow.classList.add('active-sort');
        }
    }

    function setWpctHeader(surface) {
        const label = document.querySelector('#rankingsTable .wpct-label');
        const th = document.querySelector('#rankingsTable th.col-wpct');
        if (label) label.textContent = surface === 'overall' ? OVERALL_WPCT_HEADER : SURFACE_WPCT_HEADER;
        if (th) {
            th.dataset.tooltip = surface === 'overall'
                ? 'Win percentage this season'
                : 'Surface win% (not official ranking) — last 52 weeks on this surface';
        }
    }

    function revealActiveChip() {
        const active = document.querySelector('#surfaceTabs .surface-tab.active');
        if (!active || typeof active.scrollIntoView !== 'function') return;
        let reduce = false;
        try {
            reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        } catch (_) { /* ignore */ }
        try {
            active.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
        } catch (_) {
            active.scrollIntoView();
        }
    }

    function setActiveSurfaceChip(surface) {
        document.querySelectorAll('#surfaceTabs .surface-tab').forEach(btn => {
            const on = btn.dataset.surface === surface;
            btn.classList.toggle('active', on);
            btn.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        const table = document.getElementById('rankingsTable');
        if (table) table.classList.toggle('is-surface', surface !== 'overall');
        setWpctHeader(surface);
        revealActiveChip();
    }

    function syncRankingsQuery(tour, surface) {
        const allowedTour = (typeof parseTour === 'function' && parseTour(tour)) || 'ATP';
        const url = new URL(window.location.href);
        url.searchParams.set('tour', allowedTour);
        if (parseSurfaceParam(surface)) url.searchParams.set('surface', surface);
        else url.searchParams.delete('surface');
        const next = url.pathname + url.search + url.hash;
        const cur = window.location.pathname + window.location.search + window.location.hash;
        if (next !== cur) history.replaceState({}, '', next);
    }

    function ensureLiveRankingsVisible() {
        const liveBtn = document.querySelector('.ranking-mode-toggle .mode-btn[data-mode="live"]');
        if (liveBtn && !liveBtn.classList.contains('active')) liveBtn.click();
    }

    function searchQuery() {
        return (document.getElementById('playerSearch')?.value || '').trim().toLowerCase();
    }

    function syncSurfaceView() {
        const q = searchQuery();
        surfaceView = q
            ? surfaceRows.filter(p => p.name.toLowerCase().includes(q))
            : surfaceRows.slice();
    }

    // ── Table sorting ──────────────────────────────────────────────────────────
    const table = document.getElementById('rankingsTable');
    if (table) {
        table.querySelectorAll('th[data-sort]').forEach(th => {
            th.addEventListener('click', () => {
                const col = th.dataset.sort;
                const dir = (currentSort.col === col && currentSort.dir === 'asc') ? 'desc' : 'asc';
                resetSortUi(col, dir);
                currentPage = 0;
                if (boardMode !== 'overall') {
                    sortSurface(col, dir);
                    syncSurfaceView();
                    renderSurfacePage(0);
                    return;
                }
                sortPlayers(col, dir);
                renderPage(0);
            });
        });
    }

    function sortPlayers(col, dir) {
        allPlayers.sort((a, b) => {
            let vA, vB;
            // For enriched fields, fall back to default ordering if not yet loaded
            if (col === 'titles') { vA = a._titles ?? -1; vB = b._titles ?? -1; }
            else if (col === 'wpct') { vA = a._winPct ?? -1; vB = b._winPct ?? -1; }
            else if (col === 'age')  { vA = computeAge(a.birthday) ?? 0; vB = computeAge(b.birthday) ?? 0; }
            else if (col === 'pts')  { vA = a.points; vB = b.points; }
            else if (col === 'name') { return dir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name); }
            else { vA = a.rank; vB = b.rank; } // default: rank

            return dir === 'asc' ? vA - vB : vB - vA;
        });
    }

    function sortSurface(col, dir) {
        const sign = dir === 'asc' ? 1 : -1;
        surfaceRows.sort((a, b) => {
            if (col === 'name') return sign * a.name.localeCompare(b.name);
            if (col === 'age') return sign * ((a.age ?? 0) - (b.age ?? 0));
            if (col === 'wl') {
                const aN = a.w == null || a.l == null ? -1 : a.w + a.l;
                const bN = b.w == null || b.l == null ? -1 : b.w + b.l;
                return sign * (aN - bN);
            }
            if (col === 'wpct') return sign * (surfaceWinRatio(a) - surfaceWinRatio(b));
            return sign * (a.rank - b.rank);
        });
    }

    // ── Player search ──────────────────────────────────────────────────────────
    document.getElementById('playerSearch')?.addEventListener('input', e => {
        if (boardMode !== 'overall') {
            if (surfaceHoldNote) return;
            currentPage = 0;
            syncSurfaceView();
            renderSurfacePage(0);
            return;
        }
        const q = e.target.value.toLowerCase().trim();
        if (!q) {
            allPlayers = allPlayers._original || allPlayers;
            currentPage = 0;
            renderPage(0);
            return;
        }
        const filtered = (allPlayers._original || allPlayers).filter(p =>
            p.name.toLowerCase().includes(q)
        );
        // Temporarily replace for rendering without losing the original
        const orig = allPlayers._original || allPlayers;
        filtered._original = orig;
        allPlayers = filtered;
        currentPage = 0;
        renderPage(0);
    });

    function applyOverallSearch(rows) {
        const q = searchQuery();
        if (!q) return rows;
        const filtered = rows.filter(p => (p.name || '').toLowerCase().includes(q));
        filtered._original = rows;
        return filtered;
    }

    // ── Load standings ─────────────────────────────────────────────────────────
    async function loadStandings(tour = 'ATP') {
        const token = ++boardToken;
        boardMode = 'overall';
        currentTour = tour;
        surfaceHoldNote = false;
        statsCache.clear();
        ensureLiveRankingsVisible();
        setActiveSurfaceChip('overall');
        syncRankingsQuery(tour, 'overall');
        resetSortUi('rank', 'asc');

        const tbody = document.getElementById('rankingsBody');
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="padding:1.5rem">${skeletonHTML(8)}</td></tr>`;

        const title = document.getElementById('rankingsTitle');
        if (title) title.textContent = `${tour} Rankings`;

        try {
            const data = await apiFetch(`/api/standings?tour=${tour}`);
            if (token !== boardToken) return;
            const rows = Array.isArray(data) ? data : [];
            allPlayers = applyOverallSearch(rows);
            currentPage = 0;
            renderPage(0);
        } catch (err) {
            if (token !== boardToken) return;
            console.warn('Standings fetch failed:', err.message);
            if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="padding:1rem">
                ${errorCardHTML('Could not load standings.', 'window._retryStandings')}
            </td></tr>`;
            window._retryStandings = () => loadStandings(tour);
        }
    }

    async function loadSurface(tour, surface) {
        const allowed = parseSurfaceParam(surface);
        if (!allowed) {
            loadStandings(tour);
            return;
        }
        const token = ++boardToken;
        boardMode = allowed;
        currentTour = tour;
        surfaceRows = [];
        surfaceView = [];
        surfaceHoldNote = true;
        ensureLiveRankingsVisible();
        setActiveSurfaceChip(allowed);
        syncRankingsQuery(tour, allowed);
        resetSortUi('rank', 'asc');

        const title = document.getElementById('rankingsTitle');
        if (title) title.textContent = `${tour} Rankings`;
        showStatusRow(SURFACE_FORM_LOADING);

        try {
            const data = await apiFetch(surfaceFormPath(tour, allowed));
            if (token !== boardToken) return;
            const rawRows = surfaceFormRowsFromPayload(data);
            if (!rawRows) throw new Error('bad payload');
            const rows = rawRows.map(normalizeSurfaceFormRow).filter(Boolean);
            rows.sort((a, b) => a.rank - b.rank);
            if (!rows.length) {
                surfaceHoldNote = true;
                showStatusRow(surfaceFormStatusCopy(allowed, data));
                return;
            }
            surfaceRows = rows;
            currentPage = 0;
            syncSurfaceView();
            renderSurfacePage(0);
        } catch (err) {
            if (token !== boardToken) return;
            console.warn('Surface form fetch failed:', err.message);
            surfaceHoldNote = true;
            showStatusRow(SURFACE_FORM_ERROR);
        }
    }

    // ── Tour tab events ─────────────────────────────────────────────────────────
    document.querySelectorAll('.ranking-tabs .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.ranking-tabs .tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tour = btn.dataset.tab === 'wta' ? 'WTA' : 'ATP';
            if (boardMode === 'overall') loadStandings(tour);
            else loadSurface(tour, boardMode);
        });
    });

    document.querySelectorAll('#surfaceTabs .surface-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            const next = btn.dataset.surface === 'overall' ? 'overall' : parseSurfaceParam(btn.dataset.surface);
            if (!next || next === boardMode) return;
            if (next === 'overall') loadStandings(currentTour);
            else loadSurface(currentTour, next);
        });
    });

    // ── Sync star buttons when favorites change (toggle from player panel, etc.) ──
    document.addEventListener('tw:auth-change', () => {
        if (typeof TW === 'undefined' || !TW.auth) return;
        document.querySelectorAll('#rankingsBody .star-btn[data-player-key]').forEach(btn => {
            const pk       = btn.dataset.playerKey;
            const starred  = TW.auth.isFavorite(pk);
            btn.classList.toggle('starred', starred);
            btn.textContent = starred ? '★' : '☆';
            btn.setAttribute('aria-label', starred ? 'Remove from watch list' : 'Add to watch list');
        });
    });

    // ── Init ───────────────────────────────────────────────────────────────────
    const params = new URLSearchParams(window.location.search);
    const initialTour = (typeof parseTour === 'function' && parseTour(params.get('tour'))) || 'ATP';
    const initialSurface = parseSurfaceParam(params.get('surface')) || 'overall';
    document.querySelectorAll('.ranking-tabs .tab-btn').forEach(btn => {
        const tabTour = btn.dataset.tab === 'wta' ? 'WTA' : 'ATP';
        btn.classList.toggle('active', tabTour === initialTour);
    });
    if (initialSurface === 'overall') loadStandings(initialTour);
    else loadSurface(initialTour, initialSurface);

});
