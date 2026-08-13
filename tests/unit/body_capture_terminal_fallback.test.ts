// tests/unit/body_capture_terminal_fallback.test.ts
// t158 AC-004: coordinator 收到 terminal failure 后停止 poll 并更新失败状态
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

function terminal_error(events: unknown[]) {
    return Object.assign(new Error('cdp_session_terminal'), {
        code: 'cdp_session_terminal',
        events,
        reason: 'ws_closed',
    });
}

describe('external poll terminal failure', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.useFakeTimers();
        vi.clearAllMocks();
        enable_response_body_capture.mockResolvedValue({ success: false, error: 'Another debugger is already attached' });
        detect_external_cdp.mockResolvedValue({ success: true, cdp_port: 9222 });
        start_external_cdp.mockResolvedValue({ success: true, session_key: 'sess-1' });
        stop_external_cdp.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('AC-004: terminal failure 后停止后续 poll 调度并更新失败状态', async () => {
        const on_network_request = vi.fn();
        const { start_body_capture, get_body_capture_result, stop_body_capture } = await import('../../src/extension/background/body_capture_coordinator');

        // 首轮 poll 抛 terminal 错误（带最后一批事件）
        poll_external_cdp_events.mockRejectedValueOnce(terminal_error([bridge_event(1)]));

        const result = await start_body_capture('cap', Date.now(), make_config(), 1, make_deps(on_network_request) as any, null);
        expect(result.mode).toBe('external_cdp_bridge');
        expect(result.status).toBe('active');

        await vi.advanceTimersByTimeAsync(500);

        // 最后一批终态事件已写入
        expect(on_network_request).toHaveBeenCalledTimes(1);

        // 主动 stop bridge session（释放 terminal session 内存）
        expect(stop_external_cdp).toHaveBeenCalledWith(expect.anything(), 'sess-1');

        // 状态更新为 failed
        const status = get_body_capture_result();
        expect(status.status).toBe('failed');
        expect(String(status.message)).toContain('terminated');

        // 后续不再调度 poll
        const calls_before = poll_external_cdp_events.mock.calls.length;
        await vi.advanceTimersByTimeAsync(2000);
        expect(poll_external_cdp_events.mock.calls.length).toBe(calls_before);

        await stop_body_capture();
    });

    it('AC-004b: 非 terminal 错误维持 best-effort 重试（不停止 poll）', async () => {
        const on_network_request = vi.fn();
        const { start_body_capture, get_body_capture_result, stop_body_capture } = await import('../../src/extension/background/body_capture_coordinator');

        poll_external_cdp_events.mockRejectedValueOnce(new Error('bridge_unavailable'));
        poll_external_cdp_events.mockResolvedValueOnce([]);

        const result = await start_body_capture('cap', Date.now(), make_config(), 1, make_deps(on_network_request) as any, null);
        expect(result.mode).toBe('external_cdp_bridge');

        await vi.advanceTimersByTimeAsync(500);
        await vi.advanceTimersByTimeAsync(500);

        // 仍调度 poll（2 次：失败 1 次 + 重试 1 次），状态保持 active
        expect(poll_external_cdp_events.mock.calls.length).toBe(2);
        expect(get_body_capture_result().status).toBe('active');

        await stop_body_capture();
    });
});
