// tests/unit/t114_nested_query_redaction.test.ts
// t114: redact_url 对非敏感参数值内嵌 query 的递归脱敏回归。
// 覆盖 p018 10 种 outer/inner 组合 + 双编码不触发 + 深层链终止 + AC-004 回退保护。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { redact_url } from '../../src/shared/redaction';
import { sanitize_log_value } from '../../src/shared/logger';
import { mock_chrome_debugger } from '../support/__mocks__/chrome_debugger';
import { start_network_capture, stop_network_capture, enable_response_body_capture } from '../../src/extension/background/network_capture';

type T114Case = {
    name: string;
    input: string;
    secret: string;
    // 预期脱敏后敏感值消失
    expect_redacted: boolean;
};

const cases: T114Case[] = [
    // ── p018 10 种组合 ──
    { name: 'bare_query_outer_relative_nested_path', input: '?next=child?token=secret_bare', secret: 'secret_bare', expect_redacted: true },
    { name: 'relative_path_outer_relative_nested_path', input: 'outer?next=child?token=secret_relative_path', secret: 'secret_relative_path', expect_redacted: true },
    { name: 'root_relative_outer_root_relative_nested_path', input: '/outer?next=/child?token=secret_root_relative', secret: 'secret_root_relative', expect_redacted: true },
    { name: 'bare_query_outer_query_relative_nested_value', input: '?next=?token=secret_query_relative', secret: 'secret_query_relative', expect_redacted: true },
    { name: 'root_relative_outer_protocol_relative_nested_url', input: '/outer?next=//inner.example/login?token=secret_protocol_relative', secret: 'secret_protocol_relative', expect_redacted: true },
    { name: 'bare_query_outer_encoded_relative_nested_path', input: '?next=child%3Ftoken%3Dsecret_encoded_relative', secret: 'secret_encoded_relative', expect_redacted: true },
    { name: 'absolute_outer_relative_nested_path', input: 'https://outer.example/start?next=child?token=secret_absolute_relative', secret: 'secret_absolute_relative', expect_redacted: true },
    { name: 'absolute_outer_root_relative_nested_path', input: 'https://outer.example/start?next=/child?token=secret_absolute_root_relative', secret: 'secret_absolute_root_relative', expect_redacted: true },
    { name: 'absolute_outer_encoded_relative_nested_path', input: 'https://outer.example/start?next=child%3Ftoken%3Dsecret_absolute_encoded_relative', secret: 'secret_absolute_encoded_relative', expect_redacted: true },
    { name: 'absolute_outer_absolute_nested_url', input: 'https://outer.example/start?next=https://inner.example/login?token=secret_absolute_nested', secret: 'secret_absolute_nested', expect_redacted: true },
    // ── 解码深度与终止条件 ──
    // 双编码（%253F）：单层解码后仍是 %3F，不触发递归（避免重复解码误判）
    { name: 'double_encoded_not_triggered', input: '?next=child%253Ftoken%253Dsecret_double', secret: 'secret_double', expect_redacted: false },
    // 深层嵌套链终止且敏感值仍脱敏
    { name: 'deep_chain_terminates', input: '?next=?next=?next=?token=secret_deep', secret: 'secret_deep', expect_redacted: true },
    // MAX_DEPTH 触达 fail-closed：不泄露明文
    { name: 'deep_chain_max_depth_fail_closed', input: '?next='.repeat(6) + '?token=secret7', secret: 'secret7', expect_redacted: true },
    // 双编码 absolute 分支与相对分支一致（不触发）
    { name: 'double_encoded_absolute_not_triggered', input: 'https://x.example/?next=keep%253Ftoken%253Dx', secret: 'keep%253Ftoken%253Dx', expect_redacted: false },
    // f005: 第二层嵌套双编码 absolute 与相对分支行为一致（均不触发）
    { name: 'second_level_double_encoded_consistent', input: '?next=child?next=keep%253Ftoken%253Dx', secret: 'keep%253Ftoken%253Dx', expect_redacted: false },
    { name: 'second_level_double_encoded_absolute', input: 'https://x.example/?next=child?next=keep%253Ftoken%253Dx', secret: 'keep%253Ftoken%253Dx', expect_redacted: false },
    // absolute 单编码触发
    { name: 'absolute_encoded_single_triggered', input: 'https://x.example/?next=child%3Ftoken%3Dsingle', secret: 'single', expect_redacted: true },
    // protocol-relative 外层（AC-002 字面列外层）
    { name: 'protocol_relative_outer_nested_path', input: '//outer.example/start?next=/child?token=secret_proto_outer', secret: 'secret_proto_outer', expect_redacted: true },
    // 嵌套空值敏感 key（如 ?next=child?token=）
    { name: 'nested_empty_sensitive_value', input: '?next=child?token=', secret: '', expect_redacted: false },
];

// AC-004 回退保护：顶层敏感 key、既有内嵌 absolute URL 场景不回退
const regression_cases: T114Case[] = [
    { name: '顶层敏感 key', input: 'https://example.com/login?token=top_secret&id=5', secret: 'top_secret', expect_redacted: true },
    { name: '顶层敏感 key 手动分支', input: '/login?password=pw_secret&id=5', secret: 'pw_secret', expect_redacted: true },
    { name: '编码敏感 key', input: '?%74oken=enc_secret', secret: 'enc_secret', expect_redacted: true },
];

describe('t114 nested query 递归脱敏', () => {
    it.each(cases)('$name', ({ input, secret, expect_redacted }) => {
        const result = redact_url(input, true);
        const dec = decodeURIComponent(result.url);
        if (expect_redacted) {
            expect(result.url).not.toContain(secret);
            expect(dec).toContain('REDACTED');
            expect(result.url_status).toBe('redacted');
        } else {
            // 双编码不触发：保持原样（解码后可能含可读 secret，但这是预期不触发场景）
            expect(result.url_status).toBe('captured');
            expect(result.url).toBe(input);
        }
    });

    it.each(regression_cases)('回退保护：$name', ({ input, secret }) => {
        const result = redact_url(input, true);
        expect(result.url).not.toContain(secret);
        expect(decodeURIComponent(result.url)).toContain('REDACTED');
        expect(result.url_status).toBe('redacted');
    });

    it('f006 直接传超限 depth fail-closed 不泄露明文', () => {
        const result = redact_url('?token=abc', true, 6);
        expect(result.url).toBe('[REDACTED]');
        expect(result.url).not.toContain('abc');
        expect(result.url_status).toBe('redacted');
    });

    it('AC-001 非敏感结构保留（path/hash/非敏感 key）', () => {
        const result = redact_url('https://outer.example/start?next=/child?token=secret_x&keep=1#frag', true);
        expect(result.url).not.toContain('secret_x');
        expect(decodeURIComponent(result.url)).toContain('keep=1');
        expect(result.url).toContain('#frag');
        expect(result.url).toContain('/start');
        expect(result.url_status).toBe('redacted');
    });

    it('AC-001 url_status 与改写一致（无嵌套无敏感 → captured）', () => {
        const result = redact_url('https://outer.example/start?next=plain&keep=1', true);
        expect(result.url_status).toBe('captured');
        expect(result.url).toBe('https://outer.example/start?next=plain&keep=1');
    });
});

describe('t114 接线级回归', () => {
    it('AC-003 Logger 入口（sanitize_log_value）嵌套 query 不泄露', () => {
        const out = sanitize_log_value('navigation failed: https://outer.example/start?next=/child?token=secret_logger') as string;
        expect(out).not.toContain('secret_logger');
        expect(out).toContain('REDACTED');
    });

    it('AC-003 Logger 入口 encoded 嵌套不泄露', () => {
        const out = sanitize_log_value('nav: ?next=child%3Ftoken%3Dsecret_logger_enc') as string;
        expect(out).not.toContain('secret_logger_enc');
        expect(out).toContain('REDACTED');
    });

    it('AC-003 Logger 入口 details 对象嵌套不泄露', () => {
        const out = sanitize_log_value({ url: '/outer?next=/child?token=secret_detail' }) as Record<string, string>;
        expect(out.url).not.toContain('secret_detail');
        expect(out.url).toContain('REDACTED');
    });
});

// AC-003 接线级：extension network_capture 输出对象（CDP primary url / WS frame url）
describe('t114 network_capture 接线', () => {
    let emitted: any[];

    beforeEach(async () => {
        vi.useFakeTimers();
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
        try { stop_network_capture(); } catch { /* not started */ }
        mock_chrome_debugger.reset();
        vi.clearAllMocks();
        emitted = [];
        start_network_capture('t114_cap', Date.now(), {
            redact_sensitive_headers: false,
            redact_url_query: true,
            redact_data: true,
            capture_request_body: false,
            capture_response_body: true,
            max_body_capture_bytes: 104857600,
            inline_text_max_bytes: 32768,
        }, 1, (p: any) => emitted.push(p));
        await enable_response_body_capture(1, false);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('AC-003 WebSocket frame url 嵌套 query 不泄露', async () => {
        const source = { tabId: 1 };
        mock_chrome_debugger.emit_event(source, 'Network.webSocketCreated', {
            requestId: 'ws_1',
            url: 'wss://example.com/connect?next=/child?token=secret_ws',
        });
        mock_chrome_debugger.emit_event(source, 'Network.webSocketFrameError', {
            requestId: 'ws_1',
            errorMessage: 'boom',
        });
        const ws_evt = emitted.find((e) => e.data?.ws_connection_id === 'ws_1');
        expect(ws_evt).toBeDefined();
        expect(ws_evt.data.url).not.toContain('secret_ws');
        expect(decodeURIComponent(ws_evt.data.url)).toContain('REDACTED');
    });

    it('AC-003 CDP primary 网络事件 url 嵌套 query 不泄露', async () => {
        mock_chrome_debugger.set_command_response('Network.getResponseBody', { body: '{}', base64Encoded: false });
        const source = { tabId: 1 };
        mock_chrome_debugger.emit_event(source, 'Network.requestWillBeSent', {
            requestId: 'req_1',
            type: 'Fetch',
            request: { url: 'https://outer.example/start?next=/child?token=secret_cdp', method: 'GET', headers: {} },
        });
        mock_chrome_debugger.emit_event(source, 'Network.responseReceived', {
            requestId: 'req_1',
            type: 'Fetch',
            response: { url: 'https://outer.example/start?next=/child?token=secret_cdp', status: 200, headers: { 'Content-Type': 'application/json' } },
        });
        mock_chrome_debugger.emit_event(source, 'Network.loadingFinished', { requestId: 'req_1' });
        await vi.advanceTimersByTimeAsync(0);
        const evt = emitted.find((e) => e.data?.request_id === 'req_1');
        expect(evt).toBeDefined();
        expect(evt.data.url).not.toContain('secret_cdp');
        expect(decodeURIComponent(evt.data.url)).toContain('REDACTED');
    });
});
