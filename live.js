// ===================================
// TennisWorld — Live Score Engine
// ===================================
// Polls GET /api/livescore (anonymous — no Bearer) while any match isLive.
// Tour-aware (ATP|WTA allowlist). Floor 15s; backoff 15 → 30 → 60 on errors.
// Pauses when document.hidden; one refresh on visibilitychange → visible.
// Does not poll when idle.

const LiveEngine = (() => {
    const POLL_MIN     = 15_000;
    const POLL_LIVE    = 15_000;
    const BACKOFF_CAP  = 60_000;

    let timerId     = null;
    let inFlight    = false;
    let backoffMs   = POLL_MIN;
    let lastMatches = null;
    let running     = false;
    let tour        = (typeof resolveTour === 'function' ? resolveTour() : 'ATP');

    function currentTour() {
        const allowed = typeof parseTour === 'function' ? parseTour(tour) : null;
        return allowed || 'ATP';
    }

    function publish(matches) {
        window.dispatchEvent(new CustomEvent('tw:live-update', {
            detail: { matches, updatedAt: new Date().toISOString(), tour: currentTour() },
        }));
    }

    function publishStatus(status) {
        window.dispatchEvent(new CustomEvent('tw:live-status', {
            detail: { status, tour: currentTour() },
        }));
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
            const data = await apiFetch(`/api/livescore?tour=${encodeURIComponent(t)}`, { auth: false });
            backoffMs = POLL_MIN;

            const list = Array.isArray(data) ? data : [];
            const hasLive = list.some(m => m && m.isLive);

            const serialized = JSON.stringify(data);
            if (serialized !== lastMatches) {
                lastMatches = serialized;
                publish(list);
            }

            publishStatus(hasLive ? 'connected' : 'idle');

            if (hasLive && !document.hidden && running) {
                schedule(POLL_LIVE);
            } else {
                clearTimer();
                running = hasLive ? running : false;
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
            if (timerId || inFlight) return;
            poll();
        },

        stop() {
            running = false;
            clearTimer();
        },

        refresh() {
            if (document.hidden) return;
            running = true;
            clearTimer();
            poll();
        },

        setTour(next) {
            const allowed = typeof parseTour === 'function' ? parseTour(next) : null;
            const t = allowed || 'ATP';
            if (t === tour) return;
            tour = t;
            lastMatches = null;
            if (running && !document.hidden) {
                clearTimer();
                poll();
            }
        },

        getTour() {
            return currentTour();
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
