// tests/unit/cdp_ws_close_terminal.test.ts
// t158 AC-001/002/005: CDP WS post-open close 后 session terminal 语义（生产路径）
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
    handle_cdp_events,
    handle_cdp_start,
    handle_cdp_stop,
    _get_session_for_test,
} from '../../src/bridge/cdp_handler';

class MockWebSocket {
    static instance: MockWebSocket | null = null;

    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;
    send = vi.fn();
    close = vi.fn();

    constructor(_url: string) {
        MockWebSocket.instance = this;
    }

    emit(message: Record<string, unknown>): void {
        this.onmessage?.({ data: JSON.stringify(message) });
    }
}

async function start_session(): Promise<string> {
    const p = handle_cdp_start({} as never, {
        port: 9222,
        tab_url: 'https://example.com',
        redact_data: false,
        max_body_capture_bytes: 1024,
    });
    await vi.advanceTimersByTimeAsync(0);
    MockWebSocket.instance?.onopen?.();
    const result = await p;
    const body = result.body as { ok: boolean; session_key: string };
    expect(result.status).toBe(200);
    expect(body.ok).toBe(true);
    return body.session_key;
}

function emit_request_start(socket: MockWebSocket, req_id: string): void {
    socket.emit({
        method: 'Network.requestWillBeSent',
        params: {
            requestId: req_id,
            type: 'Fetch',
            request: { url: `https://example.com/${req_id}`, method: 'GET', headers: {} },
        },
    });
}

async function poll_session(session_key: string) {
    return handle_cdp_events(
        {} as never,
        new URL(`http://127.0.0.1/cdp/events?session_key=${session_key}`),
    );
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        json: async () => [{
            id: 'target-1',
            url: 'https://example.com',
            title: 'Example',
            type: 'page',
            webSocketDebuggerUrl: 'ws://127.0.0.1/devtools/page/target-1',
        }],
    }));
    MockWebSocket.instance = null;
});

afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('CDP WS post-open close terminal', () => {
    test('AC-001: onopen 成功后触发 onclose，/cdp/events 返回 410 而非 200 空数组', async () => {
        const session_key = await start_session();
        const socket = MockWebSocket.instance!;
        expect(socket.close).not.toHaveBeenCalled();

        socket.onclose?.();

        const res = await poll_session(session_key);
        expect(res.status).toBe(410);
        const body = res.body as { ok: boolean; error?: { code: string; reason: string } };
        expect(body.ok).toBe(false);
        expect(body.error?.code).toBe('cdp_session_terminal');
        expect(body.error?.reason).toBe('ws_closed');

        await handle_cdp_stop({ session_key });
    });

    test('AC-002: post-open close 后 pending 事件被终态化为 cdp_failed 且随 410 可观察', async () => {
        const session_key = await start_session();
        const socket = MockWebSocket.instance!;
        emit_request_start(socket, 'r1');
        emit_request_start(socket, 'r2');

        socket.onclose?.();

        const res = await poll_session(session_key);
        expect(res.status).toBe(410);
        const body = res.body as { events: Array<Record<string, unknown>> };
        expect(body.events.length).toBe(2);
        for (const evt of body.events) {
            expect(evt.response_body_status).toBe('cdp_failed');
        }

        await handle_cdp_stop({ session_key });
    });

    test('AC-005: post-open close 后 WS、timer、映射被清理，terminal TTL 自动回收', async () => {
        const session_key = await start_session();
        const socket = MockWebSocket.instance!;

        socket.onclose?.();

        const session = _get_session_for_test(session_key)!;
        expect(session.terminal_reason).toBe('ws_closed');
        expect(session.cdp_ws).toBeNull();
        expect(socket.close).toHaveBeenCalled();
        expect(session.body_seq_to_req_id.size).toBe(0);
        // 幂等：二次 close 不改变状态
        socket.onclose?.();
        expect(session.terminal_reason).toBe('ws_closed');

        // terminal TTL 到期后 session 自动销毁（不再驻留泄漏）
        await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
        expect(_get_session_for_test(session_key)).toBeNull();
        const res = await poll_session(session_key);
        expect(res.status).toBe(404);
    });

    test('AC-005b: stop 是正常结束，不产生 terminal 标记', async () => {
        const session_key = await start_session();
        await handle_cdp_stop({ session_key });
        const res = await poll_session(session_key);
        expect(res.status).toBe(404); // session 已销毁，未知 session 仍 404
    });
});
