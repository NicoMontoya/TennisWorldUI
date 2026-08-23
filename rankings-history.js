// ===================================
// TennisWorld — Historical Rankings (client)
// ===================================
// Adds a "Live | Historical" toggle to the rankings page. In Historical mode a
// date control lets you view the ATP ranking list for any week back to the
// birth of the ATP ranking (1973-08-27) — retired legends included. Data comes
// from /api/rankings-history (date-keyed KV, see server rankingsHistory.js).
//
// Self-contained: injects its own toggle + panel and hides/shows the live table,
// so the live rankings code (rankings.js) is untouched.

(function () {
    'use strict';

    // IOC (Sackmann uses 3-letter IOC codes) → ISO 3166-1 alpha-2, for flag emoji.
    // Covers the tennis-relevant nations; unknowns fall back to a neutral flag.
    const IOC_ISO2 = {
        USA:'US', ESP:'ES', SUI:'CH', SRB:'RS', GER:'DE', FRA:'FR', GBR:'GB', ITA:'IT',
        SWE:'SE', AUS:'AU', ARG:'AR', RUS:'RU', CZE:'CZ', TCH:'CZ', CRO:'HR', AUT:'AT',
        NED:'NL', BEL:'BE', CAN:'CA', GRE:'GR', NOR:'NO', DEN:'DK', POL:'PL', BUL:'BG',
        ROU:'RO', HUN:'HU', SVK:'SK', UKR:'UA', BRA:'BR', CHI:'CL', ECU:'EC', COL:'CO',
        POR:'PT', RSA:'ZA', JPN:'JP', KOR:'KR', CHN:'CN', TPE:'TW', IND:'IN', ISR:'IL',
        KAZ:'KZ', FIN:'FI', SLO:'SI', LAT:'LV', LTU:'LT', EST:'EE', GEO:'GE', BIH:'BA',
        URU:'UY', PER:'PE', PAR:'PY', BOL:'BO', MAR:'MA', TUN:'TN', EGY:'EG', ZIM:'ZW',
        MEX:'MX', DOM:'DO', THA:'TH', UZB:'UZ', BLR:'BY', CYP:'CY', LUX:'LU', MDA:'MD',
        SVK2:'SK', YUG:'RS', FRG:'DE', URS:'RU',
    };
    function iocFlag(ioc) {
        const iso = IOC_ISO2[(ioc || '').toUpperCase()];
        if (!iso) return '🏳';
        return String.fromCodePoint(...[...iso].map(c => 0x1f1e6 + c.charCodeAt(0) - 65));
    }

    let META = null;          // { min, max, dates:[…] }
    let currentDate = null;   // requested date (YYYY-MM-DD)
    let allRows = [];         // current snapshot rankings (for search filter)

    function fmtLong(iso) {
        if (!iso) return '';
        const d = new Date(iso + 'T00:00:00');
        return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    }

    async function init() {
        const section = document.querySelector('.players-section');
        if (!section) return;

        // ── Mode toggle (Live | Historical) ──────────────────────────────────
        const controls = section.querySelector('.table-controls');
        const toggle = document.createElement('div');
        toggle.className = 'ranking-mode-toggle';
        toggle.innerHTML =
            '<button type="button" class="mode-btn active" data-mode="live">Live</button>' +
            '<button type="button" class="mode-btn" data-mode="historical">Time Machine</button>';
        if (controls) controls.prepend(toggle);

        // ── Historical panel (hidden until selected) ─────────────────────────
        const panel = document.createElement('div');
        panel.id = 'historicalPanel';
        panel.hidden = true;
        panel.innerHTML = `
            <div class="hist-controls">
                <button type="button" class="hist-nav" id="histPrev" aria-label="Previous week">‹</button>
                <input type="date" id="histDate" class="hist-date">
                <button type="button" class="hist-nav" id="histNext" aria-label="Next week">›</button>
                <span class="hist-snap" id="histSnap"></span>
                <span class="hist-jump" id="histJump"></span>
            </div>
            <table class="rankings-table hist-table">
                <thead><tr>
                    <th class="col-rank">#</th>
                    <th class="col-flag"></th>
                    <th class="col-name">Player</th>
                    <th class="col-country">Country</th>
                    <th class="col-pts num">Points</th>
                </tr></thead>
                <tbody id="histBody"><tr><td colspan="5" class="hist-msg">Loading…</td></tr></tbody>
            </table>`;
        section.appendChild(panel);

        const liveTable = document.getElementById('rankingsTable');
        const livePager = document.getElementById('rankingsPagination');

        toggle.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                toggle.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const historical = btn.dataset.mode === 'historical';
                if (liveTable) liveTable.hidden = historical;
                if (livePager) livePager.style.display = historical ? 'none' : '';
                panel.hidden = !historical;
                document.getElementById('rankingsSubtitle').textContent =
                    historical ? 'Any week since 1973 · retired players included' : 'Overall · Live data';
                if (historical && !META) await loadMeta();
            });
        });

        // Date input + prev/next
        panel.querySelector('#histDate').addEventListener('change', e => {
            currentDate = e.target.value;
            loadSnapshot(currentDate);
        });
        panel.querySelector('#histPrev').addEventListener('click', () => step(-1));
        panel.querySelector('#histNext').addEventListener('click', () => step(1));

        // Search box filters the historical table too.
        const search = document.getElementById('playerSearch');
        if (search) search.addEventListener('input', () => { if (!panel.hidden) renderRows(filterRows(search.value)); });
    }

    async function loadMeta() {
        try {
            META = await apiFetch('/api/rankings-history?tour=ATP&meta=1');
        } catch (_) {
            document.getElementById('histBody').innerHTML =
                '<tr><td colspan="5" class="hist-msg">Historical rankings are not loaded yet.</td></tr>';
            return;
        }
        const input = document.getElementById('histDate');
        input.min = META.min;
        input.max = META.max;
        // Default to a memorable week if none chosen: the most recent available.
        currentDate = currentDate || META.max;
        input.value = currentDate;
        renderJumps();
        loadSnapshot(currentDate);
    }

    // Decade quick-jumps for discovery.
    function renderJumps() {
        const el = document.getElementById('histJump');
        const picks = [
            ['1973', '1973-08-27'], ['1985', '1985-01-07'], ['1995', '1995-01-02'],
            ['2005', '2005-01-03'], ['2015', '2015-01-05'], ['2025', '2025-01-06'],
        ].filter(([, d]) => d >= META.min && d <= META.max);
        el.innerHTML = picks.map(([label, d]) =>
            `<button type="button" class="hist-chip" data-date="${d}">${label}</button>`).join('');
        el.querySelectorAll('.hist-chip').forEach(b => b.addEventListener('click', () => {
            currentDate = b.dataset.date;
            document.getElementById('histDate').value = currentDate;
            loadSnapshot(currentDate);
        }));
    }

    function step(dir) {
        // Move to prev/next available weekly snapshot relative to the current one.
        if (!META) return;
        const cur = currentDate;
        const dates = META.dates;
        // find the snapshot currently shown (on/before cur), then ±1 in the list
        let i = dates.length - 1;
        while (i >= 0 && dates[i] > cur) i--;
        const ni = Math.min(dates.length - 1, Math.max(0, i + dir));
        currentDate = dates[ni];
        document.getElementById('histDate').value = currentDate;
        loadSnapshot(currentDate);
    }

    async function loadSnapshot(date) {
        const body = document.getElementById('histBody');
        body.innerHTML = '<tr><td colspan="5" class="hist-msg">Loading…</td></tr>';
        let data;
        try {
            data = await apiFetch(`/api/rankings-history?tour=ATP&date=${date}&limit=200`);
        } catch (_) {
            body.innerHTML = '<tr><td colspan="5" class="hist-msg">Could not load that week.</td></tr>';
            return;
        }
        allRows = data.rankings || [];
        document.getElementById('histSnap').textContent =
            `Week of ${fmtLong(data.date)}` + (data.date !== data.requestedDate ? ' (nearest)' : '');
        const search = document.getElementById('playerSearch');
        renderRows(filterRows(search ? search.value : ''));
    }

    function filterRows(q) {
        q = (q || '').trim().toLowerCase();
        if (!q) return allRows;
        return allRows.filter(r => (r.name || '').toLowerCase().includes(q));
    }

    function renderRows(rows) {
        const body = document.getElementById('histBody');
        if (!rows.length) { body.innerHTML = '<tr><td colspan="5" class="hist-msg">No players match.</td></tr>'; return; }
        body.innerHTML = rows.map(r => `
            <tr>
                <td class="col-rank">${r.rank}</td>
                <td class="col-flag">${iocFlag(r.country)}</td>
                <td class="col-name">${escapeHtml(r.name)}</td>
                <td class="col-country">${escapeHtml(r.country || '—')}</td>
                <td class="col-pts num">${r.points != null ? r.points.toLocaleString() : '—'}</td>
            </tr>`).join('');
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    document.addEventListener('DOMContentLoaded', init);
})();
