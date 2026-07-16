import http from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { AGENT_COMMAND_TYPES, type AgentBridgeConfig, type AgentCommandResult, type AgentCommandType, type AgentStatus } from '../shared/protocol';
import { AgentCommandQueue } from './command_queue';
import { handle_cdp_detect, handle_cdp_start, handle_cdp_events, handle_cdp_stop } from './cdp_handler';

interface PairingState {
    open: boolean;
    code: string | null;
    expires_at: number;
    allowlist: Set<number>;
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
    browser_no: number | null;
    browser_label: string | null;
    token_hash: string | null;
    seen_at: number;
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
const WRITE_COMMANDS = new Set<AgentCommandType>([
    'capture.start',
    'capture.stop',
    'capture.export',
    'capture.get_all_data',
]);

export async function create_bridge_server(config: AgentBridgeConfig): Promise<{ url: string; close: () => Promise<void>; _server: http.Server }> {
    const instances = new Map<string, ExtensionInstance>();
    const queues = new Map<string, AgentCommandQueue>();
    const command_owners = new Map<string, string>();
    const pairing_state: PairingState = {
        open: false,
        code: null,
        expires_at: 0,
        allowlist: new Set(),
    };
    const is_s0 = Boolean(config.dev_mode);

    function get_or_create_queue(instance_id: string): AgentCommandQueue {
        let queue = queues.get(instance_id);
        if (!queue) {
            queue = new AgentCommandQueue();
            queues.set(instance_id, queue);
        }
        return queue;
    }

    function prune_stale(now = Date.now()): void {
        for (const [id, inst] of instances) {
            if (now - inst.seen_at > EXTENSION_TTL_MS) {
                // keep last metadata but mark offline via is_online check; do not delete so status can show offline if needed
                void id;
            }
        }
    }

    function list_online(now = Date.now()): ExtensionInstance[] {
        prune_stale(now);
        return [...instances.values()].filter((inst) => now - inst.seen_at <= EXTENSION_TTL_MS);
    }

    function resolve_target(payload: Record<string, unknown>, write: boolean): { instance_id: string } | { error: { code: 'TARGET_REQUIRED' | 'TARGET_NOT_FOUND' | 'EXTENSION_OFFLINE'; message: string } } {
        const online = list_online();
        if (online.length === 0) {
            return { error: { code: 'EXTENSION_OFFLINE', message: 'Extension is offline' } };
        }

        const target_instance_id = typeof payload.target_instance_id === 'string' && payload.target_instance_id.length > 0
            ? payload.target_instance_id
            : null;
        const browser_no = typeof payload.browser_no === 'number' && Number.isInteger(payload.browser_no)
            ? payload.browser_no
            : null;

        if (target_instance_id) {
            const inst = online.find((item) => item.instance_id === target_instance_id);
            if (!inst) {
                return { error: { code: 'TARGET_NOT_FOUND', message: `Target instance not online: ${target_instance_id}` } };
            }
            return { instance_id: inst.instance_id };
        }

        if (browser_no !== null) {
            const inst = online.find((item) => item.browser_no === browser_no);
            if (!inst) {
                return { error: { code: 'TARGET_NOT_FOUND', message: `No online extension with browser_no=${browser_no}` } };
            }
            return { instance_id: inst.instance_id };
        }

        if (online.length === 1) {
            return { instance_id: online[0].instance_id };
        }

        if (write || online.length > 1) {
            return {
                error: {
                    code: 'TARGET_REQUIRED',
                    message: 'Multiple extensions online; specify browser_no or target_instance_id',
                },
            };
        }

        return { instance_id: online[0].instance_id };
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
                browser_no: inst.browser_no,
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
                pairing_state.allowlist.clear();
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
                    return send_json(response, 401, {
                        ok: false,
                        error: { code: 'TOKEN_INVALID', message: 'Invalid token' },
                    });
                }
                pairing_state.open = false;
                pairing_state.code = null;
                pairing_state.expires_at = 0;
                pairing_state.allowlist.clear();
                return send_json(response, 200, { ok: true, data: { open: false } });
            }

            if (request.method === 'POST' && request.url === '/pair/approve') {
                const body = await read_json(request).catch(() => ({}));
                const browser_no = (body as Record<string, unknown>).browser_no;
                if (typeof browser_no !== 'number' || !Number.isInteger(browser_no) || browser_no < 1) {
                    return send_json(response, 400, {
                        ok: false,
                        error: { code: 'INVALID_QUERY', message: 'browser_no must be a positive integer' },
                    });
                }
                if (!pairing_state.open || pairing_state.expires_at < Date.now()) {
                    return send_json(response, 403, {
                        ok: false,
                        error: { code: 'PAIRING_REQUIRED', message: 'Pairing is not open. Open /pair page first.' },
                    });
                }
                pairing_state.allowlist.add(browser_no);
                return send_json(response, 200, { ok: true, data: { browser_no, approved: true } });
            }

            if (request.method === 'POST' && request.url === '/extension/enroll') {
                // S0: trust loopback + allowed chrome-extension origin (or mcp token bootstrap).
                const has_mcp = is_authorized(request, config.token);
                const has_ext_origin = Boolean(origin && is_allowed_extension_origin(origin));
                if (!has_mcp && !has_ext_origin) {
                    return send_json(response, 401, {
                        ok: false,
                        error: { code: 'TOKEN_INVALID', message: 'Enroll requires chrome-extension origin or mcp token' },
                    });
                }

                const body = validate_enroll(await read_json(request));
                const instance_id = body.instance_id || `inst_${randomBytes(8).toString('hex')}`;

                // T0009 S1: extension origin must pass pairing check (MCP bypasses)
                if (!has_mcp && !is_s0) {
                    const allowed = is_enroll_allowed(pairing_state, body.browser_no, body.pairing_code);
                    if (!allowed) {
                        return send_json(response, 403, {
                            ok: false,
                            error: {
                                code: 'PAIRING_REQUIRED',
                                message: 'Local pair approval required. Open /pair page on this machine to allow this browser.',
                            },
                        });
                    }
                }

                const instance_token = `ext_${randomBytes(24).toString('base64url')}`;
                const token_hash = hash_token(instance_token);

                // Replace any existing binding for same browser_no.
                for (const [id, inst] of [...instances.entries()]) {
                    if (inst.browser_no === body.browser_no && id !== instance_id) {
                        instances.delete(id);
                        queues.delete(id);
                    }
                }

                instances.set(instance_id, {
                    instance_id,
                    extension_version: body.extension_version,
                    active_capture_id: null,
                    browser_no: body.browser_no,
                    browser_label: body.browser_label ?? null,
                    token_hash,
                    seen_at: Date.now(),
                });
                get_or_create_queue(instance_id);

                return send_json(response, 200, {
                    ok: true,
                    data: {
                        instance_id,
                        instance_token,
                        browser_no: body.browser_no,
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
                    return send_json(response, 401, {
                        ok: false,
                        error: { code: 'TOKEN_INVALID', message: 'Invalid token' },
                    });
                }
                auth_instance_id = resolved.instance_id;
            } else if (is_mcp_path) {
                if (!is_authorized(request, config.token)) {
                    return send_json(response, 401, {
                        ok: false,
                        error: { code: 'TOKEN_INVALID', message: 'Invalid token' },
                    });
                }
            } else if (!is_authorized(request, config.token)) {
                return send_json(response, 401, {
                    ok: false,
                    error: { code: 'TOKEN_INVALID', message: 'Invalid token' },
                });
            }

            if (request.method === 'POST' && request.url === '/extension/heartbeat') {
                const body = validate_heartbeat(await read_json(request));
                if (auth_instance_id && auth_instance_id !== body.instance_id) {
                    return send_json(response, 401, {
                        ok: false,
                        error: { code: 'TOKEN_INVALID', message: 'instance_id does not match token' },
                    });
                }
                const prev = instances.get(body.instance_id);
                instances.set(body.instance_id, {
                    instance_id: body.instance_id,
                    extension_version: body.extension_version,
                    active_capture_id: body.active_capture_id,
                    browser_no: body.browser_no ?? prev?.browser_no ?? null,
                    browser_label: body.browser_label ?? prev?.browser_label ?? null,
                    token_hash: prev?.token_hash ?? null,
                    seen_at: Date.now(),
                });
                get_or_create_queue(body.instance_id);
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
                queue.resolve(body);
                command_owners.delete(body.command_id);
                return send_json(response, 200, { ok: true });
            }

            if (request.method === 'GET' && request.url === '/mcp/status') {
                return send_json(response, 200, build_status(actual_port(server)));
            }

            if (request.method === 'POST' && request.url === '/mcp/command') {
                const body = validate_command_request(await read_json(request));
                const is_write = WRITE_COMMANDS.has(body.type);
                const target = resolve_target(body.payload, is_write);
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

                if (result.ok && FULL_DATA_COMMANDS.has(body.type)) {
                    const explicit_path = typeof body.payload.output_path === 'string' && body.payload.output_path.length > 0
                        ? body.payload.output_path
                        : null;
                    const content = extract_result_content(result);
                    const size_bytes = Buffer.byteLength(content, 'utf-8');

                    if (explicit_path || size_bytes > INLINE_RESULT_MAX_BYTES) {
                        const output_path = explicit_path || await resolve_auto_output_path(body.payload);
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
    browser_no: number;
    browser_label?: string | null;
    extension_version: string;
    instance_id?: string;
    pairing_code?: string;
} {
    if (!is_plain_object(value)) {
        throw new BridgeHttpError(400, 'INVALID_QUERY', 'Enroll body must be an object');
    }
    if (typeof value.browser_no !== 'number' || !Number.isInteger(value.browser_no) || value.browser_no < 1) {
        throw new BridgeHttpError(400, 'INVALID_QUERY', 'browser_no must be a positive integer');
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
        browser_no: value.browser_no,
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

function is_enroll_allowed(state: PairingState, browser_no: number, pairing_code?: string): boolean {
    const now = Date.now();
    if (!state.open || state.expires_at < now) {
        return false;
    }
    if (state.allowlist.has(browser_no)) {
        return true;
    }
    if (pairing_code && state.code && pairing_code === state.code) {
        state.allowlist.add(browser_no);
        return true;
    }
    return false;
}

function build_pairing_status(state: PairingState): { open: boolean; code: string | null; expires_at: number; allowlist: number[] } {
    const now = Date.now();
    const open = state.open && state.expires_at > now;
    return {
        open,
        code: open ? state.code : null,
        expires_at: open ? state.expires_at : 0,
        allowlist: open ? [...state.allowlist] : [],
    };
}

function serve_pair_page(
    response: http.ServerResponse,
    state: PairingState,
    host: string,
    port: number,
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
async function refresh(){try{const r=await fetch('/pair/status');const d=await r.json();const s=d.data;if(!s.open){ROOT.innerHTML='<div class="closed">Pairing is closed.<br><small>Run <code style="font-size:14px;letter-spacing:0">POST /pair/open</code> via MCP to enable.</small></div>';return}const exp=new Date(s.expires_at).toLocaleTimeString();let allowlist='';if(s.allowlist.length>0)allowlist='<p style="font-size:13px;color:#666">Approved browsers: '+s.allowlist.join(', ')+'</p>';
ROOT.innerHTML='<div class="card"><h2>Pairing Code</h2><code>'+s.code+'</code><p class="meta">Expires at '+exp+'</p>'+allowlist+'</div><div class="card"><h2>Approve Browser</h2><div class="row"><input id="bno" type="number" placeholder="Browser No" min="1"><button onclick="approve()">Approve</button></div><div id="msg" class="msg"></div></div>';
}catch(e){ROOT.innerHTML='<div class="closed">Error loading status</div>'}}
async function approve(){const v=parseInt(document.getElementById('bno').value);const m=document.getElementById('msg');if(!v){m.className='msg err';m.textContent='Enter a browser number';return}try{const r=await fetch('/pair/approve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({browser_no:v})});const d=await r.json();if(d.ok){m.className='msg ok';m.textContent='Approved browser '+v;refresh()}else{m.className='msg err';m.textContent=d.error?.message||'Failed'}}catch(e){m.className='msg err';m.textContent='Error: '+e.message}}
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
    const format = typeof payload.format === 'string' && payload.format.length > 0
        ? payload.format
        : 'json';
    const safe_id = capture_id.replace(/[^a-zA-Z0-9._-]/g, '_');
    return join(dir, `${safe_id}.${format}`);
}

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
    browser_no?: number | null;
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

    let browser_no: number | null | undefined;
    if (value.browser_no !== undefined) {
        if (typeof value.browser_no !== 'number' || !Number.isInteger(value.browser_no) || value.browser_no < 1) {
            throw new BridgeHttpError(400, 'INVALID_QUERY', 'browser_no must be a positive integer');
        }
        browser_no = value.browser_no;
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
        browser_no,
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

    if (value.timeout_ms !== undefined && typeof value.timeout_ms !== 'number') {
        throw new BridgeHttpError(400, 'INVALID_QUERY', 'Command timeout must be a number');
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
