import { describe, it, expect } from 'vitest';
import { escape_html } from '../../src/shared/escape';

describe('escape_html', () => {
    it('escapes ampersand', () => {
        expect(escape_html('a&b')).toBe('a&amp;b');
    });

    it('escapes less-than', () => {
        expect(escape_html('a<b')).toBe('a&lt;b');
    });

    it('escapes greater-than', () => {
        expect(escape_html('a>b')).toBe('a&gt;b');
    });

    it('escapes double quote', () => {
        expect(escape_html('a"b')).toBe('a&quot;b');
    });

    it('escapes single quote to &#39;', () => {
        expect(escape_html("a'b")).toBe('a&#39;b');
    });

    it('escapes all five special chars at once', () => {
        expect(escape_html(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
    });

    it('handles null/undefined', () => {
        expect(escape_html(null)).toBe('');
        expect(escape_html(undefined)).toBe('');
    });

    it('handles number input', () => {
        expect(escape_html(42)).toBe('42');
    });
});
