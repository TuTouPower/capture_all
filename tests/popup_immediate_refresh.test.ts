// @vitest-environment jsdom
// tests/popup_immediate_refresh.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const src = fs.readFileSync(path.join(__dirname, '../src/popup/popup.ts'), 'utf-8');

describe('popup immediate refresh on capturing state (BUG-012)', () => {
    it('start_timer calls refresh_counts before setInterval', () => {
        const fn_start = src.indexOf('function start_timer(): void {');
        expect(fn_start).toBeGreaterThan(-1);
        let depth = 0;
        let fn_end = fn_start;
        for (let i = fn_start; i < src.length; i++) {
            if (src[i] === '{') depth++;
            if (src[i] === '}') { depth--; if (depth === 0) { fn_end = i; break; } }
        }
        const body = src.slice(fn_start, fn_end + 1);
        const refresh_pos = body.indexOf('refresh_counts');
        const interval_pos = body.indexOf('setInterval');
        expect(refresh_pos).toBeGreaterThan(-1);
        expect(interval_pos).toBeGreaterThan(-1);
        expect(refresh_pos).toBeLessThan(interval_pos);
    });

    it('DOMContentLoaded handler starts timer when capturing', () => {
        const dom_idx = src.indexOf("DOMContentLoaded");
        expect(dom_idx).toBeGreaterThan(-1);
        const after = src.slice(dom_idx, dom_idx + 500);
        expect(after).toContain("state === 'capturing'");
        expect(after).toContain('start_timer');
    });
});
