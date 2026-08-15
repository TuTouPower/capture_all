// tests/unit/bridge_registry_refactor.test.ts
// t184 AC-002/003: Bridge server 重构——enroll/heartbeat 顶替清理收敛到 BridgeRegistry
// replace_instance_by_label/remove_instance（无重复实现）；route handler 统一 {status, body}，
// server 层只做 CORS/异常映射/发送。AC-001/AC-004 由既有 server 级测试 gate。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { BridgeRegistry, generate_instance_id, type ExtensionInstance } from '../../src/bridge/registry';

const root = resolve(__dirname, '..', '..');

function make_instance(instance_id: string, browser_label: string | null): ExtensionInstance {
    return {
        instance_id,
        extension_version: '1.0.0',
        active_capture_id: null,
        browser_label,
        token_hash: null,
        seen_at: Date.now(),
        origin_extension_id: 'a'.repeat(32),
    };
}

describe('t184 AC-002: replace_instance_by_label 收敛顶替清理', () => {
    it('同 label 冲突时顶替删除旧实例，queue cancel + owner 清理', async () => {
        const { AgentCommandQueue } = await import('../../src/bridge/command_queue');
        const registry = new BridgeRegistry(undefined);
        registry.instances.set('inst_a', make_instance('inst_a', 'work'));
        registry.instances.set('inst_b', make_instance('inst_b', 'personal'));
        const queue_a = new AgentCommandQueue();
        registry.queues.set('inst_a', queue_a);
        const cancel_spy = { called: false };
        const orig_cancel_all = queue_a.cancel_all.bind(queue_a);
        queue_a.cancel_all = () => { cancel_spy.called = true; orig_cancel_all(); };
        registry.command_owners.set('cmd_1', 'inst_a');
        registry.command_owners.set('cmd_2', 'inst_b');

        // 新实例 inst_c 以 label 'work' enroll → 顶替 inst_a
        registry.replace_instance_by_label('inst_c', 'work', 'a'.repeat(32));
        expect(registry.instances.has('inst_a')).toBe(false);
        expect(registry.instances.has('inst_b')).toBe(true);
        expect(registry.queues.has('inst_a')).toBe(false);
        expect(registry.command_owners.has('cmd_1')).toBe(false);
        expect(registry.command_owners.has('cmd_2')).toBe(true);
        expect(cancel_spy.called).toBe(true);
    });

    it('origin 绑定不匹配时不顶替（伪造 origin 不得踢下线真实实例）', () => {
        const registry = new BridgeRegistry(undefined);
        registry.instances.set('inst_a', make_instance('inst_a', 'work'));
        // 发起方 ext_id 与 inst_a 绑定的 origin 不一致 → 跳过顶替
        registry.replace_instance_by_label('inst_b', 'work', 'b'.repeat(32));
        expect(registry.instances.has('inst_a')).toBe(true);
    });

    it('enroll 与 heartbeat 两处都经 replace_instance_by_label（无重复实现）', () => {
        const src = readFileSync(resolve(root, 'src/bridge/server.ts'), 'utf8');
        const extension_route = src.split('async function handle_extension_route')[1] ?? '';
        // 调用点恰好 2 处（enroll + heartbeat），无第三处重复实现
        expect(extension_route.match(/registry\.replace_instance_by_label\(/g)?.length).toBe(2);
        // 旧的「逐条遍历删除实例」重复实现不在 handler 内（清 owner 逻辑收敛到 registry.remove_instance）
        expect(extension_route).not.toMatch(/command_owners\.delete\(cmd_id\)/);
    });

    it('remove_instance 为 sweep/replace 的唯一删除路径（cancel_all 直接清空不经过）', () => {
        const registry_src = readFileSync(resolve(root, 'src/bridge/registry.ts'), 'utf8');
        expect(registry_src).toMatch(/remove_instance\(instance_id: string\): void/);
        // 函数体作用域断言：replace_instance_by_label 与 sweep_expired 体内真实调用 remove_instance
        const replace_body = registry_src.split('replace_instance_by_label(instance_id: string, new_label: string | null, ext_id: string | null): void')[1]?.split('\n    next_default_label')[0] ?? '';
        expect(replace_body).toMatch(/this\.remove_instance\(id\)/);
        const sweep_body = registry_src.split('sweep_expired(now = Date.now()): void')[1]?.split('\n    remove_instance')[0] ?? '';
        expect(sweep_body).toMatch(/this\.remove_instance\(id\)/);
        // cancel_all 直接 clear，不走 remove_instance
        const cancel_body = registry_src.split('cancel_all(): void')[1] ?? '';
        expect(cancel_body).not.toMatch(/remove_instance/);
    });
});

describe('t184 AC-003: route handler 统一 {status, body}，server 层只做发送', () => {
    it('create_route_handlers 暴露 4 个 handler 且返回 RouteResult', async () => {
        const { create_route_handlers } = await import('../../src/bridge/server');
        expect(typeof create_route_handlers).toBe('function');
        const src = readFileSync(resolve(root, 'src/bridge/server.ts'), 'utf8');
        for (const name of ['handle_pair_route', 'handle_extension_route', 'handle_mcp_route', 'handle_cdp_route']) {
            expect(src).toMatch(new RegExp(`async function ${name}`));
        }
        expect(src).toMatch(/interface RouteResult \{[\s\S]*status: number;[\s\S]*body: unknown/);
    });

    it('server 层只做发送——send_json 调用不在 handler 内', () => {
        const src = readFileSync(resolve(root, 'src/bridge/server.ts'), 'utf8');
        const handlers_block = src.split('export function create_route_handlers')[1]?.split('export async function create_bridge_server')[0] ?? '';
        expect(handlers_block).not.toMatch(/send_json\(response/);
        // 发送在 create_bridge_server 的 request handler 内
        const server_block = src.split('export async function create_bridge_server')[1] ?? '';
        expect(server_block).toMatch(/send_json\(response, result\.status, result\.body\)/);
    });

    it('generate_instance_id 从 registry 导出（enroll 未提供 instance_id 时复用）', () => {
        expect(generate_instance_id()).toMatch(/^inst_[0-9a-f]{16}$/);
    });
});

describe('t201 AC-003/004/006: 实例持久化——persist/load 往返、seen_at 重置、损坏/缺失文件', () => {
    // t201_test_f005/f006: persist 为 fire-and-forget,轮询等待落盘文件内容可解析,
    // 避免固定 sleep flake 与 create/truncate 间隙读到空串
    async function wait_for_file(file: string): Promise<void> {
        for (let i = 0; i < 50; i += 1) {
            try {
                const content = await readFile(file, 'utf8');
                if (content.trim()) {
                    JSON.parse(content);
                    return;
                }
            } catch {
                // 未出现/未写完/半截 JSON,重试
            }
            await new Promise((res) => setTimeout(res, 10));
        }
        throw new Error(`file never became parseable: ${file}`);
    }

    it('AC-003: persist 产物含 token_hash 无明文,文件 mode 0600,load 恢复字段', async () => {
        const dir = await mkdtemp(join(tmpdir(), 't201-registry-'));
        try {
            const file = join(dir, 'instances.json');
            const r1 = new BridgeRegistry(file);
            r1.instances.set('inst_a', { ...make_instance('inst_a', 'work'), token_hash: 'deadbeef' });
            r1.persist();
            await wait_for_file(file);

            // AC-003: 文件内容含 token_hash 而非明文 token
            const raw = JSON.parse(await readFile(file, 'utf8')) as Array<Record<string, unknown>>;
            expect(raw).toHaveLength(1);
            expect(raw[0].token_hash).toBe('deadbeef');
            expect(raw[0].token).toBeUndefined();
            expect(raw[0].instance_token).toBeUndefined();
            // AC-003: 文件权限 0600
            expect((await stat(file)).mode & 0o777).toBe(0o600);

            const r2 = new BridgeRegistry(file);
            await r2.load_persisted();
            const inst = r2.instances.get('inst_a');
            expect(inst).toBeDefined();
            expect(inst?.browser_label).toBe('work');
            expect(inst?.token_hash).toBe('deadbeef');
            expect(inst?.origin_extension_id).toBe('a'.repeat(32));
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('AC-001: 两实例(零配置+标号)persist/load 后 size 与 label 保留', async () => {
        const dir = await mkdtemp(join(tmpdir(), 't201-multi-'));
        try {
            const file = join(dir, 'instances.json');
            const r1 = new BridgeRegistry(file);
            // 零配置实例 label=null,模拟未设浏览器编号的扩展
            r1.instances.set('inst_zero', { ...make_instance('inst_zero', null) });
            r1.instances.set('inst_labelled', { ...make_instance('inst_labelled', 'work') });
            r1.persist();
            await wait_for_file(file);

            const r2 = new BridgeRegistry(file);
            await r2.load_persisted();
            expect(r2.instances.size).toBe(2);
            const status = r2.build_status('127.0.0.1', 17831);
            const ids = status.extensions.map((e) => e.instance_id).sort();
            expect(ids).toEqual(['inst_labelled', 'inst_zero']);
            expect(status.extensions.find((e) => e.instance_id === 'inst_zero')?.browser_label).toBeNull();
            expect(status.extensions.find((e) => e.instance_id === 'inst_labelled')?.browser_label).toBe('work');
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('AC-006: load 后 seen_at 重置为启动时刻,不因旧时间戳被 sweep', async () => {
        const dir = await mkdtemp(join(tmpdir(), 't201-seen-'));
        try {
            const file = join(dir, 'instances.json');
            const r1 = new BridgeRegistry(file);
            r1.instances.set('inst_a', { ...make_instance('inst_a', 'work'), seen_at: Date.now() - 60000 });
            r1.persist();
            await wait_for_file(file);

            const before = Date.now();
            const r2 = new BridgeRegistry(file);
            await r2.load_persisted();
            const inst = r2.instances.get('inst_a');
            // seen_at 被重置为 load 时刻附近,而非保留 60s 前旧值
            expect(inst?.seen_at).toBeGreaterThanOrEqual(before - 1000);
            expect(inst?.seen_at).toBeLessThanOrEqual(Date.now() + 1000);
            // 重置后实例不被 sweep 删除
            expect(r2.instances.has('inst_a')).toBe(true);
            expect(r2.build_status('127.0.0.1', 17831).extensions.some((e) => e.instance_id === 'inst_a')).toBe(true);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('AC-004: 损坏文件 load 从空开始,不抛错', async () => {
        const dir = await mkdtemp(join(tmpdir(), 't201-corrupt-'));
        try {
            const file = join(dir, 'instances.json');
            await writeFile(file, '{not valid json', 'utf8');
            const r2 = new BridgeRegistry(file);
            await r2.load_persisted();
            expect(r2.instances.size).toBe(0);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('AC-004: 缺失文件(ENOENT)load 从空开始,不抛错', async () => {
        const dir = await mkdtemp(join(tmpdir(), 't201-missing-'));
        try {
            const file = join(dir, 'instances.json');
            const r2 = new BridgeRegistry(file);
            await r2.load_persisted();
            expect(r2.instances.size).toBe(0);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});
