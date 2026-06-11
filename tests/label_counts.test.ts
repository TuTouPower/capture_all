// tests/label_counts.test.ts — 七标签计数：验证 CaptureStats 类型结构
// 导入真实生产类型，用 Record<keyof CaptureStats, string> 建立编译时约束
import { describe, it, expect } from 'vitest';
import type { CaptureStats, CategoryKey } from '../src/shared/types';

// TAG_LABEL 用 Record<keyof CaptureStats, string> 约束 ——
// 若 CaptureStats 增删字段，此行编译失败，防止标签映射与类型脱节。
const TAG_LABEL: Record<keyof CaptureStats, string> = {
    event_count: '用户行为',
    nav_count: '页面导航',
    request_count: '网络请求',
    log_count: '控制台',
    error_count: '错误异常',
    storage_change_count: 'Storage',
    cookie_change_count: 'Cookie',
};

const VISIBLE_STAT_KEYS = Object.keys(TAG_LABEL) as (keyof CaptureStats)[];

// CategoryKey 中不应展示为数据标签的类别
const HIDDEN_CATEGORIES: CategoryKey[] = ['dom_data', 'capture_lifecycle'];

function zero_stats(): CaptureStats {
    return {
        event_count: 0,
        nav_count: 0,
        request_count: 0,
        log_count: 0,
        error_count: 0,
        storage_change_count: 0,
        cookie_change_count: 0,
    };
}

// ============================================================
// Tests
// ============================================================

describe('CaptureStats — 七标签类型结构', () => {
    it('恰有 7 个计数字段', () => {
        expect(VISIBLE_STAT_KEYS).toHaveLength(7);
    });

    it('所有字段均为 number 类型', () => {
        const stats = zero_stats();
        for (const key of VISIBLE_STAT_KEYS) {
            expect(typeof stats[key]).toBe('number');
        }
    });

    it('不含 dom_data 或 capture_lifecycle', () => {
        const key_set = new Set<string>(VISIBLE_STAT_KEYS);
        expect(key_set.has('dom_data')).toBe(false);
        expect(key_set.has('capture_lifecycle')).toBe(false);
    });

    it('每个 stat_key 都有对应的中文标签', () => {
        for (const key of VISIBLE_STAT_KEYS) {
            expect(TAG_LABEL[key]).toBeTruthy();
            expect(typeof TAG_LABEL[key]).toBe('string');
        }
    });
});

describe('label_counts — 从 CaptureStats 计算各标签计数', () => {
    it('零值 stats → 全 0 数组', () => {
        const counts = VISIBLE_STAT_KEYS.map((k) => zero_stats()[k]);
        expect(counts).toEqual([0, 0, 0, 0, 0, 0, 0]);
    });

    it('非零 stats → 各位置正确映射', () => {
        const stats: CaptureStats = {
            event_count: 5,
            nav_count: 3,
            request_count: 10,
            log_count: 2,
            error_count: 1,
            storage_change_count: 4,
            cookie_change_count: 7,
        };
        const counts = VISIBLE_STAT_KEYS.map((k) => stats[k]);
        expect(counts).toEqual([5, 3, 10, 2, 1, 4, 7]);
    });

    it('部分非零', () => {
        const stats: CaptureStats = {
            ...zero_stats(),
            request_count: 1,
        };
        const counts = VISIBLE_STAT_KEYS.map((k) => stats[k]);
        expect(counts).toEqual([0, 0, 1, 0, 0, 0, 0]);
    });

    it('label_counts 长度恒为 7', () => {
        const stats: CaptureStats = {
            event_count: 999,
            nav_count: 888,
            request_count: 777,
            log_count: 666,
            error_count: 555,
            storage_change_count: 444,
            cookie_change_count: 333,
        };
        const counts = VISIBLE_STAT_KEYS.map((k) => stats[k]);
        expect(counts).toHaveLength(7);
    });

    it('label_counts 总和 = CaptureStats 所有字段之和', () => {
        const stats: CaptureStats = {
            event_count: 5,
            nav_count: 3,
            request_count: 10,
            log_count: 2,
            error_count: 1,
            storage_change_count: 4,
            cookie_change_count: 7,
        };
        const counts = VISIBLE_STAT_KEYS.map((k) => stats[k]);
        const sum = (Object.values(stats) as number[]).reduce((a, b) => a + b, 0);
        expect(counts.reduce((a, b) => a + b, 0)).toBe(sum);
    });
});

describe('CategoryKey — 隐藏类别不在标签计数中', () => {
    it('dom_data 是合法 CategoryKey', () => {
        const hidden: CategoryKey = 'dom_data';
        expect(HIDDEN_CATEGORIES).toContain(hidden);
    });

    it('capture_lifecycle 是合法 CategoryKey', () => {
        const hidden: CategoryKey = 'capture_lifecycle';
        expect(HIDDEN_CATEGORIES).toContain(hidden);
    });

    it('隐藏类别共 2 个', () => {
        expect(HIDDEN_CATEGORIES).toHaveLength(2);
    });

    it('隐藏类别不在 CaptureStats 字段中', () => {
        const key_set = new Set<string>(VISIBLE_STAT_KEYS);
        for (const h of HIDDEN_CATEGORIES) {
            expect(key_set.has(h)).toBe(false);
        }
    });
});
