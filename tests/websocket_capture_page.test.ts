// @vitest-environment jsdom
// tests/websocket_capture_page.test.ts
// Tests for content/websocket_capture.ts — page-level WebSocket monkey-patch capture.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { start_websocket_capture, stop_websocket_capture } from '../src/content/websocket_capture';

const SIGNAL = '__capture_all_ws__';
const CAPTURE_ID = 'cap_ws_page';
const START_EPOCH = 1700000000000;

function post_ws_message(
    ws_url: string,
    direction: 'sent' | 'received',
    data_preview: string | null,
    data_bytes: number,
    data_status: 'captured' | 'too_large' | 'binary',
): void {
    window.dispatchEvent(new MessageEvent('message', {
        origin: window.location.origin,
        source: window,
        data: { source: SIGNAL, ws_url, direction, data_preview, data_bytes, data_status },
    }));
}

describe('websocket_capture (page-level)', () => {
    let sender: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        stop_websocket_capture();
        sender = vi.fn();
    });

    it('sent postMessage → type=ws_message, direction=sent', () => {
        start_websocket_capture(sender, CAPTURE_ID, START_EPOCH);
        post_ws_message('wss://example.com/ws', 'sent', 'hello', 5, 'captured');

        expect(sender).toHaveBeenCalledTimes(1);
        const event = sender.mock.calls[0][0];
        expect(event.category).toBe('network');
        expect(event.type).toBe('ws_message');
        expect(event.capture_id).toBe(CAPTURE_ID);
        expect(event.ws_url).toBe('wss://example.com/ws');
        expect(event.direction).toBe('sent');
        expect(event.data_preview).toBe('hello');
        expect(event.data_bytes).toBe(5);
        expect(event.data_status).toBe('captured');
    });

    it('received postMessage → direction=received', () => {
        start_websocket_capture(sender, CAPTURE_ID, START_EPOCH);
        post_ws_message('wss://chat.example.com', 'received', '{"ok":true}', 11, 'captured');

        expect(sender).toHaveBeenCalledTimes(1);
        const event = sender.mock.calls[0][0];
        expect(event.direction).toBe('received');
        expect(event.ws_url).toBe('wss://chat.example.com');
        expect(event.data_preview).toBe('{"ok":true}');
    });

    it('data_status=too_large → data_preview=null', () => {
        start_websocket_capture(sender, CAPTURE_ID, START_EPOCH);
        post_ws_message('wss://example.com', 'received', null, 1024, 'too_large');

        expect(sender).toHaveBeenCalledTimes(1);
        const event = sender.mock.calls[0][0];
        expect(event.data_status).toBe('too_large');
        expect(event.data_preview).toBeNull();
        expect(event.data_bytes).toBe(1024);
    });

    it('stop 后不发送', () => {
        start_websocket_capture(sender, CAPTURE_ID, START_EPOCH);
        stop_websocket_capture();
        post_ws_message('wss://example.com', 'sent', 'ignored', 7, 'captured');

        expect(sender).not.toHaveBeenCalled();
    });

    it('source 不是 SIGNAL 的消息被忽略', () => {
        start_websocket_capture(sender, CAPTURE_ID, START_EPOCH);
        window.dispatchEvent(new MessageEvent('message', {
            origin: window.location.origin,
            source: window,
            data: { source: '__other_signal__', ws_url: 'wss://x', direction: 'sent', data_preview: 'nope', data_bytes: 4, data_status: 'captured' },
        }));
        window.dispatchEvent(new MessageEvent('message', {
            origin: window.location.origin,
            source: window,
            data: null,
        }));

        expect(sender).not.toHaveBeenCalled();
    });

    it('binary data_status → data_preview=null', () => {
        start_websocket_capture(sender, CAPTURE_ID, START_EPOCH);
        post_ws_message('wss://example.com', 'received', null, 512, 'binary');

        expect(sender).toHaveBeenCalledTimes(1);
        const event = sender.mock.calls[0][0];
        expect(event.data_status).toBe('binary');
        expect(event.data_preview).toBeNull();
        expect(event.data_bytes).toBe(512);
    });
});
