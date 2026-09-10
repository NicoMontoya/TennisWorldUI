import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const h2hSrc = readFileSync(new URL('./h2h.js', import.meta.url), 'utf8');

function loadH2H() {
    const fn = new Function(
        'module',
        'document',
        'flag',
        'parseTour',
        h2hSrc + '; return module.exports;'
    );
    return fn({ exports: {} }, {
        createElement(tag) {
            const node = {
                tagName: String(tag).toUpperCase(),
                className: '',
                hidden: false,
                textContent: '',
                href: '',
                title: '',
                type: '',
                id: '',
                style: {},
                dataset: {},
                children: [],
                setAttribute(k, v) { this.attrs = this.attrs || {}; this.attrs[k] = v; },
                appendChild(c) { this.children.push(c); return c; },
                replaceChildren(...c) { this.children = c; },
                addEventListener() {},
            };
            return node;
        },
        createTextNode(t) { return { textContent: t }; },
        addEventListener() {},
        getElementById() { return null; },
    }, (c) => c || '', (t) => {
        const x = String(t || '').toUpperCase();
        return x === 'ATP' || x === 'WTA' ? x : null;
    });
}

describe('H2H dropdown XSS P0', () => {
    it('never assigns innerHTML and never interpolates names/keys into HTML strings', () => {
        expect(h2hSrc).not.toMatch(/\.innerHTML\s*=/);
        expect(h2hSrc).not.toMatch(/insertAdjacentHTML/);
        expect(h2hSrc).not.toMatch(/data-key="\$\{/);
        expect(h2hSrc).not.toMatch(/data-name="\$\{/);
        expect(h2hSrc).not.toMatch(/innerHTML[\s\S]{0,160}\$\{p\.name\}/);
        expect(h2hSrc).not.toMatch(/innerHTML[\s\S]{0,160}\$\{playerA\.name\}/);
        expect(h2hSrc).toMatch(/createElement/);
        expect(h2hSrc).toMatch(/textContent/);
        expect(h2hSrc).toMatch(/dataset\.key/);
        expect(h2hSrc).toMatch(/function safePlayerKey/);
    });

    it('rejects markup in player keys', () => {
        const api = loadH2H();
        expect(api.safePlayerKey('47275')).toBe('47275');
        expect(api.safePlayerKey('s100284')).toBe('s100284');
        expect(api.safePlayerKey('<img src=x onerror=alert(1)>')).toBe('');
        expect(api.safePlayerKey('" onclick="alert(1)')).toBe('');
        expect(api.safePlayerKey('A/../../../etc')).toBe('');
        expect(api.safeTour('atp')).toBe('ATP');
        expect(api.safeTour('xss')).toBe('');
    });

    it('puts a malicious player name into textContent, not HTML', () => {
        const api = loadH2H();
        const dropEl = {
            hidden: false,
            children: [],
            replaceChildren() { this.children = []; },
            appendChild(c) { this.children.push(c); return c; },
            get childElementCount() { return this.children.length; },
        };
        const xssName = '<img src=x onerror=alert(1)>Djokovic';
        api.renderDropdown('djo', [{
            playerKey: '123',
            name: xssName,
            country: 'Serbia',
            rank: 1,
            tour: 'ATP',
        }], () => {}, dropEl);

        expect(dropEl.hidden).toBe(false);
        expect(dropEl.children).toHaveLength(1);
        const item = dropEl.children[0];
        expect(item.dataset.key).toBe('123');
        const nameSpan = item.children.find(c => c.className === 'h2h-drop-name');
        expect(nameSpan.textContent).toBe(xssName);
        expect(item.innerHTML).toBeUndefined();
    });
});

describe('H2H modal RivalryArc slot', () => {
    it('mounts TW.RivalryArc on #h2hRivalryArc above the scrolling history', () => {
        expect(h2hSrc).toMatch(/id = 'h2hRivalryArc'|id = "h2hRivalryArc"/);
        expect(h2hSrc).toMatch(/h2h-modal-fixed/);
        expect(h2hSrc).toMatch(/h2h-modal-scroll/);
        expect(h2hSrc).toMatch(/TW\.RivalryArc\.mount/);
        expect(h2hSrc).toMatch(/encodeURIComponent\(a\)/);
        expect(h2hSrc).toMatch(/encodeURIComponent\(b\)/);
    });
});
