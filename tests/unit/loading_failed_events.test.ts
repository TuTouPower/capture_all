// tests/unit/loading_failed_events.test.ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
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

import { start_network_capture, stop_network_capture, enable_response_body_capture, _cdp_request_meta_for_test } from '../../src/extension/background/network_capture';
describe('loadingFailed 带 meta（生产 network_capture 路径）', () => {
    let emitted: Array<{ event: any; data: any }>;

    beforeEach(async () => {
        vi.useFakeTimers();
        try { stop_network_capture(); } catch { /* not started */ }
        mock_chrome_debugger.reset();
        vi.clearAllMocks();
        emitted = [];
        start_network_capture('cap_lf_meta', Date.now(), {
            redact_sensitive_headers: false, redact_url_query: false, redact_data: false,
            capture_request_body: false, capture_response_body: true,
            max_body_capture_bytes: 104857600, inline_text_max_bytes: 32768,
        }, 1, (payload: any) => emitted.push(payload));
        await enable_response_body_capture(1, false);
    });

    afterEach(() => {
        vi.useRealTimers();
        try { stop_network_capture(); } catch { /* not started */ }
    });

    it('已有 meta 时 loadingFailed 不发立即主事件（t119 f001）', async () => {
        mock_chrome_debugger.emit_event({ tabId: 1 }, 'Network.requestWillBeSent', {
            requestId: 'LF1',
            type: 'Fetch',
            request: { url: 'https://example.com/lf', method: 'GET' },
        });
        expect(_cdp_request_meta_for_test.has('root:LF1')).toBe(true);

        mock_chrome_debugger.emit_event({ tabId: 1 }, 'Network.loadingFailed', {
            requestId: 'LF1',
            errorText: 'net::ERR_CONNECTION_RESET',
            type: 'Fetch',
        });
        // 生产语义：不发立即失败主事件（失败状态经 CDP loadingFailed→cdp_body_results 消费路径表达）
        expect(emitted.length).toBe(0);
        // meta 保留（生产语义：等待消费路径，非 orphan 职责）
        expect(_cdp_request_meta_for_test.has('root:LF1')).toBe(true);

        // orphan 3s 兜底触发不抛错（handler 未设时早退）
        await vi.advanceTimersByTimeAsync(3000);
        // marker 清理由 t112 loadingFinished→loadingFailed 序列用例锁定（此处未建立 marker）
    });
});
