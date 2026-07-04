// ===================================
// TennisWorld — Favorites
// ===================================
// Persists starred players and tournaments to localStorage.
// Exposes TW.Favorites API used by page scripts.
//
// TW.Favorites.togglePlayer(id, name)
// TW.Favorites.toggleTournament(key, name)
// TW.Favorites.isPlayer(id)         → boolean
// TW.Favorites.isTournament(key)    → boolean
// TW.Favorites.getPlayers()         → [{ id, name }]
// TW.Favorites.getTournaments()     → [{ key, name }]
// TW.Favorites.onChange(fn)         → unsubscribe fn

window.TW = window.TW || {};

TW.Favorites = (function () {
    const STORAGE_PLAYERS     = 'tw-fav-players';
    const STORAGE_TOURNAMENTS = 'tw-fav-tournaments';
    const listeners = [];

    function load(key) {
        try { return JSON.parse(localStorage.getItem(key) || '[]'); }
        catch (_) { return []; }
    }

    function save(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
        listeners.forEach(function (fn) { fn(); });
    }

    function notify() {
        listeners.forEach(function (fn) { fn(); });
    }

    return {
        // ── Players ─────────────────────────────────────────────────────────
        getPlayers() { return load(STORAGE_PLAYERS); },

        isPlayer(id) {
            return load(STORAGE_PLAYERS).some(function (p) { return String(p.id) === String(id); });
        },

        togglePlayer(id, name) {
            let players = load(STORAGE_PLAYERS);
            const idx   = players.findIndex(function (p) { return String(p.id) === String(id); });
            if (idx === -1) {
                players.push({ id: String(id), name });
            } else {
                players.splice(idx, 1);
            }
            save(STORAGE_PLAYERS, players);
        },

        // ── Tournaments ──────────────────────────────────────────────────────
        getTournaments() { return load(STORAGE_TOURNAMENTS); },

        isTournament(key) {
            return load(STORAGE_TOURNAMENTS).some(function (t) { return t.key === key; });
        },

        toggleTournament(key, name) {
            let tournaments = load(STORAGE_TOURNAMENTS);
            const idx = tournaments.findIndex(function (t) { return t.key === key; });
            if (idx === -1) {
                tournaments.push({ key, name });
            } else {
                tournaments.splice(idx, 1);
            }
            save(STORAGE_TOURNAMENTS, tournaments);
        },

        // ── Subscriptions ────────────────────────────────────────────────────
        onChange(fn) {
            listeners.push(fn);
            return function () {
                const i = listeners.indexOf(fn);
                if (i !== -1) listeners.splice(i, 1);
            };
        },
    };
})();

// ── Star button helper ────────────────────────────────────────────────────────
// Creates an accessible star button for a player or tournament.
// Usage:
//   el.insertAdjacentHTML('beforeend', TW.starButton('player', playerId, playerName))
//   Then call TW.bindStarButtons() after inserting into DOM.

TW.starButton = function starButton(type, id, name) {
    const isFav = type === 'player' ? TW.Favorites.isPlayer(id) : TW.Favorites.isTournament(id);
    return '<button class="star-btn' + (isFav ? ' is-fav' : '') + '" ' +
        'data-fav-type="' + type + '" ' +
        'data-fav-id="' + id + '" ' +
        'data-fav-name="' + (name || '').replace(/"/g, '&quot;') + '" ' +
        'aria-label="' + (isFav ? 'Remove from' : 'Add to') + ' favorites" ' +
        'aria-pressed="' + isFav + '" ' +
        'title="' + (isFav ? 'Saved' : 'Save') + '">' +
        '<svg viewBox="0 0 24 24" fill="' + (isFav ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>' +
        '</svg>' +
        '</button>';
};

// Wire click events on all .star-btn elements inside a container (default: document)
TW.bindStarButtons = function bindStarButtons(container) {
    (container || document).querySelectorAll('.star-btn').forEach(function (btn) {
        // Avoid double-binding
        if (btn.dataset.starBound) return;
        btn.dataset.starBound = '1';

        btn.addEventListener('click', function (e) {
            e.stopPropagation(); // Don't trigger card click
            const type = btn.dataset.favType;
            const id   = btn.dataset.favId;
            const name = btn.dataset.favName;

            if (type === 'player') {
                TW.Favorites.togglePlayer(id, name);
            } else {
                TW.Favorites.toggleTournament(id, name);
            }

            const isFav = type === 'player'
                ? TW.Favorites.isPlayer(id)
                : TW.Favorites.isTournament(id);

            btn.classList.toggle('is-fav', isFav);
            btn.setAttribute('aria-pressed', String(isFav));
            btn.setAttribute('aria-label', (isFav ? 'Remove from' : 'Add to') + ' favorites');
            btn.setAttribute('title', isFav ? 'Saved' : 'Save');
            btn.querySelector('polygon').setAttribute('fill', isFav ? 'currentColor' : 'none');
        });
    });
};
