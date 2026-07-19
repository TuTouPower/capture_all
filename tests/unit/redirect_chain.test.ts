// tests/unit/redirect_chain.test.ts
// 验证 CDP 重定向链保留前一跳证据
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

import { start_network_capture, stop_network_capture, enable_response_body_capture } from '../../src/extension/background/network_capture';

function make_cfg(overrides: Record<string, any> = {}) {
    return {
        redact_sensitive_headers: false,
        redact_url_query: false,
        redact_data: false,
        capture_request_body: false,
        capture_response_body: true,
        max_body_capture_bytes: 104857600,
        inline_text_max_bytes: 32768,
        ...overrides,
    };
}

describe('CDP 重定向链保留', () => {
    let emitted: any[];

    beforeEach(async () => {
        try { await stop_network_capture(); } catch {}
        mock_chrome_debugger.reset();
        vi.clearAllMocks();
        emitted = [];
    });

    it('301 → 200 重定向链 emit 前一跳 + 最终事件', async () => {
        start_network_capture('cap_redir', Date.now(), make_cfg(), 1, (p: any) => emitted.push(p));
        await enable_response_body_capture(1, false);

        // 第一跳：GET /old
        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.requestWillBeSent',
            { requestId: 'redir_1', type: 'Document', request: { url: 'https://example.com/old', method: 'GET', headers: {} } },
        );
        // 第一跳响应：301 + Location
        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.responseReceived',
            { requestId: 'redir_1', type: 'Document', response: { url: 'https://example.com/old', status: 301, headers: { Location: '/new' } } },
        );
        // 第二跳：同一 requestId，带 redirectResponse
        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.requestWillBeSent',
            {
                requestId: 'redir_1',
                type: 'Document',
                request: { url: 'https://example.com/new', method: 'GET', headers: {} },
                redirectResponse: { url: 'https://example.com/old', status: 301, headers: { Location: '/new' } },
            },
        );
        // 第二跳响应：200
        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.responseReceived',
            { requestId: 'redir_1', type: 'Document', response: { url: 'https://example.com/new', status: 200, headers: {} } },
        );
        // 第二跳完成
        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.loadingFinished',
            { requestId: 'redir_1' },
        );

        await new Promise((r) => setTimeout(r, 20));

        // 至少 2 个事件（前一跳 + 最终）
        expect(emitted.length).toBeGreaterThanOrEqual(2);

        const status_codes = emitted.map((e) => e.data?.status_code).filter((s: any) => s !== null && s !== undefined);
        expect(status_codes).toContain(301);
        expect(status_codes).toContain(200);

        const old_evt = emitted.find((e) => e.data?.url?.includes('/old'));
        const new_evt = emitted.find((e) => e.data?.url?.includes('/new'));
        expect(old_evt).toBeDefined();
        expect(new_evt).toBeDefined();
        expect(old_evt.data.status_code).toBe(301);
        expect(new_evt.data.status_code).toBe(200);
    });
});
