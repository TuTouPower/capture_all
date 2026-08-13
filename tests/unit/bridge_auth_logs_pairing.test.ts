// tests/unit/bridge_auth_logs_pairing.test.ts
// t196 AC-001~005: Bridge 认证/日志/配对路径补全——command_timeout/cdp_event_evicted 日志路径、
// pairing enroll 后 heartbeat instance token 认证、pairing 过期不续期决策。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import { create_bridge_server } from '../../src/bridge/server';
import {
    handle_cdp_start,
    _set_max_session_events_for_test,
    _set_max_evicted_events_for_test,
} from '../../src/bridge/cdp_handler';

const token = '<TEST_BRIDGE_TOKEN>';

async function start_server(overrides: Partial<{ command_timeout_ms: number; pairing_auto_open: boolean }> = {}) {
    const server = await create_bridge_server({
        host: '127.0.0.1',
        port: 0,
        token,
        command_timeout_ms: overrides.command_timeout_ms ?? 30000,
        full_data_timeout_ms: 120000,
        dev_mode: false,
        pairing_auto_open: overrides.pairing_auto_open ?? false,
    });
    return server;
}

class MockWebSocket {
    static instance: MockWebSocket | null = null;
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;
    send = vi.fn();
    constructor(_url: string) { MockWebSocket.instance = this; }
    emit(message: Record<string, unknown>): void {
        this.onmessage?.({ data: JSON.stringify(message) });
    }
}

async function start_cdp_session(): Promise<string> {
    const p = handle_cdp_start({} as http.IncomingMessage, {
        port: 9222,
        tab_url: 'https://example.com',
        redact_data: false,
    });
    await vi.advanceTimersByTimeAsync(0);
    MockWebSocket.instance?.onopen?.();
    const result = await p;
    const body = result.body as { ok: boolean; session_key: string };
    return body.session_key;
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', MockWebSocket);
    _set_max_session_events_for_test(5000);
    _set_max_evicted_events_for_test(5000);
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    _set_max_session_events_for_test(5000);
    _set_max_evicted_events_for_test(5000);
});

describe('t196 AC-001: command_timeout 结构化日志路径', () => {
    it('命令超时产生 command_timeout JSON 行（含 command_id/type/timeout_ms）', async () => {
        vi.useRealTimers(); // 命令超时走真实 50ms
        const warn_spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const server = await start_server({ command_timeout_ms: 50 });
        try {
            // 先 enroll + heartbeat 使实例 online（否则 resolve_target 503 命令不入队）
            const enroll = await fetch(`${server.url}/extension/enroll`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ extension_version: '1.0.0' }),
            });
            const { instance_id } = (await enroll.json()).data;
            const hb = await fetch(`${server.url}/extension/heartbeat`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ instance_id, extension_version: '1.0.0', active_capture_id: null }),
            });
            expect(hb.status).toBe(200);

            // 发命令但不 take_next——命令保持 pending 至超时
            const pending = fetch(`${server.url}/mcp/command`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'captures.list', payload: {} }),
            });
            const res = await pending;
            expect(res.status).toBe(200);
            const data = await res.json();
            expect((data as { error?: { code: string } }).error?.code).toBe('COMMAND_TIMEOUT');

            const lines = warn_spy.mock.calls.map((c) => c[0]).filter((l) => typeof l === 'string');
            const hit = lines.map((l) => JSON.parse(l as string)).find((p) => p.event === 'command_timeout');
            expect(hit).toBeTruthy();
            expect(hit.level).toBe('warn');
            expect(typeof hit.command_id).toBe('string');
            expect(hit.type).toBe('captures.list');
            expect(hit.timeout_ms).toBe(50);
        } finally {
            await server.close();
            warn_spy.mockRestore();
        }
    });
});

describe('t196 AC-002: cdp_event_evicted 结构化日志路径', () => {
    it('事件数淘汰产生 cdp_event_evicted JSON 行', async () => {
        const warn_spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        _set_max_session_events_for_test(2);
        // CDP 目标列表（handle_cdp_start 经 /json/list 拿 webSocketDebuggerUrl 再建连）
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => [{
                id: 'target-1',
                url: 'https://example.com',
                title: 'Example',
                type: 'page',
                webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/target-1',
            }],
        }));
        try {
            const session_key = await start_cdp_session();
            const socket = MockWebSocket.instance!;
            // 注入 3 个 Network.loadingFinished pending 事件——第 3 个触发事件数淘汰（evicted）
            for (let i = 0; i < 3; i++) {
                socket.emit({ method: 'Network.requestWillBeSent', params: { requestId: `r${i}`, request: { url: 'https://e.com', method: 'GET', headers: {} }, type: 'Fetch' } });
                socket.emit({ method: 'Network.loadingFinished', params: { requestId: `r${i}` } });
            }
            await vi.advanceTimersByTimeAsync(10);
            expect(session_key).toBeTruthy();

            const lines = warn_spy.mock.calls.map((c) => c[0]).filter((l) => typeof l === 'string');
            const hit = lines.map((l) => JSON.parse(l as string)).find((p) => p.event === 'cdp_event_evicted');
            expect(hit).toBeTruthy();
            expect(hit.level).toBe('warn');
            expect(hit.reason).toBe('event_count_cap');
        } finally {
            warn_spy.mockRestore();
        }
    });
});

describe('t196 AC-003: pairing enroll 后 instance token heartbeat 认证', () => {
    it('pairing code enroll 拿 instance_token → heartbeat 200（token 有效）', async () => {
        const server = await start_server();
        try {
            const open_res = await fetch(`${server.url}/pair/open`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const { pairing_code } = (await open_res.json()).data;

            // 无 MCP token，凭 pairing code + origin 完成首次 enroll（零配置路径）
            const enroll_res = await fetch(`${server.url}/extension/enroll`, {
                method: 'POST',
                headers: { Origin: 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'Content-Type': 'application/json' },
                body: JSON.stringify({ browser_label: 'work', extension_version: '1.0.0', pairing_code }),
            });
            expect(enroll_res.status).toBe(200);
            const { instance_id, instance_token } = (await enroll_res.json()).data;

            // 用颁发 instance_token 调 heartbeat（无 MCP token）
            const hb = await fetch(`${server.url}/extension/heartbeat`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${instance_token}`,
                    'X-Capture-All-Instance-Id': instance_id,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ instance_id, extension_version: '1.0.0', active_capture_id: null }),
            });
            expect(hb.status).toBe(200);
        } finally {
            await server.close();
        }
    });
});

describe('t196 AC-004: pairing 过期不自动续期决策记录', () => {
    it('decisions.md 记录 ADR-026（保持不自动续期，安全默认）', () => {
        const { readFileSync } = require('node:fs');
        const { resolve } = require('node:path');
        const decisions = readFileSync(resolve(__dirname, '..', '..', 'docs/blueprint/decisions.md'), 'utf8');
        expect(decisions).toMatch(/## 026 pairing 窗口过期不自动续期/);
        expect(decisions).toMatch(/保持不自动续期（安全默认/);
    });
});
