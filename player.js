// ===================================
// TennisWorld — Player Profile Page
// ===================================

(function () {
    'use strict';

    const THIS_YEAR = new Date().getFullYear();
    let rankingChart = null;

    // ── URL params ────────────────────────────────────────────────────────────
    // name/country/rank/birthday are passed from the player panel and rankings
    // page so the hero renders correctly even when /api/players has namespace issues.

    const params       = new URLSearchParams(window.location.search);
    const playerKey    = params.get('playerKey');
    const tour         = (params.get('tour') || 'ATP').toUpperCase();
    const urlName      = params.get('name')     ? decodeURIComponent(params.get('name'))     : '';
    const urlCountry   = params.get('country')  ? decodeURIComponent(params.get('country'))  : '';
    const urlRank      = params.get('rank')      ? Number(params.get('rank'))                 : null;
    const urlBirthday  = params.get('birthday')  || null;

    // ── Entry ─────────────────────────────────────────────────────────────────

    document.addEventListener('DOMContentLoaded', () => {
        if (!playerKey) {
            showPageError('No player specified. <a href="rankings.html">Browse rankings →</a>');
            return;
        }
        loadPlayer();
        initH2H();
        if (urlName) setH2HPlayerADisplay(urlName);

        document.addEventListener('tw:auth-change', () => {
            renderStarButton(window._playerSeed || null);
        });
    });

    // ── Data loading ──────────────────────────────────────────────────────────

    async function loadPlayer() {
        const qsPlayer = encodeURIComponent(playerKey);
        const qsTour   = encodeURIComponent(tour);
        const [profileResult, statsResult, historyResult, rankHistResult] = await Promise.allSettled([
            apiFetch(`/api/players?playerKey=${qsPlayer}&tour=${qsTour}`),
            apiFetch(`/api/player-stats?tour=${qsTour}&playerKey=${qsPlayer}`),
            apiFetch(`/api/player-history?tour=${qsTour}&playerKey=${qsPlayer}`),
            apiFetch(`/api/player-ranking-history?tour=${qsTour}&playerKey=${qsPlayer}`),
        ]);

        const profile     = profileResult.status  === 'fulfilled' ? profileResult.value   : null;
        const stats       = statsResult.status    === 'fulfilled' ? statsResult.value     : null;
        const history     = historyResult.status  === 'fulfilled' ? historyResult.value   : null;
        const rankHistory = rankHistResult.status === 'fulfilled' ? rankHistResult.value  : null;

        // Legend / Sackmann keys (s…) often have ranking history in KV but no
        // RapidAPI profile/stats. URL identity is enough to render the hero.
        if (!profile && !stats && !history && !rankHistory && !urlName) {
            showPageError('Could not load player data. <a href="rankings.html">Browse rankings →</a>');
            return;
        }

        renderHero(profile, stats);
        renderSeasonStats(stats);
        renderSurfaceBars(profile, stats);
        renderForm(stats);
        renderRankingChart(rankHistory);
        renderCareerTable(history);
    }

    // ── Hero ──────────────────────────────────────────────────────────────────

    function renderHero(profile, stats) {
        // Prefer URL params (passed by panel/rankings/bracket) for instant paint; fall
        // back to the /api/players profile, which is now RapidAPI-sourced and shares the
        // draw/rankings ID namespace — so profile.name/country/currentRank are the SAME
        // person as the key (this is what fixed "Jeff Wolf from France"). Direct links
        // with no URL identity now resolve correctly from the profile.
        const name      = urlName     || profile?.name        || '—';
        const country   = urlCountry  || profile?.country     || '';
        const logoUrl   = profile?.logoUrl || null;
        const birthdate = urlBirthday || profile?.birthdate   || null;

        const rank    = urlRank || profile?.currentRank || null;

        const seed = { playerKey, name, country, rank, birthdate, tour };
        window._playerSeed = seed;

        document.title = `TennisWorld — ${name}`;

        // Name
        document.getElementById('heroName').textContent = name;

        // Meta: flag, country, rank, age, tour
        const flagEmoji = flag(country);
        const age       = computeAge(birthdate);
        const parts = [
            flagEmoji ? `${flagEmoji} ${country}` : country,
            age       ? `Age ${age}` : null,
            rank      ? `#${rank} ${tour}` : null,
        ].filter(Boolean);
        document.getElementById('heroMeta').innerHTML = parts
            .map(p => `<span class="hero-meta-item">${p}</span>`)
            .join('<span class="hero-meta-sep">·</span>');

        // Photo
        const photoEl = document.getElementById('heroPhotoEl');
        if (logoUrl) {
            const img   = document.createElement('img');
            img.src     = logoUrl;
            img.alt     = name;
            img.className = 'player-hero-photo';
            img.addEventListener('error', () => {
                img.replaceWith(makeFlagPlaceholder(flagEmoji));
            });
            photoEl.replaceWith(img);
        } else {
            const ph = makeFlagPlaceholder(flagEmoji || '🎾');
            photoEl.replaceWith(ph);
        }

        renderStarButton(seed);
    }

    function makeFlagPlaceholder(flagEmoji) {
        const ph = document.createElement('div');
        ph.className   = 'player-hero-photo-placeholder';
        ph.textContent = flagEmoji;
        return ph;
    }

    function renderStarButton(seed) {
        const actionsEl = document.getElementById('heroActions');
        if (!actionsEl || !seed) return;

        actionsEl.replaceChildren();
        if (typeof TW === 'undefined' || !TW.auth) return;

        const starred = TW.auth.isFavorite(seed.playerKey);
        const btn = document.createElement('button');
        btn.className = 'star-btn hero-star' + (starred ? ' starred' : '');
        btn.dataset.playerKey = String(seed.playerKey ?? '');
        btn.dataset.name = seed.name || '';
        btn.dataset.country = seed.country || '';
        btn.dataset.tour = seed.tour || '';
        btn.setAttribute('aria-label', starred ? 'Remove from watch list' : 'Add to watch list');
        btn.textContent = (starred ? '★' : '☆') + ' ' + (starred ? 'Watching' : 'Watch');
        actionsEl.appendChild(btn);
        TW.auth.bindStarButtons(actionsEl);
    }

    // ── Season stats ──────────────────────────────────────────────────────────

    function renderSeasonStats(stats) {
        document.getElementById('seasonLabel').textContent = `${THIS_YEAR} Season`;
        document.getElementById('statWinPct').textContent =
            stats?.winPct != null ? `${stats.winPct}%` : '—';
        document.getElementById('statRecord').textContent =
            (stats?.wins != null && stats?.losses != null) ? `${stats.wins}–${stats.losses}` : '—';
        document.getElementById('statTitles').textContent =
            stats?.titles != null ? String(stats.titles) : '—';
    }

    // ── Surface bars ──────────────────────────────────────────────────────────

    function renderSurfaceBars(profile, stats) {
        const el = document.getElementById('surfaceBars');

        // Prefer stats.surface (computed from past matches with correct RapidAPI keys).
        // Fall back to profile.seasons aggregation (api-tennis.com, may be empty).
        let surfaces;
        if (stats?.surface && Object.values(stats.surface).some(s => s.wins + s.losses > 0)) {
            surfaces = [
                { key: 'hard',  label: 'Hard',  wins: stats.surface.hard?.wins  || 0, losses: stats.surface.hard?.losses  || 0 },
                { key: 'clay',  label: 'Clay',  wins: stats.surface.clay?.wins  || 0, losses: stats.surface.clay?.losses  || 0 },
                { key: 'grass', label: 'Grass', wins: stats.surface.grass?.wins || 0, losses: stats.surface.grass?.losses || 0 },
            ];
        } else {
            const seasons = profile?.seasons || [];
            if (seasons.length === 0) {
                el.innerHTML = '<p class="no-data-msg">No data available</p>';
                return;
            }
            const totals = { hard: [0,0], clay: [0,0], grass: [0,0] };
            for (const s of seasons) {
                totals.hard[0]  += (s.hardW  || 0);  totals.hard[1]  += (s.hardL  || 0);
                totals.clay[0]  += (s.clayW  || 0);  totals.clay[1]  += (s.clayL  || 0);
                totals.grass[0] += (s.grassW || 0);  totals.grass[1] += (s.grassL || 0);
            }
            surfaces = [
                { key: 'hard',  label: 'Hard',  wins: totals.hard[0],  losses: totals.hard[1]  },
                { key: 'clay',  label: 'Clay',  wins: totals.clay[0],  losses: totals.clay[1]  },
                { key: 'grass', label: 'Grass', wins: totals.grass[0], losses: totals.grass[1] },
            ];
        }

        el.innerHTML = surfaces.map(s => {
            const total  = s.wins + s.losses;
            const pct    = total > 0 ? Math.round((s.wins / total) * 100) : 0;
            const matches = total > 0 ? `${s.wins}–${s.losses}` : '—';
            return `
                <div class="surface-bar-row surface-${s.key}">
                    <div class="surface-bar-label-row">
                        <span class="surface-bar-name">${s.label}</span>
                        <span class="surface-bar-record">${matches}</span>
                        <span class="surface-bar-pct">${total > 0 ? pct + '%' : '—'}</span>
                    </div>
                    <div class="surface-bar-track">
                        <div class="surface-bar-fill bar-fill"
                             style="width:${pct}%"
                             aria-label="${s.label} win rate ${pct}%"
                             role="progressbar"
                             aria-valuenow="${pct}"
                             aria-valuemin="0"
                             aria-valuemax="100"></div>
                    </div>
                </div>`;
        }).join('');
    }

    // ── Recent form ───────────────────────────────────────────────────────────

    function renderForm(stats) {
        const el   = document.getElementById('recentForm');
        const form = stats?.form || [];

        if (!form.length) {
            el.innerHTML = '<span class="no-data-msg">No recent matches</span>';
            return;
        }

        const dots = form.map(r =>
            `<span class="form-dot form-${r === 'W' ? 'w' : 'l'}"
                   title="${r === 'W' ? 'Win' : 'Loss'}"
                   aria-label="${r === 'W' ? 'Win' : 'Loss'}"></span>`
        ).join('');

        const wins   = form.filter(r => r === 'W').length;
        const losses = form.filter(r => r === 'L').length;

        el.innerHTML = `
            <div class="form-dots-row">${dots}</div>
            <div class="form-summary">${wins}W–${losses}L in last ${form.length}</div>`;
    }

    // ── Ranking history line chart ────────────────────────────────────────────
    // /api/player-ranking-history → { history: [{ date, rank }] }. Empty KV
    // yields [] — show a clear empty state, never invent points.

    function rankingHistoryPoints(rankHistory) {
        const raw = rankHistory && Array.isArray(rankHistory.history)
            ? rankHistory.history
            : [];
        return raw.filter(e => e && e.date && Number(e.rank) > 0)
            .map(e => ({ date: e.date, rank: Number(e.rank) }))
            .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    }

    function renderRankingChart(rankHistory) {
        const loadingEl = document.getElementById('rankingChartLoading');
        const canvasEl  = document.getElementById('rankingChart');
        const emptyEl   = document.getElementById('rankingChartEmpty');

        if (loadingEl) loadingEl.style.display = 'none';

        const points = rankingHistoryPoints(rankHistory);

        if (points.length < 2) {
            if (rankingChart) { rankingChart.destroy(); rankingChart = null; }
            if (canvasEl) canvasEl.style.display = 'none';
            if (emptyEl) {
                emptyEl.textContent = 'No ranking history available';
                emptyEl.style.display = 'block';
            }
            return;
        }

        if (emptyEl) emptyEl.style.display = 'none';
        if (canvasEl) canvasEl.style.display = 'block';

        const style     = getComputedStyle(document.documentElement);
        const accent    = style.getPropertyValue('--accent').trim()      || '#c9e94e';
        const textMuted = style.getPropertyValue('--text-muted').trim()  || '#8a8a96';
        const borderCol = style.getPropertyValue('--border').trim()      || '#e4e4e0';
        const bg        = style.getPropertyValue('--bg').trim()          || '#0a0e14';

        const labels = points.map(e => {
            const d = new Date(e.date);
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
        });
        const values = points.map(e => e.rank);

        const minRank = Math.min(...values);
        const maxRank = Math.max(...values);
        const padding = Math.max(5, Math.ceil((maxRank - minRank) * 0.15));

        if (rankingChart) rankingChart.destroy();

        rankingChart = new Chart(canvasEl, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label:           'Ranking',
                    data:            values,
                    borderColor:     accent,
                    backgroundColor: accent + '22',
                    borderWidth:     2,
                    pointRadius:     points.length > 30 ? 0 : 3,
                    pointHoverRadius: 5,
                    fill:            true,
                    tension:         0.3,
                }],
            },
            options: {
                responsive:          true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => `Rank #${ctx.parsed.y}`,
                            title: ctx => points[ctx[0].dataIndex].date,
                        },
                    },
                },
                scales: {
                    y: {
                        reverse: true,
                        min:     Math.max(1, minRank - padding),
                        max:     maxRank + padding,
                        ticks: {
                            color:     textMuted,
                            font:      { size: 11 },
                            callback:  v => `#${v}`,
                            maxTicksLimit: 6,
                        },
                        grid: { color: borderCol },
                    },
                    x: {
                        ticks: {
                            color:        textMuted,
                            font:         { size: 10 },
                            maxTicksLimit: 8,
                            maxRotation:  0,
                        },
                        grid: { display: false },
                    },
                },
            },
        });

        if (!window._twRankChartThemeBound) {
            window._twRankChartThemeBound = true;
            document.getElementById('themeToggle')?.addEventListener('click', () => {
                setTimeout(() => renderRankingChart(window._twRankHistory), 250);
            });
        }
        window._twRankHistory = rankHistory;
    }

    // ── Career table ──────────────────────────────────────────────────────────

    function renderCareerTable(history) {
        const el      = document.getElementById('careerTableWrap');
        const seasons = (history?.seasons || []).slice().sort((a, b) => b.year - a.year);

        if (!seasons.length) {
            el.innerHTML = '<p class="no-data-msg">No career data available</p>';
            return;
        }

        const rows = seasons.map((s, i) => {
            const winPct = s.winPct != null ? s.winPct + '%' : '—';
            const hard   = (s.hard.wins + s.hard.losses) > 0 ? `${s.hard.wins}–${s.hard.losses}`   : '—';
            const clay   = (s.clay.wins + s.clay.losses) > 0 ? `${s.clay.wins}–${s.clay.losses}`   : '—';
            const grass  = (s.grass.wins + s.grass.losses) > 0 ? `${s.grass.wins}–${s.grass.losses}` : '—';
            return `
                <tr class="${i % 2 === 0 ? 'career-row-even' : ''}">
                    <td class="career-year">${s.year}</td>
                    <td>${(s.wins||0)}–${(s.losses||0)}</td>
                    <td>${winPct}</td>
                    <td>${s.titles || 0}</td>
                    <td class="career-surface-cell">${hard}</td>
                    <td class="career-surface-cell">${clay}</td>
                    <td class="career-surface-cell">${grass}</td>
                </tr>`;
        }).join('');

        el.innerHTML = `
            <div class="career-table-scroll">
                <table class="career-table">
                    <thead>
                        <tr>
                            <th>Year</th><th>W-L</th>
                            <th>Win%</th><th>Titles</th>
                            <th>Hard</th><th>Clay</th><th>Grass</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
    }

    // ── H2H Quick Lookup ──────────────────────────────────────────────────────
    // Autocomplete uses createElement + textContent / dataset only.
    // Never interpolate API names or keys into innerHTML.

    function h2hEl(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null && text !== '') node.textContent = text;
        return node;
    }

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

    let standingsCache = null;
    let selectedPlayerB = null;

    function initH2H() {
        const inputB   = document.getElementById('h2hPlayerBInput');
        const dropdown = document.getElementById('h2hDropdown');
        const compareBtn = document.getElementById('h2hCompareBtn');

        // Seed Player A display once we have a name
        document.addEventListener('DOMContentLoaded', () => {});

        let debounceTimer;
        inputB.addEventListener('focus', fetchStandings);
        inputB.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => filterDropdown(inputB.value), 140);
        });

        compareBtn.addEventListener('click', () => {
            if (!selectedPlayerB || !playerKey) return;
            runH2H(playerKey, selectedPlayerB.playerKey, selectedPlayerB.tour || tour);
        });

        document.addEventListener('click', e => {
            if (!dropdown.contains(e.target) && e.target !== inputB) {
                dropdown.style.display = 'none';
            }
        });
    }

    function setH2HPlayerADisplay(name) {
        const el = document.getElementById('h2hPlayerADisplay');
        if (el) el.textContent = name || '—';
    }

    async function fetchStandings() {
        if (standingsCache) return;
        try {
            // Active ATP + retired legends (s+SackmannId). WTA standings stay
            // available for mixed H2H; legend backfill is ATP-only.
            const [atp, wta, vAtp] = await Promise.allSettled([
                apiFetch('/api/standings?tour=ATP'),
                apiFetch('/api/standings?tour=WTA'),
                apiFetch('/api/vintage-roster?tour=ATP'),
            ]);
            const list = [];
            const seen = new Set();
            const add = (p) => {
                const k = safePlayerKey(p.playerKey);
                const t = safeTour(p.tour);
                if (!p.name || !k || seen.has(k) || k === safePlayerKey(playerKey)) return;
                seen.add(k);
                list.push({ ...p, playerKey: k, tour: t || p.tour });
            };
            if (atp.status === 'fulfilled') (atp.value || []).forEach(p => add({ ...p, tour: 'ATP' }));
            if (wta.status === 'fulfilled') (wta.value || []).forEach(p => add({ ...p, tour: 'WTA' }));
            const legends = ((vAtp.status === 'fulfilled' && vAtp.value && vAtp.value.roster) || [])
                .filter(r => r.legend)
                .map(r => ({ playerKey: r.id, name: r.name, country: r.countryAcr, rank: r.position, tour: 'ATP', legend: true }));
            legends.forEach(add);
            standingsCache = list;
        } catch (_) { standingsCache = []; }
        // Re-filter with whatever the user typed while the list was loading —
        // otherwise a fast typist sees an empty dropdown until the next keystroke.
        const inputB = document.getElementById('h2hPlayerBInput');
        if (inputB && inputB.value.trim()) filterDropdown(inputB.value);
    }

    function filterDropdown(query) {
        const dropdown = document.getElementById('h2hDropdown');
        if (!dropdown) return;
        dropdown.replaceChildren();
        if (!query.trim() || !standingsCache) { dropdown.style.display = 'none'; return; }

        const q       = query.toLowerCase();
        const matches = standingsCache.filter(p => (p.name || '').toLowerCase().includes(q)).slice(0, 8);

        if (!matches.length) { dropdown.style.display = 'none'; return; }

        matches.forEach(p => {
            const key = safePlayerKey(p.playerKey);
            if (!key) return;
            const item = h2hEl('li', 'h2h-dropdown-item');
            item.setAttribute('role', 'option');
            item.dataset.key = key;
            item.dataset.name = p.name || '';
            item.dataset.tour = safeTour(p.tour) || 'ATP';

            const country = p.country || p.countryAcr;
            item.appendChild(h2hEl('span', 'h2h-drop-flag', typeof flag === 'function' ? flag(country) : ''));
            item.appendChild(h2hEl('span', 'h2h-drop-name', p.name || ''));
            const rankBit = p.legend ? 'Legend' : (p.rank != null && p.rank !== '' ? '#' + p.rank : '');
            item.appendChild(h2hEl('span', 'h2h-drop-rank', rankBit));

            item.addEventListener('click', () => {
                selectedPlayerB = {
                    playerKey: item.dataset.key,
                    name:      item.dataset.name,
                    tour:      item.dataset.tour,
                };
                const input = document.getElementById('h2hPlayerBInput');
                if (input) input.value = item.dataset.name;
                const display = document.getElementById('h2hPlayerBDisplay');
                if (display) display.textContent = item.dataset.name;
                dropdown.style.display = 'none';
                const compareBtn = document.getElementById('h2hCompareBtn');
                if (compareBtn) compareBtn.disabled = false;
            });
            dropdown.appendChild(item);
        });
        dropdown.style.display = dropdown.childElementCount ? 'block' : 'none';
    }

    async function runH2H(keyA, keyB, h2hTour) {
        const resultsEl = document.getElementById('h2hResults');
        const a = safePlayerKey(keyA);
        const b = safePlayerKey(keyB);
        const t = safeTour(h2hTour) || 'ATP';
        if (!resultsEl || !a || !b) return;
        resultsEl.innerHTML = skeletonHTML(4);

        try {
            const data = await apiFetch(`/api/h2h?playerKeyA=${encodeURIComponent(a)}&playerKeyB=${encodeURIComponent(b)}&tour=${encodeURIComponent(t)}`);
            renderH2HResults(data);
        } catch (err) {
            resultsEl.innerHTML = errorCardHTML('Could not load H2H data');
        }
    }

    function renderH2HResults(data) {
        const host = document.getElementById('h2hResults');
        if (!host) return;
        host.replaceChildren();

        const matches = data.h2hMatches || [];
        const splits  = data.surfaceSplits || {};
        const all     = splits.all || { p1wins: 0, p2wins: 0 };

        const p1Name = document.getElementById('heroName')?.textContent || '';
        const p2Name = selectedPlayerB?.name || 'Opponent';
        const p1Pct  = (all.p1wins + all.p2wins) > 0
            ? Math.round((all.p1wins / (all.p1wins + all.p2wins)) * 100)
            : 50;

        const summary = h2hEl('div', 'h2h-summary');
        const header = h2hEl('div', 'h2h-record-header');
        header.appendChild(h2hEl('span', 'h2h-p1-name', p1Name));
        header.appendChild(h2hEl('span', 'h2h-record-badge', all.p1wins + '–' + all.p2wins));
        header.appendChild(h2hEl('span', 'h2h-p2-name', p2Name));
        summary.appendChild(header);

        const bar = h2hEl('div', 'h2h-record-bar');
        const barP1 = h2hEl('div', 'h2h-bar-p1');
        barP1.style.width = p1Pct + '%';
        bar.appendChild(barP1);
        summary.appendChild(bar);

        const splitWrap = h2hEl('div', 'h2h-surface-splits');
        [['Hard', splits.hard], ['Clay', splits.clay], ['Grass', splits.grass]].forEach(([label, split]) => {
            const node = mountSurfaceSplit(label, split || {});
            if (node) splitWrap.appendChild(node);
        });
        summary.appendChild(splitWrap);
        host.appendChild(summary);

        if (!matches.length) {
            host.appendChild(h2hEl('p', 'no-data-msg', 'No head-to-head matches found.'));
            return;
        }

        const wrap = h2hEl('div', 'h2h-matches-wrap');
        wrap.appendChild(h2hEl('h3', 'h2h-matches-title', 'Match History'));
        const scroll = h2hEl('div', 'career-table-scroll');
        const table = h2hEl('table', 'career-table h2h-match-table');
        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        ['Date', 'Tournament', 'Winner', 'Score'].forEach(label => {
            headRow.appendChild(h2hEl('th', null, label));
        });
        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        matches.slice(0, 10).forEach(m => {
            const winner = m.winner === 'First Player' ? m.player1Name : m.player2Name;
            const score = Array.isArray(m.setScores)
                ? m.setScores.map(s => typeof s === 'string' ? s : `${s.p1}-${s.p2}`).join(', ')
                : (m.finalResult || '—');
            const dateStr = m.date
                ? new Date(m.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : '—';
            const surfRaw = String(m.surface || 'hard').toLowerCase();
            const surf = surfRaw.indexOf('clay') !== -1 ? 'clay' : surfRaw.indexOf('grass') !== -1 ? 'grass' : 'hard';

            const tr = document.createElement('tr');
            const dateTd = h2hEl('td', 'h2h-match-date', dateStr + ' ');
            dateTd.appendChild(h2hEl('span', 'h2h-surface-dot h2h-surface-' + surf));
            tr.appendChild(dateTd);

            const tourTd = h2hEl('td', 'h2h-match-tournament', m.tournamentName || '—');
            tourTd.appendChild(h2hEl('span', 'h2h-match-round', ' · ' + (m.round || '')));
            tr.appendChild(tourTd);

            tr.appendChild(h2hEl('td', 'h2h-match-winner', winner || ''));
            tr.appendChild(h2hEl('td', 'h2h-match-score', score));
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        scroll.appendChild(table);
        wrap.appendChild(scroll);
        host.appendChild(wrap);
    }

    function mountSurfaceSplit(label, split) {
        const p1 = split.p1wins || 0;
        const p2 = split.p2wins || 0;
        if (p1 + p2 === 0) return null;
        const item = h2hEl('span', 'h2h-split-item');
        item.appendChild(h2hEl('span', 'h2h-split-surface', label));
        item.appendChild(document.createTextNode(' ' + p1 + '–' + p2));
        return item;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    function computeAge(birthdate) {
        if (!birthdate) return null;
        const born = new Date(birthdate);
        if (isNaN(born)) return null;
        const today = new Date();
        let age = today.getFullYear() - born.getFullYear();
        const m = today.getMonth() - born.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < born.getDate())) age--;
        return age;
    }

    function showPageError(msg) {
        document.getElementById('playerGrid').style.display = 'none';
        document.getElementById('h2hCard').style.display    = 'none';
        const errEl = document.getElementById('playerError');
        errEl.style.display = 'block';
        errEl.innerHTML = `<div class="error-card" role="alert">
            <span class="error-card-icon">⚠</span>
            <span class="error-card-msg">${msg}</span>
        </div>`;
    }

    // Expose player A name to H2H once hero is rendered
    const heroNameObs = new MutationObserver(() => {
        const name = document.getElementById('heroName')?.textContent;
        if (name && name !== '—') {
            setH2HPlayerADisplay(name);
            heroNameObs.disconnect();
        }
    });
    const heroNameEl = document.getElementById('heroName');
    if (heroNameEl) heroNameObs.observe(heroNameEl, { childList: true, subtree: true, characterData: true });

}());
