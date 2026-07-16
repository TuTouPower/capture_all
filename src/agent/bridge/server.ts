import http from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { AGENT_COMMAND_TYPES, type AgentBridgeConfig, type AgentCommandResult, type AgentCommandType, type AgentStatus } from '../shared/protocol';
import { AgentCommandQueue } from './command_queue';
import { handle_cdp_detect, handle_cdp_start, handle_cdp_events, handle_cdp_stop } from './cdp_handler';

interface ExtensionHeartbeat {
    extension_version: string;
    active_capture_id: string | null;
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

const FULL_DATA_COMMANDS = new Set<AgentCommandType>(['capture.export', 'capture.get_all_data']);

export async function create_bridge_server(config: AgentBridgeConfig): Promise<{ url: string; close: () => Promise<void>; _server: http.Server }> {
    const queue = new AgentCommandQueue();
    let heartbeat: ExtensionHeartbeat | null = null;

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
                heartbeat = { ...body, seen_at: Date.now() };
                return send_json(response, 200, { ok: true });
            }

            if (request.method === 'GET' && request.url === '/extension/command') {
                return send_json(response, 200, queue.take_next());
            }

            if (request.method === 'POST' && request.url === '/extension/result') {
                const body = await read_json(
                    request,
                    MAX_EXTENSION_RESULT_BODY_BYTES,
                ) as AgentCommandResult;
                queue.resolve(body);
                return send_json(response, 200, { ok: true });
            }

            if (request.method === 'GET' && request.url === '/mcp/status') {
                const online = is_extension_online(heartbeat);
                const status: AgentStatus = {
                    bridge_version: BRIDGE_VERSION,
                    bridge_url: `http://${config.host}:${actual_port(server)}`,
                    extension_online: online,
                    extension_version: online ? heartbeat!.extension_version : null,
                    active_capture_id: online ? heartbeat!.active_capture_id : null,
                    pending_commands: queue.pending_count(),
                };
                return send_json(response, 200, status);
            }

            if (request.method === 'POST' && request.url === '/mcp/command') {
                if (!is_extension_online(heartbeat)) {
                    return send_json(response, 503, {
                        ok: false,
                        error: { code: 'EXTENSION_OFFLINE', message: 'Extension is offline' },
                    });
                }

                const body = validate_command_request(await read_json(request));
                const default_timeout = FULL_DATA_COMMANDS.has(body.type)
                    ? config.full_data_timeout_ms
                    : config.command_timeout_ms;
                const pending = queue.enqueue(body.type, body.payload, body.timeout_ms || default_timeout);
                const result = await pending.result;

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

function is_extension_online(heartbeat: ExtensionHeartbeat | null): boolean {
    return Boolean(heartbeat && Date.now() - heartbeat.seen_at <= EXTENSION_TTL_MS);
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

function validate_heartbeat(value: unknown): Omit<ExtensionHeartbeat, 'seen_at'> {
    if (!is_plain_object(value)) {
        throw new BridgeHttpError(400, 'INVALID_QUERY', 'Heartbeat body must be an object');
    }

    const active_capture_id = value.active_capture_id;
    if (typeof value.extension_version !== 'string' || !(typeof active_capture_id === 'string' || active_capture_id === null)) {
        throw new BridgeHttpError(400, 'INVALID_QUERY', 'Heartbeat body is invalid');
    }

    return {
        extension_version: value.extension_version,
        active_capture_id,
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
