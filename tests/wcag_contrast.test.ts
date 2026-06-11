// tests/wcag_contrast.test.ts — WCAG 对比度计算单元测试
import { describe, test, expect } from 'vitest';
import {
    wcag_luminance,
    wcag_contrast_ratio,
    parse_rgb,
    wcag_contrast_between,
} from './wcag_contrast';

describe('parse_rgb', () => {
    test('解析 rgb(255, 255, 255)', () => {
        expect(parse_rgb('rgb(255, 255, 255)')).toEqual([255, 255, 255]);
    });

    test('解析 rgb(0, 0, 0)', () => {
        expect(parse_rgb('rgb(0, 0, 0)')).toEqual([0, 0, 0]);
    });

    test('解析紧凑格式 rgb(255,0,0)', () => {
        expect(parse_rgb('rgb(255,0,0)')).toEqual([255, 0, 0]);
    });

    test('非法格式返回 null', () => {
        expect(parse_rgb('not a color')).toBeNull();
        expect(parse_rgb('#ffffff')).toBeNull();
    });
});

describe('wcag_luminance', () => {
    test('黑色 (0,0,0) 亮度 = 0', () => {
        expect(wcag_luminance(0, 0, 0)).toBe(0);
    });

    test('白色 (255,255,255) 亮度 = 1', () => {
        expect(wcag_luminance(255, 255, 255)).toBeCloseTo(1, 5);
    });

    test('红色 (255,0,0) 亮度 ≈ 0.2126', () => {
        expect(wcag_luminance(255, 0, 0)).toBeCloseTo(0.2126, 4);
    });
});

describe('wcag_contrast_ratio', () => {
    test('黑 vs 白 = 21:1', () => {
        const black = wcag_luminance(0, 0, 0);
        const white = wcag_luminance(255, 255, 255);
        expect(wcag_contrast_ratio(black, white)).toBeCloseTo(21, 0);
    });

    test('白 vs 白 = 1:1', () => {
        const white = wcag_luminance(255, 255, 255);
        expect(wcag_contrast_ratio(white, white)).toBeCloseTo(1, 0);
    });

    test('黑 vs 黑 = 1:1', () => {
        const black = wcag_luminance(0, 0, 0);
        expect(wcag_contrast_ratio(black, black)).toBeCloseTo(1, 0);
    });

    test('顺序无关（可交换）', () => {
        const black = wcag_luminance(0, 0, 0);
        const white = wcag_luminance(255, 255, 255);
        expect(wcag_contrast_ratio(black, white)).toBe(wcag_contrast_ratio(white, black));
    });
});

describe('wcag_contrast_between', () => {
    test('rgb(255,255,255) vs rgb(0,0,0) = 21:1', () => {
        const ratio = wcag_contrast_between('rgb(255, 255, 255)', 'rgb(0, 0, 0)');
        expect(ratio).toBeCloseTo(21, 0);
    });

    test('rgb(255,0,0) vs rgb(255,255,255) ≈ 4:1', () => {
        const ratio = wcag_contrast_between('rgb(255, 0, 0)', 'rgb(255, 255, 255)');
        expect(ratio).toBeCloseTo(4, 0.5);
    });

    test('白 vs 白 = 1:1', () => {
        const ratio = wcag_contrast_between('rgb(255, 255, 255)', 'rgb(255, 255, 255)');
        expect(ratio).toBeCloseTo(1, 0);
    });

    test('灰色 rgb(128,128,128) vs 白色 对比度 < 4.5', () => {
        const ratio = wcag_contrast_between('rgb(128, 128, 128)', 'rgb(255, 255, 255)');
        expect(ratio).toBeLessThan(4.5);
    });

    test('非法格式返回 null', () => {
        expect(wcag_contrast_between('not valid', 'rgb(0,0,0)')).toBeNull();
    });

    test('深灰 rgb(145,145,145) vs 白色 ≈ 3.38（常见不达标边界）', () => {
        const ratio = wcag_contrast_between('rgb(145, 145, 145)', 'rgb(255, 255, 255)');
        expect(ratio).toBeLessThan(4.5);
        expect(ratio).toBeGreaterThan(3.0);
    });
});
