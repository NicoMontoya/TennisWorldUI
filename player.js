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
        const [profileResult, statsResult, historyResult, rankHistResult] = await Promise.allSettled([
            apiFetch(`/api/players?playerKey=${playerKey}`),
            apiFetch(`/api/player-stats?tour=${tour}&playerKey=${playerKey}`),
            apiFetch(`/api/player-history?tour=${tour}&playerKey=${playerKey}`),
            apiFetch(`/api/player-ranking-history?tour=${tour}&playerKey=${playerKey}`),
        ]);

        const profile     = profileResult.status  === 'fulfilled' ? profileResult.value   : null;
        const stats       = statsResult.status    === 'fulfilled' ? statsResult.value     : null;
        const history     = historyResult.status  === 'fulfilled' ? historyResult.value   : null;
        const rankHistory = rankHistResult.status === 'fulfilled' ? rankHistResult.value  : null;

        if (!profile && !stats && !history) {
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
        // URL params (name/country/rank/birthday) come from the panel or rankings
        // page and use the correct RapidAPI namespace. profile?.name may be from
        // the mismatched api-tennis.com namespace so it is only a last fallback.
        const name      = urlName     || profile?.name     || '—';
        const country   = urlCountry  || profile?.country  || '';
        const logoUrl   = profile?.logoUrl || null;
        const birthdate = urlBirthday || profile?.birthdate || null;

        const seasons = profile?.seasons || [];
        const latest  = seasons.find(s => s.year === THIS_YEAR) || seasons[0];
        const rank    = urlRank || latest?.rank || null;

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

        if (typeof TW === 'undefined' || !TW.auth) {
            actionsEl.innerHTML = '';
            return;
        }

        const starred = TW.auth.isFavorite(seed.playerKey);
        actionsEl.innerHTML = `
            <button class="star-btn hero-star${starred ? ' starred' : ''}"
                data-player-key="${seed.playerKey}"
                data-name="${seed.name}"
                data-country="${seed.country}"
                data-tour="${seed.tour}"
                aria-label="${starred ? 'Remove from' : 'Add to'} watch list">
                ${starred ? '★' : '☆'} ${starred ? 'Watching' : 'Watch'}
            </button>`;
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

    function renderRankingChart(rankHistory) {
        const loadingEl = document.getElementById('rankingChartLoading');
        const canvasEl  = document.getElementById('rankingChart');
        const emptyEl   = document.getElementById('rankingChartEmpty');

        loadingEl.style.display = 'none';

        const points = (rankHistory?.history || []).filter(e => e.rank > 0);

        if (points.length < 2) {
            emptyEl.style.display = 'block';
            return;
        }

        canvasEl.style.display = 'block';

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

        document.getElementById('themeToggle')?.addEventListener('click', () => {
            setTimeout(() => renderRankingChart(rankHistory), 250);
        });
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
            const [atp, wta] = await Promise.allSettled([
                apiFetch('/api/standings?tour=ATP'),
                apiFetch('/api/standings?tour=WTA'),
            ]);
            standingsCache = [
                ...(atp.status === 'fulfilled' ? atp.value : []).map(p => ({ ...p, tour: 'ATP' })),
                ...(wta.status === 'fulfilled' ? wta.value : []).map(p => ({ ...p, tour: 'WTA' })),
            ].filter(p => String(p.playerKey) !== String(playerKey));
        } catch (_) { standingsCache = []; }
        // Re-filter with whatever the user typed while the list was loading —
        // otherwise a fast typist sees an empty dropdown until the next keystroke.
        const inputB = document.getElementById('h2hPlayerBInput');
        if (inputB && inputB.value.trim()) filterDropdown(inputB.value);
    }

    function filterDropdown(query) {
        const dropdown = document.getElementById('h2hDropdown');
        if (!query.trim() || !standingsCache) { dropdown.style.display = 'none'; return; }

        const q       = query.toLowerCase();
        const matches = standingsCache.filter(p => p.name.toLowerCase().includes(q)).slice(0, 8);

        if (!matches.length) { dropdown.style.display = 'none'; return; }

        dropdown.innerHTML = matches.map(p =>
            `<li class="h2h-dropdown-item" role="option"
                 data-key="${p.playerKey}" data-name="${p.name}" data-tour="${p.tour}">
                <span class="h2h-drop-flag">${flag(p.country)}</span>
                <span class="h2h-drop-name">${p.name}</span>
                <span class="h2h-drop-rank">#${p.rank}</span>
             </li>`
        ).join('');
        dropdown.style.display = 'block';

        dropdown.querySelectorAll('.h2h-dropdown-item').forEach(item => {
            item.addEventListener('click', () => {
                selectedPlayerB = {
                    playerKey: item.dataset.key,
                    name:      item.dataset.name,
                    tour:      item.dataset.tour,
                };
                document.getElementById('h2hPlayerBInput').value = item.dataset.name;
                document.getElementById('h2hPlayerBDisplay').textContent = item.dataset.name;
                dropdown.style.display = 'none';
                document.getElementById('h2hCompareBtn').disabled = false;
            });
        });
    }

    async function runH2H(keyA, keyB, h2hTour) {
        const resultsEl = document.getElementById('h2hResults');
        resultsEl.innerHTML = skeletonHTML(4);

        try {
            const data = await apiFetch(`/api/h2h?playerKeyA=${keyA}&playerKeyB=${keyB}&tour=${h2hTour}`);
            renderH2HResults(data);
        } catch (err) {
            resultsEl.innerHTML = errorCardHTML('Could not load H2H data');
        }
    }

    function renderH2HResults(data) {
        const el      = document.getElementById('h2hResults');
        const matches = data.h2hMatches || [];
        const splits  = data.surfaceSplits || {};
        const all     = splits.all || { p1wins: 0, p2wins: 0 };

        const p1Name = document.getElementById('heroName').textContent;
        const p2Name = selectedPlayerB?.name || 'Opponent';
        const total  = all.p1wins + all.p2wins;
        const p1Pct  = total > 0 ? Math.round((all.p1wins / total) * 100) : 50;

        const recentRows = matches.slice(0, 10).map(m => {
            const winner    = m.winner === 'First Player' ? m.player1Name : m.player2Name;
            const score     = Array.isArray(m.setScores)
                ? m.setScores.map(s => typeof s === 'string' ? s : `${s.p1}-${s.p2}`).join(', ')
                : m.finalResult || '—';
            const dateStr   = m.date ? new Date(m.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
            const surfaceDot = `<span class="h2h-surface-dot h2h-surface-${(m.surface||'hard').toLowerCase()}"></span>`;
            return `
                <tr>
                    <td class="h2h-match-date">${dateStr} ${surfaceDot}</td>
                    <td class="h2h-match-tournament">${m.tournamentName || '—'}<span class="h2h-match-round"> · ${m.round || ''}</span></td>
                    <td class="h2h-match-winner">${winner}</td>
                    <td class="h2h-match-score">${score}</td>
                </tr>`;
        }).join('');

        el.innerHTML = `
            <div class="h2h-summary">
                <div class="h2h-record-header">
                    <span class="h2h-p1-name">${p1Name}</span>
                    <span class="h2h-record-badge">${all.p1wins}–${all.p2wins}</span>
                    <span class="h2h-p2-name">${p2Name}</span>
                </div>
                <div class="h2h-record-bar">
                    <div class="h2h-bar-p1" style="width:${p1Pct}%"></div>
                </div>
                <div class="h2h-surface-splits">
                    ${renderSurfaceSplit('Hard',  splits.hard  || {})}
                    ${renderSurfaceSplit('Clay',  splits.clay  || {})}
                    ${renderSurfaceSplit('Grass', splits.grass || {})}
                </div>
            </div>
            ${matches.length ? `
            <div class="h2h-matches-wrap">
                <h3 class="h2h-matches-title">Match History</h3>
                <div class="career-table-scroll">
                    <table class="career-table h2h-match-table">
                        <thead><tr>
                            <th>Date</th><th>Tournament</th><th>Winner</th><th>Score</th>
                        </tr></thead>
                        <tbody>${recentRows}</tbody>
                    </table>
                </div>
            </div>` : '<p class="no-data-msg" style="margin-top:1rem;">No head-to-head matches found.</p>'}`;
    }

    function renderSurfaceSplit(label, split) {
        const p1 = split.p1wins || 0;
        const p2 = split.p2wins || 0;
        if (p1 + p2 === 0) return '';
        return `<span class="h2h-split-item"><span class="h2h-split-surface">${label}</span> ${p1}–${p2}</span>`;
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
