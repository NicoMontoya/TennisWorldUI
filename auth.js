// ===================================
// TennisWorld — Auth
// ===================================

(function () {
    'use strict';

    // ── State ─────────────────────────────────────────────────────────────────
    let currentUser = null;

    function getToken()  { return localStorage.getItem('tw-auth-token'); }
    function setToken(t) { if (t) localStorage.setItem('tw-auth-token', t); else localStorage.removeItem('tw-auth-token'); }
    function setUser(u)  { currentUser = u; if (u) localStorage.setItem('tw-auth-user', JSON.stringify(u)); else localStorage.removeItem('tw-auth-user'); }

    function isFavorite(playerKey) {
        return (currentUser?.favorites || []).some(f => f.playerKey === String(playerKey));
    }

    function broadcast() {
        document.dispatchEvent(new CustomEvent('tw:auth-change', { detail: { user: currentUser } }));
    }

    // ── API calls ─────────────────────────────────────────────────────────────

    async function apiPost(path, body) {
        return apiFetch(path, { method: 'POST', body: JSON.stringify(body) });
    }

    async function toggleFavorite(player) {
        if (!currentUser) { openModal('signin'); return false; }
        try {
            const data = await apiPost('/api/favorites/toggle', {
                playerKey: String(player.playerKey),
                name:      player.name    || '',
                country:   player.country || '',
                tour:      player.tour    || '',
            });
            currentUser.favorites = data.favorites;
            setUser(currentUser);
            broadcast();
            return isFavorite(player.playerKey);
        } catch (err) {
            console.warn('[TW] toggleFavorite failed:', err.message);
            return isFavorite(player.playerKey);
        }
    }

    // ── Modal ─────────────────────────────────────────────────────────────────

    function injectModal() {
        if (document.getElementById('authModal')) return;
        document.body.insertAdjacentHTML('beforeend', `
        <div id="authModal" class="auth-modal" aria-hidden="true" role="dialog" aria-modal="true">
            <div class="auth-modal-backdrop" id="authBackdrop"></div>
            <div class="auth-modal-dialog">
                <button class="auth-modal-close" id="authClose" aria-label="Close">&#x2715;</button>

                <div class="auth-tabs">
                    <button class="auth-tab active" data-tab="signin">Sign In</button>
                    <button class="auth-tab" data-tab="register">Create Account</button>
                </div>

                <!-- Sign In -->
                <form id="signinForm" class="auth-form" novalidate>
                    <h2 class="auth-title">Welcome back</h2>
                    <div class="auth-field">
                        <label for="siEmail">Email</label>
                        <input id="siEmail" type="email" autocomplete="email" placeholder="you@example.com" required>
                    </div>
                    <div class="auth-field">
                        <label for="siPassword">Password</label>
                        <input id="siPassword" type="password" autocomplete="current-password" placeholder="••••••••" required>
                    </div>
                    <p class="auth-error" id="siError"></p>
                    <button type="submit" class="auth-submit">Sign In</button>
                </form>

                <!-- Register -->
                <form id="registerForm" class="auth-form" style="display:none" novalidate>
                    <h2 class="auth-title">Create your account</h2>
                    <div class="auth-field-row">
                        <div class="auth-field">
                            <label for="regFirst">First name</label>
                            <input id="regFirst" type="text" autocomplete="given-name" placeholder="Jane" required>
                        </div>
                        <div class="auth-field">
                            <label for="regLast">Last name</label>
                            <input id="regLast" type="text" autocomplete="family-name" placeholder="Smith" required>
                        </div>
                    </div>
                    <div class="auth-field">
                        <label for="regEmail">Email</label>
                        <input id="regEmail" type="email" autocomplete="email" placeholder="you@example.com" required>
                    </div>
                    <div class="auth-field">
                        <label for="regPassword">Password <span class="auth-hint">(min 6 characters)</span></label>
                        <input id="regPassword" type="password" autocomplete="new-password" placeholder="••••••••" required>
                    </div>
                    <p class="auth-error" id="regError"></p>
                    <button type="submit" class="auth-submit">Create Account</button>
                </form>
            </div>
        </div>`);

        // Tabs
        document.querySelectorAll('.auth-tab').forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.dataset.tab));
        });

        // Close
        document.getElementById('authClose').addEventListener('click', closeModal);
        document.getElementById('authBackdrop').addEventListener('click', closeModal);
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && document.getElementById('authModal')?.getAttribute('aria-hidden') === 'false') closeModal();
        });

        // Sign in form
        document.getElementById('signinForm').addEventListener('submit', async e => {
            e.preventDefault();
            const btn = e.target.querySelector('.auth-submit');
            const errEl = document.getElementById('siError');
            errEl.textContent = '';
            btn.disabled = true;
            btn.textContent = 'Signing in…';
            try {
                const data = await apiPost('/api/auth/login', {
                    email:    document.getElementById('siEmail').value.trim(),
                    password: document.getElementById('siPassword').value,
                });
                onAuthSuccess(data);
            } catch (err) {
                errEl.textContent = err.message;
                btn.disabled = false;
                btn.textContent = 'Sign In';
            }
        });

        // Register form
        document.getElementById('registerForm').addEventListener('submit', async e => {
            e.preventDefault();
            const btn = e.target.querySelector('.auth-submit');
            const errEl = document.getElementById('regError');
            errEl.textContent = '';
            btn.disabled = true;
            btn.textContent = 'Creating account…';
            try {
                const data = await apiPost('/api/auth/register', {
                    firstName: document.getElementById('regFirst').value.trim(),
                    lastName:  document.getElementById('regLast').value.trim(),
                    email:     document.getElementById('regEmail').value.trim(),
                    password:  document.getElementById('regPassword').value,
                });
                onAuthSuccess(data);
            } catch (err) {
                errEl.textContent = err.message;
                btn.disabled = false;
                btn.textContent = 'Create Account';
            }
        });
    }

    function switchTab(tab) {
        document.querySelectorAll('.auth-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        document.getElementById('signinForm').style.display   = tab === 'signin'   ? '' : 'none';
        document.getElementById('registerForm').style.display = tab === 'register' ? '' : 'none';
    }

    function openModal(tab = 'signin') {
        injectModal();
        switchTab(tab);
        const modal = document.getElementById('authModal');
        modal.setAttribute('aria-hidden', 'false');
        modal.classList.add('open');
        document.body.style.overflow = 'hidden';
        setTimeout(() => document.getElementById(tab === 'signin' ? 'siEmail' : 'regFirst')?.focus(), 50);
    }

    function closeModal() {
        const modal = document.getElementById('authModal');
        if (!modal) return;
        modal.setAttribute('aria-hidden', 'true');
        modal.classList.remove('open');
        document.body.style.overflow = '';
    }

    // ── Auth success / sign out ───────────────────────────────────────────────

    function onAuthSuccess({ token, user }) {
        setToken(token);
        setUser(user);
        closeModal();
        updateNavButton();
        broadcast();
    }

    async function signOut() {
        try { await apiPost('/api/auth/logout', {}); } catch {}
        setToken(null);
        setUser(null);
        updateNavButton();
        broadcast();
        closeUserMenu();
    }

    // ── Nav button ────────────────────────────────────────────────────────────

    function updateNavButton() {
        const btn = document.querySelector('.nav-cta');
        if (!btn) return;

        if (currentUser) {
            const initials = (currentUser.firstName[0] + currentUser.lastName[0]).toUpperCase();
            btn.innerHTML = `
                <span class="nav-user-avatar">${initials}</span>
                <span class="nav-user-name">${currentUser.firstName}</span>
                <svg class="nav-user-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 6l4 4 4-4"/>
                </svg>`;
            btn.onclick = toggleUserMenu;
        } else {
            btn.innerHTML = '<span>Sign In</span>';
            btn.onclick = () => openModal('signin');
        }
    }

    function toggleUserMenu() {
        let menu = document.getElementById('userMenu');
        if (menu) { closeUserMenu(); return; }

        const btn = document.querySelector('.nav-cta');
        const rect = btn.getBoundingClientRect();
        menu = document.createElement('div');
        menu.id = 'userMenu';
        menu.className = 'user-menu';
        menu.innerHTML = `
            <a class="user-menu-header user-menu-profile-link" href="profile.html">
                <div class="user-menu-name">${currentUser.firstName} ${currentUser.lastName}</div>
                <div class="user-menu-email">${currentUser.email}</div>
                <div class="user-menu-view-profile">View profile →</div>
            </a>
            <hr class="user-menu-divider">
            <button class="user-menu-item" id="userMenuWatchlist">Watch List</button>
            <hr class="user-menu-divider">
            <button class="user-menu-item user-menu-signout" id="userMenuSignout">Sign Out</button>`;

        menu.style.top   = (rect.bottom + 8) + 'px';
        menu.style.right = (window.innerWidth - rect.right) + 'px';
        document.body.appendChild(menu);

        document.getElementById('userMenuSignout').addEventListener('click', signOut);
        document.getElementById('userMenuWatchlist').addEventListener('click', () => {
            closeUserMenu();
            openWatchlist();
        });

        setTimeout(() => document.addEventListener('click', closeUserMenuOutside), 0);
    }

    function closeUserMenuOutside(e) {
        const menu = document.getElementById('userMenu');
        const btn  = document.querySelector('.nav-cta');
        if (menu && !menu.contains(e.target) && !btn.contains(e.target)) closeUserMenu();
    }

    function closeUserMenu() {
        document.getElementById('userMenu')?.remove();
        document.removeEventListener('click', closeUserMenuOutside);
    }

    // ── Watchlist panel ───────────────────────────────────────────────────────

    function openWatchlist() {
        const favorites = currentUser?.favorites || [];
        let panel = document.getElementById('watchlistPanel');
        if (!panel) {
            document.body.insertAdjacentHTML('beforeend', `
            <div id="watchlistPanel" class="watchlist-panel">
                <div class="watchlist-backdrop" id="watchlistBackdrop"></div>
                <div class="watchlist-drawer">
                    <div class="watchlist-header">
                        <h2 class="watchlist-title">Watch List</h2>
                        <button class="watchlist-close" id="watchlistClose">&#x2715;</button>
                    </div>
                    <div class="watchlist-body" id="watchlistBody"></div>
                </div>
            </div>`);
            document.getElementById('watchlistClose').addEventListener('click', closeWatchlist);
            document.getElementById('watchlistBackdrop').addEventListener('click', closeWatchlist);
        }
        panel = document.getElementById('watchlistPanel');

        const body = document.getElementById('watchlistBody');
        if (!favorites.length) {
            body.innerHTML = '<p class="watchlist-empty">Star players in the Rankings or on their profile to add them here.</p>';
        } else {
            body.innerHTML = favorites.map(p => `
                <div class="watchlist-row">
                    <span class="watchlist-flag">${flag(p.country)}</span>
                    <span class="watchlist-name">${p.name}</span>
                    <span class="watchlist-tour">${p.tour}</span>
                    <button class="watchlist-remove star-btn starred" data-player-key="${p.playerKey}" aria-label="Remove from watch list">★</button>
                </div>`).join('');

            body.querySelectorAll('.watchlist-remove').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const pk = btn.dataset.playerKey;
                    const player = favorites.find(f => f.playerKey === pk);
                    if (!player) return;
                    await toggleFavorite(player);
                    openWatchlist(); // re-render
                });
            });
        }

        panel.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeWatchlist() {
        const panel = document.getElementById('watchlistPanel');
        if (!panel) return;
        panel.classList.remove('open');
        document.body.style.overflow = '';
    }

    // ── Star button helpers ───────────────────────────────────────────────────

    function starButtonHTML(playerKey) {
        const starred = isFavorite(playerKey);
        return `<button class="star-btn${starred ? ' starred' : ''}" data-player-key="${playerKey}" aria-label="${starred ? 'Remove from' : 'Add to'} watch list">${starred ? '★' : '☆'}</button>`;
    }

    function bindStarButtons(container = document) {
        container.querySelectorAll('.star-btn[data-player-key]').forEach(btn => {
            btn.replaceWith(btn.cloneNode(true)); // remove old listeners
        });
        container.querySelectorAll('.star-btn[data-player-key]').forEach(btn => {
            btn.addEventListener('click', async e => {
                e.stopPropagation();
                if (!currentUser) { openModal('signin'); return; }
                const pk = btn.dataset.playerKey;
                // Start from parent so we don't match the button itself (it also has data-player-key)
                const parent = btn.parentElement;
                const row = parent?.closest('[data-player-key]')
                         || parent?.closest('tr')
                         || btn.closest('tr')
                         || parent;
                const player = {
                    playerKey: pk,
                    name:    row?.dataset.playerName || row?.dataset.name || btn.dataset.name || '',
                    country: row?.dataset.country    || btn.dataset.country || '',
                    tour:    row?.dataset.tour       || btn.dataset.tour   || '',
                };
                const nowFavorited = await toggleFavorite(player);
                btn.classList.toggle('starred', nowFavorited);
                btn.textContent   = nowFavorited ? '★' : '☆';
                btn.setAttribute('aria-label', nowFavorited ? 'Remove from watch list' : 'Add to watch list');
            });
        });
    }

    // ── Init ──────────────────────────────────────────────────────────────────

    function init() {
        // Restore session from localStorage
        const storedUser = localStorage.getItem('tw-auth-user');
        if (storedUser && getToken()) {
            try { currentUser = JSON.parse(storedUser); } catch {}
        }

        updateNavButton();

        // Silently verify token is still valid
        if (getToken()) {
            apiFetch('/api/auth/me').then(user => {
                setUser(user);
                updateNavButton();
                broadcast();
            }).catch(() => {
                setToken(null);
                setUser(null);
                updateNavButton();
            });
        }

        // Wire the nav Sign In button
        const btn = document.querySelector('.nav-cta');
        if (btn && !currentUser) btn.addEventListener('click', () => openModal('signin'));
    }

    document.addEventListener('DOMContentLoaded', init);

    // ── Public API ────────────────────────────────────────────────────────────
    window.TW = window.TW || {};
    window.TW.auth = {
        get user()        { return currentUser; },
        get isLoggedIn()  { return !!currentUser; },
        isFavorite,
        toggleFavorite,
        openModal,
        signOut,
        starButtonHTML,
        bindStarButtons,
        updateUser(data) {
            if (!currentUser) return;
            Object.assign(currentUser, data);
            setUser(currentUser);
            updateNavButton();
            broadcast();
        },
    };

}());
