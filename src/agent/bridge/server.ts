import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { AGENT_COMMAND_TYPES, type AgentBridgeConfig, type AgentCommandResult, type AgentCommandType, type AgentStatus } from '../shared/protocol';
import { AgentCommandQueue } from './command_queue';
import { handle_cdp_detect, handle_cdp_start, handle_cdp_events, handle_cdp_stop } from './cdp_handler';

interface ExtensionHeartbeat {
    extension_version: string;
    active_session_id: string | null;
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

export async function create_bridge_server(config: AgentBridgeConfig): Promise<{ url: string; close: () => Promise<void> }> {
    const queue = new AgentCommandQueue();
    let heartbeat: ExtensionHeartbeat | null = null;

    const server = http.createServer(async (request, response) => {
        // CORS for extension bridge access
        response.setHeader('Access-Control-Allow-Origin', '*');
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

        if (request.method === 'OPTIONS') {
            response.writeHead(204);
            response.end();
            return;
        }

        try {
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
                const body = await read_json(request) as AgentCommandResult;
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
                    active_session_id: online ? heartbeat!.active_session_id : null,
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
                const pending = queue.enqueue(body.type, body.payload, body.timeout_ms || config.command_timeout_ms);
                const result = await pending.result;
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
    };
}

function is_authorized(request: http.IncomingMessage, token: string): boolean {
    return request.headers.authorization === `Bearer ${token}`;
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
        readonly code: 'INVALID_QUERY' | 'PAYLOAD_TOO_LARGE',
        message: string,
    ) {
        super(message);
    }
}

function validate_heartbeat(value: unknown): Omit<ExtensionHeartbeat, 'seen_at'> {
    if (!is_plain_object(value)) {
        throw new BridgeHttpError(400, 'INVALID_QUERY', 'Heartbeat body must be an object');
    }

    const active_session_id = value.active_session_id;
    if (typeof value.extension_version !== 'string' || !(typeof active_session_id === 'string' || active_session_id === null)) {
        throw new BridgeHttpError(400, 'INVALID_QUERY', 'Heartbeat body is invalid');
    }

    return {
        extension_version: value.extension_version,
        active_session_id,
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

async function read_json(request: http.IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    let size = 0;

    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.byteLength;

        if (size > MAX_JSON_BODY_BYTES) {
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
