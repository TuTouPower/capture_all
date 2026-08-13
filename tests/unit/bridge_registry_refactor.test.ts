// tests/unit/bridge_registry_refactor.test.ts
// t184 AC-002/003: Bridge server 重构——enroll/heartbeat 顶替清理收敛到 BridgeRegistry
// replace_instance_by_label/remove_instance（无重复实现）；route handler 统一 {status, body}，
// server 层只做 CORS/异常映射/发送。AC-001/AC-004 由既有 server 级测试 gate。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
