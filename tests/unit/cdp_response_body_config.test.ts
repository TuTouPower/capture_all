// tests/unit/cdp_response_body_config.test.ts
// 验证 capture_response_body=false 时不发起 Network.getResponseBody / streamResourceContent
// t119 迁移：原直驱 cdp_handler handle_cdp_event，改为生产 network_capture 路径驱动。
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mock_chrome_debugger } from '../support/__mocks__/chrome_debugger';

(globalThis as any).chrome = {
    ...(globalThis as any).chrome || {},
    dbg: mock_chrome_debugger,
    debugger: mock_chrome_debugger,
    webRequest: {
        onBeforeRequest: { addListener: vi.fn(), removeListener: vi.fn() },
        onBeforeSendHeaders: { addListener: vi.fn(), removeListener: vi.fn() },
        onHeadersReceived: { addListener: vi.fn(), removeListener: vi.fn() },
        onCompleted: { addListener: vi.fn(), removeListener: vi.fn() },
        onErrorOccurred: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    storage: {
        local: {
            get: vi.fn().mockResolvedValue({}),
            set: vi.fn().mockResolvedValue(undefined),
        },
    },
    runtime: {
        getManifest: vi.fn().mockReturnValue({ version: '1.0.0' }),
        onInstalled: { addListener: vi.fn() },
        onMessage: { addListener: vi.fn() },
    },
    tabs: {
        query: vi.fn().mockResolvedValue([]),
        get: vi.fn().mockResolvedValue({ id: 1, url: 'https://example.com' }),
        sendMessage: vi.fn().mockResolvedValue(undefined),
        onActivated: { addListener: vi.fn() },
        onUpdated: { addListener: vi.fn() },
        onRemoved: { addListener: vi.fn() },
        onCreated: { addListener: vi.fn() },
    },
};

import {
    start_network_capture,
    stop_network_capture,
    enable_response_body_capture,
} from '../../src/extension/background/network_capture';

function make_cfg(capture_response_body: boolean) {
    return {
        redact_sensitive_headers: false,
        redact_url_query: false,
        redact_data: false,
        capture_request_body: false,
        capture_response_body,
        max_body_capture_bytes: 104857600,
        inline_text_max_bytes: 32768,
    };
}

describe('capture_response_body config honored（network_capture 路径）', () => {
    let emitted: Array<{ event: any; data: any }>;
    let sendCommand_spy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
        try { stop_network_capture(); } catch { /* not started */ }
        mock_chrome_debugger.reset();
        vi.clearAllMocks();
        emitted = [];
        sendCommand_spy = vi.spyOn(mock_chrome_debugger, 'sendCommand');
    });

    afterEach(() => {
        try { stop_network_capture(); } catch { /* not started */ }
        vi.restoreAllMocks();
    });

    async function start_capture(capture_response_body: boolean): Promise<void> {
        start_network_capture('cap_body_cfg', Date.now(), make_cfg(capture_response_body), 1, (payload: any) => emitted.push(payload));
        await enable_response_body_capture(1, false);
    }

    function send_request(req_id: string, streaming = false): void {
        mock_chrome_debugger.emit_event({ tabId: 1 }, 'Network.requestWillBeSent', {
            requestId: req_id,
            type: 'Fetch',
            request: { url: `https://example.com/${req_id}`, method: 'GET' },
        });
        mock_chrome_debugger.emit_event({ tabId: 1 }, 'Network.responseReceived', {
            requestId: req_id,
            type: 'Fetch',
            response: {
                url: `https://example.com/${req_id}`,
                status: 200,
                headers: streaming ? { 'Content-Type': 'text/event-stream' } : { 'Content-Type': 'application/json' },
            },
        });
    }

    it('capture_response_body=false: loadingFinished 不调 Network.getResponseBody', async () => {
        await start_capture(false);
        send_request('r1');
        mock_chrome_debugger.emit_event({ tabId: 1 }, 'Network.loadingFinished', { requestId: 'r1' });
        await new Promise((r) => setTimeout(r, 50));

        const get_body_calls = sendCommand_spy.mock.calls.filter((c) => (c[1] as string) === 'Network.getResponseBody');
        expect(get_body_calls.length).toBe(0);
        const stream_calls = sendCommand_spy.mock.calls.filter((c) => (c[1] as string) === 'Network.streamResourceContent');
        expect(stream_calls.length).toBe(0);

        // 仍 emit 主网络事件（body 状态 not_enabled）
        const primary = emitted.find((e) => e.data?.request_id === 'r1');
        expect(primary).toBeDefined();
        expect(primary!.data.response_body_status).toBe('not_enabled');
        expect(primary!.data.response_body).toBeNull();
    });

    it('capture_response_body=false: 流式响应不调 streamResourceContent', async () => {
        await start_capture(false);
        send_request('r2', true);
        await new Promise((r) => setTimeout(r, 20));

        const stream_calls = sendCommand_spy.mock.calls.filter((c) => (c[1] as string) === 'Network.streamResourceContent');
        expect(stream_calls.length).toBe(0);
    });

    it('capture_response_body=true: 行为不变（仍调 getResponseBody）', async () => {
        mock_chrome_debugger.set_command_response('Network.getResponseBody', { body: '{}', base64Encoded: false });
        await start_capture(true);
        send_request('r3');
        mock_chrome_debugger.emit_event({ tabId: 1 }, 'Network.loadingFinished', { requestId: 'r3' });
        await new Promise((r) => setTimeout(r, 50));

        const get_body_calls = sendCommand_spy.mock.calls.filter((c) => (c[1] as string) === 'Network.getResponseBody');
        expect(get_body_calls.length).toBe(1);
    });
});
