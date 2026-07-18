import { afterEach, describe, expect, it } from 'vitest';
import { create_bridge_server } from '../src/bridge/server';
import { BridgeMcpClient } from '../src/agent/mcp/client';
import { execute_mcp_tool, MCP_TOOL_NAMES } from '../src/agent/mcp/tools';

const token = '<TEST_BRIDGE_TOKEN>';
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
    for (let attempt = 0; attempt < 20; attempt += 1) {
        const response = await fetch(`${bridge_url}/extension/command`, {
            headers: { Authorization: `Bearer ${token}`, 'X-Capture-All-Instance-Id': 'inst_mcp_test' },
        });
        const command = await response.json();

        if (command) {
            return command;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
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
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Capture-All-Instance-Id': 'inst_mcp_test' },
            body: JSON.stringify({ instance_id: 'inst_mcp_test', extension_version: '1.0.0', active_capture_id: null }),
        });

        const command_response = client.send_command('captures.get', { session_id: 'session-1' }, 5000);
        const command = await take_next_command(server.url);

        expect(command).toMatchObject({
            type: 'captures.get',
            payload: { session_id: 'session-1' },
        });

        await fetch(`${server.url}/extension/result`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Capture-All-Instance-Id': 'inst_mcp_test' },
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

        await expect(client.send_command('captures.list', {})).rejects.toThrow('EXTENSION_OFFLINE: Extension is offline');
    });
});

describe('execute_mcp_tool', () => {
    it('registers the expected MCP tool names', () => {
        expect(MCP_TOOL_NAMES).toEqual([
            'get_status',
            'list_browsers',
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

    it('routes start_recording to recording.start command', async () => {
        const server = await start_test_server();
        const client = new BridgeMcpClient(server.url, token);

        await fetch(`${server.url}/extension/heartbeat`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Capture-All-Instance-Id': 'inst_mcp_test' },
            body: JSON.stringify({ instance_id: 'inst_mcp_test', extension_version: '1.0.0', active_capture_id: null }),
        });

        const tool_promise = execute_mcp_tool(client, {
            name: 'start_recording',
            arguments: { url: 'https://example.com' }
        });
        const command = await take_next_command(server.url);

        expect(command).toMatchObject({
            type: 'capture.start',
            payload: { url: 'https://example.com' },
        });
        expect(command.payload).not.toHaveProperty('mode');

        await fetch(`${server.url}/extension/result`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Capture-All-Instance-Id': 'inst_mcp_test' },
            body: JSON.stringify({ command_id: command.command_id, ok: true, data: { session_id: 'sess-1' } }),
        });

        await expect(tool_promise).resolves.toEqual({
            command_id: command.command_id,
            ok: true,
            data: { session_id: 'sess-1' },
        });
    });

    it('routes sessions.list to sessions.list command', async () => {
        const server = await start_test_server();
        const client = new BridgeMcpClient(server.url, token);

        await fetch(`${server.url}/extension/heartbeat`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Capture-All-Instance-Id': 'inst_mcp_test' },
            body: JSON.stringify({ instance_id: 'inst_mcp_test', extension_version: '1.0.0', active_capture_id: null }),
        });

        const tool_promise = execute_mcp_tool(client, { name: 'list_sessions' });
        const command = await take_next_command(server.url);

        expect(command).toMatchObject({
            type: 'captures.list',
            payload: {},
        });

        const sessions = [{ session_id: 's1', name: 'Test 1' }, { session_id: 's2', name: 'Test 2' }];
        await fetch(`${server.url}/extension/result`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Capture-All-Instance-Id': 'inst_mcp_test' },
            body: JSON.stringify({ command_id: command.command_id, ok: true, data: { sessions } }),
        });

        await expect(tool_promise).resolves.toEqual({
            command_id: command.command_id,
            ok: true,
            data: { sessions },
        });
    });

    it('routes sources.list to sources.list command', async () => {
        const server = await start_test_server();
        const client = new BridgeMcpClient(server.url, token);

        await fetch(`${server.url}/extension/heartbeat`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Capture-All-Instance-Id': 'inst_mcp_test' },
            body: JSON.stringify({ instance_id: 'inst_mcp_test', extension_version: '1.0.0', active_capture_id: null }),
        });

        const tool_promise = execute_mcp_tool(client, {
            name: 'list_data_sources',
            arguments: { session_id: 'sess-1' }
        });
        const command = await take_next_command(server.url);

        expect(command).toMatchObject({
            type: 'sources.list',
            payload: { session_id: 'sess-1' },
        });

        const sources = [{ source: 'network_requests', count: 5 }];
        await fetch(`${server.url}/extension/result`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Capture-All-Instance-Id': 'inst_mcp_test' },
            body: JSON.stringify({ command_id: command.command_id, ok: true, data: { sources } }),
        });

        await expect(tool_promise).resolves.toEqual({
            command_id: command.command_id,
            ok: true,
            data: { sources },
        });
    });

    it('routes timeline.list to timeline.list command with query params', async () => {
        const server = await start_test_server();
        const client = new BridgeMcpClient(server.url, token);

        await fetch(`${server.url}/extension/heartbeat`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Capture-All-Instance-Id': 'inst_mcp_test' },
            body: JSON.stringify({ instance_id: 'inst_mcp_test', extension_version: '1.0.0', active_capture_id: null }),
        });

        const tool_promise = execute_mcp_tool(client, {
            name: 'get_timeline',
            arguments: { session_id: 'sess-1', start_time: 100, end_time: 500, limit: 20, order: 'desc' }
        });
        const command = await take_next_command(server.url);

        expect(command).toMatchObject({
            type: 'timeline.list',
            payload: { session_id: 'sess-1', start_time: 100, end_time: 500, limit: 20, order: 'desc' },
        });

        const timeline = { total: 2, records: [{ record_id: 'r1' }, { record_id: 'r2' }] };
        await fetch(`${server.url}/extension/result`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Capture-All-Instance-Id': 'inst_mcp_test' },
            body: JSON.stringify({ command_id: command.command_id, ok: true, data: timeline }),
        });

        await expect(tool_promise).resolves.toEqual({
            command_id: command.command_id,
            ok: true,
            data: timeline,
        });
    });

    it('routes session.export to session.export command', async () => {
        const server = await start_test_server();
        const client = new BridgeMcpClient(server.url, token);

        await fetch(`${server.url}/extension/heartbeat`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Capture-All-Instance-Id': 'inst_mcp_test' },
            body: JSON.stringify({ instance_id: 'inst_mcp_test', extension_version: '1.0.0', active_capture_id: null }),
        });

        const tool_promise = execute_mcp_tool(client, {
            name: 'export_session',
            arguments: { session_id: 'sess-1', format: 'json' }
        });
        const command = await take_next_command(server.url);

        expect(command).toMatchObject({
            type: 'capture.export',
            payload: { session_id: 'sess-1', format: 'json' },
        });

        await fetch(`${server.url}/extension/result`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Capture-All-Instance-Id': 'inst_mcp_test' },
            body: JSON.stringify({ command_id: command.command_id, ok: true, data: { export_url: 'blob:...' } }),
        });

        await expect(tool_promise).resolves.toEqual({
            command_id: command.command_id,
            ok: true,
            data: { export_url: 'blob:...' },
        });
    });

    it('list_browsers returns extensions from bridge status', async () => {
        const server = await start_test_server();
        const client = new BridgeMcpClient(server.url, token);

        await fetch(`${server.url}/extension/heartbeat`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Capture-All-Instance-Id': 'inst_a' },
            body: JSON.stringify({ instance_id: 'inst_a', extension_version: '1.0.0', active_capture_id: 'cap-1', browser_no: 1 }),
        });
        await fetch(`${server.url}/extension/heartbeat`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Capture-All-Instance-Id': 'inst_b' },
            body: JSON.stringify({ instance_id: 'inst_b', extension_version: '2.0.0', active_capture_id: null, browser_no: 2 }),
        });

        const result = await execute_mcp_tool(client, { name: 'list_browsers' });
        expect(result).toHaveProperty('browsers');
        const browsers = (result as { browsers: unknown[] }).browsers;
        expect(Array.isArray(browsers)).toBe(true);
        expect(browsers.length).toBe(2);
        for (const b of browsers) {
            expect(b).toHaveProperty('browser_no');
            expect(typeof (b as Record<string, unknown>).browser_no).toBe('number');
            expect(b).toHaveProperty('online');
            expect(typeof (b as Record<string, unknown>).online).toBe('boolean');
            expect(b).toHaveProperty('browser_label');
            expect(b).toHaveProperty('active_capture_id');
        }
    });

    it('passes browser_no through to bridge payload', async () => {
        const server = await start_test_server();
        const client = new BridgeMcpClient(server.url, token);

        await fetch(`${server.url}/extension/heartbeat`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Capture-All-Instance-Id': 'inst_mcp_test' },
            body: JSON.stringify({ instance_id: 'inst_mcp_test', extension_version: '1.0.0', active_capture_id: null, browser_no: 2 }),
        });

        const tool_promise = execute_mcp_tool(client, {
            name: 'start_recording',
            arguments: { browser_no: 2 }
        });
        const command = await take_next_command(server.url);

        expect(command.payload).toHaveProperty('browser_no', 2);

        await fetch(`${server.url}/extension/result`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Capture-All-Instance-Id': 'inst_mcp_test' },
            body: JSON.stringify({ command_id: command.command_id, ok: true, data: { session_id: 'sess-1' } }),
        });

        await expect(tool_promise).resolves.toMatchObject({
            ok: true,
        });
    });

    it('throws for unknown tool name', async () => {
        const server = await start_test_server();
        const client = new BridgeMcpClient(server.url, token);

        await expect(execute_mcp_tool(client, { name: 'nonexistent_tool' })).rejects.toThrow(
            'Unknown MCP tool: nonexistent_tool'
        );
    });
});
