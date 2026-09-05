// ===================================
// TennisWorld — Draws / Calendar page
// ===================================

// ── Tournament metadata lookup ─────────────────────────────────────────────
// Keyed by lowercase keywords found in the API tournament name.
// Order matters: more specific keys first.
const TOURNAMENT_META = {
    // Grand Slams
    'australian open':   { category: 'Grand Slam',   city: 'Melbourne',       country: 'Australia',    flag: '🇦🇺', fullName: 'Australian Open' },
    'roland garros':     { category: 'Grand Slam',   city: 'Paris',           country: 'France',       flag: '🇫🇷', fullName: 'Roland Garros' },
    'french open':       { category: 'Grand Slam',   city: 'Paris',           country: 'France',       flag: '🇫🇷', fullName: 'Roland Garros' },
    'wimbledon':         { category: 'Grand Slam',   city: 'London',          country: 'Great Britain',flag: '🇬🇧', fullName: 'Wimbledon' },
    'us open':           { category: 'Grand Slam',   city: 'New York',        country: 'USA',          flag: '🇺🇸', fullName: 'US Open' },
    // Masters 1000
    'indian wells':      { category: 'Masters 1000', city: 'Indian Wells',    country: 'USA',          flag: '🇺🇸', fullName: 'BNP Paribas Open' },
    'miami':             { category: 'Masters 1000', city: 'Miami',           country: 'USA',          flag: '🇺🇸', fullName: 'Miami Open' },
    'monte carlo':       { category: 'Masters 1000', city: 'Monte-Carlo',     country: 'Monaco',       flag: '🇲🇨', fullName: 'Rolex Monte-Carlo Masters' },
    'monte-carlo':       { category: 'Masters 1000', city: 'Monte-Carlo',     country: 'Monaco',       flag: '🇲🇨', fullName: 'Rolex Monte-Carlo Masters' },
    'madrid':            { category: 'Masters 1000', city: 'Madrid',          country: 'Spain',        flag: '🇪🇸', fullName: 'Mutua Madrid Open' },
    'internazionali':    { category: 'Masters 1000', city: 'Rome',            country: 'Italy',        flag: '🇮🇹', fullName: 'Internazionali BNL d\'Italia' },
    'montreal':          { category: 'Masters 1000', city: 'Montreal',        country: 'Canada',       flag: '🇨🇦', fullName: 'National Bank Open' },
    'toronto':           { category: 'Masters 1000', city: 'Toronto',         country: 'Canada',       flag: '🇨🇦', fullName: 'National Bank Open' },
    'cincinnati':        { category: 'Masters 1000', city: 'Cincinnati',      country: 'USA',          flag: '🇺🇸', fullName: 'Western & Southern Open' },
    'shanghai':          { category: 'Masters 1000', city: 'Shanghai',        country: 'China',        flag: '🇨🇳', fullName: 'Shanghai Rolex Masters' },
    'paris masters':     { category: 'Masters 1000', city: 'Paris',           country: 'France',       flag: '🇫🇷', fullName: 'Rolex Paris Masters' },
    // ATP 500
    'rotterdam':         { category: 'ATP 500',      city: 'Rotterdam',       country: 'Netherlands',  flag: '🇳🇱', fullName: 'ABN AMRO Open' },
    'rio':               { category: 'ATP 500',      city: 'Rio de Janeiro',  country: 'Brazil',       flag: '🇧🇷', fullName: 'Rio Open' },
    'dubai':             { category: 'ATP 500',      city: 'Dubai',           country: 'UAE',          flag: '🇦🇪', fullName: 'Dubai Tennis Championships' },
    'acapulco':          { category: 'ATP 500',      city: 'Acapulco',        country: 'Mexico',       flag: '🇲🇽', fullName: 'Abierto Mexicano Telcel' },
    'barcelona':         { category: 'ATP 500',      city: 'Barcelona',       country: 'Spain',        flag: '🇪🇸', fullName: 'Barcelona Open' },
    'hamburg':           { category: 'ATP 500',      city: 'Hamburg',         country: 'Germany',      flag: '🇩🇪', fullName: 'Hamburg Open' },
    'halle':             { category: 'ATP 500',      city: 'Halle',           country: 'Germany',      flag: '🇩🇪', fullName: 'Terra Wortmann Open' },
    "queen's":           { category: 'ATP 500',      city: 'London',          country: 'Great Britain',flag: '🇬🇧', fullName: 'cinch Championships' },
    'queens':            { category: 'ATP 500',      city: 'London',          country: 'Great Britain',flag: '🇬🇧', fullName: 'cinch Championships' },
    'washington':        { category: 'ATP 500',      city: 'Washington',      country: 'USA',          flag: '🇺🇸', fullName: 'Citi Open' },
    'beijing':           { category: 'ATP 500',      city: 'Beijing',         country: 'China',        flag: '🇨🇳', fullName: 'China Open' },
    'vienna':            { category: 'ATP 500',      city: 'Vienna',          country: 'Austria',      flag: '🇦🇹', fullName: 'Erste Bank Open' },
    'tokyo':             { category: 'ATP 500',      city: 'Tokyo',           country: 'Japan',        flag: '🇯🇵', fullName: 'Rakuten Japan Open' },
    // ATP Finals / special
    'atp finals':        { category: 'ATP Finals',   city: 'Turin',           country: 'Italy',        flag: '🇮🇹', fullName: 'Nitto ATP Finals' },
    'next gen':          { category: 'Next Gen',     city: 'Jeddah',          country: 'Saudi Arabia', flag: '🇸🇦', fullName: 'Next Gen ATP Finals' },
    // ATP 250 (common ones)
    'doha':              { category: 'ATP 250',      city: 'Doha',            country: 'Qatar',        flag: '🇶🇦', fullName: 'Qatar ExxonMobil Open' },
    'adelaide':          { category: 'ATP 250',      city: 'Adelaide',        country: 'Australia',    flag: '🇦🇺', fullName: 'Adelaide International' },
    'auckland':          { category: 'ATP 250',      city: 'Auckland',        country: 'New Zealand',  flag: '🇳🇿', fullName: 'ASB Classic' },
    'hong kong':         { category: 'ATP 250',      city: 'Hong Kong',       country: 'China',        flag: '🇭🇰', fullName: 'Hong Kong Open' },
    'dallas':            { category: 'ATP 250',      city: 'Dallas',          country: 'USA',          flag: '🇺🇸', fullName: 'Dallas Open' },
    'marseille':         { category: 'ATP 250',      city: 'Marseille',       country: 'France',       flag: '🇫🇷', fullName: 'Open 13 Provence' },
    'montpellier':       { category: 'ATP 250',      city: 'Montpellier',     country: 'France',       flag: '🇫🇷', fullName: 'Open Sud de France' },
    'buenos aires':      { category: 'ATP 250',      city: 'Buenos Aires',    country: 'Argentina',    flag: '🇦🇷', fullName: 'Argentina Open' },
    'santiago':          { category: 'ATP 250',      city: 'Santiago',        country: 'Chile',        flag: '🇨🇱', fullName: 'Chile Open' },
    'delray beach':      { category: 'ATP 250',      city: 'Delray Beach',    country: 'USA',          flag: '🇺🇸', fullName: 'Delray Beach Open' },
    'phoenix':           { category: 'ATP 250',      city: 'Phoenix',         country: 'USA',          flag: '🇺🇸', fullName: 'Arizona Tennis Classic' },
    'marrakech':         { category: 'ATP 250',      city: 'Marrakech',       country: 'Morocco',      flag: '🇲🇦', fullName: 'Grand Prix Hassan II' },
    'estoril':           { category: 'ATP 250',      city: 'Estoril',         country: 'Portugal',     flag: '🇵🇹', fullName: 'Millennium Estoril Open' },
    'geneva':            { category: 'ATP 250',      city: 'Geneva',          country: 'Switzerland',  flag: '🇨🇭', fullName: 'Geneva Open' },
    'lyon':              { category: 'ATP 250',      city: 'Lyon',            country: 'France',       flag: '🇫🇷', fullName: 'Open Parc Auvergne-Rhône-Alpes' },
    'stuttgart':         { category: 'ATP 250',      city: 'Stuttgart',       country: 'Germany',      flag: '🇩🇪', fullName: 'Boss Open' },
    'eastbourne':        { category: 'ATP 250',      city: 'Eastbourne',      country: 'Great Britain',flag: '🇬🇧', fullName: 'Rothesay International' },
    'mallorca':          { category: 'ATP 250',      city: 'Mallorca',        country: 'Spain',        flag: '🇪🇸', fullName: 'Mallorca Championships' },
    'newport':           { category: 'ATP 250',      city: 'Newport',         country: 'USA',          flag: '🇺🇸', fullName: 'Hall of Fame Open' },
    'bastad':            { category: 'ATP 250',      city: 'Båstad',          country: 'Sweden',       flag: '🇸🇪', fullName: 'Nordea Open' },
    'gstaad':            { category: 'ATP 250',      city: 'Gstaad',          country: 'Switzerland',  flag: '🇨🇭', fullName: 'EFG Swiss Open Gstaad' },
    'umag':              { category: 'ATP 250',      city: 'Umag',            country: 'Croatia',      flag: '🇭🇷', fullName: 'Croatia Open Umag' },
    'kitzbuhel':         { category: 'ATP 250',      city: 'Kitzbühel',       country: 'Austria',      flag: '🇦🇹', fullName: 'Generali Open' },
    'atlanta':           { category: 'ATP 250',      city: 'Atlanta',         country: 'USA',          flag: '🇺🇸', fullName: 'Atlanta Open' },
    'winston-salem':     { category: 'ATP 250',      city: 'Winston-Salem',   country: 'USA',          flag: '🇺🇸', fullName: 'Winston-Salem Open' },
    'chengdu':           { category: 'ATP 250',      city: 'Chengdu',         country: 'China',        flag: '🇨🇳', fullName: 'Chengdu Open' },
    'hangzhou':          { category: 'ATP 250',      city: 'Hangzhou',        country: 'China',        flag: '🇨🇳', fullName: 'Hangzhou Open' },
    'gijon':             { category: 'ATP 250',      city: 'Gijón',           country: 'Spain',        flag: '🇪🇸', fullName: 'Gijon Open' },
    'antwerp':           { category: 'ATP 250',      city: 'Antwerp',         country: 'Belgium',      flag: '🇧🇪', fullName: 'European Open' },
    'stockholm':         { category: 'ATP 250',      city: 'Stockholm',       country: 'Sweden',       flag: '🇸🇪', fullName: 'Stockholm Open' },
    'basel':             { category: 'ATP 250',      city: 'Basel',           country: 'Switzerland',  flag: '🇨🇭', fullName: 'Swiss Indoors' },
    'metz':              { category: 'ATP 250',      city: 'Metz',            country: 'France',       flag: '🇫🇷', fullName: 'Moselle Open' },
    'nur-sultan':        { category: 'ATP 250',      city: 'Nur-Sultan',      country: 'Kazakhstan',   flag: '🇰🇿', fullName: 'Astana Open' },
    'astana':            { category: 'ATP 250',      city: 'Astana',          country: 'Kazakhstan',   flag: '🇰🇿', fullName: 'Astana Open' },
    'bucharest':         { category: 'ATP 250',      city: 'Bucharest',       country: 'Romania',      flag: '🇷🇴', fullName: 'Romania Open' },
    'munich':            { category: 'ATP 250',      city: 'Munich',          country: 'Germany',      flag: '🇩🇪', fullName: 'BMW Open' },
    'houston':           { category: 'ATP 250',      city: 'Houston',         country: 'USA',          flag: '🇺🇸', fullName: 'Houston Open' },
};

const CATEGORY_ORDER = { 'Grand Slam': 0, 'ATP Finals': 1, 'Masters 1000': 2, 'ATP 500': 3, 'ATP 250': 4, 'Next Gen': 5 };

function getTournamentMeta(apiName) {
    const lower = (apiName || '').toLowerCase();
    for (const [key, meta] of Object.entries(TOURNAMENT_META)) {
        if (lower.includes(key)) return meta;
    }
    // Fallback: clean up the name
    const cleanName = apiName.replace(/^ATP\s+/i, '').replace(/^WTA\s+/i, '').trim();
    return { category: 'ATP 250', city: cleanName, country: '', flag: '🎾', fullName: cleanName };
}

// ── Round label maps ───────────────────────────────────────────────────────
const ROUND_LABELS = {
    'final': 'Final', 'finals': 'Final',
    '1/2-finals': 'Semifinals', 'semi-finals': 'Semifinals', 'semifinal': 'Semifinals', 'semifinals': 'Semifinals',
    '1/4-finals': 'Quarterfinals', 'quarter-finals': 'Quarterfinals', 'quarterfinal': 'Quarterfinals',
    '1/8-finals': 'R16', 'round of 16': 'R16',
    '1/16-finals': 'R32', 'round of 32': 'R32',
    '1/32-finals': 'R64', '1/64-finals': 'R128',
};
const ROUND_SHORT = { 'Final':'F','Semifinals':'SF','Quarterfinals':'QF','R16':'R16','R32':'R32','R64':'R64','R128':'R128' };

function cleanRound(round) {
    if (!round) return '';
    const parts = round.split(' - ');
    const r = (parts[parts.length - 1] || round).trim();
    return ROUND_LABELS[r.toLowerCase()] || r;
}

// ── Date helpers ───────────────────────────────────────────────────────────
function isoString(date) {
    return typeof isoDateLocal === 'function'
        ? isoDateLocal(date)
        : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// A tournament belongs in `month` when its dates overlap that month.
// Live events that started earlier (empty endDate) stay in the current month.
function tournamentOverlapsMonth(t, year, month) {
    const startIso = t && t.startDate;
    if (!startIso) return true;
    const start = new Date(String(startIso).slice(0, 10) + 'T00:00:00');
    if (isNaN(start.getTime())) return true;
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0);
    const endRaw = t.endDate && String(t.endDate).trim();
    if (endRaw) {
        const end = new Date(endRaw.slice(0, 10) + 'T00:00:00');
        if (!isNaN(end.getTime())) return start <= monthEnd && end >= monthStart;
    }
    if (start >= monthStart && start <= monthEnd) return true;
    if (start < monthStart && (t.status === 'live' || Number(t.live) > 0)) return true;
    return false;
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ── State ──────────────────────────────────────────────────────────────────
let calYear  = new Date().getFullYear();
let calTour  = 'ATP';
// Track which months have been loaded: { '2026-5': [tournaments] | 'error' | 'loading' }
const monthCache = {};

document.addEventListener('DOMContentLoaded', () => {

    // ── Build accordion + month strip ──────────────────────────────────────
    // Strip is the source of truth: the visible list is the selected month only.
    let selectedMonth = null;

    function selectMonth(month, year) {
        selectedMonth = month;
        const strip = document.getElementById('calMonthStrip');
        let activeTab = null;
        strip?.querySelectorAll('.cal-month-tab').forEach(t => {
            const on = Number(t.dataset.month) === month;
            t.classList.toggle('active', on);
            if (on) activeTab = t;
        });
        if (activeTab && typeof activeTab.scrollIntoView === 'function') {
            activeTab.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'auto' });
        }
        document.querySelectorAll('.cal-month').forEach(el => {
            const m = Number(el.dataset.month);
            const on = m === month;
            el.hidden = !on;
            const header = el.querySelector('.cal-month-header');
            const body = el.querySelector('.cal-month-body');
            if (!header || !body) return;
            header.classList.toggle('is-open', on);
            body.style.display = on ? '' : 'none';
        });
        const cacheKey = `${year}-${month}-${calTour}`;
        if (!monthCache[cacheKey]) loadMonth(month, year);
    }

    function buildAccordion(year) {
        const container = document.getElementById('calMonths');
        const strip     = document.getElementById('calMonthStrip');
        container.innerHTML = '';
        strip.innerHTML     = '';

        const today        = new Date();
        const currentMonth = today.getMonth() + 1;
        const currentYear  = today.getFullYear();
        const initialMonth = (year === currentYear) ? currentMonth : 1;

        for (let m = 1; m <= 12; m++) {
            const isSelected = m === initialMonth;

            // Month strip tab
            const tab = document.createElement('button');
            tab.type = 'button';
            tab.className   = `cal-month-tab${isSelected ? ' active' : ''}`;
            tab.textContent = MONTH_NAMES[m - 1].slice(0, 3).toUpperCase();
            tab.dataset.month = String(m);
            tab.addEventListener('click', () => selectMonth(m, year));
            strip.appendChild(tab);

            // Month section
            const monthEl = document.createElement('div');
            monthEl.className   = 'cal-month';
            monthEl.dataset.month = String(m);
            monthEl.hidden = !isSelected;
            const header = document.createElement('button');
            header.type = 'button';
            header.className = `cal-month-header${isSelected ? ' is-open' : ''}`;
            header.dataset.month = String(m);
            const headerLeft = document.createElement('div');
            headerLeft.className = 'cal-month-header-left';
            headerLeft.appendChild(Object.assign(document.createElement('span'), {
                className: 'cal-month-name',
                textContent: MONTH_NAMES[m - 1],
            }));
            const count = document.createElement('span');
            count.className = 'cal-month-count';
            count.id = `calCount-${m}`;
            headerLeft.appendChild(count);
            header.appendChild(headerLeft);
            const chevron = document.createElement('span');
            chevron.className = 'cal-month-chevron';
            chevron.textContent = '›';
            header.appendChild(chevron);

            const body = document.createElement('div');
            body.className = 'cal-month-body';
            body.id = `calBody-${m}`;
            body.style.display = isSelected ? '' : 'none';
            if (isSelected) {
                const loading = document.createElement('div');
                loading.className = 'cal-month-loading';
                loading.textContent = 'Loading…';
                body.appendChild(loading);
            }

            monthEl.appendChild(header);
            monthEl.appendChild(body);
            container.appendChild(monthEl);

            header.addEventListener('click', () => selectMonth(m, year));
        }

        selectMonth(initialMonth, year);
    }

    function toggleMonth(month, year) {
        selectMonth(month, year);
    }

    // ── Load a month's tournaments ─────────────────────────────────────────
    async function loadMonth(month, year) {
        const cacheKey = `${year}-${month}-${calTour}`;
        const body     = document.getElementById(`calBody-${month}`);
        const countEl  = document.getElementById(`calCount-${month}`);

        if (!body) return;

        // Show loading state
        body.innerHTML = '<div class="cal-month-loading">Loading…</div>';
        monthCache[cacheKey] = 'loading';

        // Build date range: full month + 3-day buffer on each side
        const firstDay = new Date(year, month - 1, 1);
        const lastDay  = new Date(year, month, 0);
        firstDay.setDate(firstDay.getDate() - 3);
        lastDay.setDate(lastDay.getDate() + 3);

        try {
            const raw = await apiFetch(
                `/api/calendar?tour=${calTour}&dateStart=${isoString(firstDay)}&dateStop=${isoString(lastDay)}`
            );
            const tournaments = (Array.isArray(raw) ? raw : [])
                .filter(t => tournamentOverlapsMonth(t, year, month));

            // Sort by category tier then start date
            tournaments.sort((a, b) => {
                const metaA = getTournamentMeta(a.name);
                const metaB = getTournamentMeta(b.name);
                const orderA = CATEGORY_ORDER[metaA.category] ?? 99;
                const orderB = CATEGORY_ORDER[metaB.category] ?? 99;
                if (orderA !== orderB) return orderA - orderB;
                return (a.startDate || '').localeCompare(b.startDate || '');
            });

            monthCache[cacheKey] = tournaments;

            if (!tournaments.length) {
                body.innerHTML = '<div class="cal-month-empty">No events this month.</div>';
                if (countEl) countEl.textContent = '';
                return;
            }

            if (countEl) countEl.textContent = `${tournaments.length} event${tournaments.length !== 1 ? 's' : ''}`;
            body.innerHTML = tournaments.map(t => renderTournamentCard(t)).join('');

            if (typeof TW !== 'undefined' && TW.bindStarButtons) TW.bindStarButtons(body);

            body.querySelectorAll('.cal-t-card').forEach(card => {
                card.addEventListener('click', () =>
                    openDraw(card.dataset.key, card.dataset.name, card.dataset.season, calTour)
                );
            });

        } catch (err) {
            monthCache[cacheKey] = 'error';
            body.innerHTML = '<div class="cal-month-empty">No data available for this period.</div>';
            if (countEl) countEl.textContent = '';
            console.warn(`Month load failed (${year}-${month}):`, err.message);
        }
    }

    // Delegate to TW.TournamentCard component (components/TournamentCard.js)
    function renderTournamentCard(t) {
        return TW.TournamentCard(t, getTournamentMeta(t.name));
    }

    // ── Year navigation ────────────────────────────────────────────────────
    document.getElementById('calPrevYear')?.addEventListener('click', () => {
        calYear--;
        document.getElementById('calYearLabel').textContent = calYear;
        buildAccordion(calYear);
    });
    document.getElementById('calNextYear')?.addEventListener('click', () => {
        calYear++;
        document.getElementById('calYearLabel').textContent = calYear;
        buildAccordion(calYear);
    });

    // ── Tour tabs ──────────────────────────────────────────────────────────
    document.querySelectorAll('.cal-tour-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.cal-tour-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            calTour = btn.dataset.tour;
            // Clear cache for current year and rebuild
            Object.keys(monthCache).forEach(k => { if (k.startsWith(calYear + '-')) delete monthCache[k]; });
            buildAccordion(calYear);
        });
    });

    // ── Draw view ──────────────────────────────────────────────────────────
    // State for the currently open draw
    let currentDrawKey    = null;
    let currentDrawRounds = [];
    let currentDrawTour   = 'ATP';
    let currentDrawName   = '';     // tournament name for bracketSlots lookup
    let currentDrawYear   = 0;      // season year
    // Whether the current tournament uses a round-robin format (no bracket)
    let currentDrawIsRR   = false;

    // ── Toast notification ─────────────────────────────────────────────────
    function showDrawToast(msg) {
        const existing = document.getElementById('drawToast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.id = 'drawToast';
        toast.className = 'draw-toast';
        toast.setAttribute('role', 'status');
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    // ── Bracket renderer ───────────────────────────────────────────────────
    // Uses DrawBracket component for tournaments with standard elimination rounds.
    // Falls back to flat round list for Round Robin / non-standard formats.

    // Renders the bracket for a given rounds structure. When `drawOverride` is
    // supplied (pick-mode), DrawBracket is fed that DERIVED draw; the renderer is
    // untouched and never learns pick-mode exists. Default (no override) is the
    // official draw and is byte-identical to prior behavior.
    function renderBracketView(drawOverride, mode) {
        const wrapEl = document.getElementById('roundMatchesWrap');
        if (!wrapEl || !currentDrawRounds.length) return;

        wrapEl.innerHTML = '';

        if (currentDrawIsRR) {
            renderRoundList(0);
            return;
        }

        const drawToRender = drawOverride || currentDrawRounds;

        if (typeof TW !== 'undefined' && TW.DrawBracket) {
            try {
                // Layout preference: classic columns or the circular bracket
                // (first round on the outer ring, final at the center).
                let layout = 'columns';
                try { layout = localStorage.getItem('tw-bracket-layout') || 'columns'; } catch (_) {}
                const Renderer = (layout === 'circle' && TW.RadialBracket)
                    ? TW.RadialBracket : TW.DrawBracket;
                const { el, mostActiveRid } = Renderer(
                    drawToRender, currentDrawTour, currentDrawName, currentDrawYear
                );
                wrapEl.appendChild(el);

                // Scroll the most active round column into view (official mode only;
                // in pick-mode we avoid yanking scroll on every pick).
                if (mostActiveRid && mode !== 'picks') {
                    requestAnimationFrame(() => {
                        const col = el.querySelector(`.db-col[data-round-id="${mostActiveRid}"]`);
                        if (col) col.scrollIntoView({ inline: 'start', block: 'nearest' });
                    });
                }

                // Win-probability strips on upcoming tree matches (official mode
                // only — pick-mode stays clean; the model already drives auto-fill).
                // Additive + try/catch-isolated like all prob UI.
                if (mode !== 'picks') decorateTreeProbStrips(el, drawToRender);
            } catch (e) {
                console.error('[DrawBracket error]', e);
                renderRoundList(0);
            }
        } else {
            console.warn('[DrawBracket] TW.DrawBracket not available');
            renderRoundList(0);
        }
    }

    // Mount/refresh the interactive bracket maker for the current elimination draw.
    // BracketMaker owns the toggle/fill/save UI and calls back into renderBracketView
    // with the derived (pick-mode) or official draw. RR draws get no maker.
    let bracketMakerCtl = null;
    function mountBracketMaker() {
        const host = document.getElementById('bracketControls');
        if (host) host.innerHTML = '';
        bracketMakerCtl = null;
        if (!host || currentDrawIsRR || typeof TW === 'undefined' || !TW.BracketMaker) {
            return;
        }
        bracketMakerCtl = TW.BracketMaker.mount({
            wrapEl: document.getElementById('roundMatchesWrap'),
            controlsHostEl: host,
            officialDraw: currentDrawRounds,
            tour: currentDrawTour,
            tournamentName: currentDrawName,
            year: currentDrawYear,
            tournamentKey: currentDrawKey,
            surface: '',
            // BracketMaker hands us the draw to render (official or derived).
            renderBracket: function (draw, mode) { renderBracketView(draw, mode); },
        });
    }

    // ── Flat round-list renderer (used for RR draws and fallback) ─────────────
    function renderRoundList(tabIdx) {
        const wrapEl = document.getElementById('roundMatchesWrap');
        if (!wrapEl || !currentDrawRounds.length) return;

        const round = currentDrawRounds[tabIdx] || currentDrawRounds[0];
        if (!round) return;

        // For RR, show all rounds; for elimination, show selected tab's round
        const roundsToShow = currentDrawIsRR
            ? currentDrawRounds
            : [round];

        let html = '';
        const orderedMatches = []; // flat, in the same order rows are emitted
        for (const r of roundsToShow) {
            const matches = r.matches || [];
            if (!matches.length) continue;

            const live     = matches.filter(m => m.isLive);
            const finished = matches.filter(m => !m.isLive && m.status === 'Finished');
            const upcoming = matches.filter(m => !m.isLive && m.status !== 'Finished');

            upcoming.sort((a, b) => {
                const sa = Math.min(a.player1Seed || 999, a.player2Seed || 999);
                const sb = Math.min(b.player1Seed || 999, b.player2Seed || 999);
                return sa - sb;
            });

            const all = [...live, ...finished, ...upcoming];
            orderedMatches.push(...all);
            const summary = `<div class="draw-round-summary">
                ${finished.length} completed
                ${live.length ? `· <span class="draw-live-inline">${live.length} live</span>` : ''}
                · ${upcoming.length} upcoming
                · ${all.length} total
            </div>`;

            html += summary + '<div class="draw-list">' + all.map(m => renderDrawRow(m)).join('') + '</div>';
        }

        if (!html) html = '<p class="draw-empty">No matches in this round yet.</p>';
        wrapEl.innerHTML = html;

        // ── Win-probability bars (ADDITIVE, post-primary-render) ──────────────
        // The string template above is rendered untouched. We now walk the
        // already-rendered rows in emit order and append an isolated prob-bar
        // container to each known-player, not-finished match. Failures (incl.
        // /api/predict unreachable) render nothing — draws look identical.
        mountDrawProbBars(wrapEl, orderedMatches);
    }

    // ── Win-probability strips on the bracket TREE (compact form) ─────────────
    // db-cards have computed absolute geometry, so a full ProbBar won't fit.
    // Instead: a 3px two-tone strip pinned to the card's bottom edge, with the
    // percentages + drivers + disclaimer in the tooltip and aria-label.
    // Additive only — skips cards that already have a strip, renders nothing on
    // fetch failure, and never touches finished/TBD matches (isEligible guards).
    function decorateTreeProbStrips(rootEl, rounds) {
        if (typeof TW === 'undefined' || !TW.ProbBar || !TW.ProbBar.fetchPrediction) return;
        const rows = [];
        (rounds || []).forEach(r => (r.matches || []).forEach(m => {
            if (!TW.ProbBar.isEligible(m)) return;
            const card = rootEl.querySelector(`.db-card[data-match-key="${m.matchKey}"]`);
            if (!card || card.querySelector('.db-prob-strip')) return;
            rows.push({ card, match: { ...m, tour: currentDrawTour } });
        }));
        if (!rows.length) return;

        let i = 0;
        const cap = 4; // same stampede guard as mountDrawProbBars
        async function worker() {
            while (i < rows.length) {
                const { card, match } = rows[i++];
                try {
                    const pred = await TW.ProbBar.fetchPrediction(match);
                    if (!pred || typeof pred.probA !== 'number') continue;
                    if (card.querySelector('.db-prob-strip')) continue; // re-render race
                    const pctA = Math.round(pred.probA * 100);
                    const pctB = 100 - pctA;
                    const strip = document.createElement('div');
                    strip.className = 'db-prob-strip';
                    strip.setAttribute('role', 'img');
                    strip.setAttribute('aria-label',
                        `Win probability — ${match.player1Name} ${pctA} percent, ${match.player2Name} ${pctB} percent. For entertainment purposes.`);
                    const drivers = Array.isArray(pred.drivers) && pred.drivers.length
                        ? ' — ' + pred.drivers[0] : '';
                    strip.title = `${match.player1Name} ${pctA}% · ${match.player2Name} ${pctB}%${drivers} — For entertainment purposes`;
                    strip.innerHTML = `<span class="db-prob-strip-a" style="width:${pctA}%"></span>` +
                                      `<span class="db-prob-strip-b" style="width:${pctB}%"></span>`;
                    card.appendChild(strip);
                } catch (_) { /* graceful absence */ }
            }
        }
        Promise.all(Array.from({ length: Math.min(cap, rows.length) }, worker));
    }

    // Appends prob bars to rendered draw rows without interleaving templates.
    function mountDrawProbBars(wrapEl, orderedMatches) {
        if (typeof TW === 'undefined' || !TW.ProbBar) return;
        const rowEls = wrapEl.querySelectorAll('.draw-row-flat');
        if (!rowEls.length) return;

        const rows = [];
        rowEls.forEach((rowEl, i) => {
            const match = orderedMatches[i];
            if (!match || !TW.ProbBar.isEligible(match)) return;
            const container = document.createElement('div');
            container.className = 'draw-probbar-host';
            rowEl.appendChild(container);
            rows.push({ container, match: { ...match, tour: currentDrawTour } });
        });

        // Concurrency cap avoids an N-call stampede across a full draw.
        TW.ProbBar.mountAll(rows, { concurrency: 4 }).then(() => {
            // Drop any container that ended up empty (ineligible / unreachable).
            wrapEl.querySelectorAll('.draw-probbar-host').forEach(c => {
                if (!c.childNodes.length) c.remove();
            });
        });
    }

    function renderDrawRow(m) {
        const isDone = m.status === 'Finished';
        const isLive = m.isLive;
        const p1Won  = m.winner === 'player1';
        const p2Won  = m.winner === 'player2';

        // Score / status centre cell
        let center;
        if (isLive) {
            const setStr = m.setScores?.length ? formatSetScores(m.setScores) + ' ' : '';
            const pts    = m.currentGame ? formatGameScore(m.currentGame) : '';
            center = `<span class="draw-badge draw-badge-live">● ${setStr}${pts || 'Live'}</span>`;
        } else if (isDone && m.setScores?.length) {
            center = `<span class="draw-score-str">${m.setScores.join(' ')}</span>`;
        } else if (isDone) {
            center = `<span class="draw-score-str">—</span>`;
        } else {
            center = `<span class="draw-vs">vs</span>`;
        }

        function seedBadge(seed) {
            return seed ? `<span class="draw-seed-pill">${seed}</span>` : '';
        }

        function playerSpan(name, key, won, lost) {
            const cls = 'draw-pname' + (won ? ' draw-won' : lost ? ' draw-lost' : '');
            const attrs = key
                ? ` data-open-player data-player-key="${key}" data-name="${(name||'').replace(/"/g,'&quot;')}" data-tour="${currentDrawTour}" data-country=""`
                : '';
            return `<span class="${cls}"${attrs}>${name || 'TBD'}</span>`;
        }

        const p1Lost = isDone && !p1Won;
        const p2Lost = isDone && !p2Won;

        return `<div class="draw-row-flat${isLive ? ' draw-row-live' : isDone ? ' draw-row-done' : ' draw-row-upcoming'}">
            <div class="draw-cell-p1">
                ${seedBadge(m.player1Seed)}
                ${playerSpan(m.player1Name, m.player1Key, p1Won, p1Lost)}
            </div>
            <div class="draw-cell-mid">${center}</div>
            <div class="draw-cell-p2">
                ${seedBadge(m.player2Seed)}
                ${playerSpan(m.player2Name, m.player2Key, p2Won, p2Lost)}
            </div>
        </div>`;
    }

    // ── Update draw sub-header ─────────────────────────────────────────────
    function updateDrawSubHeader(rounds) {
        const allMatches = rounds.flatMap(r => r.matches);
        const liveCount  = allMatches.filter(m => m.isLive || m.status === '1').length;
        const subEl = document.getElementById('drawViewSub');
        if (!subEl) return;

        // Most advanced round that has completed matches
        const played     = allMatches.filter(m => m.status === 'Finished');
        const latestRound = played.length
            ? cleanRound(played.reduce((a, b) =>
                (ROUND_SHORT[cleanRound(a.round)] || a.round) < (ROUND_SHORT[cleanRound(b.round)] || b.round)
                    ? a : b
              ).round)
            : '';

        const roundLabel = latestRound ? latestRound + ' · ' : '';
        const liveLabel  = liveCount > 0
            ? '<span class="draw-live-badge">' + liveCount + ' Live</span> · '
            : '';
        subEl.innerHTML = roundLabel + liveLabel + 'Updated moments ago';
    }

    // ── Open draw ─────────────────────────────────────────────────────────
    async function openDraw(tournamentKey, tournamentName, season, tour = 'ATP') {
        currentDrawKey  = tournamentKey;
        currentDrawTour = tour;
        currentDrawName = tournamentName || '';
        currentDrawYear = parseInt(season, 10) || new Date().getFullYear();

        stopDrawLivePoll();   // cancel polling from any previously-open draw

        const meta       = getTournamentMeta(tournamentName);
        const fullName   = meta.fullName || tournamentName;

        document.getElementById('calendarView').style.display = 'none';
        document.getElementById('drawView').style.display     = 'block';

        // Populate header
        const titleEl = document.getElementById('drawViewTitle');
        const subEl   = document.getElementById('drawViewSub');
        if (titleEl) titleEl.textContent = fullName + ' — Full Draw';
        if (subEl)   subEl.innerHTML     = 'Loading…';

        // Reset controls
        document.getElementById('roundTabs').innerHTML        = '';
        document.getElementById('roundMatchesWrap').innerHTML =
            '<div class="draw-loading"><span>Loading draw…</span></div>';

        try {
            const data   = await apiFetch(`/api/draws?tournamentKey=${tournamentKey}&season=${season}&tour=${tour}`);
            const rounds = data.rounds || [];
            currentDrawRounds = rounds;

            if (!rounds.length) {
                document.getElementById('roundMatchesWrap').innerHTML =
                    '<p class="draw-empty">No draw data available yet — check back once the tournament begins.</p>';
                return;
            }

            updateDrawSubHeader(rounds);

            // Detect Round Robin: all rounds are RR or Bronze — no bracket
            // Coerce roundId to number since the API may return strings.
            const BRACKET_ROUND_IDS = new Set([4, 5, 6, 7, 9, 10, 12]);
            const hasElimination = rounds.some(r =>
                r.matches.some(m => BRACKET_ROUND_IDS.has(Number(m.roundId)))
            );
            currentDrawIsRR = !hasElimination;

            const tabsEl2 = document.getElementById('roundTabs');

            // Tear down any prior bracket-maker before (re)building controls.
            if (typeof TW !== 'undefined' && TW.BracketMaker) TW.BracketMaker.teardown();
            const bmHost = document.getElementById('bracketControls');
            if (bmHost) bmHost.innerHTML = '';

            if (currentDrawIsRR) {
                // Round Robin: show round tabs for flat-list navigation
                tabsEl2.style.display = '';
                rounds.forEach((r, i) => {
                    const label = cleanRound(r.round);
                    const short = ROUND_SHORT[label] || label;
                    const btn   = document.createElement('button');
                    btn.className   = `round-tab${i === 0 ? ' active' : ''}`;
                    btn.textContent = short;
                    btn.title       = label + ` (${r.matches.length} matches)`;
                    btn.addEventListener('click', () => {
                        tabsEl2.querySelectorAll('.round-tab').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        renderRoundList(i);
                    });
                    tabsEl2.appendChild(btn);
                });
                renderBracketView();
            } else {
                // Elimination bracket: tabs scroll to round columns
                tabsEl2.style.display = '';

                // Sort rounds earliest → latest to match bracket left-to-right order
                const sortedByEarliest = [...rounds].reverse();
                const RID_IDX = { 4:0, 5:1, 6:2, 7:3, 9:4, 10:5, 12:6 };
                sortedByEarliest.sort((a, b) => {
                    const riA = a.matches[0] ? (RID_IDX[a.matches[0].roundId] ?? 99) : 99;
                    const riB = b.matches[0] ? (RID_IDX[b.matches[0].roundId] ?? 99) : 99;
                    return riA - riB;
                });

                // Label tabs from the server's canonical roundId (authoritative
                // depth), NOT the match count — a bye draw's round can be short
                // (Montreal's R64 has 31 matches), and a count heuristic then
                // mislabels it ("R32") and duplicates a tab.
                const RID_SHORT = { 4:'R128', 5:'R64', 6:'R32', 7:'R16', 9:'QF', 10:'SF', 12:'F' };
                sortedByEarliest.forEach((r) => {
                    if (!r.matches.length) return;
                    const rid = r.matches[0].roundId;
                    const n   = r.matches.length;
                    const short = RID_SHORT[rid] || (n >= 64 ? 'R128' : n >= 32 ? 'R64' : n >= 16 ? 'R32'
                                : n >= 8  ? 'R16'  : n >= 4  ? 'QF'  : n >= 2  ? 'SF' : 'F');
                    const btn   = document.createElement('button');
                    btn.className   = 'round-tab';
                    btn.textContent = short;
                    btn.title       = short + ` (${r.matches.length} matches)`;
                    btn.addEventListener('click', () => {
                        tabsEl2.querySelectorAll('.round-tab').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        // Scroll the matching bracket column into view
                        const col = document.querySelector(`.db-col[data-round-id="${rid}"]`);
                        if (col) {
                            col.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
                        }
                    });
                    tabsEl2.appendChild(btn);
                });

                // BracketMaker mounts the toggle/controls and drives the initial
                // render (official or restored pick-mode). Falls back to plain
                // official render if the maker is unavailable.
                if (typeof TW !== 'undefined' && TW.BracketMaker) {
                    mountBracketMaker();
                } else {
                    renderBracketView();
                }
            }

            // Draw rendered — start live polling for results as they come in.
            startDrawLivePoll();

        } catch (err) {
            document.getElementById('roundMatchesWrap').innerHTML =
                errorCardHTML('Could not load draw.', 'window._retryDraw');
            window._retryDraw = () => openDraw(tournamentKey, tournamentName, season);
            console.warn('Draw load failed:', err.message);
        }
    }

    // ── Back to calendar ───────────────────────────────────────────────────
    document.getElementById('drawBackBtn')?.addEventListener('click', () => {
        document.getElementById('drawView').style.display     = 'none';
        document.getElementById('calendarView').style.display = '';
        stopDrawLivePoll();
        if (typeof TW !== 'undefined' && TW.BracketMaker) TW.BracketMaker.teardown();
        bracketMakerCtl = null;
        currentDrawKey = null;
        currentDrawRounds = [];
    });

    // ── Live draw polling ─────────────────────────────────────────────────────
    // While a draw is open, refetch /api/draws on a smart interval. When any
    // match's result/score/status changes, replace the draw IN PLACE (so the
    // BracketMaker's officialDraw reference stays valid) and re-render through the
    // maker if active — pick-mode and decorations survive, and picks on now-decided
    // matches lock to the real winner. /api/draws is authoritative: it gains later
    // rounds as the tournament deepens, which livescore alone cannot provide.
    let drawPollTimer = null;
    // Draw data refreshes ~once a day server-side, so polling faster has no value.
    // A left-open tab self-refreshes a few times a day; reopening or reloading
    // always fetches the latest.
    const DRAW_POLL_LIVE = 6 * 60 * 60 * 1000;   // 6h
    const DRAW_POLL_IDLE = 6 * 60 * 60 * 1000;   // 6h

    function drawSignature(rounds) {
        const parts = [];
        (rounds || []).forEach(r => (r.matches || []).forEach(m => {
            const sets = (m.setScores || []).map(s =>
                typeof s === 'string' ? s : `${s && s.p1}-${s && s.p2}`).join(',');
            parts.push(`${m.matchKey}:${m.winner || ''}:${m.status || ''}:${m.isLive ? 1 : 0}:${sets}`);
        }));
        return parts.sort().join('|');
    }

    function changedRoundLabels(oldRounds, newRounds) {
        const oldWin = new Map();
        (oldRounds || []).forEach(r => (r.matches || []).forEach(m =>
            oldWin.set(String(m.matchKey), m.winner || '')));
        const labels = new Set();
        (newRounds || []).forEach(r => (r.matches || []).forEach(m => {
            if (m.winner && (m.winner !== (oldWin.get(String(m.matchKey)) || ''))) {
                labels.add(cleanRound(r.round));
            }
        }));
        return [...labels].filter(Boolean);
    }

    function stopDrawLivePoll() {
        if (drawPollTimer) { clearTimeout(drawPollTimer); drawPollTimer = null; }
    }

    function scheduleDrawPoll(anyLive) {
        stopDrawLivePoll();
        if (document.hidden || !currentDrawKey) return;   // resumes on visibilitychange
        drawPollTimer = setTimeout(pollDrawOnce, anyLive ? DRAW_POLL_LIVE : DRAW_POLL_IDLE);
    }

    async function pollDrawOnce() {
        const key = currentDrawKey;
        if (!key) return;
        try {
            const data = await apiFetch(
                `/api/draws?tournamentKey=${key}&season=${currentDrawYear}&tour=${currentDrawTour}`);
            if (currentDrawKey !== key) return;            // switched/closed mid-fetch
            const fresh = data.rounds || [];
            const anyLive = fresh.some(r => (r.matches || []).some(m => m.isLive));
            if (fresh.length && drawSignature(fresh) !== drawSignature(currentDrawRounds)) {
                const changed = changedRoundLabels(currentDrawRounds, fresh);
                currentDrawRounds.length = 0;              // in-place replace (keep reference)
                fresh.forEach(r => currentDrawRounds.push(r));
                updateDrawSubHeader(currentDrawRounds);
                if (bracketMakerCtl && bracketMakerCtl.renderNow) bracketMakerCtl.renderNow();
                else renderBracketView();
                if (changed.length) showDrawToast('Draw updated — new results in ' + changed.join(', '));
            }
            scheduleDrawPoll(anyLive);
        } catch (e) {
            scheduleDrawPoll(false);                        // keep the loop alive on hiccups
        }
    }

    function startDrawLivePoll() {
        const anyLive = (currentDrawRounds || []).some(r => (r.matches || []).some(m => m.isLive));
        scheduleDrawPoll(anyLive);
    }

    document.addEventListener('visibilitychange', function () {
        if (document.hidden) stopDrawLivePoll();
        else if (currentDrawKey && currentDrawRounds.length) startDrawLivePoll();
    });

    // ── Live update subscription ─────────────────────────────────────────────
    window.addEventListener('tw:live-update', ({ detail: { matches } }) => {
        if (!currentDrawKey || !currentDrawRounds.length || !matches.length) return;

        let updated = false;
        matches.forEach(liveMatch => {
            currentDrawRounds.forEach(r => {
                r.matches.forEach((m, i) => {
                    if (m.matchKey === liveMatch.matchKey || m.player1Key === liveMatch.player1Key) {
                        r.matches[i] = Object.assign({}, m, liveMatch);
                        updated = true;
                    }
                });
            });
        });

        if (updated) {
            updateDrawSubHeader(currentDrawRounds);
            // Route through the maker if active so pick-mode/decoration survives a
            // live update; else plain official re-render.
            if (bracketMakerCtl && bracketMakerCtl.renderNow) bracketMakerCtl.renderNow();
            else renderBracketView();

            const liveRounds = [...new Set(matches.map(m => cleanRound(m.round)).filter(Boolean))];
            if (liveRounds.length) {
                showDrawToast('Draw updated — new results in ' + liveRounds.join(', '));
            }
        }
    });

    // ── Init ───────────────────────────────────────────────────────────────
    document.getElementById('calYearLabel').textContent = calYear;
    buildAccordion(calYear);

    // Deep-link: ?tournamentKey=X&season=Y&name=Z&tour=W opens a draw directly
    const qp      = new URLSearchParams(window.location.search);
    const deepKey = qp.get('tournamentKey');
    if (deepKey) {
        const deepSeason = qp.get('season') || String(calYear);
        const deepName   = qp.get('name') ? decodeURIComponent(qp.get('name')) : '';
        const deepTour   = (qp.get('tour') || 'ATP').toUpperCase();
        const deepYear   = parseInt(deepSeason, 10);

        // Set calendar year so Back button lands on the right year
        if (deepYear && deepYear !== calYear) {
            calYear = deepYear;
            document.getElementById('calYearLabel').textContent = calYear;
        }

        // Switch view immediately before the async draw load
        document.getElementById('calendarView').style.display = 'none';
        document.getElementById('drawView').style.display     = 'block';

        openDraw(deepKey, deepName, deepSeason, deepTour);
    }

});
