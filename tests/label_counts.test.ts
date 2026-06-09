// tests/label_counts.test.ts — 七标签计数计算逻辑
import { describe, it, expect } from 'vitest';
import type { CaptureStats, CategoryKey } from '../src/shared/types';

// ============================================================
// 1. category → label 映射
// ============================================================

// 七个对用户可见的数据标签按展示顺序排列
const VISIBLE_LABELS: { category: CategoryKey; label_cn: string; stat_key: keyof CaptureStats }[] = [
    { category: 'user_action', label_cn: '用户行为', stat_key: 'event_count' },
    { category: 'navigation',  label_cn: '页面导航', stat_key: 'nav_count' },
    { category: 'network',     label_cn: '网络请求', stat_key: 'request_count' },
    { category: 'console',     label_cn: '控制台',   stat_key: 'log_count' },
    { category: 'error',       label_cn: '错误异常', stat_key: 'error_count' },
    { category: 'storage',     label_cn: 'Storage',   stat_key: 'storage_change_count' },
    { category: 'cookie',      label_cn: 'Cookie',    stat_key: 'cookie_change_count' },
];

// 不应对用户展示为数据标签的 category
const HIDDEN_CATEGORIES: CategoryKey[] = ['dom_data', 'capture_lifecycle'];

function category_to_label(category: CategoryKey): string | null {
    const entry = VISIBLE_LABELS.find((l) => l.category === category);
    return entry?.label_cn ?? null;
}

// ============================================================
// 2. label_counts 从 CaptureStats 计算
// ============================================================

function compute_label_counts(stats: CaptureStats): number[] {
    return [
        stats.event_count,
        stats.nav_count,
        stats.request_count,
        stats.log_count,
        stats.error_count,
        stats.storage_change_count,
        stats.cookie_change_count,
    ];
}

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

function has_non_zero(counts: number[]): boolean {
    return counts.some((c) => c > 0);
}

// ============================================================
// Tests
// ============================================================

describe('七标签计数计算', () => {
    describe('category → label 映射', () => {
        it('user_action → 用户行为', () => {
            expect(category_to_label('user_action')).toBe('用户行为');
        });

        it('navigation → 页面导航', () => {
            expect(category_to_label('navigation')).toBe('页面导航');
        });

        it('network → 网络请求', () => {
            expect(category_to_label('network')).toBe('网络请求');
        });

        it('console → 控制台', () => {
            expect(category_to_label('console')).toBe('控制台');
        });

        it('error → 错误异常', () => {
            expect(category_to_label('error')).toBe('错误异常');
        });

        it('storage → Storage', () => {
            expect(category_to_label('storage')).toBe('Storage');
        });

        it('cookie → Cookie', () => {
            expect(category_to_label('cookie')).toBe('Cookie');
        });

        it('共有 7 个可见标签', () => {
            expect(VISIBLE_LABELS).toHaveLength(7);
        });
    });

    describe('dom_data / capture_lifecycle 不计入标签计数', () => {
        it('dom_data 不在可见标签中', () => {
            expect(category_to_label('dom_data')).toBeNull();
            expect(HIDDEN_CATEGORIES).toContain('dom_data');
        });

        it('capture_lifecycle 不在可见标签中', () => {
            expect(category_to_label('capture_lifecycle')).toBeNull();
            expect(HIDDEN_CATEGORIES).toContain('capture_lifecycle');
        });

        it('隐藏类别共 2 个', () => {
            expect(HIDDEN_CATEGORIES).toHaveLength(2);
        });
    });

    describe('label_counts 从 stats 计算', () => {
        it('空列表全 0', () => {
            const counts = compute_label_counts(zero_stats());
            expect(counts).toEqual([0, 0, 0, 0, 0, 0, 0]);
            expect(has_non_zero(counts)).toBe(false);
        });

        it('非零 stats 正确映射到各标签位置', () => {
            const stats: CaptureStats = {
                event_count: 5,
                nav_count: 3,
                request_count: 10,
                log_count: 2,
                error_count: 1,
                storage_change_count: 4,
                cookie_change_count: 7,
            };
            const counts = compute_label_counts(stats);
            expect(counts).toEqual([5, 3, 10, 2, 1, 4, 7]);
            expect(has_non_zero(counts)).toBe(true);
        });

        it('部分非零', () => {
            const stats: CaptureStats = {
                event_count: 0,
                nav_count: 0,
                request_count: 1,
                log_count: 0,
                error_count: 0,
                storage_change_count: 0,
                cookie_change_count: 0,
            };
            const counts = compute_label_counts(stats);
            expect(counts).toEqual([0, 0, 1, 0, 0, 0, 0]);
            expect(has_non_zero(counts)).toBe(true);
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
            const counts = compute_label_counts(stats);
            expect(counts).toHaveLength(7);
        });

        it('每个 stat_key 与 CaptureStats 字段一一对应', () => {
            const stat_keys = VISIBLE_LABELS.map((l) => l.stat_key);
            const stats = zero_stats();
            // 所有 stat_key 都是 CaptureStats 的合法字段
            for (const key of stat_keys) {
                expect(typeof stats[key]).toBe('number');
            }
            // 共 7 个
            expect(stat_keys).toHaveLength(7);
        });

        it('label_counts 总和 = 所有可见 stat 之和', () => {
            const stats: CaptureStats = {
                event_count: 5,
                nav_count: 3,
                request_count: 10,
                log_count: 2,
                error_count: 1,
                storage_change_count: 4,
                cookie_change_count: 7,
            };
            const counts = compute_label_counts(stats);
            const sum = Object.values(stats).reduce((a, b) => a + b, 0);
            expect(counts.reduce((a, b) => a + b, 0)).toBe(sum);
        });

        it('CaptureStats 不含 dom_data 或 capture_lifecycle 字段', () => {
            const stats_keys = Object.keys(zero_stats());
            expect(stats_keys).not.toContain('dom_data');
            expect(stats_keys).not.toContain('capture_lifecycle');
            // CaptureStats 仅有 7 个计数字段
            expect(stats_keys).toHaveLength(7);
        });
    });
});
