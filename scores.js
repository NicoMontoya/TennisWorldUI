// ===================================
// TennisWorld — Scores / Hub page
// ===================================
// Primary: GET /api/hub (anonymous). Livescore overlay via LiveEngine
// only while any match isLive. All API strings go through textContent
// or dataset — never concatenated into innerHTML.

document.addEventListener('DOMContentLoaded', () => {

    const HUB_INTERVAL_MS = 2 * 60 * 1000;
    let currentTournamentKey  = null;
    let currentTournamentName = '';
    let hubTimer = null;

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null && text !== '') node.textContent = text;
        return node;
    }

    function anyLive(matches) {
        return (matches || []).some(m => m && m.isLive);
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
            return;
        }

        currentTournamentKey  = data.tournament.key;
        currentTournamentName = data.tournament.name || '';
        const tournShort = currentTournamentName.includes(' - ')
            ? currentTournamentName.split(' - ').pop()
            : currentTournamentName;

        fillTickerTrack(track, data.recentResults, tournShort);
        duplicateTicker(track);
        stampTickerTime();
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

    // ── Today's Matches grid ────────────────────────────────────────────────

    function renderTodaysMatches(matches, tournamentName) {
        const section = document.getElementById('todaysSection');
        const grid    = document.getElementById('todaysGrid');
        const title   = document.getElementById('todaysTitle');
        if (!section || !grid) return;

        if (!matches || !matches.length) {
            section.hidden = true;
            grid.replaceChildren();
            return;
        }

        const shortName = tournamentName
            ? String(tournamentName).split(' - ').pop().trim()
            : 'Today';
        if (title) title.textContent = `Today at ${shortName}`;

        const groups = {};
        for (const m of matches) {
            const r = cleanRound(m.round) || m.round || 'Matches';
            if (!groups[r]) groups[r] = [];
            groups[r].push(m);
        }

        const sortedRounds = Object.keys(groups).sort((a, b) => {
            return (ROUND_ORDER[a] || 99) - (ROUND_ORDER[b] || 99);
        });

        const frag = document.createDocumentFragment();
        sortedRounds.forEach(round => {
            const group = el('div', 'tmr-group');
            group.appendChild(el('div', 'tmr-round-label', round));
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

        const row = el('div', 'tmr' + (isLive ? ' tmr-is-live' : '') + (isDone ? ' tmr-is-done' : ''));

        function playerCell(side, name, key, seed, won) {
            const cell = el('div', side);
            if (seed) cell.appendChild(el('span', 'tmr-seed', String(seed)));
            const pname = el('span', 'tmr-pname' + (won ? ' tmr-won' : '') + (isDone && !won && winner ? ' tmr-lost' : ''));
            pname.textContent = name || '—';
            if (key) {
                pname.setAttribute('data-open-player', '');
                pname.dataset.playerKey = String(key);
                pname.dataset.name = name || '';
                pname.dataset.tour = m.tour || 'ATP';
                pname.dataset.country = '';
            }
            cell.appendChild(pname);
            return cell;
        }

        row.appendChild(playerCell('tmr-p1', m.player1Name, m.player1Key, m.player1Seed, p1Won));

        const center = el('div', 'tmr-center');
        if (isDone && m.setScores?.length) {
            center.appendChild(el('span', 'tmr-score', formatSetScores(m.setScores)));
        } else if (isLive) {
            center.appendChild(el('span', 'tmr-badge tmr-badge-live', 'Live'));
        } else {
            center.appendChild(el('span', 'tmr-badge tmr-badge-soon', '—'));
        }
        row.appendChild(center);

        row.appendChild(playerCell('tmr-p2', m.player2Name, m.player2Key, m.player2Seed, p2Won));
        return row;
    }

    // ── Live updates to the today grid ─────────────────────────────────────
    window.addEventListener('tw:live-update', ({ detail: { matches } }) => {
        if (!currentTournamentKey) return;

        const relevant = (matches || []).filter(m =>
            m.isLive && String(m.tournamentKey) === String(currentTournamentKey)
        );
        if (!relevant.length) return;

        const track = document.getElementById('tickerTrack');
        if (track) {
            const tournShort = currentTournamentName.includes(' - ')
                ? currentTournamentName.split(' - ').pop()
                : currentTournamentName;
            fillTickerTrack(track, relevant, tournShort);
            duplicateTicker(track);
            stampTickerTime();
        }
    });

    window.addEventListener('tw:live-status', ({ detail: { status } }) => {
        const pill = document.getElementById('liveStatusPill');
        if (!pill) return;
        pill.className = `live-status-pill live-status-${status}`;
        pill.textContent = status === 'connected' ? '● Live'
            : status === 'idle'                   ? 'No live matches'
            : '⚠ Reconnecting…';
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

        await TW.ProbBar.mount(container, { ...featuredMatch, tour: 'ATP' });
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
            const data = await apiFetch('/api/hub?tour=ATP', { auth: false });

            renderTicker(data);

            const nameEl = document.getElementById('hubTournamentName');
            if (!data || !data.tournament) {
                if (nameEl) nameEl.textContent = 'No active tournament';
                if (featuredEl) featuredEl.replaceChildren();
                renderH2H(document.getElementById('hubH2HStats'), null, null);
                renderLatestResult(document.getElementById('hubLatestResult'), []);
                renderTodaysMatches([], '');
                return;
            }

            const { tournament, featuredMatch, recentResults, todaysMatches, h2h } = data;

            if (nameEl) nameEl.textContent = tournament.name || '';
            const roundEl = document.getElementById('hubRoundLabel');
            if (roundEl) roundEl.textContent = featuredMatch ? cleanRound(featuredMatch.round) : '—';
            const subEl = document.getElementById('hubRoundSub');
            if (subEl) {
                subEl.textContent = featuredMatch?.isLive
                    ? 'In progress · Today'
                    : featuredMatch?.status === 'Not Started'
                    ? 'Coming up'
                    : 'Most recent';
            }

            renderH2H(document.getElementById('hubH2HStats'), h2h, featuredMatch);
            renderLatestResult(document.getElementById('hubLatestResult'), recentResults);
            renderTodaysMatches(todaysMatches || [], tournament.name);

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
