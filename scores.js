// ===================================
// TennisWorld — Scores / Hub page
// ===================================
// Primary: GET /api/hub (anonymous). Livescore overlay via LiveEngine
// only while any match isLive. All API strings go through textContent
// or dataset — never concatenated into innerHTML.
// Live flash: classList + textContent on score cells only. Never rebuild
// a row from a live payload.

function matchKeyOf(m) {
    if (!m) return '';
    return String(m.matchKey || m.key || `${m.player1Key || ''}-${m.player2Key || ''}-${m.round || ''}`);
}

function matchPhase(m) {
    if (m && m.isLive) return 'live';
    if (m && m.status === 'Finished') return 'finished';
    return 'upcoming';
}

function matchTimeMs(m) {
    if (!m) return NaN;
    const raw = m.date || m.startDate || m.time || '';
    if (!raw) return NaN;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? NaN : d.getTime();
}

function mergeHubMatches(data) {
    const map = new Map();
    function add(m) {
        if (!m) return;
        const k = matchKeyOf(m);
        if (!k) return;
        const prev = map.get(k);
        map.set(k, prev ? Object.assign({}, prev, m) : m);
    }
    (data && data.todaysMatches ? data.todaysMatches : []).forEach(add);
    if (data) add(data.featuredMatch);
    (data && data.recentResults ? data.recentResults : []).forEach(add);
    return Array.from(map.values());
}

function sortFlatMatches(matches) {
    return (matches || []).slice().sort((a, b) => {
        const pa = matchPhase(a);
        const pb = matchPhase(b);
        const order = { live: 0, upcoming: 1, finished: 2 };
        const d = (order[pa] ?? 9) - (order[pb] ?? 9);
        if (d !== 0) return d;
        const ta = matchTimeMs(a);
        const tb = matchTimeMs(b);
        if (pa === 'upcoming') {
            if (!isNaN(ta) && !isNaN(tb) && ta !== tb) return ta - tb;
            if (!isNaN(ta) && isNaN(tb)) return -1;
            if (isNaN(ta) && !isNaN(tb)) return 1;
            return 0;
        }
        if (pa === 'finished') {
            if (!isNaN(ta) && !isNaN(tb) && ta !== tb) return tb - ta;
            return 0;
        }
        return 0;
    });
}

function formatMatchClock(m) {
    if (!m) return '';
    const clock = m.time ? String(m.time).trim() : '';
    if (/^\d{1,2}:\d{2}/.test(clock)) return clock.slice(0, 5);
    if (!m.date) return '';
    const d = new Date(m.date);
    if (isNaN(d.getTime())) return '';
    const raw = String(m.date);
    const hasTime = raw.includes('T') && !raw.endsWith('T00:00:00') && !raw.endsWith('T00:00:00Z');
    if (!hasTime) return '';
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
}

document.addEventListener('DOMContentLoaded', () => {

    const HUB_INTERVAL_MS = 2 * 60 * 1000;
    let currentTournamentKey  = null;
    let currentTournamentName = '';
    let hubTimer = null;
    let flatMatches = [];
    let digestFilter = 'all';
    let lastUpdatedAt = null;
    let updatedTimer = null;
    let listMounted = false;

    const params = new URLSearchParams(window.location.search);
    let currentTour = resolveTour(params.get('tour'));
    writeStoredTour(currentTour);
    syncTourQuery(currentTour);

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null && text !== '') node.textContent = text;
        return node;
    }

    function anyLive(matches) {
        return (matches || []).some(m => m && m.isLive);
    }

    function syncTourQuery(tour) {
        const allowed = parseTour(tour);
        if (!allowed) return;
        const url = new URL(window.location.href);
        url.searchParams.set('tour', allowed);
        history.replaceState({}, '', url);
    }

    function setTour(next) {
        const allowed = parseTour(next);
        if (!allowed || allowed === currentTour) return;
        currentTour = allowed;
        writeStoredTour(allowed);
        syncTourQuery(allowed);
        paintTourToggle();
        if (typeof LiveEngine !== 'undefined') LiveEngine.setTour(allowed);
        listMounted = false;
        loadHub();
    }

    function paintTourToggle() {
        const group = document.getElementById('tourToggle');
        if (!group) return;
        group.querySelectorAll('.tour-btn').forEach(btn => {
            const on = parseTour(btn.dataset.tour) === currentTour;
            btn.classList.toggle('is-active', on);
            btn.setAttribute('aria-pressed', String(on));
        });
    }

    function pageSub(hasLive) {
        if (hasLive) return `${currentTour} live scores update as matches progress.`;
        return `${currentTour} scores update as matches progress.`;
    }

    // ── Hub helpers ─────────────────────────────────────────────────────────
    const ROUND_LABELS = {
        'final': 'Final', 'finals': 'Final',
        '1/2-finals': 'Semifinals', 'semi-finals': 'Semifinals', 'semifinal': 'Semifinals', 'semifinals': 'Semifinals',
        '1/4-finals': 'Quarterfinals', 'quarter-finals': 'Quarterfinals', 'quarterfinal': 'Quarterfinals',
        '1/8-finals': 'R16', 'round of 16': 'R16',
        '1/16-finals': 'R32', 'round of 32': 'R32',
        '1/32-finals': 'R64', '1/64-finals': 'R128',
        'round of 128': 'R128', 'round of 64': 'R64',
    };

    function cleanRound(round) {
        if (!round) return '';
        const parts = String(round).split(' - ');
        const r = (parts[parts.length - 1] || round).trim();
        return ROUND_LABELS[r.toLowerCase()] || r;
    }

    function matchWinner(m) {
        if (m.winner === 'player1' || m.winner === 'First Player')  return 'p1';
        if (m.winner === 'player2' || m.winner === 'Second Player') return 'p2';
        const parts = (m.finalResult || '').split(' - ');
        if (parts.length === 2) {
            const p1 = Number(parts[0]), p2 = Number(parts[1]);
            if (p1 > p2) return 'p1';
            if (p2 > p1) return 'p2';
        }
        return null;
    }

    function isDoublesName(name) {
        return /[\\/]/.test(String(name || ''));
    }

    function scoreText(m) {
        if (m && m.setScores && m.setScores.length) return formatSetScores(m.setScores);
        return (m && m.finalResult) || '';
    }

    function gameText(m) {
        if (m && m.isLive && m.currentGame) return formatGameScore(m.currentGame);
        return '';
    }

    function paintHeader(tournament, matches) {
        const nameEl = document.getElementById('hubTournamentName');
        const eyeEl  = document.getElementById('hubEyebrow');
        const subEl  = document.getElementById('hubPageSub');
        if (eyeEl) eyeEl.textContent = 'Scores';
        if (nameEl) nameEl.textContent = (tournament && tournament.name) || 'Scores';
        if (subEl) subEl.textContent = pageSub(anyLive(matches));
        const pill = document.getElementById('hubSurface');
        if (pill) {
            const raw = tournament && tournament.surface ? String(tournament.surface).trim() : '';
            pill.className = 'surface-pill';
            pill.textContent = raw || '';
            pill.hidden = !raw;
            if (raw) {
                const cls = raw.toLowerCase();
                if (cls === 'clay' || cls === 'hard' || cls === 'grass' || cls === 'carpet') {
                    pill.classList.add(cls);
                }
            }
        }
    }

    // ── Flat list ──────────────────────────────────────────────────────────

    function filteredMatches(matches) {
        const list = matches || [];
        if (digestFilter === 'all') return list;
        return list.filter(m => matchPhase(m) === digestFilter);
    }

    function paintDigestCounts(matches) {
        const liveN = (matches || []).filter(m => matchPhase(m) === 'live').length;
        document.querySelectorAll('[data-count-for="live"]').forEach(node => {
            node.textContent = String(liveN);
        });
        const liveChip = document.querySelector('.digest-chip[data-filter="live"]');
        if (liveChip) liveChip.classList.toggle('has-live', liveN > 0);
    }

    function setFilter(next, rerender) {
        const allowed = next === 'live' || next === 'upcoming' || next === 'finished' || next === 'all' ? next : null;
        if (!allowed) return;
        digestFilter = allowed;
        const chips = document.getElementById('digestChips');
        if (chips) {
            chips.querySelectorAll('.digest-chip').forEach(c => {
                const on = c.dataset.filter === allowed;
                c.classList.toggle('is-active', on);
                c.setAttribute('aria-pressed', String(on));
            });
        }
        if (rerender !== false) renderFlatList(flatMatches);
    }

    function renderFlatList(matches) {
        const section = document.getElementById('scoresSection');
        const list    = document.getElementById('scoresList');
        if (!section || !list) return;

        flatMatches = matches || [];
        paintDigestCounts(flatMatches);

        const visible = filteredMatches(flatMatches);
        section.hidden = false;

        if (!flatMatches.length) {
            const empty = el('div', 'digest-empty', 'No matches to show.');
            list.replaceChildren(empty);
            listMounted = false;
            return;
        }

        if (!visible.length) {
            const empty = el('div', 'digest-empty');
            const msg = el('p', 'digest-empty-msg',
                digestFilter === 'live' ? 'No live matches right now.'
                : digestFilter === 'finished' ? 'No finished matches yet.'
                : 'No upcoming matches in this filter.');
            const btn = el('button', 'digest-empty-all', 'Show all');
            btn.type = 'button';
            btn.addEventListener('click', () => setFilter('all'));
            empty.appendChild(msg);
            empty.appendChild(btn);
            list.replaceChildren(empty);
            listMounted = false;
            return;
        }

        const existing = listMounted ? new Map(
            Array.from(list.querySelectorAll('.smr[data-match-key]')).map(row => [row.dataset.matchKey, row])
        ) : null;

        const canPatch = !!(existing && existing.size === visible.length && visible.every(m => existing.has(matchKeyOf(m))));
        if (canPatch) {
            visible.forEach(m => applyLiveToRow(existing.get(matchKeyOf(m)), m, { flash: false }));
            return;
        }

        const frag = document.createDocumentFragment();
        visible.forEach(m => frag.appendChild(renderMatchRow(m)));
        list.replaceChildren(frag);
        listMounted = true;

        if (typeof TW !== 'undefined' && TW.auth?.bindStarButtons) {
            TW.auth.bindStarButtons(list);
        }
    }

    function playerBlock(side, name, pkey, seed, won, isDone, winner) {
        const cell = el('span', 'smr-player smr-' + side + (isDoublesName(name) ? ' smr-doubles' : ''));
        if (seed) cell.appendChild(el('span', 'smr-seed', String(seed)));
        const pname = el('span', 'smr-name' + (won ? ' smr-won' : '') + (isDone && !won && winner ? ' smr-lost' : ''));
        pname.textContent = name || '—';
        if (pkey) {
            pname.setAttribute('data-open-player', '');
            pname.dataset.playerKey = String(pkey);
            pname.dataset.name = name || '';
            pname.dataset.tour = currentTour;
            pname.dataset.country = '';
        }
        cell.appendChild(pname);
        return cell;
    }

    function renderMatchRow(m) {
        const isDone = m.status === 'Finished';
        const isLive = !!m.isLive;
        const winner = matchWinner(m);
        const p1Won  = winner === 'p1';
        const p2Won  = winner === 'p2';
        const key    = matchKeyOf(m);
        const phase  = matchPhase(m);

        const row = el('article', 'smr smr-' + phase + (isLive ? ' smr-is-live' : '') + (isDone ? ' smr-is-done' : ''));
        if (key) row.dataset.matchKey = key;
        row.dataset.phase = phase;

        const status = el('div', 'smr-status');
        const badge = el('span', 'smr-badge');
        status.appendChild(badge);
        row.appendChild(status);

        const players = el('div', 'smr-players');
        players.appendChild(playerBlock('p1', m.player1Name, m.player1Key, m.player1Seed, p1Won, isDone, winner));
        players.appendChild(el('span', 'smr-vs', 'vs'));
        players.appendChild(playerBlock('p2', m.player2Name, m.player2Key, m.player2Seed, p2Won, isDone, winner));
        row.appendChild(players);

        const scores = el('div', 'smr-scores');
        const sets = el('span', 'smr-sets');
        const game = el('span', 'smr-game');
        scores.appendChild(sets);
        scores.appendChild(game);
        row.appendChild(scores);

        const meta = el('div', 'smr-meta');
        const round = el('span', 'smr-round');
        const time = el('span', 'smr-time');
        meta.appendChild(round);
        meta.appendChild(time);
        row.appendChild(meta);

        paintRow(row, m, { flash: false });
        return row;
    }

    function paintStatus(badge, m) {
        const phase = matchPhase(m);
        badge.className = 'smr-badge smr-badge-' + phase;
        if (phase === 'live') {
            badge.replaceChildren();
            const dot = el('span', 'smr-dot');
            dot.setAttribute('aria-hidden', 'true');
            badge.appendChild(dot);
            badge.appendChild(document.createTextNode('Live'));
            badge.hidden = false;
        } else if (phase === 'upcoming') {
            badge.textContent = 'Upcoming';
            badge.hidden = false;
        } else {
            badge.textContent = 'Finished';
            badge.hidden = false;
        }
    }

    function paintRow(row, m, opts) {
        const flash = !!(opts && opts.flash);
        const badge = row.querySelector('.smr-badge');
        const sets  = row.querySelector('.smr-sets');
        const game  = row.querySelector('.smr-game');
        const round = row.querySelector('.smr-round');
        const time  = row.querySelector('.smr-time');
        if (!badge || !sets || !game) return;

        const phase = matchPhase(m);
        const isLive = phase === 'live';
        const isDone = phase === 'finished';
        row.className = 'smr smr-' + phase + (isLive ? ' smr-is-live' : '') + (isDone ? ' smr-is-done' : '');
        row.dataset.phase = phase;

        paintStatus(badge, m);

        const nextSets = scoreText(m);
        const nextGame = gameText(m);
        if (flash) {
            flashText(sets, nextSets);
            flashText(game, nextGame);
        } else {
            sets.textContent = nextSets;
            game.textContent = nextGame;
        }
        sets.hidden = !nextSets;
        game.hidden = !nextGame;

        if (round) {
            const r = cleanRound(m.round);
            round.textContent = r;
            round.hidden = !r;
        }
        if (time) {
            const clock = formatMatchClock(m);
            time.textContent = clock ? '· ' + clock : '';
            time.hidden = !clock;
        }
    }

    function flashText(node, next) {
        if (!node) return;
        const text = next == null ? '' : String(next);
        if (node.textContent === text) return;
        node.textContent = text;
        node.classList.remove('score-flash');
        void node.offsetWidth;
        node.classList.add('score-flash');
    }

    function applyLiveToRow(row, live, opts) {
        if (!row || !live) return;
        paintRow(row, live, { flash: opts && opts.flash === false ? false : true });
    }

    function stampDigestUpdated(iso) {
        lastUpdatedAt = iso ? new Date(iso) : new Date();
        paintDigestUpdated();
        clearTimeout(updatedTimer);
        updatedTimer = setTimeout(function tick() {
            paintDigestUpdated();
            updatedTimer = setTimeout(tick, 1000);
        }, 1000);
    }

    function paintDigestUpdated() {
        const node = document.getElementById('digestUpdated');
        if (!node || !lastUpdatedAt) return;
        const secs = Math.max(0, Math.floor((Date.now() - lastUpdatedAt.getTime()) / 1000));
        node.textContent = `Updated ${secs}s ago`;
    }

    function setScoresNavLive(on) {
        document.querySelectorAll('.nav-link-scores').forEach(link => {
            link.classList.toggle('has-live', !!on);
            const dot = link.querySelector('.nav-live-dot');
            if (dot) dot.hidden = !on;
        });
    }

    // ── Live updates: patch score cells by matchKey, do not remount ────────
    window.addEventListener('tw:live-update', ({ detail }) => {
        const matches = detail?.matches || [];
        stampDigestUpdated(detail?.updatedAt);

        const byKey = new Map();
        matches.forEach(m => {
            const k = matchKeyOf(m);
            if (k) byKey.set(k, m);
        });

        let scoreChanged = false;
        document.querySelectorAll('.smr[data-match-key]').forEach(row => {
            const live = byKey.get(row.dataset.matchKey);
            if (!live) return;
            const prevScore = row.querySelector('.smr-sets')?.textContent || '';
            const prevGame  = row.querySelector('.smr-game')?.textContent || '';
            applyLiveToRow(row, live);
            const nextScore = scoreText(live);
            const nextGame  = gameText(live);
            if (prevScore !== nextScore || prevGame !== nextGame) scoreChanged = true;
            const idx = flatMatches.findIndex(m => matchKeyOf(m) === row.dataset.matchKey);
            if (idx >= 0) {
                flatMatches[idx] = Object.assign({}, flatMatches[idx], live);
            }
        });

        if (scoreChanged) paintDigestCounts(flatMatches);
        const subEl = document.getElementById('hubPageSub');
        if (subEl) subEl.textContent = pageSub(anyLive(flatMatches));
    });

    window.addEventListener('tw:live-status', ({ detail: { status } }) => {
        const pill = document.getElementById('liveStatusPill');
        if (pill) {
            pill.className = `live-status-pill live-status-${status}`;
            pill.textContent = status === 'connected' ? '● Live'
                : status === 'idle'                   ? 'No live matches'
                : '⚠ Reconnecting…';
        }
        setScoresNavLive(status === 'connected');
    });

    function showListError(list) {
        list.replaceChildren();
        const card = el('div', 'error-card');
        card.setAttribute('role', 'alert');
        card.appendChild(el('span', 'error-card-icon', '⚠'));
        card.appendChild(el('span', 'error-card-msg', 'Could not load match data.'));
        const btn = el('button', 'error-retry-btn', 'Try again');
        btn.type = 'button';
        btn.addEventListener('click', () => loadHub());
        card.appendChild(btn);
        list.appendChild(card);
        listMounted = false;
    }

    function startLiveOverlayIfNeeded(payload) {
        if (typeof LiveEngine === 'undefined') return;
        LiveEngine.setTour(currentTour);
        const live = !!(anyLive(payload && payload.todaysMatches) || anyLive(payload && payload.recentResults) || (payload && payload.featuredMatch && payload.featuredMatch.isLive));
        if (live) LiveEngine.start();
    }

    function stopHubPoll() {
        if (hubTimer) {
            clearTimeout(hubTimer);
            hubTimer = null;
        }
    }

    function scheduleHubPoll() {
        stopHubPoll();
        if (document.hidden) return;
        hubTimer = setTimeout(async () => {
            await loadHub();
            scheduleHubPoll();
        }, HUB_INTERVAL_MS);
    }

    async function loadHub() {
        const list = document.getElementById('scoresList');
        const section = document.getElementById('scoresSection');
        if (section) section.hidden = false;
        if (list && !listMounted) {
            const loading = el('div', 'digest-loading', 'Loading match data…');
            list.replaceChildren(loading);
        }

        try {
            const tour = parseTour(currentTour) || 'ATP';
            const data = await apiFetch(`/api/hub?tour=${encodeURIComponent(tour)}`, { auth: false });
            stampDigestUpdated();

            if (!data || !data.tournament) {
                currentTournamentKey = null;
                currentTournamentName = '';
                paintHeader(null, []);
                renderFlatList([]);
                return;
            }

            currentTournamentKey  = data.tournament.key || null;
            currentTournamentName = data.tournament.name || '';

            const merged = sortFlatMatches(mergeHubMatches(data));
            paintHeader(data.tournament, merged);
            renderFlatList(merged);
            startLiveOverlayIfNeeded(data);

        } catch (err) {
            console.warn('Hub load failed:', err.message);
            if (list) showListError(list);
        }
    }

    const tourToggle = document.getElementById('tourToggle');
    if (tourToggle) {
        tourToggle.addEventListener('click', (e) => {
            const btn = e.target.closest('.tour-btn');
            if (!btn) return;
            const next = parseTour(btn.dataset.tour);
            if (next) setTour(next);
        });
    }

    const chips = document.getElementById('digestChips');
    if (chips) {
        chips.addEventListener('click', (e) => {
            const btn = e.target.closest('.digest-chip');
            if (!btn) return;
            const next = btn.dataset.filter;
            if (!next || next === digestFilter) return;
            setFilter(next);
        });
    }

    paintTourToggle();
    if (typeof LiveEngine !== 'undefined') LiveEngine.setTour(currentTour);

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopHubPoll();
        } else {
            loadHub();
            scheduleHubPoll();
        }
    });

    loadHub();
    scheduleHubPoll();
});
