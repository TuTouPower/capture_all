// tests/unit/t112_finished_before_stream_lifecycle.test.ts
// t112: finished_before_stream 生命周期标记泄漏回归。
// 断言必须触达生产 network_capture 路径（start_network_capture + emit_event 驱动），
// 不以 cdp_state_cleanup 替身测试代替。
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mock_chrome_debugger } from '../support/__mocks__/chrome_debugger';

(globalThis as any).chrome = {
    ...((globalThis as any).chrome || {}),
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
    _finished_before_stream_for_test,
    _deferred_web_requests_for_test,
    _deferred_cdp_index_for_test,
} from '../../src/extension/background/network_capture';
import { register_session, clear_sessions } from '../../src/extension/background/cdp_event_router';
import { handle_cdp_event, type CdpHandlerState } from '../../src/extension/background/cdp_handler';
import { create_stream_buffer } from '../../src/extension/background/stream_buffer';

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

async function start_capture(overrides: Record<string, any> = {}) {
    start_network_capture('t112_cap', Date.now(), make_cfg(overrides), 1, () => {});
    set_cdp_body_event_handler(() => {});
    await enable_response_body_capture(1, false);
}

function send_request_events(req_id: string, opts: { sessionId?: string; streaming?: boolean } = {}) {
    const source = { tabId: 1, ...(opts.sessionId ? { sessionId: opts.sessionId } : {}) };
    mock_chrome_debugger.emit_event(
        source,
        'Network.requestWillBeSent',
        { requestId: req_id, type: 'Fetch', request: { url: 'https://example.com/' + req_id, method: 'GET' } },
    );
    mock_chrome_debugger.emit_event(
        source,
        'Network.responseReceived',
        {
            requestId: req_id,
            type: 'Fetch',
            response: {
                url: 'https://example.com/' + req_id,
                status: 200,
                headers: opts.streaming ? { 'Content-Type': 'text/event-stream' } : { 'Content-Type': 'application/json' },
            },
        },
    );
}

function send_loading_finished(req_id: string, opts: { sessionId?: string } = {}) {
    mock_chrome_debugger.emit_event(
        { tabId: 1, ...(opts.sessionId ? { sessionId: opts.sessionId } : {}) },
        'Network.loadingFinished',
        { requestId: req_id },
    );
}

describe('t112 finished_before_stream 生命周期', () => {
    beforeEach(async () => {
        vi.useFakeTimers();
        try { stop_network_capture(); } catch { /* not started yet */ }
        mock_chrome_debugger.reset();
        vi.clearAllMocks();
        clear_sessions();
        _finished_before_stream_for_test.clear();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('AC-001 普通请求成功产出事件后 key 不再保留', async () => {
        mock_chrome_debugger.set_command_response('Network.getResponseBody', { body: '{"ok":1}', base64Encoded: false });
        await start_capture();

        send_request_events('req_normal');
        send_loading_finished('req_normal');
        // getResponseBody 异步回调
        await vi.advanceTimersByTimeAsync(0);

        expect(_finished_before_stream_for_test.has('root:req_normal')).toBe(false);
    });

    it('AC-001 同 session 后续同 key 请求不受残留标记影响（复用 requestId）', async () => {
        mock_chrome_debugger.set_command_response('Network.getResponseBody', { body: '{}', base64Encoded: false });
        await start_capture();

        // 第一轮普通请求
        send_request_events('req_reuse');
        send_loading_finished('req_reuse');
        await vi.advanceTimersByTimeAsync(0);
        expect(_finished_before_stream_for_test.size).toBe(0);

        // 第二轮同 requestId，SSE 流式：残留标记会让 responseReceived 跳过 streamResourceContent
        send_request_events('req_reuse', { streaming: true });
        send_loading_finished('req_reuse');
        await vi.advanceTimersByTimeAsync(0);

        expect(_finished_before_stream_for_test.size).toBe(0);
        // 流式命令未被跳过：streamResourceContent 应被发起
        expect(mock_chrome_debugger.send_command_calls.some((c) => c.command === 'Network.streamResourceContent')).toBe(true);
    });

    it('AC-002 SSE 完成 emit 后 key 不再保留', async () => {
        await start_capture();

        send_request_events('req_sse', { streaming: true });
        send_loading_finished('req_sse');
        await vi.advanceTimersByTimeAsync(0);

        expect(_finished_before_stream_for_test.has('root:req_sse')).toBe(false);
    });

    it('AC-002 getResponseBody 失败路径同样清理', async () => {
        mock_chrome_debugger.set_command_error('Network.getResponseBody', new Error('No resource with given identifier'));
        await start_capture();

        send_request_events('req_fail');
        send_loading_finished('req_fail');
        await vi.advanceTimersByTimeAsync(0);

        expect(_finished_before_stream_for_test.has('root:req_fail')).toBe(false);
    });

    it('AC-003 逆序竞态（loadingFinished 先于 responseReceived）终态后清理', async () => {
        mock_chrome_debugger.set_command_response('Network.getResponseBody', { body: '{}', base64Encoded: false });
        await start_capture();

        // loadingFinished 先到：标记写入
        send_loading_finished('req_race');
        expect(_finished_before_stream_for_test.has('root:req_race')).toBe(true);
        // responseReceived 后到（普通请求，非流式）：getResponseBody 路径清理
        send_request_events('req_race');
        await vi.advanceTimersByTimeAsync(0);

        expect(_finished_before_stream_for_test.has('root:req_race')).toBe(false);
    });

    it('AC-003 无 metadata 早退不残留（loadingFinished 后无 requestWillBeSent）', async () => {
        mock_chrome_debugger.set_command_response('Network.getResponseBody', { body: '{}', base64Encoded: false });
        await start_capture();

        send_loading_finished('req_nometa');
        await vi.advanceTimersByTimeAsync(0);
        // 无 meta：deferred 无匹配，走 orphan 兜底 3s 后清理
        await vi.advanceTimersByTimeAsync(3000);

        expect(_finished_before_stream_for_test.has('root:req_nometa')).toBe(false);
    });

    it('AC-003 orphan 早退（无 consumer）终态后不残留', async () => {
        mock_chrome_debugger.set_command_error('Network.getResponseBody', new Error('No resource with given identifier'));
        await start_capture();

        // loadingFinished 无 metadata → 走 orphan 兜底
        send_loading_finished('req_orphan');
        await vi.advanceTimersByTimeAsync(0);
        // orphan 3s 超时
        await vi.advanceTimersByTimeAsync(3000);

        expect(_finished_before_stream_for_test.has('root:req_orphan')).toBe(false);
    });

    it('AC-003 capture_response_body=false 早退不残留', async () => {
        await start_capture({ capture_response_body: false });

        send_request_events('req_nobody');
        send_loading_finished('req_nobody');
        await vi.advanceTimersByTimeAsync(0);

        expect(_finished_before_stream_for_test.has('root:req_nobody')).toBe(false);
    });

    it('AC-004 root + 子 session 连续 100 请求后集合为空', async () => {
        mock_chrome_debugger.set_command_response('Network.getResponseBody', { body: '{}', base64Encoded: false });
        await start_capture();
        register_session('child_session');

        for (let i = 0; i < 100; i++) {
            const child = i % 2 === 1;
            const session_id = child ? 'child_session' : undefined;
            send_request_events(`req_${i}`, { sessionId: session_id });
            send_loading_finished(`req_${i}`, { sessionId: session_id });
        }
        await vi.advanceTimersByTimeAsync(0);

        expect(_finished_before_stream_for_test.size).toBe(0);
        // 子 session 事件确实被路由处理（非假覆盖）：两个 session 都产生了 body 命令
        const body_calls = mock_chrome_debugger.send_command_calls.filter((c) => c.command === 'Network.getResponseBody');
        expect(body_calls.length).toBe(100);
        const child_calls = body_calls.filter((c) => c.sessionId === 'child_session');
        expect(child_calls.length).toBe(50);
    });
});

describe('t112 deferred 终态清理（生产 network_capture）', () => {
    beforeEach(async () => {
        vi.useFakeTimers();
        try { stop_network_capture(); } catch { /* not started yet */ }
        mock_chrome_debugger.reset();
        vi.clearAllMocks();
        clear_sessions();
        _finished_before_stream_for_test.clear();
        _deferred_web_requests_for_test.clear();
        _deferred_cdp_index_for_test.clear();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('AC-003 deferred 完整解析后 marker 清理（try_resolve_deferred 真正执行）', async () => {
        mock_chrome_debugger.set_command_response('Network.getResponseBody', { body: '{}', base64Encoded: false });
        await start_capture();

        // 构造 webRequest 侧 deferred entry，与 CDP req_key 关联
        const cdp_key = 'root:req_dfd';
        _deferred_web_requests_for_test.set('dk_1', {
            pending: {
                cdp_request_id: 'req_dfd', tab_id: 1, method: 'GET', url: 'https://example.com/d',
                timestamp: 1, request_headers: {}, response_headers: {},
                request_body: null, request_body_status: 'not_enabled', resource_type: 'xhr',
            },
            details: { statusCode: 200, timeStamp: 1, requestId: 'req_dfd' },
            timer: null as any,
            pending_cdp_ids: new Set([cdp_key]),
        });
        _deferred_cdp_index_for_test.set(cdp_key, new Set(['dk_1']));

        // CDP 侧 loadingFinished（无 requestWillBeSent → 无 meta → 走 deferred 解析）
        send_loading_finished('req_dfd');
        await vi.advanceTimersByTimeAsync(0);

        // deferred entry 已消费、marker 已清理
        expect(_deferred_web_requests_for_test.has('dk_1')).toBe(false);
        expect(_finished_before_stream_for_test.has(cdp_key)).toBe(false);
    });

    it('AC-003 deferred 多候选兜底分支后 marker 清理（生产 network_capture）', async () => {
        mock_chrome_debugger.set_command_response('Network.getResponseBody', { body: '{}', base64Encoded: false });
        await start_capture();

        // entry 有多个 CDP 候选：当前候选 resolve 后 pending 仍非空 → 走兜底清理分支
        const cdp_a = 'root:req_mb1';
        const cdp_b = 'root:req_mb2';
        _deferred_web_requests_for_test.set('dk_m', {
            pending: {
                cdp_request_id: 'req_mb1', tab_id: 1, method: 'GET', url: 'https://example.com/m',
                timestamp: 1, request_headers: {}, response_headers: {},
                request_body: null, request_body_status: 'not_enabled', resource_type: 'xhr',
            },
            details: { statusCode: 200, timeStamp: 1, requestId: 'req_mb1' },
            timer: null as any,
            pending_cdp_ids: new Set([cdp_a, cdp_b]),
        });
        _deferred_cdp_index_for_test.set(cdp_a, new Set(['dk_m']));

        // cdp_a resolve → 从 pending 移除后仍有 cdp_b → 兜底清理，不 emit
        send_loading_finished('req_mb1');
        await vi.advanceTimersByTimeAsync(0);

        expect(_finished_before_stream_for_test.has(cdp_a)).toBe(false);
        // entry 保留（pending 还有 cdp_b 未 resolve）
        expect(_deferred_web_requests_for_test.has('dk_m')).toBe(true);
    });
});

describe('t112 cdp_handler 复制实现 marker 清理', () => {
    let state: CdpHandlerState;

    function make_state(emitted: any[], overrides: Record<string, any> = {}): CdpHandlerState {
        return {
            is_capturing: true,
            capture_id: 'cap_t112',
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
                ...(overrides.config || {}),
            },
            dbg_tab_id: 1,
            dbg_attached_externally: false,
            pending_requests: new Map(),
            cdp_request_meta: new Map(),
            cdp_body_results: new Map(),
            ws_connections: new Map(),
            streaming_requests: new Set(),
            finished_before_stream: new Set(),
            orphan_timers: new Map(),
            stream_buffer_instance: create_stream_buffer(() => {}, 1024 * 1024),
            deferred_web_requests: new Map(),
            _deferred_cdp_index: new Map(),
            on_cdp_body_event: () => {},
            send_to_background: (payload: any) => emitted.push(payload),
            ...overrides,
        };
    }

    beforeEach(() => {
        vi.useFakeTimers();
        state = make_state([]);
        mock_chrome_debugger.reset();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('capture_response_body=false 早退后 marker 清理', async () => {
        state = make_state([], { config: { capture_response_body: false } });
        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.requestWillBeSent',
            { requestId: 'nb', type: 'Fetch', request: { url: 'https://example.com/nb', method: 'GET', headers: {} } },
        );
        // 注意：cdp_handler 直驱走 handle_cdp_event(state)
        handle_cdp_event({ tabId: 1 }, 'Network.requestWillBeSent', {
            requestId: 'nb', type: 'Fetch', request: { url: 'https://example.com/nb', method: 'GET', headers: {} },
        }, state);
        handle_cdp_event({ tabId: 1 }, 'Network.responseReceived', {
            requestId: 'nb', response: { url: 'https://example.com/nb', status: 200, headers: {} },
        }, state);
        handle_cdp_event({ tabId: 1 }, 'Network.loadingFinished', { requestId: 'nb' }, state);

        expect(state.finished_before_stream.has('root:nb')).toBe(false);
    });

    it('SSE 无 metadata 早退后 marker 清理（orphan 兜底）', async () => {
        // loadingFinished 时无 meta：marker 先写入，orphan 3s 兜底清理
        handle_cdp_event({ tabId: 1 }, 'Network.loadingFinished', { requestId: 'sse_nometa' }, state);
        expect(state.finished_before_stream.has('root:sse_nometa')).toBe(true);
        await vi.advanceTimersByTimeAsync(3000);
        expect(state.finished_before_stream.has('root:sse_nometa')).toBe(false);
    });

    it('loadingFailed 无 meta 后 marker 清理', async () => {
        handle_cdp_event({ tabId: 1 }, 'Network.loadingFinished', { requestId: 'lf' }, state);
        expect(state.finished_before_stream.has('root:lf')).toBe(true);
        handle_cdp_event({ tabId: 1 }, 'Network.loadingFailed', { requestId: 'lf', errorText: 'ERR' }, state);
        expect(state.finished_before_stream.has('root:lf')).toBe(false);
    });

    it('orphan 回调早退（事件已被消费）也清理 marker', async () => {
        handle_cdp_event({ tabId: 1 }, 'Network.loadingFinished', { requestId: 'orph' }, state);
        expect(state.finished_before_stream.has('root:orph')).toBe(true);

        // 模拟事件已被 handle_completed 消费：body/meta 已删，仅 orphan timer 残留
        state.cdp_body_results.delete('root:orph');
        state.cdp_request_meta.delete('root:orph');

        // orphan 3s 触发：即使 body_result 不存在也须清理 marker
        await vi.advanceTimersByTimeAsync(3000);
        expect(state.finished_before_stream.has('root:orph')).toBe(false);
    }, 5000);

    it('SSE streaming 完成 emit 后 marker 清理', async () => {
        // requestWillBeSent + responseReceived(event-stream) + loadingFinished
        // streaming 分支 force_flush + emit 后须删除 marker
        handle_cdp_event({ tabId: 1 }, 'Network.requestWillBeSent', {
            requestId: 'sse', type: 'Fetch', request: { url: 'https://example.com/sse', method: 'GET', headers: {} },
        }, state);
        handle_cdp_event({ tabId: 1 }, 'Network.responseReceived', {
            requestId: 'sse', type: 'Fetch',
            response: { url: 'https://example.com/sse', status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        }, state);
        handle_cdp_event({ tabId: 1 }, 'Network.loadingFinished', { requestId: 'sse' }, state);

        expect(state.finished_before_stream.has('root:sse')).toBe(false);
    });

    it('deferred 完整解析终态后 marker 清理', async () => {
        // seed deferred entry：webRequest 侧 pending 与 CDP req_key 关联
        const cdp_key = 'root:req_dfd2';
        state.deferred_web_requests.set('dk_1', {
            pending: {
                cdp_request_id: 'req_dfd2', tab_id: 1, method: 'GET', url: 'https://example.com/d',
                timestamp: 1, request_headers: {}, response_headers: {},
                request_body: null, request_body_status: 'not_enabled', resource_type: 'xhr',
            },
            details: { statusCode: 200, timeStamp: 1, requestId: 'req_dfd2' },
            timer: null as any,
            pending_cdp_ids: new Set([cdp_key]),
        });
        state._deferred_cdp_index.set(cdp_key, new Set(['dk_1']));

        // loadingFinished 无 meta → getResponseBody resolve → try_resolve_deferred 完整解析
        handle_cdp_event({ tabId: 1 }, 'Network.loadingFinished', { requestId: 'req_dfd2' }, state);
        await vi.advanceTimersByTimeAsync(0);

        expect(state.finished_before_stream.has(cdp_key)).toBe(false);
    });

    it('deferred 多候选兜底分支终态后 marker 清理', async () => {
        // entry 有多个 CDP 候选：当前候选 resolve 后 pending 仍非空 → 走兜底清理分支
        const cdp_a = 'root:req_ma';
        const cdp_b = 'root:req_mb';
        state.deferred_web_requests.set('dk_m', {
            pending: {
                cdp_request_id: 'req_ma', tab_id: 1, method: 'GET', url: 'https://example.com/m',
                timestamp: 1, request_headers: {}, response_headers: {},
                request_body: null, request_body_status: 'not_enabled', resource_type: 'xhr',
            },
            details: { statusCode: 200, timeStamp: 1, requestId: 'req_ma' },
            timer: null as any,
            pending_cdp_ids: new Set([cdp_a, cdp_b]),
        });
        state._deferred_cdp_index.set(cdp_a, new Set(['dk_m']));

        // cdp_a resolve → 从 pending 移除后仍有 cdp_b → 兜底清理，不 emit
        handle_cdp_event({ tabId: 1 }, 'Network.loadingFinished', { requestId: 'req_ma' }, state);
        await vi.advanceTimersByTimeAsync(0);

        expect(state.finished_before_stream.has(cdp_a)).toBe(false);
        // entry 保留（pending 还有 cdp_b 未 resolve）
        expect(state.deferred_web_requests.has('dk_m')).toBe(true);
    });
});
