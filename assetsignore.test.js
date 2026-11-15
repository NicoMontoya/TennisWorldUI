import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ignore from 'ignore';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('.', import.meta.url));
const raw = readFileSync(new URL('./.assetsignore', import.meta.url), 'utf8');

// Same library Wrangler uses. Paths are relative to this repo, no leading slash.
const ig = ignore().add(raw);

function patternLines(text) {
    return text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));
}

function isIgnored(rel) {
    return ig.ignores(String(rel).replace(/^\//, ''));
}

const REQUIRED_PATTERNS = [
    '.git',
    '.gitignore',
    '.DS_Store',
    'node_modules',
    '.dev.vars',
    '.dev.vars.*',
    '.dev.vars*',
    '.env',
    '.env.*',
    '.env*',
    '*.bak',
    '*.orig',
    '*.swp',
    '*~',
    '.wrangler',
    'scripts',
    'package.json',
    'package-lock.json',
    'vitest.config.*',
    'vite.config.*',
    '*.test.js',
    '*.spec.js',
    '/scoreFormatters.js',
    '*.md',
    'ISA.md',
    '/script.js',
    '/serve.json',
    '.npmrc',
    '/_worker.js',
    '/functions',
];

const MUST_IGNORE = [
    '.dev.vars',
    '.dev.vars.production',
    '.dev.vars.example',
    '.env',
    '.env.local',
    '.env.production',
    '.env.example',
    'nested/.env.local',
    'config.bak',
    'auth.js.orig',
    'shared.js.swp',
    '.shared.js.swp',
    'notes~',
    'home.js~',
    '.wrangler/state/v3/cache.sqlite',
    'scripts/sprint1-preview.mjs',
    'scripts/nested/tool.mjs',
    'package.json',
    'package-lock.json',
    'vitest.config.js',
    'vitest.config.mjs',
    'vite.config.js',
    'vite.config.ts',
    'components/BracketPicks.test.js',
    'sprint1-shell.test.js',
    'scoreFormatters.js',
    'README.md',
    'ISA.md',
    'plans/sprint2.md',
    'script.js',
    'serve.json',
    'node_modules/vitest/package.json',
    '.git/config',
    '.gitignore',
    '.npmrc',
    'secrets/api.pem',
    'wrangler.toml',
    '_worker.js',
    'functions/api/hello.js',
    'test/helper.js',
    '__tests__/helper.js',
];

// Referenced by pages or the service worker, including paths that are not
// in this checkout (icons, screenshots) so a broad pattern cannot hide them.
const EXTRA_PUBLISH = [
    'screenshots/scores.png',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'favicon.ico',
    'apple-touch-icon.png',
    'shell/sprint1.js',
    'shell/sprint1.css',
    'sprint1.html',
    'sw.js',
    'shared.js',
    'auth.js',
    'robots.txt',
    'manifest.json',
    'favicon.svg',
];

function walk(dir, base = '') {
    const out = [];
    for (const name of readdirSync(dir)) {
        if (name === '.git' || name === 'node_modules') continue;
        const abs = join(dir, name);
        const rel = base ? `${base}/${name}` : name;
        if (statSync(abs).isDirectory()) out.push(...walk(abs, rel));
        else out.push(rel);
    }
    return out;
}

function addRef(set, url) {
    if (!url) return;
    const clean = url.split('#')[0].split('?')[0].trim();
    if (!clean || /^(?:https?:|\/\/|data:|mailto:)/i.test(clean)) return;
    const rel = clean.replace(/^\.\//, '').replace(/^\//, '');
    const base = rel.split('/').pop();
    if (!rel || !base || !base.includes('.')) return;
    set.add(rel);
}

function resolveImport(fromFile, spec) {
    const dir = fromFile.split('/').slice(0, -1);
    const stack = dir.filter(Boolean);
    for (const part of spec.split('/')) {
        if (part === '.' || part === '') continue;
        if (part === '..') stack.pop();
        else stack.push(part);
    }
    return stack.join('/');
}

function referencedAssets() {
    const refs = new Set(EXTRA_PUBLISH);
    const files = walk(root);

    for (const rel of files) {
        if (rel.startsWith('scripts/')) continue;
        if (/\.(test|spec)\.(js|mjs|cjs|ts)$/.test(rel)) continue;
        if (!rel.endsWith('.html') && !rel.endsWith('.js') && !rel.endsWith('.mjs')) continue;
        const text = readFileSync(join(root, rel), 'utf8');
        if (rel.endsWith('.html')) {
            for (const match of text.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
                addRef(refs, match[1]);
            }
        }
        for (const match of text.matchAll(/import\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
            refs.add(resolveImport(rel, match[1]));
        }
        for (const match of text.matchAll(/\bfrom\s+['"](\.[^'"]+)['"]/g)) {
            refs.add(resolveImport(rel, match[1]));
        }
    }

    const sw = readFileSync(join(root, 'sw.js'), 'utf8');
    const block = sw.match(/const SHELL_ASSETS = \[([\s\S]*?)\];/);
    if (!block) throw new Error('SHELL_ASSETS not found in sw.js');
    for (const match of block[1].matchAll(/['"]([^'"]+)['"]/g)) addRef(refs, match[1]);

    return [...refs];
}

describe('.assetsignore', () => {
    it('lists the secret and dev-only patterns', () => {
        const lines = patternLines(raw);
        for (const pattern of REQUIRED_PATTERNS) {
            expect(lines, pattern).toContain(pattern);
        }
    });

    it('ignores secrets, editor junk, scripts, package metadata, and tests', () => {
        for (const rel of MUST_IGNORE) {
            expect(isIgnored(rel), rel).toBe(true);
        }
    });

    it('still publishes every file the site loads', () => {
        const refs = referencedAssets();
        expect(refs).toContain('sprint1.html');
        expect(refs).toContain('shell/sprint1.js');
        expect(refs).toContain('shell/sprint1.css');
        expect(refs).toContain('shell/fixtures.js');
        expect(refs).toContain('shell/derive.js');
        expect(refs).toContain('vendor/chart.umd.min.js');
        expect(refs).toContain('shared.js');
        expect(refs).toContain('auth.js');
        expect(refs).toContain('sw.js');

        for (const rel of refs) {
            expect(isIgnored(rel), rel).toBe(false);
        }
    });

    it('still publishes shell, components, vendor, and app pages on disk', () => {
        for (const rel of walk(root)) {
            const rootAppJs = !rel.includes('/')
                && rel.endsWith('.js')
                && !/\.(test|spec)\./.test(rel)
                && rel !== 'script.js'
                && rel !== 'scoreFormatters.js'
                && rel !== 'vitest.config.js';
            const publish = rel.startsWith('shell/')
                || (rel.startsWith('components/') && !/\.(test|spec)\./.test(rel))
                || rel.startsWith('vendor/')
                || rel.endsWith('.html')
                || rootAppJs
                || rel === 'styles.css'
                || rel === 'sw.js'
                || rel === 'favicon.svg'
                || rel === 'manifest.json'
                || rel === 'robots.txt';
            if (!publish) continue;
            expect(isIgnored(rel), rel).toBe(false);
        }
    });
});
