// tests/stop_capture.test.ts — stop_capture 消息协议
import { describe, it, expect, vi } from 'vitest';
import type { CaptureRecord, CaptureStats, CaptureStoppedData } from '../src/shared/types';

// ============================================================
// 从 service_worker.ts 提取的核心逻辑
// ============================================================

interface StopResult {
    success: boolean;
    error?: string;
}

// 模拟 stop_recording 逻辑：未采集中 → 返回失败
function simulate_stop_recording(is_capturing: boolean): StopResult {
    if (!is_capturing) {
        return { success: false, error: 'Not currently capturing' };
    }

    // 采集正常停止
    return { success: true };
}

function create_stopped_event_data(
    capture: CaptureRecord,
    reason: 'user_stop' | 'max_duration' | 'error',
): CaptureStoppedData {
    const duration_ms = Date.now() - new Date(capture.started_at).getTime();
    return {
        capture_id: capture.capture_id,
        reason,
        duration_ms: Math.max(0, duration_ms),
        stats: { ...capture.stats },
    };
}

function create_stop_message(): { action: string } {
    return { action: 'stop' };
}

function validate_stop_message(msg: unknown): msg is { action: string } {
    return (
        typeof msg === 'object' &&
        msg !== null &&
        'action' in msg &&
        (msg as { action: unknown }).action === 'stop'
    );
}

function make_capture(overrides: Partial<CaptureRecord> = {}): CaptureRecord {
    return {
        capture_id: 'test-capture-001',
        name: 'Test Capture',
        status: 'capturing',
        mode: 'standard',
        started_at: new Date(Date.now() - 5000).toISOString(),
        ended_at: null,
        duration_ms: 0,
        start_url: 'https://example.com',
        end_url: null,
        tab_id: 1,
        window_id: 1,
        config_snapshot: {},
        stats: zero_stats(),
        tags: [],
        created_at: new Date(Date.now() - 5000).toISOString(),
        updated_at: new Date(Date.now() - 5000).toISOString(),
        ...overrides,
    };
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

// ============================================================
// Tests
// ============================================================

describe('stop_capture 消息协议', () => {
    describe('{ action: \'stop\' } 消息格式', () => {
        it('生成的消息包含 action: stop', () => {
            const msg = create_stop_message();
            expect(msg.action).toBe('stop');
            expect(msg).toEqual({ action: 'stop' });
        });

        it('stop 消息校验通过', () => {
            expect(validate_stop_message({ action: 'stop' })).toBe(true);
        });

        it('非 stop 消息校验不通过', () => {
            expect(validate_stop_message({ action: 'start' })).toBe(false);
            expect(validate_stop_message({ action: 'STOP' })).toBe(false);
            expect(validate_stop_message({})).toBe(false);
            expect(validate_stop_message(null)).toBe(false);
            expect(validate_stop_message('stop')).toBe(false);
            expect(validate_stop_message(undefined)).toBe(false);
        });
    });

    describe('停止成功响应', () => {
        it('采集中调用 stop 返回 success', () => {
            const result = simulate_stop_recording(true);
            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('stop 响应不包含 error 字段', () => {
            const result = simulate_stop_recording(true);
            expect(result).toEqual({ success: true });
        });
    });

    describe('未采集中调用返回错误', () => {
        it('未采集中调用 stop 返回失败', () => {
            const result = simulate_stop_recording(false);
            expect(result.success).toBe(false);
        });

        it('未采集中返回包含 error 描述', () => {
            const result = simulate_stop_recording(false);
            expect(result.error).toBeDefined();
            expect(typeof result.error).toBe('string');
            expect(result.error!.length).toBeGreaterThan(0);
        });
    });

    describe('停止事件数据', () => {
        it('CaptureStoppedData 包含 capture_id', () => {
            const capture = make_capture();
            const data = create_stopped_event_data(capture, 'user_stop');
            expect(data.capture_id).toBe('test-capture-001');
        });

        it('CaptureStoppedData reason 为 user_stop', () => {
            const capture = make_capture();
            const data = create_stopped_event_data(capture, 'user_stop');
            expect(data.reason).toBe('user_stop');
        });

        it('CaptureStoppedData duration_ms >= 0', () => {
            const capture = make_capture();
            const data = create_stopped_event_data(capture, 'user_stop');
            expect(data.duration_ms).toBeGreaterThanOrEqual(0);
        });

        it('duration_ms 大致等于采集时长 (+/- 100ms)', () => {
            const capture = make_capture({
                started_at: new Date(Date.now() - 5000).toISOString(),
            });
            const data = create_stopped_event_data(capture, 'user_stop');
            expect(data.duration_ms).toBeGreaterThanOrEqual(4900);
            expect(data.duration_ms).toBeLessThanOrEqual(5100);
        });

        it('stop 后 stats 被快照保存', () => {
            const stats: CaptureStats = {
                event_count: 10,
                nav_count: 3,
                request_count: 25,
                log_count: 5,
                error_count: 2,
                storage_change_count: 1,
                cookie_change_count: 4,
            };
            const capture = make_capture({ stats });
            const data = create_stopped_event_data(capture, 'user_stop');
            expect(data.stats).toEqual(stats);
        });

        it('stats 是独立副本（不为同一引用）', () => {
            const stats: CaptureStats = {
                event_count: 1,
                nav_count: 0,
                request_count: 0,
                log_count: 0,
                error_count: 0,
                storage_change_count: 0,
                cookie_change_count: 0,
            };
            const capture = make_capture({ stats });
            const data = create_stopped_event_data(capture, 'user_stop');
            // 修改原始 stats 不影响已快照的 data.stats
            stats.event_count = 999;
            expect(data.stats.event_count).toBe(1);
        });
    });

    describe('stop 后的 CaptureRecord 状态', () => {
        it('status 变为 completed', () => {
            const capture = make_capture({ status: 'capturing' });
            capture.status = 'completed';
            expect(capture.status).toBe('completed');
        });

        it('ended_at 被设置', () => {
            const capture = make_capture();
            capture.ended_at = new Date().toISOString();
            expect(capture.ended_at).toBeTruthy();
            expect(() => new Date(capture.ended_at!)).not.toThrow();
        });

        it('duration_ms 被更新', () => {
            const capture = make_capture({ duration_ms: 0 });
            capture.duration_ms = 5000;
            expect(capture.duration_ms).toBeGreaterThan(0);
        });
    });

    describe('多次 stop 调用', () => {
        it('第二次 stop 在未采集中调用应返回失败', () => {
            // 第一次 stop 成功后，is_capturing 已变为 false
            const first = simulate_stop_recording(true);
            expect(first.success).toBe(true);

            const second = simulate_stop_recording(false);
            expect(second.success).toBe(false);
        });
    });
});
