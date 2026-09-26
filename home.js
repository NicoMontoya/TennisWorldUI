// ===================================
// TennisWorld — Home / Vintage Curves
// ===================================
// Cumulative career metric vs age ("years old"), one curve per player.
// Data: /api/vintage-roster (top-100 + ATP legends) and
//       /api/player-vintage?playerKey=N|s{SackmannId}
//       → { player, points: [{age,w,m}], totals }. Legends use 's'-prefixed keys.
// Metric toggle re-maps the already-fetched points — no refetch.
// Rank is the exception: it reads /api/vintage-rank-by-age (same playerKey)
// and is cached on its own map so a 404 cannot blank the other five metrics.
// Selection persists in localStorage (tw-vintage-players); colors follow the
// player (slot stored with selection), never their position in the list.

document.addEventListener('DOMContentLoaded', () => {

    const STORAGE_KEY   = 'tw-vintage-players';
    const TOUR          = 'ATP';
    const MAX_CONCURRENT = 3;
    const MAX_PLAYERS   = 12;      // cap ~8–12; default ATP top 10 is within this
    const METRIC_KEYS   = ['w', 'm', 't', 'ms', 'gs', 'rk'];

    // Categorical palette — validated (dataviz six-checks) against #ffffff and
    // #1c2333 card surfaces. Slot order is the CVD-safety mechanism; do not sort.
    const PALETTE_LIGHT = ['#2a78d6','#eda100','#4a3aa7','#1baf7a','#e34948','#0e9bb5','#eb6834','#008300','#e87ba4','#808f00'];
    const PALETTE_DARK  = ['#3987e5','#c98500','#9085e9','#199e70','#e66767','#1794ad','#d95926','#008300','#d55181','#8a9b13'];

    const METRICS = {
        w:  { label: 'Matches won',       noun: 'wins'           },
        m:  { label: 'Matches played',    noun: 'matches'        },
        t:  { label: 'Tournaments won',   noun: 'titles'         },
        ms: { label: 'Masters 1000 won',  noun: 'Masters titles' },
        gs: { label: 'Grand Slams won',   noun: 'Slam titles'    },
        rk: { label: 'ATP rank (Top 200)', noun: 'rank'         },
    };

    let roster    = [];            // [{position,id,name,countryAcr}]
    let selection = [];            // [{id,name,slot}]
    let curves    = new Map();     // id → { player, points, totals } | { error }
    let rankCurves = new Map();    // id → vintage-rank-by-age state (separate from curves)
    let metric    = 'w';
    let chart     = null;

    function rankApi() {
        return (typeof window !== 'undefined' && window.TW && window.TW.VintageRank) || null;
    }

    const els = {
        loading: document.getElementById('vintageLoading'),
        canvas:  document.getElementById('vintageChart'),
        chips:   document.getElementById('playerChips'),
        input:   document.getElementById('playerAddInput'),
        datalist: document.getElementById('rosterList'),
        reset:   document.getElementById('resetTop10'),
        toggle:  document.getElementById('metricToggle'),
        note:    document.getElementById('vintageNote'),
        sub:     document.getElementById('vintageSub'),
        chartWrap: document.getElementById('vintageChartWrap'),
        empty:   document.getElementById('vintageEmpty'),
    };

    // ── Theme-aware chart chrome ──────────────────────────────────────────────
    function isDark() {
        return document.documentElement.getAttribute('data-theme') === 'dark';
    }
    function chrome() {
        const css = getComputedStyle(document.documentElement);
        return {
            ink:  css.getPropertyValue('--text-secondary').trim(),
            muted: css.getPropertyValue('--text-muted').trim(),
            grid: css.getPropertyValue('--border').trim(),
        };
    }
    function seriesColor(slot) {
        return (isDark() ? PALETTE_DARK : PALETTE_LIGHT)[slot % PALETTE_LIGHT.length];
    }

    // ── Selection persistence ─────────────────────────────────────────────────
    function loadSelection() {
        try {
            const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (Array.isArray(raw) && raw.length && raw.every(p => p.id && p.name && Number.isInteger(p.slot))) {
                return raw.slice(0, MAX_PLAYERS);
            }
        } catch { /* fall through to default */ }
        return null;
    }
    function saveSelection() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
    }
    function freeSlot() {
        const used = new Set(selection.map(p => p.slot));
        for (let s = 0; s < PALETTE_LIGHT.length; s++) if (!used.has(s)) return s;
        return selection.length % PALETTE_LIGHT.length;
    }

    function isLegendKey(id) {
        return String(id || '').charAt(0) === 's';
    }

    // Keep finite (age, metric) points only — never invent zeros for KV misses.
    function usablePoints(points) {
        return (Array.isArray(points) ? points : []).filter(pt =>
            pt && Number.isFinite(Number(pt.age))
        );
    }

    function classifyVintage(id, data) {
        if (!data || typeof data !== 'object') return { error: 'fetch-failed' };
        const points = usablePoints(data.points);
        const birthday = data.player && data.player.birthday;
        if (!points.length) {
            if (!birthday) return { error: 'no-birthday', player: data.player };
            if (isLegendKey(id)) return { error: 'not-loaded', player: data.player };
            return { player: data.player, points: [] };
        }
        return { ...data, points };
    }

    // ── Concurrency-limited fetch queue ───────────────────────────────────────
    const queue = [];
    let inFlight = 0;
    function enqueue(playerId) {
        if (curves.has(playerId)) { syncChart(); return; }
        queue.push(playerId);
        pump();
    }
    function pump() {
        while (inFlight < MAX_CONCURRENT && queue.length) {
            const id = queue.shift();
            inFlight++;
            apiFetch(`/api/player-vintage?tour=${encodeURIComponent(TOUR)}&playerKey=${encodeURIComponent(id)}`)
                .then(data => { curves.set(id, classifyVintage(id, data)); })
                .catch(()  => { curves.set(id, { error: 'fetch-failed' }); })
                .finally(() => {
                    inFlight--;
                    syncChart();     // progressive: each resolved player appears immediately
                    pump();
                });
        }
    }

    // Rank fetches stay off the vintage queue. The route is live; not-loaded
    // means this player is not in the backfill yet. A 404, 429, or network
    // error is only a defensive empty series and never writes `curves`.
    const rankQueue = [];
    let rankInFlight = 0;
    const rankQueued = new Set();
    function enqueueRank(playerId) {
        if (rankCurves.has(playerId) || rankQueued.has(playerId)) return;
        rankQueued.add(playerId);
        rankQueue.push(playerId);
        pumpRank();
    }
    function pumpRank() {
        const VR = rankApi();
        while (rankInFlight < MAX_CONCURRENT && rankQueue.length) {
            const id = rankQueue.shift();
            rankInFlight++;
            apiFetch(`/api/vintage-rank-by-age?tour=${encodeURIComponent(TOUR)}&playerKey=${encodeURIComponent(id)}`)
                .then(data => {
                    rankCurves.set(id, VR ? VR.classify(data) : { available: false, quiet: true, points: [], name: '' });
                })
                .catch(err => {
                    const fail = VR ? VR.failureFromError(err) : { quiet: true, available: false, points: [], error: null, name: '' };
                    const player = selection.find(p => String(p.id) === String(id));
                    if (!fail.name && player) fail.name = player.name || '';
                    rankCurves.set(id, fail);
                })
                .finally(() => {
                    rankInFlight--;
                    rankQueued.delete(id);
                    if (metric === 'rk') syncChart();
                    pumpRank();
                });
        }
    }

    // ── Chart ─────────────────────────────────────────────────────────────────
    // Direct end-labels (player surname at each curve's last point) are the
    // secondary encoding required for a 10-series categorical palette.
    const endLabelPlugin = {
        id: 'twEndLabels',
        // No. 1 and Top 10 guides. Drawn on the existing canvas plugin so the
        // built-in tooltip never treats them as a series.
        beforeDatasetsDraw(c) {
            const opts = c.options.plugins && c.options.plugins.twEndLabels;
            if (!opts || !opts.guides) return;
            const VR = rankApi();
            const yScale = c.scales && c.scales.y;
            const area = c.chartArea;
            if (!VR || !yScale || !area) return;
            const drawn = (c.data.datasets || []).some(ds =>
                (ds.data || []).some(pt => pt && pt.y != null)
            );
            if (!drawn) return;
            const ctx = c.ctx;
            ctx.save();
            ctx.strokeStyle = chrome().muted;
            ctx.lineWidth = 1;
            ctx.setLineDash([]);
            VR.GUIDE_RANKS.forEach(rank => {
                const py = yScale.getPixelForValue(rank);
                if (!Number.isFinite(py)) return;
                ctx.beginPath();
                ctx.moveTo(area.left, py);
                ctx.lineTo(area.right, py);
                ctx.stroke();
            });
            ctx.restore();
        },
        afterDatasetsDraw(c) {
            const { ctx } = c;
            const ink = chrome().ink;
            ctx.save();
            ctx.font = '600 11px Inter, sans-serif';
            ctx.fillStyle = ink;
            ctx.textBaseline = 'middle';
            c.data.datasets.forEach((ds, i) => {
                const meta = c.getDatasetMeta(i);
                if (!ds.label || meta.hidden || !meta.data.length) return;
                const last = meta.data[meta.data.length - 1];
                const name = ds.label.split(' ').pop();
                ctx.fillText(name, Math.min(last.x + 6, c.chartArea.right + 4), last.y);
            });
            ctx.restore();
        },
    };

    function buildDatasets() {
        return selection
            .filter(p => {
                const cv = curves.get(p.id);
                return cv && !cv.error && usablePoints(cv.points).length;
            })
            .map(p => {
                const cv = curves.get(p.id);
                const pts = usablePoints(cv.points)
                    .filter(pt => Number.isFinite(Number(pt[metric])))
                    .map(pt => ({ x: Number(pt.age), y: Number(pt[metric]) }));
                return {
                    label: p.name,
                    data: pts,
                    borderColor: seriesColor(p.slot),
                    backgroundColor: seriesColor(p.slot),
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHitRadius: 8,
                    tension: 0,
                };
            })
            .filter(ds => ds.data.length);
    }

    function collectAges() {
        const ages = [];
        selection.forEach(p => {
            const cv = curves.get(p.id);
            if (cv && !cv.error && Array.isArray(cv.points)) {
                cv.points.forEach(pt => {
                    const age = Number(pt && pt.age);
                    if (Number.isFinite(age)) ages.push(age);
                });
            }
            const rk = rankCurves.get(p.id);
            if (rk && Array.isArray(rk.points)) {
                rk.points.forEach(pt => {
                    const age = Number(pt && pt.x);
                    if (Number.isFinite(age)) ages.push(age);
                });
            }
        });
        return ages;
    }

    function buildRankDatasets() {
        const VR = rankApi();
        if (!VR) return [];
        return selection.map(p => {
            const rk = rankCurves.get(p.id);
            if (!rk || !rk.points || !rk.points.some(pt => pt && pt.y != null)) return null;
            return VR.rankDataset(rk, seriesColor(p.slot), p.name);
        }).filter(Boolean);
    }

    function reduceMotion() {
        return typeof matchMedia === 'function'
            && matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    function chartOptions() {
        const ch = chrome();
        const VR = rankApi();
        const rank = metric === 'rk' && !!VR;
        const domain = rank ? VR.ageDomain(collectAges()) : null;
        const xTicks = {
            color: ch.muted,
            font: { family: 'Inter', size: 11 },
        };
        if (rank) {
            xTicks.precision = 0;
            xTicks.callback = value => Number.isInteger(value) ? String(value) : '';
        }
        const options = {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { right: 76 } },   // room for direct end-labels
            interaction: { mode: 'nearest', intersect: false },
            plugins: {
                legend: { display: false },       // the chips row is the legend
                twEndLabels: { guides: rank },
                tooltip: rank ? {
                    callbacks: {
                        title: () => '',
                        label: item => {
                            const raw = item && item.raw;
                            if (!raw || raw.y == null) return '';
                            const ds = item.dataset || {};
                            return VR.formatRankTooltip({
                                name: ds.playerName || ds.label || '',
                                age: raw.x,
                                rank: raw.y,
                                weeksAtRank: raw.weeksAtRank,
                                rankedWeeks: raw.rankedWeeks,
                                partial: raw.partial === true,
                                asOf: ds.asOf,
                            });
                        },
                    },
                } : {
                    callbacks: {
                        title: items => items.length ? `${items[0].dataset.label}` : '',
                        label: item => `${item.parsed.x.toFixed(1)} yrs old — ${item.parsed.y} ${METRICS[metric].noun}`,
                    },
                },
            },
            scales: {
                x: {
                    type: 'linear',
                    min: domain ? domain.min : undefined,
                    max: domain ? domain.max : undefined,
                    title: { display: true, text: 'Years old', color: ch.ink, font: { family: 'Inter', size: 12, weight: '500' } },
                    ticks: xTicks,
                    grid:  { color: ch.grid, drawTicks: false },
                },
                y: rank ? {
                    type: 'logarithmic',
                    reverse: true,
                    min: VR.Y_MIN,
                    max: VR.Y_MAX,
                    title: { display: true, text: VR.Y_TITLE, color: ch.ink, font: { family: 'Inter', size: 12, weight: '500' } },
                    ticks: {
                        color: ch.muted,
                        autoSkip: false,
                        font: { family: 'Inter', size: 11 },
                        callback: value => VR.tickLabel(value),
                    },
                    afterBuildTicks(scale) { VR.applyRankTicks(scale); },
                    grid:  { color: ch.grid, drawTicks: false },
                } : {
                    type: 'linear',
                    beginAtZero: true,
                    title: { display: true, text: METRICS[metric].label, color: ch.ink, font: { family: 'Inter', size: 12, weight: '500' } },
                    ticks: { color: ch.muted, font: { family: 'Inter', size: 11 } },
                    grid:  { color: ch.grid, drawTicks: false },
                },
            },
        };
        if (reduceMotion()) options.animation = false;
        return options;
    }

    function emptyMessage() {
        if (!roster.length) return 'No vintage roster available.';
        if (!selection.length) return 'Add a player to compare careers.';
        const unresolved = selection.filter(p => {
            const cv = curves.get(p.id);
            return cv && (cv.error || !cv.points?.length);
        });
        if (unresolved.length && unresolved.length === selection.length) {
            if (unresolved.every(p => curves.get(p.id)?.error === 'not-loaded')) {
                return 'Legend career curves are not loaded yet.';
            }
            return 'No career curves available.';
        }
        return 'No career curves available.';
    }

    function setEmpty(msg) {
        if (!els.empty) return;
        els.empty.textContent = msg || '';
        els.empty.hidden = !msg;
    }

    function rankView() {
        const VR = rankApi();
        if (!VR) return { note: '', empty: 'No career curves available.', drawable: false };
        const states = selection.map(p => {
            const rk = rankCurves.get(p.id);
            if (!rk) return null;
            const state = Object.assign({}, rk, { chipName: p.name || '' });
            if (!state.name) state.name = p.name || '';
            return state;
        }).filter(Boolean);
        return VR.viewState(states, VR.visibleAxisAges(collectAges()));
    }

    function syncChart() {
        const rankMode = metric === 'rk';
        const datasets = rankMode ? buildRankDatasets() : buildDatasets();
        const anyLoading = rankMode
            ? selection.some(p => !rankCurves.has(p.id))
            : selection.some(p => !curves.has(p.id));
        if (els.loading) els.loading.style.display = (datasets.length === 0 && anyLoading) ? '' : 'none';
        if (rankMode) {
            const view = rankView();
            setEmpty((datasets.length === 0 && !anyLoading) ? view.empty : '');
        } else {
            setEmpty((datasets.length === 0 && !anyLoading) ? emptyMessage() : '');
        }

        if (els.canvas && typeof Chart !== 'undefined') {
            const nextType = rankMode ? 'logarithmic' : 'linear';
            const currentType = chart && chart.scales && chart.scales.y ? chart.scales.y.type : null;
            if (!chart || currentType !== nextType) {
                if (chart) { chart.destroy(); chart = null; }
                chart = new Chart(els.canvas, {
                    type: 'line',
                    data: { datasets },
                    options: chartOptions(),
                    plugins: [endLabelPlugin],
                });
            } else {
                chart.data.datasets = datasets;
                chart.options = chartOptions();
                chart.update('none');
            }
        }
        renderChips();
        renderNote();
    }

    // ── Chips (legend + remove) ───────────────────────────────────────────────
    function renderChips() {
        if (!els.chips) return;
        els.chips.replaceChildren();
        selection.forEach(p => {
            let state;
            if (metric === 'rk') {
                const rk = rankCurves.get(p.id);
                if (!rk) state = ' is-loading';
                else if (rk.quiet) state = '';
                else if (rk.points && rk.points.some(pt => pt && pt.y != null)) state = '';
                else state = ' is-error';
            } else {
                const cv = curves.get(p.id);
                state = !cv ? ' is-loading' : (cv.error || !cv.points?.length) ? ' is-error' : '';
            }
            const chip = document.createElement('span');
            chip.className = 'player-chip' + state;
            chip.dataset.id = String(p.id);

            const dot = document.createElement('span');
            dot.className = 'chip-dot';
            dot.style.background = seriesColor(p.slot);

            const name = document.createElement('span');
            name.className = 'chip-name';
            name.textContent = p.name || '';

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'chip-remove';
            btn.dataset.id = String(p.id);
            btn.setAttribute('aria-label', 'Remove ' + (p.name || 'player') + ' from chart');
            btn.textContent = '×';

            chip.appendChild(dot);
            chip.appendChild(name);
            chip.appendChild(btn);
            els.chips.appendChild(chip);
        });
    }

    function renderNote() {
        if (metric === 'rk') {
            const view = rankView();
            const VR = rankApi();
            if (els.note) els.note.textContent = VR ? VR.noteForMetric(metric, view) : view.note;
            return;
        }
        const skipped = selection.filter(p => {
            const cv = curves.get(p.id);
            return cv && (cv.error === 'no-birthday' || (cv.error === undefined && !cv.points?.length));
        });
        const failed = selection.filter(p => curves.get(p.id)?.error === 'fetch-failed');
        const notLoaded = selection.filter(p => curves.get(p.id)?.error === 'not-loaded');
        const parts = [];
        if (skipped.length) parts.push(`No birthdate data for ${skipped.map(p => p.name).join(', ')} — skipped.`);
        if (failed.length)  parts.push(`Couldn't load ${failed.map(p => p.name).join(', ')}.`);
        if (notLoaded.length) parts.push(`Career curve not loaded for ${notLoaded.map(p => p.name).join(', ')}.`);
        if (els.note) els.note.textContent = parts.join(' ');
    }

    // ── Selection mutations ───────────────────────────────────────────────────
    function addPlayer(entry) {
        if (!entry || entry.id == null) return;
        if (selection.some(p => String(p.id) === String(entry.id))) return;
        if (selection.length >= MAX_PLAYERS) {
            if (els.note) els.note.textContent = 'Chart is capped at ' + MAX_PLAYERS + ' players.';
            return;
        }
        selection.push({ id: entry.id, name: entry.name, slot: freeSlot() });
        saveSelection();
        enqueue(entry.id);
        if (metric === 'rk') enqueueRank(entry.id);
        syncChart();
    }
    function removePlayer(id) {
        selection = selection.filter(p => String(p.id) !== String(id));
        saveSelection();
        syncChart();
    }
    function resetToTop10() {
        selection = roster.slice(0, 10).map((r, i) => ({ id: r.id, name: r.name, slot: i }));
        saveSelection();
        selection.forEach(p => enqueue(p.id));
        if (metric === 'rk') selection.forEach(p => enqueueRank(p.id));
        syncChart();
    }

    // ── Events ────────────────────────────────────────────────────────────────
    els.chips.addEventListener('click', e => {
        const btn = e.target.closest('.chip-remove');
        // ids are opaque strings — current players are numeric-strings, retired
        // legends are 's'-prefixed (Sackmann). Never coerce to Number.
        if (btn) removePlayer(btn.dataset.id);
    });

    els.reset.addEventListener('click', resetToTop10);

    els.input.addEventListener('change', () => {
        const name = els.input.value.trim().toLowerCase();
        const entry = roster.find(r => r.name.toLowerCase() === name);
        if (entry) { addPlayer(entry); els.input.value = ''; }
    });

    els.toggle.addEventListener('click', e => {
        const btn = e.target.closest('.metric-btn');
        if (!btn) return;
        const next = METRIC_KEYS.indexOf(btn.dataset.metric) >= 0 ? btn.dataset.metric : null;
        if (!next || next === metric) return;
        metric = next;
        els.toggle.querySelectorAll('.metric-btn').forEach(b => {
            const active = b === btn;
            b.classList.toggle('active', active);
            b.setAttribute('aria-pressed', String(active));
        });
        if (metric === 'rk') {
            els.sub.textContent = 'ATP rank (Top 200) by age — add or remove players to compare careers at the same age.';
            selection.forEach(p => enqueueRank(p.id));
        } else {
            els.sub.textContent = `Cumulative ${METRICS[metric].label.toLowerCase()} by age — add or remove players to compare careers at the same age.`;
        }
        if (els.canvas) {
            els.canvas.setAttribute('aria-label', metric === 'rk'
                ? 'Vintage curves: ATP rank by player age'
                : 'Vintage curves: cumulative ' + METRICS[metric].label.toLowerCase() + ' by player age');
        }
        syncChart();
    });

    // Re-skin the chart when the theme flips (shared.js toggles data-theme).
    new MutationObserver(() => syncChart())
        .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // ── Init ──────────────────────────────────────────────────────────────────
    (async () => {
        try {
            const data = await apiFetch(`/api/vintage-roster?tour=${encodeURIComponent(TOUR)}`);
            roster = data.roster || [];
        } catch {
            if (els.loading) els.loading.textContent = 'Could not load the player roster — is the API running?';
            setEmpty('');
            return;
        }

        if (!roster.length) {
            if (els.loading) {
                els.loading.textContent = 'No vintage roster available.';
                els.loading.style.display = '';
            }
            setEmpty('');
            return;
        }

        if (els.datalist) {
            els.datalist.replaceChildren();
            roster.forEach(r => {
                const opt = document.createElement('option');
                opt.value = r.name || '';
                opt.textContent = `${r.legend ? 'Legend' : '#' + r.position} · ${r.countryAcr || ''}`;
                els.datalist.appendChild(opt);
            });
        }

        const saved = loadSelection();
        if (saved) {
            selection = saved;
            selection.forEach(p => enqueue(p.id));
            syncChart();
        } else {
            resetToTop10();
        }
    })();
});
