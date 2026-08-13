// tests/unit/network_capture_terminal_cleanup.test.ts
// t185 AC-004: terminal-path table test——各终态（loadingFinished 三分支 / loadingFailed）
// 后 request lifecycle 相关 state 均清空（经 finalize_request/cleanup 收敛，无手工删多集合）。

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    runtime: { getManifest: vi.fn().mockReturnValue({ version: '1.0.0' }), onInstalled: { addListener: vi.fn() }, onMessage: { addListener: vi.fn() } },
    tabs: { query: vi.fn().mockResolvedValue([]), get: vi.fn().mockResolvedValue({ id: 1, url: 'https://example.com' }), sendMessage: vi.fn().mockResolvedValue(undefined), onActivated: { addListener: vi.fn() }, onUpdated: { addListener: vi.fn() }, onRemoved: { addListener: vi.fn() }, onCreated: { addListener: vi.fn() } },
};

import {
    start_network_capture,
    stop_network_capture,
    enable_response_body_capture,
    _cdp_request_meta_for_test,
    _cdp_body_results_for_test,
    _streaming_requests_for_test,
    _finished_before_stream_for_test,
} from '../../src/extension/background/network_capture';

type CaptureConfig = Parameters<typeof start_network_capture>[2];

function make_cfg(overrides: Partial<CaptureConfig> = {}): CaptureConfig {
    return {
        redact_sensitive_headers: false,
        redact_url_query: false,
        redact_data: false,
        capture_request_body: false,
        capture_response_body: true,
        max_body_capture_bytes: 104857600,
        inline_text_max_bytes: 32768,
        ...overrides,
    } as CaptureConfig;
}

async function setup(cfg: CaptureConfig): Promise<void> {
    start_network_capture('test_capture', 1700000000000, cfg, 1, () => {});
    await enable_response_body_capture(1, false);
}

function emit(method: string, params: any): void {
    mock_chrome_debugger.emit_event({ tabId: 1 }, method, params);
}

function emit_request_start(req_id: string): void {
    emit('Network.requestWillBeSent', {
        requestId: req_id,
        request: { url: 'https://example.com/api', method: 'GET', headers: {} },
        type: 'Fetch',
    });
}

function emit_response(req_id: string, headers: Record<string, string> = { 'content-type': 'application/json' }): void {
    emit('Network.responseReceived', {
        requestId: req_id,
        response: { url: 'https://example.com/api', status: 200, headers },
        type: 'Fetch',
    });
}

beforeEach(() => {
    try { stop_network_capture(); } catch { /* not started */ }
    mock_chrome_debugger.reset();
    vi.clearAllMocks();
    _cdp_request_meta_for_test.clear();
    _cdp_body_results_for_test.clear();
    _streaming_requests_for_test.clear();
    _finished_before_stream_for_test.clear();
});

describe('t185 AC-004: terminal-path state cleanup table', () => {
    it('loadingFinished + capture_response_body=false：meta/body/streaming/finished 全清空', async () => {
        await setup(make_cfg({ capture_response_body: false }));
        const req_id = 'req_nobody';
        emit_request_start(req_id);
        emit_response(req_id);
        // 注入全部 4 类状态（body/streaming 非本路径真实产生——注入建立清空判别力）
        _cdp_body_results_for_test.set(`root:${req_id}`, { body: null, status: 'not_enabled', timestamp: 1, preview: null, encoding: null, byte_size: null });
        _streaming_requests_for_test.add(`root:${req_id}`);
        _finished_before_stream_for_test.add(`root:${req_id}`);
        expect(_cdp_request_meta_for_test.has(`root:${req_id}`)).toBe(true);
        emit('Network.loadingFinished', { requestId: req_id });
        expect(_cdp_request_meta_for_test.has(`root:${req_id}`)).toBe(false);
        expect(_cdp_body_results_for_test.has(`root:${req_id}`)).toBe(false);
        expect(_streaming_requests_for_test.has(`root:${req_id}`)).toBe(false);
        expect(_finished_before_stream_for_test.has(`root:${req_id}`)).toBe(false);
    });

    it('loadingFinished + streaming（SSE）：force_flush 后 streaming/meta/body/finished 全清空', async () => {
        await setup(make_cfg());
        const req_id = 'req_sse';
        emit_request_start(req_id);
        emit_response(req_id, { 'content-type': 'text/event-stream' });
        expect(_streaming_requests_for_test.has(`root:${req_id}`)).toBe(true);
        // 注入 body（本路径 flush 前无 body_results 写入——注入建立清空判别力）
        _cdp_body_results_for_test.set(`root:${req_id}`, { body: null, status: 'captured', timestamp: 1, preview: null, encoding: 'utf8', byte_size: 0 });
        emit('Network.loadingFinished', { requestId: req_id });
        expect(_streaming_requests_for_test.has(`root:${req_id}`)).toBe(false);
        expect(_finished_before_stream_for_test.has(`root:${req_id}`)).toBe(false);
        expect(_cdp_request_meta_for_test.has(`root:${req_id}`)).toBe(false);
        expect(_cdp_body_results_for_test.has(`root:${req_id}`)).toBe(false);
    });

    it('loadingFinished + getResponseBody 成功（meta 存在）：finalize 后 meta/body/finished 清空', async () => {
        await setup(make_cfg());
        mock_chrome_debugger.set_command_response('Network.getResponseBody', { body: '{"ok":1}', base64Encoded: false });
        const req_id = 'req_body_ok';
        emit_request_start(req_id);
        emit_response(req_id);
        emit('Network.loadingFinished', { requestId: req_id });
        await vi.waitFor(() => {
            expect(_cdp_request_meta_for_test.has(`root:${req_id}`)).toBe(false);
        });
        expect(_cdp_body_results_for_test.has(`root:${req_id}`)).toBe(false);
        expect(_finished_before_stream_for_test.has(`root:${req_id}`)).toBe(false);
    });

    it('loadingFinished + getResponseBody 失败（meta 存在）：catch 分支 finalize 后清空', async () => {
        await setup(make_cfg());
        mock_chrome_debugger.set_command_error('Network.getResponseBody', new Error('No resource'));
        const req_id = 'req_body_fail';
        emit_request_start(req_id);
        emit_response(req_id);
        emit('Network.loadingFinished', { requestId: req_id });
        await vi.waitFor(() => {
            expect(_cdp_request_meta_for_test.has(`root:${req_id}`)).toBe(false);
        });
        expect(_cdp_body_results_for_test.has(`root:${req_id}`)).toBe(false);
        expect(_finished_before_stream_for_test.has(`root:${req_id}`)).toBe(false);
    });

    it('loadingFailed：finished 清空；body 保留 fail_result 供 deferred/orphan 消费', async () => {
        await setup(make_cfg());
        const req_id = 'req_failed';
        emit_request_start(req_id);
        emit_response(req_id);
        // 注入 finished（loadingFailed 真实路径删除——注入建立清空判别力）
        _finished_before_stream_for_test.add(`root:${req_id}`);
        emit('Network.loadingFailed', { requestId: req_id });
        expect(_finished_before_stream_for_test.has(`root:${req_id}`)).toBe(false);
        expect(_cdp_body_results_for_test.has(`root:${req_id}`)).toBe(true);
        expect(_cdp_body_results_for_test.get(`root:${req_id}`)?.status).toBe('cdp_failed');
    });
});
