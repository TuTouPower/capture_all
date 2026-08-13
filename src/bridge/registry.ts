// bridge/registry.ts — t184: 实例注册表（instances/queues/command_owners）集中实现
// 顶替/移除/sweep 清理，消除 enroll 与 heartbeat 的重复实现（AC-002）。
// 不依赖 http；resolve_target/build_status 为纯数据操作。

import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { AgentStatus } from '../shared/protocol';
import { BRIDGE_VERSION } from './config';
import { AgentCommandQueue } from './command_queue';
import { next_default_label } from './label';
import { bridge_warn } from './logger';

export interface ExtensionInstance {
    instance_id: string;
    extension_version: string;
    active_capture_id: string | null;
    browser_label: string | null;
    token_hash: string | null;
    seen_at: number;
    origin_extension_id: string | null;
}

const EXTENSION_TTL_MS = 5000;

// t181: 过期实例 sweep——TTL + grace 后清理（queue cancel、instance/queue 删除、owner 清理）。
// 与 cdp_handler 的 _set_*_for_test 同模式提供测试钩子（默认值不变）。
let _extension_ttl_ms = EXTENSION_TTL_MS;
let _extension_sweep_grace_ms = 30000;
export function _set_extension_ttl_for_test(ms: number): void { _extension_ttl_ms = ms; }
export function _set_extension_sweep_grace_for_test(ms: number): void { _extension_sweep_grace_ms = ms; }

export class BridgeRegistry {
    readonly instances = new Map<string, ExtensionInstance>();
    readonly queues = new Map<string, AgentCommandQueue>();
    readonly command_owners = new Map<string, string>();

    constructor(private readonly instances_file?: string) {}

    get extension_ttl_ms(): number {
        return _extension_ttl_ms;
    }

    // ── 持久化（t169: 重启恢复绑定实例，token hash 持久化非明文） ──
    persist(): void {
        if (!this.instances_file) return;
        const data = [...this.instances.entries()].map(([id, inst]) => ({ id, ...inst }));
        void (async () => {
            try {
                await mkdir(dirname(this.instances_file!), { recursive: true });
                await writeFile(this.instances_file!, JSON.stringify(data), { mode: 0o600 });
            } catch {
                // best-effort：持久化失败不阻断运行
            }
        })();
    }

    async load_persisted(): Promise<void> {
        if (!this.instances_file) return;
        try {
            const raw = await readFile(this.instances_file, 'utf8');
            const loaded = JSON.parse(raw) as Array<ExtensionInstance & { id: string }>;
            for (const item of loaded) {
                this.instances.set(item.id, {
                    instance_id: item.instance_id,
                    extension_version: item.extension_version,
                    active_capture_id: item.active_capture_id,
                    browser_label: item.browser_label,
                    token_hash: item.token_hash,
                    seen_at: item.seen_at,
                    origin_extension_id: item.origin_extension_id,
                });
            }
        } catch {
            // 无文件/损坏：从空开始
        }
    }

    get_or_create_queue(instance_id: string): AgentCommandQueue {
        let queue = this.queues.get(instance_id);
        if (!queue) {
            queue = new AgentCommandQueue();
            this.queues.set(instance_id, queue);
        }
        return queue;
    }

    // t181 AC-004: 超过 TTL + grace 的实例被 sweep——cancel pending queue、删除 instance/queue、
    // 清理归属该实例的 command_owners 条目。enroll/heartbeat/status 懒清理入口调用。
    sweep_expired(now = Date.now()): void {
        for (const [id, inst] of [...this.instances.entries()]) {
            if (now - inst.seen_at <= _extension_ttl_ms + _extension_sweep_grace_ms) continue;
            this.remove_instance(id);
            bridge_warn('extension_swept', { instance_id: id, reason: 'ttl_expired' });
        }
    }

    // t184 AC-002: 唯一删除路径——cancel pending queue、删除 instance/queue、清理 owner。
    remove_instance(instance_id: string): void {
        this.instances.delete(instance_id);
        const queue = this.queues.get(instance_id);
        if (queue) {
            queue.cancel_all();
            this.queues.delete(instance_id);
        }
        for (const [cmd_id, owner_id] of [...this.command_owners.entries()]) {
            if (owner_id === instance_id) {
                this.command_owners.delete(cmd_id);
            }
        }
    }

    // t184 AC-002: 唯一「label 顶替」路径——enroll 与 heartbeat 共用。
    // ext_id 为发起方扩展 ID（enroll 用请求 Origin 解析；heartbeat 用被认证实例自身绑定）。
    // 同 label 冲突且 origin 绑定可校验通过时顶替删除旧实例；伪造 origin 不得踢下线真实实例。
    replace_instance_by_label(instance_id: string, new_label: string | null, ext_id: string | null): void {
        if (!new_label) return;
        for (const [id, inst] of [...this.instances.entries()]) {
            if (id === instance_id || inst.browser_label !== new_label) continue;
            // t137: label 顶替删除旧实例前校验 origin 绑定——伪造 origin 不得踢下线已绑定扩展的真实实例
            if (inst.origin_extension_id !== null && ext_id !== null
                && inst.origin_extension_id !== ext_id) {
                continue;
            }
            this.remove_instance(id);
        }
    }

    next_default_label(exclude_instance_id: string): string | null {
        return next_default_label(
            [...this.instances.values()]
                .filter((inst) => inst.instance_id !== exclude_instance_id)
                .map((inst) => inst.browser_label),
        );
    }

    list_online(now = Date.now()): ExtensionInstance[] {
        // t181 AC-004: 懒清理——每次枚举在线实例前先 sweep 过期实例
        this.sweep_expired(now);
        return [...this.instances.values()].filter((inst) => now - inst.seen_at <= _extension_ttl_ms);
    }

    resolve_target(payload: Record<string, unknown>): { instance_id: string } | { error: { code: 'TARGET_REQUIRED' | 'TARGET_NOT_FOUND' | 'TARGET_AMBIGUOUS' | 'EXTENSION_OFFLINE'; message: string } } {
        const online = this.list_online();
        if (online.length === 0) {
            return { error: { code: 'EXTENSION_OFFLINE', message: 'Extension is offline' } };
        }

        const target_instance_id = typeof payload.target_instance_id === 'string' && payload.target_instance_id.length > 0
            ? payload.target_instance_id
            : null;
        const target_label = typeof payload.target_label === 'string' && payload.target_label.length > 0
            ? payload.target_label
            : null;

        if (target_instance_id) {
            const inst = online.find((item) => item.instance_id === target_instance_id);
            if (!inst) {
                return { error: { code: 'TARGET_NOT_FOUND', message: `Target instance not online: ${target_instance_id}` } };
            }
            return { instance_id: inst.instance_id };
        }

        if (target_label) {
            const matches = online.filter((item) => item.browser_label === target_label);
            if (matches.length === 0) {
                return { error: { code: 'TARGET_NOT_FOUND', message: `No online extension with label="${target_label}"` } };
            }
            if (matches.length > 1) {
                return { error: { code: 'TARGET_AMBIGUOUS', message: `Multiple online extensions share label="${target_label}"; specify target_instance_id` } };
            }
            return { instance_id: matches[0].instance_id };
        }

        if (online.length === 1) {
            return { instance_id: online[0].instance_id };
        }

        // Multi-instance: require explicit target (instance_id preferred; label as human alias).
        // If all instances have unique labels, surface them; otherwise flag anonymous.
        const labels = online.map((item) => item.browser_label).filter((l): l is string => Boolean(l));
        const has_anonymous = labels.length < online.length;
        const hint = has_anonymous
            ? 'Multiple extensions online; some have no label. Set browser_label in each extension settings, then specify target_label or target_instance_id.'
            : `Multiple extensions online; specify target_label (one of: ${Array.from(new Set(labels)).join(', ')}) or target_instance_id.`;
        return {
            error: {
                code: 'TARGET_REQUIRED',
                message: hint,
            },
        };
    }

    build_status(host: string, port: number): AgentStatus {
        // t181 AC-004: status 懒清理过期实例
        this.sweep_expired();
        const now = Date.now();
        const all = [...this.instances.values()];
        const online = all.filter((inst) => now - inst.seen_at <= _extension_ttl_ms);
        const extensions = all.map((inst) => {
            const is_on = now - inst.seen_at <= _extension_ttl_ms;
            const queue = this.queues.get(inst.instance_id);
            return {
                instance_id: inst.instance_id,
                browser_label: inst.browser_label,
                online: is_on,
                extension_version: inst.extension_version,
                active_capture_id: is_on ? inst.active_capture_id : null,
                pending_commands: queue?.pending_count() ?? 0,
            };
        });
        // t192 AC-002: 删除 deprecated 顶层字段（extension_online/extension_version/active_capture_id）与 primary 派生；
        // 消费者统一读 extensions / online_count，单目标按 instance_id 或 browser_label 选择
        const pending_commands = online.reduce((sum, inst) => sum + (this.queues.get(inst.instance_id)?.pending_count() ?? 0), 0);
        return {
            bridge_version: BRIDGE_VERSION,
            bridge_url: `http://${host}:${port}`,
            pending_commands,
            extensions,
            online_count: online.length,
        };
    }

    cancel_all(): void {
        for (const queue of this.queues.values()) {
            queue.cancel_all();
        }
        this.queues.clear();
        this.instances.clear();
        this.command_owners.clear();
    }
}

/** t184: 迁移自 server.ts——新 instance_id 生成（enroll 未提供时）。 */
export function generate_instance_id(): string {
    return `inst_${randomBytes(8).toString('hex')}`;
}
