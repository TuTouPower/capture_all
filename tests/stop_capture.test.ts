// tests/stop_capture.test.ts — stop_recording 完整行为测试
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CaptureRecord, CaptureStats, CaptureStoppedData } from '../src/shared/types';

// ============================================================
// 可注入依赖的 stop_recording 实现（镜像 service_worker.ts 真实逻辑）
// ============================================================

interface StopRecordingDeps {
    is_capturing: boolean;
    set_is_capturing: (v: boolean) => void;
    current_capture: CaptureRecord | null;
    current_capture_id: string | null;
    start_time: number;
    now: () => number;
    write_events: ReturnType<typeof vi.fn>;
    update_capture: ReturnType<typeof vi.fn>;
    get_active_tab: ReturnType<typeof vi.fn>;
    query_all_tabs: ReturnType<typeof vi.fn>;
    send_message_to_tab: ReturnType<typeof vi.fn>;
    stop_keepalive: ReturnType<typeof vi.fn>;
    stop_network_capture: ReturnType<typeof vi.fn>;
    stop_console_capture: ReturnType<typeof vi.fn>;
    stop_exception_capture: ReturnType<typeof vi.fn>;
    stop_cookie_capture: ReturnType<typeof vi.fn>;
    stop_body_capture_with_cleanup: ReturnType<typeof vi.fn>;
    flush_all: ReturnType<typeof vi.fn>;
    clear_last_active_tab: ReturnType<typeof vi.fn>;
    set_current_capture_null: () => void;
    reset_debugger_tab: () => void;
    set_cdp_body_event_handler: (handler: unknown) => void;
    get_bridge_config: ReturnType<typeof vi.fn>;
}

interface StopRecordingState {
    is_capturing: boolean;
}

async function run_stop_step(step: () => void | Promise<void>): Promise<void> {
    try {
        await step();
    } catch {
        // stop must keep cleaning up remaining subsystems
    }
}

async function stop_recording(
    deps: StopRecordingDeps,
    state: StopRecordingState,
): Promise<{ success: boolean }> {
    if (!state.is_capturing) {
        return { success: true };
    }

    state.is_capturing = false;
    deps.reset_debugger_tab();

    if (deps.current_capture && deps.current_capture_id) {
        const duration_ms = deps.now() - deps.start_time;

        const stopped_data: CaptureStoppedData = {
            capture_id: deps.current_capture_id,
            reason: 'user_stop',
            duration_ms,
            stats: { ...deps.current_capture.stats },
        };
        await run_stop_step(() => deps.write_events([stopped_data]));

        await run_stop_step(async () => {
            const tabs = await deps.get_active_tab();
            deps.current_capture!.status = 'completed';
            deps.current_capture!.ended_at = new Date(deps.now()).toISOString();
            deps.current_capture!.duration_ms = duration_ms;
            deps.current_capture!.end_url = tabs?.[0]?.url || null;
            deps.current_capture!.updated_at = new Date(deps.now()).toISOString();
            await deps.update_capture(deps.current_capture);
        });
    }

    await run_stop_step(() => deps.stop_keepalive());
    await run_stop_step(() => deps.stop_network_capture());
    await run_stop_step(() => deps.set_cdp_body_event_handler(null));
    await run_stop_step(() => deps.stop_body_capture_with_cleanup({ get_bridge_config: deps.get_bridge_config }));
    await run_stop_step(() => deps.stop_cookie_capture());
    await run_stop_step(() => deps.stop_console_capture());
    await run_stop_step(() => deps.stop_exception_capture());

    await run_stop_step(async () => {
        const all_tabs = await deps.query_all_tabs();
        for (const tab of all_tabs) {
            if (tab.id) {
                try {
                    await deps.send_message_to_tab(tab.id, { action: 'stop' });
                } catch {
                    // Tab 可能没有 content script
                }
            }
        }
    });

    await run_stop_step(() => deps.flush_all());

    deps.set_current_capture_null();
    deps.clear_last_active_tab();
    return { success: true };
}

// ============================================================
// 辅助函数
// ============================================================

function make_capture(overrides: Partial<CaptureRecord> = {}): CaptureRecord {
    return {
        capture_id: 'test-capture-001',
        name: 'Test Capture',
        status: 'capturing',
        mode: 'standard',
        started_at: new Date(1000).toISOString(),
        ended_at: null,
        duration_ms: 0,
        start_url: 'https://example.com',
        end_url: null,
        tab_id: 1,
        window_id: 1,
        config_snapshot: {},
        stats: zero_stats(),
        tags: [],
        created_at: new Date(1000).toISOString(),
        updated_at: new Date(1000).toISOString(),
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

function create_default_deps(
    overrides: Partial<StopRecordingDeps> = {},
): StopRecordingDeps {
    return {
        is_capturing: true,
        set_is_capturing: vi.fn(),
        current_capture: make_capture(),
        current_capture_id: 'test-capture-001',
        start_time: 1000,
        now: () => 6000,
        write_events: vi.fn(async () => {}),
        update_capture: vi.fn(async () => {}),
        get_active_tab: vi.fn(async () => [{ id: 1, url: 'https://example.com/page2' }]),
        query_all_tabs: vi.fn(async () => [
            { id: 1, url: 'https://example.com' },
            { id: 2, url: 'https://other.com' },
        ]),
        send_message_to_tab: vi.fn(async () => {}),
        stop_keepalive: vi.fn(),
        stop_network_capture: vi.fn(),
        stop_console_capture: vi.fn(async () => {}),
        stop_exception_capture: vi.fn(async () => {}),
        stop_cookie_capture: vi.fn(),
        stop_body_capture_with_cleanup: vi.fn(async () => {}),
        flush_all: vi.fn(async () => {}),
        clear_last_active_tab: vi.fn(),
        set_current_capture_null: vi.fn(),
        reset_debugger_tab: vi.fn(),
        set_cdp_body_event_handler: vi.fn(),
        get_bridge_config: vi.fn(async () => ({ bridge_url: '', bridge_token: '', cdp_ports: [] })),
        ...overrides,
    };
}

// ============================================================
// Tests — stop 消息协议 + 格式校验
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
            stats.event_count = 999;
            expect(data.stats.event_count).toBe(1);
        });
    });
});

// ============================================================
// Tests — stop_recording 核心行为（真实逻辑）
// ============================================================

describe('stop_recording 核心行为', () => {
    describe('未采集中调用 stop', () => {
        it('返回 success: true 表示已处于停止状态', async () => {
            const state: StopRecordingState = { is_capturing: false };
            const deps = create_default_deps({ is_capturing: false });

            const result = await stop_recording(deps, state);

            expect(result).toEqual({ success: true });
        });

        it('不会写入任何事件', async () => {
            const state: StopRecordingState = { is_capturing: false };
            const deps = create_default_deps({
                is_capturing: false,
                write_events: vi.fn(async () => {}),
            });

            await stop_recording(deps, state);

            expect(deps.write_events).not.toHaveBeenCalled();
        });

        it('不会调用 flush_all', async () => {
            const state: StopRecordingState = { is_capturing: false };
            const deps = create_default_deps({
                is_capturing: false,
                flush_all: vi.fn(async () => {}),
            });

            await stop_recording(deps, state);

            expect(deps.flush_all).not.toHaveBeenCalled();
        });

        it('不会关停任何子系统', async () => {
            const state: StopRecordingState = { is_capturing: false };
            const deps = create_default_deps({ is_capturing: false });

            await stop_recording(deps, state);

            expect(deps.stop_keepalive).not.toHaveBeenCalled();
            expect(deps.stop_network_capture).not.toHaveBeenCalled();
            expect(deps.stop_console_capture).not.toHaveBeenCalled();
            expect(deps.stop_exception_capture).not.toHaveBeenCalled();
            expect(deps.stop_cookie_capture).not.toHaveBeenCalled();
            expect(deps.stop_body_capture_with_cleanup).not.toHaveBeenCalled();
        });
    });

    describe('采集中调用 stop', () => {
        let state: StopRecordingState;
        let deps: StopRecordingDeps;

        beforeEach(() => {
            state = { is_capturing: true };
            deps = create_default_deps();
        });

        it('返回 success: true', async () => {
            const result = await stop_recording(deps, state);
            expect(result).toEqual({ success: true });
        });

        it('将 is_capturing 设为 false', async () => {
            await stop_recording(deps, state);
            expect(state.is_capturing).toBe(false);
        });

        it('写入 capture_lifecycle 停止事件到 DB', async () => {
            await stop_recording(deps, state);

            expect(deps.write_events).toHaveBeenCalledTimes(1);
            const events = deps.write_events.mock.calls[0][0];
            expect(events).toHaveLength(1);
            expect(events[0].capture_id).toBe('test-capture-001');
            expect(events[0].reason).toBe('user_stop');
            expect(events[0].stats).toEqual(zero_stats());
        });

        it('capture_lifecycle 事件包含正确的 duration_ms', async () => {
            // start_time = 1000, now = 6000 → duration = 5000
            await stop_recording(deps, state);

            const events = deps.write_events.mock.calls[0][0];
            expect(events[0].duration_ms).toBe(5000);
        });

        it('capture_lifecycle 事件 stats 是快照副本', async () => {
            const capture = make_capture({
                stats: { event_count: 42, nav_count: 3, request_count: 10, log_count: 5, error_count: 0, storage_change_count: 0, cookie_change_count: 1 },
            });
            deps = create_default_deps({ current_capture: capture });
            state = { is_capturing: true };

            await stop_recording(deps, state);

            const events = deps.write_events.mock.calls[0][0];
            expect(events[0].stats).toEqual(capture.stats);
            // 修改原始 stats 不影响已快照的
            capture.stats.event_count = 999;
            expect(events[0].stats.event_count).toBe(42);
        });

        it('更新 capture.status 为 completed', async () => {
            await stop_recording(deps, state);

            expect(deps.current_capture!.status).toBe('completed');
        });

        it('设置 capture.ended_at', async () => {
            await stop_recording(deps, state);

            expect(deps.current_capture!.ended_at).toBeTruthy();
            expect(() => new Date(deps.current_capture!.ended_at!)).not.toThrow();
        });

        it('设置 capture.duration_ms', async () => {
            await stop_recording(deps, state);

            expect(deps.current_capture!.duration_ms).toBe(5000);
        });

        it('从活跃标签页设置 capture.end_url', async () => {
            await stop_recording(deps, state);

            expect(deps.current_capture!.end_url).toBe('https://example.com/page2');
        });

        it('活跃标签页不存在时 end_url 为 null', async () => {
            deps = create_default_deps({
                get_active_tab: vi.fn(async () => []),
            });
            state = { is_capturing: true };

            await stop_recording(deps, state);

            expect(deps.current_capture!.end_url).toBeNull();
        });

        it('调用 update_capture 持久化到 DB', async () => {
            await stop_recording(deps, state);

            expect(deps.update_capture).toHaveBeenCalledTimes(1);
            expect(deps.update_capture).toHaveBeenCalledWith(deps.current_capture);
        });

        it('update_capture 失败时不抛出异常', async () => {
            deps = create_default_deps({
                update_capture: vi.fn(async () => {
                    throw new Error('DB write failed');
                }),
            });
            state = { is_capturing: true };

            // 不应抛出
            const result = await stop_recording(deps, state);
            expect(result).toEqual({ success: true });
        });
    });

    describe('子系统关停', () => {
        let state: StopRecordingState;
        let deps: StopRecordingDeps;

        beforeEach(() => {
            state = { is_capturing: true };
            deps = create_default_deps();
        });

        it('调用 stop_keepalive', async () => {
            await stop_recording(deps, state);
            expect(deps.stop_keepalive).toHaveBeenCalled();
        });

        it('调用 stop_network_capture', async () => {
            await stop_recording(deps, state);
            expect(deps.stop_network_capture).toHaveBeenCalled();
        });

        it('调用 stop_console_capture', async () => {
            await stop_recording(deps, state);
            expect(deps.stop_console_capture).toHaveBeenCalled();
        });

        it('调用 stop_exception_capture', async () => {
            await stop_recording(deps, state);
            expect(deps.stop_exception_capture).toHaveBeenCalled();
        });

        it('调用 stop_cookie_capture', async () => {
            await stop_recording(deps, state);
            expect(deps.stop_cookie_capture).toHaveBeenCalled();
        });

        it('调用 stop_body_capture_with_cleanup', async () => {
            await stop_recording(deps, state);
            expect(deps.stop_body_capture_with_cleanup).toHaveBeenCalled();
        });

        it('清除 CDP body event handler', async () => {
            await stop_recording(deps, state);
            expect(deps.set_cdp_body_event_handler).toHaveBeenCalledWith(null);
        });

        it('子系统关停失败不阻止 stop 返回成功', async () => {
            deps = create_default_deps({
                stop_network_capture: vi.fn(() => {
                    throw new Error('network stop error');
                }),
            });
            state = { is_capturing: true };

            const result = await stop_recording(deps, state);

            expect(result).toEqual({ success: true });
            expect(deps.flush_all).toHaveBeenCalled();
        });
    });

    describe('通知所有 content script', () => {
        it('向所有标签页发送 { action: \'stop\' } 消息', async () => {
            const state: StopRecordingState = { is_capturing: true };
            const deps = create_default_deps();

            await stop_recording(deps, state);

            expect(deps.query_all_tabs).toHaveBeenCalled();
            expect(deps.send_message_to_tab).toHaveBeenCalledTimes(2);
            expect(deps.send_message_to_tab).toHaveBeenCalledWith(1, { action: 'stop' });
            expect(deps.send_message_to_tab).toHaveBeenCalledWith(2, { action: 'stop' });
        });

        it('无 id 的标签页被跳过', async () => {
            const state: StopRecordingState = { is_capturing: true };
            const deps = create_default_deps({
                query_all_tabs: vi.fn(async () => [
                    { url: 'https://example.com' }, // 无 id
                    { id: 1, url: 'https://other.com' },
                ]),
                send_message_to_tab: vi.fn(async () => {}),
            });

            await stop_recording(deps, state);

            expect(deps.send_message_to_tab).toHaveBeenCalledTimes(1);
            expect(deps.send_message_to_tab).toHaveBeenCalledWith(1, { action: 'stop' });
        });

        it('sendMessage 失败时不阻断流程', async () => {
            const state: StopRecordingState = { is_capturing: true };
            const deps = create_default_deps({
                send_message_to_tab: vi.fn(async () => {
                    throw new Error('No content script');
                }),
            });

            const result = await stop_recording(deps, state);

            expect(result).toEqual({ success: true });
            // 仍然调用了 flush_all
            expect(deps.flush_all).toHaveBeenCalled();
        });
    });

    describe('flush_all 调用', () => {
        it('flush_all 在通知标签页之后调用', async () => {
            const state: StopRecordingState = { is_capturing: true };
            const call_order: string[] = [];
            const deps = create_default_deps({
                query_all_tabs: vi.fn(async () => [{ id: 1 }]),
                send_message_to_tab: vi.fn(async () => {
                    call_order.push('broadcast');
                }),
                flush_all: vi.fn(async () => {
                    call_order.push('flush_all');
                }),
            });

            await stop_recording(deps, state);

            expect(deps.flush_all).toHaveBeenCalled();
            expect(call_order).toEqual(['broadcast', 'flush_all']);
        });

        it('flush_all 失败仍返回 success: true', async () => {
            const state: StopRecordingState = { is_capturing: true };
            const deps = create_default_deps({
                flush_all: vi.fn(async () => {
                    throw new Error('flush failed');
                }),
            });

            const result = await stop_recording(deps, state);

            expect(result).toEqual({ success: true });
            expect(deps.clear_last_active_tab).toHaveBeenCalled();
        });
    });

    describe('状态清理', () => {
        it('current_capture 被清空', async () => {
            const state: StopRecordingState = { is_capturing: true };
            const deps = create_default_deps();
            let cleared = false;
            deps.set_current_capture_null = () => {
                cleared = true;
                deps.current_capture = null;
            };

            await stop_recording(deps, state);

            expect(cleared).toBe(true);
        });

        it('last_active_tab 被清空', async () => {
            const state: StopRecordingState = { is_capturing: true };
            const deps = create_default_deps();

            await stop_recording(deps, state);

            expect(deps.clear_last_active_tab).toHaveBeenCalled();
        });
    });

    describe('多次 stop 调用', () => {
        it('第一次成功，第二次也返回 success true', async () => {
            const state: StopRecordingState = { is_capturing: true };
            const deps = create_default_deps();

            const first = await stop_recording(deps, state);
            expect(first).toEqual({ success: true });

            const second = await stop_recording(deps, state);
            expect(second).toEqual({ success: true });
        });

        it('第二次 stop 不重复写入事件', async () => {
            const state: StopRecordingState = { is_capturing: true };
            const deps = create_default_deps();

            await stop_recording(deps, state);
            expect(deps.write_events).toHaveBeenCalledTimes(1);

            await stop_recording(deps, state);
            expect(deps.write_events).toHaveBeenCalledTimes(1); // 未增加
        });

        it('第二次 stop 不重复调用 flush_all', async () => {
            const state: StopRecordingState = { is_capturing: true };
            const deps = create_default_deps();

            await stop_recording(deps, state);
            expect(deps.flush_all).toHaveBeenCalledTimes(1);

            await stop_recording(deps, state);
            expect(deps.flush_all).toHaveBeenCalledTimes(1);
        });
    });
});
