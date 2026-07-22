import { describe, expect, it } from 'vitest';
import {
    next_default_label,
    parse_chinese_numeral,
    to_chinese_numeral,
} from '../../src/bridge/label';

describe('to_chinese_numeral', () => {
    it('converts 1..9 to single digit', () => {
        expect(to_chinese_numeral(1)).toBe('一');
        expect(to_chinese_numeral(9)).toBe('九');
    });

    it('converts 10 / 11..19 / 20 / 21 / 99', () => {
        expect(to_chinese_numeral(10)).toBe('十');
        expect(to_chinese_numeral(11)).toBe('十一');
        expect(to_chinese_numeral(19)).toBe('十九');
        expect(to_chinese_numeral(20)).toBe('二十');
        expect(to_chinese_numeral(21)).toBe('二十一');
        expect(to_chinese_numeral(99)).toBe('九十九');
    });

    it('converts 100 / 101 / 110 / 111 / 999', () => {
        expect(to_chinese_numeral(100)).toBe('一百');
        expect(to_chinese_numeral(101)).toBe('一百零一');
        expect(to_chinese_numeral(110)).toBe('一百一十');
        expect(to_chinese_numeral(111)).toBe('一百一十一');
        expect(to_chinese_numeral(999)).toBe('九百九十九');
    });

    it('converts 1000 / 1001 / 9999', () => {
        expect(to_chinese_numeral(1000)).toBe('一千');
        expect(to_chinese_numeral(1001)).toBe('一千零一');
        expect(to_chinese_numeral(9999)).toBe('九千九百九十九');
    });

    it('returns 零 for 0', () => {
        expect(to_chinese_numeral(0)).toBe('零');
    });

    it('throws for negative / non-integer / > 9999', () => {
        expect(() => to_chinese_numeral(-1)).toThrow();
        expect(() => to_chinese_numeral(1.5)).toThrow();
        expect(() => to_chinese_numeral(10000)).toThrow();
    });
});

describe('parse_chinese_numeral', () => {
    it('round-trips 1..99', () => {
        for (let i = 1; i <= 99; i += 1) {
            expect(parse_chinese_numeral(to_chinese_numeral(i))).toBe(i);
        }
    });

    it('round-trips selected 3..4 digit values', () => {
        for (const n of [100, 101, 110, 111, 200, 999, 1000, 1001, 9999]) {
            expect(parse_chinese_numeral(to_chinese_numeral(n))).toBe(n);
        }
    });

    it('returns null for custom labels', () => {
        expect(parse_chinese_numeral('work')).toBeNull();
        expect(parse_chinese_numeral('Chrome 127')).toBeNull();
        expect(parse_chinese_numeral('')).toBeNull();
        expect(parse_chinese_numeral('一二三')).toBeNull(); // 非法组合（无单位）
    });

    it('parses 零 as 0', () => {
        expect(parse_chinese_numeral('零')).toBe(0);
    });
});

describe('next_default_label', () => {
    it('returns 一 when no existing labels', () => {
        expect(next_default_label([])).toBe('一');
    });

    it('returns 二 when 一 exists', () => {
        expect(next_default_label(['一'])).toBe('二');
    });

    it('returns max+1 skipping holes (T091: max+1 not fill-hole)', () => {
        expect(next_default_label(['一', '三'])).toBe('四');
    });

    it('ignores custom labels', () => {
        expect(next_default_label(['work', 'home'])).toBe('一');
        expect(next_default_label(['一', 'work'])).toBe('二');
    });

    it('ignores null / undefined / empty entries', () => {
        expect(next_default_label([null, undefined, ''])).toBe('一');
        expect(next_default_label(['一', null, '三'])).toBe('四');
    });
});
