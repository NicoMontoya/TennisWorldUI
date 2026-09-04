// ===================================
// TennisWorld — Scores / Hub page
// ===================================
// Primary: GET /api/hub (anonymous). Livescore overlay via LiveEngine
// only while any match isLive. All API strings go through textContent
// or dataset — never concatenated into innerHTML.
// Live flash: classList + textContent only. Never rebuild a row from
// a live payload.

document.addEventListener('DOMContentLoaded', () => {

    const HUB_INTERVAL_MS = 2 * 60 * 1000;
    let currentTournamentKey  = null;
    let currentTournamentName = '';
    let hubTimer = null;
    let todaysMatches = [];
    let digestFilter = 'all';
    let lastLiveKeySet = '';
    let lastUpdatedAt = null;
    let updatedTimer = null;

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

    function matchKeyOf(m) {
        if (!m) return '';
        return String(m.matchKey || m.key || `${m.player1Key || ''}-${m.player2Key || ''}-${m.round || ''}`);
    }

    function matchPhase(m) {
        if (m && m.isLive) return 'live';
        if (m && m.status === 'Finished') return 'finished';
        return 'upcoming';
    }

    function phaseOrder(phase) {
        if (phase === 'live') return 0;
        if (phase === 'upcoming') return 1;
        return 2;
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
        const sub = document.getElementById('hubPageSub');
        if (sub) {
            sub.textContent = `${currentTour} scores update as matches progress.`;
        }
    }

    // ── Ticker ─────────────────────────────────────────────────────────────

    function duplicateTicker(track) {
        const parent = track.parentElement;
        parent.querySelectorAll('[aria-hidden="true"]').forEach(n => n.remove());
        const clone = track.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        parent.appendChild(clone);
    }

    function stampTickerTime() {
        const node = document.getElementById('tickerUpdated');
        if (!node) return;
        node.textContent = `· ${timeAgo(new Date())}`;
        clearTimeout(stampTickerTime._t);
        stampTickerTime._t = setTimeout(stampTickerTime, 60_000);
    }

    function liveKeySet(matches) {
        return (matches || [])
            .filter(m => m && m.isLive)
            .map(matchKeyOf)
            .filter(Boolean)
            .sort()
            .join('|');
    }

    function fillTickerTrack(track, matches, tournShort) {
        const frag = document.createDocumentFragment();
        (matches || []).forEach(m => {
            const isLive = !!m.isLive;
            const isDone = m.status === 'Finished';
            const item = el('span', 'ticker-item' + (isLive ? ' ticker-live' : isDone ? ' ticker-done' : ''));

            const event = el('span', 'ticker-event');
            event.textContent = `${tournShort} · ${m.round || ''}`;
            item.appendChild(event);

            const win = matchWinner(m);
            const versus = document.createTextNode(
                isDone && win
                    ? ` ${win === 'p1' ? (m.player1Name || '') : (m.player2Name || '')} def. ${win === 'p1' ? (m.player2Name || '') : (m.player1Name || '')} `
                    : ` ${m.player1Name || ''} vs ${m.player2Name || ''} `
            );
            item.appendChild(versus);

            const tag = el('span', 'ticker-tag' + (isLive ? ' ticker-tag-live' : isDone ? '' : ' ticker-tag-soon'));
            if (isLive) {
                tag.textContent = 'Live';
            } else if (isDone) {
                tag.textContent = m.setScores?.length
                    ? formatSetScores(m.setScores)
                    : (m.finalResult || '');
            } else {
                tag.textContent = 'Upcoming';
            }
            item.appendChild(tag);

            if (isLive && m.currentGame) {
                item.appendChild(document.createTextNode(' · '));
                const game = document.createElement('strong');
                game.textContent = formatGameScore(m.currentGame);
                item.appendChild(game);
            }

            frag.appendChild(item);
            frag.appendChild(el('span', 'ticker-divider', '|'));
        });
        track.replaceChildren(frag);
    }

    function renderTicker(data) {
        const tickerEl = document.getElementById('scoreTicker');
        const track    = document.getElementById('tickerTrack');
        if (!tickerEl || !track) return;

        if (!data?.tournament || !data?.recentResults?.length) {
            tickerEl.hidden = true;
            lastLiveKeySet = '';
            return;
        }

        currentTournamentKey  = data.tournament.key;
        currentTournamentName = data.tournament.name || '';
        const tournShort = currentTournamentName.includes(' - ')
            ? currentTournamentName.split(' - ').pop()
            : currentTournamentName;

        const source = anyLive(data.todaysMatches) ? data.todaysMatches : data.recentResults;
        fillTickerTrack(track, source, tournShort);
        duplicateTicker(track);
        stampTickerTime();
        lastLiveKeySet = liveKeySet(source);
        tickerEl.hidden = false;
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

    const ROUND_ORDER = { 'Final':1, 'Semifinals':2, 'Quarterfinals':3, 'R16':4, 'R32':5, 'R64':6, 'R128':7 };

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

    function tstatItem(value, label) {
        const item = el('div', 'tstat-item');
        item.appendChild(el('span', 'tstat-val', value));
        item.appendChild(el('span', 'tstat-label', label));
        return item;
    }

    function renderH2H(container, h2h, match) {
        if (!container) return;
        container.replaceChildren();
        if (!h2h || !match) {
            container.appendChild(tstatItem('—', 'H2H'));
            return;
        }
        const p1Last = (match.player1Name || '').split(' ').pop();
        const p2Last = (match.player2Name || '').split(' ').pop();
        container.appendChild(tstatItem(String(h2h.p1Wins ?? '—'), p1Last || 'P1'));
        const mid = tstatItem(String(h2h.totalMatches ?? ''), 'H2H matches');
        mid.querySelector('.tstat-val').style.fontSize = '0.8rem';
        mid.querySelector('.tstat-val').style.opacity = '0.45';
        container.appendChild(mid);
        container.appendChild(tstatItem(String(h2h.p2Wins ?? '—'), p2Last || 'P2'));
    }

    function renderLatestResult(container, matches) {
        if (!container) return;
        container.replaceChildren();
        const finished = (matches || []).filter(m => m.status === 'Finished');
        if (!finished.length) {
            container.appendChild(el('span', '', 'No completed matches yet'));
            container.lastChild.style.color = '#999';
            return;
        }

        const m      = finished[0];
        const winner = matchWinner(m);
        const p1Won  = winner === 'p1';
        const wName  = p1Won ? m.player1Name : m.player2Name;
        const lName  = p1Won ? m.player2Name : m.player1Name;
        const score  = m.setScores?.length
            ? formatSetScores(m.setScores)
            : (() => {
                const parts = (m.finalResult || '').split(' - ');
                return parts.length === 2 ? `${parts[0]}–${parts[1]} sets` : '';
              })();

        container.appendChild(el('span', 'latest-winner', wName || ''));
        container.appendChild(el('span', 'latest-vs', 'def.'));
        container.appendChild(el('span', 'latest-loser', lName || ''));
        if (score) container.appendChild(el('span', 'latest-score', score));
        container.appendChild(el('span', 'latest-round', cleanRound(m.round)));
    }

    function featuredEyebrow(featured) {
        if (!featured) return 'Scores';
        if (featured.isLive) return 'Live';
        if (featured.status === 'Finished') return 'Finished';
        if (featured.status === 'Not Started' || featured.status === '0') return 'Upcoming';
        return 'Live & recent';
    }

    function featuredSub(featured) {
        if (!featured) return '';
        if (featured.isLive) return 'In progress · Today';
        if (featured.status === 'Not Started' || featured.status === '0') return 'Coming up';
        if (featured.status === 'Finished') return 'Most recent';
        return 'Most recent';
    }

    function paintSurface(tournament) {
        const pill = document.getElementById('hubSurface');
        if (!pill) return;
        const raw = tournament?.surface || '';
        const surface = String(raw).trim();
        pill.className = 'surface-pill';
        pill.textContent = surface || '—';
        if (!surface) return;
        const cls = surface.toLowerCase();
        if (cls === 'clay' || cls === 'hard' || cls === 'grass' || cls === 'carpet') {
            pill.classList.add(cls);
        }
    }

    // ── Today's Matches grid ────────────────────────────────────────────────

    function filteredTodays(matches) {
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

    function renderTodaysMatches(matches, tournamentName) {
        const section = document.getElementById('todaysSection');
        const grid    = document.getElementById('todaysGrid');
        const title   = document.getElementById('todaysTitle');
        if (!section || !grid) return;

        todaysMatches = matches || [];
        paintDigestCounts(todaysMatches);

        const visible = filteredTodays(todaysMatches);

        if (!todaysMatches.length) {
            section.hidden = true;
            grid.replaceChildren();
            return;
        }

        const shortName = tournamentName
            ? String(tournamentName).split(' - ').pop().trim()
            : 'Today';
        if (title) title.textContent = `Today at ${shortName}`;

        if (!visible.length) {
            const empty = el('div', 'digest-empty');
            empty.textContent = digestFilter === 'live'
                ? 'No live matches right now.'
                : digestFilter === 'finished'
                ? 'No finished matches yet today.'
                : 'No upcoming matches in this filter.';
            grid.replaceChildren(empty);
            section.hidden = false;
            return;
        }

        const groups = {};
        for (const m of visible) {
            const r = cleanRound(m.round) || m.round || 'Matches';
            if (!groups[r]) groups[r] = [];
            groups[r].push(m);
        }

        Object.keys(groups).forEach(round => {
            groups[round].sort((a, b) => phaseOrder(matchPhase(a)) - phaseOrder(matchPhase(b)));
        });

        const sortedRounds = Object.keys(groups).sort((a, b) => {
            return (ROUND_ORDER[a] || 99) - (ROUND_ORDER[b] || 99);
        });

        const frag = document.createDocumentFragment();
        sortedRounds.forEach(round => {
            const group = el('div', 'tmr-group');
            const label = el('div', 'tmr-round-label', round);
            group.appendChild(label);
            groups[round].forEach(m => group.appendChild(renderMatchRow(m)));
            frag.appendChild(group);
        });
        grid.replaceChildren(frag);

        if (typeof TW !== 'undefined' && TW.auth?.bindStarButtons) {
            TW.auth.bindStarButtons(grid);
        }

        section.hidden = false;
    }

    function renderMatchRow(m) {
        const isDone = m.status === 'Finished';
        const isLive = !!m.isLive;
        const winner = matchWinner(m);
        const p1Won  = winner === 'p1';
        const p2Won  = winner === 'p2';
        const key    = matchKeyOf(m);

        const row = el('div', 'tmr' + (isLive ? ' tmr-is-live' : '') + (isDone ? ' tmr-is-done' : ''));
        if (key) row.dataset.matchKey = key;
        row.dataset.phase = matchPhase(m);

        function playerCell(side, name, pkey, seed, won) {
            const cell = el('div', side);
            if (seed) cell.appendChild(el('span', 'tmr-seed', String(seed)));
            const pname = el('span', 'tmr-pname' + (won ? ' tmr-won' : '') + (isDone && !won && winner ? ' tmr-lost' : ''));
            pname.textContent = name || '—';
            if (pkey) {
                pname.setAttribute('data-open-player', '');
                pname.dataset.playerKey = String(pkey);
                pname.dataset.name = name || '';
                pname.dataset.tour = parseTour(m.tour) || currentTour;
                pname.dataset.country = '';
            }
            cell.appendChild(pname);
            return cell;
        }

        row.appendChild(playerCell('tmr-p1', m.player1Name, m.player1Key, m.player1Seed, p1Won));

        const center = el('div', 'tmr-center');
        const badge = el('span', 'tmr-badge');
        const score = el('span', 'tmr-score');
        const game  = el('span', 'tmr-game');
        center.appendChild(badge);
        center.appendChild(score);
        center.appendChild(game);
        paintRowCenter(badge, score, game, m);
        row.appendChild(center);

        row.appendChild(playerCell('tmr-p2', m.player2Name, m.player2Key, m.player2Seed, p2Won));
        return row;
    }

    function paintRowCenter(badge, score, game, m) {
        const isLive = !!m.isLive;
        const isDone = m.status === 'Finished';
        const setText = m.setScores?.length ? formatSetScores(m.setScores) : (m.finalResult || '');
        const gameText = isLive && m.currentGame ? formatGameScore(m.currentGame) : '';

        if (isLive) {
            badge.textContent = 'Live';
            badge.className = 'tmr-badge tmr-badge-live';
            badge.hidden = false;
        } else if (isDone) {
            badge.textContent = '';
            badge.className = 'tmr-badge';
            badge.hidden = true;
        } else {
            badge.textContent = '—';
            badge.className = 'tmr-badge tmr-badge-soon';
            badge.hidden = false;
        }

        score.textContent = setText;
        score.hidden = !setText;
        game.textContent = gameText;
        game.hidden = !gameText;
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

    function applyLiveToRow(row, live) {
        const badge = row.querySelector('.tmr-badge');
        const score = row.querySelector('.tmr-score');
        const game  = row.querySelector('.tmr-game');
        if (!badge || !score || !game) return;

        const wasLive = row.classList.contains('tmr-is-live');
        const isLive = !!live.isLive;
        const isDone = live.status === 'Finished';

        row.classList.toggle('tmr-is-live', isLive);
        row.classList.toggle('tmr-is-done', isDone);
        row.dataset.phase = matchPhase(live);

        if (isLive) {
            if (badge.textContent !== 'Live') badge.textContent = 'Live';
            badge.classList.add('tmr-badge-live');
            badge.classList.remove('tmr-badge-soon');
            badge.hidden = false;
        } else if (isDone) {
            badge.textContent = '';
            badge.classList.remove('tmr-badge-live', 'tmr-badge-soon');
            badge.hidden = true;
        }

        const setText = live.setScores?.length
            ? formatSetScores(live.setScores)
            : (live.finalResult || '');
        const gameText = isLive && live.currentGame ? formatGameScore(live.currentGame) : '';

        flashText(score, setText);
        score.hidden = !setText;
        flashText(game, gameText);
        game.hidden = !gameText;

        if (!wasLive && isLive) {
            paintDigestCounts(todaysMatches);
        }
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

    // ── Live updates to the today grid ─────────────────────────────────────
    window.addEventListener('tw:live-update', ({ detail }) => {
        const matches = detail?.matches || [];
        stampDigestUpdated(detail?.updatedAt);

        const byKey = new Map();
        matches.forEach(m => {
            const k = matchKeyOf(m);
            if (k) byKey.set(k, m);
        });

        let scoreChanged = false;
        document.querySelectorAll('.tmr[data-match-key]').forEach(row => {
            const live = byKey.get(row.dataset.matchKey);
            if (!live) return;
            const prevScore = row.querySelector('.tmr-score')?.textContent || '';
            const prevGame  = row.querySelector('.tmr-game')?.textContent || '';
            applyLiveToRow(row, live);
            const nextScore = live.setScores?.length ? formatSetScores(live.setScores) : (live.finalResult || '');
            const nextGame  = live.isLive && live.currentGame ? formatGameScore(live.currentGame) : '';
            if (prevScore !== nextScore || prevGame !== nextGame) scoreChanged = true;
            const idx = todaysMatches.findIndex(m => matchKeyOf(m) === row.dataset.matchKey);
            if (idx >= 0) {
                todaysMatches[idx] = { ...todaysMatches[idx], ...live };
            }
        });

        if (scoreChanged) paintDigestCounts(todaysMatches);

        const relevantLive = matches.filter(m =>
            m.isLive && (!currentTournamentKey || String(m.tournamentKey) === String(currentTournamentKey))
        );
        const nextKeys = liveKeySet(relevantLive);
        if (nextKeys !== lastLiveKeySet) {
            lastLiveKeySet = nextKeys;
            const track = document.getElementById('tickerTrack');
            if (track && relevantLive.length) {
                const tournShort = currentTournamentName.includes(' - ')
                    ? currentTournamentName.split(' - ').pop()
                    : currentTournamentName;
                fillTickerTrack(track, relevantLive, tournShort);
                duplicateTicker(track);
                stampTickerTime();
            }
        }
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

    async function mountFeaturedProbBar(featuredMatch) {
        if (typeof TW === 'undefined' || !TW.ProbBar) return;
        const host = document.getElementById('hubFeaturedMatch');
        if (!host) return;

        const stale = document.getElementById('hubProbBar');
        if (stale) stale.remove();

        const container = document.createElement('div');
        container.id = 'hubProbBar';
        host.appendChild(container);

        await TW.ProbBar.mount(container, { ...featuredMatch, tour: currentTour });
        if (!container.childNodes.length) container.remove();
    }

    function showFeaturedError(host) {
        host.replaceChildren();
        host.insertAdjacentHTML('afterbegin', errorCardHTML('Could not load match data.'));
        const btn = el('button', 'error-retry-btn', 'Try again');
        btn.type = 'button';
        btn.addEventListener('click', () => loadHub());
        host.querySelector('.error-card')?.appendChild(btn);
    }

    function startLiveOverlayIfNeeded(payload) {
        if (typeof LiveEngine === 'undefined') return;
        LiveEngine.setTour(currentTour);
        const live = !!(payload?.featuredMatch?.isLive || anyLive(payload?.todaysMatches) || anyLive(payload?.recentResults));
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
        const featuredEl = document.getElementById('hubFeaturedMatch');
        if (featuredEl) featuredEl.innerHTML = skeletonHTML(3);

        try {
            const tour = parseTour(currentTour) || 'ATP';
            const data = await apiFetch(`/api/hub?tour=${encodeURIComponent(tour)}`, { auth: false });
            stampDigestUpdated();

            renderTicker(data);

            const nameEl = document.getElementById('hubTournamentName');
            const eyeEl  = document.getElementById('hubEyebrow');
            if (!data || !data.tournament) {
                if (nameEl) nameEl.textContent = 'No active tournament';
                if (eyeEl) eyeEl.textContent = 'Scores';
                if (featuredEl) featuredEl.replaceChildren();
                renderH2H(document.getElementById('hubH2HStats'), null, null);
                renderLatestResult(document.getElementById('hubLatestResult'), []);
                renderTodaysMatches([], '');
                return;
            }

            const { tournament, featuredMatch, recentResults, todaysMatches: today, h2h } = data;

            if (nameEl) nameEl.textContent = tournament.name || '';
            if (eyeEl) eyeEl.textContent = featuredEyebrow(featuredMatch);
            paintSurface(tournament);
            const roundEl = document.getElementById('hubRoundLabel');
            if (roundEl) roundEl.textContent = featuredMatch ? cleanRound(featuredMatch.round) : '—';
            const subEl = document.getElementById('hubRoundSub');
            if (subEl) subEl.textContent = featuredSub(featuredMatch);

            renderH2H(document.getElementById('hubH2HStats'), h2h, featuredMatch);
            renderLatestResult(document.getElementById('hubLatestResult'), recentResults);
            renderTodaysMatches(today || [], tournament.name);

            if (featuredEl) {
                featuredEl.innerHTML = TW.MatchCard(featuredMatch, tournament.name);
            }

            mountFeaturedProbBar(featuredMatch);
            startLiveOverlayIfNeeded(data);

        } catch (err) {
            console.warn('Hub load failed:', err.message);
            if (featuredEl) showFeaturedError(featuredEl);
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
            digestFilter = next;
            chips.querySelectorAll('.digest-chip').forEach(c => {
                const on = c === btn;
                c.classList.toggle('is-active', on);
                c.setAttribute('aria-pressed', String(on));
            });
            renderTodaysMatches(todaysMatches, currentTournamentName);
        });
    }

    function syncContextAccordion() {
        const acc = document.getElementById('digestAccordion');
        if (!acc) return;
        const wide = window.matchMedia('(min-width: 1024px)');
        const apply = () => { if (wide.matches) acc.open = true; };
        apply();
        if (typeof wide.addEventListener === 'function') wide.addEventListener('change', apply);
        else if (typeof wide.addListener === 'function') wide.addListener(apply);
    }

    paintTourToggle();
    syncContextAccordion();
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
