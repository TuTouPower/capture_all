// tests/unit/bridge_lifecycle_cleanup.test.ts
// t181: Bridge 生命周期清理——public close() 取消 pending command、销毁 CDP sessions、
// 有界 graceful close；过期实例 sweep（TTL + grace）。
// AC-005: 只调 public close，断言命令取消 / WS 清理 / registry sweep。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import { create_bridge_server } from '../../src/bridge/server';
import { destroy_all_sessions } from '../../src/bridge/cdp_handler';

const token = '<TEST_BRIDGE_TOKEN>';

// server.ts 顶层 import cdp_handler 的 handle_* + destroy_all_sessions；mock 转发真实实现，
// 仅把 destroy_all_sessions 换为 spy 供 AC-002 断言。
vi.mock('../../src/bridge/cdp_handler', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/bridge/cdp_handler')>();
    return {
        ...actual,
        destroy_all_sessions: vi.fn(actual.destroy_all_sessions),
    };
});

let cleanup: (() => Promise<void>) | null = null;

async function start_test_server() {
    const server = await create_bridge_server({
        host: '127.0.0.1',
        port: 0,
        token,
        command_timeout_ms: 30000,
        full_data_timeout_ms: 120000,
        dev_mode: false,
        pairing_auto_open: false,
    });
    cleanup = server.close;
    return server;
}

async function enroll(server_url: string, browser_label?: string): Promise<{ instance_id: string; instance_token: string }> {
    const response = await fetch(`${server_url}/extension/enroll`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ extension_version: '1.0.0', browser_label: browser_label ?? 'cleanup-test' }),
    });
    expect(response.status).toBe(200);
    return (await response.json()).data;
}

/** POST /mcp/command（agent:false 绕过 undici 连接池，与既有 server 测试一致）。 */
function post_command(server_url: string, body: unknown): Promise<{ status: number; data: unknown }> {
    return new Promise((resolve, reject) => {
        const url = new URL('/mcp/command', server_url);
        const payload = JSON.stringify(body);
        const req = http.request(
            {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname,
                method: 'POST',
                agent: false,
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload),
                },
            },
            (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', () => {
                    resolve({ status: res.statusCode || 0, data: JSON.parse(Buffer.concat(chunks).toString()) });
                });
            },
        );
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

beforeEach(() => {
    cleanup = null;
});

afterEach(async () => {
    if (cleanup) {
        await cleanup().catch(() => {});
        cleanup = null;
    }
});

describe('t181 AC-001: close 取消 pending command（COMMAND_CANCELLED 终态，不阻塞至 timeout）', () => {
    it('pending 命令在 close 后收到 COMMAND_CANCELLED，而非等 30s timeout', async () => {
        const server = await start_test_server();
        await enroll(server.url);

        const pending_promise = post_command(server.url, {
            command_id: 'cmd_close_pending',
            type: 'capture.start',
            payload: { capture_id: 'cap_x' },
            created_at: 1,
        });
        // 等请求送达 server（命令已入 queue pending）再 close
        await new Promise((r) => setTimeout(r, 50));

        const started = Date.now();
        await server.close(); // 不 take_next，命令保持 pending
        const elapsed = Date.now() - started;
        expect(elapsed).toBeLessThan(2000); // 有界 graceful，远小于命令 timeout 30s

        const { data } = await pending_promise;
        expect((data as { error?: { code: string } }).error?.code).toBe('COMMAND_CANCELLED');
    });

    it('close 后服务不再接受命令（连接失败或 HTTP 错误）', async () => {
        const server = await start_test_server();
        await enroll(server.url);
        await server.close();
        let rejected_or_error = false;
        try {
            const { status, data } = await post_command(server.url, {
                command_id: 'cmd_after_close',
                type: 'capture.start',
                payload: {},
                created_at: 1,
            });
            rejected_or_error = status >= 400 || Boolean((data as { error?: unknown }).error);
        } catch {
            rejected_or_error = true; // ECONNREFUSED（server 已关闭）也满足「不再接受命令」
        }
        expect(rejected_or_error).toBe(true);
    });
});

describe('t181 AC-002: close 销毁 CDP sessions（WS/timer/映射）', () => {
    it('close 调用 destroy_all_sessions', async () => {
        const server = await start_test_server();
        await enroll(server.url);
        vi.mocked(destroy_all_sessions).mockClear();
        await server.close();
        expect(destroy_all_sessions).toHaveBeenCalled();
    });
});

// AC-003「不预调 closeAllConnections 也能快速完成」的可观测行为由 AC-001 的
// `elapsed < 2000` 计时断言直接覆盖（有 pending 命令时 close 快速返回）。
// 不再用源码文本正则验证实现细节（review t181_test_f002）。

describe('t181 AC-004: 过期实例 sweep（TTL + grace）', () => {
    it('超过 TTL+grace 的实例被 sweep：queue cancel 发 COMMAND_CANCELLED、registry 删除', async () => {
        // 缩短 TTL/grace 注入（模块级钩子，与 cdp_handler 模式一致）；窗口取 100ms 避免命令送达竞态
        const { _set_extension_ttl_for_test, _set_extension_sweep_grace_for_test } = await import('../../src/bridge/server');
        _set_extension_ttl_for_test(100);
        _set_extension_sweep_grace_for_test(0);
        try {
            const server = await start_test_server();
            const { instance_id } = await enroll(server.url);

            const pending_promise = post_command(server.url, {
                command_id: 'cmd_sweep_1',
                type: 'capture.start',
                payload: { capture_id: 'cap_sweep' },
                created_at: 1,
            });

            // 命令送达（<100ms）且 TTL+grace 已过，然后 status 触发懒 sweep
            await new Promise((r) => setTimeout(r, 300));
            const status_res = await fetch(`${server.url}/mcp/status`, { headers: { Authorization: `Bearer ${token}` } });
            expect(status_res.status).toBe(200);

            // pending 命令被 sweep cancel（COMMAND_CANCELLED）
            const { data } = await pending_promise;
            expect((data as { error?: { code: string } }).error?.code).toBe('COMMAND_CANCELLED');

            // registry 已删除：同 instance_id 重新 enroll 走新登记（200）；
            // 若未 sweep，existing 分支（无扩展 origin）会 403 拒绝顶替——有判别力
            const again = await fetch(`${server.url}/extension/enroll`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ instance_id, extension_version: '1.0.0', browser_label: 'cleanup-test' }),
            });
            expect(again.status).toBe(200);
        } finally {
            _set_extension_ttl_for_test(5000);
            _set_extension_sweep_grace_for_test(30000);
        }
    });
});
