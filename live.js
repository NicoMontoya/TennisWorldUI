// ===================================
// TennisWorld — Live Score Engine
// ===================================
// Polls /api/livescore on a smart interval and broadcasts updates
// via custom DOM events. Any page can subscribe without coupling.
//
// WebSocket upgrade path (when api-tennis.com Premium is available):
//   Replace startPolling() with connectWebSocket() below.
//   The rest of the pub/sub system stays identical — just swap the source.
//
// Usage (from any page script):
//   window.addEventListener('tw:live-update', e => {
//       const { matches, updatedAt } = e.detail;
//       // surgically update DOM with new match data
//   });
//   LiveEngine.start();

const LiveEngine = (() => {
    // ── Config ────────────────────────────────────────────────────────────────
    const POLL_ACTIVE   = 15_000;   // 15s when live matches exist
    const POLL_IDLE     = 60_000;   // 60s when no live matches
    const POLL_BACKOFF  = 120_000;  // 2min after consecutive errors
    const MAX_ERRORS    = 3;

    // ── State ─────────────────────────────────────────────────────────────────
    let timerId       = null;
    let errorCount    = 0;
    let lastMatches   = null;  // shallow cache to detect actual changes

    // ── Pub/sub ───────────────────────────────────────────────────────────────
    function publish(matches) {
        const updatedAt = new Date().toISOString();
        window.dispatchEvent(new CustomEvent('tw:live-update', {
            detail: { matches, updatedAt },
        }));
    }

    function publishStatus(status) {
        // 'connected' | 'disconnected' | 'idle'
        window.dispatchEvent(new CustomEvent('tw:live-status', {
            detail: { status },
        }));
    }

    // ── Polling ───────────────────────────────────────────────────────────────
    async function poll() {
        try {
            const data = await apiFetch('/api/livescore?tour=ATP');
            errorCount = 0;

            const hasLive = Array.isArray(data) && data.length > 0;

            // Only publish if data actually changed (avoid unnecessary re-renders)
            const serialized = JSON.stringify(data);
            if (serialized !== lastMatches) {
                lastMatches = serialized;
                publish(data);
            }

            publishStatus(hasLive ? 'connected' : 'idle');

            // Adaptive interval: faster when live, slower when idle
            timerId = setTimeout(poll, hasLive ? POLL_ACTIVE : POLL_IDLE);

        } catch (err) {
            errorCount++;
            console.warn(`[Live] Poll failed (${errorCount}/${MAX_ERRORS}):`, err.message);
            publishStatus('disconnected');

            // Exponential backoff on repeated failures
            const delay = errorCount >= MAX_ERRORS ? POLL_BACKOFF : POLL_IDLE;
            timerId = setTimeout(poll, delay);
        }
    }

    // ── WebSocket path (Premium plan) ─────────────────────────────────────────
    // Uncomment when api-tennis.com WebSocket endpoint is available.
    // The Premium endpoint: wss://wss.api-tennis.com/live?APIkey=...&timezone=UTC
    //
    // function connectWebSocket(apiKey) {
    //     const ws = new WebSocket(`wss://wss.api-tennis.com/live?APIkey=${apiKey}&timezone=UTC`);
    //
    //     ws.onopen    = () => publishStatus('connected');
    //     ws.onclose   = () => { publishStatus('disconnected'); setTimeout(() => connectWebSocket(apiKey), 5000); };
    //     ws.onerror   = () => publishStatus('disconnected');
    //     ws.onmessage = (event) => {
    //         try {
    //             const matches = JSON.parse(event.data);
    //             publish(matches);
    //         } catch { /* ignore malformed frames */ }
    //     };
    //
    //     return ws;
    // }

    // ── Public API ────────────────────────────────────────────────────────────
    return {
        start() {
            if (timerId) return; // already running
            poll();
        },

        stop() {
            if (timerId) {
                clearTimeout(timerId);
                timerId = null;
            }
            publishStatus('idle');
        },

        // Force an immediate refresh (e.g. when user tabs back in)
        refresh() {
            if (timerId) clearTimeout(timerId);
            timerId = null;
            poll();
        },
    };
})();

// ── Auto-start & visibility handling ─────────────────────────────────────────
// Pause polling when the tab is hidden to save requests, resume instantly on focus.
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
