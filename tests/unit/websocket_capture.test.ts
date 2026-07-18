// tests/websocket_capture.test.ts
// WebSocket CDP event capture tests.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mock_chrome_debugger } from '../support/__mocks__/chrome_debugger';

(globalThis as any).chrome = {
    ...(globalThis as any).chrome || {},
    dbg: mock_chrome_debugger,
    debugger: mock_chrome_debugger,
    webRequest: {
        onBeforeRequest: { addListener: vi.fn(), removeListener: vi.fn() },
        onBeforeSendHeaders: { addListener: vi.fn(), removeListener: vi.fn() },
        onHeadersReceived: { addListener: vi.fn(), removeListener: vi.fn() },
        onCompleted: { addListener: vi.fn(), removeListener: vi.fn() },
        onErrorOccurred: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    storage: {
        local: {
            get: vi.fn().mockResolvedValue({}),
            set: vi.fn().mockResolvedValue(undefined),
        },
    },
    runtime: {
        getManifest: vi.fn().mockReturnValue({ version: '1.0.0' }),
        onInstalled: { addListener: vi.fn() },
        onMessage: { addListener: vi.fn() },
    },
    tabs: {
        query: vi.fn().mockResolvedValue([]),
        get: vi.fn().mockResolvedValue({ id: 1, url: 'https://example.com' }),
        sendMessage: vi.fn().mockResolvedValue(undefined),
        onActivated: { addListener: vi.fn() },
        onUpdated: { addListener: vi.fn() },
        onRemoved: { addListener: vi.fn() },
        onCreated: { addListener: vi.fn() },
    },
};

import {
    start_network_capture,
    stop_network_capture,
    enable_response_body_capture,
} from '../../src/extension/background/network_capture';

function make_cfg(overrides: Record<string, any> = {}) {
    return {
        redact_sensitive_headers: false,
        redact_url_query: false,
        redact_data: false,
        capture_request_body: false,
        capture_response_body: true,
        max_body_capture_bytes: 104857600,
        inline_text_max_bytes: 32768,
        ...overrides,
    };
}

describe('WebSocket capture', () => {
    let emitted: Array<{ event: any; data: any }>;

    beforeEach(() => {
        try { stop_network_capture(); } catch { /* not started */ }
        mock_chrome_debugger.reset();
        vi.clearAllMocks();
        emitted = [];
    });

    async function setup_capture(cfg_overrides?: Record<string, any>) {
        start_network_capture(
            'test_ws',
            1700000000000,
            make_cfg(cfg_overrides),
            1,
            (payload: any) => emitted.push(payload),
        );
        await enable_response_body_capture(1, false);
    }

    it('emits network_request for webSocketCreated (connecting)', async () => {
        await setup_capture();

        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.webSocketCreated',
            { requestId: 'ws_1', url: 'wss://echo.example.com/ws' },
        );

        const conn = emitted.find(e => e.data?.resource_type === 'websocket');
        expect(conn).toBeDefined();
        expect(conn!.data.url).toBe('wss://echo.example.com/ws');
        expect(conn!.data.ws_status).toBe('connecting');
        expect(conn!.data.ws_connection_id).toBe('ws_1');
    });

    it('emits ws_frame events for frameSent and frameReceived', async () => {
        await setup_capture();

        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.webSocketCreated',
            { requestId: 'ws_1', url: 'wss://echo.example.com/ws' },
        );

        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.webSocketFrameSent',
            { requestId: 'ws_1', timestamp: 1000, response: { opcode: 1, mask: true, payloadData: 'hello' } },
        );

        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.webSocketFrameReceived',
            { requestId: 'ws_1', timestamp: 1001, response: { opcode: 1, mask: false, payloadData: 'world' } },
        );

        const frames = emitted.filter(e => e.event?.type === 'ws_frame');
        expect(frames).toHaveLength(2);

        expect(frames[0].data.direction).toBe('sent');
        expect(frames[0].data.payload).toBe('hello');
        expect(frames[0].data.ws_connection_id).toBe('ws_1');

        expect(frames[1].data.direction).toBe('received');
        expect(frames[1].data.payload).toBe('world');
    });

    it('updates connection status on handshake events', async () => {
        await setup_capture();

        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.webSocketCreated',
            { requestId: 'ws_1', url: 'wss://echo.example.com/ws' },
        );

        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.webSocketHandshakeResponseReceived',
            { requestId: 'ws_1', response: { status: 101, headers: { 'Upgrade': 'websocket' } } },
        );

        const conn = emitted.filter(e => e.data?.resource_type === 'websocket');
        expect(conn.length).toBeGreaterThanOrEqual(2);
        const open = conn[conn.length - 1];
        expect(open.data.ws_status).toBe('open');
        expect(open.data.status_code).toBe(101);
    });

    it('emits ws_frame error and closes connection', async () => {
        await setup_capture();

        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.webSocketCreated',
            { requestId: 'ws_1', url: 'wss://echo.example.com/ws' },
        );

        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.webSocketFrameError',
            { requestId: 'ws_1', timestamp: 1002, errorMessage: 'Protocol error' },
        );

        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.webSocketClosed',
            { requestId: 'ws_1', timestamp: 1003 },
        );

        const error_frame = emitted.find(e => e.event?.type === 'ws_frame' && e.data?.direction === 'error');
        expect(error_frame).toBeDefined();
        expect(error_frame!.data.error_message).toBe('Protocol error');

        const closed_conn = emitted.filter(e => e.data?.resource_type === 'websocket');
        const last = closed_conn[closed_conn.length - 1];
        expect(last.data.ws_status).toBe('closed');
    });

    it('truncates large payload per max_body_capture_bytes', async () => {
        await setup_capture({ max_body_capture_bytes: 10 });

        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.webSocketCreated',
            { requestId: 'ws_1', url: 'wss://echo.example.com/ws' },
        );

        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.webSocketFrameReceived',
            { requestId: 'ws_1', timestamp: 1000, response: { opcode: 1, mask: false, payloadData: 'a'.repeat(100) } },
        );

        const frame = emitted.find(e => e.event?.type === 'ws_frame');
        expect(frame).toBeDefined();
        expect(frame!.data.payload_status).toBe('too_large');
        expect(frame!.data.payload!.length).toBeLessThanOrEqual(10);
    });

    it('handles frame with no payloadData (control frame, undefined)', async () => {
        await setup_capture();

        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.webSocketCreated',
            { requestId: 'ws_1', url: 'wss://echo.example.com/ws' },
        );

        // Ping frame - no payloadData field
        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.webSocketFrameReceived',
            { requestId: 'ws_1', timestamp: 1000, response: { opcode: 9, mask: false } },
        );

        const frames = emitted.filter(e => e.event?.type === 'ws_frame');
        expect(frames).toHaveLength(1);
        expect(frames[0].data.opcode).toBe(9);
        expect(frames[0].data.payload).toBeNull();
        expect(frames[0].data.payload_status).toBe('captured');
        expect(frames[0].data.payload_bytes).toBeNull();
    });

    it('handles pong frame (opcode 10) with no payload', async () => {
        await setup_capture();

        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.webSocketCreated',
            { requestId: 'ws_1', url: 'wss://echo.example.com/ws' },
        );

        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.webSocketFrameSent',
            { requestId: 'ws_1', timestamp: 1000, response: { opcode: 10, mask: true } },
        );

        const frames = emitted.filter(e => e.event?.type === 'ws_frame');
        expect(frames).toHaveLength(1);
        expect(frames[0].data.opcode).toBe(10);
        expect(frames[0].data.payload).toBeNull();
        expect(frames[0].data.direction).toBe('sent');
    });

    it('handles binary frame (opcode 2) with base64 payload', async () => {
        await setup_capture();

        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.webSocketCreated',
            { requestId: 'ws_1', url: 'wss://echo.example.com/ws' },
        );

        const b64 = btoa('binary data here');
        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.webSocketFrameReceived',
            { requestId: 'ws_1', timestamp: 1000, response: { opcode: 2, mask: false, payloadData: b64 } },
        );

        const frames = emitted.filter(e => e.event?.type === 'ws_frame');
        expect(frames).toHaveLength(1);
        expect(frames[0].data.opcode).toBe(2);
        expect(frames[0].data.payload_encoding).toBe('base64');
        expect(frames[0].data.payload).toBe(b64);
    });

    it('preserves empty-string payload (opcode 1 text frame keepalive)', async () => {
        await setup_capture();

        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.webSocketCreated',
            { requestId: 'ws_1', url: 'wss://echo.example.com/ws' },
        );

        // 空字符串是合法 payload（心跳/keepalive 文本帧），不能被 || null 吞掉
        mock_chrome_debugger.emit_event(
            { tabId: 1 },
            'Network.webSocketFrameReceived',
            { requestId: 'ws_1', timestamp: 1000, response: { opcode: 1, mask: false, payloadData: '' } },
        );

        const frames = emitted.filter(e => e.event?.type === 'ws_frame');
        expect(frames).toHaveLength(1);
        expect(frames[0].data.payload).toBe('');
        expect(frames[0].data.payload_bytes).toBe(0);
        expect(frames[0].data.payload_status).toBe('captured');
        expect(frames[0].data.payload_encoding).toBe('utf8');
    });
});
