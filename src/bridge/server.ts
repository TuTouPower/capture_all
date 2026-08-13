import http from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import type { AddressInfo } from 'node:net';
import { AGENT_COMMAND_TYPES, type AgentBridgeConfig, type AgentCommandResult, type AgentCommandType, type AgentStatus } from '../shared/protocol';
import { MAX_COMMAND_TIMEOUT_MS } from '../shared/constants';
import { AgentCommandQueue } from './command_queue';
import { handle_cdp_detect, handle_cdp_start, handle_cdp_events, handle_cdp_stop } from './cdp_handler';
import { next_default_label } from './label';
import { bridge_warn } from './logger';

interface PairingState {
    open: boolean;
    code: string | null;
    expires_at: number;
}

const PAIRING_DEFAULT_DURATION_MS = 5 * 60 * 1000;

function generate_pairing_code(): string {
    const n = randomBytes(4).readUInt32BE(0) % 900000 + 100000;
    return String(n);
}

interface ExtensionInstance {
    instance_id: string;
    extension_version: string;
    active_capture_id: string | null;
    browser_label: string | null;
    token_hash: string | null;
    seen_at: number;
    origin_extension_id: string | null;
}

interface CommandRequest {
    type: AgentCommandType;
    payload: Record<string, unknown>;
    timeout_ms?: number;
}

const EXTENSION_TTL_MS = 5000;
const BRIDGE_VERSION = '0.1.0';
const MAX_JSON_BODY_BYTES = 1024 * 1024;
const MAX_EXTENSION_RESULT_BODY_BYTES = 64 * 1024 * 1024;
// MCP 文本通道不适配大 payload；超过阈值自动写文件，只回元数据。
const INLINE_RESULT_MAX_BYTES = 1 * 1024 * 1024;
const INSTANCE_HEADER = 'x-capture-all-instance-id';

const FULL_DATA_COMMANDS = new Set<AgentCommandType>(['capture.export', 'capture.get_all_data']);

export async function create_bridge_server(config: AgentBridgeConfig): Promise<{ url: string; close: () => Promise<void>; _server: http.Server }> {
    const instances = new Map<string, ExtensionInstance>();
    const queues = new Map<string, AgentCommandQueue>();
    const command_owners = new Map<string, string>();
    const pairing_state: PairingState = {
        open: false,
        code: null,
        expires_at: 0,
    };

    // t169: 已绑定实例持久化（重启恢复，instance token 机制不中断）。best-effort 写盘。
    function persist_instances(): void {
        if (!config.instances_file) return;
        const data = [...instances.entries()].map(([id, inst]) => ({ id, ...inst }));
        void (async () => {
            try {
                await mkdir(dirname(config.instances_file!), { recursive: true });
                await writeFile(config.instances_file!, JSON.stringify(data), { mode: 0o600 });
            } catch {
                // best-effort：持久化失败不阻断运行
            }
        })();
    }

    // t169: 启动加载已绑定实例（token hash 持久化，非明文 token）
    if (config.instances_file) {
        try {
            const raw = await readFile(config.instances_file, 'utf8');
            const loaded = JSON.parse(raw) as Array<ExtensionInstance & { id: string }>;
            for (const item of loaded) {
                instances.set(item.id, {
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

    // t169 AC-003: 启动自动 open pairing（安全分发 credential 承接零配置：
    // MCP token 文件 0600 本机 owner 可读 = 同用户已授权；伪造者同用户本可读 token，
    // pairing code 不新增暴露面）。code 一次性消费（enroll 成功后关闭）。
    if (config.pairing_auto_open !== false) {
        pairing_state.open = true;
        pairing_state.code = generate_pairing_code();
        pairing_state.expires_at = Date.now() + PAIRING_DEFAULT_DURATION_MS;
    }

    function get_or_create_queue(instance_id: string): AgentCommandQueue {
        let queue = queues.get(instance_id);
        if (!queue) {
            queue = new AgentCommandQueue();
            queues.set(instance_id, queue);
        }
        return queue;
    }

    function list_online(now = Date.now()): ExtensionInstance[] {
        return [...instances.values()].filter((inst) => now - inst.seen_at <= EXTENSION_TTL_MS);
    }

    function resolve_target(payload: Record<string, unknown>): { instance_id: string } | { error: { code: 'TARGET_REQUIRED' | 'TARGET_NOT_FOUND' | 'TARGET_AMBIGUOUS' | 'EXTENSION_OFFLINE'; message: string } } {
        const online = list_online();
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

    function build_status(port: number): AgentStatus {
        const now = Date.now();
        const all = [...instances.values()];
        const online = all.filter((inst) => now - inst.seen_at <= EXTENSION_TTL_MS);
        const extensions = all.map((inst) => {
            const is_on = now - inst.seen_at <= EXTENSION_TTL_MS;
            const queue = queues.get(inst.instance_id);
            return {
                instance_id: inst.instance_id,
                browser_label: inst.browser_label,
                online: is_on,
                extension_version: inst.extension_version,
                active_capture_id: is_on ? inst.active_capture_id : null,
                pending_commands: queue?.pending_count() ?? 0,
            };
        });
        // Prefer listing online first for consumers; still include recently seen offline in map until replaced
        const primary = online[0] ?? null;
        const pending_commands = online.reduce((sum, inst) => sum + (queues.get(inst.instance_id)?.pending_count() ?? 0), 0);
        return {
            bridge_version: BRIDGE_VERSION,
            bridge_url: `http://${config.host}:${port}`,
            extension_online: online.length > 0,
            extension_version: primary?.extension_version ?? null,
            active_capture_id: primary?.active_capture_id ?? null,
            pending_commands,
            extensions,
            online_count: online.length,
        };
    }

    const server = http.createServer(async (request, response) => {
        try {
            const origin = request.headers.origin;

            if (origin && !is_allowed_extension_origin(origin)) {
                // B1-M13: 认证/来源拒绝补结构化日志
                bridge_warn('auth_failed', { path: request.url, reason: 'origin_not_allowed' });
                return send_json(response, 403, {
                    ok: false,
                    error: {
                        code: 'ORIGIN_NOT_ALLOWED',
                        message: 'Origin is not allowed',
                    },
                });
            }

            if (origin) {
                set_cors_headers(response, origin);
            }

            if (request.method === 'OPTIONS') {
                response.writeHead(204);
                response.end();
                return;
            }

            if (request.method === 'GET' && request.url === '/health') {
                return send_json(response, 200, { ok: true });
            }

            if (request.method === 'GET' && request.url === '/extension/discover') {
                // Local discovery: no secret; only useful on loopback + extension origin checks above.
                return send_json(response, 200, {
                    ok: true,
                    pairable: true,
                    bridge_version: BRIDGE_VERSION,
                    enroll_path: '/extension/enroll',
                });
            }

            if (request.method === 'GET' && request.url === '/pair') {
                return serve_pair_page(response, pairing_state, config.host, actual_port(server));
            }

            if (request.method === 'GET' && request.url === '/pair/status') {
                return send_json(response, 200, { ok: true, data: build_pairing_status(pairing_state) });
            }

            if (request.method === 'POST' && request.url === '/pair/open') {
                if (!is_authorized(request, config.token)) {
                    bridge_warn('auth_failed', { path: request.url, reason: 'pair_open_invalid_token' });
                    return send_json(response, 401, {
                        ok: false,
                        error: { code: 'TOKEN_INVALID', message: 'Invalid token' },
                    });
                }
                const body = await read_json(request).catch(() => ({}));
                const duration_ms = typeof (body as Record<string, unknown>).duration_minutes === 'number'
                    ? (body as Record<string, unknown>).duration_minutes as number * 60 * 1000
                    : PAIRING_DEFAULT_DURATION_MS;
                const now = Date.now();
                pairing_state.open = true;
                pairing_state.code = generate_pairing_code();
                pairing_state.expires_at = now + duration_ms;
                return send_json(response, 200, {
                    ok: true,
                    data: {
                        pairing_code: pairing_state.code,
                        expires_at: pairing_state.expires_at,
                    },
                });
            }

            if (request.method === 'POST' && request.url === '/pair/close') {
                if (!is_authorized(request, config.token)) {
                    bridge_warn('auth_failed', { path: request.url, reason: 'pair_close_invalid_token' });
                    return send_json(response, 401, {
                        ok: false,
                        error: { code: 'TOKEN_INVALID', message: 'Invalid token' },
                    });
                }
                pairing_state.open = false;
                pairing_state.code = null;
                pairing_state.expires_at = 0;
                return send_json(response, 200, { ok: true, data: { open: false } });
            }

            if (request.method === 'POST' && request.url === '/extension/enroll') {
                // t169 SEC-001: chrome-extension origin 形状可伪造（本地进程可构造 header），
                // 不再作首次登记主凭据。首次 enroll（新 instance_id）要求真正 secret——
                // MCP Bearer token 或有效 pairing code（/pair/open 持 token 打开后 code 才有效）。
                // 重 enroll（既有 instance_id）沿用 t137 origin 扩展 ID 绑定校验放行（真实扩展重启）。
                const has_mcp = is_authorized(request, config.token);
                const has_ext_origin = Boolean(origin && is_allowed_extension_origin(origin));

                const body = validate_enroll(await read_json(request));
                const instance_id = body.instance_id || `inst_${randomBytes(8).toString('hex')}`;
                const ext_id = has_ext_origin ? extension_id_from_origin(origin!) : null;
                let pairing_valid = false; // t169: 首次门槛与 pairing 消费共用

                // t137: 已有 instance_id 时校验 Origin 扩展 ID 绑定——同扩展重启重 enroll 用同
                // Origin 扩展 ID 放行；伪造 origin 顶替因扩展 ID 不匹配被拒。
                const existing = instances.get(instance_id);
                if (existing) {
                    if (ext_id === null) {
                        // 无扩展 origin（mcp token 路径）无法验证扩展绑定，不允许顶替既有实例
                        return send_json(response, 403, {
                            ok: false,
                            error: { code: 'TOKEN_INVALID', message: 'Re-enroll requires matching chrome-extension origin' },
                        });
                    }
                    if (existing.origin_extension_id !== null && existing.origin_extension_id !== ext_id) {
                        // 扩展 ID 与首次登记不一致 → 攻击顶替
                        return send_json(response, 403, {
                            ok: false,
                            error: { code: 'TOKEN_INVALID', message: 'Origin extension id mismatch: re-enroll rejected' },
                        });
                    }
                } else {
                    // t169 SEC-001: 首次登记必须携带真正 secret（Origin 形状可伪造不作凭据）
                    pairing_valid = is_enroll_allowed(pairing_state, body.pairing_code);
                    if (!has_mcp && !pairing_valid) {
                        bridge_warn('auth_failed', { path: request.url, reason: 'enroll_no_credential' });
                        return send_json(response, 401, {
                            ok: false,
                            error: { code: 'TOKEN_INVALID', message: 'Enroll requires mcp token or valid pairing code' },
                        });
                    }
                }

                const instance_token = `ext_${randomBytes(24).toString('base64url')}`;
                const token_hash = hash_token(instance_token);

                // T091: label 为空时按现有在线实例自动分配中文默认编号（一/二/三…）。
                // Replace any existing binding with the same non-empty label (extension restart path);
                // 自定义 label 顶替旧实例；自动编号 label 不会冲突（next_default_label 已避开占用）。
                const provided_label = body.browser_label && body.browser_label.length > 0 ? body.browser_label : null;
                const new_label = provided_label ?? next_default_label(
                    [...instances.values()]
                        .filter((inst) => inst.instance_id !== instance_id)
                        .map((inst) => inst.browser_label),
                );
                if (provided_label) {
                    for (const [id, inst] of [...instances.entries()]) {
                        if (id !== instance_id && inst.browser_label === new_label) {
                            // t137: label 顶替删除旧实例前校验 origin 绑定——伪造 origin 不得踢下线已绑定扩展的真实实例
                            if (inst.origin_extension_id !== null && ext_id !== null
                                && inst.origin_extension_id !== ext_id) {
                                continue;
                            }
                            instances.delete(id);
                            const old_queue = queues.get(id);
                            if (old_queue) {
                                old_queue.cancel_all();
                                queues.delete(id);
                            }
                            // 清理归属该实例的 command_owners 条目
                            for (const [cmd_id, owner_id] of [...command_owners.entries()]) {
                                if (owner_id === id) {
                                    command_owners.delete(cmd_id);
                                }
                            }
                        }
                    }
                }

                // t169: 首次/重 enroll 门槛已在上方（existing → t137 origin 校验；!existing → secret 要求）。

                instances.set(instance_id, {
                    instance_id,
                    extension_version: body.extension_version,
                    active_capture_id: null,
                    browser_label: new_label,
                    token_hash,
                    seen_at: Date.now(),
                    origin_extension_id: ext_id,
                });
                get_or_create_queue(instance_id);
                persist_instances();

                // t169: pairing code 一次性消费——用 pairing 完成 enroll 后关闭（窗口内单次使用）
                if (!has_mcp && pairing_valid) {
                    pairing_state.open = false;
                    pairing_state.code = null;
                    pairing_state.expires_at = 0;
                }

                return send_json(response, 200, {
                    ok: true,
                    data: {
                        instance_id,
                        instance_token,
                        browser_label: new_label,
                    },
                });
            }

            const path = request.url?.split('?')[0] || '';
            const is_extension_data_path = path === '/extension/heartbeat'
                || path === '/extension/command'
                || path === '/extension/result';
            const is_mcp_path = path.startsWith('/mcp/') || path.startsWith('/cdp/');

            let auth_instance_id: string | null = null;
            if (is_extension_data_path) {
                const resolved = resolve_extension_auth(request, config.token, instances);
                if (!resolved.ok) {
                    bridge_warn('auth_failed', { path: request.url, reason: 'extension_path_invalid_token' });
                    return send_json(response, 401, {
                        ok: false,
                        error: { code: 'TOKEN_INVALID', message: 'Invalid token' },
                    });
                }
                auth_instance_id = resolved.instance_id;
            } else if (is_mcp_path) {
                if (!is_authorized(request, config.token)) {
                    bridge_warn('auth_failed', { path: request.url, reason: 'mcp_path_invalid_token' });
                    return send_json(response, 401, {
                        ok: false,
                        error: { code: 'TOKEN_INVALID', message: 'Invalid token' },
                    });
                }
            } else if (!is_authorized(request, config.token)) {
                bridge_warn('auth_failed', { path: request.url, reason: 'invalid_token' });
                return send_json(response, 401, {
                    ok: false,
                    error: { code: 'TOKEN_INVALID', message: 'Invalid token' },
                });
            }

            if (request.method === 'POST' && request.url === '/extension/heartbeat') {
                const body = validate_heartbeat(await read_json(request));
                if (auth_instance_id && auth_instance_id !== body.instance_id) {
                    bridge_warn('auth_failed', { path: request.url, reason: 'heartbeat_instance_mismatch' });
                    return send_json(response, 401, {
                        ok: false,
                        error: { code: 'TOKEN_INVALID', message: 'instance_id does not match token' },
                    });
                }
                const prev = instances.get(body.instance_id);
                // T091: 扩展未设 label 时保留 Bridge 自动分配的默认编号；自定义 label 优先。
                // （覆盖 T047 的「显式清空为 null」：清空 = 回到默认编号，不再清成 null。）
                const provided_label = body.browser_label !== undefined
                    ? (body.browser_label && body.browser_label.length > 0 ? body.browser_label : null)
                    : null;
                const new_label = provided_label ?? prev?.browser_label ?? next_default_label(
                    [...instances.values()]
                        .filter((inst) => inst.instance_id !== body.instance_id)
                        .map((inst) => inst.browser_label),
                );
                // 检测 label 变化：若新 label 与其他实例冲突则顶替（与 enroll 一致）
                if (new_label) {
                    // t137: heartbeat 顶替校验 origin 绑定——用被认证实例自身绑定的扩展 ID（而非请求 Origin，
                    // 因无 Origin 客户端可绕过）。伪造 origin 不得经 label 顶替删真实实例。
                    const hb_ext_id = prev?.origin_extension_id ?? null;
                    for (const [id, inst] of [...instances.entries()]) {
                        if (id !== body.instance_id && inst.browser_label === new_label) {
                            if (inst.origin_extension_id !== null && hb_ext_id !== null
                                && inst.origin_extension_id !== hb_ext_id) {
                                continue;
                            }
                            instances.delete(id);
                            const old_queue = queues.get(id);
                            if (old_queue) {
                                old_queue.cancel_all();
                                queues.delete(id);
                            }
                            for (const [cmd_id, owner_id] of [...command_owners.entries()]) {
                                if (owner_id === id) command_owners.delete(cmd_id);
                            }
                        }
                    }
                }
                instances.set(body.instance_id, {
                    instance_id: body.instance_id,
                    extension_version: body.extension_version,
                    active_capture_id: body.active_capture_id,
                    browser_label: new_label,
                    token_hash: prev?.token_hash ?? null,
                    seen_at: Date.now(),
                    origin_extension_id: prev?.origin_extension_id ?? null,
                });
                get_or_create_queue(body.instance_id);
                persist_instances();
                return send_json(response, 200, { ok: true });
            }

            if (request.method === 'GET' && (request.url === '/extension/command' || request.url?.startsWith('/extension/command?'))) {
                const instance_id = auth_instance_id || read_instance_id(request);
                if (!instance_id) {
                    return send_json(response, 400, {
                        ok: false,
                        error: { code: 'INVALID_QUERY', message: 'X-Capture-All-Instance-Id header is required' },
                    });
                }
                const inst = instances.get(instance_id);
                if (!inst || Date.now() - inst.seen_at > EXTENSION_TTL_MS) {
                    return send_json(response, 503, {
                        ok: false,
                        error: { code: 'EXTENSION_OFFLINE', message: 'Instance is offline; send heartbeat first' },
                    });
                }
                const queue = get_or_create_queue(instance_id);
                return send_json(response, 200, queue.take_next());
            }

            if (request.method === 'POST' && request.url === '/extension/result') {
                const instance_id = auth_instance_id || read_instance_id(request);
                if (!instance_id) {
                    return send_json(response, 400, {
                        ok: false,
                        error: { code: 'INVALID_QUERY', message: 'X-Capture-All-Instance-Id header is required' },
                    });
                }
                const body = await read_json(
                    request,
                    MAX_EXTENSION_RESULT_BODY_BYTES,
                ) as AgentCommandResult;
                const owner = command_owners.get(body.command_id);
                if (owner && owner !== instance_id) {
                    return send_json(response, 400, {
                        ok: false,
                        error: { code: 'INVALID_QUERY', message: 'command_id does not belong to this instance' },
                    });
                }
                const queue = queues.get(instance_id);
                if (!queue) {
                    return send_json(response, 400, {
                        ok: false,
                        error: { code: 'INVALID_QUERY', message: 'Unknown instance queue' },
                    });
                }
                // B1-L3: resolve 未知 command_id 是客户端错误，返回 400 而非抛给顶层变 500
                try {
                    queue.resolve(body);
                } catch {
                    return send_json(response, 400, {
                        ok: false,
                        error: { code: 'INVALID_QUERY', message: `Unknown command_id: ${body.command_id}` },
                    });
                }
                command_owners.delete(body.command_id);
                return send_json(response, 200, { ok: true });
            }

            if (request.method === 'GET' && request.url === '/mcp/status') {
                return send_json(response, 200, build_status(actual_port(server)));
            }

            if (request.method === 'POST' && request.url === '/mcp/command') {
                const body = validate_command_request(await read_json(request));
                // t137: explicit output_path 尽早校验（resolve_target 之前），防穿越路径进入导出写盘
                if (typeof body.payload.output_path === 'string' && body.payload.output_path.length > 0) {
                    await safe_output_path(body.payload.output_path, default_export_dir());
                }
                const target = resolve_target(body.payload);
                if ('error' in target) {
                    const status = target.error.code === 'EXTENSION_OFFLINE' ? 503 : 400;
                    return send_json(response, status, {
                        ok: false,
                        error: target.error,
                    });
                }

                const default_timeout = FULL_DATA_COMMANDS.has(body.type)
                    ? config.full_data_timeout_ms
                    : config.command_timeout_ms;
                const queue = get_or_create_queue(target.instance_id);
                const pending = queue.enqueue(body.type, body.payload, body.timeout_ms || default_timeout);
                command_owners.set(pending.command.command_id, target.instance_id);
                const result = await pending.result;
                command_owners.delete(pending.command.command_id);
                if (result.ok === false && result.error?.code === 'COMMAND_TIMEOUT') {
                    // B1-M13: 命令超时补结构化日志
                    bridge_warn('command_timeout', {
                        command_id: pending.command.command_id,
                        type: body.type,
                        timeout_ms: body.timeout_ms || default_timeout,
                    });
                }

                if (result.ok && FULL_DATA_COMMANDS.has(body.type)) {
                    const explicit_path = typeof body.payload.output_path === 'string' && body.payload.output_path.length > 0
                        ? body.payload.output_path
                        : null;
                    const content = extract_result_content(result);
                    const size_bytes = Buffer.byteLength(content, 'utf-8');

                    if (explicit_path || size_bytes > INLINE_RESULT_MAX_BYTES) {
                        // t137: explicit 路径约束到导出目录内（含符号链接收敛），防路径穿越任意写
                        const output_path = explicit_path
                            ? await safe_output_path(explicit_path, default_export_dir())
                            : await resolve_auto_output_path(body.payload);
                        const written = await write_result_to_file(result, output_path, content);
                        return send_json(response, 200, written);
                    }
                }

                return send_json(response, 200, result);
            }

            // CDP bridge routes
            if (request.method === 'POST' && request.url === '/cdp/detect') {
                const body = await read_json(request) as Record<string, unknown>;
                const result = await handle_cdp_detect(request, body);
                return send_json(response, result.status, result.body);
            }

            if (request.method === 'POST' && request.url === '/cdp/start') {
                const body = await read_json(request) as Record<string, unknown>;
                const result = await handle_cdp_start(request, body);
                return send_json(response, result.status, result.body);
            }

            if (request.method === 'GET' && request.url?.startsWith('/cdp/events')) {
                const url = new URL(request.url, `http://${config.host}:${actual_port(server)}`);
                const result = await handle_cdp_events(request, url);
                return send_json(response, result.status, result.body);
            }

            if (request.method === 'POST' && request.url === '/cdp/stop') {
                const body = await read_json(request) as Record<string, unknown>;
                const result = await handle_cdp_stop(body);
                return send_json(response, result.status, result.body);
            }

            return send_json(response, 404, { ok: false, error: { code: 'BRIDGE_UNAVAILABLE', message: 'Route not found' } });
        } catch (error) {
            if (error instanceof BridgeHttpError) {
                return send_json(response, error.status, {
                    ok: false,
                    error: { code: error.code, message: error.message },
                });
            }

            return send_json(response, 500, {
                ok: false,
                error: { code: 'BRIDGE_UNAVAILABLE', message: error instanceof Error ? error.message : 'Bridge error' },
            });
        }
    });

    await new Promise<void>((resolve) => server.listen(config.port, config.host, resolve));

    return {
        url: `http://${config.host}:${actual_port(server)}`,
        close: () => new Promise((resolve) => server.close(() => resolve())),
        _server: server,
    };
}

function is_allowed_extension_origin(origin: string): boolean {
    return /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
}

// 从 chrome-extension://<id> 提取扩展 ID（已校验形状）。
function extension_id_from_origin(origin: string): string | null {
    const m = origin.match(/^chrome-extension:\/\/([a-p]{32})$/);
    return m ? m[1] : null;
}

function set_cors_headers(
    response: http.ServerResponse,
    origin: string,
): void {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader(
        'Access-Control-Allow-Headers',
        'Authorization, Content-Type',
    );
    response.setHeader('Vary', 'Origin');
}

function is_authorized(request: http.IncomingMessage, token: string): boolean {
    const actual = createHash('sha256')
        .update(request.headers.authorization || '')
        .digest();
    const expected = createHash('sha256')
        .update(`Bearer ${token}`)
        .digest();

    return timingSafeEqual(actual, expected);
}

function hash_token(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

function read_bearer_token(request: http.IncomingMessage): string | null {
    const auth = request.headers.authorization;
    if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) return null;
    const token = auth.slice('Bearer '.length).trim();
    return token.length > 0 ? token : null;
}

function resolve_extension_auth(
    request: http.IncomingMessage,
    mcp_token: string,
    instances: Map<string, ExtensionInstance>,
): { ok: true; instance_id: string | null } | { ok: false } {
    // Bootstrap / tests: shared mcp token still allowed for extension routes.
    if (is_authorized(request, mcp_token)) {
        return { ok: true, instance_id: read_instance_id(request) };
    }

    const bearer = read_bearer_token(request);
    if (!bearer) return { ok: false };

    const bearer_hash = hash_token(bearer);
    for (const inst of instances.values()) {
        if (!inst.token_hash) continue;
        const a = Buffer.from(bearer_hash, 'hex');
        const b = Buffer.from(inst.token_hash, 'hex');
        if (a.length === b.length && timingSafeEqual(a, b)) {
            const header_id = read_instance_id(request);
            if (header_id && header_id !== inst.instance_id) {
                return { ok: false };
            }
            return { ok: true, instance_id: inst.instance_id };
        }
    }
    return { ok: false };
}

function validate_enroll(value: unknown): {
    browser_label?: string | null;
    extension_version: string;
    instance_id?: string;
    pairing_code?: string;
} {
    if (!is_plain_object(value)) {
        throw new BridgeHttpError(400, 'INVALID_QUERY', 'Enroll body must be an object');
    }
    if (typeof value.extension_version !== 'string' || value.extension_version.length === 0) {
        throw new BridgeHttpError(400, 'INVALID_QUERY', 'extension_version is required');
    }
    if (value.instance_id !== undefined && (typeof value.instance_id !== 'string' || value.instance_id.length === 0)) {
        throw new BridgeHttpError(400, 'INVALID_QUERY', 'instance_id must be a non-empty string');
    }
    if (value.browser_label !== undefined && value.browser_label !== null && typeof value.browser_label !== 'string') {
        throw new BridgeHttpError(400, 'INVALID_QUERY', 'browser_label must be a string or null');
    }
    if (value.pairing_code !== undefined && typeof value.pairing_code !== 'string') {
        throw new BridgeHttpError(400, 'INVALID_QUERY', 'pairing_code must be a string');
    }
    return {
        browser_label: value.browser_label as string | null | undefined,
        extension_version: value.extension_version,
        instance_id: value.instance_id as string | undefined,
        pairing_code: value.pairing_code as string | undefined,
    };
}

function read_instance_id(request: http.IncomingMessage): string | null {
    const raw = request.headers[INSTANCE_HEADER];
    if (typeof raw === 'string' && raw.length > 0) return raw;
    if (Array.isArray(raw) && raw[0]) return raw[0];
    if (request.url?.includes('?')) {
        try {
            const url = new URL(request.url, 'http://127.0.0.1');
            const q = url.searchParams.get('instance_id');
            if (q) return q;
        } catch {
            // ignore
        }
    }
    return null;
}

function actual_port(server: http.Server): number {
    return (server.address() as AddressInfo).port;
}

function is_enroll_allowed(state: PairingState, pairing_code?: string): boolean {
    const now = Date.now();
    if (!state.open || state.expires_at < now) {
        return false;
    }
    if (pairing_code && state.code && pairing_code === state.code) {
        return true;
    }
    return false;
}

function build_pairing_status(state: PairingState): { open: boolean; code: string | null; expires_at: number } {
    const now = Date.now();
    const open = state.open && state.expires_at > now;
    return {
        open,
        code: open ? state.code : null,
        expires_at: open ? state.expires_at : 0,
    };
}

function serve_pair_page(
    response: http.ServerResponse,
    _state: PairingState,
    _host: string,
    _port: number,
): void {
    const html = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Capture All - Pair</title>
<style>
*,*::before,*::after{box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:40px auto;padding:20px;color:#333}
h1{font-size:22px;margin:0 0 8px}
.meta{color:#666;font-size:13px;margin-bottom:24px}
code{display:inline-block;background:#f5f5f5;padding:6px 14px;border-radius:6px;font-size:28px;letter-spacing:6px;font-family:monospace}
.card{background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:20px;margin-bottom:16px}
.card h2{font-size:16px;margin:0 0 12px}
.row{display:flex;gap:8px;align-items:center}
input{padding:8px 12px;border:1px solid #ccc;border-radius:6px;font-size:15px;flex:1}
button{padding:8px 20px;border:none;border-radius:6px;font-size:15px;cursor:pointer;background:#1a73e8;color:#fff}
button:active{opacity:.8}
.msg{margin-top:8px;font-size:13px}
.msg.ok{color:#1e8e3e}
.msg.err{color:#d93025}
.closed{color:#999;text-align:center;padding:40px 0;font-size:15px}
</style>
</head>
<body>
<h1>Capture All Pair</h1>
<div id="root">Loading...</div>
<script>
const ROOT = document.getElementById('root');
async function refresh(){try{const r=await fetch('/pair/status');const d=await r.json();const s=d.data;if(!s.open){ROOT.innerHTML='<div class="closed">Pairing is closed.<br><small>Run <code style="font-size:14px;letter-spacing:0">POST /pair/open</code> via MCP to enable.</small></div>';return}const exp=new Date(s.expires_at).toLocaleTimeString();
ROOT.innerHTML='<div class="card"><h2>Pairing Code</h2><code>'+s.code+'</code><p class="meta">Expires at '+exp+'</p><p style="font-size:13px;color:#666">Open the extension popup and let it enroll while this code is active. No per-browser approval needed.</p></div>';
}catch(e){ROOT.innerHTML='<div class="closed">Error loading status</div>'}}
refresh();
</script>
</body>
</html>`;
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(html);
}

class BridgeHttpError extends Error {
    constructor(
        readonly status: number,
        readonly code: 'INVALID_QUERY' | 'PAYLOAD_TOO_LARGE' | 'BRIDGE_UNAVAILABLE',
        message: string,
    ) {
        super(message);
    }
}

interface FileOutputResult {
    command_id: string;
    ok: true;
    data: { file_path: string; size_bytes: number };
}

function extract_result_content(result: AgentCommandResult): string {
    const data = result.data as Record<string, unknown> | undefined;
    return typeof data?.content === 'string' ? data.content : JSON.stringify(data ?? {});
}

function default_export_dir(): string {
    const from_env = process.env.CAPTURE_ALL_EXPORT_DIR?.trim();
    if (from_env) return from_env;
    return join(tmpdir(), 'capture-all-exports');
}

async function resolve_auto_output_path(payload: Record<string, unknown>): Promise<string> {
    const dir = default_export_dir();
    await mkdir(dir, { recursive: true });

    const capture_id = typeof payload.capture_id === 'string' && payload.capture_id.length > 0
        ? payload.capture_id
        : `export_${Date.now()}`;
    const raw_format = typeof payload.format === 'string' && payload.format.length > 0
        ? payload.format
        : 'json';
    // T096: format 白名单净化，杜绝 `..` / 路径分隔逃逸 EXPORT_DIR。
    const format = /^[a-zA-Z0-9]{1,16}$/.test(raw_format) ? raw_format.toLowerCase() : 'json';
    const safe_id = capture_id.replace(/[^a-zA-Z0-9._-]/g, '_');
    return join(dir, `${safe_id}.${format}`);
}

// t137: explicit output_path 约束到导出目录内，防路径穿越与符号链接任意写。
// realpath 解析符号链接后校验真实路径在 base 内（path.resolve 纯词法不解析链接）。
async function safe_output_path(raw: string, base: string): Promise<string> {
    // t176: 默认导出目录可能不存在（首次使用）——先安全创建，realpath(base) 才不抛 ENOENT。
    // 创建前无 symlink 竞争窗口（base 由配置/环境变量指定，非攻击者可控路径）。
    await mkdir(base, { recursive: true });
    const resolved = resolve(base, raw);
    if (resolved !== base && !resolved.startsWith(base + sep)) {
        throw new BridgeHttpError(400, 'INVALID_QUERY', 'output_path must be inside export dir');
    }
    // 父目录 realpath 收敛（目标文件可能不存在）：解析已存在的最深父目录真实路径。
    // base 本身须先 realpath——base 含符号链接组件（如 macOS /tmp→/private/tmp）时词法与真实路径不一致。
    const base_real = await realpath(base);
    let real_parent = base_real;
    let remaining = raw;
    let guard = 0;
    while (remaining.length > 0 && guard < 64) {
        const next = resolve(real_parent, remaining.split(sep)[0]);
        try {
            const rp = await realpath(next);
            real_parent = rp;
            const parts = remaining.split(sep);
            parts.shift();
            remaining = parts.join(sep);
        } catch {
            break; // 该段不存在，停止收敛
        }
        guard += 1;
    }
    const resolved_real = resolve(real_parent, remaining);
    if (resolved_real !== base_real && !resolved_real.startsWith(base_real + sep)) {
        throw new BridgeHttpError(400, 'INVALID_QUERY', 'output_path resolves outside export dir');
    }
    // t176: 嵌套父目录可能不存在——创建后再 realpath 校验（防 symlink 逃逸窗口：
    // 若 base 下预置 symlink 指向外部，mkdir 跟随后在真实路径校验处被拒）。
    await mkdir(dirname(resolved), { recursive: true });
    const parent_real = await realpath(dirname(resolved));
    if (parent_real !== base_real && !parent_real.startsWith(base_real + sep)) {
        throw new BridgeHttpError(400, 'INVALID_QUERY', 'output_path parent resolves outside export dir');
    }
    return resolved;
}

export const _safe_output_path_for_test = safe_output_path;

async function write_result_to_file(
    result: AgentCommandResult,
    output_path: string,
    content = extract_result_content(result),
): Promise<FileOutputResult> {
    try {
        await writeFile(output_path, content, 'utf-8');
    } catch (error) {
        throw new BridgeHttpError(500, 'BRIDGE_UNAVAILABLE', error instanceof Error ? error.message : 'Failed to write file');
    }
    return {
        command_id: result.command_id,
        ok: true,
        data: { file_path: output_path, size_bytes: Buffer.byteLength(content, 'utf-8') },
    };
}

function validate_heartbeat(value: unknown): {
    instance_id: string;
    extension_version: string;
    active_capture_id: string | null;
    browser_label?: string | null;
} {
    if (!is_plain_object(value)) {
        throw new BridgeHttpError(400, 'INVALID_QUERY', 'Heartbeat body must be an object');
    }

    if (typeof value.instance_id !== 'string' || value.instance_id.length === 0) {
        throw new BridgeHttpError(400, 'INVALID_QUERY', 'instance_id is required');
    }

    const active_capture_id = value.active_capture_id;
    if (typeof value.extension_version !== 'string' || !(typeof active_capture_id === 'string' || active_capture_id === null)) {
        throw new BridgeHttpError(400, 'INVALID_QUERY', 'Heartbeat body is invalid');
    }

    let browser_label: string | null | undefined;
    if (value.browser_label !== undefined) {
        if (value.browser_label !== null && typeof value.browser_label !== 'string') {
            throw new BridgeHttpError(400, 'INVALID_QUERY', 'browser_label must be a string or null');
        }
        browser_label = value.browser_label as string | null;
    }

    return {
        instance_id: value.instance_id,
        extension_version: value.extension_version,
        active_capture_id,
        browser_label,
    };
}

function validate_command_request(value: unknown): CommandRequest {
    if (!is_plain_object(value)) {
        throw new BridgeHttpError(400, 'INVALID_QUERY', 'Command body must be an object');
    }

    if (!is_agent_command_type(value.type)) {
        throw new BridgeHttpError(400, 'INVALID_QUERY', 'Unknown command type');
    }

    if (!is_plain_object(value.payload)) {
        throw new BridgeHttpError(400, 'INVALID_QUERY', 'Command payload must be an object');
    }

    if (value.timeout_ms !== undefined) {
        // T063: timeout_ms 必须是正整数且有合理上限（MAX_COMMAND_TIMEOUT_MS=5min）
        if (typeof value.timeout_ms !== 'number' || !Number.isInteger(value.timeout_ms) || value.timeout_ms <= 0 || value.timeout_ms > MAX_COMMAND_TIMEOUT_MS) {
            throw new BridgeHttpError(400, 'INVALID_QUERY', `Command timeout must be a positive integer <= ${MAX_COMMAND_TIMEOUT_MS}`);
        }
    }

    return {
        type: value.type,
        payload: value.payload,
        timeout_ms: value.timeout_ms,
    };
}

function is_agent_command_type(value: unknown): value is AgentCommandType {
    return typeof value === 'string' && AGENT_COMMAND_TYPES.includes(value as AgentCommandType);
}

function is_plain_object(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function read_json(
    request: http.IncomingMessage,
    max_body_bytes = MAX_JSON_BODY_BYTES,
): Promise<unknown> {
    const chunks: Buffer[] = [];
    let size = 0;

    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.byteLength;

        if (size > max_body_bytes) {
            throw new BridgeHttpError(413, 'PAYLOAD_TOO_LARGE', 'JSON body is too large');
        }

        chunks.push(buffer);
    }

    if (size === 0) {
        throw new BridgeHttpError(400, 'INVALID_QUERY', 'JSON body is required');
    }

    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    } catch {
        throw new BridgeHttpError(400, 'INVALID_QUERY', 'Invalid JSON body');
    }
}

function send_json(response: http.ServerResponse, status: number, body: unknown): void {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body));
}
