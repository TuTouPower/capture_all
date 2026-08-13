// tests/unit/duration_limit_sw_integration.test.ts
// t159 AC-003/004: SW 重启恢复——deadline 已过立即终态化（reason max_duration），未过重建 alarm
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const update_capture = vi.hoisted(() => vi.fn());
const flush_all = vi.hoisted(() => vi.fn());
const write_events = vi.hoisted(() => vi.fn());
const log_write = vi.hoisted(() => vi.fn());
const storage_get = vi.hoisted(() => vi.fn());
const storage_set = vi.hoisted(() => vi.fn());
const alarm_create = vi.hoisted(() => vi.fn());
const alarm_clear = vi.hoisted(() => vi.fn());
const alarm_on_alarm_add_listener = vi.hoisted(() => vi.fn());

vi.mock('../../src/extension/background/storage', async (import_original) => ({
    ...await import_original<typeof import('../../src/extension/background/storage')>(),
    update_capture,
    flush_all,
    write_events,
}));

vi.mock('../../src/extension/background/app_log_storage', () => ({
    get_app_log_transport: () => ({
        write: log_write,
        flush: vi.fn(),
        get_entries: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        clear: vi.fn(),
    }),
}));

vi.mock('../../src/extension/background/keepalive', () => ({
    setup_keepalive_listener: vi.fn(),
    start_keepalive: vi.fn(),
    stop_keepalive: vi.fn(),
}));

function add_listener(): { addListener: ReturnType<typeof vi.fn> } {
    return { addListener: vi.fn() };
}

function install_chrome_mock(): void {
    vi.stubGlobal('self', { addEventListener: vi.fn() });
    vi.stubGlobal('chrome', {
        debugger: {},
        alarms: {
            create: alarm_create,
            clear: alarm_clear,
            onAlarm: { addListener: alarm_on_alarm_add_listener },
        },
        runtime: {
            onInstalled: add_listener(),
            onMessage: add_listener(),
        },
        storage: {
            local: {
                get: storage_get,
                set: storage_set,
            },
        },
        tabs: {
            query: vi.fn().mockResolvedValue([]),
            onActivated: add_listener(),
            onRemoved: add_listener(),
            onCreated: add_listener(),
            onUpdated: add_listener(),
        },
    });
}

const CAPTURE = {
    capture_id: 'capture_1',
    name: 'Capture',
    status: 'capturing',
    started_at: '2026-01-01T00:00:00Z',
    ended_at: null,
    duration_ms: 0,
    start_url: 'https://example.com',
    end_url: null,
    tab_id: 1,
    window_id: null,
    config_snapshot: {},
    stats: { event_count: 0, user_action_count: 0, nav_count: 0, request_count: 0, log_count: 0, error_count: 0, storage_change_count: 0, cookie_change_count: 0, total_body_bytes: 0 },
    tags: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
};

async function import_and_run_cleanup(): Promise<void> {
    await import('../../src/extension/background/service_worker');
    await vi.runAllTimersAsync();
}

beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T01:00:00Z')); // started_at 后 25h
    vi.clearAllMocks();
    install_chrome_mock();
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('SW 重启 duration 恢复', () => {
    test('AC-003: deadline 已过 → capture 立即终态化（reason max_duration）并清键', async () => {
        // deadline = started_at + 24h = 2026-01-02T00:00:00Z；当前 01:00 已过
        storage_get.mockResolvedValue({
            is_capturing: true,
            current_capture: CAPTURE,
            active_capture_id: 'capture_1',
            active_capture_deadline_ms: new Date('2026-01-02T00:00:00Z').getTime(),
        });
        storage_set.mockResolvedValue(undefined);
        update_capture.mockResolvedValue(undefined);
        write_events.mockResolvedValue(undefined);

        await import_and_run_cleanup();

        // 终态化调用存在
        expect(update_capture).toHaveBeenCalled();
        const call_arg = update_capture.mock.calls.at(-1)?.[0] as { status?: string; ended_at?: string };
        expect(call_arg.status).toBe('completed');
        expect(call_arg.ended_at).toBeTruthy();

        // capture_stopped 事件 reason 为 max_duration（AC-005: reason 可达）
        expect(write_events).toHaveBeenCalled();
        const events = write_events.mock.calls.flat(2) as Array<{ data?: { reason?: string }; relative_time_ms?: number }>;
        const stopped = events.find(e => e.data?.reason === 'max_duration');
        expect(stopped).toBeTruthy();
        // f004/test_f003 回归防护：relative_time_ms 在事件顶层（create_base_event 产出），
        // 是相对时长（< 采集 25h）而非绝对 epoch（1.7e12 会红）
        expect(stopped!.relative_time_ms).toBeGreaterThan(0);
        expect(stopped!.relative_time_ms).toBeLessThan(26 * 60 * 60 * 1000);

        // 清键包含 deadline
        const set_calls = storage_set.mock.calls.map(([k]) => k) as Array<Record<string, unknown>>;
        const clear_call = set_calls.find(c => c.active_capture_deadline_ms === null);
        expect(clear_call).toBeTruthy();

        // 不再重建 alarm（deadline 已过，直接终态化）
        expect(alarm_create).not.toHaveBeenCalled();
    });

    test('AC-004: deadline 未过 → alarm 被重建（when=deadline）', async () => {
        // deadline = 2026-01-02T05:00:00Z；当前 01:00 未过
        const deadline_ms = new Date('2026-01-02T05:00:00Z').getTime();
        storage_get.mockResolvedValue({
            is_capturing: true,
            current_capture: CAPTURE,
            active_capture_id: 'capture_1',
            active_capture_deadline_ms: deadline_ms,
        });
        storage_set.mockResolvedValue(undefined);

        await import_and_run_cleanup();

        expect(alarm_create).toHaveBeenCalledWith(
            expect.stringContaining('capture_max_duration'),
            expect.objectContaining({ when: deadline_ms }),
        );
        // 不清键（采集仍在进行）
        const set_calls = storage_set.mock.calls.map(([k]) => k) as Array<Record<string, unknown>>;
        expect(set_calls.some(c => c.active_capture_deadline_ms === null)).toBe(false);
    });

    test('AC-001: alarm 到期（onAlarm）→ stop_capture("max_duration")，stopped 事件 reason=max_duration', async () => {
        // 场景：SW 重启恢复运行态（deadline 未过）后 alarm 到期触发
        const deadline_ms = new Date('2026-01-02T05:00:00Z').getTime();
        storage_get.mockResolvedValue({
            is_capturing: true,
            current_capture: CAPTURE,
            active_capture_id: 'capture_1',
            active_capture_deadline_ms: deadline_ms,
        });
        storage_set.mockResolvedValue(undefined);
        update_capture.mockResolvedValue(undefined);
        write_events.mockResolvedValue(undefined);

        await import_and_run_cleanup();
        expect(alarm_create).toHaveBeenCalledWith(
            expect.stringContaining('capture_max_duration'),
            expect.objectContaining({ when: deadline_ms }),
        );

        // 触发顶层注册的 onAlarm listener（name=capture_max_duration）
        const listener = alarm_on_alarm_add_listener.mock.calls.at(-1)?.[0] as ((alarm: { name: string }) => void) | undefined;
        expect(listener).toBeTypeOf('function');
        await listener!({ name: 'capture_max_duration' });
        await vi.runAllTimersAsync();

        // capture_stopped 事件 reason 为 max_duration（AC-001/AC-005: reason 可达）
        const events = write_events.mock.calls.flat(2) as Array<{ data?: { reason?: string } }>;
        const stopped = events.find(e => e.data?.reason === 'max_duration');
        expect(stopped).toBeTruthy();
        expect(stopped!.data!.reason).toBe('max_duration');

        // capture 终态化 completed
        const call_arg = update_capture.mock.calls.at(-1)?.[0] as { status?: string };
        expect(call_arg.status).toBe('completed');

        // 清 active 键（含 deadline）
        const set_calls = storage_set.mock.calls.map(([k]) => k) as Array<Record<string, unknown>>;
        expect(set_calls.some(c => c.active_capture_deadline_ms === null)).toBe(true);
    });
});
