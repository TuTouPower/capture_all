// tests/export_large_fix.test.ts — 大文件导出修复 Spec 的红测试
// Spec: docs/archive/omni_powers/op_record/specs/export_large_fix.md
//
// 覆盖：
//   路径 B（瘦身导出）— exporter 各函数接受 ExportOptions{include_response_body}
//   MCP schema 新增 output_path / include_response_body
//   config full_data_timeout_ms 默认 300000
//   server MAX_EXTENSION_RESULT_BODY_BYTES = 64MB
//
// 当前源码未实现这些改动，本文件必须整体跑不过（红）。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ------------------------------------------------------------------
// storage / user_config mock：让 exporter 走真实序列化逻辑，只替换数据源
// ------------------------------------------------------------------
const RESPONSE_BODY_MARKER = 'RESPONSE_BODY_PAYLOAD_MARKER';
const REQUEST_BODY_MARKER = 'REQUEST_BODY_PAYLOAD_MARKER';

function make_network_request() {
    return {
        capture_id: 'cap_1',
        request_id: 'req_1',
        method: 'POST',
        url: 'https://api.example.com/data?q=1',
        url_status: 'captured',
        status_code: 200,
        status_text: 'OK',
        protocol: 'h2',
        resource_type: 'fetch',
        initiator: null,
        duration_ms: 150,
        start_time_ms: 1000,
        end_time_ms: 1150,
        request_headers: { 'content-type': 'application/json' },
        response_headers: { 'content-type': 'application/json' },
        headers_status: 'captured',
        request_body: REQUEST_BODY_MARKER,
        request_body_status: 'captured',
        request_body_encoding: 'utf8',
        request_body_bytes: 10,
        request_body_mime: 'application/json',
        response_body: RESPONSE_BODY_MARKER,
        response_preview: null,
        response_body_status: 'captured',
        response_body_encoding: 'utf8',
        response_body_bytes: 20,
        mime_type: 'application/json',
        request_size_bytes: null,
        response_size_bytes: null,
        transfer_size_bytes: null,
        from_cache: false,
        cache_status: 'none',
        error_text: null,
        capture_method: 'cdp_primary',
        body_capture_mode: 'cdp',
    };
}

const mock_capture = {
    capture_id: 'cap_1',
    started_at: '2026-06-13T10:00:00.000Z',
    ended_at: '2026-06-13T10:00:01.000Z',
    config_snapshot: {},
    stats: { event_count: 0, request_count: 1, log_count: 0, error_count: 0 },
    body_capture_mode: 'cdp',
    body_capture_status: 'captured',
};

vi.mock('../src/background/storage', () => ({
    get_capture: vi.fn(async () => mock_capture),
    get_events_by_category: vi.fn(async () => []),
    get_network_requests: vi.fn(async () => [make_network_request()]),
    get_console_events: vi.fn(async () => []),
}));

vi.mock('../src/shared/user_config', () => ({
    load_user_config: vi.fn(async () => ({ system_time_timezone: 'UTC+8' })),
}));

vi.mock('../src/background/app_log_storage', () => ({
    get_app_log_transport: vi.fn(() => ({
        flush: vi.fn(async () => {}),
        get_entries: vi.fn(async () => []),
    })),
}));

import {
    export_json,
    export_jsonl,
    export_html,
    export_har,
} from '../src/background/exporter';

beforeEach(() => {
    vi.clearAllMocks();
});

// ------------------------------------------------------------------
// 1. exporter 瘦身 — JSON
// ------------------------------------------------------------------
describe('export_json: include_response_body', () => {
    it('omits response_body when include_response_body=false', async () => {
        const out = await export_json('cap_1', { include_response_body: false });
        const parsed = JSON.parse(out);
        const req = parsed.network_requests[0];
        expect(req).toBeDefined();
        expect(req.response_body).toBeUndefined();
        // 其余字段完整保留
        expect(req.request_body).toBe(REQUEST_BODY_MARKER);
        expect(req.status_code).toBe(200);
        expect(req.response_headers).toEqual({ 'content-type': 'application/json' });
        // 字符串中不残留 response_body 内容
        expect(out).not.toContain(RESPONSE_BODY_MARKER);
    });

    it('includes response_body by default (no options)', async () => {
        const out = await export_json('cap_1');
        expect(out).toContain(RESPONSE_BODY_MARKER);
        const parsed = JSON.parse(out);
        expect(parsed.network_requests[0].response_body).toBe(RESPONSE_BODY_MARKER);
    });

    it('includes response_body when include_response_body=true', async () => {
        const out = await export_json('cap_1', { include_response_body: true });
        expect(out).toContain(RESPONSE_BODY_MARKER);
    });
});

// ------------------------------------------------------------------
// 2. exporter 瘦身 — JSONL
// ------------------------------------------------------------------
describe('export_jsonl: include_response_body', () => {
    const network_line = (out: string): Record<string, unknown> | undefined => {
        for (const line of out.split('\n')) {
            if (!line.trim()) continue;
            const obj = JSON.parse(line);
            if (obj.type === 'network_request') return obj;
        }
        return undefined;
    };

    it('omits response_body when include_response_body=false', async () => {
        const out = await export_jsonl('cap_1', { include_response_body: false });
        const rec = network_line(out);
        expect(rec).toBeDefined();
        expect(rec!.response_body).toBeUndefined();
        expect(rec!.request_body).toBe(REQUEST_BODY_MARKER);
        expect(out).not.toContain(RESPONSE_BODY_MARKER);
    });

    it('includes response_body by default', async () => {
        const out = await export_jsonl('cap_1');
        const rec = network_line(out);
        expect(rec!.response_body).toBe(RESPONSE_BODY_MARKER);
    });
});

// ------------------------------------------------------------------
// 3. exporter 瘦身 — HTML
// ------------------------------------------------------------------
describe('export_html: include_response_body', () => {
    it('omits response_body from embedded JSON when include_response_body=false', async () => {
        const out = await export_html('cap_1', { include_response_body: false });
        expect(out).not.toContain(RESPONSE_BODY_MARKER);
        // 请求体仍在
        expect(out).toContain(REQUEST_BODY_MARKER);
    });

    it('includes response_body by default', async () => {
        const out = await export_html('cap_1');
        expect(out).toContain(RESPONSE_BODY_MARKER);
    });
});

// ------------------------------------------------------------------
// 4. exporter 瘦身 — HAR
// ------------------------------------------------------------------
describe('export_har: include_response_body', () => {
    it('omits content.text but keeps content.size when include_response_body=false', async () => {
        const out = await export_har('cap_1', { include_response_body: false });
        const har = JSON.parse(out);
        const entry = har.log.entries[0];
        expect(entry).toBeDefined();
        expect(entry.response.content.text).toBeUndefined();
        // content.size 仍输出（来自 response_body_bytes 或长度）
        expect(entry.response.content).toHaveProperty('size');
        expect(out).not.toContain(RESPONSE_BODY_MARKER);
    });

    it('includes content.text by default', async () => {
        const out = await export_har('cap_1');
        const har = JSON.parse(out);
        expect(har.log.entries[0].response.content.text).toBe(RESPONSE_BODY_MARKER);
    });
});

// ------------------------------------------------------------------
// 5. MCP schema 新参数
// ------------------------------------------------------------------
describe('MCP schema: output_path / include_response_body', () => {
    it('export_capture accepts output_path', async () => {
        const { MCP_TOOL_SCHEMAS } = await import('../src/agent/mcp/schemas');
        const parsed = MCP_TOOL_SCHEMAS.export_capture.parse({
            capture_id: 'cap_1',
            format: 'json',
            output_path: '/tmp/out.json',
        });
        expect(parsed.output_path).toBe('/tmp/out.json');
    });

    it('export_capture accepts include_response_body', async () => {
        const { MCP_TOOL_SCHEMAS } = await import('../src/agent/mcp/schemas');
        const parsed = MCP_TOOL_SCHEMAS.export_capture.parse({
            capture_id: 'cap_1',
            format: 'json',
            include_response_body: false,
        });
        expect(parsed.include_response_body).toBe(false);
    });

    it('export_capture rejects empty output_path', async () => {
        const { MCP_TOOL_SCHEMAS } = await import('../src/agent/mcp/schemas');
        expect(() => MCP_TOOL_SCHEMAS.export_capture.parse({
            capture_id: 'cap_1',
            format: 'json',
            output_path: '',
        })).toThrow();
    });

    it('get_all_capture_data accepts output_path', async () => {
        const { MCP_TOOL_SCHEMAS } = await import('../src/agent/mcp/schemas');
        const parsed = MCP_TOOL_SCHEMAS.get_all_capture_data.parse({
            capture_id: 'cap_1',
            output_path: '/tmp/all.json',
        });
        expect(parsed.output_path).toBe('/tmp/all.json');
    });

    it('export_session shares the extended schema', async () => {
        const { MCP_TOOL_SCHEMAS } = await import('../src/agent/mcp/schemas');
        const parsed = MCP_TOOL_SCHEMAS.export_session.parse({
            capture_id: 'cap_1',
            format: 'har',
            output_path: '/tmp/out.har',
            include_response_body: false,
        });
        expect(parsed.output_path).toBe('/tmp/out.har');
        expect(parsed.include_response_body).toBe(false);
    });
});

// ------------------------------------------------------------------
// 6. config full_data_timeout_ms 默认值
// ------------------------------------------------------------------
describe('config: full_data_timeout_ms default', () => {
    it('defaults full_data_timeout_ms to 300000', async () => {
        const { parse_bridge_config } = await import('../src/bridge/config');
        const cfg = parse_bridge_config({ port: 17831, token: 'tok' });
        expect(cfg.full_data_timeout_ms).toBe(300000);
    });

    it('keeps command_timeout_ms default at 120000', async () => {
        const { parse_bridge_config } = await import('../src/bridge/config');
        const cfg = parse_bridge_config({ port: 17831, token: 'tok' });
        expect(cfg.command_timeout_ms).toBe(120000);
    });
});

// ------------------------------------------------------------------
// 7. server 常量 MAX_EXTENSION_RESULT_BODY_BYTES = 64MB
// ------------------------------------------------------------------
describe('server: MAX_EXTENSION_RESULT_BODY_BYTES', () => {
    const server_src = (): string =>
        readFileSync(resolve(__dirname, '..', 'src/bridge/server.ts'), 'utf8');

    it('sets MAX_EXTENSION_RESULT_BODY_BYTES to 64MB', () => {
        const src = server_src();
        expect(src).toMatch(/MAX_EXTENSION_RESULT_BODY_BYTES\s*=\s*64\s*\*\s*1024\s*\*\s*1024/);
        expect(src).not.toMatch(/MAX_EXTENSION_RESULT_BODY_BYTES\s*=\s*32\s*\*\s*1024\s*\*\s*1024/);
    });
});
