// ===================================
// TennisWorld — Bracket persistence (localStorage)
// ===================================
// Save / load / rename / delete named brackets, keyed by tournament.
// Guest-friendly (no login). Storage-agnostic shape so a future server sync is
// a drop-in.
//
// Design contract (ISA ## Decisions, point 8):
//   - Persist ONLY { name, id, tournamentKey, picks, drawId, version, updatedAt }.
//     NEVER the derived draw.
//   - Key convention: tw-bracket-* (matches tw-auth-*, tw-theme, favorites).
//     Index lives at tw-bracket-index (array of saved-bracket ids per tournament).
//     Each bracket at tw-bracket-<id>. Mode preference at tw-bracket-mode-<tk>.
//   - try/catch ALL localStorage access (Safari private mode throws) → degrade to
//     an in-memory map so the UI keeps working.
//   - Exact-key delete only — never loose-prefix nuke other tw-* keys.
//   - On draw version mismatch the CALLER prunes + warns (pruneInvalid); this layer
//     just stores/returns the raw record.
// ─────────────────────────────────────────────────────────────────────────────

window.TW = window.TW || {};

(function () {
    'use strict';

    const PREFIX = 'tw-bracket-';
    const INDEX_KEY = PREFIX + 'index';
    const SCHEMA_VERSION = 1;

    // In-memory fallback when localStorage is unavailable (Safari private mode).
    const memory = {};
    let useMemory = false;

    function lsGet(key) {
        if (useMemory) return memory[key] !== undefined ? memory[key] : null;
        try {
            return window.localStorage.getItem(key);
        } catch (_) {
            useMemory = true;
            return memory[key] !== undefined ? memory[key] : null;
        }
    }

    function lsSet(key, value) {
        if (!useMemory) {
            try {
                window.localStorage.setItem(key, value);
                return true;
            } catch (_) {
                useMemory = true; // fall through to memory
            }
        }
        memory[key] = value;
        return true;
    }

    function lsRemove(key) {
        if (!useMemory) {
            try {
                window.localStorage.removeItem(key);
            } catch (_) {
                useMemory = true;
            }
        }
        delete memory[key];
    }

    function readJSON(key, fallback) {
        const raw = lsGet(key);
        if (raw == null) return fallback;
        try { return JSON.parse(raw); } catch (_) { return fallback; }
    }

    // ── Index management ───────────────────────────────────────────────────────
    // Index = array of { id, name, tournamentKey, updatedAt } (light, for listing).
    function readIndex() {
        const idx = readJSON(INDEX_KEY, []);
        return Array.isArray(idx) ? idx : [];
    }

    function writeIndex(idx) {
        lsSet(INDEX_KEY, JSON.stringify(idx));
    }

    function makeId() {
        return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    // ── Public: save ─────────────────────────────────────────────────────────
    // record: { id?, name, tournamentKey, picks, drawId }. Returns the saved record.
    function save(record) {
        if (!record || !record.tournamentKey) throw new Error('tournamentKey required');
        const id = record.id || makeId();
        const stored = {
            id: id,
            name: (record.name || 'Untitled').toString().slice(0, 120),
            tournamentKey: String(record.tournamentKey),
            picks: record.picks && typeof record.picks === 'object' ? record.picks : {},
            drawId: record.drawId != null ? String(record.drawId) : '',
            version: SCHEMA_VERSION,
            updatedAt: new Date().toISOString(),
        };
        lsSet(PREFIX + id, JSON.stringify(stored));

        const idx = readIndex().filter(function (e) { return e.id !== id; });
        idx.push({
            id: id,
            name: stored.name,
            tournamentKey: stored.tournamentKey,
            updatedAt: stored.updatedAt,
        });
        writeIndex(idx);
        return stored;
    }

    // ── Public: load one ───────────────────────────────────────────────────────
    function load(id) {
        if (!id) return null;
        return readJSON(PREFIX + id, null);
    }

    // ── Public: list (optionally filtered by tournament) ───────────────────────
    function list(tournamentKey) {
        const idx = readIndex();
        const filtered = tournamentKey
            ? idx.filter(function (e) { return String(e.tournamentKey) === String(tournamentKey); })
            : idx;
        return filtered.slice().sort(function (a, b) {
            return (b.updatedAt || '').localeCompare(a.updatedAt || '');
        });
    }

    // ── Public: rename ───────────────────────────────────────────────────────
    function rename(id, newName) {
        const rec = load(id);
        if (!rec) return false;
        rec.name = (newName || 'Untitled').toString().slice(0, 120);
        rec.updatedAt = new Date().toISOString();
        lsSet(PREFIX + id, JSON.stringify(rec));
        const idx = readIndex().map(function (e) {
            return e.id === id ? Object.assign({}, e, { name: rec.name, updatedAt: rec.updatedAt }) : e;
        });
        writeIndex(idx);
        return true;
    }

    // ── Public: delete (EXACT key, never prefix-nuke) ──────────────────────────
    function remove(id) {
        if (!id) return false;
        lsRemove(PREFIX + id);                          // exact key only
        const idx = readIndex().filter(function (e) { return e.id !== id; });
        writeIndex(idx);
        return true;
    }

    // ── Public: mode preference per tournament ─────────────────────────────────
    function getMode(tournamentKey) {
        return lsGet(PREFIX + 'mode-' + tournamentKey) || 'official';
    }
    function setMode(tournamentKey, mode) {
        lsSet(PREFIX + 'mode-' + tournamentKey, mode === 'picks' ? 'picks' : 'official');
    }

    // ── Public: working (unsaved) picks per tournament — survive reload ─────────
    // Distinct from saved named brackets; this is the in-progress scratch state.
    function getWorking(tournamentKey) {
        return readJSON(PREFIX + 'working-' + tournamentKey, { picks: {}, drawId: '' });
    }
    function setWorking(tournamentKey, picks, drawId) {
        lsSet(PREFIX + 'working-' + tournamentKey, JSON.stringify({
            picks: picks || {},
            drawId: drawId != null ? String(drawId) : '',
            updatedAt: new Date().toISOString(),
        }));
    }
    function clearWorking(tournamentKey) {
        lsRemove(PREFIX + 'working-' + tournamentKey);
    }

    function isMemoryFallback() { return useMemory; }

    TW.BracketStore = {
        PREFIX: PREFIX,
        SCHEMA_VERSION: SCHEMA_VERSION,
        save: save,
        load: load,
        list: list,
        rename: rename,
        remove: remove,
        getMode: getMode,
        setMode: setMode,
        getWorking: getWorking,
        setWorking: setWorking,
        clearWorking: clearWorking,
        isMemoryFallback: isMemoryFallback,
    };
})();
