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
    close = vi.fn();

    constructor(_url: string) {
        MockWebSocket.instance = this;
    }

    emit(message: Record<string, unknown>): void {
        this.onmessage?.({ data: JSON.stringify(message) });
    }
}

async function start_session(redact_data: boolean): Promise<string> {
    const result = await handle_cdp_start({} as never, {
        port: 9222,
        tab_url: 'https://example.com',
        redact_data,
        redact_sensitive_headers: true,
        redact_url_query: true,
        max_body_capture_bytes: 1024,
    });
    const body = result.body as {
        ok: boolean;
        session_key: string;
    };

    expect(result.status).toBe(200);
    expect(body.ok).toBe(true);
    return body.session_key;
}

function emit_completed_request(): void {
    const socket = MockWebSocket.instance;
    expect(socket).not.toBeNull();
    socket?.onopen?.();
    socket?.emit({
        method: 'Network.requestWillBeSent',
        params: {
            requestId: 'request-1',
            type: 'Fetch',
            request: {
                url: 'https://example.com/api?token=private-value&name=test',
                method: 'GET',
                headers: {
                    Authorization: 'Bearer private-value',
                    Accept: 'application/json',
                },
            },
        },
    });
    socket?.emit({
        method: 'Network.responseReceived',
        params: {
            requestId: 'request-1',
            type: 'Fetch',
            response: {
                url: 'https://example.com/api?token=private-value&name=test',
                status: 200,
                headers: {
                    'Set-Cookie': 'session=private-value',
                    'Content-Type': 'application/json',
                },
            },
        },
    });
    socket?.emit({
        method: 'Network.loadingFailed',
        params: { requestId: 'request-1' },
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

describe('external CDP redaction', () => {
    test('redacts sensitive URL parameters and headers when enabled', async () => {
        const session_key = await start_session(true);
        emit_completed_request();

        const events = await poll_session(session_key);

        expect(events).toHaveLength(1);
        expect(events[0].url).toContain(
            ['token', '=%5BREDACTED%5D'].join(''),
        );
        expect(events[0].url).toContain('name=test');
        expect(events[0].request_headers).toEqual({
            Authorization: '[REDACTED]',
            Accept: 'application/json',
        });
        expect(events[0].response_headers).toEqual({
            'Set-Cookie': '[REDACTED]',
            'Content-Type': 'application/json',
        });

        await handle_cdp_stop({ session_key });
    });

    test('keeps URL parameters and headers when redaction is disabled', async () => {
        const session_key = await start_session(false);
        emit_completed_request();

        const events = await poll_session(session_key);

        expect(events).toHaveLength(1);
        expect(events[0].url).toBe(
            'https://example.com/api?token=private-value&name=test',
        );
        expect(events[0].request_headers).toEqual({
            Authorization: 'Bearer private-value',
            Accept: 'application/json',
        });
        expect(events[0].response_headers).toEqual({
            'Set-Cookie': 'session=private-value',
            'Content-Type': 'application/json',
        });

        await handle_cdp_stop({ session_key });
    });
});
