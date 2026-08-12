// tests/unit/t137_bridge_security.test.ts
// t137: bridge 本地攻击面收敛——output_path 路径穿越防护 + enroll 伪造 origin 顶替防护。
import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { create_bridge_server, _safe_output_path_for_test } from '../../src/bridge/server';

const token = '<TEST_BRIDGE_TOKEN>';
const INSTANCE_HEADER = 'X-Capture-All-Instance-Id';
const INSTANCE_ID = 'inst_sec_1';
let cleanup: (() => Promise<void>) | null = null;
let export_dir: string;

async function start_server(): Promise<ReturnType<typeof create_bridge_server>> {
    export_dir = await mkdtemp(join(tmpdir(), 't137-export-'));
    process.env.CAPTURE_ALL_EXPORT_DIR = export_dir;
    const server = await create_bridge_server({
        host: '127.0.0.1',
        port: 0,
        token,
        command_timeout_ms: 30000,
        full_data_timeout_ms: 120000,
        dev_mode: false,
    });
    cleanup = server.close;
    return server;
}

function ext_origin(id: string): string {
    return `chrome-extension://${id.padEnd(32, 'a').slice(0, 32)}`;
}

async function enroll(server_url: string, opts: { instance_id?: string; origin?: string; label?: string }) {
    return fetch(`${server_url}/extension/enroll`, {
        method: 'POST',
        headers: opts.origin ? { Origin: opts.origin, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            instance_id: opts.instance_id ?? INSTANCE_ID,
            browser_label: opts.label ?? null,
            extension_version: 'test-1.0',
        }),
    });
}

async function heartbeat(server_url: string, instance_id: string, instance_token: string, origin?: string, label?: string) {
    return fetch(`${server_url}/extension/heartbeat`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${instance_token}`,
            [INSTANCE_HEADER]: instance_id,
            'Content-Type': 'application/json',
            ...(origin ? { Origin: origin } : {}),
        },
        body: JSON.stringify({ instance_id, instance_token, browser_label: label ?? null, extension_version: 'test-1.0', active_capture_id: null }),
    });
}

describe('bridge output_path 路径穿越防护 (t137)', () => {
    afterEach(async () => {
        if (cleanup) await cleanup();
        cleanup = null;
        delete process.env.CAPTURE_ALL_EXPORT_DIR;
    });

    it('AC-001: explicit output_path 绝对路径穿越导出目录被拒绝', async () => {
        const server = await start_server();
        const response = await fetch(`${server.url}/mcp/command`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'capture.get_all_data',
                payload: { output_path: '/etc/cron.d/evil', capture_id: 'x' },
            }),
        });
        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error.code).toBe('INVALID_QUERY');
    });

    it('AC-001b: explicit output_path 含 .. 穿越被拒绝', async () => {
        const server = await start_server();
        const response = await fetch(`${server.url}/mcp/command`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'capture.get_all_data',
                payload: { output_path: '../escape/evil.json', capture_id: 'x' },
            }),
        });
        expect(response.status).toBe(400);
    });

    it('AC-002: 导出目录内相对路径正常通过', async () => {
        const base = await mkdtemp(join(tmpdir(), 't137-base-'));
        const out = await _safe_output_path_for_test('ok.json', base);
        expect(out).toBe(join(base, 'ok.json'));
    });

    it('AC-002b: 符号链接穿越导出目录被拒绝（realpath 收敛）', async () => {
        const base = await mkdtemp(join(tmpdir(), 't137-link-'));
        const outside = await mkdtemp(join(tmpdir(), 't137-out-'));
        // base 内建 symlink 指向外部目录
        await symlink(outside, join(base, 'evil_link'));
        await expect(_safe_output_path_for_test('evil_link/pwn.json', base)).rejects.toThrow('output_path');
    });
});

describe('bridge enroll 伪造 origin 顶替防护 (t137)', () => {
    afterEach(async () => {
        if (cleanup) await cleanup();
        cleanup = null;
        delete process.env.CAPTURE_ALL_EXPORT_DIR;
    });

    it('AC-005: 已有 instance_id + 不同 Origin 扩展 ID 重 enroll 被拒', async () => {
        const server = await start_server();
        const origin_a = ext_origin('a');
        const origin_b = ext_origin('b');
        // 首次 enroll（绑定 origin_a）
        const first = await enroll(server.url, { origin: origin_a });
        expect(first.status).toBe(200);
        const first_data = await first.json();
        const instance_id = first_data.data.instance_id;

        // 伪造 origin_b 重 enroll 同 instance_id → 拒绝
        const attack = await enroll(server.url, { instance_id, origin: origin_b });
        expect(attack.status).toBe(403);
    });

    it('AC-007: 同 Origin 扩展 ID 重 enroll（合法重启）放行', async () => {
        const server = await start_server();
        const origin_a = ext_origin('a');
        const first = await enroll(server.url, { origin: origin_a });
        const instance_id = (await first.json()).data.instance_id;

        const restart = await enroll(server.url, { instance_id, origin: origin_a });
        expect(restart.status).toBe(200);
    });

    it('AC-006: 首次 enroll（新 instance_id）零配置流程保留', async () => {
        const server = await start_server();
        const response = await enroll(server.url, { origin: ext_origin('a'), instance_id: 'inst_new_1' });
        expect(response.status).toBe(200);
    });

    it('AC-008: 伪造 origin 不得经 label 顶替删除已绑定扩展的真实实例', async () => {
        const server = await start_server();
        const origin_a = ext_origin('a');
        const origin_b = ext_origin('b');
        // 真实实例：inst_a，label 'work'，origin_a；保存其 instance_token
        const real = await enroll(server.url, { instance_id: 'inst_a', origin: origin_a, label: 'work' });
        const real_token = (await real.json()).data.instance_token;

        // 伪造 origin_b 用同 label 'work' 新 instance_id 尝试顶替 → inst_a 不得被删
        await enroll(server.url, { instance_id: 'inst_evil', origin: origin_b, label: 'work' });

        // 判别性验证：用 inst_a 原 token 发 heartbeat，若 inst_a 存活则 200，被删则 401
        const hb = await heartbeat(server.url, 'inst_a', real_token, origin_a);
        expect(hb.status).toBe(200);
    });

    it('AC-008b: heartbeat 伪造 origin 经 label 顶替不得删除已绑定扩展的真实实例', async () => {
        const server = await start_server();
        const origin_a = ext_origin('a');
        const origin_b = ext_origin('b');
        // 真实实例 inst_a（label 'work', origin_a），保存 token
        const real = await enroll(server.url, { instance_id: 'inst_a', origin: origin_a, label: 'work' });
        const real_token = (await real.json()).data.instance_token;
        // 恶意实例 inst_evil（label 'work', origin_b），保存 token
        const evil = await enroll(server.url, { instance_id: 'inst_evil', origin: origin_b, label: 'work' });
        const evil_token = (await evil.json()).data.instance_token;

        // inst_evil 用冲突 label 发 heartbeat 尝试顶替 inst_a（origin_b ≠ inst_a 绑定 origin_a）
        await heartbeat(server.url, 'inst_evil', evil_token, origin_b, 'work');

        // 判别性：inst_a 原 token 仍存活（未被顶替删除）
        const hb = await heartbeat(server.url, 'inst_a', real_token, origin_a);
        expect(hb.status).toBe(200);
    });

    it('AC-004: 既有 origin 绑定实例被无 Origin 重 enroll 拒绝', async () => {
        const server = await start_server();
        const origin_a = ext_origin('a');
        const first = await enroll(server.url, { origin: origin_a });
        const instance_id = (await first.json()).data.instance_id;

        // 无 Origin（mcp token 路径）重 enroll 同 instance_id → 拒绝
        const no_origin = await fetch(`${server.url}/extension/enroll`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ instance_id, browser_label: null, extension_version: 'test-1.0' }),
        });
        expect(no_origin.status).toBe(403);
    });
});
