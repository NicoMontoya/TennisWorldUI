// ===================================
// TennisWorld — Shared Utilities
// ===================================

// Same-origin in production (the Worker serves both UI and /api/*).
// Local dev: UI served on :3000 (or any localhost port) talks to wrangler dev on :8787;
// when the UI itself is served by wrangler dev on :8787, same-origin also works.
const API_BASE = (() => {
    const { hostname, port } = window.location;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
    if (isLocal && port !== '8787') return 'http://localhost:8787';
    return ''; // same-origin
})();

// Public GET paths that must never send Authorization (tokens in access logs).
const PUBLIC_GET_PATHS = ['/api/hub', '/api/livescore', '/api/calendar'];

// Tour allowlist — ATP|WTA only. Same contract as API parseTour.
// Never interpolate the raw stored/query value into HTML.
function parseTour(value) {
    const t = String(value == null ? '' : value).trim().toUpperCase();
    return t === 'ATP' || t === 'WTA' ? t : null;
}

function readStoredTour() {
    try {
        return parseTour(localStorage.getItem('tw-tour'));
    } catch {
        return null;
    }
}

function writeStoredTour(tour) {
    const allowed = parseTour(tour);
    if (!allowed) return null;
    try { localStorage.setItem('tw-tour', allowed); } catch { /* ignore quota */ }
    return allowed;
}

function resolveTour(queryValue) {
    return parseTour(queryValue) || readStoredTour() || 'ATP';
}

// Local calendar date → YYYY-MM-DD (never toISOString — that shifts the day).
function isoDateLocal(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function apiPathname(path) {
    return String(path || '').split('?')[0];
}

// True when this request must omit Bearer: explicit { auth: false } or a
// known-public GET (hub, livescore, calendar).
function isAnonymousPublicGet(path, options = {}) {
    if (options.auth === false) return true;
    const method = String(options.method || 'GET').toUpperCase();
    if (method !== 'GET') return false;
    return PUBLIC_GET_PATHS.includes(apiPathname(path));
}

// Normalize pathname or href to a comparable page key (index.html, scores.html).
// Treats clean URLs (/draws, /scores) the same as their .html peers.
function normalizeNavPage(pathname) {
    const raw = String(pathname || '').split('?')[0].split('#')[0];
    const parts = raw.split('/').filter(Boolean);
    let name = parts.pop() || 'index.html';
    if (!name.includes('.')) {
        return name === 'index' ? 'index.html' : `${name}.html`;
    }
    return name;
}

// ── apiFetch ───────────────────────────────────────────────────────────────────
// Returns payload on success, throws on hard error.
// Pass { auth: false } to force an anonymous request (no Authorization header).
async function apiFetch(path, options = {}) {
    const { auth, headers: optHeaders, ...fetchOpts } = options;
    const token = localStorage.getItem('tw-auth-token');
    const headers = { ...(optHeaders || {}) };
    if (token && !isAnonymousPublicGet(path, options)) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    if (fetchOpts.body) headers['Content-Type'] = 'application/json';

    const res = await fetch(`${API_BASE}${path}`, { ...fetchOpts, headers });
    if (!res.ok && res.status !== 401 && res.status !== 409) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'API error');
    return json.data;
}

// ── Loading skeleton ──────────────────────────────────────────────────────────
// Returns an HTML string of animated placeholder lines.
// Usage: el.innerHTML = skeletonHTML(3)
function skeletonHTML(lines = 4) {
    return Array.from({ length: lines }, (_, i) =>
        `<div class="skeleton-line" style="width:${70 + (i % 3) * 10}%"></div>`
    ).join('');
}

// ── Error card ────────────────────────────────────────────────────────────────
// Shows a friendly error with an optional retry button.
// onRetry: callback function invoked when the user clicks retry.
function errorCardHTML(message = 'Could not load data', onRetryId = null) {
    const retryBtn = onRetryId
        ? `<button class="error-retry-btn" onclick="${onRetryId}()">Try again</button>`
        : '';
    return `<div class="error-card" role="alert">
        <span class="error-card-icon">⚠</span>
        <span class="error-card-msg">${message}</span>
        ${retryBtn}
    </div>`;
}

// ── Stale data banner ─────────────────────────────────────────────────────────
// Shows a subtle top banner when data is served from stale cache.
function showStaleBanner(cachedAt) {
    const existing = document.getElementById('staleBanner');
    if (existing) return; // already shown

    const ago = cachedAt ? timeAgo(new Date(cachedAt)) : 'some time';
    const banner = document.createElement('div');
    banner.id = 'staleBanner';
    banner.className = 'stale-banner';
    banner.setAttribute('role', 'status');
    banner.innerHTML = `Showing cached data from ${ago} — live data unavailable.
        <button onclick="this.parentElement.remove()">✕</button>`;
    document.body.prepend(banner);
}

function timeAgo(date) {
    const secs = Math.floor((Date.now() - date) / 1000);
    if (secs < 60)   return `${secs}s ago`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    return `${Math.floor(secs / 3600)}h ago`;
}

const COUNTRY_FLAGS = {
    'Italy':'🇮🇹','Spain':'🇪🇸','Serbia':'🇷🇸','Russia':'🇷🇺',
    'Germany':'🇩🇪','Greece':'🇬🇷','Norway':'🇳🇴','Denmark':'🇩🇰',
    'USA':'🇺🇸','United States':'🇺🇸','France':'🇫🇷','Australia':'🇦🇺',
    'Great Britain':'🇬🇧','United Kingdom':'🇬🇧','Canada':'🇨🇦',
    'Argentina':'🇦🇷','Chile':'🇨🇱','Poland':'🇵🇱','Czech Republic':'🇨🇿',
    'Croatia':'🇭🇷','Switzerland':'🇨🇭','Austria':'🇦🇹','Belgium':'🇧🇪',
    'Netherlands':'🇳🇱','Japan':'🇯🇵','South Korea':'🇰🇷','China':'🇨🇳',
    'Kazakhstan':'🇰🇿','Bulgaria':'🇧🇬','Romania':'🇷🇴','Hungary':'🇭🇺',
    'Slovakia':'🇸🇰','Ukraine':'🇺🇦','Brazil':'🇧🇷','Colombia':'🇨🇴',
    'Portugal':'🇵🇹','Tunisia':'🇹🇳','South Africa':'🇿🇦','Sweden':'🇸🇪',
    'Finland':'🇫🇮','Israel':'🇮🇱','Mongolia':'🇲🇳','Taiwan':'🇹🇼',
    'Thailand':'🇹🇭','India':'🇮🇳','Slovenia':'🇸🇮','Bosnia':'🇧🇦',
    'Latvia':'🇱🇻','Lithuania':'🇱🇹','Estonia':'🇪🇪','Georgia':'🇬🇪',
};

function flag(country) {
    return COUNTRY_FLAGS[country] || '🏳';
}

// Escape user-controlled strings before interpolating into HTML.
// Prefer textContent / dataset / createElement; use this when an HTML string is unavoidable.
function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── Tennis score formatting ────────────────────────────────────────────────

// Format a single set: "6-1", or "7-6(5)" when there was a tiebreak
function formatSetScore(s) {
    if (!s) return '–';
    // New API returns strings like "6-2"; old API returns {p1, p2, tiebreak?}
    if (typeof s === 'string') return s;
    const base = `${s.p1}-${s.p2}`;
    if (s.tiebreak) {
        const loserTb = Math.min(s.tiebreak.p1, s.tiebreak.p2);
        return `${base}(${loserTb})`;
    }
    return base;
}

// Format all sets as a comma-separated string: "6-1, 7-6(3)"
function formatSetScores(setScores) {
    if (!setScores || !setScores.length) return '';
    return setScores.map(formatSetScore).join(', ');
}

// Format the current in-game point score for display.
// API returns "30 - 15"; we render "30–15".
// Handles "Deuce", "Advantage - 0", "0 - Advantage", etc.
function formatGameScore(raw) {
    if (!raw) return '';
    return raw.replace(' - ', '–');
}

// ── Service worker registration ───────────────────────────────────────────────
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
        // Unregister any stale SW first, then register the current one.
        // This one-time sweep clears the old cache-first-for-JS/CSS version.
        navigator.serviceWorker.getRegistrations().then(function (regs) {
            var unregisterAll = regs.map(function (r) { return r.unregister(); });
            return Promise.all(unregisterAll);
        }).then(function () {
            return navigator.serviceWorker.register('/sw.js');
        }).catch(function (err) {
            console.warn('SW registration failed:', err);
        });
    });
}

// ── Dark mode ─────────────────────────────────────────────────────────────────
// Applies saved preference immediately (before DOMContentLoaded) to avoid flash.
(function () {
    const saved = localStorage.getItem('tw-theme');
    if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
})();

function initMobileNav() {
    const toggle = document.getElementById('navToggle');
    const menu = document.getElementById('navMenu');
    if (!toggle || !menu) return;

    const mq = window.matchMedia('(max-width: 768px)');
    let lastFocus = null;
    let backdrop = document.getElementById('navBackdrop');
    if (!backdrop) {
        backdrop = document.createElement('button');
        backdrop.type = 'button';
        backdrop.id = 'navBackdrop';
        backdrop.className = 'nav-backdrop';
        backdrop.setAttribute('aria-label', 'Close menu');
        backdrop.hidden = true;
        document.body.appendChild(backdrop);
    }

    function isOpen() {
        return document.body.classList.contains('nav-open');
    }

    function openNav() {
        if (!mq.matches || isOpen()) return;
        lastFocus = document.activeElement;
        document.body.classList.add('nav-open');
        document.body.style.overflow = 'hidden';
        toggle.setAttribute('aria-expanded', 'true');
        backdrop.hidden = false;
        const first = menu.querySelector('a, button');
        if (first) first.focus();
    }

    function closeNav() {
        if (!isOpen()) return;
        document.body.classList.remove('nav-open');
        document.body.style.overflow = '';
        toggle.setAttribute('aria-expanded', 'false');
        backdrop.hidden = true;
        if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
        lastFocus = null;
    }

    function toggleNav() {
        if (isOpen()) closeNav();
        else openNav();
    }

    toggle.addEventListener('click', toggleNav);
    backdrop.addEventListener('click', closeNav);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen()) {
            e.preventDefault();
            closeNav();
        }
    });
    menu.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', closeNav);
    });

    const onBreakpoint = () => {
        if (!mq.matches) closeNav();
    };
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onBreakpoint);
    else if (typeof mq.addListener === 'function') mq.addListener(onBreakpoint);
}

document.addEventListener('DOMContentLoaded', () => {

    // ── Dark mode toggle ───────────────────────────────────────────────────
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            if (isDark) {
                document.documentElement.removeAttribute('data-theme');
                localStorage.setItem('tw-theme', 'light');
            } else {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('tw-theme', 'dark');
            }
            themeToggle.setAttribute('aria-pressed', String(!isDark));
        });
        // Set initial aria-pressed state
        themeToggle.setAttribute('aria-pressed',
            String(document.documentElement.getAttribute('data-theme') === 'dark'));
    }

    // ── Active nav link by page (clean URLs and .html) ─────────────────────
    const page = normalizeNavPage(window.location.pathname);
    document.querySelectorAll('.nav-link').forEach(link => {
        const href = link.getAttribute('href');
        link.classList.toggle('active', normalizeNavPage(href) === page);
    });

    // ── Mobile nav drawer (≤768px) ─────────────────────────────────────────
    initMobileNav();

    // ── Nav scroll shadow ──────────────────────────────────────────────────
    const nav = document.getElementById('mainNav');
    if (nav) {
        window.addEventListener('scroll', () => {
            nav.classList.toggle('scrolled', window.scrollY > 50);
        });
    }

    // ── Scroll reveal ──────────────────────────────────────────────────────
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry, i) => {
            if (entry.isIntersecting) {
                setTimeout(() => entry.target.classList.add('revealed'), i * 80);
                revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.08, rootMargin: '0px 0px -60px 0px' });

    document.querySelectorAll('[data-scroll-reveal]').forEach(el => revealObserver.observe(el));

    // ── Progress bar animations ────────────────────────────────────────────
    const barObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const w = entry.target.style.width;
                entry.target.style.width = '0%';
                setTimeout(() => { entry.target.style.width = w; }, 150);
                barObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });

    document.querySelectorAll('.bar-fill, .prob-fill, .progress-fill, .surface-bar-fill')
        .forEach(bar => barObserver.observe(bar));

});
