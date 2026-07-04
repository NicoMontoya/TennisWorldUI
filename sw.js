// ===================================
// TennisWorld — Service Worker
// ===================================
// Strategy:
//   - Shell (HTML, CSS, JS, fonts): Cache-first with network fallback
//   - API requests (/api/*):        Network-first with stale-while-revalidate
//   - Everything else:              Network-first
//
// Bump CACHE_VERSION to force all clients to re-install.

const CACHE_VERSION  = 'tw-v30';
const SHELL_CACHE    = CACHE_VERSION + '-shell';
const API_CACHE      = CACHE_VERSION + '-api';

// Assets to precache on install (app shell)
const SHELL_ASSETS = [
    '/',
    '/index.html',
    '/draws.html',
    '/rankings.html',
    '/analytics.html',
    '/profile.html',
    '/styles.css',
    '/shared.js',
    '/auth.js',
    '/player-panel.js',
    '/h2h.js',
    '/profile.js',
    '/live.js',
    '/scores.js',
    '/draws.js',
    '/rankings.js',
    '/components/store.js',
    '/components/ScoreBoard.js',
    '/components/MatchCard.js',
    '/components/TournamentCard.js',
    '/components/DrawMatch.js',
    '/components/PlayerHeader.js',
    '/components/VisualBracket.js',
    '/bracketSlots.js',
    '/components/DrawBracket.js',
    '/manifest.json',
];

// ── Install: precache the shell ──────────────────────────────────────────────
self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(SHELL_CACHE).then(function (cache) {
            return cache.addAll(SHELL_ASSETS);
        }).then(function () {
            // Take control immediately; don't wait for old SW to die
            return self.skipWaiting();
        })
    );
});

// ── Activate: purge old caches ───────────────────────────────────────────────
self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(
                keys
                    .filter(function (k) { return k !== SHELL_CACHE && k !== API_CACHE; })
                    .map(function (k) { return caches.delete(k); })
            );
        }).then(function () {
            return self.clients.claim();
        })
    );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', function (event) {
    const url = new URL(event.request.url);

    // Skip non-GET and cross-origin requests
    if (event.request.method !== 'GET') return;
    if (url.origin !== self.location.origin && !url.hostname.includes('fonts.g')) return;

    // Personal/authed endpoints: bypass the SW entirely. Their responses must
    // never sit in the shared cache, and they carry an Authorization header the
    // caching path must not interfere with. Offline, they fail naturally.
    if (url.pathname.startsWith('/api/auth/') || url.pathname.startsWith('/api/favorites')) {
        return;
    }

    // API: network-first, fall back to cache
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(networkFirstWithCache(event.request, API_CACHE));
        return;
    }

    // HTML pages: network-first (always fresh, fall back to cache offline)
    if (url.pathname.endsWith('.html') || url.pathname === '/') {
        event.respondWith(networkFirstWithCache(event.request, SHELL_CACHE));
        return;
    }

    // JS and CSS: network-first so updates are always picked up immediately
    if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
        event.respondWith(networkFirstWithCache(event.request, SHELL_CACHE));
        return;
    }

    // Everything else (fonts, images, manifest): cache-first for performance
    event.respondWith(cacheFirstWithNetwork(event.request, SHELL_CACHE));
});

// ── Strategies ────────────────────────────────────────────────────────────────

/**
 * Fetch that follows redirects and strips the `redirected` flag.
 *
 * Navigation requests have redirect mode "manual", so a redirected response
 * (e.g. a dev server rewriting /draws.html → /draws) cannot be handed back to
 * the page — the browser throws "a redirected response was used for a request
 * whose redirect mode is not 'follow'". We re-fetch with redirect:"follow" and,
 * if the result was redirected, rebuild a fresh Response to clear the flag so it
 * is safe to return from a FetchEvent and to store in the cache.
 */
async function cleanFetch(request) {
    const response = await fetch(request.url, { redirect: 'follow' });
    if (!response.redirected) return response;
    const body = await response.clone().blob();
    return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
    });
}

/**
 * Cache-first: serve from cache immediately; fall back to network and update cache.
 */
async function cacheFirstWithNetwork(request, cacheName) {
    const cache  = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
}

/**
 * Network-first: try network; on failure return stale cache entry if available.
 */
async function networkFirstWithCache(request, cacheName) {
    const cache = await caches.open(cacheName);
    try {
        // cleanFetch (fetch-by-URL) is ONLY for navigations, where redirect mode
        // "manual" blocks returning redirected responses. For everything else,
        // fetch the request as-is — fetch-by-URL would drop request headers
        // (this previously stripped Authorization and broke authed GETs).
        const response = request.mode === 'navigate'
            ? await cleanFetch(request)
            : await fetch(request);
        if (!response.ok) throw new Error('Network response not ok');
        cache.put(request, response.clone());
        return response;
    } catch (_) {
        const cached = await cache.match(request);
        if (cached) return cached;
        return new Response(
            JSON.stringify({ ok: false, error: 'Offline — no cached data available.' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
    }
}

