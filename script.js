// ===================================
// TennisWorld Analytics
// ===================================

// ── API config ────────────────────────────────────────────────────────────────
// Switch to your deployed worker URL when going to production.
const API_BASE = 'http://localhost:8787';

async function apiFetch(path) {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'API error');
    return json.data;
}

// Country name → flag emoji (covers all active ATP/WTA players)
const COUNTRY_FLAGS = {
    'Italy':'🇮🇹','Spain':'🇪🇸','Serbia':'🇷🇸','Russia':'🇷🇺',
    'Germany':'🇩🇪','Greece':'🇬🇷','Norway':'🇳🇴','Denmark':'🇩🇰',
    'USA':'🇺🇸','United States':'🇺🇸','France':'🇫🇷','Australia':'🇦🇺',
    'Great Britain':'🇬🇧','United Kingdom':'🇬🇧','Canada':'🇨🇦',
    'Argentina':'🇦🇷','Chile':'🇨🇱','Poland':'🇵🇱','Czech Republic':'🇨🇿',
    'Croatia':'🇭🇷','Switzerland':'🇨🇭','Austria':'🇦🇹','Belgium':'🇧🇪',
    'Netherlands':'🇳🇱','Japan':'🇯🇵','South Korea':'🇰🇷','China':'🇨🇳',
    'Kazakhstan':'🇰🇿','Bulgaria':'🇧🇬','Romania':'🇷🇴','Hungary':'🇭🇺',
    'Slovakia':'🇸🇰','Ukraine':'🇺🇦','Brazil':'🇧🇷','Colombia':'🇨🇴',
    'Portugal':'🇵🇹','Tunisia':'🇹🇳','South Africa':'🇿🇦','Sweden':'🇸🇪',
    'Finland':'🇫🇮','Israel':'🇮🇱','Mongolia':'🇲🇳','Taiwan':'🇹🇼',
    'Thailand':'🇹🇭','India':'🇮🇳','Slovenia':'🇸🇮','Bosnia':'🇧🇦',
    'Latvia':'🇱🇻','Lithuania':'🇱🇹','Estonia':'🇪🇪','Georgia':'🇬🇪',
};

function flag(country) {
    return COUNTRY_FLAGS[country] || '🏳';
}

document.addEventListener('DOMContentLoaded', () => {

    // ===================================
    // Navigation — scroll state + active
    // ===================================
    const nav = document.getElementById('mainNav');
    const navLinks = document.querySelectorAll('.nav-link');

    window.addEventListener('scroll', () => {
        nav.classList.toggle('scrolled', window.scrollY > 50);
    });

    navLinks.forEach(link => {
        link.addEventListener('click', e => {
            const href = link.getAttribute('href');
            if (!href || !href.startsWith('#')) return;
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        });
    });

    const sections = document.querySelectorAll('section[id]');
    const navObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.getAttribute('id');
                navLinks.forEach(link => {
                    link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
                });
            }
        });
    }, { threshold: 0.3 });
    sections.forEach(s => navObserver.observe(s));

    // ===================================
    // Scroll Reveal
    // ===================================
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry, i) => {
            if (entry.isIntersecting) {
                setTimeout(() => entry.target.classList.add('revealed'), i * 80);
                revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.08, rootMargin: '0px 0px -60px 0px' });

    document.querySelectorAll('[data-scroll-reveal]').forEach(el => revealObserver.observe(el));

    // ===================================
    // Progress Bars — animate on enter
    // ===================================
    const barObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const w = entry.target.style.width;
                entry.target.style.width = '0%';
                setTimeout(() => { entry.target.style.width = w; }, 150);
                barObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });

    document.querySelectorAll('.bar-fill, .prob-fill, .progress-fill, .surface-bar-fill')
        .forEach(bar => barObserver.observe(bar));

    // ===================================
    // ATP / WTA tab (rankings) + standings loader
    // ===================================
    async function loadStandings(tour = 'ATP') {
        const tbody = document.getElementById('rankingsBody');
        if (!tbody) return;

        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:1.5rem;color:#999;font-size:.875rem;">Loading ${tour} standings…</td></tr>`;

        try {
            const standings = await apiFetch(`/api/standings?tour=${tour}`);

            tbody.innerHTML = standings.slice(0, 20).map(p => {
                const mvmt = p.movement > 0 ? '▲' : p.movement < 0 ? '▼' : '–';
                const mvmtColor = p.movement > 0 ? 'var(--positive)' : p.movement < 0 ? 'var(--negative)' : '#999';
                return `<tr
                    data-player-key="${p.playerKey}"
                    data-tour="${tour}"
                    data-name="${p.name}"
                    data-rank="${p.rank}"
                    data-country="${p.country}"
                    data-birthday="${p.birthday || ''}"
                    data-pts="${p.points}"
                    data-age="0" data-titles="0" data-wpct="0"
                    data-hard="0" data-clay="0" data-form="">
                    <td class="col-rank">${p.rank}</td>
                    <td class="col-flag">${flag(p.country)}</td>
                    <td class="col-name"><span class="player-name" data-open-player>${p.name}</span></td>
                    <td class="num" title="${p.country}">—</td>
                    <td class="num">${p.points.toLocaleString()}</td>
                    <td class="num">—</td>
                    <td class="num">—</td>
                    <td class="num col-hard">—</td>
                    <td class="num col-clay">—</td>
                    <td class="col-form">
                        <span style="font-size:.75rem;color:${mvmtColor}">${mvmt}</span>
                    </td>
                </tr>`;
            }).join('');

        } catch (err) {
            console.warn(`Standings fetch failed (${err.message}) — keeping static data`);
            // On error, just leave whatever was in tbody (static HTML fallback)
            if (tbody.querySelector('td[colspan]')) {
                // We replaced with the loading row — restore a minimal message
                tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:1rem;color:#999;font-size:.875rem;">Could not load live data.</td></tr>`;
            }
        }
    }

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tour = btn.dataset.tab === 'wta' ? 'WTA' : 'ATP';
            // Reset surface tab to "All" when switching tours
            document.querySelectorAll('.surface-tab').forEach(b => b.classList.remove('active'));
            document.querySelector('.surface-tab[data-surface="all"]')?.classList.add('active');
            setHeadersOverall(tour);
            loadStandings(tour);
        });
    });

    // ===================================
    // Live Score Ticker — load real data, fall back to static
    // ===================================
    function duplicateTicker(track) {
        // Remove any existing clone first
        const parent = track.parentElement;
        parent.querySelectorAll('[aria-hidden="true"]').forEach(el => el.remove());
        const clone = track.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        parent.appendChild(clone);
    }

    async function loadTicker() {
        const track = document.getElementById('tickerTrack');
        if (!track) return;

        try {
            // 1. Try live scores
            let matches = await apiFetch('/api/livescore?tour=ATP');

            // 2. No live matches — grab last 7 days of results
            if (!matches.length) {
                const today  = new Date();
                const stop   = today.toISOString().split('T')[0];
                const start  = new Date(today - 7 * 86400000).toISOString().split('T')[0];
                const recent = await apiFetch(`/api/fixtures?dateStart=${start}&dateStop=${stop}`);
                // Only show finished matches in the ticker
                matches = recent.filter(m => m.status === 'Finished').slice(0, 10);
            }

            if (!matches.length) {
                // No data at all — just loop the static HTML as-is
                duplicateTicker(track);
                return;
            }

            const items = matches.map(m => {
                const isLive = m.isLive;
                const isDone = m.status === 'Finished';
                const cls    = isLive ? 'ticker-live' : isDone ? 'ticker-done' : '';
                const round  = m.round || 'R';
                const tag    = isLive
                    ? `<span class="ticker-tag ticker-tag-live">Live</span>`
                    : isDone
                    ? `<span class="ticker-tag">${m.finalResult}</span>`
                    : `<span class="ticker-tag ticker-tag-soon">Upcoming</span>`;
                const versus = isDone
                    ? `${m.player1Name} def. ${m.player2Name}`
                    : `${m.player1Name} vs ${m.player2Name}`;

                return `<span class="ticker-item ${cls}">
                    <span class="ticker-event">${m.tournamentName} · ${round}</span>
                    ${versus} ${tag}
                </span><span class="ticker-divider">|</span>`;
            }).join('');

            track.innerHTML = items;
            duplicateTicker(track);

        } catch (err) {
            console.warn(`Ticker fetch failed (${err.message}) — keeping static ticker`);
            duplicateTicker(track);
        }
    }

    // ===================================
    // Rankings Table — sortable + search + surface tabs
    // ===================================
    const table = document.getElementById('rankingsTable');
    if (table) {
        const tbody = document.getElementById('rankingsBody');
        let currentSort = { col: 'rank', dir: 'asc' };

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

                sortTable(col, dir);
                highlightCol(col);
            });
        });

        function sortTable(col, dir) {
            const rows = Array.from(tbody.querySelectorAll('tr'));
            rows.sort((a, b) => {
                const vA = a.dataset[col] || '';
                const vB = b.dataset[col] || '';
                const nA = parseFloat(vA), nB = parseFloat(vB);
                if (!isNaN(nA) && !isNaN(nB)) return dir === 'asc' ? nA - nB : nB - nA;
                return dir === 'asc' ? vA.localeCompare(vB) : vB.localeCompare(vA);
            });
            rows.forEach(r => tbody.appendChild(r));
        }

        function highlightCol(col) {
            const map = { rank:1, flag:2, name:3, age:4, pts:5, titles:6, wpct:7, hard:8, clay:9, form:10 };
            table.querySelectorAll('td, th').forEach(c => c.style.fontWeight = '');
            if (map[col]) {
                table.querySelectorAll(`td:nth-child(${map[col]})`).forEach(td => td.style.fontWeight = '700');
            }
        }

        // Search filter
        const searchInput = document.getElementById('playerSearch');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                const q = searchInput.value.toLowerCase();
                tbody.querySelectorAll('tr').forEach(row => {
                    row.style.display = (row.dataset.name || '').toLowerCase().includes(q) ? '' : 'none';
                });
            });
        }

        // Surface tabs
        document.querySelectorAll('.surface-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.surface-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const surface = btn.dataset.surface;
                const activeTour = document.querySelector('.tab-btn.active')?.dataset.tab === 'wta' ? 'WTA' : 'ATP';

                if (surface === 'all') {
                    loadStandings(activeTour);
                    setHeadersOverall(activeTour);
                } else {
                    loadSurfaceStandings(activeTour, surface);
                }
            });
        });
    }

    // ── Header swap helpers ────────────────────────────────────────────────────
    const SURFACE_LABELS = { hard: 'Hard Court', clay: 'Clay Court', grass: 'Grass Court' };

    function setHeadersOverall(tour) {
        document.getElementById('rankingsTitle').textContent    = `${tour} Rankings`;
        document.getElementById('rankingsSubtitle').textContent = 'Overall · Live data';
        document.getElementById('th-col4').innerHTML  = 'Age';
        document.getElementById('th-col5').innerHTML  = 'PTS<span class="sort-arrow"></span>';
        document.getElementById('th-col6').innerHTML  = 'Titles<span class="sort-arrow"></span>';
        document.getElementById('th-col7').innerHTML  = 'W%<span class="sort-arrow"></span>';
        document.getElementById('th-col8').innerHTML  = 'Hard<span class="sort-arrow"></span>';
        document.getElementById('th-col9').innerHTML  = 'Clay<span class="sort-arrow"></span>';
        document.getElementById('th-col10').innerHTML = 'Form';
    }

    function setHeadersSurface(tour, surface) {
        const label = SURFACE_LABELS[surface] || surface;
        document.getElementById('rankingsTitle').textContent    = `${tour} ${label} Rankings`;
        document.getElementById('rankingsSubtitle').textContent = `TennisWorld custom ranking · sorted by surface win %`;
        document.getElementById('th-col4').innerHTML  = 'ATP #';
        document.getElementById('th-col5').innerHTML  = 'W–L<span class="sort-arrow"></span>';
        document.getElementById('th-col6').innerHTML  = 'Played<span class="sort-arrow"></span>';
        document.getElementById('th-col7').innerHTML  = 'Win%<span class="sort-arrow"></span>';
        document.getElementById('th-col8').innerHTML  = '±ATP';
        document.getElementById('th-col9').innerHTML  = '';
        document.getElementById('th-col10').innerHTML = '';
    }

    // ── Surface standings loader ───────────────────────────────────────────────
    async function loadSurfaceStandings(tour = 'ATP', surface = 'hard') {
        const tbody = document.getElementById('rankingsBody');
        if (!tbody) return;

        setHeadersSurface(tour, surface);
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:1.5rem;color:#999;font-size:.875rem;">Loading ${SURFACE_LABELS[surface]} rankings…</td></tr>`;

        try {
            const data = await apiFetch(`/api/surface-standings?tour=${tour}&surface=${surface}`);

            tbody.innerHTML = data.map(p => {
                const rankDiff  = p.atpRank - p.surfaceRank; // positive = better on surface than overall
                const diffLabel = rankDiff > 0 ? `<span style="color:var(--positive)">▲${rankDiff}</span>`
                                : rankDiff < 0 ? `<span style="color:var(--negative)">▼${Math.abs(rankDiff)}</span>`
                                : `<span style="color:#999">–</span>`;
                const wl = p.matchesPlayed > 0 ? `${p.wins}–${p.losses}` : '—';
                const winPct = p.matchesPlayed > 0 ? `${p.winPct}%` : '—';

                return `<tr
                    data-name="${p.name}"
                    data-rank="${p.surfaceRank}"
                    data-pts="${p.winPct}"
                    data-age="${p.atpRank}" data-titles="${p.matchesPlayed}"
                    data-wpct="${p.winPct}" data-hard="0" data-clay="0" data-form="">
                    <td class="col-rank">${p.surfaceRank}</td>
                    <td class="col-flag">${flag(p.country)}</td>
                    <td class="col-name">${p.name}</td>
                    <td class="num">#${p.atpRank}</td>
                    <td class="num">${wl}</td>
                    <td class="num">${p.matchesPlayed || '—'}</td>
                    <td class="num">${winPct}</td>
                    <td class="num">${diffLabel}</td>
                    <td class="num"></td>
                    <td class="col-form"></td>
                </tr>`;
            }).join('');

        } catch (err) {
            console.warn(`Surface standings failed (${err.message})`);
            tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:1rem;color:#999;font-size:.875rem;">Could not load surface data.</td></tr>`;
        }
    }

    // ===================================
    // Momentum Graph
    // ===================================
    const playerMomentumData = {
        alcaraz: {
            name: 'Carlos Alcaraz', rank: '#2 ATP', country: '🇪🇸',
            surface: {
                hard:  { w: 28, l: 5,  pct: 85 },
                clay:  { w: 22, l: 4,  pct: 85 },
                grass: { w: 12, l: 2,  pct: 86 }
            },
            data: [
                { month: 'May',  year: "'25", score: 82, event: 'Madrid W',         label: true,  wins: 7, losses: 1 },
                { month: 'Jun',  year: "'25", score: 96, event: 'Roland Garros W',  label: true,  wins: 7, losses: 0 },
                { month: 'Jul',  year: "'25", score: 91, event: 'Wimbledon W',      label: true,  wins: 7, losses: 0 },
                { month: 'Aug',  year: "'25", score: 61, event: 'Cincinnati R3',    label: false, wins: 3, losses: 2 },
                { month: 'Sep',  year: "'25", score: 72, event: 'US Open QF',       label: false, wins: 5, losses: 1 },
                { month: 'Oct',  year: "'25", score: 54, event: 'Shanghai R2',      label: false, wins: 2, losses: 2 },
                { month: 'Nov',  year: "'25", score: 74, event: 'Paris Masters SF', label: false, wins: 4, losses: 1 },
                { month: 'Dec',  year: "'25", score: 63, event: 'Davis Cup',        label: false, wins: 3, losses: 1 },
                { month: 'Jan',  year: "'26", score: 88, event: 'AO Final ●',       label: true,  wins: 6, losses: 1 },
                { month: 'Feb',  year: "'26", score: 69, event: 'Rotterdam SF',     label: false, wins: 4, losses: 1 },
                { month: 'Mar',  year: "'26", score: 79, event: 'Indian Wells W',   label: true,  wins: 6, losses: 0 },
                { month: 'Apr',  year: "'26", score: 83, event: 'Miami Open SF',    label: false, wins: 5, losses: 1 },
            ]
        },
        djokovic: {
            name: 'Novak Djokovic', rank: '#1 ATP', country: '🇷🇸',
            surface: {
                hard:  { w: 24, l: 4,  pct: 86 },
                clay:  { w: 18, l: 5,  pct: 78 },
                grass: { w: 10, l: 2,  pct: 83 }
            },
            data: [
                { month: 'May',  year: "'25", score: 71, event: 'Rome SF',           label: false, wins: 4, losses: 1 },
                { month: 'Jun',  year: "'25", score: 77, event: 'Roland Garros QF',  label: false, wins: 5, losses: 1 },
                { month: 'Jul',  year: "'25", score: 60, event: 'Wimbledon R4',      label: false, wins: 3, losses: 1 },
                { month: 'Aug',  year: "'25", score: 56, event: 'Rogers Cup R2',     label: false, wins: 2, losses: 1 },
                { month: 'Sep',  year: "'25", score: 73, event: 'US Open SF',        label: false, wins: 5, losses: 1 },
                { month: 'Oct',  year: "'25", score: 70, event: 'Beijing W',         label: false, wins: 5, losses: 0 },
                { month: 'Nov',  year: "'25", score: 84, event: 'Paris Masters W',   label: true,  wins: 5, losses: 0 },
                { month: 'Dec',  year: "'25", score: 67, event: 'Davis Cup',         label: false, wins: 3, losses: 1 },
                { month: 'Jan',  year: "'26", score: 90, event: 'AO Final ●',        label: true,  wins: 6, losses: 1 },
                { month: 'Feb',  year: "'26", score: 74, event: 'Rotterdam W',       label: false, wins: 4, losses: 0 },
                { month: 'Mar',  year: "'26", score: 76, event: 'Indian Wells QF',   label: false, wins: 4, losses: 1 },
                { month: 'Apr',  year: "'26", score: 80, event: 'Miami SF',          label: false, wins: 5, losses: 1 },
            ]
        },
        sinner: {
            name: 'Jannik Sinner', rank: '#4 ATP', country: '🇮🇹',
            surface: {
                hard:  { w: 31, l: 5,  pct: 86 },
                clay:  { w: 14, l: 5,  pct: 74 },
                grass: { w: 8,  l: 3,  pct: 73 }
            },
            data: [
                { month: 'May',  year: "'25", score: 67, event: 'Rome R3',           label: false, wins: 3, losses: 1 },
                { month: 'Jun',  year: "'25", score: 72, event: 'Roland Garros SF',  label: false, wins: 5, losses: 1 },
                { month: 'Jul',  year: "'25", score: 64, event: 'Wimbledon QF',      label: false, wins: 4, losses: 1 },
                { month: 'Aug',  year: "'25", score: 89, event: 'Cincinnati W',      label: true,  wins: 6, losses: 0 },
                { month: 'Sep',  year: "'25", score: 95, event: 'US Open W',         label: true,  wins: 7, losses: 0 },
                { month: 'Oct',  year: "'25", score: 81, event: 'Shanghai W',        label: true,  wins: 6, losses: 0 },
                { month: 'Nov',  year: "'25", score: 88, event: 'ATP Finals W',      label: true,  wins: 5, losses: 1 },
                { month: 'Dec',  year: "'25", score: 72, event: 'Davis Cup',         label: false, wins: 4, losses: 1 },
                { month: 'Jan',  year: "'26", score: 79, event: 'AO Semifinal',      label: false, wins: 5, losses: 1 },
                { month: 'Feb',  year: "'26", score: 70, event: 'Doha Final',        label: false, wins: 4, losses: 1 },
                { month: 'Mar',  year: "'26", score: 74, event: 'Indian Wells SF',   label: false, wins: 5, losses: 1 },
                { month: 'Apr',  year: "'26", score: 76, event: 'Miami QF',          label: false, wins: 4, losses: 1 },
            ]
        },
        medvedev: {
            name: 'Daniil Medvedev', rank: '#3 ATP', country: '🇷🇺',
            surface: {
                hard:  { w: 26, l: 7,  pct: 79 },
                clay:  { w: 8,  l: 6,  pct: 57 },
                grass: { w: 5,  l: 4,  pct: 56 }
            },
            data: [
                { month: 'May',  year: "'25", score: 59, event: 'Madrid R2',         label: false, wins: 2, losses: 1 },
                { month: 'Jun',  year: "'25", score: 55, event: 'Roland Garros R3',  label: false, wins: 2, losses: 1 },
                { month: 'Jul',  year: "'25", score: 44, event: 'Wimbledon R2',      label: false, wins: 1, losses: 1 },
                { month: 'Aug',  year: "'25", score: 81, event: 'Rogers Cup W',      label: true,  wins: 5, losses: 0 },
                { month: 'Sep',  year: "'25", score: 84, event: 'US Open Final',     label: true,  wins: 6, losses: 1 },
                { month: 'Oct',  year: "'25", score: 72, event: 'Vienna W',          label: false, wins: 5, losses: 0 },
                { month: 'Nov',  year: "'25", score: 63, event: 'Paris QF',          label: false, wins: 3, losses: 1 },
                { month: 'Dec',  year: "'25", score: 58, event: 'Davis Cup R1',      label: false, wins: 2, losses: 1 },
                { month: 'Jan',  year: "'26", score: 52, event: 'AO Semifinal',      label: false, wins: 4, losses: 1 },
                { month: 'Feb',  year: "'26", score: 74, event: 'Marseille W',       label: false, wins: 4, losses: 0 },
                { month: 'Mar',  year: "'26", score: 65, event: 'Indian Wells R3',   label: false, wins: 2, losses: 1 },
                { month: 'Apr',  year: "'26", score: 62, event: 'Miami R2',          label: false, wins: 1, losses: 1 },
            ]
        }
    };

    function renderMomentumChart(playerKey) {
        const player = playerMomentumData[playerKey];
        const container = document.getElementById('momentumGraph');
        const tooltip = document.getElementById('momentumTooltip');
        if (!container || !player) return;

        const W = 560, H = 220;
        const mL = 36, mR = 20, mT = 26, mB = 44;
        const cW = W - mL - mR;
        const cH = H - mT - mB;
        const n = player.data.length;
        const xStep = cW / (n - 1);

        const px = i => mL + i * xStep;
        const py = v => mT + cH - (v / 100) * cH;

        // Grid lines
        const grid = [25, 50, 75, 100].map(v => {
            const y = py(v).toFixed(1);
            return `<line x1="${mL}" y1="${y}" x2="${W - mR}" y2="${y}"
                        stroke="rgba(17,17,17,${v === 50 ? 0.1 : 0.05})"
                        stroke-width="${v === 50 ? 0.75 : 0.4}"/>
                    <text x="${mL - 6}" y="${y}" text-anchor="end" dominant-baseline="middle"
                        font-family="Inter,sans-serif" font-size="9" fill="#aaa">${v}</text>`;
        }).join('');

        // Tour average dashed line
        const avgY = py(70).toFixed(1);
        const avgLine = `
            <line x1="${mL}" y1="${avgY}" x2="${W - mR}" y2="${avgY}"
                stroke="rgba(181,69,27,0.45)" stroke-width="0.9" stroke-dasharray="5,3"/>
            <text x="${W - mR + 4}" y="${avgY}" dominant-baseline="middle"
                font-family="Inter,sans-serif" font-size="8" fill="rgba(181,69,27,0.65)">avg</text>`;

        // Area fill
        const areaD = [
            `M ${px(0).toFixed(1)},${(mT + cH).toFixed(1)}`,
            ...player.data.map((d, i) => `L ${px(i).toFixed(1)},${py(d.score).toFixed(1)}`),
            `L ${px(n - 1).toFixed(1)},${(mT + cH).toFixed(1)} Z`
        ].join(' ');

        // Polyline
        const linePoints = player.data
            .map((d, i) => `${px(i).toFixed(1)},${py(d.score).toFixed(1)}`)
            .join(' ');

        // Dots + labels
        const dots = player.data.map((d, i) => {
            const x = px(i).toFixed(1);
            const y = py(d.score).toFixed(1);
            const above = d.score >= 68;
            const labelY = above
                ? (parseFloat(y) - 12).toFixed(1)
                : (parseFloat(y) + 15).toFixed(1);
            return `
                <circle class="m-dot" cx="${x}" cy="${y}" r="3.5"
                    fill="#fffff8" stroke="#111111" stroke-width="1.5"
                    data-score="${d.score}" data-event="${d.event}"
                    data-month="${d.month} ${d.year}"
                    data-wins="${d.wins}" data-losses="${d.losses}"/>
                ${d.label ? `<text x="${x}" y="${labelY}" text-anchor="middle"
                    font-family="Inter,sans-serif" font-size="8" fill="#555"
                    font-style="italic">${d.event}</text>` : ''}`;
        }).join('');

        // X-axis labels
        const xLabels = player.data.map((d, i) => {
            const x = px(i).toFixed(1);
            const baseY = mT + cH + 14;
            const bump = i % 2 === 0 ? 0 : 10;
            return `<text x="${x}" y="${baseY + bump}" text-anchor="middle"
                        font-family="Inter,sans-serif" font-size="8.5" fill="#999">${d.month}</text>
                    <text x="${x}" y="${baseY + bump + 9}" text-anchor="middle"
                        font-family="Inter,sans-serif" font-size="7.5" fill="#bbb">${d.year}</text>`;
        }).join('');

        container.innerHTML = `
        <svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;overflow:visible" id="momentumSVG">
            <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stop-color="#111111" stop-opacity="0.07"/>
                    <stop offset="100%" stop-color="#111111" stop-opacity="0.01"/>
                </linearGradient>
            </defs>
            ${grid}
            ${avgLine}
            <path d="${areaD}" fill="url(#areaGrad)"/>
            <line x1="${mL}" y1="${mT + cH}" x2="${W - mR}" y2="${mT + cH}"
                stroke="rgba(17,17,17,0.2)" stroke-width="0.75"/>
            <polyline points="${linePoints}" fill="none" stroke="#111111"
                stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
            ${dots}
            ${xLabels}
        </svg>`;

        // Hover tooltip
        container.querySelectorAll('.m-dot').forEach(dot => {
            dot.addEventListener('mouseenter', () => {
                const above = parseInt(dot.dataset.score) >= 68;
                tooltip.innerHTML = `<strong>${dot.dataset.month} · ${dot.dataset.event}</strong>Score: ${dot.dataset.score} &nbsp;|&nbsp; W–L: ${dot.dataset.wins}–${dot.dataset.losses}`;
                tooltip.style.display = 'block';
                const cRect = container.getBoundingClientRect();
                const dRect = dot.getBoundingClientRect();
                tooltip.style.left = `${Math.min(dRect.left - cRect.left + 10, cRect.width - 180)}px`;
                tooltip.style.top  = above
                    ? `${dRect.top - cRect.top - 58}px`
                    : `${dRect.top - cRect.top + 12}px`;
            });
            dot.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
        });

        // Update header
        const nameEl = document.getElementById('momentumPlayerName');
        if (nameEl) nameEl.textContent = `${player.country} ${player.name}`;

        // Summary bar
        const scores = player.data.map(d => d.score);
        const peak = Math.max(...scores);
        const peakM = player.data[scores.indexOf(peak)];
        const current = scores[scores.length - 1];
        const trend = current - scores[scores.length - 2];
        const summaryEl = document.getElementById('momentumSummary');
        if (summaryEl) {
            summaryEl.innerHTML = `
                <span>Peak: <strong>${peak}</strong> (${peakM.month} ${peakM.year})</span>
                <span>Current: <strong>${current}</strong></span>
                <span>Trend: <strong style="color:${trend >= 0 ? 'var(--positive)' : 'var(--negative)'}">${trend >= 0 ? '+' : ''}${trend}</strong></span>`;
        }

        renderSurfaceBreakdown(player);
    }

    function renderSurfaceBreakdown(player) {
        const el = document.getElementById('surfaceBreakdown');
        if (!el || !player.surface) return;
        el.innerHTML = [
            { key: 'hard',  label: 'Hard',  color: '#2563eb' },
            { key: 'clay',  label: 'Clay',  color: 'var(--accent)' },
            { key: 'grass', label: 'Grass', color: 'var(--positive)' },
        ].map(s => {
            const d = player.surface[s.key];
            return `<div class="surface-row">
                <div class="surface-row-header">
                    <span class="surface-label">${s.label}</span>
                    <span class="surface-record">${d.w}W – ${d.l}L</span>
                    <span class="surface-pct">${d.pct}%</span>
                </div>
                <div class="surface-bar-track">
                    <div class="surface-bar-fill" style="width:${d.pct}%;background:${s.color}"></div>
                </div>
            </div>`;
        }).join('');
    }

    renderMomentumChart('alcaraz');

    const selectEl = document.getElementById('momentumPlayerSelect');
    if (selectEl) {
        selectEl.addEventListener('change', () => renderMomentumChart(selectEl.value));
    }

    // ===================================
    // Tournament Hub + Calendar + Draw
    // ===================================

    const ROUND_LABELS = {
        'final': 'Final', 'finals': 'Final',
        '1/2-finals': 'Semifinals', 'semi-finals': 'Semifinals', 'semifinal': 'Semifinals', 'semifinals': 'Semifinals',
        '1/4-finals': 'Quarterfinals', 'quarter-finals': 'Quarterfinals', 'quarterfinal': 'Quarterfinals',
        '1/8-finals': 'R16', 'round of 16': 'R16',
        '1/16-finals': 'R32', 'round of 32': 'R32',
        '1/32-finals': 'R64', 'round of 64': 'R64',
        '1/64-finals': 'R128', 'round of 128': 'R128',
    };

    const ROUND_SHORT = { 'Final':'F','Semifinals':'SF','Quarterfinals':'QF','R16':'R16','R32':'R32','R64':'R64','R128':'R128' };

    function cleanRound(round) {
        if (!round) return '';
        const parts = round.split(' - ');
        const r = (parts[parts.length - 1] || round).trim();
        return ROUND_LABELS[r.toLowerCase()] || r;
    }

    function matchStatusType(m) {
        if (m.isLive || m.status === '1') return 'live';
        if (m.status === 'Finished')      return 'finished';
        if (m.status === 'Cancelled')     return 'cancelled';
        return 'upcoming';
    }

    // Sets won: finalResult is "2 - 1" or "-"
    function parseSetsWon(finalResult) {
        const parts = (finalResult || '').split(' - ');
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            return { p1: Number(parts[0]), p2: Number(parts[1]) };
        }
        return null;
    }

    // ── Hub ───────────────────────────────────────────────────────────────────
    function renderFeaturedMatch(m, tournamentName) {
        if (!m) return `<div style="padding:2rem;text-align:center;color:#999">No featured match available.</div>`;
        const status = matchStatusType(m);
        const sets   = parseSetsWon(m.finalResult);
        const round  = cleanRound(m.round);
        const p1Won  = sets && sets.p1 > sets.p2;
        const p2Won  = sets && sets.p2 > sets.p1;

        const statusPill = status === 'live'
            ? `<div class="hub-live-pill">● Live</div>`
            : status === 'finished'
            ? `<div class="hub-live-pill" style="color:var(--text-secondary)">Finished</div>`
            : `<div class="hub-live-pill" style="color:var(--text-muted)">Upcoming · ${m.time || 'TBD'}</div>`;

        const p1Sets = sets ? `<span class="hub-set ${p1Won?'hub-set-w':'hub-set-l'}">${sets.p1}</span>` : `<span class="hub-set">–</span>`;
        const p2Sets = sets ? `<span class="hub-set ${p2Won?'hub-set-w':'hub-set-l'}">${sets.p2}</span>` : `<span class="hub-set">–</span>`;

        return `
        <div class="hub-player hub-player-left">
            <div class="hub-player-identity">
                <div>
                    <div class="hub-player-name">${m.player1Name}</div>
                    <div class="hub-player-sub">${status === 'finished' && p1Won ? '● Winner' : ''}</div>
                </div>
            </div>
            <div class="hub-sets">${p1Sets}</div>
        </div>
        <div class="hub-center">
            ${statusPill}
            <div class="hub-round-center">${tournamentName} · ${round}</div>
        </div>
        <div class="hub-player hub-player-right">
            <div class="hub-sets">${p2Sets}</div>
            <div class="hub-player-identity hub-player-identity-r">
                <div>
                    <div class="hub-player-name">${m.player2Name}</div>
                    <div class="hub-player-sub">${status === 'finished' && p2Won ? '● Winner' : ''}</div>
                </div>
            </div>
        </div>`;
    }

    function renderLatestResult(rounds) {
        const finished = rounds
            .flatMap(r => r.matches.map(m => ({ ...m, roundLabel: cleanRound(r.round) })))
            .filter(m => m.status === 'Finished')
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        if (!finished.length) return '<span style="color:#999">No completed matches yet</span>';
        const m      = finished[0];
        const sets   = parseSetsWon(m.finalResult);
        const p1Won  = sets && sets.p1 > sets.p2;
        const winner = p1Won ? m.player1Name : m.player2Name;
        const loser  = p1Won ? m.player2Name : m.player1Name;
        const score  = sets ? `${sets.p1}–${sets.p2} sets` : '';
        return `<span class="latest-winner">${winner}</span>
                <span class="latest-vs">def.</span>
                <span class="latest-loser">${loser}</span>
                ${score ? `<span class="latest-score">${score}</span>` : ''}
                <span class="latest-round">${m.roundLabel}</span>`;
    }

    async function loadHub() {
        try {
            const data = await apiFetch('/api/hub?tour=ATP');
            if (!data || !data.tournament) return;
            const { tournament, featuredMatch, rounds, isLive } = data;

            document.getElementById('hubTournamentName').textContent = tournament.name;
            document.getElementById('hubRoundLabel').textContent     = featuredMatch ? cleanRound(featuredMatch.round) : '—';
            document.getElementById('hubRoundSub').textContent       = isLive ? 'In progress · Today' : 'Most recent';
            document.getElementById('hubMatchCount').textContent     = tournament.matchCount;
            document.getElementById('hubLiveCount').textContent      = rounds.flatMap(r => r.matches).filter(m => m.isLive || m.status === '1').length;
            document.getElementById('hubUpcomingCount').textContent  = rounds.flatMap(r => r.matches).filter(m => !m.isLive && m.status !== '1' && m.status !== 'Finished' && m.status !== 'Cancelled').length;
            document.getElementById('hubFeaturedMatch').innerHTML    = renderFeaturedMatch(featuredMatch, tournament.name);
            document.getElementById('hubLatestResult').innerHTML     = renderLatestResult(rounds);
        } catch (err) {
            console.warn('Hub load failed:', err.message);
        }
    }

    // ── Calendar ──────────────────────────────────────────────────────────────
    function formatDate(iso) {
        if (!iso) return '—';
        const d = new Date(iso + 'T00:00:00');
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    function isoString(date) {
        return date.toISOString().split('T')[0];
    }

    // Returns Monday of the week containing `date`
    function weekStart(date) {
        const d = new Date(date);
        const day = d.getDay();
        d.setDate(d.getDate() - ((day + 6) % 7));
        d.setHours(0, 0, 0, 0);
        return d;
    }

    function weekEnd(monday) {
        const d = new Date(monday);
        d.setDate(d.getDate() + 6);
        return d;
    }

    function formatWeekLabel(monday) {
        const sunday = weekEnd(monday);
        const opts = { month: 'short', day: 'numeric' };
        if (monday.getFullYear() !== sunday.getFullYear()) {
            return `${monday.toLocaleDateString('en-US', { ...opts, year: 'numeric' })} – ${sunday.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`;
        }
        if (monday.getMonth() !== sunday.getMonth()) {
            return `${monday.toLocaleDateString('en-US', opts)} – ${sunday.toLocaleDateString('en-US', opts)}, ${sunday.getFullYear()}`;
        }
        return `${monday.toLocaleDateString('en-US', { month: 'long' })} ${monday.getDate()}–${sunday.getDate()}, ${sunday.getFullYear()}`;
    }

    function renderTournamentCard(t) {
        const surfaceCls  = (t.surface || '').toLowerCase();
        const dateStr     = t.startDate && t.endDate
            ? `${formatDate(t.startDate)} – ${formatDate(t.endDate)}` : '—';
        const isLive      = t.status === 'live';
        const isUpcoming  = t.status === 'upcoming';
        const statusClass = isLive ? 'cal-card-live' : isUpcoming ? 'cal-card-upcoming' : 'cal-card-done';
        const statusLabel = isLive
            ? `<span class="cal-card-badge cal-badge-live">● Live</span>`
            : isUpcoming
            ? `<span class="cal-card-badge cal-badge-upcoming">Upcoming</span>`
            : `<span class="cal-card-badge cal-badge-done">Completed</span>`;

        const progressPct = t.totalMatches > 0
            ? Math.round((t.finished / t.totalMatches) * 100) : 0;

        return `
        <div class="cal-card ${statusClass}" data-key="${t.tournamentKey}" data-name="${t.name}" data-season="${t.season || new Date().getFullYear()}">
            <div class="cal-card-top">
                <div class="cal-card-name">${t.name}</div>
                ${statusLabel}
            </div>
            <div class="cal-card-meta">
                <span class="surface-pill ${surfaceCls}">${t.surface}</span>
                <span class="cal-card-dates">${dateStr}</span>
            </div>
            <div class="cal-card-stats">
                <div class="cal-card-stat">
                    <span class="cal-stat-val">${t.finished}</span>
                    <span class="cal-stat-lbl">Played</span>
                </div>
                ${isLive ? `<div class="cal-card-stat">
                    <span class="cal-stat-val cal-stat-live">${t.live}</span>
                    <span class="cal-stat-lbl">Live</span>
                </div>` : ''}
                <div class="cal-card-stat">
                    <span class="cal-stat-val">${t.upcoming || 0}</span>
                    <span class="cal-stat-lbl">Upcoming</span>
                </div>
            </div>
            ${t.totalMatches > 0 ? `
            <div class="cal-card-progress">
                <div class="cal-progress-bar">
                    <div class="cal-progress-fill ${surfaceCls}" style="width:${progressPct}%"></div>
                </div>
                <span class="cal-progress-label">${progressPct}% complete</span>
            </div>` : ''}
            <div class="cal-card-cta">View Draw ›</div>
        </div>`;
    }

    // State for week navigation
    let calCurrentWeekStart = weekStart(new Date());
    let calCurrentTour = 'ATP';

    async function loadCalendar(tour = calCurrentTour, weekMonday = calCurrentWeekStart) {
        calCurrentTour = tour;
        calCurrentWeekStart = weekMonday;

        const sunday    = weekEnd(weekMonday);
        // Widen by 3 days each side to catch tournaments that started before Mon or end after Sun
        const fetchStart = new Date(weekMonday); fetchStart.setDate(fetchStart.getDate() - 3);
        const fetchStop  = new Date(sunday);      fetchStop.setDate(fetchStop.getDate() + 3);

        const labelEl = document.getElementById('calWeekLabel');
        const gridEl  = document.getElementById('calendarCards');
        if (labelEl) labelEl.textContent = formatWeekLabel(weekMonday);
        if (gridEl)  gridEl.innerHTML    = '<div class="cal-loading">Loading tournaments…</div>';

        try {
            const tournaments = await apiFetch(
                `/api/calendar?tour=${tour}&dateStart=${isoString(fetchStart)}&dateStop=${isoString(fetchStop)}`
            );

            if (!tournaments.length) {
                gridEl.innerHTML = '<div class="cal-empty">No tournaments scheduled this week.</div>';
                return;
            }

            gridEl.innerHTML = tournaments.map(renderTournamentCard).join('');
            gridEl.querySelectorAll('.cal-card').forEach(card => {
                card.addEventListener('click', () =>
                    openDraw(card.dataset.key, card.dataset.name, card.dataset.season)
                );
            });
        } catch (err) {
            console.warn('Calendar load failed:', err.message);
            gridEl.innerHTML = '<div class="cal-empty">Could not load calendar.</div>';
        }
    }

    // Week navigation
    document.getElementById('calPrevWeek')?.addEventListener('click', () => {
        const prev = new Date(calCurrentWeekStart);
        prev.setDate(prev.getDate() - 7);
        loadCalendar(calCurrentTour, prev);
    });
    document.getElementById('calNextWeek')?.addEventListener('click', () => {
        const next = new Date(calCurrentWeekStart);
        next.setDate(next.getDate() + 7);
        loadCalendar(calCurrentTour, next);
    });
    document.getElementById('calToday')?.addEventListener('click', () => {
        loadCalendar(calCurrentTour, weekStart(new Date()));
    });

    // Tour tabs
    document.querySelectorAll('.cal-tour-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.cal-tour-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            loadCalendar(btn.dataset.tour, calCurrentWeekStart);
        });
    });

    // ── Draw view ─────────────────────────────────────────────────────────────
    function renderRoundTable(matches) {
        if (!matches.length) return `<p style="padding:1rem 0;color:#999;font-size:.875rem">No matches in this round yet.</p>`;
        return `<table class="draw-table">
            <tbody>${matches.map(m => {
                const status = matchStatusType(m);
                const sets   = parseSetsWon(m.finalResult);
                const p1Won  = sets && sets.p1 > sets.p2;
                const p2Won  = sets && sets.p2 > sets.p1;
                const score  = status === 'finished' && sets
                    ? `${sets.p1}–${sets.p2}`
                    : status === 'live'
                    ? `<span style="color:var(--accent)">● Live</span>`
                    : status === 'cancelled' ? '—' : (m.time || 'TBD');
                return `<tr class="draw-row ${status}">
                    <td class="draw-p1 ${p1Won?'draw-winner':status==='finished'?'draw-loser':''}">${m.player1Name}</td>
                    <td class="draw-score">${score}</td>
                    <td class="draw-p2 ${p2Won?'draw-winner':status==='finished'?'draw-loser':''}">${m.player2Name}</td>
                    <td class="draw-date">${formatDate(m.date)}</td>
                </tr>`;
            }).join('')}</tbody>
        </table>`;
    }

    async function openDraw(tournamentKey, tournamentName, season) {
        document.getElementById('calendarView').style.display  = 'none';
        document.getElementById('drawView').style.display      = 'block';
        document.getElementById('drawNavTitle').textContent    = tournamentName;
        document.getElementById('drawNavMeta').textContent     = season;
        document.getElementById('roundTabs').innerHTML         = '';
        document.getElementById('roundMatchesWrap').innerHTML  = `<p style="color:#999;padding:1rem 0">Loading draw…</p>`;

        try {
            const data   = await apiFetch(`/api/draws?tournamentKey=${tournamentKey}&season=${season}`);
            const rounds = data.rounds || [];
            document.getElementById('drawsSectionSubtitle').textContent =
                `${data.totalMatches} matches completed · ${tournamentName} ${season}`;

            if (!rounds.length) {
                document.getElementById('roundMatchesWrap').innerHTML = `<p style="color:#999;padding:1rem 0">No draw data available.</p>`;
                return;
            }

            const tabsEl = document.getElementById('roundTabs');
            rounds.forEach((r, i) => {
                const label = cleanRound(r.round);
                const short = ROUND_SHORT[label] || label;
                const btn   = document.createElement('button');
                btn.className   = `round-tab${i === 0 ? ' active' : ''}`;
                btn.textContent = short;
                btn.title       = label;
                btn.addEventListener('click', () => {
                    tabsEl.querySelectorAll('.round-tab').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    document.getElementById('roundMatchesWrap').innerHTML = renderRoundTable(r.matches);
                });
                tabsEl.appendChild(btn);
            });

            document.getElementById('roundMatchesWrap').innerHTML = renderRoundTable(rounds[0].matches);
        } catch (err) {
            console.warn('Draw load failed:', err.message);
            document.getElementById('roundMatchesWrap').innerHTML = `<p style="color:#999;padding:1rem 0">Could not load draw.</p>`;
        }
    }

    document.getElementById('drawBackBtn')?.addEventListener('click', () => {
        document.getElementById('drawView').style.display     = 'none';
        document.getElementById('calendarView').style.display = '';
    });

    // ===================================
    // Bootstrap — load real data on page load
    // ===================================
    setHeadersOverall('ATP');
    loadStandings('ATP');
    loadTicker();
    loadHub();
    loadCalendar();

    // Re-poll the ticker every 5 minutes (matches cache TTL)
    setInterval(loadTicker, 5 * 60 * 1000);

});
