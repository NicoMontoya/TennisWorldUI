// ===================================
// TennisWorld — Rankings page
// ===================================

document.addEventListener('DOMContentLoaded', () => {

    const PAGE_SIZE = 100;

    let allPlayers  = [];   // full standings array, sorted by rank
    let currentPage = 0;
    let currentTour = 'ATP';
    let currentSort = { col: 'rank', dir: 'asc' };

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
            <td class="num col-age">${age ?? '—'}</td>
            <td class="num col-pts">${p.points.toLocaleString()}</td>
            <td class="num col-titles enrichable" data-field="titles"><span class="enrich-placeholder">·</span></td>
            <td class="num col-wpct enrichable"   data-field="wpct"><span class="enrich-placeholder">·</span></td>
            <td class="col-form enrichable"        data-field="form"><span class="enrich-placeholder">···</span></td>
        </tr>`;
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

        renderPagination();
    }

    // ── Pagination ─────────────────────────────────────────────────────────────
    function renderPagination() {
        const el = document.getElementById('rankingsPagination');
        if (!el) return;
        const totalPages = Math.ceil(allPlayers.length / PAGE_SIZE);
        if (totalPages <= 1) { el.innerHTML = ''; return; }

        const rangeStart = currentPage * PAGE_SIZE + 1;
        const rangeEnd   = Math.min(rangeStart + PAGE_SIZE - 1, allPlayers.length);

        el.innerHTML = `
            <button class="page-btn" id="pagePrev" ${currentPage === 0 ? 'disabled' : ''}>← Prev</button>
            <span class="page-info">Showing ${rangeStart}–${rangeEnd} of ${allPlayers.length}</span>
            <button class="page-btn" id="pageNext" ${currentPage >= totalPages - 1 ? 'disabled' : ''}>Next →</button>`;

        el.querySelector('#pagePrev')?.addEventListener('click', () => {
            if (currentPage > 0) { currentPage--; renderPage(currentPage); window.scrollTo(0, 0); }
        });
        el.querySelector('#pageNext')?.addEventListener('click', () => {
            if (currentPage < totalPages - 1) { currentPage++; renderPage(currentPage); window.scrollTo(0, 0); }
        });
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

        // Update player object in allPlayers so column sorting works
        const player = (allPlayers._original || allPlayers).find(p => p.playerKey === playerKey);
        if (player) { player._titles = stats.titles; player._winPct = stats.winPct; }

        // Update dataset for sorting
        row.dataset.titles = stats.titles ?? '';
        row.dataset.wpct   = stats.winPct ?? '';

        row.querySelector('[data-field="titles"]').textContent =
            stats.titles != null ? stats.titles : '—';
        row.querySelector('[data-field="wpct"]').textContent =
            stats.winPct != null ? `${stats.winPct}%` : '—';
        row.querySelector('[data-field="form"]').innerHTML =
            renderForm(stats.form);
    }

    // ── Table sorting ──────────────────────────────────────────────────────────
    const table = document.getElementById('rankingsTable');
    if (table) {
        table.querySelectorAll('th[data-sort]').forEach(th => {
            th.addEventListener('click', () => {
                const col = th.dataset.sort;
                const dir = (currentSort.col === col && currentSort.dir === 'asc') ? 'desc' : 'asc';
                currentSort = { col, dir };

                table.querySelectorAll('.sort-arrow').forEach(a => {
                    a.textContent = '';
                    a.classList.remove('active-sort');
                });
                const arrow = th.querySelector('.sort-arrow');
                if (arrow) {
                    arrow.textContent = dir === 'asc' ? ' ↑' : ' ↓';
                    arrow.classList.add('active-sort');
                }

                sortPlayers(col, dir);
                currentPage = 0;
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

    // ── Player search ──────────────────────────────────────────────────────────
    document.getElementById('playerSearch')?.addEventListener('input', e => {
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

    // ── Load standings ─────────────────────────────────────────────────────────
    async function loadStandings(tour = 'ATP') {
        currentTour = tour;
        statsCache.clear();

        const tbody = document.getElementById('rankingsBody');
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="padding:1.5rem">${skeletonHTML(8)}</td></tr>`;

        document.getElementById('rankingsTitle').textContent    = `${tour} Rankings`;
        document.getElementById('rankingsSubtitle').textContent = 'All ranked players · live data';

        try {
            const data = await apiFetch(`/api/standings?tour=${tour}`);
            allPlayers = data;
            currentPage = 0;
            currentSort = { col: 'rank', dir: 'asc' };
            renderPage(0);
        } catch (err) {
            console.warn('Standings fetch failed:', err.message);
            if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="padding:1rem">
                ${errorCardHTML('Could not load standings.', 'window._retryStandings')}
            </td></tr>`;
            window._retryStandings = () => loadStandings(tour);
        }
    }

    // ── Tour tab events ─────────────────────────────────────────────────────────
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            loadStandings(btn.dataset.tab === 'wta' ? 'WTA' : 'ATP');
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
    loadStandings('ATP');

});
