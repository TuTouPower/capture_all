// tests/unit/network_stop_deferred_timers.test.ts
// 验证 stop 时清理 network deferred/orphan timer，迟到回调不跨采集写入
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
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
        local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) },
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
    set_cdp_body_event_handler,
    _deferred_web_requests_for_test,
    _cdp_request_meta_for_test,
    _cdp_body_results_for_test,
    _deferred_cdp_index_for_test,
    _orphan_timers_for_test,
} from '../../src/extension/background/network_capture';
import { DEFERRED_TIMEOUT_MS } from '../../src/extension/background/cdp_handler';

const TAB_ID = 1;

function make_cfg() {
    return {
        redact_sensitive_headers: false,
        redact_url_query: false,
        redact_data: false,
        capture_request_body: false,
        capture_response_body: true,
        max_body_capture_bytes: 1024,
        inline_text_max_bytes: 1024,
    } as any;
}

function emit_request(req_id: string, url: string): void {
    mock_chrome_debugger.emit_event({ tabId: TAB_ID }, 'Network.requestWillBeSent', {
        requestId: req_id,
        type: 'XHR',
        request: { url, method: 'GET', headers: {} },
    });
    mock_chrome_debugger.emit_event({ tabId: TAB_ID }, 'Network.responseReceived', {
        requestId: req_id,
        type: 'XHR',
        response: { url, status: 200, headers: { 'content-type': 'application/json' } },
    });
}

beforeEach(() => {
    vi.useFakeTimers();
    mock_chrome_debugger.reset();
    // AC-002b 覆盖 sendCommand 后须恢复，避免污染后续用例
    const proto = Object.getPrototypeOf(mock_chrome_debugger);
    mock_chrome_debugger.sendCommand = proto.sendCommand.bind(mock_chrome_debugger);
    _deferred_web_requests_for_test.clear();
    _cdp_request_meta_for_test.clear();
    _cdp_body_results_for_test.clear();
    _deferred_cdp_index_for_test.clear();
    _orphan_timers_for_test.clear();
});

afterEach(() => {
    stop_network_capture();
    vi.useRealTimers();
});

describe('network stop 清理 deferred/orphan timer (T103)', () => {
    test('AC-001: stop 后推进时钟，无网络事件写入', async () => {
        const events: any[] = [];
        start_network_capture('cap1', Date.now(), make_cfg(), TAB_ID, (p) => { events.push(p); });
        await mock_chrome_debugger.attach({ tabId: TAB_ID }, '1.3');
        await mock_chrome_debugger.sendCommand({ tabId: TAB_ID }, 'Network.enable', {});

        // 制造 pending deferred：CDP 请求但无 loadingFinished（deferred 超时后写 not_enabled）
        emit_request('req_defer', 'https://example.com/defer');
        // 触发 handle_completed 制造 deferred（需 webRequest onCompleted，但 CDP-first 跳过 attached tab）
        // 直接注入 deferred entry
        _deferred_web_requests_for_test.set('deferred_test', {
            pending: {
                cdp_request_id: 'req_defer', tab_id: TAB_ID, method: 'GET', url: 'https://example.com/defer',
                timestamp: Date.now(), request_headers: {}, response_headers: {},
                request_body: null, request_body_status: 'not_enabled', resource_type: 'xhr', mime_type: null,
            },
            details: { statusCode: 200, timeStamp: Date.now() },
            timer: setTimeout(() => {
                events.push({ deferred_timeout: true, url: 'https://example.com/defer' });
            }, DEFERRED_TIMEOUT_MS),
            pending_cdp_ids: new Set(['root:req_defer']),
        });

        stop_network_capture();

        // 推进时钟超过 DEFERRED_TIMEOUT_MS
        await vi.advanceTimersByTimeAsync(DEFERRED_TIMEOUT_MS + 100);

        // 无事件写入（deferred timer 已清）
        expect(events.length).toBe(0);
    });

    test('AC-002: stop 后再 start 新 capture，旧 timer 不写入新 capture_id', async () => {
        const events: any[] = [];
        start_network_capture('cap_old', Date.now(), make_cfg(), TAB_ID, (p) => { events.push(p); });
        _deferred_web_requests_for_test.set('deferred_old', {
            pending: {
                cdp_request_id: 'req_old', tab_id: TAB_ID, method: 'GET', url: 'https://example.com/old',
                timestamp: Date.now(), request_headers: {}, response_headers: {},
                request_body: null, request_body_status: 'not_enabled', resource_type: 'xhr', mime_type: null,
            },
            details: { statusCode: 200, timeStamp: Date.now() },
            timer: setTimeout(() => {
                events.push({ deferred_timeout: true, url: 'https://example.com/old' });
            }, DEFERRED_TIMEOUT_MS),
            pending_cdp_ids: new Set(['root:req_old']),
        });

        stop_network_capture();
        // 新 capture
        const new_events: any[] = [];
        start_network_capture('cap_new', Date.now(), make_cfg(), TAB_ID, (p) => { new_events.push(p); });

        await vi.advanceTimersByTimeAsync(DEFERRED_TIMEOUT_MS + 100);

        // 新 capture 无旧 timer 写入
        expect(new_events.length).toBe(0);
        expect(events.length).toBe(0);
    });

    test('AC-002b: stop→restart 后 getResponseBody 迟到回调不写新 capture（f001 回归）', async () => {
        const events: any[] = [];
        start_network_capture('cap1', Date.now(), make_cfg(), TAB_ID, (p) => { events.push(p); });
        const enable_res = await enable_response_body_capture(TAB_ID, false);
        expect(enable_res.success).toBe(true);

        // getResponseBody 挂起
        let resolve_body: ((v: any) => void) | null = null;
        const get_body_spy = vi.fn((target: any, command: string) => {
            if (command === 'Network.getResponseBody') {
                return new Promise((r) => { resolve_body = r; });
            }
            return Promise.resolve({});
        });
        mock_chrome_debugger.sendCommand = get_body_spy;

        emit_request('req_late', 'https://example.com/late');
        mock_chrome_debugger.emit_event({ tabId: TAB_ID }, 'Network.loadingFinished', { requestId: 'req_late' });
        expect(get_body_spy.mock.calls.filter((c: any[]) => c[1] === 'Network.getResponseBody').length).toBe(1);

        stop_network_capture();
        // 新 capture，武装 orphan handler
        const new_events: any[] = [];
        const orphan_events: any[] = [];
        start_network_capture('cap2', Date.now(), make_cfg(), TAB_ID, (p) => { new_events.push(p); });
        set_cdp_body_event_handler((evt) => { orphan_events.push(evt); });

        // 迟到 getResponseBody resolve（旧 capture 请求）
        resolve_body?.({ body: 'late-body', base64Encoded: false });
        await vi.advanceTimersByTimeAsync(0);
        // 推进 orphan timer（3000ms）
        await vi.advanceTimersByTimeAsync(4000);

        // 新 capture 无旧 body 写入；orphan handler 不得收到退化数据
        expect(new_events.length).toBe(0);
        expect(orphan_events.length).toBe(0);
    });

    test('AC-003 (p028): orphan timer 被跟踪，stop 后清空不再触发', async () => {
        const events: any[] = [];
        start_network_capture('cap1', Date.now(), make_cfg(), TAB_ID, (p) => { events.push(p); });
        const enable_res = await enable_response_body_capture(TAB_ID, false);
        expect(enable_res.success).toBe(true);

        // loadingFinished 无 metadata → 走 orphan 兜底（与 t112 AC-003 同型触发）
        mock_chrome_debugger.emit_event({ tabId: TAB_ID }, 'Network.loadingFinished', { requestId: 'req_orphan' });
        await vi.advanceTimersByTimeAsync(0);

        // orphan 兜底 timer 已登记
        expect(_orphan_timers_for_test.size).toBeGreaterThan(0);

        stop_network_capture();
        expect(_orphan_timers_for_test.size).toBe(0);

        // 推进时钟超过 orphan 超时，timer 已清，无事件写入
        await vi.advanceTimersByTimeAsync(4000);
        expect(events.length).toBe(0);
    });
});
