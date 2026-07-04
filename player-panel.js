// ===================================
// TennisWorld — Player Profile Panel
// ===================================

(function () {
    'use strict';

    const API_BASE   = 'http://localhost:8787';
    const THIS_YEAR  = new Date().getFullYear();

    async function panelFetch(path) {
        const res  = await fetch(`${API_BASE}${path}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || 'API error');
        return json.data;
    }

    // ── DOM injection ─────────────────────────────────────────────────────────

    function ensurePanel() {
        if (document.getElementById('playerPanel')) return;
        const el = document.createElement('div');
        el.id        = 'playerPanel';
        el.className = 'player-panel';
        el.setAttribute('aria-hidden', 'true');
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.setAttribute('aria-label', 'Player profile');
        el.innerHTML = `
            <div  class="player-panel-backdrop" id="playerPanelBackdrop"></div>
            <aside class="player-panel-drawer"  id="playerPanelDrawer">
                <button class="player-panel-close" id="playerPanelClose" aria-label="Close">&#x2715;</button>
                <div class="player-panel-body" id="playerPanelBody"></div>
            </aside>`;
        document.body.appendChild(el);
        document.getElementById('playerPanelClose').addEventListener('click', closePanel);
        document.getElementById('playerPanelBackdrop').addEventListener('click', closePanel);
        document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });
    }

    function openDrawer() {
        const panel = document.getElementById('playerPanel');
        panel.setAttribute('aria-hidden', 'false');
        panel.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closePanel() {
        const panel = document.getElementById('playerPanel');
        if (!panel) return;
        panel.setAttribute('aria-hidden', 'true');
        panel.classList.remove('open');
        document.body.style.overflow = '';
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    function computeAge(birthdate) {
        if (!birthdate) return null;
        const born = new Date(birthdate);
        if (isNaN(born)) return null;
        const today = new Date();
        let age = today.getFullYear() - born.getFullYear();
        const m = today.getMonth() - born.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < born.getDate())) age--;
        return age;
    }

    function getFlag(country) {
        return (typeof flag === 'function') ? flag(country) : '🎾';
    }

    function skeletonValue() {
        return `<span class="skeleton-line pp-skel-val"></span>`;
    }

    // ── Rendering ─────────────────────────────────────────────────────────────

    function renderSeed({ name, country, rank, birthday, tour }) {
        const flagEmoji  = getFlag(country);
        const age        = computeAge(birthday);
        const tourLabel  = tour === 'WTA' ? 'WTA' : 'ATP';
        const metaParts  = [country, age ? `Age ${age}` : null].filter(Boolean);
        const rankBadge  = rank
            ? `<span class="pp-rank-pill">#${rank} ${tourLabel}</span>`
            : '';

        return `
            <div class="pp-header">
                <div class="pp-photo-row">
                    <div class="pp-photo-placeholder" id="ppPhotoWrap">${flagEmoji}</div>
                    <div class="pp-name-block">
                        <div class="pp-name-row">
                            <h2 class="pp-name" id="ppName">${name || '—'}</h2>
                            <span id="ppStarWrap"></span>
                        </div>
                        <div class="pp-meta" id="ppMeta">
                            <span id="ppMetaText">${metaParts.join('&nbsp;&middot;&nbsp;')}</span>
                            ${rankBadge}
                        </div>
                    </div>
                </div>
            </div>
            <hr class="pp-rule">
            <section class="pp-section">
                <h3 class="pp-section-label">${THIS_YEAR} Season</h3>
                <div class="pp-stats-grid" id="ppStatsGrid">
                    <div class="pp-stat">
                        <span class="pp-stat-label">Win %</span>
                        <span class="pp-stat-value">${skeletonValue()}</span>
                    </div>
                    <div class="pp-stat">
                        <span class="pp-stat-label">Record</span>
                        <span class="pp-stat-value">${skeletonValue()}</span>
                    </div>
                    <div class="pp-stat">
                        <span class="pp-stat-label">Titles</span>
                        <span class="pp-stat-value">${skeletonValue()}</span>
                    </div>
                </div>
            </section>
            <hr class="pp-rule">
            <section class="pp-section">
                <h3 class="pp-section-label">Recent Form</h3>
                <div class="pp-form-dots" id="ppForm">
                    <span class="skeleton-line" style="width:8rem;height:.625rem;border-radius:4px;display:inline-block;"></span>
                </div>
            </section>`;
    }

    function updateIdentity(playerData, seed) {
        const photoEl = document.getElementById('ppPhotoWrap');
        if (!photoEl) return;

        // Name/country/age from seed only — the /api/players endpoint uses a
        // different ID namespace than the standings API, so its name field is unreliable.
        const name      = seed.name;
        const country   = seed.country;
        const flagEmoji = getFlag(country);

        if (photoEl && playerData.logoUrl) {
            const img   = document.createElement('img');
            img.className = 'pp-photo';
            img.id        = 'ppPhotoWrap';
            img.alt       = name;
            img.src       = playerData.logoUrl;
            img.addEventListener('error', () => {
                const ph        = document.createElement('div');
                ph.className    = 'pp-photo-placeholder';
                ph.id           = 'ppPhotoWrap';
                ph.textContent  = flagEmoji;
                img.replaceWith(ph);
            });
            photoEl.replaceWith(img);
        } else if (photoEl) {
            photoEl.textContent = flagEmoji;
        }
    }

    function renderStats(stats) {
        const grid = document.getElementById('ppStatsGrid');
        if (!grid) return;
        const winLoss = (stats.wins != null && stats.losses != null)
            ? `${stats.wins}–${stats.losses}` : '—';
        const winPct  = stats.winPct  != null ? `${stats.winPct}%`    : '—';
        const titles  = stats.titles  != null ? String(stats.titles)  : '—';

        grid.innerHTML = `
            <div class="pp-stat">
                <span class="pp-stat-label">Win %</span>
                <span class="pp-stat-value">${winPct}</span>
            </div>
            <div class="pp-stat">
                <span class="pp-stat-label">Record</span>
                <span class="pp-stat-value">${winLoss}</span>
            </div>
            <div class="pp-stat">
                <span class="pp-stat-label">Titles</span>
                <span class="pp-stat-value">${titles}</span>
            </div>`;
    }

    function renderForm(form) {
        const el = document.getElementById('ppForm');
        if (!el) return;
        if (!form || !form.length) {
            el.innerHTML = '<span style="color:var(--text-muted)">—</span>';
            return;
        }
        el.innerHTML = form.map(r =>
            `<span class="form-dot form-${r === 'W' ? 'w' : 'l'}" title="${r === 'W' ? 'Win' : 'Loss'}"></span>`
        ).join('');
    }

    // ── Public API ────────────────────────────────────────────────────────────

    async function openPlayer({ playerKey, tour = 'ATP', name = '', country = '', rank = null, birthday = null }) {
        if (!playerKey) return;
        ensurePanel();

        const seed = { playerKey, tour, name, country, rank, birthday };
        document.getElementById('playerPanelBody').innerHTML = renderSeed(seed);
        openDrawer();

        // Inject star button with full player data
        const starWrap = document.getElementById('ppStarWrap');
        if (starWrap && typeof TW !== 'undefined' && TW.auth) {
            starWrap.innerHTML = `<button class="star-btn pp-star${TW.auth.isFavorite(playerKey) ? ' starred' : ''}"
                data-player-key="${playerKey}" data-name="${name}" data-country="${country}" data-tour="${tour}"
                aria-label="${TW.auth.isFavorite(playerKey) ? 'Remove from' : 'Add to'} watch list">
                ${TW.auth.isFavorite(playerKey) ? '★' : '☆'}
            </button>`;
            TW.auth.bindStarButtons(starWrap);
        }

        const [profileResult, statsResult] = await Promise.allSettled([
            panelFetch(`/api/players?playerKey=${playerKey}`),
            panelFetch(`/api/player-stats?tour=${tour}&playerKey=${playerKey}`),
        ]);

        if (profileResult.status === 'fulfilled' && profileResult.value) {
            updateIdentity(profileResult.value, seed);
        }

        if (statsResult.status === 'fulfilled' && statsResult.value) {
            renderStats(statsResult.value);
            renderForm(statsResult.value.form);
        } else {
            renderStats({});
            renderForm([]);
        }
    }

    // ── Global click delegation ───────────────────────────────────────────────
    document.addEventListener('click', e => {
        const el = e.target.closest('[data-open-player]');
        if (!el) return;
        e.preventDefault();
        const row = el.closest('[data-player-key]');
        const playerKey = row?.dataset.playerKey || el.dataset.playerKey;
        if (!playerKey) return;
        openPlayer({
            playerKey,
            tour:     row?.dataset.tour     || 'ATP',
            name:     row?.dataset.name     || el.textContent.trim(),
            country:  row?.dataset.country  || '',
            rank:     row?.dataset.rank     || null,
            birthday: row?.dataset.birthday || null,
        });
    });

    // ── Sync panel star on auth-change (e.g. toggled from rankings) ──────────
    document.addEventListener('tw:auth-change', () => {
        const btn = document.querySelector('#playerPanelDrawer .star-btn[data-player-key]');
        if (!btn || typeof TW === 'undefined' || !TW.auth) return;
        const pk      = btn.dataset.playerKey;
        const starred = TW.auth.isFavorite(pk);
        btn.classList.toggle('starred', starred);
        btn.textContent = starred ? '★' : '☆';
        btn.setAttribute('aria-label', starred ? 'Remove from watch list' : 'Add to watch list');
    });

    // ── Expose ────────────────────────────────────────────────────────────────
    window.TW            = window.TW || {};
    window.TW.openPlayer = openPlayer;
    window.TW.closePlayer = closePanel;

}());
