// ===================================
// TennisWorld — Tiny reactive store
// ===================================
// Usage:
//   const store = TW.createStore({ theme: 'light', liveMatches: [] });
//   store.subscribe(state => console.log(state));
//   store.setState({ liveMatches: [...newMatches] });
//
// The shared appStore holds global UI state that multiple page scripts need.

window.TW = window.TW || {};

TW.createStore = function createStore(initial) {
    let state = Object.assign({}, initial);
    const listeners = [];

    return {
        getState() { return state; },
        setState(patch) {
            state = Object.assign({}, state, patch);
            listeners.forEach(fn => fn(state));
        },
        subscribe(fn) {
            listeners.push(fn);
            return function unsubscribe() {
                const i = listeners.indexOf(fn);
                if (i !== -1) listeners.splice(i, 1);
            };
        },
    };
};

// Shared app-level store — imported by all page scripts
TW.appStore = TW.createStore({
    theme:        localStorage.getItem('tw-theme') || 'light',
    liveMatches:  [],
    liveStatus:   'idle',   // 'connected' | 'idle' | 'error'
    lastUpdated:  null,     // Date of last live poll
});

// Keep store in sync with live engine events
window.addEventListener('tw:live-update', function (e) {
    TW.appStore.setState({
        liveMatches: e.detail.matches || [],
        lastUpdated: new Date(),
    });
});

window.addEventListener('tw:live-status', function (e) {
    TW.appStore.setState({ liveStatus: e.detail.status });
});
