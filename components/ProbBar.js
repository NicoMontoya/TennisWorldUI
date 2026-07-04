// ===================================
// TennisWorld — ProbBar component (win-probability display)
// ===================================
// A single reusable renderer for win-probability bars, shared by the hub and
// draws (NOT copy-pasted per page). Exposes everything under TW.ProbBar.
//
// Design contract (per ISA.md ## Decisions, point 5):
//   - ADDITIVE DOM ONLY. We never touch existing templates. The hub/draws pages
//     render exactly as before; prob bars are appended into a dedicated
//     container AFTER the primary render, each fetch wrapped in try/catch.
//   - If /api/predict is unreachable, NOTHING renders (graceful absence).
//   - Never shown for Finished / walkover / retirement / TBD matches.
//   - Accessible: aria-label carries both percentages; percentages are shown as
//     text (not color-only). Tooltip (title) carries drivers + modelVersion.
//   - Disclaimer "For entertainment purposes" is always visible with the bar.
//   - Entertainment framing only; no financial-speculation language anywhere.

window.TW = window.TW || {};

(function () {
    'use strict';

    const DISCLAIMER = 'For entertainment purposes';

    // ── Eligibility: should this match get a prediction at all? ───────────────
    // Guards ISC-19/20/21: no prob for finished, walkover/retirement, or TBD.
    function isEligible(match) {
        if (!match) return false;
        const key1 = match.player1Key;
        const key2 = match.player2Key;
        // Both players must be known (real keys, not TBD / empty / "null").
        if (!key1 || !key2) return false;
        if (key1 === 'null' || key2 === 'null' || key1 === 'undefined' || key2 === 'undefined') return false;
        const name1 = (match.player1Name || '').trim();
        const name2 = (match.player2Name || '').trim();
        if (!name1 || !name2 || /tbd|qualifier|bye/i.test(name1) || /tbd|qualifier|bye/i.test(name2)) return false;

        // Never on a decided/finished match — that's a factual result, not a prediction.
        if (match.status === 'Finished') return false;
        if (match.winner) return false;
        if (match.isLive) return false; // MVP is pre-match only

        // Walkover / retirement signals → factual outcome only.
        const result = `${match.finalResult || ''} ${match.statusNote || ''}`.toLowerCase();
        if (/w\/o|walkover|ret\.?|retired|def\.?|abandoned/.test(result)) return false;

        return true;
    }

    // Last name helper for compact labels.
    function lastName(name) {
        if (!name) return '';
        const parts = name.trim().split(/\s+/);
        return parts[parts.length - 1];
    }

    // ── Build the bar element from a prediction payload ───────────────────────
    // pred = { probA, probB, confidence, drivers, modelVersion, partial }
    // names = { a, b } display names (A = player1, B = player2).
    function buildBar(pred, names) {
        if (!pred || typeof pred.probA !== 'number' || typeof pred.probB !== 'number') return null;

        const pctA = Math.round(pred.probA * 100);
        const pctB = Math.round(pred.probB * 100);
        const aFav = pctA >= pctB;
        const nameA = names.a || 'Player A';
        const nameB = names.b || 'Player B';

        const drivers = Array.isArray(pred.drivers) ? pred.drivers : [];
        const tooltip = [
            drivers.length ? 'Why: ' + drivers.join('; ') : 'Model estimate',
            'Model ' + (pred.modelVersion || '') + (pred.confidence ? ' · confidence: ' + pred.confidence : ''),
            pred.partial ? '(limited data)' : '',
        ].filter(Boolean).join(' — ');

        const wrap = document.createElement('div');
        wrap.className = 'probbar';
        wrap.setAttribute('role', 'img');
        wrap.setAttribute('title', tooltip);
        wrap.setAttribute(
            'aria-label',
            `Win probability — ${nameA} ${pctA} percent, ${nameB} ${pctB} percent. ${DISCLAIMER}.`
        );

        // Numeric row (text percentages, favorite emphasized) — not color-only.
        const labels = document.createElement('div');
        labels.className = 'probbar-labels';
        labels.innerHTML =
            `<span class="probbar-name${aFav ? ' probbar-fav' : ''}">${lastName(nameA)} ${pctA}%</span>` +
            `<span class="probbar-name${!aFav ? ' probbar-fav' : ''}">${pctB}% ${lastName(nameB)}</span>`;

        // The bar itself.
        const track = document.createElement('div');
        track.className = 'probbar-track';
        const fillA = document.createElement('div');
        fillA.className = 'probbar-fill probbar-fill-a' + (aFav ? ' probbar-fill-fav' : '');
        fillA.style.width = pctA + '%';
        const fillB = document.createElement('div');
        fillB.className = 'probbar-fill probbar-fill-b' + (!aFav ? ' probbar-fill-fav' : '');
        fillB.style.width = pctB + '%';
        track.appendChild(fillA);
        track.appendChild(fillB);

        // Visible disclaimer + drivers summary.
        const foot = document.createElement('div');
        foot.className = 'probbar-foot';
        const why = drivers.length ? `<span class="probbar-why">${drivers[0]}</span>` : '';
        foot.innerHTML = `${why}<span class="probbar-disclaimer">${DISCLAIMER}</span>`;

        wrap.appendChild(labels);
        wrap.appendChild(track);
        wrap.appendChild(foot);
        return wrap;
    }

    // ── Fetch a single prediction (returns null on any failure) ───────────────
    // Memoized per pair+tour+surface for the page's lifetime so re-renders
    // (live poller, mode toggles) never refetch; failures are not memoized.
    const predMemo = new Map();

    async function fetchPrediction(match, opts) {
        const tour    = (opts && opts.tour) || match.tour || 'ATP';
        const surface = (opts && opts.surface) || match.surface || '';
        const round   = match.round || '';
        const memoKey = [match.player1Key, match.player2Key, tour, surface].join('|');
        if (predMemo.has(memoKey)) return predMemo.get(memoKey);
        const qs = new URLSearchParams({
            playerKeyA: match.player1Key,
            playerKeyB: match.player2Key,
            tour,
        });
        if (surface) qs.set('surface', surface);
        if (round)   qs.set('round', round);
        // apiFetch throws on error → caller's try/catch swallows it (graceful absence).
        const p = apiFetch('/api/predict?' + qs.toString()).catch(err => {
            predMemo.delete(memoKey);
            throw err;
        });
        predMemo.set(memoKey, p);
        return p;
    }

    // ── Mount a prob bar into a dedicated container (additive) ────────────────
    // containerEl: an empty element appended AFTER the match's primary render.
    // Renders nothing on ineligibility or any fetch/parse failure.
    async function mount(containerEl, match, opts) {
        if (!containerEl || !isEligible(match)) return false;
        try {
            const pred = await fetchPrediction(match, opts);
            const bar  = buildBar(pred, { a: match.player1Name, b: match.player2Name });
            if (!bar) return false;
            containerEl.appendChild(bar);
            return true;
        } catch (_) {
            // /api/predict unreachable or bad shape → render nothing.
            return false;
        }
    }

    // ── Mount prob bars across many rows, with a concurrency cap ───────────────
    // Avoids N-calls-per-draw stampede (advisor point 6): caps in-flight requests.
    // rows: [{ container, match }]. opts.concurrency default 4.
    async function mountAll(rows, opts) {
        const list = (rows || []).filter(r => r && r.container && isEligible(r.match));
        if (!list.length) return;
        const cap = (opts && opts.concurrency) || 4;
        let i = 0;
        async function worker() {
            while (i < list.length) {
                const idx = i++;
                const r = list[idx];
                await mount(r.container, r.match, opts);
            }
        }
        const workers = Array.from({ length: Math.min(cap, list.length) }, worker);
        await Promise.all(workers);
    }

    TW.ProbBar = { isEligible, buildBar, mount, mountAll, fetchPrediction };
})();
