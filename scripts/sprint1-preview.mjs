// Local-only Sprint 1 preview server.
// Binds 127.0.0.1, adds sample=1 on shell routes, and refuses /api so the
// preview cannot call the paid feed or write through to a Worker.
// Responses are no-store. This process does not touch D1, secrets, or deploys.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 4173;

const SHELL = new Set(['/', '/sprint1', '/sprint1.html', '/today', '/schedule', '/picks', '/rankings', '/me']);

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
};

export function classify(pathname) {
    const pathOnly = String(pathname || '/').split('?')[0];
    if (pathOnly === '/api' || pathOnly.startsWith('/api/')) return 'block-api';
    if (SHELL.has(pathOnly) || /^\/t\/[^/]+$/.test(pathOnly) || /^\/p\/[^/]+$/.test(pathOnly)) return 'shell';
    return 'file';
}

export function ensureSample(url) {
    const next = new URL(url, 'http://127.0.0.1');
    if (classify(next.pathname) !== 'shell') return null;
    if (next.searchParams.get('sample') === '1') return null;
    next.searchParams.set('sample', '1');
    return `${next.pathname}${next.search}`;
}

function filePath(pathname) {
    let decoded;
    try { decoded = decodeURIComponent(pathname); } catch { return null; }
    const rel = decoded.replace(/^\/+/, '');
    const full = path.resolve(ROOT, rel);
    if (full !== ROOT && !full.startsWith(ROOT + path.sep)) return null;
    return full;
}

function send(res, status, body, type) {
    res.writeHead(status, {
        'Content-Type': type,
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
    });
    res.end(body);
}

function handler(req, res) {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        send(res, 405, JSON.stringify({ ok: false, error: 'Preview server is read-only.' }), 'application/json; charset=utf-8');
        return;
    }
    const kind = classify(url.pathname);
    if (kind === 'block-api') {
        send(res, 404, JSON.stringify({ ok: false, error: 'Preview server does not call the API.' }), 'application/json; charset=utf-8');
        return;
    }
    const redirect = ensureSample(url.pathname + url.search);
    if (redirect) {
        res.writeHead(302, {
            Location: redirect,
            'Cache-Control': 'no-store',
            'X-Robots-Tag': 'noindex, nofollow',
        });
        res.end();
        return;
    }
    const target = kind === 'shell' ? path.join(ROOT, 'sprint1.html') : filePath(url.pathname);
    if (!target) {
        send(res, 400, 'Bad path', 'text/plain; charset=utf-8');
        return;
    }
    fs.readFile(target, (err, buf) => {
        if (err) {
            send(res, 404, 'Not found', 'text/plain; charset=utf-8');
            return;
        }
        const type = TYPES[path.extname(target)] || 'application/octet-stream';
        send(res, 200, req.method === 'HEAD' ? '' : buf, type);
    });
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirect) {
    const server = http.createServer(handler);
    server.listen(PORT, HOST, () => {
        console.log(`Sprint 1 sample preview: http://${HOST}:${PORT}/today?sample=1`);
        console.log('Sample data only. No API, no deploy, cache-control no-store.');
    });
}
