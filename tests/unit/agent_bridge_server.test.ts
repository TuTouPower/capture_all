import { afterEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { create_bridge_server } from '../../src/bridge/server';

const token = '<TEST_BRIDGE_TOKEN>';
const DEFAULT_INSTANCE_ID = 'inst_test_1';
const INSTANCE_HEADER = 'X-Capture-All-Instance-Id';
let cleanup: (() => Promise<void>) | null = null;

async function start_test_server(overrides?: { dev_mode?: boolean }) {
    const server = await create_bridge_server({
        host: '127.0.0.1',
        port: 0,
        token,
        command_timeout_ms: 30000,
        full_data_timeout_ms: 120000,
        dev_mode: overrides?.dev_mode ?? false,
    });
    cleanup = server.close;
    return server;
}

async function take_next_command(server_url: string, instance_id = DEFAULT_INSTANCE_ID) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
        const response = await fetch(`${server_url}/extension/command`, {
            headers: { Authorization: `Bearer ${token}`, [INSTANCE_HEADER]: instance_id },
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

function post_partial_body(
    server_url: string,
    headers: Record<string, string>,
): Promise<{ status: number; data: unknown }> {
    return new Promise((resolve, reject) => {
        const url = new URL('/extension/result', server_url);
        const request = http.request(
            {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname,
                method: 'POST',
                agent: false,
                headers: {
                    'Content-Type': 'application/json',
                    ...headers,
                },
            },
            (response) => {
                const chunks: Buffer[] = [];

                response.on(
                    'data',
                    (chunk: Buffer) => chunks.push(chunk),
                );
                response.on('end', () => {
                    clearTimeout(timeout_id);
                    request.destroy();
                    resolve({
                        status: response.statusCode || 0,
                        data: JSON.parse(
                            Buffer.concat(chunks).toString(),
                        ) as unknown,
                    });
                });
            },
        );
        const timeout_id = setTimeout(() => {
            request.destroy();
            reject(new Error('Bridge waited for unfinished body'));
        }, 1000);

        request.on('error', (error) => {
            clearTimeout(timeout_id);
            reject(error);
        });
        request.flushHeaders();
        request.write('{');
    });
}

/**
 * GET /extension/command using raw http.get (agent:false) to bypass
 * undici's connection pool for compatibility with concurrent tests.
 */
function get_command(server_url: string, instance_id = DEFAULT_INSTANCE_ID): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const url = new URL('/extension/command', server_url);
        http.get(
            {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname,
                agent: false,
                headers: { Authorization: `Bearer ${token}`, [INSTANCE_HEADER]: instance_id },
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
            body: JSON.stringify({ type: 'captures.list', payload: {} }),
        });

        expect(response.status).toBe(401);
    });

    it('allows authenticated requests without an Origin header', async () => {
        const server = await start_test_server();
        const response = await fetch(`${server.url}/mcp/status`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('allows requests from a Chrome extension origin', async () => {
        const server = await start_test_server();
        const origin = 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
        const response = await fetch(`${server.url}/mcp/status`, {
            headers: {
                Authorization: `Bearer ${token}`,
                Origin: origin,
            },
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
        expect(response.headers.get('Vary')).toContain('Origin');
    });

    it('rejects requests from a web page origin', async () => {
        const server = await start_test_server();
        const response = await fetch(`${server.url}/mcp/status`, {
            headers: {
                Authorization: `Bearer ${token}`,
                Origin: 'https://example.com',
            },
        });

        expect(response.status).toBe(403);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
        expect(await response.json()).toEqual({
            ok: false,
            error: {
                code: 'ORIGIN_NOT_ALLOWED',
                message: 'Origin is not allowed',
            },
        });
    });

    it('rejects health checks from a web page origin', async () => {
        const server = await start_test_server();
        const response = await fetch(`${server.url}/health`, {
            headers: { Origin: 'http://localhost:3000' },
        });

        expect(response.status).toBe(403);
    });

    it('accepts preflight from a Chrome extension origin', async () => {
        const server = await start_test_server();
        const origin = 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
        const response = await fetch(`${server.url}/extension/heartbeat`, {
            method: 'OPTIONS',
            headers: {
                Origin: origin,
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'authorization,content-type',
            },
        });

        expect(response.status).toBe(204);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
        expect(response.headers.get('Access-Control-Allow-Methods')).toBe(
            'GET, POST, OPTIONS',
        );
        expect(response.headers.get('Access-Control-Allow-Headers')).toBe(
            'Authorization, Content-Type',
        );
    });

    it('accepts preflight without an Origin header', async () => {
        const server = await start_test_server();
        const response = await fetch(`${server.url}/extension/heartbeat`, {
            method: 'OPTIONS',
        });

        expect(response.status).toBe(204);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('rejects preflight from an invalid browser origin', async () => {
        const server = await start_test_server();
        const response = await fetch(`${server.url}/extension/heartbeat`, {
            method: 'OPTIONS',
            headers: { Origin: 'null' },
        });

        expect(response.status).toBe(403);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('rejects preflight from a web page origin', async () => {
        const server = await start_test_server();
        const response = await fetch(`${server.url}/extension/heartbeat`, {
            method: 'OPTIONS',
            headers: { Origin: 'https://example.com' },
        });

        expect(response.status).toBe(403);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it.each([
        'null',
        'chrome-extension://short-id',
        'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/path',
        'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaq',
    ])('rejects invalid browser origin %s', async (origin) => {
        const server = await start_test_server();
        const response = await fetch(`${server.url}/mcp/status`, {
            headers: {
                Authorization: `Bearer ${token}`,
                Origin: origin,
            },
        });

        expect(response.status).toBe(403);
    });

    it.each([
        undefined,
        'Basic dGVzdA==',
        'Bearer wrong-token-12',
        'Bearer short',
        `Bearer ${token}extra`,
        'Bearer test-token-999',
    ])('rejects invalid authorization header %s', async (authorization) => {
        const server = await start_test_server();
        const headers = authorization
            ? { Authorization: authorization }
            : undefined;
        const response = await fetch(`${server.url}/mcp/status`, { headers });

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({
            ok: false,
            error: {
                code: 'TOKEN_INVALID',
                message: 'Invalid token',
            },
        });
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
            body: JSON.stringify({ instance_id: DEFAULT_INSTANCE_ID, extension_version: '1'.repeat(1024 * 1024), active_capture_id: null }),
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

    it('accepts extension results larger than the default limit', async () => {
        const server = await start_test_server();

        await fetch(`${server.url}/extension/heartbeat`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                instance_id: DEFAULT_INSTANCE_ID,
                extension_version: '1.0.0',
                active_capture_id: null,
            }),
        });

        const command_response = fetch(`${server.url}/mcp/command`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                type: 'captures.list',
                payload: {},
                timeout_ms: 5000,
            }),
        });
        const command = await take_next_command(server.url);
        const large_value = 'x'.repeat(2 * 1024 * 1024);
        const result_body = JSON.stringify({
            command_id: command.command_id,
            ok: true,
            data: { value: large_value },
        });
        let result_response: Response | undefined;

        try {
            expect(Buffer.byteLength(result_body)).toBeGreaterThan(
                1024 * 1024,
            );
            result_response = await fetch(`${server.url}/extension/result`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                [INSTANCE_HEADER]: DEFAULT_INSTANCE_ID,
                [INSTANCE_HEADER]: DEFAULT_INSTANCE_ID,
            },
                body: result_body,
            });
        } finally {
            if (!result_response?.ok) {
                await fetch(`${server.url}/extension/result`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                [INSTANCE_HEADER]: DEFAULT_INSTANCE_ID,
                [INSTANCE_HEADER]: DEFAULT_INSTANCE_ID,
            },
                    body: JSON.stringify({
                        command_id: command.command_id,
                        ok: true,
                        data: { value: '' },
                    }),
                });
            }
        }

        expect(result_response?.status).toBe(200);
        const command_result = await command_response;
        const result = await command_result.json() as {
            command_id: string;
            ok: boolean;
            data: { value: string };
        };

        expect(command_result.status).toBe(200);
        expect(result.command_id).toBe(command.command_id);
        expect(result.ok).toBe(true);
        expect(result.data.value).toHaveLength(large_value.length);
        expect(createHash('sha256').update(result.data.value).digest('hex'))
            .toBe(createHash('sha256').update(large_value).digest('hex'));
    });

    it('accepts an exact 64 MiB extension result', async () => {
        const server = await start_test_server();

        await fetch(`${server.url}/extension/heartbeat`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                instance_id: DEFAULT_INSTANCE_ID,
                extension_version: '1.0.0',
                active_capture_id: null,
            }),
        });

        const command_response = fetch(`${server.url}/mcp/command`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                type: 'captures.list',
                payload: {},
                timeout_ms: 5000,
            }),
        });
        const command = await take_next_command(server.url);
        const limit_bytes = 64 * 1024 * 1024;
        const result_json = JSON.stringify({
            command_id: command.command_id,
            ok: true,
            data: { accepted: true },
        });
        const body = result_json.padEnd(limit_bytes, ' ');

        expect(Buffer.byteLength(body)).toBe(limit_bytes);
        const response = await fetch(`${server.url}/extension/result`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                [INSTANCE_HEADER]: DEFAULT_INSTANCE_ID,
                [INSTANCE_HEADER]: DEFAULT_INSTANCE_ID,
            },
            body,
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ ok: true });
        expect(await (await command_response).json()).toEqual({
            command_id: command.command_id,
            ok: true,
            data: { accepted: true },
        });
    }, 60000);

    it('rejects extension results larger than 64 MiB', async () => {
        const server = await start_test_server();
        const oversized_bytes = 64 * 1024 * 1024 + 1;
        const body = `${' '.repeat(oversized_bytes - 1)}{`;

        expect(Buffer.byteLength(body)).toBe(oversized_bytes);
        const response = await fetch(`${server.url}/extension/result`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                [INSTANCE_HEADER]: DEFAULT_INSTANCE_ID,
                [INSTANCE_HEADER]: DEFAULT_INSTANCE_ID,
            },
            body,
        });

        expect(response.status).toBe(413);
        expect(await response.json()).toEqual({
            ok: false,
            error: {
                code: 'PAYLOAD_TOO_LARGE',
                message: 'JSON body is too large',
            },
        });
    }, 60000);

    it('authenticates extension results before reading the body', async () => {
        const server = await start_test_server();
        const response = await post_partial_body(server.url, {
            Authorization: 'Bearer invalid-token',
        });

        expect(response.status).toBe(401);
        expect(response.data).toEqual({
            ok: false,
            error: {
                code: 'TOKEN_INVALID',
                message: 'Invalid token',
            },
        });
    });

    it('checks extension result Origin before reading the body', async () => {
        const server = await start_test_server();
        const response = await post_partial_body(server.url, {
            Authorization: `Bearer ${token}`,
            Origin: 'https://example.com',
        });

        expect(response.status).toBe(403);
        expect(response.data).toEqual({
            ok: false,
            error: {
                code: 'ORIGIN_NOT_ALLOWED',
                message: 'Origin is not allowed',
            },
        });
    });

    it('returns 400 for unknown command type', async () => {
        const server = await start_test_server();

        await fetch(`${server.url}/extension/heartbeat`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ instance_id: DEFAULT_INSTANCE_ID, extension_version: '1.0.0', active_capture_id: null }),
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
            body: JSON.stringify({ type: 'captures.list', payload: {} }),
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
            body: JSON.stringify({ instance_id: DEFAULT_INSTANCE_ID, extension_version: '1.0.0', active_capture_id: null }),
        });

        const command_response = fetch(`${server.url}/mcp/command`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'captures.list', payload: {} }),
        });

        const command = await take_next_command(server.url);

        await fetch(`${server.url}/extension/result`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', [INSTANCE_HEADER]: DEFAULT_INSTANCE_ID },
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
            body: JSON.stringify({ instance_id: DEFAULT_INSTANCE_ID, extension_version: '1.0.0', active_capture_id: null }),
        });

        // Fire 3 concurrent POSTs using separate TCP connections (agent:false).
        // Each handler enqueues a command then awaits the result, so all three
        // are pending simultaneously.
        const p1 = post_command(server.url, { type: 'captures.list', payload: { index: 0 } });
        const p2 = post_command(server.url, { type: 'captures.get', payload: { index: 1 } });
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
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', [INSTANCE_HEADER]: DEFAULT_INSTANCE_ID },
            body: JSON.stringify({ command_id: cmd1.command_id, ok: true, data: {} }),
        });
        await fetch(`${server.url}/extension/result`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', [INSTANCE_HEADER]: DEFAULT_INSTANCE_ID },
            body: JSON.stringify({ command_id: cmd2.command_id, ok: true, data: {} }),
        });
        await fetch(`${server.url}/extension/result`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', [INSTANCE_HEADER]: DEFAULT_INSTANCE_ID },
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
            body: JSON.stringify({ instance_id: DEFAULT_INSTANCE_ID, extension_version: '1.0.0', active_capture_id: null }),
        });

        // Fire a request that will be enqueued but never resolved
        const req = post_command(server.url, { type: 'captures.list', payload: {} });

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

    it('auto-writes large export results when output_path is omitted', async () => {
        const server = await start_test_server();
        const export_dir = await mkdtemp(join(tmpdir(), 'capture-all-auto-export-'));
        const previous = process.env.CAPTURE_ALL_EXPORT_DIR;
        process.env.CAPTURE_ALL_EXPORT_DIR = export_dir;

        try {
            await fetch(`${server.url}/extension/heartbeat`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ instance_id: DEFAULT_INSTANCE_ID, extension_version: '1.0.0', active_capture_id: null }),
            });

            const command_response = fetch(`${server.url}/mcp/command`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'capture.export',
                    payload: { capture_id: 'session-big', format: 'json' },
                    timeout_ms: 5000,
                }),
            });

            const command = await take_next_command(server.url);
            const large_content = 'x'.repeat(1 * 1024 * 1024 + 10);
            await fetch(`${server.url}/extension/result`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    [INSTANCE_HEADER]: DEFAULT_INSTANCE_ID,
                },
                body: JSON.stringify({
                    command_id: command.command_id,
                    ok: true,
                    data: { format: 'json', content: large_content },
                }),
            });

            const result = await (await command_response).json() as {
                command_id: string;
                ok: boolean;
                data: { file_path: string; size_bytes: number };
            };

            expect(result.ok).toBe(true);
            expect(result.data.size_bytes).toBe(Buffer.byteLength(large_content, 'utf-8'));
            expect(result.data.file_path).toBe(join(export_dir, 'session-big.json'));
            expect(await readFile(result.data.file_path, 'utf-8')).toBe(large_content);
        } finally {
            if (previous === undefined) delete process.env.CAPTURE_ALL_EXPORT_DIR;
            else process.env.CAPTURE_ALL_EXPORT_DIR = previous;
        }
    });

    it('keeps small export results inline when output_path is omitted', async () => {
        const server = await start_test_server();

        await fetch(`${server.url}/extension/heartbeat`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ instance_id: DEFAULT_INSTANCE_ID, extension_version: '1.0.0', active_capture_id: null }),
        });

        const command_response = fetch(`${server.url}/mcp/command`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'capture.export',
                payload: { capture_id: 'session-small', format: 'json' },
                timeout_ms: 5000,
            }),
        });

        const command = await take_next_command(server.url);
        await fetch(`${server.url}/extension/result`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                [INSTANCE_HEADER]: DEFAULT_INSTANCE_ID,
            },
            body: JSON.stringify({
                command_id: command.command_id,
                ok: true,
                data: { format: 'json', content: '{"ok":true}' },
            }),
        });

        expect(await (await command_response).json()).toEqual({
            command_id: command.command_id,
            ok: true,
            data: { format: 'json', content: '{"ok":true}' },
        });
    });

    it('multi-instance: status lists two online extensions', async () => {
        const server = await start_test_server();
        for (const id of ['inst_a', 'inst_b']) {
            await fetch(`${server.url}/extension/heartbeat`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instance_id: id,
                    browser_no: id === 'inst_a' ? 1 : 2,
                    extension_version: '1.0.0',
                    active_capture_id: null,
                }),
            });
        }
        const status = await (await fetch(`${server.url}/mcp/status`, {
            headers: { Authorization: `Bearer ${token}` },
        })).json() as any;
        expect(status.online_count).toBe(2);
        expect(status.extensions.filter((e: any) => e.online)).toHaveLength(2);
        expect(status.extensions.map((e: any) => e.instance_id).sort()).toEqual(['inst_a', 'inst_b']);
    });

    it('multi-instance: commands route per instance and isolation', async () => {
        const server = await start_test_server();
        for (const [id, no] of [['inst_a', 1], ['inst_b', 2]] as const) {
            await fetch(`${server.url}/extension/heartbeat`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instance_id: id,
                    browser_no: no,
                    extension_version: '1.0.0',
                    active_capture_id: null,
                }),
            });
        }

        const cmd_p = fetch(`${server.url}/mcp/command`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'captures.list', payload: { browser_no: 1 } }),
        });
        const for_a = await take_next_command(server.url, 'inst_a');
        expect(for_a.type).toBe('captures.list');
        // B should not see A's command
        const b_poll = await fetch(`${server.url}/extension/command`, {
            headers: { Authorization: `Bearer ${token}`, [INSTANCE_HEADER]: 'inst_b' },
        });
        expect(await b_poll.json()).toBeNull();

        await fetch(`${server.url}/extension/result`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                [INSTANCE_HEADER]: 'inst_a',
            },
            body: JSON.stringify({ command_id: for_a.command_id, ok: true, data: { captures: [] } }),
        });
        expect((await (await cmd_p).json()).ok).toBe(true);
    });

    it('multi-instance: write without target returns TARGET_REQUIRED', async () => {
        const server = await start_test_server();
        for (const id of ['inst_a', 'inst_b']) {
            await fetch(`${server.url}/extension/heartbeat`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instance_id: id,
                    extension_version: '1.0.0',
                    active_capture_id: null,
                }),
            });
        }
        const response = await fetch(`${server.url}/mcp/command`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'capture.start', payload: {} }),
        });
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({
            ok: false,
            error: { code: 'TARGET_REQUIRED' },
        });
    });

    // ─── T0005 bridge auto-enroll ───

    it('enroll returns 400 when browser_no is missing', async () => {
        const server = await start_test_server();
        const response = await fetch(`${server.url}/extension/enroll`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ extension_version: '1.0.0' }),
        });
        expect(response.status).toBe(400);
        expect((await response.json()).error.code).toBe('INVALID_QUERY');
    });

    it.each([0, -1, 1.5, null, 'abc'])(
        'enroll returns 400 for invalid browser_no: %s',
        async (val) => {
            const server = await start_test_server();
            const response = await fetch(`${server.url}/extension/enroll`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ browser_no: val, extension_version: '1.0.0' }),
            });
            expect(response.status).toBe(400);
            expect((await response.json()).error.code).toBe('INVALID_QUERY');
        },
    );

    it('enroll returns 400 when extension_version is missing', async () => {
        const server = await start_test_server();
        const response = await fetch(`${server.url}/extension/enroll`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ browser_no: 1 }),
        });
        expect(response.status).toBe(400);
        expect((await response.json()).error.code).toBe('INVALID_QUERY');
    });

    it('AC-1: enroll returns 200 with instance_id, instance_token, browser_no', async () => {
        const server = await start_test_server();
        const response = await fetch(`${server.url}/extension/enroll`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ browser_no: 1, extension_version: '1.0.0' }),
        });
        expect(response.status).toBe(200);
        const json = await response.json();
        expect(json.ok).toBe(true);
        expect(typeof json.data.instance_id).toBe('string');
        expect(json.data.instance_id.length).toBeGreaterThan(0);
        expect(typeof json.data.instance_token).toBe('string');
        expect(json.data.instance_token.startsWith('ext_')).toBe(true);
        expect(json.data.browser_no).toBe(1);
    });

    it('enroll accepts optional instance_id', async () => {
        const server = await start_test_server();
        const response = await fetch(`${server.url}/extension/enroll`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                browser_no: 1,
                extension_version: '1.0.0',
                instance_id: 'my-custom-instance',
            }),
        });
        expect(response.status).toBe(200);
        const json = await response.json();
        expect(json.data.instance_id).toBe('my-custom-instance');
    });

    it('enroll accepts optional browser_label', async () => {
        const server = await start_test_server();
        const response = await fetch(`${server.url}/extension/enroll`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                browser_no: 1,
                extension_version: '1.0.0',
                browser_label: 'Chrome 127',
            }),
        });
        expect(response.status).toBe(200);
    });

    it('enroll rejects without auth', async () => {
        const server = await start_test_server();
        const response = await fetch(`${server.url}/extension/enroll`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ browser_no: 1, extension_version: '1.0.0' }),
        });
        expect(response.status).toBe(401);
    });

    it('AC-2: heartbeat succeeds with instance_token', async () => {
        const server = await start_test_server();
        const enroll_res = await fetch(`${server.url}/extension/enroll`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ browser_no: 1, extension_version: '1.0.0' }),
        });
        const { instance_id, instance_token } = (await enroll_res.json()).data;

        const response = await fetch(`${server.url}/extension/heartbeat`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${instance_token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                instance_id,
                extension_version: '1.0.0',
                active_capture_id: null,
            }),
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ ok: true });
    });

    it('AC-2: command poll succeeds with instance_token', async () => {
        const server = await start_test_server();
        const enroll_res = await fetch(`${server.url}/extension/enroll`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ browser_no: 1, extension_version: '1.0.0' }),
        });
        const { instance_id, instance_token } = (await enroll_res.json()).data;

        await fetch(`${server.url}/extension/heartbeat`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${instance_token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                instance_id,
                extension_version: '1.0.0',
                active_capture_id: null,
            }),
        });

        const response = await fetch(`${server.url}/extension/command`, {
            headers: {
                Authorization: `Bearer ${instance_token}`,
                [INSTANCE_HEADER]: instance_id,
            },
        });
        expect(response.status).toBe(200);
        // No command queued — expect null body
        expect(await response.json()).toBeNull();
    });

    it('AC-2: full command cycle with instance_token', async () => {
        const server = await start_test_server();
        const enroll_res = await fetch(`${server.url}/extension/enroll`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ browser_no: 1, extension_version: '1.0.0' }),
        });
        const { instance_id, instance_token } = (await enroll_res.json()).data;

        await fetch(`${server.url}/extension/heartbeat`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${instance_token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                instance_id,
                extension_version: '1.0.0',
                active_capture_id: null,
            }),
        });

        const cmd_promise = fetch(`${server.url}/mcp/command`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ type: 'captures.list', payload: {} }),
        });

        const command = await take_next_command(server.url, instance_id);
        expect(command.type).toBe('captures.list');

        await fetch(`${server.url}/extension/result`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${instance_token}`,
                'Content-Type': 'application/json',
                [INSTANCE_HEADER]: instance_id,
            },
            body: JSON.stringify({
                command_id: command.command_id,
                ok: true,
                data: { captures: [] },
            }),
        });

        const cmd_result = await (await cmd_promise).json();
        expect(cmd_result.ok).toBe(true);
        expect(cmd_result.data).toEqual({ captures: [] });
    });

    it('AC-3: heartbeat fails with wrong instance_token', async () => {
        const server = await start_test_server();
        const enroll_res = await fetch(`${server.url}/extension/enroll`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ browser_no: 1, extension_version: '1.0.0' }),
        });
        const { instance_id } = (await enroll_res.json()).data;

        const response = await fetch(`${server.url}/extension/heartbeat`, {
            method: 'POST',
            headers: {
                Authorization: 'Bearer ext_wrong_token_123456789',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                instance_id,
                extension_version: '1.0.0',
                active_capture_id: null,
            }),
        });
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({
            ok: false,
            error: { code: 'TOKEN_INVALID', message: 'Invalid token' },
        });
    });

    it('AC-3: command poll fails with wrong instance_token', async () => {
        const server = await start_test_server();
        const enroll_res = await fetch(`${server.url}/extension/enroll`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ browser_no: 1, extension_version: '1.0.0' }),
        });
        const { instance_id } = (await enroll_res.json()).data;

        const response = await fetch(`${server.url}/extension/command`, {
            headers: {
                Authorization: 'Bearer ext_wrong_token_123456789',
                [INSTANCE_HEADER]: instance_id,
            },
        });
        expect(response.status).toBe(401);
    });

    it('AC-3: result post fails with wrong instance_token', async () => {
        const server = await start_test_server();
        const response = await fetch(`${server.url}/extension/result`, {
            method: 'POST',
            headers: {
                Authorization: 'Bearer ext_wrong_token_123456789',
                'Content-Type': 'application/json',
                [INSTANCE_HEADER]: 'irrelevant_id',
            },
            body: JSON.stringify({
                command_id: 'cmd_1',
                ok: true,
                data: {},
            }),
        });
        expect(response.status).toBe(401);
    });

    it('AC-4: same browser_no re-enroll invalidates old token', async () => {
        const server = await start_test_server();
        const enroll1 = await fetch(`${server.url}/extension/enroll`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ browser_no: 1, extension_version: '1.0.0' }),
        });
        const data1 = (await enroll1.json()).data;

        // Old token works
        const hb1 = await fetch(`${server.url}/extension/heartbeat`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${data1.instance_token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                instance_id: data1.instance_id,
                extension_version: '1.0.0',
                active_capture_id: null,
            }),
        });
        expect(hb1.status).toBe(200);

        // Re-enroll same browser_no
        const enroll2 = await fetch(`${server.url}/extension/enroll`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ browser_no: 1, extension_version: '2.0.0' }),
        });
        const data2 = (await enroll2.json()).data;

        // Old token invalid
        const hb_old = await fetch(`${server.url}/extension/heartbeat`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${data1.instance_token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                instance_id: data1.instance_id,
                extension_version: '1.0.0',
                active_capture_id: null,
            }),
        });
        expect(hb_old.status).toBe(401);

        // New token works
        const hb_new = await fetch(`${server.url}/extension/heartbeat`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${data2.instance_token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                instance_id: data2.instance_id,
                extension_version: '2.0.0',
                active_capture_id: null,
            }),
        });
        expect(hb_new.status).toBe(200);
    });

    it('AC-4: status shows only new instance after re-enroll', async () => {
        const server = await start_test_server();

        // Enroll first instance
        const enroll1 = await fetch(`${server.url}/extension/enroll`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ browser_no: 1, extension_version: '1.0.0' }),
        });
        const data1 = (await enroll1.json()).data;
        await fetch(`${server.url}/extension/heartbeat`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${data1.instance_token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                instance_id: data1.instance_id,
                extension_version: '1.0.0',
                active_capture_id: null,
            }),
        });

        // Re-enroll same browser_no
        await fetch(`${server.url}/extension/enroll`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ browser_no: 1, extension_version: '2.0.0' }),
        });

        const status = await (await fetch(`${server.url}/mcp/status`, {
            headers: { Authorization: `Bearer ${token}` },
        })).json() as any;

        // Only one instance with browser_no=1
        const browser1_instances = status.extensions.filter(
            (e: any) => e.browser_no === 1,
        );
        expect(browser1_instances).toHaveLength(1);
    });

    it('AC-5: mcp/status extensions do not expose instance_token', async () => {
        const server = await start_test_server();
        const enroll_res = await fetch(`${server.url}/extension/enroll`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ browser_no: 1, extension_version: '1.0.0' }),
        });
        const { instance_token, instance_id } = (await enroll_res.json()).data;

        await fetch(`${server.url}/extension/heartbeat`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${instance_token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                instance_id,
                extension_version: '1.0.0',
                active_capture_id: null,
            }),
        });

        const status = await (await fetch(`${server.url}/mcp/status`, {
            headers: { Authorization: `Bearer ${token}` },
        })).json() as any;

        for (const ext of status.extensions) {
            expect(ext).not.toHaveProperty('token');
            expect(ext).not.toHaveProperty('instance_token');
            expect(ext).not.toHaveProperty('token_hash');
        }

        const status_json = JSON.stringify(status);
        expect(status_json).not.toContain(instance_token);
    });

    it('instance_token cannot access /mcp/status', async () => {
        const server = await start_test_server();
        const enroll_res = await fetch(`${server.url}/extension/enroll`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ browser_no: 1, extension_version: '1.0.0' }),
        });
        const { instance_token } = (await enroll_res.json()).data;

        const response = await fetch(`${server.url}/mcp/status`, {
            headers: { Authorization: `Bearer ${instance_token}` },
        });
        expect(response.status).toBe(401);
    });

    it('instance_token cannot access /mcp/command', async () => {
        const server = await start_test_server();
        const enroll_res = await fetch(`${server.url}/extension/enroll`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ browser_no: 1, extension_version: '1.0.0' }),
        });
        const { instance_token } = (await enroll_res.json()).data;

        const response = await fetch(`${server.url}/mcp/command`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${instance_token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ type: 'captures.list', payload: {} }),
        });
        expect(response.status).toBe(401);
    });

    it('heartbeat rejects when instance_id does not match token instance', async () => {
        const server = await start_test_server();

        // Enroll two instances
        const e1 = await (
            await fetch(`${server.url}/extension/enroll`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ browser_no: 1, extension_version: '1.0.0' }),
            })
        ).json();
        const e2 = await (
            await fetch(`${server.url}/extension/enroll`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ browser_no: 2, extension_version: '1.0.0' }),
            })
        ).json();

        // Use instance 1's token but claim instance 2's id
        const response = await fetch(`${server.url}/extension/heartbeat`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${e1.data.instance_token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                instance_id: e2.data.instance_id,
                extension_version: '1.0.0',
                active_capture_id: null,
            }),
        });
        expect(response.status).toBe(401);
        expect((await response.json()).error.code).toBe('TOKEN_INVALID');
    });

    it('/extension/discover returns bridge info without auth', async () => {
        const server = await start_test_server();
        const response = await fetch(`${server.url}/extension/discover`);
        expect(response.status).toBe(200);
        const json = await response.json();
        expect(json.ok).toBe(true);
        expect(json.pairable).toBe(true);
        expect(typeof json.bridge_version).toBe('string');
        expect(json.enroll_path).toBe('/extension/enroll');
    });

    // ─── T0009 local pair approval S1 ───

    it('AC-1: S1 default rejects extension enroll without pairing', async () => {
        const server = await start_test_server();
        const response = await fetch(`${server.url}/extension/enroll`, {
            method: 'POST',
            headers: {
                Origin: 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ browser_no: 1, extension_version: '1.0.0' }),
        });
        expect(response.status).toBe(403);
        const json = await response.json();
        expect(json.ok).toBe(false);
        expect(json.error.code).toBe('PAIRING_REQUIRED');
        expect(json.error.message).toContain('pair');
    });

    it('AC-1: MCP token enroll bypasses pairing check', async () => {
        const server = await start_test_server();
        const response = await fetch(`${server.url}/extension/enroll`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ browser_no: 1, extension_version: '1.0.0' }),
        });
        expect(response.status).toBe(200);
        const json = await response.json();
        expect(json.ok).toBe(true);
        expect(typeof json.data.instance_token).toBe('string');
    });

    it('AC-1: S0 dev_mode allows extension enroll without pairing', async () => {
        const server = await start_test_server({ dev_mode: true });
        const response = await fetch(`${server.url}/extension/enroll`, {
            method: 'POST',
            headers: {
                Origin: 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ browser_no: 1, extension_version: '1.0.0' }),
        });
        expect(response.status).toBe(200);
        const json = await response.json();
        expect(json.ok).toBe(true);
        expect(typeof json.data.instance_token).toBe('string');
    });

    it('pair status returns closed initially', async () => {
        const server = await start_test_server();
        const response = await fetch(`${server.url}/pair/status`);
        expect(response.status).toBe(200);
        const json = await response.json();
        expect(json.ok).toBe(true);
        expect(json.data.open).toBe(false);
    });

    it('POST /pair/open opens pairing and returns code', async () => {
        const server = await start_test_server();
        const response = await fetch(`${server.url}/pair/open`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ duration_minutes: 5 }),
        });
        expect(response.status).toBe(200);
        const json = await response.json();
        expect(json.ok).toBe(true);
        expect(json.data.pairing_code).toMatch(/^\d{6}$/);
        expect(typeof json.data.expires_at).toBe('number');
        expect(json.data.expires_at).toBeGreaterThan(Date.now());
    });

    it('POST /pair/open requires MCP auth', async () => {
        const server = await start_test_server();
        const response = await fetch(`${server.url}/pair/open`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        expect(response.status).toBe(401);
    });

    it('POST /pair/close closes pairing', async () => {
        const server = await start_test_server();
        await fetch(`${server.url}/pair/open`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),
        });
        await fetch(`${server.url}/pair/close`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
        });
        const status = await (await fetch(`${server.url}/pair/status`)).json();
        expect(status.data.open).toBe(false);
    });

    it('POST /pair/close requires MCP auth', async () => {
        const server = await start_test_server();
        const response = await fetch(`${server.url}/pair/close`, {
            method: 'POST',
        });
        expect(response.status).toBe(401);
    });

    it('AC-2: pair approve allows enroll for approved browser_no', async () => {
        const server = await start_test_server();
        await fetch(`${server.url}/pair/open`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),
        });
        await fetch(`${server.url}/pair/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ browser_no: 3 }),
        });
        const response = await fetch(`${server.url}/extension/enroll`, {
            method: 'POST',
            headers: {
                Origin: 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ browser_no: 3, extension_version: '1.0.0' }),
        });
        expect(response.status).toBe(200);
        const json = await response.json();
        expect(json.ok).toBe(true);
        expect(json.data.browser_no).toBe(3);
        expect(typeof json.data.instance_token).toBe('string');
    });

    it('AC-2: non-approved browser_no still rejected after approve for another', async () => {
        const server = await start_test_server();
        await fetch(`${server.url}/pair/open`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),
        });
        await fetch(`${server.url}/pair/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ browser_no: 3 }),
        });
        const response = await fetch(`${server.url}/extension/enroll`, {
            method: 'POST',
            headers: {
                Origin: 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ browser_no: 4, extension_version: '1.0.0' }),
        });
        expect(response.status).toBe(403);
        expect((await response.json()).error.code).toBe('PAIRING_REQUIRED');
    });

    it('AC-3: enroll with correct pairing_code succeeds', async () => {
        const server = await start_test_server();
        const open_res = await fetch(`${server.url}/pair/open`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),
        });
        const { pairing_code } = (await open_res.json()).data;
        const response = await fetch(`${server.url}/extension/enroll`, {
            method: 'POST',
            headers: {
                Origin: 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ browser_no: 5, extension_version: '1.0.0', pairing_code }),
        });
        expect(response.status).toBe(200);
        const json = await response.json();
        expect(json.ok).toBe(true);
        expect(json.data.browser_no).toBe(5);
    });

    it('AC-3: enroll with wrong pairing_code is rejected', async () => {
        const server = await start_test_server();
        await fetch(`${server.url}/pair/open`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),
        });
        const response = await fetch(`${server.url}/extension/enroll`, {
            method: 'POST',
            headers: {
                Origin: 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ browser_no: 1, extension_version: '1.0.0', pairing_code: '000000' }),
        });
        expect(response.status).toBe(403);
        expect((await response.json()).error.code).toBe('PAIRING_REQUIRED');
    });

    it('AC-3: enroll with pairing_code after pairing expires is rejected', async () => {
        const server = await start_test_server();
        const open_res = await fetch(`${server.url}/pair/open`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ duration_minutes: 0 }),
        });
        const { pairing_code } = (await open_res.json()).data;
        await new Promise((r) => setTimeout(r, 10));
        const response = await fetch(`${server.url}/extension/enroll`, {
            method: 'POST',
            headers: {
                Origin: 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ browser_no: 1, extension_version: '1.0.0', pairing_code }),
        });
        expect(response.status).toBe(403);
    });

    it('AC-4: existing heartbeat with valid token bypasses pairing', async () => {
        const server = await start_test_server();
        const enroll_res = await fetch(`${server.url}/extension/enroll`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ browser_no: 1, extension_version: '1.0.0' }),
        });
        const { instance_id, instance_token } = (await enroll_res.json()).data;
        const response = await fetch(`${server.url}/extension/heartbeat`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${instance_token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ instance_id, extension_version: '1.0.0', active_capture_id: null }),
        });
        expect(response.status).toBe(200);
    });

    it('approve reject when pairing is closed', async () => {
        const server = await start_test_server();
        const response = await fetch(`${server.url}/pair/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ browser_no: 1 }),
        });
        expect(response.status).toBe(403);
        expect((await response.json()).error.code).toBe('PAIRING_REQUIRED');
    });

    it('pair page returns HTML', async () => {
        const server = await start_test_server();
        const response = await fetch(`${server.url}/pair`);
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('text/html');
    });
});
