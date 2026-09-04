// ===================================
// TennisWorld — Profile Page
// ===================================

(function () {
    'use strict';

    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    function formatDate(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    }

    function initials(first, last) {
        return ((first?.[0] || '') + (last?.[0] || '')).toUpperCase();
    }

    // ── Render profile data ───────────────────────────────────────────────────

    function renderProfile(user) {
        document.getElementById('profileLoading').style.display  = 'none';
        document.getElementById('profileUnauth').style.display   = 'none';
        document.getElementById('profileContent').style.display  = 'block';

        const init = initials(user.firstName, user.lastName);
        document.getElementById('profileAvatar').textContent     = init;
        document.getElementById('profileName').textContent       = `${user.firstName} ${user.lastName}`;
        document.getElementById('profileEmailDisplay').textContent = user.email;
        document.getElementById('profileSince').textContent      = user.createdAt
            ? `Member since ${formatDate(user.createdAt)}`
            : '';

        // Details view
        document.getElementById('viewFirst').textContent  = user.firstName;
        document.getElementById('viewLast').textContent   = user.lastName;
        document.getElementById('viewEmail').textContent  = user.email;

        // Edit form defaults
        document.getElementById('editFirst').value        = user.firstName;
        document.getElementById('editLast').value         = user.lastName;
        document.getElementById('editEmailDisplay').textContent = user.email;

        renderWatchlist(user.favorites || []);
        loadMyBrackets();
    }

    // ── My Brackets (account-saved, scored server-side) ──────────────────────
    let bracketsLoaded = false;
    function loadMyBrackets() {
        if (bracketsLoaded) return;
        bracketsLoaded = true;
        const wrap = document.getElementById('profileBrackets');
        const count = document.getElementById('myBracketsCount');
        if (!wrap) return;
        wrap.innerHTML = '<p class="profile-watchlist-empty">Loading…</p>';
        apiFetch('/api/bracket/mine').then(data => {
            const brackets = (data && data.brackets) || [];
            count.textContent = brackets.length
                ? `${brackets.length} bracket${brackets.length !== 1 ? 's' : ''}` : '';
            if (!brackets.length) {
                wrap.innerHTML = '<p class="profile-watchlist-empty">' +
                    'No brackets yet — open a tournament draw, switch to My Picks, and Save to My Account.</p>';
                return;
            }
            wrap.innerHTML = brackets.map(b => {
                const href = `draws.html?tournamentKey=${encodeURIComponent(b.tournamentKey)}` +
                    `&season=${encodeURIComponent(b.season || '')}` +
                    `&name=${encodeURIComponent(b.tournamentName || '')}` +
                    `&tour=${encodeURIComponent(b.tour || 'ATP')}`;
                const acc = b.accuracy == null ? '' : ` · ${b.accuracy}% accurate`;
                return `<a class="profile-bracket-row" href="${href}">
                    <span class="profile-bracket-name">${escapeHtml(b.tournamentName || b.tournamentKey)}</span>
                    <span class="profile-bracket-meta">${b.score ?? 0} pts · max ${b.maxPossible ?? 0}${acc} · ${b.picksTotal ?? 0} picks</span>
                </a>`;
            }).join('');
        }).catch(() => {
            wrap.innerHTML = '<p class="profile-watchlist-empty">Could not load your brackets.</p>';
        });
    }

    function renderWatchlist(favorites) {
        const wrap  = document.getElementById('profileWatchlist');
        const count = document.getElementById('watchlistCount');
        count.textContent = favorites.length ? `${favorites.length} player${favorites.length !== 1 ? 's' : ''}` : '';

        wrap.replaceChildren();
        if (!favorites.length) {
            const empty = document.createElement('p');
            empty.className = 'profile-watchlist-empty';
            empty.textContent = 'Star players in Rankings or on their profile to add them here.';
            wrap.appendChild(empty);
            return;
        }

        favorites.forEach(p => {
            const row = document.createElement('div');
            row.className = 'profile-watchlist-row';
            row.dataset.playerKey = String(p.playerKey ?? '');
            row.dataset.tour = p.tour || '';
            row.dataset.name = p.name || '';
            row.dataset.country = p.country || '';

            const flagEl = document.createElement('span');
            flagEl.className = 'watchlist-flag';
            flagEl.textContent = typeof flag === 'function' ? flag(p.country) : '';
            row.appendChild(flagEl);

            const nameEl = document.createElement('span');
            nameEl.className = 'profile-watchlist-name';
            nameEl.setAttribute('data-open-player', '');
            nameEl.textContent = p.name || '';
            row.appendChild(nameEl);

            const tourEl = document.createElement('span');
            tourEl.className = 'profile-watchlist-tour';
            tourEl.textContent = p.tour || '';
            row.appendChild(tourEl);

            const btn = document.createElement('button');
            btn.className = 'star-btn starred';
            btn.dataset.playerKey = String(p.playerKey ?? '');
            btn.dataset.name = p.name || '';
            btn.dataset.country = p.country || '';
            btn.dataset.tour = p.tour || '';
            btn.setAttribute('aria-label', 'Remove from watch list');
            btn.textContent = '★';
            row.appendChild(btn);

            wrap.appendChild(row);
        });

        if (typeof TW !== 'undefined' && TW.auth) {
            TW.auth.bindStarButtons(wrap);
        }
    }

    // ── Details edit ──────────────────────────────────────────────────────────

    function bindDetailsCard() {
        const editBtn    = document.getElementById('detailsEditBtn');
        const cancelBtn  = document.getElementById('detailsCancelBtn');
        const form       = document.getElementById('detailsForm');
        const view       = document.getElementById('detailsView');
        const errEl      = document.getElementById('detailsError');
        const saveBtn    = document.getElementById('detailsSaveBtn');

        editBtn.addEventListener('click', () => {
            view.style.display  = 'none';
            form.style.display  = 'block';
            editBtn.style.display = 'none';
            document.getElementById('editFirst').focus();
        });

        cancelBtn.addEventListener('click', () => {
            form.style.display  = 'block'; // reset done on next edit
            resetDetailsView();
        });

        form.addEventListener('submit', async e => {
            e.preventDefault();
            errEl.textContent = '';
            const firstName = document.getElementById('editFirst').value.trim();
            const lastName  = document.getElementById('editLast').value.trim();
            if (!firstName || !lastName) { errEl.textContent = 'Both name fields are required.'; return; }

            saveBtn.disabled    = true;
            saveBtn.textContent = 'Saving…';
            try {
                const updated = await apiFetch('/api/auth/update-profile', {
                    method: 'POST',
                    body: JSON.stringify({ firstName, lastName }),
                });
                // Sync auth state (also updates nav avatar initials)
                if (typeof TW !== 'undefined' && TW.auth) TW.auth.updateUser(updated);
                renderProfile(updated);
                resetDetailsView();
            } catch (err) {
                errEl.textContent = err.message;
            } finally {
                saveBtn.disabled    = false;
                saveBtn.textContent = 'Save Changes';
            }
        });
    }

    function resetDetailsView() {
        document.getElementById('detailsView').style.display  = 'block';
        document.getElementById('detailsForm').style.display  = 'none';
        document.getElementById('detailsEditBtn').style.display = '';
        document.getElementById('detailsError').textContent  = '';
    }

    // ── Password change ───────────────────────────────────────────────────────

    function bindPasswordCard() {
        const toggleBtn  = document.getElementById('passwordToggleBtn');
        const cancelBtn  = document.getElementById('passwordCancelBtn');
        const form       = document.getElementById('passwordForm');
        const hint       = document.getElementById('passwordHint');
        const errEl      = document.getElementById('passwordError');
        const saveBtn    = document.getElementById('passwordSaveBtn');

        toggleBtn.addEventListener('click', () => {
            const open = form.style.display !== 'none';
            form.style.display  = open ? 'none' : 'block';
            hint.style.display  = open ? '' : 'none';
            toggleBtn.textContent = open ? 'Change' : 'Cancel';
            if (!open) document.getElementById('pwCurrent').focus();
        });

        cancelBtn.addEventListener('click', () => resetPasswordForm());

        form.addEventListener('submit', async e => {
            e.preventDefault();
            errEl.textContent = '';
            const current = document.getElementById('pwCurrent').value;
            const next    = document.getElementById('pwNew').value;
            const confirm = document.getElementById('pwConfirm').value;

            if (next !== confirm) { errEl.textContent = 'New passwords do not match.'; return; }
            if (next.length < 6)  { errEl.textContent = 'Password must be at least 6 characters.'; return; }

            saveBtn.disabled    = true;
            saveBtn.textContent = 'Updating…';
            try {
                await apiFetch('/api/auth/change-password', {
                    method: 'POST',
                    body: JSON.stringify({ currentPassword: current, newPassword: next }),
                });
                resetPasswordForm();
                showBanner('Password updated successfully.');
            } catch (err) {
                errEl.textContent = err.message;
            } finally {
                saveBtn.disabled    = false;
                saveBtn.textContent = 'Update Password';
            }
        });
    }

    function resetPasswordForm() {
        const form      = document.getElementById('passwordForm');
        const hint      = document.getElementById('passwordHint');
        const toggleBtn = document.getElementById('passwordToggleBtn');
        form.reset();
        form.style.display     = 'none';
        hint.style.display     = '';
        toggleBtn.textContent  = 'Change';
        document.getElementById('passwordError').textContent = '';
    }

    // ── Success banner ────────────────────────────────────────────────────────

    function showBanner(message) {
        const el = document.createElement('div');
        el.className   = 'profile-banner';
        el.textContent = message;
        document.getElementById('profileContent').prepend(el);
        setTimeout(() => el.remove(), 3500);
    }

    // ── Sign out ──────────────────────────────────────────────────────────────

    function bindSignOut() {
        document.getElementById('profileSignoutBtn')?.addEventListener('click', async () => {
            if (typeof TW !== 'undefined' && TW.auth) {
                await TW.auth.signOut();
            }
            window.location.href = 'index.html';
        });
        document.getElementById('profileSigninBtn')?.addEventListener('click', () => {
            if (typeof TW !== 'undefined' && TW.auth) TW.auth.openModal('signin');
        });
    }

    // ── Auth change listener (re-render watchlist on star changes) ────────────

    document.addEventListener('tw:auth-change', e => {
        const user = e.detail?.user;
        if (!user) {
            // Signed out from another panel
            window.location.href = 'index.html';
            return;
        }
        const content = document.getElementById('profileContent');
        if (content && content.style.display !== 'none') {
            renderWatchlist(user.favorites || []);
        } else {
            // Signed in from the unauthenticated profile gate
            renderProfile(user);
        }
    });

    // ── Init ──────────────────────────────────────────────────────────────────

    function init() {
        bindDetailsCard();
        bindPasswordCard();
        bindSignOut();

        const stored = localStorage.getItem('tw-auth-user');
        const token  = localStorage.getItem('tw-auth-token');

        if (!stored || !token) {
            document.getElementById('profileLoading').style.display = 'none';
            document.getElementById('profileUnauth').style.display  = 'block';
            return;
        }

        try {
            renderProfile(JSON.parse(stored));
        } catch {}

        // Verify session is still valid and get fresh data
        apiFetch('/api/auth/me').then(user => {
            renderProfile(user);
        }).catch(() => {
            localStorage.removeItem('tw-auth-token');
            localStorage.removeItem('tw-auth-user');
            document.getElementById('profileContent').style.display = 'none';
            document.getElementById('profileUnauth').style.display  = 'block';
        });
    }

    document.addEventListener('DOMContentLoaded', init);

}());
