// tests/unit/result_runtime_validation.test.ts
// t177 AC-001/002/004: /extension/result 运行时校验——畸形拒绝不 resolve；合法投递
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { create_bridge_server } from '../../src/bridge/server';
import { AGENT_ERROR_CODES } from '../../src/shared/protocol';

const token = '<TEST_BRIDGE_TOKEN>';
const INSTANCE_HEADER = 'X-Capture-All-Instance-Id';
let server: Awaited<ReturnType<typeof create_bridge_server>> | null = null;

async function start_server(): Promise<Awaited<ReturnType<typeof create_bridge_server>>> {
    server = await create_bridge_server({
        host: '127.0.0.1',
        port: 0,
        token,
        command_timeout_ms: 30000,
        full_data_timeout_ms: 120000,
        dev_mode: false,
        pairing_auto_open: false,
    });
    return server;
}

async function enroll_instance(): Promise<{ instance_id: string; instance_token: string }> {
    const res = await fetch(`${server!.url}/extension/enroll`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ browser_label: null, extension_version: 'test-1.0' }),
    });
    const body = await res.json();
    return body.data as { instance_id: string; instance_token: string };
}

async function enqueue_command(): Promise<{ command_id: string; instance_id: string; instance_token: string }> {
    const inst = await enroll_instance();
    // MCP 发命令 → queue pending（命令创建同步入队；响应在扩展取走后 resolve，不 await）
    void fetch(`${server!.url}/mcp/command`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'captures.list', payload: {}, timeout_ms: 30000 }),
        signal: AbortSignal.timeout(3000),
    }).catch(() => {});
    // 轮询取命令（替代固定 sleep，防慢机 flaky）；取到即返回（probe 即取走）
    for (let i = 0; i < 20; i += 1) {
        const probe = await fetch(`${server!.url}/extension/command`, {
            headers: { Authorization: `Bearer ${token}`, [INSTANCE_HEADER]: inst.instance_id },
            signal: AbortSignal.timeout(1000),
        }).catch(() => null);
        if (probe && probe.status !== 204) {
            const cmd_body = await probe.json().catch(() => null) as { command_id?: string } | null;
            if (cmd_body && typeof cmd_body.command_id === 'string') {
                return { command_id: cmd_body.command_id, ...inst };
            }
        }
        await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error('command not enqueued in time');
}

async function post_result(instance_id: string, body: unknown): Promise<Response> {
    return fetch(`${server!.url}/extension/result`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, [INSTANCE_HEADER]: instance_id, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

beforeEach(async () => { server = null; });
afterEach(async () => {
    if (server) {
        await Promise.race([server.close(), new Promise((r) => setTimeout(r, 2000))]);
    }
});

describe('/extension/result 运行时校验（t177）', () => {
    it('AC-001a: 非 boolean ok 拒绝，pending 不 resolve', async () => {
        const s = await start_server();
        const { command_id, instance_id } = await enqueue_command();
        const res = await post_result(instance_id, { command_id, ok: 'yes' });
        expect(res.status).toBe(400);
        expect((await res.json()).error.code).toBe('INVALID_QUERY');
        // pending 未被 resolve/delete：同 command_id 合法 result 仍 200
        const ok_res = await post_result(instance_id, { command_id, ok: true, data: {} });
        expect(ok_res.status).toBe(200);
    });

    it('AC-001b: 未知 error code 拒绝', async () => {
        const s = await start_server();
        const { command_id, instance_id } = await enqueue_command();
        const res = await post_result(instance_id, { command_id, ok: false, error: { code: 'BOGUS_CODE', message: 'x' } });
        expect(res.status).toBe(400);
        const ok_res = await post_result(instance_id, { command_id, ok: true, data: {} });
        expect(ok_res.status).toBe(200);
    });

    it('AC-001c: ok:true 带 error 拒绝', async () => {
        const s = await start_server();
        const { command_id, instance_id } = await enqueue_command();
        const res = await post_result(instance_id, { command_id, ok: true, error: { code: 'INVALID_QUERY', message: 'x' } });
        expect(res.status).toBe(400);
        const ok_res = await post_result(instance_id, { command_id, ok: true, data: {} });
        expect(ok_res.status).toBe(200);
    });

    it('AC-001d: ok:false 缺 error 拒绝', async () => {
        const s = await start_server();
        const { command_id, instance_id } = await enqueue_command();
        const res = await post_result(instance_id, { command_id, ok: false });
        expect(res.status).toBe(400);
        const ok_res = await post_result(instance_id, { command_id, ok: true, data: {} });
        expect(ok_res.status).toBe(200);
    });

    it('AC-002a: 合法 result 正常投递', async () => {
        const s = await start_server();
        const { command_id, instance_id } = await enqueue_command();
        const res = await post_result(instance_id, { command_id, ok: true, data: { total: 0, captures: [] } });
        expect(res.status).toBe(200);
    });

    it('AC-002b: ok:false + 合法 error code 通过（MCP 收到结构化错误响应）', async () => {
        const s = await start_server();
        const { command_id, instance_id } = await enqueue_command();
        const res = await post_result(instance_id, { command_id, ok: false, error: { code: 'CAPTURE_NOT_FOUND', message: 'missing' } });
        expect(res.status).toBe(200);
        // AGENT_ERROR_CODES 包含该合法 code（行为前置：合法 code 不被校验拒绝）
        expect(AGENT_ERROR_CODES).toContain('CAPTURE_NOT_FOUND');
    });
});
