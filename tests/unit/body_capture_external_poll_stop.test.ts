// tests/unit/body_capture_external_poll_stop.test.ts
// 验证 external CDP bridge 轮询 stop 后真正停止：不再调度、in-flight 不脏写、重入无双 poll
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const detect_external_cdp = vi.hoisted(() => vi.fn());
const start_external_cdp = vi.hoisted(() => vi.fn());
const poll_external_cdp_events = vi.hoisted(() => vi.fn());
const stop_external_cdp = vi.hoisted(() => vi.fn());
const enable_response_body_capture = vi.hoisted(() => vi.fn());

vi.mock('../../src/extension/background/external_cdp_bridge_client', () => ({
    detect_external_cdp,
    start_external_cdp,
    poll_external_cdp_events,
    stop_external_cdp,
}));

vi.mock('../../src/extension/background/network_capture', () => ({
    enable_response_body_capture,
}));

function make_config(overrides: Record<string, unknown> = {}) {
    return {
        capture_response_body: true,
        capture_network: true,
        redact_data: false,
        redact_sensitive_headers: false,
        redact_url_query: false,
        max_body_capture_bytes: 1024,
        ...overrides,
    } as any;
}

function make_deps(on_network_request: ReturnType<typeof vi.fn>) {
    return {
        get_active_tab_url: vi.fn(async () => 'https://example.com'),
        get_bridge_config: vi.fn(async () => ({ bridge_url: 'http://127.0.0.1:17831', bridge_token: 'tok' })),
        on_network_request,
    };
}

function bridge_event(n: number) {
    return {
        request_id: `bridge_${n}`,
        url: `https://example.com/data${n}`,
        method: 'GET',
        status_code: 200,
        response_body: 'body',
        response_body_status: 'captured',
        timestamp: Date.now(),
        tab_id: 1,
        resource_type: 'xhr',
    };
}

describe('external body poll stop 生命周期', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.useFakeTimers();
        vi.clearAllMocks();
        enable_response_body_capture.mockResolvedValue({ success: false, error: 'Another debugger is already attached' });
        detect_external_cdp.mockResolvedValue({ success: true, cdp_port: 9222 });
        start_external_cdp.mockResolvedValue({ success: true, session_key: 'sess-1' });
        poll_external_cdp_events.mockResolvedValue([]);
        stop_external_cdp.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('AC-001: stop 后 in-flight poll resolve 不再写网络事件', async () => {
        const on_network_request = vi.fn();
        const { start_body_capture, stop_body_capture } = await import('../../src/extension/background/body_capture_coordinator');

        let resolve_poll: (v: any[]) => void = () => {};
        poll_external_cdp_events.mockImplementation(() => new Promise((r) => { resolve_poll = r; }));

        const result = await start_body_capture('cap', Date.now(), make_config(), 1, make_deps(on_network_request) as any, null);
        expect(result.mode).toBe('external_cdp_bridge');

        // 首次 poll 触发，进入 in-flight
        await vi.advanceTimersByTimeAsync(500);
        expect(poll_external_cdp_events).toHaveBeenCalledTimes(1);

        // stop 时 poll 仍在 in-flight
        await stop_body_capture();

        // in-flight resolve，返回事件
        resolve_poll([bridge_event(1)]);
        await vi.advanceTimersByTimeAsync(0);

        expect(on_network_request).not.toHaveBeenCalled();
    });

    it('AC-001b: stop_body_capture_with_cleanup 后 in-flight poll resolve 不写网络事件', async () => {
        const on_network_request = vi.fn();
        const { start_body_capture, stop_body_capture_with_cleanup } = await import('../../src/extension/background/body_capture_coordinator');

        let resolve_poll: (v: any[]) => void = () => {};
        poll_external_cdp_events.mockImplementation(() => new Promise((r) => { resolve_poll = r; }));

        const result = await start_body_capture('cap', Date.now(), make_config(), 1, make_deps(on_network_request) as any, null);
        expect(result.mode).toBe('external_cdp_bridge');

        await vi.advanceTimersByTimeAsync(500);
        expect(poll_external_cdp_events).toHaveBeenCalledTimes(1);

        await stop_body_capture_with_cleanup({ get_bridge_config: async () => ({ bridge_url: 'http://127.0.0.1:17831', bridge_token: 'tok' }) });

        resolve_poll([bridge_event(1)]);
        await vi.advanceTimersByTimeAsync(0);

        expect(on_network_request).not.toHaveBeenCalled();
        expect(stop_external_cdp).toHaveBeenCalled();
    });

    it('AC-002: stop 后推进 1s 无新 poll 触发网络写入', async () => {
        const on_network_request = vi.fn();
        const { start_body_capture, stop_body_capture } = await import('../../src/extension/background/body_capture_coordinator');

        poll_external_cdp_events.mockResolvedValue([bridge_event(1)]);

        const result = await start_body_capture('cap', Date.now(), make_config(), 1, make_deps(on_network_request) as any, null);
        expect(result.mode).toBe('external_cdp_bridge');

        await vi.advanceTimersByTimeAsync(500);
        const calls_after_first = on_network_request.mock.calls.length;
        expect(calls_after_first).toBe(1);

        await stop_body_capture();

        const poll_calls_before = poll_external_cdp_events.mock.calls.length;
        await vi.advanceTimersByTimeAsync(2000);
        expect(poll_external_cdp_events.mock.calls.length).toBe(poll_calls_before);
        expect(on_network_request.mock.calls.length).toBe(calls_after_first);
    });

    it('AC-003: external active 时重入 start，同时最多一路 poll', async () => {
        const on_network_request = vi.fn();
        const { start_body_capture, stop_body_capture } = await import('../../src/extension/background/body_capture_coordinator');

        const result1 = await start_body_capture('cap1', Date.now(), make_config(), 1, make_deps(on_network_request) as any, null);
        expect(result1.mode).toBe('external_cdp_bridge');

        // 重入
        const result2 = await start_body_capture('cap2', Date.now(), make_config(), 1, make_deps(on_network_request) as any, null);
        expect(result2.mode).toBe('external_cdp_bridge');

        poll_external_cdp_events.mockResolvedValue([bridge_event(1), bridge_event(2)]);
        await vi.advanceTimersByTimeAsync(500);

        // 一轮 poll 应产生两条事件（无双 poll 双写）
        expect(poll_external_cdp_events.mock.calls.length).toBe(1);
        expect(on_network_request.mock.calls.length).toBe(2);

        await stop_body_capture();
    });

    it('AC-004: 首轮 poll 已 in-flight 时重入 start，旧闭包 resolve 不写、新 poll 单路', async () => {
        const on_network_request = vi.fn();
        const { start_body_capture, stop_body_capture } = await import('../../src/extension/background/body_capture_coordinator');

        let resolve_poll: (v: any[]) => void = () => {};
        poll_external_cdp_events.mockImplementation(() => new Promise((r) => { resolve_poll = r; }));

        const result1 = await start_body_capture('cap1', Date.now(), make_config(), 1, make_deps(on_network_request) as any, null);
        expect(result1.mode).toBe('external_cdp_bridge');

        // 首轮 poll 触发并进入 in-flight（promise 挂起）
        await vi.advanceTimersByTimeAsync(500);
        expect(poll_external_cdp_events).toHaveBeenCalledTimes(1);

        // 首轮 poll 仍 in-flight 时重入 start（T095: 先 stop_poll 置 poll_stopped + 清 timer）
        const result2 = await start_body_capture('cap2', Date.now(), make_config(), 1, make_deps(on_network_request) as any, null);
        expect(result2.mode).toBe('external_cdp_bridge');

        // 旧闭包 resolve 返回事件 → poll_stopped 检查拦截，不写网络事件
        resolve_poll([bridge_event(1)]);
        await vi.advanceTimersByTimeAsync(0);
        expect(on_network_request).not.toHaveBeenCalled();

        // 新闭包从 500ms 后开始新一轮 poll → 单路新 poll（总共 2 次：旧 1 + 新 1）
        await vi.advanceTimersByTimeAsync(500);
        expect(poll_external_cdp_events).toHaveBeenCalledTimes(2);
        expect(on_network_request).not.toHaveBeenCalled();

        await stop_body_capture();
    });
});
