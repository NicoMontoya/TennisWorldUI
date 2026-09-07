// ===================================
// TennisWorld — Scores / Hub page
// ===================================
// Primary: GET /api/hub (anonymous). Hub fixtures do not carry isLive —
// LiveEngine always runs on Scores and overlays GET /api/livescore.
// Hub interval reloads merge last live fields onto matching matchKeys
// before paint so fixtures cannot flash Live → Not Started.
// All API strings go through textContent or dataset — never concatenated
// into innerHTML. Live flash: classList + textContent on score cells only.
// Never rebuild a card from a live payload. TW Security checklist:
// textContent/dataset only; no CDN on this page; PUBLIC_GET intact;
// parseTour allowlist; parseEventType allowlist; Peak Overlap fully removed.
// Finished paint: Finished / Ended / Retired / Walkover (any case) → Completed.
// Delayed paint: Delayed / Postponed / Suspended (any case) — not Upcoming.
// mergeLiveOverlay also promotes those terminal livescore rows onto hub.
// Category tabs map to Worker eventType enums only — never free-text params.

const EVENT_TYPES = Object.freeze([
    'ATP Singles', 'ATP Doubles', 'WTA Singles', 'WTA Doubles', 'Mixed Doubles',
]);

const CATEGORY_TABS = Object.freeze([
    { id: 'mens-singles',   label: "Men's Singles",   eventType: 'ATP Singles' },
    { id: 'womens-singles', label: "Women's Singles", eventType: 'WTA Singles' },
    { id: 'mens-doubles',   label: "Men's Doubles",   eventType: 'ATP Doubles' },
    { id: 'womens-doubles', label: "Women's Doubles", eventType: 'WTA Doubles' },
    { id: 'mixed-doubles',  label: 'Mixed Doubles',   eventType: 'Mixed Doubles' },
]);

function parseEventType(value) {
    const t = String(value == null ? '' : value).trim();
    return EVENT_TYPES.indexOf(t) >= 0 ? t : null;
}

function parseDigestFilter(value) {
    return value === 'live' || value === 'upcoming' || value === 'completed' || value === 'all'
        ? value
        : null;
}

function eventTypeOf(m) {
    return parseEventType(m && m.eventType);
}

function countByEventType(matches) {
    const counts = Object.create(null);
    EVENT_TYPES.forEach(t => { counts[t] = 0; });
    (matches || []).forEach(m => {
        const t = eventTypeOf(m);
        if (t) counts[t] += 1;
    });
    return counts;
}

function hasAnyEventType(matches) {
    return (matches || []).some(m => eventTypeOf(m));
}

function preferredCategory(tour, counts) {
    const order = (typeof parseTour === 'function' ? parseTour(tour) : null) === 'WTA'
        ? ['WTA Singles', 'WTA Doubles', 'Mixed Doubles']
        : ['ATP Singles', 'ATP Doubles', 'Mixed Doubles'];
    for (let i = 0; i < order.length; i++) {
        const t = order[i];
        if (counts && counts[t] > 0) return t;
    }
    return null;
}

function matchesForCategory(matches, eventType) {
    const allowed = parseEventType(eventType);
    if (!allowed) return matches || [];
    return (matches || []).filter(m => eventTypeOf(m) === allowed);
}

function tournamentLabel(m, fallback) {
    const fromMatch = m && m.tournamentName ? String(m.tournamentName).trim() : '';
    if (fromMatch) return fromMatch;
    return String(fallback == null ? '' : fallback).trim();
}

function venueLabel(m) {
    return m && m.venue ? String(m.venue).trim() : '';
}

function parseSetPair(s) {
    if (s == null || s === '') return null;
    if (typeof s === 'string') {
        const m = String(s).trim().match(/^(\d+)\s*-\s*(\d+)(?:\((\d+)\))?$/);
        if (!m) return null;
        return {
            p1: Number(m[1]),
            p2: Number(m[2]),
            loserTb: m[3] != null ? Number(m[3]) : null,
        };
    }
    if (typeof s === 'object') {
        if (s.p1 == null && s.p2 == null) return null;
        let loserTb = null;
        if (s.tiebreak) {
            loserTb = Math.min(s.tiebreak.p1, s.tiebreak.p2);
        }
        return { p1: s.p1, p2: s.p2, loserTb };
    }
    return null;
}

function matchKeyOf(m) {
    if (!m) return '';
    return String(m.matchKey || m.key || `${m.player1Key || ''}-${m.player2Key || ''}-${m.round || ''}`);
}

// API status strings vary: Finished / Ended / Retired / Walkover (any case).
function isFinishedStatus(status) {
    const s = String(status == null ? '' : status).trim().toLowerCase();
    return s === 'finished' || s === 'ended' || s === 'retired' || s === 'walkover';
}

// Interrupted / not-started-yet-but-not-upcoming: Delayed / Postponed / Suspended.
function isDelayedStatus(status) {
    const s = String(status == null ? '' : status).trim().toLowerCase();
    return s === 'delayed' || s === 'postponed' || s === 'suspended';
}

function matchPhase(m) {
    if (m && m.isLive) return 'live';
    if (m && isFinishedStatus(m.status)) return 'finished';
    if (m && isDelayedStatus(m.status)) return 'delayed';
    return 'upcoming';
}

function phaseLabel(m) {
    const phase = matchPhase(m);
    if (phase === 'live') return 'Live';
    if (phase === 'upcoming') return 'Upcoming';
    if (phase === 'delayed') return 'Delayed';
    return 'Completed';
}

function pairRoundKey(m) {
    if (!m) return '';
    const a = String(m.player1Key || m.player1Name || '').trim().toLowerCase();
    const b = String(m.player2Key || m.player2Name || '').trim().toLowerCase();
    const round = String(m.round || '').trim().toLowerCase();
    if (!a || !b || !round) return '';
    return [a, b].sort().join('\0') + '\0' + round;
}

// Drop a Not Started / upcoming duplicate when the same player-pair+round
// already has a Finished (or other terminal) row. Different matchKeys can
// otherwise show the same completed match as both Upcoming and Finished.
function dedupePairRoundMatches(matches) {
    const list = matches || [];
    const groups = new Map();
    list.forEach((m, i) => {
        const k = pairRoundKey(m);
        if (!k) return;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(i);
    });
    const drop = new Set();
    groups.forEach(idxs => {
        if (idxs.length < 2) return;
        const rows = idxs.map(i => list[i]);
        const hasFinished = rows.some(m => m && !m.isLive && isFinishedStatus(m.status));
        const hasUpcoming = rows.some(m => m && !m.isLive && !isFinishedStatus(m.status));
        if (!hasFinished || !hasUpcoming) return;
        idxs.forEach(i => {
            const m = list[i];
            if (m && !m.isLive && !isFinishedStatus(m.status)) drop.add(i);
        });
    });
    return list.filter((_, i) => !drop.has(i));
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

function liveByKeyFrom(matches) {
    const map = new Map();
    (matches || []).forEach(m => {
        const k = matchKeyOf(m);
        if (k) map.set(k, m);
    });
    return map;
}

function withLiveMeta(row, live, hub) {
    const et = parseEventType(live && live.eventType);
    const tName = live && live.tournamentName && !(hub && hub.tournamentName) ? live.tournamentName : null;
    const venue = live && live.venue && !(hub && hub.venue) ? live.venue : null;
    const needType = !!(et && !parseEventType(hub && hub.eventType));
    if (!needType && !tName && !venue) return row;
    const next = row === hub ? Object.assign({}, hub) : row;
    if (needType) next.eventType = et;
    if (tName) next.tournamentName = tName;
    if (venue) next.venue = venue;
    return next;
}

// Overlay livescore / previously painted live fields onto hub fixtures.
// Hub never carries isLive; without this, interval reloads remount
// InPlay rows as Not Started / empty scores.
function mergeLiveOverlay(hubMatches, liveMatches) {
    const liveByKey = liveByKeyFrom(liveMatches);
    return (hubMatches || []).map(hub => {
        const live = liveByKey.get(matchKeyOf(hub));
        if (!live) return hub;
        if (live.isLive) {
            const next = Object.assign({}, hub, {
                isLive: true,
                status: live.status || hub.status,
            });
            if (live.setScores != null) next.setScores = live.setScores;
            if (live.currentGame != null) next.currentGame = live.currentGame;
            return withLiveMeta(next, live, hub);
        }
        if (isFinishedStatus(hub.status)) {
            if ((!hub.setScores || !hub.setScores.length) && live.setScores && live.setScores.length) {
                return withLiveMeta(Object.assign({}, hub, { setScores: live.setScores, isLive: false }), live, hub);
            }
            return withLiveMeta(Object.assign({}, hub, { isLive: false }), live, hub);
        }
        // Promote Finished / Ended / Retired / Walkover onto a Not Started
        // hub row. Copy scores/winner only when livescore actually has them.
        if (isFinishedStatus(live.status)) {
            const next = Object.assign({}, hub, {
                isLive: false,
                status: live.status,
            });
            if (live.setScores && live.setScores.length) next.setScores = live.setScores;
            if (live.currentGame != null) next.currentGame = live.currentGame;
            if (live.winner != null && live.winner !== '') next.winner = live.winner;
            return withLiveMeta(next, live, hub);
        }
        // Promote Delayed / Postponed / Suspended onto a Not Started hub row.
        // Copy scores only when livescore actually has them — never invent.
        if (isDelayedStatus(live.status)) {
            const next = Object.assign({}, hub, {
                isLive: false,
                status: live.status,
            });
            if (live.setScores && live.setScores.length) next.setScores = live.setScores;
            if (live.currentGame != null) next.currentGame = live.currentGame;
            return withLiveMeta(next, live, hub);
        }
        if (live.setScores && live.setScores.length && (!hub.setScores || !hub.setScores.length)) {
            return withLiveMeta(Object.assign({}, hub, { setScores: live.setScores, isLive: false }), live, hub);
        }
        return withLiveMeta(hub, live, hub);
    });
}

function overlayMatchesForHub(engineLast, paintedMatches) {
    if (Array.isArray(engineLast) && engineLast.length) return engineLast;
    if (engineLast === null || engineLast === undefined) {
        return (paintedMatches || []).filter(m => m && (
            m.isLive
            || (m.setScores && m.setScores.length)
            || m.currentGame
            || isFinishedStatus(m.status)
            || isDelayedStatus(m.status)
        ));
    }
    return [];
}

function sortFlatMatches(matches) {
    return (matches || []).slice().sort((a, b) => {
        const pa = matchPhase(a);
        const pb = matchPhase(b);
        const order = { live: 0, delayed: 1, upcoming: 2, finished: 3 };
        const d = (order[pa] ?? 9) - (order[pb] ?? 9);
        if (d !== 0) return d;
        const ta = matchTimeMs(a);
        const tb = matchTimeMs(b);
        if (pa === 'upcoming' || pa === 'delayed') {
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

function statusText(m) {
    const phase = matchPhase(m);
    if (phase === 'upcoming') {
        const clock = formatMatchClock(m);
        return clock || 'Upcoming';
    }
    return phaseLabel(m);
}

document.addEventListener('DOMContentLoaded', () => {

    const HUB_INTERVAL_MS = 2 * 60 * 1000;
    let currentTournamentKey  = null;
    let currentTournamentName = '';
    let hubTimer = null;
    let flatMatches = [];
    let digestFilter = 'all';
    let categoryFilter = null;
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

    function motionOk() {
        try {
            return !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        } catch {
            return true;
        }
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
        categoryFilter = null;
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
        if (nameEl) nameEl.textContent = 'Scores';
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

    function mountCategoryTabs() {
        const nav = document.getElementById('categoryTabs');
        if (!nav || nav.dataset.mounted === '1') return;
        CATEGORY_TABS.forEach(tab => {
            const btn = el('button', 'category-tab', tab.label);
            btn.type = 'button';
            btn.dataset.eventType = tab.eventType;
            btn.setAttribute('role', 'tab');
            btn.setAttribute('aria-selected', 'false');
            btn.disabled = true;
            nav.appendChild(btn);
        });
        nav.dataset.mounted = '1';
        nav.addEventListener('click', (e) => {
            const btn = e.target.closest('.category-tab');
            if (!btn || btn.disabled) return;
            const next = parseEventType(btn.dataset.eventType);
            if (!next || next === categoryFilter) return;
            setCategory(next);
        });
    }

    function paintCategoryTabs(matches) {
        const counts = countByEventType(matches);
        const nav = document.getElementById('categoryTabs');
        if (!nav) return;
        nav.querySelectorAll('.category-tab').forEach(btn => {
            const t = parseEventType(btn.dataset.eventType);
            const n = t ? (counts[t] || 0) : 0;
            btn.disabled = n === 0;
            btn.classList.toggle('is-empty', n === 0);
            const on = !!(t && t === categoryFilter);
            btn.classList.toggle('is-active', on);
            btn.setAttribute('aria-selected', String(on));
        });
    }

    function setCategory(next) {
        const allowed = next == null ? null : parseEventType(next);
        if (allowed === categoryFilter) return;
        categoryFilter = allowed;
        paintCategoryTabs(flatMatches);
        listMounted = false;
        renderFlatList(flatMatches);
    }

    function resolveCategory(matches) {
        const counts = countByEventType(matches);
        if (categoryFilter && counts[categoryFilter] > 0) return categoryFilter;
        return preferredCategory(currentTour, counts);
    }

    // ── Flat card grid ─────────────────────────────────────────────────────

    function scopedMatches(matches) {
        return matchesForCategory(matches || [], categoryFilter);
    }

    function filteredMatches(matches) {
        const list = scopedMatches(matches);
        if (digestFilter === 'all') return list;
        const phase = digestFilter === 'completed' ? 'finished' : digestFilter;
        return list.filter(m => matchPhase(m) === phase);
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
        const allowed = parseDigestFilter(next);
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

    function renderSkeleton(list) {
        const frag = document.createDocumentFragment();
        for (let i = 0; i < 4; i++) {
            const card = el('article', 'smc smc-skeleton');
            card.setAttribute('aria-hidden', 'true');
            card.appendChild(el('div', 'skeleton-line'));
            card.appendChild(el('div', 'skeleton-line'));
            card.appendChild(el('div', 'skeleton-block smc-skel-block'));
            frag.appendChild(card);
        }
        list.replaceChildren(frag);
    }

    function renderFlatList(matches) {
        const section = document.getElementById('scoresSection');
        const list    = document.getElementById('scoresList');
        if (!section || !list) return;

        flatMatches = matches || [];
        paintCategoryTabs(flatMatches);
        const scoped = scopedMatches(flatMatches);
        paintDigestCounts(scoped);

        const visible = filteredMatches(flatMatches);
        section.hidden = false;

        if (!flatMatches.length) {
            const empty = el('div', 'digest-empty', 'No matches to show.');
            list.replaceChildren(empty);
            listMounted = false;
            return;
        }

        if (categoryFilter && !scoped.length) {
            const empty = el('div', 'digest-empty');
            empty.appendChild(el('p', 'digest-empty-msg', 'No matches in this category'));
            list.replaceChildren(empty);
            listMounted = false;
            return;
        }

        if (!visible.length) {
            const empty = el('div', 'digest-empty');
            const msg = el('p', 'digest-empty-msg',
                digestFilter === 'live' ? 'No live matches right now.'
                : digestFilter === 'completed' ? 'No completed matches yet.'
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
            Array.from(list.querySelectorAll('.smc[data-match-key]')).map(row => [row.dataset.matchKey, row])
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

    function playerRow(side, name, pkey, seed) {
        const row = el('div', 'smc-row smc-' + side + (isDoublesName(name) ? ' smc-doubles' : ''));
        row.dataset.side = side;
        if (seed) row.appendChild(el('span', 'smc-seed', String(seed)));
        const pname = el('span', 'smc-name');
        pname.textContent = name || '—';
        if (pkey) {
            pname.setAttribute('data-open-player', '');
            pname.dataset.playerKey = String(pkey);
            pname.dataset.name = name || '';
            pname.dataset.tour = currentTour;
            pname.dataset.country = '';
        }
        row.appendChild(pname);
        const mark = el('span', 'smc-winner');
        mark.textContent = '●';
        mark.setAttribute('aria-label', 'Winner');
        mark.hidden = true;
        row.appendChild(mark);
        return row;
    }

    function renderMatchRow(m) {
        const isDone = matchPhase(m) === 'finished';
        const isLive = !!m.isLive;
        const key    = matchKeyOf(m);
        const phase  = matchPhase(m);

        const card = el('article', 'smc smc-' + phase + (isLive ? ' smc-is-live' : '') + (isDone ? ' smc-is-done' : ''));
        if (key) card.dataset.matchKey = key;
        card.dataset.phase = phase;

        const head = el('div', 'smc-head');
        const kicker = el('div', 'smc-kicker');
        const round = el('span', 'smc-round');
        const badge = el('span', 'smc-badge');
        const dot = el('span', 'smc-dot');
        dot.setAttribute('aria-hidden', 'true');
        const label = el('span', 'smc-badge-label');
        badge.appendChild(dot);
        badge.appendChild(label);
        kicker.appendChild(round);
        kicker.appendChild(badge);
        const game = el('span', 'smc-game');
        head.appendChild(kicker);
        head.appendChild(game);
        card.appendChild(head);

        const event = el('div', 'smc-event');
        const tourney = el('span', 'smc-tournament');
        const venue = el('span', 'smc-venue');
        event.appendChild(tourney);
        event.appendChild(venue);
        card.appendChild(event);

        const body = el('div', 'smc-body');
        const players = el('div', 'smc-players');
        players.appendChild(playerRow('p1', m.player1Name, m.player1Key, m.player1Seed));
        players.appendChild(playerRow('p2', m.player2Name, m.player2Key, m.player2Seed));
        const sets = el('div', 'smc-sets');
        body.appendChild(players);
        body.appendChild(sets);
        card.appendChild(body);

        paintRow(card, m, { flash: false });
        return card;
    }

    function paintStatus(badge, m) {
        const phase = matchPhase(m);
        badge.className = 'smc-badge smc-badge-' + phase;
        const label = badge.querySelector('.smc-badge-label');
        if (label) {
            label.textContent = statusText(m);
        }
        badge.hidden = false;
    }

    function paintWinner(card, m) {
        const isDone = matchPhase(m) === 'finished';
        const winner = matchWinner(m);
        card.querySelectorAll('.smc-row').forEach(row => {
            const side = row.dataset.side;
            const won = isDone && ((side === 'p1' && winner === 'p1') || (side === 'p2' && winner === 'p2'));
            const lost = !!(isDone && winner && !won);
            row.classList.toggle('smc-won', won);
            row.classList.toggle('smc-lost', lost);
            const mark = row.querySelector('.smc-winner');
            if (mark) mark.hidden = !won;
        });
    }

    function paintSetCell(node, val, opp, opts) {
        if (!node) return;
        const valEl = node.querySelector('.smc-set-val');
        const tbEl  = node.querySelector('.smc-set-tb');
        const next  = val == null || val === '' ? '' : String(val);
        if (opts && opts.flash) flashText(valEl, next);
        else if (valEl) valEl.textContent = next;
        if (tbEl) {
            const tb = opts && opts.tb != null ? String(opts.tb) : '';
            tbEl.textContent = tb;
            tbEl.hidden = !tb;
        }
        const num = Number(val);
        const other = Number(opp);
        const comparable = !isNaN(num) && !isNaN(other);
        node.classList.toggle('smc-set-w', comparable && num > other);
        node.classList.toggle('smc-set-l', comparable && num < other);
        node.classList.toggle('smc-set-c', !!(opts && opts.current));
    }

    function ensureSetColumns(container, count) {
        let cols = Array.from(container.querySelectorAll('.smc-set-col'));
        if (cols.length === count) return cols;
        container.replaceChildren();
        for (let i = 0; i < count; i++) {
            const col = el('div', 'smc-set-col');
            col.dataset.setIdx = String(i);
            ['p1', 'p2'].forEach(side => {
                const cell = el('span', 'smc-set');
                cell.dataset.side = side;
                cell.appendChild(el('span', 'smc-set-val'));
                const tb = el('span', 'smc-set-tb');
                tb.hidden = true;
                cell.appendChild(tb);
                col.appendChild(cell);
            });
            container.appendChild(col);
        }
        return Array.from(container.querySelectorAll('.smc-set-col'));
    }

    function paintSetColumns(container, m, opts) {
        if (!container) return;
        const sets = (m && m.setScores ? m.setScores : []).map(parseSetPair).filter(Boolean);
        if (!sets.length) {
            container.replaceChildren();
            container.hidden = true;
            return;
        }
        container.hidden = false;
        const cols = ensureSetColumns(container, sets.length);
        const isLive = matchPhase(m) === 'live';
        const flash = !!(opts && opts.flash);
        sets.forEach((s, i) => {
            const col = cols[i];
            const last = i === sets.length - 1;
            paintSetCell(col.querySelector('[data-side="p1"]'), s.p1, s.p2, {
                flash, current: isLive && last, tb: s.p1 > s.p2 ? s.loserTb : null,
            });
            paintSetCell(col.querySelector('[data-side="p2"]'), s.p2, s.p1, {
                flash, current: isLive && last, tb: s.p2 > s.p1 ? s.loserTb : null,
            });
        });
    }

    function paintRow(row, m, opts) {
        const flash = !!(opts && opts.flash);
        const badge = row.querySelector('.smc-badge');
        const sets  = row.querySelector('.smc-sets');
        const game  = row.querySelector('.smc-game');
        const round = row.querySelector('.smc-round');
        const tourney = row.querySelector('.smc-tournament');
        const venue = row.querySelector('.smc-venue');
        if (!badge || !sets || !game) return;

        const phase = matchPhase(m);
        const isLive = phase === 'live';
        const isDone = phase === 'finished';
        row.classList.remove('smc-live', 'smc-upcoming', 'smc-delayed', 'smc-finished', 'smc-is-live', 'smc-is-done');
        row.classList.add('smc', 'smc-' + phase);
        row.classList.toggle('smc-is-live', isLive);
        row.classList.toggle('smc-is-done', isDone);
        row.dataset.phase = phase;

        paintStatus(badge, m);
        paintSetColumns(sets, m, { flash });

        const nextGame = gameText(m);
        if (flash) flashText(game, nextGame);
        else game.textContent = nextGame;
        game.hidden = !nextGame;

        if (round) {
            const r = cleanRound(m.round);
            round.textContent = r;
            round.hidden = !r;
        }
        if (tourney) {
            const name = tournamentLabel(m, currentTournamentName);
            tourney.textContent = name;
            tourney.hidden = !name;
        }
        if (venue) {
            const v = venueLabel(m);
            venue.textContent = v;
            venue.hidden = !v;
        }
        paintWinner(row, m);
    }

    function flashText(node, next) {
        if (!node) return;
        const text = next == null ? '' : String(next);
        if (node.textContent === text) return;
        node.textContent = text;
        if (!motionOk()) return;
        node.classList.remove('score-flash');
        void node.offsetWidth;
        node.classList.add('score-flash');
    }

    // TW Security #2: live patches existing score cells only. Never remount
    // the card or interpolate the live payload into HTML.
    function applyLiveToRow(row, live, opts) {
        if (!row || !live) return;
        const flash = !(opts && opts.flash === false);
        const sets = row.querySelector('.smc-sets');
        const game = row.querySelector('.smc-game');
        const badge = row.querySelector('.smc-badge');
        const label = row.querySelector('.smc-badge-label');
        const phase = matchPhase(live);
        const isLive = phase === 'live';
        const isDone = phase === 'finished';

        row.classList.remove('smc-live', 'smc-upcoming', 'smc-delayed', 'smc-finished', 'smc-is-live', 'smc-is-done');
        row.classList.add('smc', 'smc-' + phase);
        row.classList.toggle('smc-is-live', isLive);
        row.classList.toggle('smc-is-done', isDone);
        row.dataset.phase = phase;

        if (badge) {
            badge.className = 'smc-badge smc-badge-' + phase;
            badge.hidden = false;
        }
        if (label) {
            label.textContent = statusText(live);
        }

        paintSetColumns(sets, live, { flash });
        const nextGame = gameText(live);
        if (flash) flashText(game, nextGame);
        else if (game) game.textContent = nextGame;
        if (game) game.hidden = !nextGame;
        paintWinner(row, live);
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

    function mergeLiveIntoPainted(prev, live) {
        const next = Object.assign({}, prev, {
            isLive: !!live.isLive,
            status: live.status || prev.status,
        });
        if (live.setScores != null) next.setScores = live.setScores;
        if (live.currentGame != null) next.currentGame = live.currentGame;
        if (live.winner != null && live.winner !== '') next.winner = live.winner;
        return withLiveMeta(next, live, prev);
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
        flatMatches = flatMatches.map(prev => {
            const live = byKey.get(matchKeyOf(prev));
            return live ? mergeLiveIntoPainted(prev, live) : prev;
        });

        const visible = filteredMatches(flatMatches);
        const existing = new Map(
            Array.from(document.querySelectorAll('.smc[data-match-key]')).map(row => [row.dataset.matchKey, row])
        );
        const canPatch = existing.size === visible.length && visible.every(m => existing.has(matchKeyOf(m)));

        if (canPatch) {
            visible.forEach(m => {
                const row = existing.get(matchKeyOf(m));
                const prevScore = row.querySelector('.smc-sets')?.textContent || '';
                const prevGame  = row.querySelector('.smc-game')?.textContent || '';
                applyLiveToRow(row, m);
                const nextScore = scoreText(m);
                const nextGame  = gameText(m);
                if (prevScore !== nextScore || prevGame !== nextGame) scoreChanged = true;
            });
        } else {
            listMounted = false;
            renderFlatList(flatMatches);
            scoreChanged = true;
        }

        if (scoreChanged) paintDigestCounts(scopedMatches(flatMatches));
        paintCategoryTabs(flatMatches);
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

    function ensureLiveEngine() {
        if (typeof LiveEngine === 'undefined') return;
        LiveEngine.setTour(currentTour);
        LiveEngine.refresh();
    }

    function liveOverlaySource() {
        const engineLast = typeof LiveEngine !== 'undefined' && LiveEngine.getLastMatches
            ? LiveEngine.getLastMatches()
            : null;
        return overlayMatchesForHub(engineLast, flatMatches);
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
            renderSkeleton(list);
        }

        try {
            const tour = parseTour(currentTour) || 'ATP';
            const data = await apiFetch(`/api/hub?tour=${encodeURIComponent(tour)}`, { auth: false });
            stampDigestUpdated();

            if (!data || !data.tournament) {
                currentTournamentKey = null;
                currentTournamentName = '';
                categoryFilter = null;
                paintHeader(null, []);
                renderFlatList([]);
                return;
            }

            currentTournamentKey  = data.tournament.key || null;
            currentTournamentName = data.tournament.name || '';

            const merged = sortFlatMatches(dedupePairRoundMatches(
                mergeLiveOverlay(mergeHubMatches(data), liveOverlaySource())
            ));
            categoryFilter = resolveCategory(merged);
            paintHeader(data.tournament, merged);
            renderFlatList(merged);
            ensureLiveEngine();

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
            const next = parseDigestFilter(btn.dataset.filter);
            if (!next || next === digestFilter) return;
            setFilter(next);
        });
    }

    mountCategoryTabs();
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
