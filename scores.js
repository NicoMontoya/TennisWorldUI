// ===================================
// TennisWorld — Scores / Hub page
// ===================================

document.addEventListener('DOMContentLoaded', () => {

    // ── Ticker ─────────────────────────────────────────────────────────────
    let currentTournamentKey  = null;
    let currentTournamentName = '';

    function duplicateTicker(track) {
        const parent = track.parentElement;
        parent.querySelectorAll('[aria-hidden="true"]').forEach(el => el.remove());
        const clone = track.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        parent.appendChild(clone);
    }

    function stampTickerTime() {
        const el = document.getElementById('tickerUpdated');
        if (!el) return;
        el.textContent = `· ${timeAgo(new Date())}`;
        clearTimeout(stampTickerTime._t);
        stampTickerTime._t = setTimeout(stampTickerTime, 60_000);
    }

    function buildTickerItems(matches, tournShort) {
        return matches.map(m => {
            const isLive = m.isLive;
            const isDone = m.status === 'Finished';
            const cls    = isLive ? ' ticker-live' : isDone ? ' ticker-done' : '';
            const win    = matchWinner(m);
            const p1Won  = win === 'p1';
            const score  = m.setScores?.length ? formatSetScores(m.setScores) : (m.finalResult || '');
            const gameStr = (isLive && m.currentGame)
                ? ` · <strong>${formatGameScore(m.currentGame)}</strong>`
                : '';
            const versus = isDone && win
                ? `${p1Won ? m.player1Name : m.player2Name} def. ${p1Won ? m.player2Name : m.player1Name}`
                : `${m.player1Name} vs ${m.player2Name}`;
            const tag = isLive
                ? `<span class="ticker-tag ticker-tag-live">Live</span>`
                : isDone
                ? `<span class="ticker-tag">${score}</span>`
                : `<span class="ticker-tag ticker-tag-soon">Upcoming</span>`;
            return `<span class="ticker-item${cls}">
                <span class="ticker-event">${tournShort} · ${m.round || ''}</span>
                ${versus} ${tag}${gameStr}
            </span><span class="ticker-divider">|</span>`;
        }).join('');
    }

    function renderTicker(data) {
        const tickerEl = document.getElementById('scoreTicker');
        const track    = document.getElementById('tickerTrack');
        if (!tickerEl || !track) return;

        if (!data?.tournament || !data?.recentResults?.length) {
            tickerEl.hidden = true;
            return;
        }

        currentTournamentKey  = data.tournament.key;
        currentTournamentName = data.tournament.name || '';
        const tournShort = currentTournamentName.includes(' - ')
            ? currentTournamentName.split(' - ').pop()
            : currentTournamentName;

        track.innerHTML = buildTickerItems(data.recentResults, tournShort);
        duplicateTicker(track);
        stampTickerTime();
        tickerEl.hidden = false;
    }

    // ── Hub ─────────────────────────────────────────────────────────────────
    const ROUND_LABELS = {
        'final': 'Final', 'finals': 'Final',
        '1/2-finals': 'Semifinals', 'semi-finals': 'Semifinals', 'semifinal': 'Semifinals', 'semifinals': 'Semifinals',
        '1/4-finals': 'Quarterfinals', 'quarter-finals': 'Quarterfinals', 'quarterfinal': 'Quarterfinals',
        '1/8-finals': 'R16', 'round of 16': 'R16',
        '1/16-finals': 'R32', 'round of 32': 'R32',
        '1/32-finals': 'R64', '1/64-finals': 'R128',
    };

    const ROUND_ORDER = { 'Final':1, 'Semifinals':2, 'Quarterfinals':3, 'R16':4, 'R32':5, 'R64':6, 'R128':7 };

    function cleanRound(round) {
        if (!round) return '';
        const parts = round.split(' - ');
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

    function renderFeaturedMatch(m, tournamentName) {
        return TW.MatchCard(m, tournamentName);
    }

    function renderH2H(h2h, match) {
        if (!h2h || !match) {
            return '<div class="tstat-item"><span class="tstat-val">—</span><span class="tstat-label">H2H</span></div>';
        }
        const p1Last = (match.player1Name || '').split(' ').pop();
        const p2Last = (match.player2Name || '').split(' ').pop();
        return `
            <div class="tstat-item">
                <span class="tstat-val">${h2h.p1Wins}</span>
                <span class="tstat-label">${p1Last}</span>
            </div>
            <div class="tstat-item">
                <span class="tstat-val" style="font-size:0.8rem;opacity:0.45">${h2h.totalMatches}</span>
                <span class="tstat-label">H2H matches</span>
            </div>
            <div class="tstat-item">
                <span class="tstat-val">${h2h.p2Wins}</span>
                <span class="tstat-label">${p2Last}</span>
            </div>`;
    }

    function renderLatestResult(matches) {
        const finished = (matches || []).filter(m => m.status === 'Finished');
        if (!finished.length) return '<span style="color:#999">No completed matches yet</span>';

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
        const roundLabel = cleanRound(m.round);

        return `<span class="latest-winner">${wName}</span>
                <span class="latest-vs">def.</span>
                <span class="latest-loser">${lName}</span>
                ${score ? `<span class="latest-score">${score}</span>` : ''}
                <span class="latest-round">${roundLabel}</span>`;
    }

    // ── Today's Matches grid ────────────────────────────────────────────────

    // Group matches by round label, sorted by round importance
    function renderTodaysMatches(matches, tournamentName) {
        const section = document.getElementById('todaysSection');
        const grid    = document.getElementById('todaysGrid');
        const title   = document.getElementById('todaysTitle');
        if (!section || !grid) return;

        if (!matches || !matches.length) {
            section.hidden = true;
            return;
        }

        const shortName = tournamentName
            ? tournamentName.split(' - ').pop().trim()
            : 'Today';
        if (title) title.textContent = `Today at ${shortName}`;

        // Group by round
        const groups = {};
        for (const m of matches) {
            const r = cleanRound(m.round) || m.round || 'Matches';
            if (!groups[r]) groups[r] = [];
            groups[r].push(m);
        }

        // Sort groups by round order (Final first)
        const sortedRounds = Object.keys(groups).sort((a, b) => {
            return (ROUND_ORDER[a] || 99) - (ROUND_ORDER[b] || 99);
        });

        grid.innerHTML = sortedRounds.map(round => {
            const ms = groups[round];
            const rows = ms.map(m => renderMatchRow(m)).join('');
            return `<div class="tmr-group">
                <div class="tmr-round-label">${round}</div>
                ${rows}
            </div>`;
        }).join('');

        // Bind player-panel open on player name clicks
        if (typeof TW !== 'undefined' && TW.auth?.bindStarButtons) {
            TW.auth.bindStarButtons(grid);
        }

        section.hidden = false;
    }

    function renderMatchRow(m) {
        const isDone     = m.status === 'Finished';
        const isLive     = m.isLive;
        const isUpcoming = !isDone && !isLive;
        const winner     = matchWinner(m);
        const p1Won      = winner === 'p1';
        const p2Won      = winner === 'p2';

        const score = isDone && m.setScores?.length
            ? `<span class="tmr-score">${formatSetScores(m.setScores)}</span>`
            : isLive
            ? `<span class="tmr-badge tmr-badge-live">Live</span>`
            : `<span class="tmr-badge tmr-badge-soon">—</span>`;

        const p1Seed = m.player1Seed ? `<span class="tmr-seed">${m.player1Seed}</span>` : '';
        const p2Seed = m.player2Seed ? `<span class="tmr-seed">${m.player2Seed}</span>` : '';

        // Player name — make clickable if we have a key
        function playerEl(name, key, won) {
            const wonClass = won ? ' tmr-won' : '';
            const lostClass = (isDone && !won && winner) ? ' tmr-lost' : '';
            if (key) {
                return `<span class="tmr-pname${wonClass}${lostClass}" data-open-player
                    data-player-key="${key}" data-name="${name}"
                    data-tour="${m.tour || 'ATP'}" data-country="">${name}</span>`;
            }
            return `<span class="tmr-pname${wonClass}${lostClass}">${name}</span>`;
        }

        return `<div class="tmr${isLive ? ' tmr-is-live' : ''}${isDone ? ' tmr-is-done' : ''}">
            <div class="tmr-p1">${p1Seed}${playerEl(m.player1Name || '—', m.player1Key, p1Won)}</div>
            <div class="tmr-center">${score}</div>
            <div class="tmr-p2">${p2Seed}${playerEl(m.player2Name || '—', m.player2Key, p2Won)}</div>
        </div>`;
    }

    // ── Live updates to the today grid ─────────────────────────────────────
    // When livescore fires, patch any live matches already in the grid
    window.addEventListener('tw:live-update', ({ detail: { matches } }) => {
        if (!currentTournamentKey) return;

        const grid = document.getElementById('todaysGrid');
        if (!grid) return;

        // Update ticker
        const relevant = (matches || []).filter(m =>
            m.isLive && String(m.tournamentKey) === String(currentTournamentKey)
        );
        if (relevant.length) {
            const track = document.getElementById('tickerTrack');
            if (track) {
                const tournShort = currentTournamentName.includes(' - ')
                    ? currentTournamentName.split(' - ').pop()
                    : currentTournamentName;
                track.innerHTML = buildTickerItems(relevant, tournShort);
                duplicateTicker(track);
                stampTickerTime();
            }
        }
    });

    // ── Live status pill ────────────────────────────────────────────────────
    window.addEventListener('tw:live-status', ({ detail: { status } }) => {
        const pill = document.getElementById('liveStatusPill');
        if (!pill) return;
        pill.className = `live-status-pill live-status-${status}`;
        pill.textContent = status === 'connected' ? '● Live'
            : status === 'idle'                   ? 'No live matches'
            : '⚠ Reconnecting…';
    });

    // ── Featured-match win-probability bar (additive) ───────────────────────
    // Appends a prob bar into a dedicated container below the featured match.
    // Never interleaves the featured-match template; isolated in TW.ProbBar.
    async function mountFeaturedProbBar(featuredMatch) {
        if (typeof TW === 'undefined' || !TW.ProbBar) return;
        const host = document.getElementById('hubFeaturedMatch');
        if (!host) return;

        // Remove any stale bar from a previous refresh cycle.
        const stale = document.getElementById('hubProbBar');
        if (stale) stale.remove();

        const container = document.createElement('div');
        container.id = 'hubProbBar';
        host.appendChild(container);

        await TW.ProbBar.mount(container, { ...featuredMatch, tour: 'ATP' });
        // If nothing mounted (ineligible / unreachable), drop the empty container.
        if (!container.childNodes.length) container.remove();
    }

    // ── Load hub + today's matches ──────────────────────────────────────────
    async function loadHub() {
        const featuredEl = document.getElementById('hubFeaturedMatch');
        if (featuredEl) featuredEl.innerHTML = skeletonHTML(3);

        try {
            const data = await apiFetch('/api/hub?tour=ATP');

            renderTicker(data);

            if (!data || !data.tournament) {
                document.getElementById('hubTournamentName').textContent = 'No active tournament';
                if (featuredEl) featuredEl.innerHTML = '';
                return;
            }

            const { tournament, featuredMatch, recentResults, todaysMatches, h2h } = data;

            document.getElementById('hubTournamentName').textContent = tournament.name;
            document.getElementById('hubRoundLabel').textContent     = featuredMatch ? cleanRound(featuredMatch.round) : '—';
            document.getElementById('hubRoundSub').textContent       = featuredMatch?.isLive
                ? 'In progress · Today'
                : featuredMatch?.status === 'Not Started'
                ? 'Coming up'
                : 'Most recent';
            document.getElementById('hubH2HStats').innerHTML = renderH2H(h2h, featuredMatch);
            document.getElementById('hubFeaturedMatch').innerHTML = renderFeaturedMatch(featuredMatch, tournament.name);
            document.getElementById('hubLatestResult').innerHTML  = renderLatestResult(recentResults);

            // Render today's full match list
            renderTodaysMatches(todaysMatches || [], tournament.name);

            // ── Win-probability bar (ADDITIVE, post-primary-render) ──────────
            // Runs only AFTER the featured match is in the DOM. Fully isolated:
            // any failure (incl. /api/predict unreachable) renders nothing and
            // never disturbs the hub above.
            mountFeaturedProbBar(featuredMatch);

        } catch (err) {
            console.warn('Hub load failed:', err.message);
            const featuredEl2 = document.getElementById('hubFeaturedMatch');
            if (featuredEl2) featuredEl2.innerHTML = errorCardHTML('Could not load match data.', 'loadHub');
        }
    }

    window.loadHub = loadHub;

    // Auto-refresh hub + today's grid every 2 minutes
    loadHub();
    setInterval(loadHub, 2 * 60 * 1000);

});
