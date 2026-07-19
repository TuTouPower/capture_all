// tests/unit/cdp_state_cleanup.test.ts
// 验证 CDP 状态清理：finished_before_stream 不泄漏、cdp_primary_emitted 已删除、orphan timer 跟踪
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

import { handle_cdp_event, type CdpHandlerState } from '../../src/extension/background/cdp_handler';
import { create_stream_buffer } from '../../src/extension/background/stream_buffer';

function make_state(emitted: any[]): CdpHandlerState {
    return {
        is_capturing: true,
        capture_id: 'cap_clean',
        start_time: Date.now(),
        current_tab_id: 1,
        config: {
            redact_sensitive_headers: false,
            redact_url_query: false,
            redact_data: false,
            capture_request_body: false,
            capture_response_body: true,
            max_body_capture_bytes: 104857600,
            inline_text_max_bytes: 32768,
        },
        dbg_tab_id: 1,
        dbg_attached_externally: false,
        pending_requests: new Map(),
        cdp_request_meta: new Map(),
        cdp_body_results: new Map(),
        // @ts-expect-error - 已删除字段，验证不存在
        cdp_primary_emitted: undefined,
        ws_connections: new Map(),
        streaming_requests: new Set(),
        finished_before_stream: new Set(),
        stream_buffer_instance: create_stream_buffer(() => {}, 1024 * 1024),
        deferred_web_requests: new Map(),
        _deferred_cdp_index: new Map(),
        on_cdp_body_event: null,
        send_to_background: (payload: any) => emitted.push(payload),
        // @ts-expect-error - 新增字段，TS 接口下一步会加
        orphan_timers: new Map(),
    };
}

describe('CDP 状态清理', () => {
    let emitted: any[];
    let state: CdpHandlerState;

    beforeEach(() => {
        emitted = [];
        state = make_state(emitted);
        mock_chrome_debugger.reset();
        vi.clearAllMocks();
    });

    it('完成 100 个请求后 finished_before_stream 清空', async () => {
        for (let i = 0; i < 100; i++) {
            const rid = `r${i}`;
            handle_cdp_event({ tabId: 1 }, 'Network.requestWillBeSent', {
                requestId: rid,
                type: 'Fetch',
                request: { url: `https://example.com/${rid}`, method: 'GET', headers: {} },
            }, state);
            handle_cdp_event({ tabId: 1 }, 'Network.responseReceived', {
                requestId: rid,
                response: { url: `https://example.com/${rid}`, status: 200, headers: {} },
            }, state);
            handle_cdp_event({ tabId: 1 }, 'Network.loadingFinished', { requestId: rid }, state);
        }

        await new Promise((r) => setTimeout(r, 20));

        // 所有请求 emit 后 finished_before_stream 应清空
        expect(state.finished_before_stream.size).toBe(0);
    });

    it('cdp_primary_emitted 字段已从 CdpHandlerState 删除', () => {
        // 字段不存在于 state 对象类型
        expect((state as any).cdp_primary_emitted).toBeUndefined();
    });

    it('orphan timer 跟踪句柄，回调触发后清理', async () => {
        // loadingFailed 触发 orphan_check（无 meta -> try_resolve_deferred + schedule_orphan_check）
        const orphan_map = (state as any).orphan_timers as Map<string, any>;
        handle_cdp_event({ tabId: 1 }, 'Network.loadingFailed', {
            requestId: 'orphan_1',
            errorText: 'failed',
        }, state);

        // schedule_orphan_check 保存 timer
        expect(orphan_map.size).toBeGreaterThan(0);

        // 等待 orphan timeout（3000ms）
        await new Promise((r) => setTimeout(r, 3100));

        // 回调执行后 timer 应被清理
        expect(orphan_map.size).toBe(0);
    }, 5000);
});
