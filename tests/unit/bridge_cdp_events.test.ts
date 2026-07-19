// tests/unit/bridge_cdp_events.test.ts
// CDP events 完整性：101 条跨轮询不丢 + CDP error 终态
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
    handle_cdp_events,
    handle_cdp_start,
    handle_cdp_stop,
} from '../../src/bridge/cdp_handler';

class MockWebSocket {
    static instance: MockWebSocket | null = null;

    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;
    send = vi.fn();

    constructor(_url: string) {
        MockWebSocket.instance = this;
    }

    emit(message: Record<string, unknown>): void {
        this.onmessage?.({ data: JSON.stringify(message) });
    }
}

async function start_session(): Promise<string> {
    const result = await handle_cdp_start({} as never, {
        port: 9222,
        tab_url: 'https://example.com',
        redact_data: false,
        max_body_capture_bytes: 1024,
    });
    const body = result.body as { ok: boolean; session_key: string };
    expect(result.status).toBe(200);
    expect(body.ok).toBe(true);
    return body.session_key;
}

function emit_completed_request(req_id: string): void {
    const socket = MockWebSocket.instance;
    expect(socket).not.toBeNull();
    socket?.emit({
        method: 'Network.requestWillBeSent',
        params: {
            requestId: req_id,
            type: 'Fetch',
            request: { url: `https://example.com/${req_id}`, method: 'GET', headers: {} },
        },
    });
    socket?.emit({
        method: 'Network.responseReceived',
        params: {
            requestId: req_id,
            type: 'Fetch',
            response: { url: `https://example.com/${req_id}`, status: 200, headers: {} },
        },
    });
    socket?.emit({
        method: 'Network.loadingFailed',
        params: { requestId: req_id },
    });
}

async function poll_session(session_key: string) {
    const result = await handle_cdp_events(
        {} as never,
        new URL(`http://127.0.0.1/cdp/events?session_key=${session_key}`),
    );
    return (result.body as { events: Array<Record<string, unknown>> }).events;
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

describe('CDP events integrity', () => {
    test('101 条 completed 跨两次轮询全部返回不丢失', async () => {
        const session_key = await start_session();
        const socket = MockWebSocket.instance!;
        socket.onopen?.();

        // 发 101 条已完成请求
        for (let i = 0; i < 101; i++) {
            emit_completed_request(`r${i}`);
        }

        const first = await poll_session(session_key);
        expect(first.length).toBe(100);

        const second = await poll_session(session_key);
        expect(second.length).toBe(1);

        // 第三次应该为空（全部已取）
        const third = await poll_session(session_key);
        expect(third.length).toBe(0);

        await handle_cdp_stop({ session_key });
    });

    test('CDP error response 后事件终态 cdp_failed 且下次轮询可返回', async () => {
        const session_key = await start_session();
        const socket = MockWebSocket.instance!;
        socket.onopen?.();

        // 触发 getResponseBody
        socket.emit({
            method: 'Network.requestWillBeSent',
            params: {
                requestId: 'r-err',
                type: 'Fetch',
                request: { url: 'https://example.com/r-err', method: 'GET', headers: {} },
            },
        });
        socket.emit({
            method: 'Network.responseReceived',
            params: {
                requestId: 'r-err',
                type: 'Fetch',
                response: { url: 'https://example.com/r-err', status: 200, headers: {} },
            },
        });
        socket.emit({
            method: 'Network.loadingFinished',
            params: { requestId: 'r-err' },
        });

        // send 应该被调用发出 getResponseBody 命令；seq=2（Network.enable 占 1）
        expect(socket.send).toHaveBeenCalled();
        const last_call = socket.send.mock.calls.at(-1)?.[0] as string;
        expect(last_call).toContain('Network.getResponseBody');

        // CDP 返回 error
        const sent = JSON.parse(last_call);
        socket.emit({ id: sent.id, error: { code: -32000, message: 'No resource with given identifier' } });

        const events = await poll_session(session_key);
        expect(events.length).toBe(1);
        expect(events[0].response_body_status).toBe('cdp_failed');

        await handle_cdp_stop({ session_key });
    });
});
