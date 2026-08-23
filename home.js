// ===================================
// TennisWorld — Home / Vintage Curves
// ===================================
// Cumulative career metric vs age ("years old"), one curve per player.
// Data: /api/vintage-roster (top-100 picker roster) and
//       /api/player-vintage?playerKey=N → { player, points: [{age,w,m}], totals }.
// Metric toggle re-maps the already-fetched points — no refetch.
// Selection persists in localStorage (tw-vintage-players); colors follow the
// player (slot stored with selection), never their position in the list.

document.addEventListener('DOMContentLoaded', () => {

    const STORAGE_KEY   = 'tw-vintage-players';
    const TOUR          = 'ATP';
    const MAX_CONCURRENT = 3;

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
    };

    let roster    = [];            // [{position,id,name,countryAcr}]
    let selection = [];            // [{id,name,slot}]
    let curves    = new Map();     // id → { player, points, totals } | { error }
    let metric    = 'w';
    let chart     = null;

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
            if (Array.isArray(raw) && raw.length && raw.every(p => p.id && p.name && Number.isInteger(p.slot))) return raw;
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
            apiFetch(`/api/player-vintage?tour=${TOUR}&playerKey=${id}`)
                .then(data => { curves.set(id, data); })
                .catch(()  => { curves.set(id, { error: 'fetch-failed' }); })
                .finally(() => {
                    inFlight--;
                    syncChart();     // progressive: each resolved player appears immediately
                    pump();
                });
        }
    }

    // ── Chart ─────────────────────────────────────────────────────────────────
    // Direct end-labels (player surname at each curve's last point) are the
    // secondary encoding required for a 10-series categorical palette.
    const endLabelPlugin = {
        id: 'twEndLabels',
        afterDatasetsDraw(c) {
            const { ctx } = c;
            const ink = chrome().ink;
            ctx.save();
            ctx.font = '600 11px Inter, sans-serif';
            ctx.fillStyle = ink;
            ctx.textBaseline = 'middle';
            c.data.datasets.forEach((ds, i) => {
                const meta = c.getDatasetMeta(i);
                if (meta.hidden || !meta.data.length) return;
                const last = meta.data[meta.data.length - 1];
                const name = ds.label.split(' ').pop();
                ctx.fillText(name, Math.min(last.x + 6, c.chartArea.right + 4), last.y);
            });
            ctx.restore();
        },
    };

    function buildDatasets() {
        return selection
            .filter(p => curves.get(p.id)?.points?.length)
            .map(p => {
                const cv = curves.get(p.id);
                return {
                    label: p.name,
                    data: cv.points.map(pt => ({ x: pt.age, y: pt[metric] })),
                    borderColor: seriesColor(p.slot),
                    backgroundColor: seriesColor(p.slot),
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHitRadius: 8,
                    tension: 0,
                };
            });
    }

    function chartOptions() {
        const ch = chrome();
        return {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { right: 76 } },   // room for direct end-labels
            interaction: { mode: 'nearest', intersect: false },
            plugins: {
                legend: { display: false },       // the chips row is the legend
                tooltip: {
                    callbacks: {
                        title: items => items.length ? `${items[0].dataset.label}` : '',
                        label: item => `${item.parsed.x.toFixed(1)} yrs old — ${item.parsed.y} ${METRICS[metric].noun}`,
                    },
                },
            },
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: 'Years old', color: ch.ink, font: { family: 'Inter', size: 12, weight: '500' } },
                    ticks: { color: ch.muted, font: { family: 'Inter', size: 11 } },
                    grid:  { color: ch.grid, drawTicks: false },
                },
                y: {
                    beginAtZero: true,
                    title: { display: true, text: METRICS[metric].label, color: ch.ink, font: { family: 'Inter', size: 12, weight: '500' } },
                    ticks: { color: ch.muted, font: { family: 'Inter', size: 11 } },
                    grid:  { color: ch.grid, drawTicks: false },
                },
            },
        };
    }

    function syncChart() {
        const datasets = buildDatasets();
        const anyLoading = selection.some(p => !curves.has(p.id));
        els.loading.style.display = (datasets.length === 0 && anyLoading) ? '' : 'none';

        if (!chart) {
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
        renderChips();
        renderNote();
    }

    // ── Chips (legend + remove) ───────────────────────────────────────────────
    function renderChips() {
        els.chips.innerHTML = selection.map(p => {
            const cv = curves.get(p.id);
            const state = !cv ? ' is-loading' : (cv.error || !cv.points?.length) ? ' is-error' : '';
            return `<span class="player-chip${state}" data-id="${p.id}">
                <span class="chip-dot" style="background:${seriesColor(p.slot)}"></span>
                <span class="chip-name">${p.name}</span>
                <button type="button" class="chip-remove" data-id="${p.id}" aria-label="Remove ${p.name} from chart">×</button>
            </span>`;
        }).join('');
    }

    function renderNote() {
        const skipped = selection.filter(p => {
            const cv = curves.get(p.id);
            return cv && (cv.error === 'no-birthday' || (cv.error === undefined && !cv.points?.length));
        });
        const failed = selection.filter(p => curves.get(p.id)?.error === 'fetch-failed');
        const parts = [];
        if (skipped.length) parts.push(`No birthdate data for ${skipped.map(p => p.name).join(', ')} — skipped.`);
        if (failed.length)  parts.push(`Couldn't load ${failed.map(p => p.name).join(', ')}.`);
        els.note.textContent = parts.join(' ');
    }

    // ── Selection mutations ───────────────────────────────────────────────────
    function addPlayer(entry) {
        if (selection.some(p => p.id === entry.id)) return;
        selection.push({ id: entry.id, name: entry.name, slot: freeSlot() });
        saveSelection();
        enqueue(entry.id);
        syncChart();
    }
    function removePlayer(id) {
        selection = selection.filter(p => p.id !== id);
        saveSelection();
        syncChart();
    }
    function resetToTop10() {
        selection = roster.slice(0, 10).map((r, i) => ({ id: r.id, name: r.name, slot: i }));
        saveSelection();
        selection.forEach(p => enqueue(p.id));
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
        if (!btn || btn.dataset.metric === metric) return;
        metric = btn.dataset.metric;
        els.toggle.querySelectorAll('.metric-btn').forEach(b => {
            const active = b === btn;
            b.classList.toggle('active', active);
            b.setAttribute('aria-pressed', String(active));
        });
        els.sub.textContent = `Cumulative ${METRICS[metric].label.toLowerCase()} by age — add or remove players to compare careers at the same age.`;
        syncChart();
    });

    // Re-skin the chart when the theme flips (shared.js toggles data-theme).
    new MutationObserver(() => syncChart())
        .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // ── Init ──────────────────────────────────────────────────────────────────
    (async () => {
        try {
            const data = await apiFetch(`/api/vintage-roster?tour=${TOUR}`);
            roster = data.roster || [];
        } catch {
            els.loading.textContent = 'Could not load the player roster — is the API running?';
            return;
        }

        els.datalist.innerHTML = roster.map(r =>
            `<option value="${r.name}">${r.legend ? 'Legend' : '#' + r.position} · ${r.countryAcr}</option>`).join('');

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
