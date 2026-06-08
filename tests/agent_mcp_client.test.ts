import { afterEach, describe, expect, it } from 'vitest';
import { create_bridge_server } from '../src/agent/bridge/server';
import { BridgeMcpClient } from '../src/agent/mcp/client';
import { execute_mcp_tool, MCP_TOOL_NAMES } from '../src/agent/mcp/tools';

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

async function take_next_command(bridge_url: string) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
        const response = await fetch(`${bridge_url}/extension/command`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const command = await response.json();

        if (command) {
            return command;
        }
    }

    throw new Error('No command queued');
}

afterEach(async () => {
    if (cleanup) {
        await cleanup();
        cleanup = null;
    }
});

describe('BridgeMcpClient', () => {
    it('reads bridge status', async () => {
        const server = await start_test_server();
        const client = new BridgeMcpClient(server.url, token);

        await expect(client.get_status()).resolves.toMatchObject({
            bridge_url: server.url,
            extension_online: false,
        });
    });

    it('sends bridge commands with payload and timeout', async () => {
        const server = await start_test_server();
        const client = new BridgeMcpClient(server.url, token);

        await fetch(`${server.url}/extension/heartbeat`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ extension_version: '1.0.0', active_session_id: null }),
        });

        const command_response = client.send_command('sessions.get', { session_id: 'session-1' }, 5000);
        const command = await take_next_command(server.url);

        expect(command).toMatchObject({
            type: 'sessions.get',
            payload: { session_id: 'session-1' },
        });

        await fetch(`${server.url}/extension/result`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ command_id: command.command_id, ok: true, data: { session_id: 'session-1' } }),
        });

        await expect(command_response).resolves.toEqual({
            command_id: command.command_id,
            ok: true,
            data: { session_id: 'session-1' },
        });
    });

    it('throws clear errors for failed status requests', async () => {
        const server = await start_test_server();
        const client = new BridgeMcpClient(server.url, 'wrong-token');

        await expect(client.get_status()).rejects.toThrow('TOKEN_INVALID: Invalid token');
    });

    it('throws clear errors for failed command requests', async () => {
        const server = await start_test_server();
        const client = new BridgeMcpClient(server.url, token);

        await expect(client.send_command('sessions.list', {})).rejects.toThrow('EXTENSION_OFFLINE: Extension is offline');
    });
});

describe('execute_mcp_tool', () => {
    it('registers the expected MCP tool names', () => {
        expect(MCP_TOOL_NAMES).toEqual([
            'get_status',
            'start_recording',
            'stop_recording',
            'list_captures',
            'get_capture',
            'list_sessions',
            'get_session',
            'list_data_sources',
            'list_records',
            'get_record',
            'get_timeline',
            'get_timeline_item',
            'get_all_capture_data',
            'get_all_session_data',
            'export_capture',
            'export_session',
        ]);
    });

    it('uses local status for get_status', async () => {
        const server = await start_test_server();
        const client = new BridgeMcpClient(server.url, token);

        await expect(execute_mcp_tool(client, { name: 'get_status' })).resolves.toMatchObject({
            bridge_url: server.url,
            extension_online: false,
        });
    });
});
