// tests/escape.test.ts
import { describe, it, expect } from 'vitest';
import { escape_for_html_embed } from '../src/shared/escape';

describe('escape_for_html_embed', () => {
    it('escapes script tags', () => {
        const input = '</script><script>alert(1)</script>';
        const result = escape_for_html_embed(input);
        expect(result).not.toContain('</script>');
        expect(result).toContain('\\u003c\\/script\\u003e');
    });

    it('escapes special HTML characters', () => {
        const input = '<div>&test</div>';
        const result = escape_for_html_embed(input);
        expect(result).toContain('\\u003c');
        expect(result).toContain('\\u0026');
        expect(result).toContain('\\u003e');
    });

    it('handles normal text', () => {
        const input = 'hello world 123';
        expect(escape_for_html_embed(input)).toBe(input);
    });
});
