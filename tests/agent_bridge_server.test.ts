import { afterEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import { create_bridge_server } from '../src/agent/bridge/server';

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

async function take_next_command(server_url: string) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
        const response = await fetch(`${server_url}/extension/command`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const command = await response.json();

        if (command) {
            return command;
        }

        await new Promise((resolve) => setTimeout(resolve, 10));
    }

    throw new Error('Command was not queued');
}

/**
 * POST to /mcp/command using raw http.request (agent:false) to bypass
 * undici's connection pool so that concurrent requests are not serialized.
 */
function post_command(server_url: string, body: unknown): Promise<{ status: number; data: unknown }> {
    return new Promise((resolve, reject) => {
        const url = new URL('/mcp/command', server_url);
        const payload = JSON.stringify(body);
        const req = http.request(
            {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname,
                method: 'POST',
                agent: false,
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload),
                },
            },
            (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', () => {
                    const data = JSON.parse(Buffer.concat(chunks).toString());
                    resolve({ status: res.statusCode || 0, data });
                });
            },
        );
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

/**
 * GET /extension/command using raw http.get (agent:false) to bypass
 * undici's connection pool for compatibility with concurrent tests.
 */
function get_command(server_url: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const url = new URL('/extension/command', server_url);
        http.get(
            {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname,
                agent: false,
                headers: { Authorization: `Bearer ${token}` },
            },
            (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', () => {
                    resolve(JSON.parse(Buffer.concat(chunks).toString()));
                });
            },
        ).on('error', reject);
    });
}

/** Poll /extension/command via raw http until a command is available. */
async function dequeue_command(server_url: string): Promise<any> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        const command = await get_command(server_url);
        if (command) {
            return command;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('Command was not queued');
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

    it('returns 400 for invalid json body', async () => {
        const server = await start_test_server();
        const response = await fetch(`${server.url}/extension/heartbeat`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: '{',
        });

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({
            ok: false,
            error: {
                code: 'INVALID_QUERY',
                message: 'Invalid JSON body',
            },
        });
    });

    it('returns 413 for oversized json body', async () => {
        const server = await start_test_server();
        const response = await fetch(`${server.url}/extension/heartbeat`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ extension_version: '1'.repeat(1024 * 1024), active_session_id: null }),
        });

        expect(response.status).toBe(413);
        expect(await response.json()).toEqual({
            ok: false,
            error: {
                code: 'PAYLOAD_TOO_LARGE',
                message: 'JSON body is too large',
            },
        });
    });

    it('returns 400 for unknown command type', async () => {
        const server = await start_test_server();

        await fetch(`${server.url}/extension/heartbeat`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ extension_version: '1.0.0', active_session_id: null }),
        });

        const response = await fetch(`${server.url}/mcp/command`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'sessions.delete', payload: {} }),
        });

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({
            ok: false,
            error: {
                code: 'INVALID_QUERY',
                message: 'Unknown command type',
            },
        });
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

        const command = await take_next_command(server.url);

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

    it('returns mcp status', async () => {
        const server = await start_test_server();
        const response = await fetch(`${server.url}/mcp/status`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        expect(response.status).toBe(200);
        const status = await response.json();
        expect(status.bridge_version).toBe('0.1.0');
        expect(status.extension_online).toBe(false);
        expect(status.pending_commands).toBe(0);
    });

    it('handles concurrent requests correctly', async () => {
        const server = await start_test_server();

        await fetch(`${server.url}/extension/heartbeat`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ extension_version: '1.0.0', active_session_id: null }),
        });

        // Fire 3 concurrent POSTs using separate TCP connections (agent:false).
        // Each handler enqueues a command then awaits the result, so all three
        // are pending simultaneously.
        const p1 = post_command(server.url, { type: 'sessions.list', payload: { index: 0 } });
        const p2 = post_command(server.url, { type: 'sessions.get', payload: { index: 1 } });
        const p3 = post_command(server.url, { type: 'sources.list', payload: { index: 2 } });

        // Wait for server to process all 3 enqueues
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Dequeue all 3 commands via raw http polling (not fetch, to avoid pool blocking)
        const cmd1 = await dequeue_command(server.url);
        const cmd2 = await dequeue_command(server.url);
        const cmd3 = await dequeue_command(server.url);

        expect(cmd1).not.toBeNull();
        expect(cmd2).not.toBeNull();
        expect(cmd3).not.toBeNull();

        // Resolve all three (order is non-deterministic with concurrent connections)
        await fetch(`${server.url}/extension/result`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ command_id: cmd1.command_id, ok: true, data: {} }),
        });
        await fetch(`${server.url}/extension/result`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ command_id: cmd2.command_id, ok: true, data: {} }),
        });
        await fetch(`${server.url}/extension/result`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ command_id: cmd3.command_id, ok: true, data: {} }),
        });

        const results = await Promise.all([p1, p2, p3]);
        expect(results[0].status).toBe(200);
        expect(results[1].status).toBe(200);
        expect(results[2].status).toBe(200);
        for (const r of results) {
            expect((r.data as any).ok).toBe(true);
        }
    });

    it('close() with pending request rejects cleanly', async () => {
        const server = await start_test_server();

        await fetch(`${server.url}/extension/heartbeat`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ extension_version: '1.0.0', active_session_id: null }),
        });

        // Fire a request that will be enqueued but never resolved
        const req = post_command(server.url, { type: 'sessions.list', payload: {} });

        // Dequeue the command via raw http (bypasses fetch pool)
        const command = await dequeue_command(server.url);
        expect(command).not.toBeNull();

        // Force-close all connections so close() does not hang
        server._server.closeAllConnections();

        await server.close();
        cleanup = null;

        // The pending request should be rejected
        await expect(req).rejects.toThrow();
    });
});
