// Sprint 1 preview gate.
// Sample fixtures turn on only for the preview document, on a loopback host,
// with an explicit sample=1 query. Production hostnames never qualify.
// This module does not read storage, register a service worker, or call fetch.

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function sampleFixturesAllowed(input) {
    const hostname = String(input && input.hostname || '').trim().toLowerCase();
    if (!LOOPBACK.has(hostname)) return false;
    if (!input || input.preview !== 'sprint1') return false;
    if (input.forceProduction === true) return false;
    const params = new URLSearchParams(input.search || '');
    return params.get('sample') === '1';
}
