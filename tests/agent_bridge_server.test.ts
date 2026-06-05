import { afterEach, describe, expect, it } from 'vitest';
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
});
