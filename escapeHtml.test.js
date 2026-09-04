import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const src = readFileSync(new URL('./shared.js', import.meta.url), 'utf8');
const match = src.match(/function escapeHtml\(s\) \{[\s\S]*?\n\}/);
if (!match) throw new Error('escapeHtml not found in shared.js');
const escapeHtml = new Function('return ' + match[0])();

describe('escapeHtml', () => {
    it('escapes HTML metacharacters used in stored XSS payloads', () => {
        expect(escapeHtml('<img src=x onerror=alert(1)>'))
            .toBe('&lt;img src=x onerror=alert(1)&gt;');
        expect(escapeHtml('" onclick="alert(1)'))
            .toBe('&quot; onclick=&quot;alert(1)');
        expect(escapeHtml('Jane & Co')).toBe('Jane &amp; Co');
    });

    it('stringifies nullish values to empty', () => {
        expect(escapeHtml(null)).toBe('');
        expect(escapeHtml(undefined)).toBe('');
    });
});
