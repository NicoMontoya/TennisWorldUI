// ===================================
// TennisWorld — Home / Vintage Curves
// ===================================
// Cumulative career metric vs age ("years old"), one curve per player.
// Data: /api/vintage-roster (top-100 picker roster) and
//       /api/player-vintage?playerKey=N → { player, points: [{age,w,m}], totals }.
// Metric toggle re-maps the already-fetched points — no refetch.
// Selection persists in localStorage (tw-vintage-players); colors follow the
// player (slot stored with selection), never their position in the list.
// Overlap view: peak bands + intersection hatch from ranking-history (fallback:
// vintage points). Deep link /?overlap=id,id — digits only.

document.addEventListener('DOMContentLoaded', () => {

    const STORAGE_KEY   = 'tw-vintage-players';
    const TOUR          = 'ATP';
    const MAX_CONCURRENT = 3;
    const Peak = (typeof TW !== 'undefined' && TW.PeakOverlap) ? TW.PeakOverlap : null;

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
    let rankHist  = new Map();     // id → { history } | { error }
    let metric    = 'w';
    let chart     = null;
    let view      = 'curves';      // curves | overlap
    let twinHintIds = [];

    const params = new URLSearchParams(window.location.search);
    const deepOverlapIds = Peak ? Peak.parseOverlapQuery(params.get('overlap')) : [];
    if (deepOverlapIds.length >= 2) view = 'overlap';

    const els = {
        loading: document.getElementById('vintageLoading'),
        canvas:  document.getElementById('vintageChart'),
        chips:   document.getElementById('playerChips'),
        input:   document.getElementById('playerAddInput'),
        datalist: document.getElementById('rosterList'),
        reset:   document.getElementById('resetTop10'),
        toggle:  document.getElementById('metricToggle'),
        viewToggle: document.getElementById('viewToggle'),
        note:    document.getElementById('vintageNote'),
        sub:     document.getElementById('vintageSub'),
        chartWrap: document.getElementById('vintageChartWrap'),
        overlapWrap: document.getElementById('overlapWrap'),
        overlapEmpty: document.getElementById('overlapEmpty'),
        overlapChart: document.getElementById('overlapChart'),
        overlapCaption: document.getElementById('overlapCaption'),
        eraTwinsLabel: document.getElementById('eraTwinsLabel'),
        eraTwinChips: document.getElementById('eraTwinChips'),
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

    const histQueue = [];
    let histInFlight = 0;
    function enqueueHist(playerId) {
        if (rankHist.has(playerId)) { renderOverlap(); return; }
        histQueue.push(playerId);
        pumpHist();
    }
    function pumpHist() {
        while (histInFlight < MAX_CONCURRENT && histQueue.length) {
            const id = histQueue.shift();
            histInFlight++;
            apiFetch(`/api/player-ranking-history?tour=${TOUR}&playerKey=${encodeURIComponent(id)}`)
                .then(data => { rankHist.set(id, data || { history: [] }); })
                .catch(()  => { rankHist.set(id, { error: 'fetch-failed', history: [] }); })
                .finally(() => {
                    histInFlight--;
                    renderOverlap();
                    pumpHist();
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
        if (els.loading) els.loading.style.display = (datasets.length === 0 && anyLoading) ? '' : 'none';

        if (els.canvas && typeof Chart !== 'undefined') {
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
        }
        renderChips();
        renderNote();
        applyView();
        if (view === 'overlap') {
            selection.forEach(p => enqueueHist(p.id));
            renderOverlap();
        }
    }

    // ── View toggle ───────────────────────────────────────────────────────────
    function setView(next, fromKeyboard) {
        if (next !== 'curves' && next !== 'overlap') return;
        if (view === next && !fromKeyboard) return;
        view = next;
        if (els.viewToggle) {
            els.viewToggle.querySelectorAll('.view-btn').forEach(b => {
                const on = b.dataset.view === view;
                b.classList.toggle('active', on);
                b.setAttribute('aria-selected', String(on));
                b.tabIndex = on ? 0 : -1;
            });
        }
        applyView();
        if (view === 'overlap') {
            selection.forEach(p => enqueueHist(p.id));
            prefetchTwinCandidates();
            renderOverlap();
        }
    }

    function applyView() {
        const overlap = view === 'overlap';
        if (els.chartWrap) els.chartWrap.hidden = overlap;
        if (els.overlapWrap) els.overlapWrap.hidden = !overlap;
        if (els.toggle) els.toggle.setAttribute('aria-hidden', overlap ? 'true' : 'false');
    }

    function playerWindow(p) {
        if (!Peak) return null;
        const hist = rankHist.get(p.id);
        const cv = curves.get(p.id);
        const birthday = cv && cv.player && (cv.player.birthday || cv.player.birthdate);
        if (!hist && !(cv && cv.points)) return null;
        return Peak.resolvePeakWindow(hist, cv && cv.points, birthday);
    }

    function renderOverlap() {
        if (view !== 'overlap' || !els.overlapChart || !Peak) return;

        if (selection.length < 2) {
            if (els.overlapEmpty) {
                els.overlapEmpty.hidden = false;
                els.overlapEmpty.textContent = 'Add at least two players to see peak overlap.';
            }
            els.overlapChart.hidden = true;
            els.overlapChart.replaceChildren();
            if (els.overlapCaption) els.overlapCaption.textContent = '';
            renderEraTwins([]);
            return;
        }

        if (els.overlapEmpty) {
            els.overlapEmpty.hidden = true;
            els.overlapEmpty.textContent = '';
        }

        const ready = selection.map(p => ({ player: p, window: playerWindow(p) }));
        const pending = selection.some(p => !curves.has(p.id) && !rankHist.has(p.id));
        const withYears = ready.filter(r => r.window && r.window.startYear != null && r.window.endYear != null);

        if (!withYears.length) {
            els.overlapChart.hidden = true;
            els.overlapChart.replaceChildren();
            if (els.overlapCaption) {
                els.overlapCaption.textContent = pending
                    ? 'Loading peak windows…'
                    : 'No peak-year data for the selected players.';
            }
            renderEraTwins([]);
            return;
        }

        const intersection = Peak.intersectAll(withYears.map(r => r.window));
        if (els.overlapCaption) {
            els.overlapCaption.textContent = Peak.overlapCaption(
                withYears.map(r => r.player),
                intersection
            );
        }
        paintOverlapSvg(withYears, intersection);
        suggestTwinsFrom(withYears[0].window);
    }

    function paintOverlapSvg(rows, intersection) {
        const host = els.overlapChart;
        host.hidden = false;
        host.replaceChildren();

        const years = [];
        rows.forEach(r => {
            years.push(r.window.startYear, r.window.endYear);
        });
        if (intersection) years.push(intersection.startYear, intersection.endYear);
        let minY = Math.min.apply(null, years);
        let maxY = Math.max.apply(null, years);
        if (minY === maxY) { minY -= 1; maxY += 1; }
        const pad = 1;
        minY -= pad;
        maxY += pad;
        const span = Math.max(1, maxY - minY);

        const W = 720;
        const rowH = 36;
        const top = 28;
        const bottom = 28;
        const left = 8;
        const right = 120;
        const H = top + rows.length * rowH + bottom;
        const innerW = W - left - right;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        svg.setAttribute('class', 'overlap-svg');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', els.overlapCaption ? els.overlapCaption.textContent : 'Peak overlap');
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', String(Math.max(160, H)));

        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const pat = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
        pat.setAttribute('id', 'twOverlapHatch');
        pat.setAttribute('patternUnits', 'userSpaceOnUse');
        pat.setAttribute('width', '7');
        pat.setAttribute('height', '7');
        const hatch = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        hatch.setAttribute('d', 'M0 7 L7 0');
        hatch.setAttribute('class', 'overlap-hatch-stroke');
        pat.appendChild(hatch);
        defs.appendChild(pat);
        svg.appendChild(defs);

        function xOf(year) {
            return left + ((year - minY) / span) * innerW;
        }

        for (let y = minY; y <= maxY; y++) {
            if ((y - minY) % Math.ceil(span / 6) !== 0 && y !== maxY) continue;
            const tx = xOf(y);
            const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            tick.setAttribute('x1', tx);
            tick.setAttribute('x2', tx);
            tick.setAttribute('y1', top - 8);
            tick.setAttribute('y2', H - bottom + 4);
            tick.setAttribute('class', 'overlap-grid');
            svg.appendChild(tick);
            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('x', tx);
            label.setAttribute('y', H - 8);
            label.setAttribute('class', 'overlap-axis-label');
            label.setAttribute('text-anchor', 'middle');
            label.textContent = String(y);
            svg.appendChild(label);
        }

        rows.forEach((r, i) => {
            const y = top + i * rowH + 10;
            const x1 = xOf(r.window.startYear);
            const x2 = Math.max(x1 + 8, xOf(r.window.endYear + 1));
            const band = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            band.setAttribute('x', x1);
            band.setAttribute('y', y);
            band.setAttribute('width', x2 - x1);
            band.setAttribute('height', 16);
            band.setAttribute('rx', '3');
            band.setAttribute('class', i % 2 === 0 ? 'overlap-band-a' : 'overlap-band-b');
            svg.appendChild(band);

            if (intersection) {
                const ix1 = xOf(intersection.startYear);
                const ix2 = Math.max(ix1 + 6, xOf(intersection.endYear + 1));
                const hit = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                hit.setAttribute('x', ix1);
                hit.setAttribute('y', y);
                hit.setAttribute('width', ix2 - ix1);
                hit.setAttribute('height', 16);
                hit.setAttribute('rx', '3');
                hit.setAttribute('class', 'overlap-intersect');
                svg.appendChild(hit);
            }

            const name = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            name.setAttribute('x', W - right + 8);
            name.setAttribute('y', y + 13);
            name.setAttribute('class', 'overlap-player-label');
            name.textContent = r.player.name || '';
            svg.appendChild(name);
        });

        host.appendChild(svg);
    }

    function prefetchTwinCandidates() {
        if (!roster.length) return;
        const selected = new Set(selection.map(p => String(p.id)));
        const focus = selection[0];
        const legends = roster.filter(r => r.legend && !selected.has(String(r.id)));
        const top = roster.filter(r => !r.legend && !selected.has(String(r.id))).slice(0, 12);
        const candidates = legends.concat(top).slice(0, 14);
        twinHintIds = candidates.map(c => String(c.id));
        candidates.forEach(c => {
            enqueue(c.id);
            enqueueHist(c.id);
        });
        if (focus) enqueueHist(focus.id);
    }

    function suggestTwinsFrom(focusWindow) {
        if (!Peak || !focusWindow) {
            renderEraTwins([]);
            return;
        }
        const selected = new Set(selection.map(p => String(p.id)));
        const candidates = roster
            .filter(r => !selected.has(String(r.id)) && twinHintIds.includes(String(r.id)))
            .map(r => ({
                id: r.id,
                name: r.name,
                window: playerWindow({ id: r.id }),
            }))
            .filter(c => c.window);
        renderEraTwins(Peak.suggestEraTwins(focusWindow, candidates, 6));
    }

    function renderEraTwins(twins) {
        if (els.eraTwinsLabel) {
            els.eraTwinsLabel.textContent = twins.length ? 'Era twins' : '';
        }
        if (!els.eraTwinChips) return;
        els.eraTwinChips.replaceChildren();
        twins.forEach(t => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'era-twin-chip';
            btn.dataset.id = String(t.id);
            const name = document.createElement('span');
            name.className = 'era-twin-name';
            name.textContent = t.name || t.id;
            const meta = document.createElement('span');
            meta.className = 'era-twin-meta';
            meta.textContent = t.startYear === t.endYear
                ? String(t.startYear)
                : t.startYear + '–' + t.endYear;
            btn.appendChild(name);
            btn.appendChild(meta);
            btn.setAttribute('aria-label', 'Add ' + (t.name || t.id) + ' as an era twin');
            els.eraTwinChips.appendChild(btn);
        });
    }

    // ── Chips (legend + remove) ───────────────────────────────────────────────
    function renderChips() {
        if (!els.chips) return;
        els.chips.replaceChildren();
        selection.forEach(p => {
            const cv = curves.get(p.id);
            const state = !cv ? ' is-loading' : (cv.error || !cv.points?.length) ? ' is-error' : '';
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
        const skipped = selection.filter(p => {
            const cv = curves.get(p.id);
            return cv && (cv.error === 'no-birthday' || (cv.error === undefined && !cv.points?.length));
        });
        const failed = selection.filter(p => curves.get(p.id)?.error === 'fetch-failed');
        const parts = [];
        if (skipped.length) parts.push(`No birthdate data for ${skipped.map(p => p.name).join(', ')} — skipped.`);
        if (failed.length)  parts.push(`Couldn't load ${failed.map(p => p.name).join(', ')}.`);
        if (els.note) els.note.textContent = parts.join(' ');
    }

    // ── Selection mutations ───────────────────────────────────────────────────
    function addPlayer(entry) {
        if (selection.some(p => String(p.id) === String(entry.id))) return;
        selection.push({ id: entry.id, name: entry.name, slot: freeSlot() });
        saveSelection();
        enqueue(entry.id);
        if (view === 'overlap') enqueueHist(entry.id);
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
        syncChart();
    }

    function selectionFromIds(ids) {
        const picked = [];
        ids.forEach(id => {
            const r = roster.find(x => String(x.id) === String(id));
            if (r && !picked.some(p => String(p.id) === String(r.id))) {
                picked.push({ id: r.id, name: r.name, slot: picked.length });
            }
        });
        return picked;
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

    if (els.viewToggle) {
        els.viewToggle.addEventListener('click', e => {
            const btn = e.target.closest('.view-btn');
            if (btn) setView(btn.dataset.view);
        });
        els.viewToggle.addEventListener('keydown', e => {
            const tabs = Array.from(els.viewToggle.querySelectorAll('.view-btn'));
            const i = tabs.indexOf(document.activeElement);
            if (i < 0) return;
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
                next.focus();
                setView(next.dataset.view, true);
            } else if (e.key === 'Home') {
                e.preventDefault();
                tabs[0].focus();
                setView(tabs[0].dataset.view, true);
            } else if (e.key === 'End') {
                e.preventDefault();
                tabs[tabs.length - 1].focus();
                setView(tabs[tabs.length - 1].dataset.view, true);
            }
        });
    }

    if (els.eraTwinChips) {
        els.eraTwinChips.addEventListener('click', e => {
            const btn = e.target.closest('.era-twin-chip');
            if (!btn) return;
            const id = btn.dataset.id;
            const entry = roster.find(r => String(r.id) === String(id));
            if (entry) addPlayer(entry);
        });
    }

    // Re-skin the chart when the theme flips (shared.js toggles data-theme).
    new MutationObserver(() => syncChart())
        .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // ── Init ──────────────────────────────────────────────────────────────────
    (async () => {
        try {
            const data = await apiFetch(`/api/vintage-roster?tour=${TOUR}`);
            roster = data.roster || [];
        } catch {
            if (els.loading) els.loading.textContent = 'Could not load the player roster — is the API running?';
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

        const fromLink = selectionFromIds(deepOverlapIds);
        if (fromLink.length >= 2) {
            selection = fromLink;
            saveSelection();
            selection.forEach(p => { enqueue(p.id); enqueueHist(p.id); });
            setView('overlap');
            syncChart();
        } else {
            const saved = loadSelection();
            if (saved) {
                selection = saved;
                selection.forEach(p => enqueue(p.id));
                syncChart();
            } else {
                resetToTop10();
            }
            if (view === 'overlap') setView('overlap');
        }
    })();
});
