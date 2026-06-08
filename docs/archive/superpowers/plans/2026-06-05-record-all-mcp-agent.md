# Record All MCP Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local MCP-controlled bridge that lets AI agents control the browser extension and query complete recording data from the extension without using exported files for analysis.

**Architecture:** Add a local HTTP bridge server and MCP server under a new `agent/` area, then add a browser-extension bridge client that polls the bridge and executes commands against existing extension storage/session/export modules. Data remains in extension IndexedDB; bridge only transports commands/results.

**Tech Stack:** TypeScript, Chrome MV3, IndexedDB, Vite, Vitest, Node HTTP server, Model Context Protocol SDK.

---

## Scope

This plan implements the approved MVP from `docs/superpowers/specs/2026-06-05-record-all-mcp-agent-design.md`.

MVP includes:

- Local bridge server with configurable port and token.
- MCP server with generic tools.
- Extension bridge client polling local bridge.
- Generic source/list/detail/timeline/all-data query APIs.
- Export trigger as a separate tool.
- Skill documentation for agent usage and risks.

MVP excludes:

- Realtime streaming.
- WebSocket/SSE.
- Browser automation.
- Capture-policy mutation.
- Delete/clear tools.
- Analysis from exported files.

## File Structure

Create:

- `agent/shared/protocol.ts` — shared command, result, error, config, source, record, timeline types.
- `agent/bridge/config.ts` — bridge config loading, token/port validation, CLI arg parsing.
- `agent/bridge/command_queue.ts` — in-memory command queue, result waiting, timeout handling.
- `agent/bridge/server.ts` — local HTTP bridge routes.
- `agent/bridge/main.ts` — bridge executable entrypoint.
- `agent/mcp/client.ts` — bridge HTTP client used by MCP tools.
- `agent/mcp/tools.ts` — MCP tool definitions and bridge command mapping.
- `agent/mcp/main.ts` — MCP server entrypoint.
- `background/agent_bridge_client.ts` — extension-side polling client.
- `background/agent_commands.ts` — extension-side command dispatcher.
- `background/agent_records.ts` — source/list/detail/timeline/all-data query logic.
- `tests/agent_protocol.test.ts` — protocol helpers tests.
- `tests/agent_bridge_queue.test.ts` — bridge queue tests.
- `tests/agent_bridge_server.test.ts` — bridge HTTP tests.
- `tests/agent_mcp_client.test.ts` — MCP client forwarding tests.
- `tests/agent_records.test.ts` — extension data query tests.
- `docs/superpowers/skills/record-all-agent.md` — local skill draft for users/agents.

Modify:

- `package.json` — add MCP dependency and scripts.
- `tsconfig.json` — ensure agent Node files compile.
- `vite.config.ts` — include extension bridge files if needed by MV3 build.
- `manifest.json` — allow extension to call user-configured local bridge URL if Chrome requires host permission entries.
- `shared/types.ts` — add bridge config fields to `UserConfig`.
- `shared/user_config.ts` — persist bridge URL/token/poll interval.
- `background/service_worker.ts` — start bridge polling and expose current session helpers.
- `background/storage.ts` — add generic data-source query helpers if existing getters are insufficient.
- `background/exporter.ts` — reuse existing export functions from command dispatcher.

Do not create commits unless the user explicitly asks. If the executor is asked to commit, use conventional commit messages and do not bypass hooks.

---

### Task 1: Shared Protocol Types

**Files:**
- Create: `agent/shared/protocol.ts`
- Test: `tests/agent_protocol.test.ts`

- [ ] **Step 1: Write the failing protocol tests**

Create `tests/agent_protocol.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
    AGENT_COMMAND_TYPES,
    build_record_id,
    parse_record_id,
    type AgentCommandType,
} from '../agent/shared/protocol';

describe('agent protocol', () => {
    it('lists every MVP command type', () => {
        const expected: AgentCommandType[] = [
            'recording.start',
            'recording.stop',
            'sessions.list',
            'sessions.get',
            'sources.list',
            'records.list',
            'records.get',
            'timeline.list',
            'timeline.get',
            'session.get_all_data',
            'session.export',
        ];

        expect(AGENT_COMMAND_TYPES).toEqual(expected);
    });

    it('builds and parses stable record ids', () => {
        const record_id = build_record_id('network_requests', 'abc123');

        expect(record_id).toBe('network_requests:abc123');
        expect(parse_record_id(record_id)).toEqual({
            source: 'network_requests',
            native_id: 'abc123',
        });
    });

    it('preserves colons inside native ids', () => {
        expect(parse_record_id('record_events:session:10')).toEqual({
            source: 'record_events',
            native_id: 'session:10',
        });
    });

    it('rejects invalid record ids', () => {
        expect(() => parse_record_id('missing_separator')).toThrow('Invalid record_id');
        expect(() => parse_record_id(':missing_source')).toThrow('Invalid record_id');
        expect(() => parse_record_id('missing_native:')).toThrow('Invalid record_id');
    });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test -- tests/agent_protocol.test.ts
```

Expected: FAIL because `agent/shared/protocol.ts` does not exist.

- [ ] **Step 3: Implement protocol types and helpers**

Create `agent/shared/protocol.ts`:

```ts
export const AGENT_COMMAND_TYPES = [
    'recording.start',
    'recording.stop',
    'sessions.list',
    'sessions.get',
    'sources.list',
    'records.list',
    'records.get',
    'timeline.list',
    'timeline.get',
    'session.get_all_data',
    'session.export',
] as const;

export type AgentCommandType = (typeof AGENT_COMMAND_TYPES)[number];

export type AgentErrorCode =
    | 'BRIDGE_UNAVAILABLE'
    | 'EXTENSION_OFFLINE'
    | 'COMMAND_TIMEOUT'
    | 'TOKEN_INVALID'
    | 'COMMAND_CANCELLED'
    | 'SESSION_NOT_FOUND'
    | 'SOURCE_NOT_FOUND'
    | 'RECORD_NOT_FOUND'
    | 'INVALID_QUERY'
    | 'RECORDING_ALREADY_RUNNING'
    | 'NO_ACTIVE_RECORDING'
    | 'EXPORT_FAILED'
    | 'STORAGE_READ_FAILED'
    | 'PAYLOAD_TOO_LARGE';

export interface AgentError {
    code: AgentErrorCode;
    message: string;
    details?: unknown;
}

export interface AgentCommand<TPayload = unknown> {
    command_id: string;
    type: AgentCommandType;
    payload: TPayload;
    created_at: number;
}

export interface AgentCommandResult<TData = unknown> {
    command_id: string;
    ok: boolean;
    data?: TData;
    error?: AgentError;
}

export interface AgentBridgeConfig {
    host: '127.0.0.1';
    port: number;
    token: string;
    command_timeout_ms: number;
    full_data_timeout_ms: number;
}

export interface ExtensionBridgeConfig {
    bridge_url: string;
    bridge_token: string;
    poll_interval_ms: number;
}

export interface AgentQueryRange {
    offset?: number;
    limit?: number;
    start_time?: number;
    end_time?: number;
    order?: 'asc' | 'desc';
}

export interface AgentDataSourceSummary {
    source: string;
    count: number;
    time_range: {
        start: number | null;
        end: number | null;
    };
    types: string[];
    description?: string;
}

export interface AgentRecordPreview {
    record_id: string;
    source: string;
    index: number;
    time: number;
    absolute_time: number | null;
    type: string;
    summary: string;
    preview: Record<string, unknown>;
}

export interface AgentRecordDetail<TData = unknown> {
    record_id: string;
    source: string;
    data: TData;
}

export interface AgentStatus {
    bridge_version: string;
    bridge_url: string;
    extension_online: boolean;
    extension_version: string | null;
    active_session_id: string | null;
    pending_commands: number;
}

export function build_record_id(source: string, native_id: string): string {
    return `${source}:${native_id}`;
}

export function parse_record_id(record_id: string): { source: string; native_id: string } {
    const separator_index = record_id.indexOf(':');
    const source = record_id.slice(0, separator_index);
    const native_id = record_id.slice(separator_index + 1);

    if (separator_index <= 0 || native_id.length === 0) {
        throw new Error(`Invalid record_id: ${record_id}`);
    }

    return { source, native_id };
}
```

- [ ] **Step 4: Run the protocol test**

Run:

```bash
npm test -- tests/agent_protocol.test.ts
```

Expected: PASS.

---

### Task 2: Bridge Command Queue

**Files:**
- Create: `agent/bridge/command_queue.ts`
- Test: `tests/agent_bridge_queue.test.ts`

- [ ] **Step 1: Write failing queue tests**

Create `tests/agent_bridge_queue.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { AgentCommandQueue } from '../agent/bridge/command_queue';

describe('AgentCommandQueue', () => {
    it('queues commands and lets extension take them FIFO', () => {
        const queue = new AgentCommandQueue();

        const first = queue.enqueue('sessions.list', { limit: 1 });
        const second = queue.enqueue('sessions.get', { session_id: 's1' });

        expect(queue.pending_count()).toBe(2);
        expect(queue.take_next()).toEqual(first.command);
        expect(queue.take_next()).toEqual(second.command);
        expect(queue.take_next()).toBeNull();
    });

    it('resolves command result', async () => {
        const queue = new AgentCommandQueue();
        const pending = queue.enqueue('sessions.list', {});

        queue.resolve({ command_id: pending.command.command_id, ok: true, data: { sessions: [] } });

        await expect(pending.result).resolves.toEqual({
            command_id: pending.command.command_id,
            ok: true,
            data: { sessions: [] },
        });
    });

    it('rejects unknown command result', () => {
        const queue = new AgentCommandQueue();

        expect(() => queue.resolve({ command_id: 'missing', ok: true })).toThrow('Unknown command_id');
    });

    it('times out unresolved command', async () => {
        vi.useFakeTimers();
        const queue = new AgentCommandQueue();
        const pending = queue.enqueue('sessions.list', {}, 1000);

        vi.advanceTimersByTime(1000);

        await expect(pending.result).resolves.toEqual({
            command_id: pending.command.command_id,
            ok: false,
            error: {
                code: 'COMMAND_TIMEOUT',
                message: 'Command timed out',
            },
        });
        vi.useRealTimers();
    });
});
```

- [ ] **Step 2: Run failing queue tests**

Run:

```bash
npm test -- tests/agent_bridge_queue.test.ts
```

Expected: FAIL because queue file does not exist.

- [ ] **Step 3: Implement queue**

Create `agent/bridge/command_queue.ts`:

```ts
import type { AgentCommand, AgentCommandResult, AgentCommandType } from '../shared/protocol';

interface PendingCommand {
    command: AgentCommand;
    resolve: (result: AgentCommandResult) => void;
    timeout_id: ReturnType<typeof setTimeout> | null;
}

export class AgentCommandQueue {
    private next_id = 1;
    private commands: AgentCommand[] = [];
    private pending = new Map<string, PendingCommand>();

    enqueue<TPayload>(type: AgentCommandType, payload: TPayload, timeout_ms = 30000): { command: AgentCommand<TPayload>; result: Promise<AgentCommandResult> } {
        const command: AgentCommand<TPayload> = {
            command_id: `cmd_${this.next_id++}`,
            type,
            payload,
            created_at: Date.now(),
        };

        const result = new Promise<AgentCommandResult>((resolve) => {
            const timeout_id = setTimeout(() => {
                this.pending.delete(command.command_id);
                resolve({
                    command_id: command.command_id,
                    ok: false,
                    error: {
                        code: 'COMMAND_TIMEOUT',
                        message: 'Command timed out',
                    },
                });
            }, timeout_ms);

            this.pending.set(command.command_id, { command, resolve, timeout_id });
            this.commands.push(command);
        });

        return { command, result };
    }

    take_next(): AgentCommand | null {
        return this.commands.shift() || null;
    }

    resolve(result: AgentCommandResult): void {
        const pending = this.pending.get(result.command_id);

        if (!pending) {
            throw new Error(`Unknown command_id: ${result.command_id}`);
        }

        if (pending.timeout_id) {
            clearTimeout(pending.timeout_id);
        }

        this.pending.delete(result.command_id);
        pending.resolve(result);
    }

    pending_count(): number {
        return this.commands.length + this.pending.size;
    }
}
```

- [ ] **Step 4: Run queue tests**

Run:

```bash
npm test -- tests/agent_bridge_queue.test.ts
```

Expected: PASS.

---

### Task 3: Bridge Config

**Files:**
- Create: `agent/bridge/config.ts`
- Test: `tests/agent_bridge_config.test.ts`

- [ ] **Step 1: Write failing config tests**

Create `tests/agent_bridge_config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parse_bridge_config } from '../agent/bridge/config';

describe('parse_bridge_config', () => {
    it('parses valid user config', () => {
        expect(parse_bridge_config({
            port: 17831,
            token: 'abc123abc123',
        })).toEqual({
            host: '127.0.0.1',
            port: 17831,
            token: 'abc123abc123',
            command_timeout_ms: 30000,
            full_data_timeout_ms: 120000,
        });
    });

    it('rejects non-local host', () => {
        expect(() => parse_bridge_config({
            host: '0.0.0.0',
            port: 17831,
            token: 'abc123abc123',
        })).toThrow('Bridge host must be 127.0.0.1');
    });

    it('rejects invalid port', () => {
        expect(() => parse_bridge_config({ port: 0, token: 'abc123abc123' })).toThrow('Invalid bridge port');
        expect(() => parse_bridge_config({ port: 70000, token: 'abc123abc123' })).toThrow('Invalid bridge port');
    });

    it('rejects empty token', () => {
        expect(() => parse_bridge_config({ port: 17831, token: '' })).toThrow('Bridge token is required');
    });
});
```

- [ ] **Step 2: Run failing config tests**

Run:

```bash
npm test -- tests/agent_bridge_config.test.ts
```

Expected: FAIL because config file does not exist.

- [ ] **Step 3: Implement bridge config parser**

Create `agent/bridge/config.ts`:

```ts
import type { AgentBridgeConfig } from '../shared/protocol';

interface RawBridgeConfig {
    host?: string;
    port?: number;
    token?: string;
    command_timeout_ms?: number;
    full_data_timeout_ms?: number;
}

export function parse_bridge_config(raw: RawBridgeConfig): AgentBridgeConfig {
    const host = raw.host || '127.0.0.1';

    if (host !== '127.0.0.1') {
        throw new Error('Bridge host must be 127.0.0.1');
    }

    if (!Number.isInteger(raw.port) || raw.port < 1 || raw.port > 65535) {
        throw new Error('Invalid bridge port');
    }

    if (!raw.token) {
        throw new Error('Bridge token is required');
    }

    return {
        host,
        port: raw.port,
        token: raw.token,
        command_timeout_ms: raw.command_timeout_ms || 30000,
        full_data_timeout_ms: raw.full_data_timeout_ms || 120000,
    };
}

export function parse_bridge_cli_args(argv: string[]): RawBridgeConfig {
    const raw: RawBridgeConfig = {};

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        const value = argv[index + 1];

        if (arg === '--port') {
            raw.port = Number(value);
            index += 1;
        }

        if (arg === '--token') {
            raw.token = value;
            index += 1;
        }
    }

    return raw;
}
```

- [ ] **Step 4: Run config tests**

Run:

```bash
npm test -- tests/agent_bridge_config.test.ts
```

Expected: PASS.

---

### Task 4: Bridge HTTP Server

**Files:**
- Create: `agent/bridge/server.ts`
- Create: `agent/bridge/main.ts`
- Test: `tests/agent_bridge_server.test.ts`

- [ ] **Step 1: Write failing server tests**

Create `tests/agent_bridge_server.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { create_bridge_server } from '../agent/bridge/server';

const token = 'test-token-123';
let cleanup: (() => Promise<void>) | null = null;

async function start_test_server() {
    const server = await create_bridge_server({
        host: '127.0.0.1',
        port: 0,
        token,
        command_timeout_ms: 30000,
        full_data_timeout_ms: 120000,
    });
    cleanup = server.close;
    return server;
}

afterEach(async () => {
    if (cleanup) {
        await cleanup();
        cleanup = null;
    }
});

describe('bridge server', () => {
    it('returns health without token', async () => {
        const server = await start_test_server();
        const response = await fetch(`${server.url}/health`);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ ok: true });
    });

    it('rejects command without token', async () => {
        const server = await start_test_server();
        const response = await fetch(`${server.url}/mcp/command`, {
            method: 'POST',
            body: JSON.stringify({ type: 'sessions.list', payload: {} }),
        });

        expect(response.status).toBe(401);
    });

    it('returns extension offline when no heartbeat exists', async () => {
        const server = await start_test_server();
        const response = await fetch(`${server.url}/mcp/command`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'sessions.list', payload: {} }),
        });

        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({
            ok: false,
            error: {
                code: 'EXTENSION_OFFLINE',
                message: 'Extension is offline',
            },
        });
    });

    it('passes command to extension and returns result', async () => {
        const server = await start_test_server();

        await fetch(`${server.url}/extension/heartbeat`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ extension_version: '1.0.0', active_session_id: null }),
        });

        const command_response = fetch(`${server.url}/mcp/command`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'sessions.list', payload: {} }),
        });

        const next_response = await fetch(`${server.url}/extension/command`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const command = await next_response.json();

        await fetch(`${server.url}/extension/result`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ command_id: command.command_id, ok: true, data: { sessions: [] } }),
        });

        expect(await (await command_response).json()).toEqual({
            command_id: command.command_id,
            ok: true,
            data: { sessions: [] },
        });
    });
});
```

- [ ] **Step 2: Run failing server tests**

Run:

```bash
npm test -- tests/agent_bridge_server.test.ts
```

Expected: FAIL because server file does not exist.

- [ ] **Step 3: Implement HTTP bridge server**

Create `agent/bridge/server.ts` with these exported pieces:

```ts
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { AgentCommandQueue } from './command_queue';
import type { AgentBridgeConfig, AgentCommandResult, AgentStatus } from '../shared/protocol';

interface ExtensionHeartbeat {
    extension_version: string;
    active_session_id: string | null;
    seen_at: number;
}

const EXTENSION_TTL_MS = 5000;
const BRIDGE_VERSION = '0.1.0';

export async function create_bridge_server(config: AgentBridgeConfig): Promise<{ url: string; close: () => Promise<void> }> {
    const queue = new AgentCommandQueue();
    let heartbeat: ExtensionHeartbeat | null = null;

    const server = http.createServer(async (request, response) => {
        try {
            if (request.method === 'GET' && request.url === '/health') {
                return send_json(response, 200, { ok: true });
            }

            if (!is_authorized(request, config.token)) {
                return send_json(response, 401, { ok: false, error: { code: 'TOKEN_INVALID', message: 'Invalid token' } });
            }

            if (request.method === 'POST' && request.url === '/extension/heartbeat') {
                const body = await read_json<{ extension_version: string; active_session_id: string | null }>(request);
                heartbeat = { ...body, seen_at: Date.now() };
                return send_json(response, 200, { ok: true });
            }

            if (request.method === 'GET' && request.url === '/extension/command') {
                return send_json(response, 200, queue.take_next());
            }

            if (request.method === 'POST' && request.url === '/extension/result') {
                const body = await read_json<AgentCommandResult>(request);
                queue.resolve(body);
                return send_json(response, 200, { ok: true });
            }

            if (request.method === 'GET' && request.url === '/mcp/status') {
                const status: AgentStatus = {
                    bridge_version: BRIDGE_VERSION,
                    bridge_url: `http://${config.host}:${actual_port(server)}`,
                    extension_online: is_extension_online(heartbeat),
                    extension_version: is_extension_online(heartbeat) ? heartbeat!.extension_version : null,
                    active_session_id: is_extension_online(heartbeat) ? heartbeat!.active_session_id : null,
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

                const body = await read_json<{ type: any; payload: unknown; timeout_ms?: number }>(request);
                const pending = queue.enqueue(body.type, body.payload, body.timeout_ms || config.command_timeout_ms);
                const result = await pending.result;
                return send_json(response, 200, result);
            }

            return send_json(response, 404, { ok: false, error: { code: 'BRIDGE_UNAVAILABLE', message: 'Route not found' } });
        } catch (error) {
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

async function read_json<T>(request: http.IncomingMessage): Promise<T> {
    const chunks: Buffer[] = [];

    for await (const chunk of request) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
}

function send_json(response: http.ServerResponse, status: number, body: unknown): void {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body));
}
```

Create `agent/bridge/main.ts`:

```ts
import { parse_bridge_cli_args, parse_bridge_config } from './config';
import { create_bridge_server } from './server';

async function main(): Promise<void> {
    const raw_config = parse_bridge_cli_args(process.argv.slice(2));
    const config = parse_bridge_config(raw_config);
    const server = await create_bridge_server(config);

    process.stdout.write(`record-all bridge listening at ${server.url}\n`);
}

main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
});
```

- [ ] **Step 4: Run server tests**

Run:

```bash
npm test -- tests/agent_bridge_server.test.ts
```

Expected: PASS.

---

### Task 5: MCP Bridge Client and Tool Map

**Files:**
- Create: `agent/mcp/client.ts`
- Create: `agent/mcp/tools.ts`
- Create: `agent/mcp/main.ts`
- Test: `tests/agent_mcp_client.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Install MCP SDK**

Run:

```bash
npm install @modelcontextprotocol/sdk
```

Expected: `package.json` and `package-lock.json` update.

- [ ] **Step 2: Write failing MCP client tests**

Create `tests/agent_mcp_client.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { create_bridge_server } from '../agent/bridge/server';
import { BridgeMcpClient } from '../agent/mcp/client';

const token = 'test-token-123';
let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
    if (cleanup) {
        await cleanup();
        cleanup = null;
    }
});

describe('BridgeMcpClient', () => {
    it('reads bridge status', async () => {
        const server = await create_bridge_server({
            host: '127.0.0.1',
            port: 0,
            token,
            command_timeout_ms: 30000,
            full_data_timeout_ms: 120000,
        });
        cleanup = server.close;

        const client = new BridgeMcpClient(server.url, token);

        await expect(client.get_status()).resolves.toMatchObject({
            bridge_url: server.url,
            extension_online: false,
        });
    });
});
```

- [ ] **Step 3: Implement MCP bridge client**

Create `agent/mcp/client.ts`:

```ts
import type { AgentCommandResult, AgentCommandType, AgentStatus } from '../shared/protocol';

export class BridgeMcpClient {
    constructor(private bridge_url: string, private token: string) {}

    async get_status(): Promise<AgentStatus> {
        const response = await fetch(`${this.bridge_url}/mcp/status`, {
            headers: this.headers(),
        });

        return await response.json() as AgentStatus;
    }

    async send_command(type: AgentCommandType, payload: unknown, timeout_ms?: number): Promise<AgentCommandResult> {
        const response = await fetch(`${this.bridge_url}/mcp/command`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify({ type, payload, timeout_ms }),
        });

        return await response.json() as AgentCommandResult;
    }

    private headers(): Record<string, string> {
        return {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
        };
    }
}
```

- [ ] **Step 4: Implement MCP tools map**

Create `agent/mcp/tools.ts`:

```ts
import type { BridgeMcpClient } from './client';
import type { AgentCommandType } from '../shared/protocol';

export interface McpToolCall {
    name: string;
    arguments?: Record<string, unknown>;
}

const TOOL_COMMANDS: Record<string, AgentCommandType> = {
    start_recording: 'recording.start',
    stop_recording: 'recording.stop',
    list_sessions: 'sessions.list',
    get_session: 'sessions.get',
    list_data_sources: 'sources.list',
    list_records: 'records.list',
    get_record: 'records.get',
    get_timeline: 'timeline.list',
    get_timeline_item: 'timeline.get',
    get_all_session_data: 'session.get_all_data',
    export_session: 'session.export',
};

export const MCP_TOOL_NAMES = ['get_status', ...Object.keys(TOOL_COMMANDS)] as const;

export async function execute_mcp_tool(client: BridgeMcpClient, call: McpToolCall): Promise<unknown> {
    if (call.name === 'get_status') {
        return await client.get_status();
    }

    const command = TOOL_COMMANDS[call.name];

    if (!command) {
        throw new Error(`Unknown MCP tool: ${call.name}`);
    }

    return await client.send_command(command, call.arguments || {});
}
```

- [ ] **Step 5: Implement MCP entrypoint**

Create `agent/mcp/main.ts`:

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { BridgeMcpClient } from './client';
import { execute_mcp_tool } from './tools';

const bridge_url = process.env.RECORD_ALL_BRIDGE_URL;
const bridge_token = process.env.RECORD_ALL_BRIDGE_TOKEN;

if (!bridge_url || !bridge_token) {
    throw new Error('RECORD_ALL_BRIDGE_URL and RECORD_ALL_BRIDGE_TOKEN are required');
}

const client = new BridgeMcpClient(bridge_url, bridge_token);
const server = new McpServer({ name: 'record-all', version: '0.1.0' });

function register_tool(name: string): void {
    server.tool(name, { input: z.record(z.unknown()).optional() }, async ({ input }) => {
        const result = await execute_mcp_tool(client, { name, arguments: input || {} });
        return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
    });
}

[
    'get_status',
    'start_recording',
    'stop_recording',
    'list_sessions',
    'get_session',
    'list_data_sources',
    'list_records',
    'get_record',
    'get_timeline',
    'get_timeline_item',
    'get_all_session_data',
    'export_session',
].forEach(register_tool);

await server.connect(new StdioServerTransport());
```

- [ ] **Step 6: Add scripts**

Modify `package.json` scripts by adding:

```json
{
    "bridge": "tsx agent/bridge/main.ts",
    "mcp": "tsx agent/mcp/main.ts"
}
```

If `tsx` is not already present, install it:

```bash
npm install -D tsx
```

- [ ] **Step 7: Run MCP tests**

Run:

```bash
npm test -- tests/agent_mcp_client.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run typecheck/build**

Run:

```bash
npm run build
```

Expected: PASS. If Node imports conflict with browser build, split Node tsconfig in Task 6 before continuing.

---

### Task 6: Extension Bridge Config

**Files:**
- Modify: `shared/types.ts`
- Modify: `shared/user_config.ts`
- Test: `tests/agent_extension_config.test.ts`

- [ ] **Step 1: Write failing extension config tests**

Create `tests/agent_extension_config.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { load_user_config, save_user_config } from '../shared/user_config';

const storage: Record<string, unknown> = {};

beforeEach(() => {
    for (const key of Object.keys(storage)) {
        delete storage[key];
    }

    vi.stubGlobal('chrome', {
        storage: {
            local: {
                get: vi.fn(async (key: string) => ({ [key]: storage[key] })),
                set: vi.fn(async (value: Record<string, unknown>) => Object.assign(storage, value)),
            },
        },
    });
});

describe('bridge user config', () => {
    it('loads disabled bridge defaults', async () => {
        await expect(load_user_config()).resolves.toMatchObject({
            bridge_url: '',
            bridge_token: '',
            bridge_poll_interval_ms: 1000,
        });
    });

    it('saves bridge config immutably', async () => {
        await save_user_config({
            bridge_url: 'http://127.0.0.1:17831',
            bridge_token: 'token-123',
        });

        await expect(load_user_config()).resolves.toMatchObject({
            bridge_url: 'http://127.0.0.1:17831',
            bridge_token: 'token-123',
            bridge_poll_interval_ms: 1000,
        });
    });
});
```

- [ ] **Step 2: Run failing config tests**

Run:

```bash
npm test -- tests/agent_extension_config.test.ts
```

Expected: FAIL because bridge config fields are missing.

- [ ] **Step 3: Add config fields to types**

Modify `shared/types.ts` `UserConfig` to include:

```ts
export interface UserConfig {
    theme: ThemeMode;
    keyboard_capture_mode: 'none' | 'shortcuts' | 'all';
    capture_input_values: boolean;
    capture_request_body: boolean;
    capture_response_body: boolean;
    bridge_url: string;
    bridge_token: string;
    bridge_poll_interval_ms: number;
}
```

Keep existing fields; only add missing bridge fields.

- [ ] **Step 4: Add defaults**

Modify `shared/user_config.ts` default config to include:

```ts
const DEFAULT_USER_CONFIG: UserConfig = {
    theme: 'follow-system',
    keyboard_capture_mode: 'shortcuts',
    capture_input_values: false,
    capture_request_body: false,
    capture_response_body: false,
    bridge_url: '',
    bridge_token: '',
    bridge_poll_interval_ms: 1000,
};
```

If current default differs for existing capture fields, preserve current existing values and add only the three bridge fields.

- [ ] **Step 5: Run extension config tests**

Run:

```bash
npm test -- tests/agent_extension_config.test.ts
```

Expected: PASS.

---

### Task 7: Extension Agent Record Queries

**Files:**
- Create: `background/agent_records.ts`
- Modify: `background/storage.ts` only if needed to expose existing getters.
- Test: `tests/agent_records.test.ts`

- [ ] **Step 1: Write failing record query tests**

Create `tests/agent_records.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
    build_record_preview,
    filter_and_order_records,
    get_record_native_id,
    merge_timeline_records,
} from '../background/agent_records';

describe('agent record helpers', () => {
    it('builds previews for network records', () => {
        const preview = build_record_preview('network_requests', {
            request_id: 'r1',
            session_id: 's1',
            relative_time: 25,
            timestamp: 1000,
            method: 'POST',
            url: 'https://example.com/api/login',
            status: 401,
            duration: 238,
        });

        expect(preview).toEqual({
            record_id: 'network_requests:r1',
            source: 'network_requests',
            index: 0,
            time: 25,
            absolute_time: 1000,
            type: 'POST',
            summary: 'POST https://example.com/api/login → 401',
            preview: {
                url: 'https://example.com/api/login',
                status: 401,
                duration: 238,
            },
        });
    });

    it('derives native ids when records do not have explicit ids', () => {
        expect(get_record_native_id('record_events', { session_id: 's1', relative_time: 42, type: 'mouse' })).toBe('s1:42:mouse');
    });

    it('filters and orders by relative time', () => {
        const records = [
            { session_id: 's1', relative_time: 30, type: 'b' },
            { session_id: 's1', relative_time: 10, type: 'a' },
            { session_id: 's1', relative_time: 20, type: 'c' },
        ];

        expect(filter_and_order_records(records, { start_time: 15, end_time: 30, order: 'asc' }).map((r) => r.relative_time)).toEqual([20, 30]);
        expect(filter_and_order_records(records, { order: 'desc' }).map((r) => r.relative_time)).toEqual([30, 20, 10]);
    });

    it('merges timeline records and applies display index', () => {
        const items = merge_timeline_records([
            build_record_preview('console_logs', { id: 'c1', relative_time: 20, timestamp: 2000, level: 'error', message: 'boom' }),
            build_record_preview('record_events', { session_id: 's1', relative_time: 10, timestamp: 1000, type: 'mouse' }),
        ], { offset: 0, limit: 2, order: 'asc' });

        expect(items.map((item) => item.index)).toEqual([1, 2]);
        expect(items.map((item) => item.source)).toEqual(['record_events', 'console_logs']);
    });
});
```

- [ ] **Step 2: Run failing record tests**

Run:

```bash
npm test -- tests/agent_records.test.ts
```

Expected: FAIL because `background/agent_records.ts` does not exist.

- [ ] **Step 3: Implement record helpers**

Create `background/agent_records.ts` with pure helpers first:

```ts
import { build_record_id } from '../agent/shared/protocol';
import type { AgentQueryRange, AgentRecordPreview } from '../agent/shared/protocol';

type AnyRecord = Record<string, any>;

export function get_record_native_id(source: string, record: AnyRecord): string {
    if (record.id) return String(record.id);
    if (record.request_id) return String(record.request_id);
    if (record.log_id) return String(record.log_id);
    if (record.error_id) return String(record.error_id);

    return `${record.session_id || 'unknown'}:${record.relative_time ?? record.timestamp ?? 'unknown'}:${record.type || source}`;
}

export function get_record_time(record: AnyRecord): number {
    return Number(record.relative_time ?? 0);
}

export function get_record_absolute_time(record: AnyRecord): number | null {
    return typeof record.timestamp === 'number' ? record.timestamp : null;
}

export function build_record_preview(source: string, record: AnyRecord): AgentRecordPreview {
    const native_id = get_record_native_id(source, record);
    const type = String(record.method || record.level || record.type || source);

    return {
        record_id: build_record_id(source, native_id),
        source,
        index: 0,
        time: get_record_time(record),
        absolute_time: get_record_absolute_time(record),
        type,
        summary: build_summary(source, record),
        preview: build_preview(source, record),
    };
}

export function filter_and_order_records<T extends AnyRecord>(records: T[], query: AgentQueryRange): T[] {
    const start_time = query.start_time ?? Number.NEGATIVE_INFINITY;
    const end_time = query.end_time ?? Number.POSITIVE_INFINITY;
    const order = query.order || 'asc';

    return records
        .filter((record) => {
            const time = get_record_time(record);
            return time >= start_time && time <= end_time;
        })
        .sort((a, b) => order === 'asc' ? get_record_time(a) - get_record_time(b) : get_record_time(b) - get_record_time(a));
}

export function apply_offset_limit<T>(items: T[], query: AgentQueryRange): T[] {
    const offset = query.offset || 0;
    const limit = query.limit ?? items.length;

    return items.slice(offset, offset + limit);
}

export function merge_timeline_records(items: AgentRecordPreview[], query: AgentQueryRange): AgentRecordPreview[] {
    const ordered = filter_and_order_records(items, query);
    return apply_offset_limit(ordered, query).map((item, index) => ({ ...item, index: (query.offset || 0) + index + 1 }));
}

function build_summary(source: string, record: AnyRecord): string {
    if (source === 'network_requests') {
        return `${record.method || 'REQUEST'} ${record.url || ''} → ${record.status ?? 'unknown'}`;
    }

    if (source === 'console_logs') {
        return `${record.level || 'log'} ${record.message || ''}`.trim();
    }

    if (source === 'error_logs') {
        return `${record.message || record.name || 'error'}`;
    }

    return `${record.type || source}`;
}

function build_preview(source: string, record: AnyRecord): Record<string, unknown> {
    if (source === 'network_requests') {
        return {
            url: record.url,
            status: record.status,
            duration: record.duration,
        };
    }

    if (source === 'console_logs') {
        return {
            level: record.level,
            message: record.message,
        };
    }

    return {
        type: record.type,
    };
}
```

- [ ] **Step 4: Run record helper tests**

Run:

```bash
npm test -- tests/agent_records.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add async extension query functions**

Extend `background/agent_records.ts` with functions that call existing storage getters:

```ts
import {
    get_console_logs,
    get_error_logs,
    get_events,
    get_network_requests,
} from './storage';
import { get_session_by_id } from './session_manager';
import { parse_record_id } from '../agent/shared/protocol';

const SOURCES = ['record_events', 'network_requests', 'console_logs', 'error_logs'] as const;

type SourceName = (typeof SOURCES)[number];

export async function list_data_sources_for_session(session_id: string): Promise<{ sources: unknown[] }> {
    const sources = await Promise.all(SOURCES.map(async (source) => {
        const records = await load_source_records(session_id, source);
        const times = records.map(get_record_time);
        return {
            source,
            count: records.length,
            time_range: {
                start: times.length ? Math.min(...times) : null,
                end: times.length ? Math.max(...times) : null,
            },
            types: [...new Set(records.map((record) => String(record.method || record.level || record.type || source)))],
        };
    }));

    return { sources };
}

export async function list_records_for_session(session_id: string, source: string, query: AgentQueryRange): Promise<{ items: AgentRecordPreview[]; total: number }> {
    const records = await load_source_records(session_id, assert_source(source));
    const filtered = filter_and_order_records(records, query);
    const items = apply_offset_limit(filtered, query)
        .map((record, index) => ({ ...build_record_preview(source, record), index: (query.offset || 0) + index + 1 }));

    return { items, total: filtered.length };
}

export async function get_record_for_session(session_id: string, source: string, record_id: string): Promise<unknown> {
    const records = await load_source_records(session_id, assert_source(source));
    const parsed = parse_record_id(record_id);
    const record = records.find((candidate) => get_record_native_id(source, candidate) === parsed.native_id);

    if (!record) {
        throw new Error('RECORD_NOT_FOUND');
    }

    return { record_id, source, data: record };
}

export async function get_timeline_for_session(session_id: string, sources: string[] | undefined, query: AgentQueryRange): Promise<{ items: AgentRecordPreview[] }> {
    const source_names = sources?.length ? sources.map(assert_source) : [...SOURCES];
    const previews: AgentRecordPreview[] = [];

    for (const source of source_names) {
        const records = await load_source_records(session_id, source);
        previews.push(...records.map((record) => build_record_preview(source, record)));
    }

    return { items: merge_timeline_records(previews, query) };
}

export async function get_all_session_data(session_id: string): Promise<unknown> {
    const session = await get_session_by_id(session_id);
    return {
        session,
        sources: {
            record_events: await get_events(session_id, 0, Number.MAX_SAFE_INTEGER),
            network_requests: await get_network_requests(session_id, 0, Number.MAX_SAFE_INTEGER),
            console_logs: await get_console_logs(session_id, 0, Number.MAX_SAFE_INTEGER),
            error_logs: await get_error_logs(session_id, 0, Number.MAX_SAFE_INTEGER),
        },
    };
}

async function load_source_records(session_id: string, source: SourceName): Promise<AnyRecord[]> {
    if (source === 'record_events') return await get_events(session_id, 0, Number.MAX_SAFE_INTEGER) as AnyRecord[];
    if (source === 'network_requests') return await get_network_requests(session_id, 0, Number.MAX_SAFE_INTEGER) as AnyRecord[];
    if (source === 'console_logs') return await get_console_logs(session_id, 0, Number.MAX_SAFE_INTEGER) as AnyRecord[];
    return await get_error_logs(session_id, 0, Number.MAX_SAFE_INTEGER) as AnyRecord[];
}

function assert_source(source: string): SourceName {
    if ((SOURCES as readonly string[]).includes(source)) {
        return source as SourceName;
    }

    throw new Error('SOURCE_NOT_FOUND');
}
```

If `storage.ts` does not export `get_error_logs` or `get_network_requests`, add narrow getters matching existing `get_events` style.

- [ ] **Step 6: Run all record tests**

Run:

```bash
npm test -- tests/agent_records.test.ts tests/storage.test.ts
```

Expected: PASS.

---

### Task 8: Extension Command Dispatcher

**Files:**
- Create: `background/agent_commands.ts`
- Test: `tests/agent_commands.test.ts`

- [ ] **Step 1: Write failing dispatcher tests**

Create `tests/agent_commands.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { execute_agent_command } from '../background/agent_commands';

describe('execute_agent_command', () => {
    it('returns error for unknown command', async () => {
        const result = await execute_agent_command({
            command_id: 'cmd_1',
            type: 'unknown' as any,
            payload: {},
            created_at: 1,
        });

        expect(result).toEqual({
            command_id: 'cmd_1',
            ok: false,
            error: {
                code: 'INVALID_QUERY',
                message: 'Unknown command: unknown',
            },
        });
    });

    it('wraps thrown errors', async () => {
        const result = await execute_agent_command({
            command_id: 'cmd_1',
            type: 'sessions.get',
            payload: {},
            created_at: 1,
        });

        expect(result.ok).toBe(false);
        expect(result.error?.code).toBe('INVALID_QUERY');
    });
});
```

- [ ] **Step 2: Run failing dispatcher tests**

Run:

```bash
npm test -- tests/agent_commands.test.ts
```

Expected: FAIL because dispatcher does not exist.

- [ ] **Step 3: Implement dispatcher**

Create `background/agent_commands.ts`:

```ts
import type { AgentCommand, AgentCommandResult } from '../agent/shared/protocol';
import { export_har, export_jsonl } from './exporter';
import { get_current_session, get_session_by_id, list_all_sessions, start_session, stop_session } from './session_manager';
import {
    get_all_session_data,
    get_record_for_session,
    get_timeline_for_session,
    list_data_sources_for_session,
    list_records_for_session,
} from './agent_records';

export async function execute_agent_command(command: AgentCommand): Promise<AgentCommandResult> {
    try {
        const payload = command.payload as Record<string, any>;

        if (command.type === 'recording.start') {
            const session = await start_session(payload.config);
            return ok(command.command_id, { session_id: session.id, status: 'recording' });
        }

        if (command.type === 'recording.stop') {
            const session = await stop_session();
            return ok(command.command_id, { session_id: session?.id || null, status: 'stopped' });
        }

        if (command.type === 'sessions.list') {
            return ok(command.command_id, { sessions: await list_all_sessions() });
        }

        if (command.type === 'sessions.get') {
            require_field(payload, 'session_id');
            return ok(command.command_id, { session: await get_session_by_id(payload.session_id) });
        }

        if (command.type === 'sources.list') {
            require_field(payload, 'session_id');
            return ok(command.command_id, await list_data_sources_for_session(payload.session_id));
        }

        if (command.type === 'records.list') {
            require_field(payload, 'session_id');
            require_field(payload, 'source');
            return ok(command.command_id, await list_records_for_session(payload.session_id, payload.source, payload));
        }

        if (command.type === 'records.get') {
            require_field(payload, 'session_id');
            require_field(payload, 'source');
            require_field(payload, 'record_id');
            return ok(command.command_id, await get_record_for_session(payload.session_id, payload.source, payload.record_id));
        }

        if (command.type === 'timeline.list') {
            require_field(payload, 'session_id');
            return ok(command.command_id, await get_timeline_for_session(payload.session_id, payload.sources, payload));
        }

        if (command.type === 'timeline.get') {
            require_field(payload, 'session_id');
            require_field(payload, 'source');
            require_field(payload, 'record_id');
            return ok(command.command_id, await get_record_for_session(payload.session_id, payload.source, payload.record_id));
        }

        if (command.type === 'session.get_all_data') {
            require_field(payload, 'session_id');
            return ok(command.command_id, await get_all_session_data(payload.session_id));
        }

        if (command.type === 'session.export') {
            require_field(payload, 'session_id');
            const format = payload.format || 'jsonl';
            const content = format === 'har' ? await export_har(payload.session_id) : await export_jsonl(payload.session_id);
            return ok(command.command_id, { format, content });
        }

        if (command.type === 'recording.stop') {
            const active = await get_current_session();
            return ok(command.command_id, { session_id: active?.id || null });
        }

        return error(command.command_id, 'INVALID_QUERY', `Unknown command: ${command.type}`);
    } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        return error(command.command_id, message as any, message === 'SOURCE_NOT_FOUND' || message === 'RECORD_NOT_FOUND' ? message : 'Invalid query');
    }
}

function ok(command_id: string, data: unknown): AgentCommandResult {
    return { command_id, ok: true, data };
}

function error(command_id: string, code: any, message: string): AgentCommandResult {
    return { command_id, ok: false, error: { code, message } };
}

function require_field(payload: Record<string, any>, field: string): void {
    if (!payload[field]) {
        throw new Error(`Missing required field: ${field}`);
    }
}
```

- [ ] **Step 4: Remove duplicate stop branch if present**

Inspect `background/agent_commands.ts`. If there are two `recording.stop` branches, delete the later unreachable branch:

```ts
        if (command.type === 'recording.stop') {
            const active = await get_current_session();
            return ok(command.command_id, { session_id: active?.id || null });
        }
```

Also remove `get_current_session` import if unused.

- [ ] **Step 5: Run dispatcher tests**

Run:

```bash
npm test -- tests/agent_commands.test.ts
```

Expected: PASS.

---

### Task 9: Extension Bridge Client

**Files:**
- Create: `background/agent_bridge_client.ts`
- Modify: `background/service_worker.ts`
- Test: `tests/agent_bridge_client.test.ts`

- [ ] **Step 1: Write failing bridge client tests**

Create `tests/agent_bridge_client.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { poll_agent_bridge_once } from '../background/agent_bridge_client';

describe('poll_agent_bridge_once', () => {
    it('does nothing when bridge url or token is missing', async () => {
        const fetch_mock = vi.fn();
        vi.stubGlobal('fetch', fetch_mock);

        await poll_agent_bridge_once({ bridge_url: '', bridge_token: '', bridge_poll_interval_ms: 1000 });

        expect(fetch_mock).not.toHaveBeenCalled();
    });

    it('fetches command and posts result', async () => {
        const fetch_mock = vi.fn()
            .mockResolvedValueOnce({ ok: true, json: async () => ({ command_id: 'cmd_1', type: 'sessions.list', payload: {}, created_at: 1 }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
        vi.stubGlobal('fetch', fetch_mock);

        await poll_agent_bridge_once({
            bridge_url: 'http://127.0.0.1:17831',
            bridge_token: 'token',
            bridge_poll_interval_ms: 1000,
        });

        expect(fetch_mock).toHaveBeenCalledTimes(2);
        expect(fetch_mock.mock.calls[0][0]).toBe('http://127.0.0.1:17831/extension/command');
        expect(fetch_mock.mock.calls[1][0]).toBe('http://127.0.0.1:17831/extension/result');
    });
});
```

- [ ] **Step 2: Run failing client tests**

Run:

```bash
npm test -- tests/agent_bridge_client.test.ts
```

Expected: FAIL because client file does not exist.

- [ ] **Step 3: Implement bridge client**

Create `background/agent_bridge_client.ts`:

```ts
import type { UserConfig } from '../shared/types';
import type { AgentCommand } from '../agent/shared/protocol';
import { execute_agent_command } from './agent_commands';

export async function poll_agent_bridge_once(config: Pick<UserConfig, 'bridge_url' | 'bridge_token' | 'bridge_poll_interval_ms'>): Promise<void> {
    if (!config.bridge_url || !config.bridge_token) {
        return;
    }

    const command_response = await fetch(`${config.bridge_url}/extension/command`, {
        headers: auth_headers(config.bridge_token),
    });

    if (!command_response.ok) {
        return;
    }

    const command = await command_response.json() as AgentCommand | null;

    if (!command) {
        return;
    }

    const result = await execute_agent_command(command);

    await fetch(`${config.bridge_url}/extension/result`, {
        method: 'POST',
        headers: auth_headers(config.bridge_token),
        body: JSON.stringify(result),
    });
}

export async function send_agent_heartbeat(config: Pick<UserConfig, 'bridge_url' | 'bridge_token'>, active_session_id: string | null): Promise<void> {
    if (!config.bridge_url || !config.bridge_token) {
        return;
    }

    await fetch(`${config.bridge_url}/extension/heartbeat`, {
        method: 'POST',
        headers: auth_headers(config.bridge_token),
        body: JSON.stringify({
            extension_version: chrome.runtime.getManifest().version,
            active_session_id,
        }),
    });
}

function auth_headers(token: string): Record<string, string> {
    return {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
    };
}
```

- [ ] **Step 4: Wire polling into service worker**

Modify `background/service_worker.ts`:

Add imports:

```ts
import { poll_agent_bridge_once, send_agent_heartbeat } from './agent_bridge_client';
import { load_user_config } from '../shared/user_config';
```

Add a startup function near existing initialization:

```ts
function start_agent_bridge_loop(): void {
    setInterval(async () => {
        const user_config = await load_user_config();
        await poll_agent_bridge_once(user_config);
        await send_agent_heartbeat(user_config, current_session?.id || null);
    }, 1000);
}
```

Call it once from the existing startup/onInstalled initialization path:

```ts
start_agent_bridge_loop();
```

If `current_session` is not in scope, use existing `get_current_session()` and pass `session?.id || null`.

- [ ] **Step 5: Run bridge client tests**

Run:

```bash
npm test -- tests/agent_bridge_client.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

---

### Task 10: Extension UI Config Hookup

**Files:**
- Modify: `popup/popup.html`
- Modify: `popup/popup.ts`
- Modify: `popup/popup.css`
- Test: existing build and manual browser check

- [ ] **Step 1: Add bridge config controls**

Modify `popup/popup.html` by adding a local bridge section near existing settings controls:

```html
<section class="bridge-settings">
    <h2>Local Agent Bridge</h2>
    <label>
        Bridge URL
        <input id="bridge-url" type="text" placeholder="http://127.0.0.1:17831" autocomplete="off" />
    </label>
    <label>
        Bridge token
        <input id="bridge-token" type="password" autocomplete="off" />
    </label>
    <label>
        Poll interval ms
        <input id="bridge-poll-interval" type="number" min="250" step="250" />
    </label>
    <button id="save-bridge-settings" type="button">Save bridge settings</button>
</section>
```

- [ ] **Step 2: Wire popup config load/save**

Modify `popup/popup.ts`:

```ts
import { load_user_config, save_user_config } from '../shared/user_config';

async function load_bridge_settings(): Promise<void> {
    const config = await load_user_config();
    const bridge_url = document.getElementById('bridge-url') as HTMLInputElement;
    const bridge_token = document.getElementById('bridge-token') as HTMLInputElement;
    const bridge_poll_interval = document.getElementById('bridge-poll-interval') as HTMLInputElement;

    bridge_url.value = config.bridge_url;
    bridge_token.value = config.bridge_token;
    bridge_poll_interval.value = String(config.bridge_poll_interval_ms);
}

function wire_bridge_settings(): void {
    const save_button = document.getElementById('save-bridge-settings') as HTMLButtonElement;

    save_button.addEventListener('click', async () => {
        const bridge_url = (document.getElementById('bridge-url') as HTMLInputElement).value.trim();
        const bridge_token = (document.getElementById('bridge-token') as HTMLInputElement).value;
        const bridge_poll_interval_ms = Number((document.getElementById('bridge-poll-interval') as HTMLInputElement).value || '1000');

        await save_user_config({ bridge_url, bridge_token, bridge_poll_interval_ms });
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    await load_bridge_settings();
    wire_bridge_settings();
});
```

If `popup/popup.ts` already has `DOMContentLoaded`, merge these calls into the existing handler instead of adding a duplicate handler.

- [ ] **Step 3: Add minimal styling**

Modify `popup/popup.css`:

```css
.bridge-settings {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid var(--border-color, #ddd);
}

.bridge-settings label {
    display: block;
    margin-bottom: 8px;
}

.bridge-settings input {
    width: 100%;
    box-sizing: border-box;
}
```

- [ ] **Step 4: Build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 5: Manual browser check**

Run extension build, load unpacked extension in host Chrome, open popup.

Expected:

- Bridge URL field appears.
- Bridge token field appears.
- Poll interval field appears.
- Values persist after Save and popup reopen.

---

### Task 11: Skill Documentation

**Files:**
- Create: `docs/superpowers/skills/record-all-agent.md`

- [ ] **Step 1: Write skill doc**

Create `docs/superpowers/skills/record-all-agent.md`:

```markdown
# record-all-agent

Use this when an AI Agent needs to inspect or control the Record All browser extension through the local MCP server.

## Recommended flow

1. Call `get_status()`.
2. If the extension is offline, ask the user to start the bridge and configure the extension URL/token.
3. Call `list_sessions()`.
4. Pick a `session_id`.
5. Call `list_data_sources(session_id)` to see available data.
6. Call `get_timeline(session_id, { limit: 20 })` to inspect the overall sequence.
7. Call `list_records(session_id, source, { offset, limit })` to inspect a specific source.
8. Call `get_record(session_id, source, record_id)` for full raw details.
9. Call `get_all_session_data(session_id)` only when full context is needed.
10. Call `export_session(session_id, format)` only when the user wants a browser-generated file.

## API risks

- `start_recording` changes extension recording state.
- `stop_recording` changes extension recording state.
- `get_all_session_data` may return a very large payload and can fail from timeout or context limits.
- Records may include headers, cookies, request bodies, response bodies, console output, storage changes, DOM details, or other sensitive data.
- `export_session` generates a file through the browser extension.
- List APIs return previews only. Detail APIs return full raw records.

## Decision rule

The tool layer exposes capability. The model decides which API to call and whether to filter, inspect, summarize, or request more data. Do not assume list previews are complete when details are needed.
```

- [ ] **Step 2: Verify doc exists**

Run:

```bash
test -f docs/superpowers/skills/record-all-agent.md
```

Expected: command exits 0.

---

### Task 12: Full Verification

**Files:**
- All modified files from prior tasks.

- [ ] **Step 1: Run unit tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 2: Run production build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 3: Start bridge manually**

Run with a user-chosen token and port:

```bash
npm run bridge -- --port 17831 --token replace-with-user-token
```

Expected output:

```text
record-all bridge listening at http://127.0.0.1:17831
```

Use a real random token provided by the user for actual use. Do not commit or hardcode it.

- [ ] **Step 4: Configure extension**

In the extension popup, set:

```text
Bridge URL: http://127.0.0.1:17831
Bridge token: same token used for bridge
Poll interval ms: 1000
```

Expected: popup saves settings.

- [ ] **Step 5: Verify bridge status through MCP client path**

Run MCP with env vars:

```bash
RECORD_ALL_BRIDGE_URL=http://127.0.0.1:17831 RECORD_ALL_BRIDGE_TOKEN=replace-with-user-token npm run mcp
```

Expected: MCP starts on stdio. In Claude Code/Codex MCP config, `get_status()` returns extension online after heartbeat.

- [ ] **Step 6: Verify command flow**

Through MCP tools:

```text
get_status
start_recording
stop_recording
list_sessions
list_data_sources
get_timeline
list_records
get_record
get_all_session_data
export_session
```

Expected:

- Status shows bridge and extension online.
- Recording starts and stops.
- Session appears.
- Sources appear.
- Timeline and records return rough list items.
- Detail returns complete raw record.
- All data returns full source map or explicit large-payload/timeout error.
- Export triggers extension export.

## Self-Review

Spec coverage:

- Local bridge: Tasks 2-4.
- MCP tools: Task 5.
- Configurable port/token: Tasks 3, 6, 10, 12.
- Extension polling bridge client: Task 9.
- Generic sources/list/detail/timeline/all-data: Task 7 and Task 8.
- Export as separate tool: Task 8.
- No analysis from files: enforced by absence of file-analysis tool.
- No default filtering/redaction in agent layer: protocol and record APIs return raw details; preview only for list browsing.
- Skill risk doc: Task 11.
- Verification: Task 12.

Placeholder scan: no TBD/TODO/implement-later placeholders intended. Any executor finding a missing export or existing signature mismatch should make the narrowest compatible change and update the relevant test.

Type consistency:

- Command types match `AGENT_COMMAND_TYPES`.
- MCP tool names map one-to-one to command types except `get_status`.
- `record_id` format is consistently `<source>:<native_id>`.
- `source` names are `record_events`, `network_requests`, `console_logs`, `error_logs`.
