// tests/unit/sse_body_cap.test.ts
// 验证 SSE 长流累计字节超 max_body_capture_bytes 后停止追加并标 too_large
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
    storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) } },
    runtime: { getManifest: vi.fn().mockReturnValue({ version: '1.0.0' }), onInstalled: { addListener: vi.fn() }, onMessage: { addListener: vi.fn() } },
    tabs: { query: vi.fn().mockResolvedValue([]), get: vi.fn().mockResolvedValue({ id: 1, url: 'https://example.com' }), sendMessage: vi.fn().mockResolvedValue(undefined), onActivated: { addListener: vi.fn() }, onUpdated: { addListener: vi.fn() }, onRemoved: { addListener: vi.fn() }, onCreated: { addListener: vi.fn() } },
};

import { start_network_capture, stop_network_capture, enable_response_body_capture } from '../../src/extension/background/network_capture';

function make_cfg(overrides: Record<string, any> = {}) {
    return {
        redact_sensitive_headers: false,
        redact_url_query: false,
        redact_data: false,
        capture_request_body: false,
        capture_response_body: true,
        max_body_capture_bytes: 20, // 极小上限便于触发
        inline_text_max_bytes: 32768,
        ...overrides,
    };
}

describe('SSE 累计字节上限', () => {
    let emitted: any[];

    beforeEach(() => {
        vi.useFakeTimers();
        try { stop_network_capture(); } catch {}
        mock_chrome_debugger.reset();
        vi.clearAllMocks();
        emitted = [];
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('累计字节超 max_body_capture_bytes 后 meta.response_body_status=too_large', async () => {
        start_network_capture('cap_sse', Date.now(), make_cfg(), 1, (p: any) => emitted.push(p));
        await enable_response_body_capture(1, false);

        // 发起 SSE 请求
        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.requestWillBeSent',
            { requestId: 'sse_1', type: 'Fetch', request: { url: 'https://example.com/sse', method: 'GET' } },
        );
        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.responseReceived',
            { requestId: 'sse_1', type: 'Fetch', response: { url: 'https://example.com/sse', status: 200, headers: { 'Content-Type': 'text/event-stream' } } },
        );

        // 模拟多个 dataReceived chunks（10 × 5 = 50 字节，超 max=20）
        for (let i = 0; i < 10; i++) {
            mock_chrome_debugger.emit_event(
                { tabId: 1 },
                'Network.dataReceived',
                { requestId: 'sse_1', dataLength: 5, data: 'aaaaa' },
            );
        }

        // 触发 stream_buffer 时间阈值 flush（1000ms）
        await vi.advanceTimersByTimeAsync(1100);

        // 发 loadingFinished 触发最终 emit
        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.loadingFinished',
            { requestId: 'sse_1' },
        );

        const evt = emitted.find((e) => e.data?.url?.includes('/sse'));
        expect(evt).toBeDefined();
        expect(evt.data.response_body_status).toBe('too_large');
    });
});

