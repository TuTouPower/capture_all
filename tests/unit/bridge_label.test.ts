import { describe, expect, it } from 'vitest';
import { next_default_label } from '../../src/bridge/label';

describe('next_default_label', () => {
    it('returns "1 号" when no existing labels', () => {
        expect(next_default_label([])).toBe('1 号');
    });

    it('returns "2 号" when "1 号" exists', () => {
        expect(next_default_label(['1 号'])).toBe('2 号');
    });

    it('returns max+1 skipping holes (max+1 not fill-hole)', () => {
        expect(next_default_label(['1 号', '3 号'])).toBe('4 号');
    });

    it('ignores custom labels', () => {
        expect(next_default_label(['work', 'home'])).toBe('1 号');
        expect(next_default_label(['1 号', 'work'])).toBe('2 号');
    });

    it('ignores null / undefined / empty entries', () => {
        expect(next_default_label([null, undefined, ''])).toBe('1 号');
        expect(next_default_label(['1 号', null, '3 号'])).toBe('4 号');
    });

    it('does not mistake custom labels shaped like "N 号" prefix for numerals', () => {
        // 「10 号机」不是合法默认 label 格式（pattern 要求 ^\d+ 号$），不参与推进
        expect(next_default_label(['10 号机'])).toBe('1 号');
    });

    it('handles double-digit and beyond', () => {
        expect(next_default_label(['9 号'])).toBe('10 号');
        expect(next_default_label(['99 号'])).toBe('100 号');
    });
});
