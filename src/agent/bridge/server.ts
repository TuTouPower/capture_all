import http from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { AGENT_COMMAND_TYPES, type AgentBridgeConfig, type AgentCommandResult, type AgentCommandType, type AgentStatus } from '../shared/protocol';
import { AgentCommandQueue } from './command_queue';
import { handle_cdp_detect, handle_cdp_start, handle_cdp_events, handle_cdp_stop } from './cdp_handler';

interface ExtensionInstance {
    instance_id: string;
    extension_version: string;
    active_capture_id: string | null;
    browser_no: number | null;
    browser_label: string | null;
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

            if (!is_authorized(request, config.token)) {
                return send_json(response, 401, { ok: false, error: { code: 'TOKEN_INVALID', message: 'Invalid token' } });
            }

            if (request.method === 'POST' && request.url === '/extension/heartbeat') {
                const body = validate_heartbeat(await read_json(request));
                const prev = instances.get(body.instance_id);
                instances.set(body.instance_id, {
                    instance_id: body.instance_id,
                    extension_version: body.extension_version,
                    active_capture_id: body.active_capture_id,
                    browser_no: body.browser_no ?? prev?.browser_no ?? null,
                    browser_label: body.browser_label ?? prev?.browser_label ?? null,
                    seen_at: Date.now(),
                });
                get_or_create_queue(body.instance_id);
                return send_json(response, 200, { ok: true });
            }

            if (request.method === 'GET' && (request.url === '/extension/command' || request.url?.startsWith('/extension/command?'))) {
                const instance_id = read_instance_id(request);
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
                const instance_id = read_instance_id(request);
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
