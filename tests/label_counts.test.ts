// tests/label_counts.test.ts — 七标签计数计算逻辑
import { describe, it, expect } from 'vitest';

// Replicate the label mapping from popup.ts CAPTURE array
const CAPTURE_STATS_KEYS = [
    'event_count',          // 用户行为
    'nav',                  // 页面导航 (not in stats directly)
    'request_count',        // 网络请求
    'log_count',            // 控制台
    'error_count',          // 错误异常
    'storage_change_count', // Storage
    'cookie_change_count',  // Cookie
] as const;

interface CaptureStats {
    event_count: number;
    request_count: number;
    log_count: number;
    error_count: number;
    storage_change_count: number;
    cookie_change_count: number;
}

function compute_label_counts(stats: CaptureStats): number[] {
    return [
        stats.event_count,
        0, // nav count comes from navigation events, not directly in stats
        stats.request_count,
        stats.log_count,
        stats.error_count,
        stats.storage_change_count,
        stats.cookie_change_count,
    ];
}

function has_non_zero(counts: number[]): boolean {
    return counts.some(c => c > 0);
}

describe('label counts', () => {
    it('returns all zeros for empty stats', () => {
        const stats: CaptureStats = {
            event_count: 0, request_count: 0, log_count: 0,
            error_count: 0, storage_change_count: 0, cookie_change_count: 0,
        };
        const counts = compute_label_counts(stats);
        expect(counts).toEqual([0, 0, 0, 0, 0, 0, 0]);
        expect(has_non_zero(counts)).toBe(false);
    });

    it('returns correct counts for populated stats', () => {
        const stats: CaptureStats = {
            event_count: 5, request_count: 10, log_count: 3,
            error_count: 2, storage_change_count: 1, cookie_change_count: 4,
        };
        const counts = compute_label_counts(stats);
        expect(counts[0]).toBe(5);  // event_count
        expect(counts[2]).toBe(10); // request_count
        expect(counts[3]).toBe(3);  // log_count
        expect(counts[4]).toBe(2);  // error_count
        expect(counts[5]).toBe(1);  // storage_change_count
        expect(counts[6]).toBe(4);  // cookie_change_count
    });

    it('detects non-zero counts', () => {
        const stats: CaptureStats = {
            event_count: 0, request_count: 1, log_count: 0,
            error_count: 0, storage_change_count: 0, cookie_change_count: 0,
        };
        const counts = compute_label_counts(stats);
        expect(has_non_zero(counts)).toBe(true);
    });

    it('has correct array length (7 labels)', () => {
        const stats: CaptureStats = {
            event_count: 0, request_count: 0, log_count: 0,
            error_count: 0, storage_change_count: 0, cookie_change_count: 0,
        };
        const counts = compute_label_counts(stats);
        expect(counts).toHaveLength(7);
    });
});
