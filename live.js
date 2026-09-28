// ===================================
// TennisWorld — Live Score Engine
// ===================================
// Polls GET /api/livescore (anonymous — no Bearer).
// Tour-aware (ATP|WTA allowlist). Floor 30s; backoff 30 → 60 on errors.
// Idle-stops only after EMPTY_IDLE_STREAK consecutive polls with no live
// rows — a single empty response must not kill the overlay. A Scores hub
// reload must not call refresh() after an empty livescore response unless
// the hub has a live or in-progress match, or the user switches tours.
// Pauses when document.hidden. visibilitychange → visible calls refresh(),
// which fetches immediately and then resumes the 30s cadence. It does not
// wait out a tick that was cleared while the tab was hidden.

const LiveEngine = (() => {
    const POLL_MIN           = 30_000;
    const POLL_LIVE          = 30_000;
    const BACKOFF_CAP        = 60_000;
    const EMPTY_IDLE_STREAK  = 4;

    let timerId      = null;
    let inFlight     = false;
    let backoffMs    = POLL_MIN;
    let lastMatches  = null;
    let lastLiveList = null;
    let emptyStreak  = 0;
    let running      = false;
    // null until the first successful poll. False once a response has no
    // live rows — including before the idle streak finishes — so a hub
    // reload can avoid resetting that streak.
    let lastHadLive = null;
    let tour         = (typeof resolveTour === 'function' ? resolveTour() : 'ATP');

    function currentTour() {
        const allowed = typeof parseTour === 'function' ? parseTour(tour) : null;
        return allowed || 'ATP';
    }

    function publish(matches, updatedAt, fetchedAt) {
        window.dispatchEvent(new CustomEvent('tw:live-update', {
            detail: {
                matches,
                updatedAt,
                fetchedAt: fetchedAt || null,
                matchCount: Array.isArray(matches) ? matches.length : 0,
                tour: currentTour(),
            },
        }));
    }

    function publishStatus(status, updatedAt, fetchedAt, matchCount) {
        const detail = { status, tour: currentTour() };
        if (updatedAt) detail.updatedAt = updatedAt;
        if (arguments.length > 2) detail.fetchedAt = fetchedAt || null;
        if (arguments.length > 3) detail.matchCount = matchCount;
        window.dispatchEvent(new CustomEvent('tw:live-status', { detail }));
    }

    function clearTimer() {
        if (timerId) {
            clearTimeout(timerId);
            timerId = null;
        }
    }

    function schedule(ms) {
        clearTimer();
        const delay = Math.max(POLL_MIN, ms);
        timerId = setTimeout(poll, delay);
    }

    async function poll() {
        if (document.hidden) {
            clearTimer();
            return;
        }
        if (inFlight) return;
        inFlight = true;
        try {
            const t = currentTour();
            const fetched = await apiFetch(`/api/livescore?tour=${encodeURIComponent(t)}`, {
                auth: false,
                includeResponse: true,
            });
            backoffMs = POLL_MIN;

            // Body stays a bare match array. Upstream time is only the
            // X-Fetched-At response header — never a payload field, and never
            // the client clock (that is updatedAt, for "Updated Ns ago").
            const data = fetched && Object.prototype.hasOwnProperty.call(fetched, 'response')
                ? fetched.data
                : fetched;
            const response = fetched && fetched.response;
            const headerValue = response && response.headers && typeof response.headers.get === 'function'
                ? response.headers.get('X-Fetched-At')
                : null;
            const list = Array.isArray(data) ? data : [];
            const fetchedAt = typeof readLivescoreFetchedAt === 'function'
                ? readLivescoreFetchedAt(headerValue)
                : null;
            const hasLive = list.some(m => m && m.isLive);
            lastHadLive = hasLive;

            if (hasLive) {
                emptyStreak = 0;
                lastLiveList = list;
            } else {
                emptyStreak += 1;
                if (emptyStreak >= EMPTY_IDLE_STREAK) lastLiveList = [];
            }

            const updatedAt = new Date().toISOString();
            const serialized = JSON.stringify(data);
            if (serialized !== lastMatches) {
                lastMatches = serialized;
                publish(list, updatedAt, fetchedAt);
            }

            const overlayLive = Array.isArray(lastLiveList) && lastLiveList.some(m => m && m.isLive);
            // Every successful fetch carries updatedAt, even when the payload
            // is unchanged, so "Updated Ns ago" tracks the real last fetch.
            // fetchedAt is X-Fetched-At, or null when that header is missing or unusable.
            // matchCount is this response's array length; an empty list wins
            // over a stale or 1970 header and keeps the normal empty state.
            publishStatus(hasLive || overlayLive ? 'connected' : 'idle', updatedAt, fetchedAt, list.length);

            const keepPolling = running && !document.hidden && (hasLive || emptyStreak < EMPTY_IDLE_STREAK);
            if (keepPolling) {
                schedule(POLL_LIVE);
            } else {
                clearTimer();
                if (!hasLive) running = false;
            }
        } catch (err) {
            console.warn('[Live] Poll failed:', err.message);
            publishStatus('disconnected');
            if (!document.hidden && running) schedule(backoffMs);
            backoffMs = Math.min(backoffMs * 2, BACKOFF_CAP);
        } finally {
            inFlight = false;
        }
    }

    return {
        start() {
            running = true;
            emptyStreak = 0;
            if (timerId || inFlight) return;
            poll();
        },

        stop() {
            running = false;
            clearTimer();
        },

        // Drop any pending tick and fetch now. The next poll is scheduled
        // POLL_LIVE after this request succeeds.
        refresh() {
            if (document.hidden) return;
            running = true;
            emptyStreak = 0;
            clearTimer();
            poll();
        },

        // True while a livescore request is in flight or a tick is queued.
        // Hub reloads use this so they don't cancel the 30s cadence.
        isPolling() {
            return !!(running && (timerId || inFlight));
        },

        setTour(next) {
            const allowed = typeof parseTour === 'function' ? parseTour(next) : null;
            const t = allowed || 'ATP';
            if (t === tour) return;
            tour = t;
            lastMatches = null;
            lastLiveList = null;
            emptyStreak = 0;
            if (running && !document.hidden) {
                clearTimer();
                poll();
            }
        },

        getTour() {
            return currentTour();
        },

        // Last livescore list that still had live rows, or [] after a
        // confirmed empty streak. null until the first successful poll.
        getLastMatches() {
            return lastLiveList;
        },

        // Whether the most recent successful livescore response contained
        // a live row. null until that first response.
        lastResponseHadLive() {
            return lastHadLive;
        },
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    LiveEngine.start();

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            LiveEngine.stop();
        } else {
            LiveEngine.refresh();
        }
    });
});
