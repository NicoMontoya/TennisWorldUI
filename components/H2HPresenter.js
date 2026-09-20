// ===================================
// TennisWorld — H2HPresenter
// ===================================
// Shared H2H record + history for Analytics modal and Player profile.
// Mount: TW.H2HPresenter.mount(host, { data, player1, player2, surfaceFilter? })
// Names, tournaments, and scores use createElement + textContent only.
// Never interpolate API strings into innerHTML. No CDN.

(function (root) {
    'use strict';

    const SURFACES = ['all', 'hard', 'clay', 'grass'];
    const GRASS_RE = /wimbledon|queen.{0,5}club|halle|eastbourne|newport|s-hertog|birmingham/i;
    const CLAY_RE  = /roland.garros|monte.carlo|barcelona|rome\b|madrid|hamburg|munich|lyon|estoril|bucharest|istanbul|marrakech|houston|rio.open|buenos.aires|santiago|bastad|geneva|belgrade|umag|kitzbuhel|gstaad|nordea/i;

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null && text !== '') node.textContent = text;
        return node;
    }

    function sameKey(a, b) {
        return String(a == null ? '' : a) === String(b == null ? '' : b);
    }

    function flagEmoji(country) {
        return typeof flag === 'function' ? flag(country) : '';
    }

    function lastName(name) {
        const parts = String(name || '').trim().split(/\s+/);
        return parts[parts.length - 1] || '';
    }

    function safeTour(raw) {
        if (typeof parseTour === 'function') return parseTour(raw) || '';
        const t = String(raw == null ? '' : raw).trim().toUpperCase();
        return t === 'ATP' || t === 'WTA' ? t : '';
    }

    function inferSurface(match) {
        const text = (match && (match.tournamentName || '')) + ' ' + (match && (match.round || ''));
        if (GRASS_RE.test(text)) return 'grass';
        if (CLAY_RE.test(text))  return 'clay';
        return 'hard';
    }

    function getMatchSurface(match) {
        const raw = match && match.surface ? String(match.surface).toLowerCase() : inferSurface(match);
        if (raw.indexOf('clay') !== -1) return 'clay';
        if (raw.indexOf('grass') !== -1) return 'grass';
        return 'hard';
    }

    function isFinished(match) {
        if (!match) return false;
        if (!match.status) return true;
        return String(match.status).toLowerCase() === 'finished';
    }

    function finishedMeetings(data) {
        const matches = data && Array.isArray(data.h2hMatches) ? data.h2hMatches : [];
        return matches.filter(isFinished);
    }

    function normalizeSurfaceFilter(raw) {
        const s = String(raw == null ? 'all' : raw).toLowerCase();
        return SURFACES.indexOf(s) !== -1 ? s : 'all';
    }

    function didPlayer1Win(match, player1) {
        const p1IsFirst = sameKey(match.player1Key, player1 && player1.playerKey);
        const w = match && match.winner;
        const winnerIsFirst = w === 'First Player' || w === 'player1' || w === 'p1';
        return p1IsFirst ? winnerIsFirst : !winnerIsFirst;
    }

    function computeSplits(matches, player1) {
        const out = {
            all:   { a: 0, b: 0 },
            hard:  { a: 0, b: 0 },
            clay:  { a: 0, b: 0 },
            grass: { a: 0, b: 0 },
        };
        (matches || []).forEach(m => {
            const aWon = didPlayer1Win(m, player1);
            const surf = getMatchSurface(m);
            if (aWon) { out.all.a++; out[surf].a++; }
            else      { out.all.b++; out[surf].b++; }
        });
        return out;
    }

    // Winner/set formatting via shared formatSetScores (string + object rows).
    function formatMatchScore(match) {
        const scores = match && match.setScores;
        if (scores && scores.length) {
            if (typeof formatSetScores === 'function') {
                const formatted = formatSetScores(scores);
                if (formatted) return formatted;
            } else {
                const formatted = scores.map(function (s) {
                    if (s == null) return '–';
                    if (typeof s === 'string') return s;
                    const base = s.p1 + '-' + s.p2;
                    if (s.tiebreak) {
                        const loserTb = Math.min(s.tiebreak.p1, s.tiebreak.p2);
                        return base + '(' + loserTb + ')';
                    }
                    return base;
                }).join(' ');
                if (formatted) return formatted;
            }
        }
        return (match && match.finalResult) || '—';
    }

    function finiteCount(v) {
        const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
        return Number.isFinite(n) ? n : null;
    }

    function pickCount(obj, keys) {
        if (!obj || typeof obj !== 'object') return null;
        for (let i = 0; i < keys.length; i++) {
            const n = finiteCount(obj[keys[i]]);
            if (n != null) return n;
        }
        return null;
    }

    // Coverage note only when the API provides meta. Never invent totals from the match list.
    function coverageText(data) {
        if (!data || typeof data !== 'object') return '';

        const meta = data.meta && typeof data.meta === 'object' ? data.meta : null;
        const covObj = data.coverage && typeof data.coverage === 'object' ? data.coverage : null;

        const notes = [
            typeof data.coverageNote === 'string' ? data.coverageNote : null,
            typeof data.coverage === 'string' ? data.coverage : null,
            meta && typeof meta.note === 'string' ? meta.note : null,
            meta && typeof meta.coverage === 'string' ? meta.coverage : null,
            covObj && typeof covObj.note === 'string' ? covObj.note : null,
        ];
        for (let i = 0; i < notes.length; i++) {
            if (notes[i] && notes[i].trim()) return notes[i].trim();
        }

        const countKeysKv = ['kvCount', 'kvMatches', 'kv', 'archived'];
        const countKeysLive = ['liveCount', 'liveMatches', 'live'];
        const kv = pickCount(data, countKeysKv)
            || pickCount(meta, countKeysKv)
            || pickCount(covObj, countKeysKv);
        const live = pickCount(data, countKeysLive)
            || pickCount(meta, countKeysLive)
            || pickCount(covObj, countKeysLive);
        if (kv != null && live != null) return kv + ' archived · ' + live + ' live';
        return '';
    }

    function mountNamesHeader(player1, player2, overall) {
        const header = el('div', 'h2h-modal-header');
        const aFlag = flagEmoji(player1 && player1.country);
        const bFlag = flagEmoji(player2 && player2.country);
        header.appendChild(el('span', 'h2h-name-a', (aFlag + ' ' + ((player1 && player1.name) || '')).trim()));
        if (overall) {
            header.appendChild(el('span', 'h2h-overall-record', overall.a + '–' + overall.b));
        } else {
            header.appendChild(el('span', 'h2h-modal-vs', 'vs'));
        }
        header.appendChild(el('span', 'h2h-name-b', (((player2 && player2.name) || '') + ' ' + bFlag).trim()));
        return header;
    }

    function mountRecordBar(host, sp, player1, player2) {
        host.replaceChildren();
        const total  = sp.a + sp.b;
        const aWidth = total ? Math.round((sp.a / total) * 100) : 50;

        const wrap = el('div', 'h2h-bar-wrap');
        wrap.appendChild(el('span', 'h2h-bar-count h2h-bar-count-a', String(sp.a)));
        const track = el('div', 'h2h-bar-track');
        const barA = el('div', 'h2h-bar-a');
        barA.style.width = aWidth + '%';
        const barB = el('div', 'h2h-bar-b');
        barB.style.width = (100 - aWidth) + '%';
        track.appendChild(barA);
        track.appendChild(barB);
        wrap.appendChild(track);
        wrap.appendChild(el('span', 'h2h-bar-count h2h-bar-count-b', String(sp.b)));

        const labels = el('div', 'h2h-bar-labels');
        labels.appendChild(el('span', null, (player1 && player1.name) || ''));
        labels.appendChild(el('span', 'h2h-total-label', total + ' match' + (total !== 1 ? 'es' : '')));
        labels.appendChild(el('span', null, (player2 && player2.name) || ''));

        host.appendChild(wrap);
        host.appendChild(labels);
    }

    function mountSurfTabs(host, splits, active) {
        host.replaceChildren();
        SURFACES.forEach(s => {
            const cnt = s === 'all' ? splits.all.a + splits.all.b : splits[s].a + splits[s].b;
            const label = s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1);
            const btn = el('button', 'h2h-surf-tab' + (s === active ? ' active' : ''));
            btn.type = 'button';
            btn.dataset.surface = s;
            btn.appendChild(document.createTextNode(label));
            if (cnt) btn.appendChild(el('span', 'h2h-surf-count', String(cnt)));
            host.appendChild(btn);
        });
    }

    function matchRowEl(m, player1, player2) {
        const aWon  = didPlayer1Win(m, player1);
        const score = formatMatchScore(m);
        const wName = lastName(aWon ? (player1 && player1.name) : (player2 && player2.name));
        const lName = lastName(aWon ? (player2 && player2.name) : (player1 && player1.name));

        const roundClean = (m.round || '').replace(/^[^–\-]+-\s*/i, '').trim();
        const tournamentName = m.tournamentName || '—';
        const roundLabel  = roundClean && roundClean.toLowerCase() !== tournamentName.toLowerCase()
            ? ' — ' + roundClean : '';

        const year = m.date ? String(m.date).substring(0, 4) : '';
        const tour = safeTour((player1 && player1.tour) || (player2 && player2.tour)) || 'ATP';
        const dateStr = m.date
            ? new Date(m.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
            : '—';
        const surf = getMatchSurface(m);

        const row = el('div', 'h2h-match-row');
        const meta = el('div', 'h2h-match-meta');
        meta.appendChild(el('span', 'h2h-match-date', dateStr));

        const dot = el('span', 'h2h-surf-dot h2h-surf-' + surf);
        dot.title = surf.charAt(0).toUpperCase() + surf.slice(1);
        meta.appendChild(dot);

        const event = el('span', 'h2h-match-event');
        if (m.tournamentKey && m.tournamentName) {
            const link = el('a', 'h2h-tournament-link', m.tournamentName);
            const qs = new URLSearchParams();
            qs.set('tournamentKey', String(m.tournamentKey));
            qs.set('season', year);
            qs.set('name', m.tournamentName);
            qs.set('tour', tour);
            link.href = 'draws.html?' + qs.toString();
            event.appendChild(link);
        } else {
            event.appendChild(document.createTextNode(tournamentName));
        }
        if (roundLabel) event.appendChild(document.createTextNode(roundLabel));
        meta.appendChild(event);

        const result = el('div', 'h2h-match-result');
        result.appendChild(el('span', 'h2h-match-def ' + (aWon ? 'def-a' : 'def-b'), wName + ' def. ' + lName));
        result.appendChild(el('span', 'h2h-match-score', score));

        row.appendChild(meta);
        row.appendChild(result);
        return row;
    }

    function mountMatchList(host, matches, player1, player2) {
        host.replaceChildren();
        if (!matches.length) {
            host.appendChild(el('div', 'h2h-empty', 'No meetings found.'));
            return;
        }
        matches.forEach(m => host.appendChild(matchRowEl(m, player1, player2)));
    }

    function filteredSorted(finished, surface) {
        const filtered = surface === 'all'
            ? finished
            : finished.filter(m => getMatchSurface(m) === surface);
        return filtered.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    }

    function mountSkeleton(host, n) {
        host.replaceChildren();
        for (let i = 0; i < n; i++) {
            const line = el('div', 'skeleton-line');
            line.style.width = (70 + (i % 3) * 10) + '%';
            host.appendChild(line);
        }
    }

    function mountLoading(host, opts) {
        if (!host) return false;
        host.replaceChildren();
        const root = el('div', 'h2h-presenter h2h-presenter-loading');
        const p1 = opts && opts.player1;
        const p2 = opts && opts.player2;
        if (p1 && p2) root.appendChild(mountNamesHeader(p1, p2, null));
        const loading = el('div', 'h2h-loading');
        mountSkeleton(loading, 5);
        root.appendChild(loading);
        host.appendChild(root);
        return true;
    }

    function mountError(host, opts) {
        if (!host) return false;
        host.replaceChildren();
        const root = el('div', 'h2h-presenter h2h-presenter-error');
        const p1 = opts && opts.player1;
        const p2 = opts && opts.player2;
        if (p1 && p2) root.appendChild(mountNamesHeader(p1, p2, null));
        const card = el('div', 'error-card');
        card.setAttribute('role', 'alert');
        card.appendChild(el('span', 'error-card-icon', '⚠'));
        card.appendChild(el('span', 'error-card-msg', (opts && opts.message) || 'Could not load head-to-head data.'));
        if (opts && typeof opts.onRetry === 'function') {
            const btn = el('button', 'error-retry-btn', 'Try again');
            btn.type = 'button';
            btn.addEventListener('click', opts.onRetry);
            card.appendChild(btn);
        }
        root.appendChild(card);
        host.appendChild(root);
        return true;
    }

    function mountRivalryArc(slot, finished, player1, player2) {
        if (!slot) return;
        slot.replaceChildren();
        if (!finished || finished.length < 2 || !root.TW || !root.TW.RivalryArc) {
            slot.hidden = true;
            return;
        }
        const ok = root.TW.RivalryArc.mount(slot, {
            meetings: finished,
            player1Key: player1 && player1.playerKey,
            player2Key: player2 && player2.playerKey,
            player1Name: player1 && player1.name,
            player2Name: player2 && player2.name,
        });
        slot.hidden = !ok;
    }

    function paintSurface(ctx, surface) {
        const sp = ctx.splits[surface] || ctx.splits.all;
        const sorted = filteredSorted(ctx.finished, surface);
        if (ctx.tabs) mountSurfTabs(ctx.tabs, ctx.splits, surface);
        if (ctx.record) mountRecordBar(ctx.record, sp, ctx.player1, ctx.player2);
        if (ctx.list) mountMatchList(ctx.list, sorted, ctx.player1, ctx.player2);
        ctx.surface = surface;
    }

    function mount(host, opts) {
        if (!host) return false;
        opts = opts || {};
        if (opts.loading) return mountLoading(host, opts);
        if (opts.error) return mountError(host, opts);

        const player1 = opts.player1 || {};
        const player2 = opts.player2 || {};
        const data = opts.data || {};
        const finished = finishedMeetings(data);
        const splits = computeSplits(finished, player1);
        const surface = normalizeSurfaceFilter(opts.surfaceFilter);

        host.replaceChildren();
        const root = el('div', 'h2h-presenter');

        const fixed = el('div', 'h2h-modal-fixed');
        fixed.appendChild(mountNamesHeader(player1, player2, splits.all));

        const slot = el('div', 'h2h-rivalry-slot h2h-rivalry-arc');
        slot.id = 'h2hRivalryArc';
        slot.hidden = true;
        fixed.appendChild(slot);

        const surfBlock = el('div', 'h2h-surf-block');
        const tabs = el('div', 'h2h-surf-tabs');
        tabs.id = 'h2hSurfTabs';
        const record = el('div', 'h2h-record');
        record.id = 'h2hRecord';
        surfBlock.appendChild(tabs);
        surfBlock.appendChild(record);
        fixed.appendChild(surfBlock);
        root.appendChild(fixed);

        const scroll = el('div', 'h2h-modal-scroll');
        const list = el('div', 'h2h-match-list');
        list.id = 'h2hMatchList';
        scroll.appendChild(list);

        const note = coverageText(data);
        if (note) {
            scroll.appendChild(el('p', 'h2h-coverage-note', note));
        }
        root.appendChild(scroll);
        host.appendChild(root);

        const ctx = { player1, player2, finished, splits, tabs, record, list, surface };
        paintSurface(ctx, surface);
        mountRivalryArc(slot, finished, player1, player2);

        tabs.addEventListener('click', function (e) {
            const tab = e.target && e.target.closest ? e.target.closest('.h2h-surf-tab') : null;
            if (!tab) return;
            const next = normalizeSurfaceFilter(tab.dataset && tab.dataset.surface);
            paintSurface(ctx, next);
        });

        return true;
    }

    const api = {
        mount,
        mountLoading,
        mountError,
        coverageText,
        finishedMeetings,
        computeSplits,
        formatMatchScore,
        getMatchSurface,
    };

    root.TW = root.TW || {};
    root.TW.H2HPresenter = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : globalThis));
