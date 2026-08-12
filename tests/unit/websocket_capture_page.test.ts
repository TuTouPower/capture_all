// @vitest-environment jsdom
// tests/websocket_capture_page.test.ts
// Tests for content/websocket_capture.ts — page-level WebSocket monkey-patch capture.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { start_websocket_capture, stop_websocket_capture, _set_nonce_for_test, _set_secret_for_test } from '../../src/extension/content/websocket_capture';
import { sign_message, TEST_SECRET } from '../support/helpers/signed_message';

const SIGNAL = '__capture_all_ws__';
const NONCE = 'test-nonce';
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
        data: sign_message({ source: SIGNAL, nonce: NONCE, ws_url, direction, data_preview, data_bytes, data_status }),
    }));
}

describe('websocket_capture (page-level)', () => {
    let sender: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        stop_websocket_capture();
        _set_nonce_for_test(NONCE);
        _set_secret_for_test(TEST_SECRET);
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

    it('无 nonce 的伪造 SIGNAL 消息被拒', () => {
        start_websocket_capture(sender, CAPTURE_ID, START_EPOCH);
        window.dispatchEvent(new MessageEvent('message', {
            origin: window.location.origin,
            source: window,
            data: { source: SIGNAL, ws_url: 'wss://x', direction: 'sent', data_preview: 'f', data_bytes: 1, data_status: 'captured' },
        }));
        expect(sender).not.toHaveBeenCalled();
    });

    it('错误 nonce 的伪造 SIGNAL 消息被拒', () => {
        start_websocket_capture(sender, CAPTURE_ID, START_EPOCH);
        window.dispatchEvent(new MessageEvent('message', {
            origin: window.location.origin,
            source: window,
            data: { source: SIGNAL, nonce: 'wrong', ws_url: 'wss://x', direction: 'sent', data_preview: 'f', data_bytes: 1, data_status: 'captured' },
        }));
        expect(sender).not.toHaveBeenCalled();
    });

    it('正确 nonce 但签名缺失的消息被拒（T121）', () => {
        start_websocket_capture(sender, CAPTURE_ID, START_EPOCH);
        window.dispatchEvent(new MessageEvent('message', {
            origin: window.location.origin,
            source: window,
            data: { source: SIGNAL, nonce: NONCE, ws_url: 'wss://x', direction: 'sent', data_preview: 'f', data_bytes: 1, data_status: 'captured' },
        }));
        expect(sender).not.toHaveBeenCalled();
    });

    it('stop 后不发送', () => {
        start_websocket_capture(sender, CAPTURE_ID, START_EPOCH);
        stop_websocket_capture();
        post_ws_message('wss://example.com', 'sent', 'ignored', 7, 'captured');

        expect(sender).not.toHaveBeenCalled();
    });

    // H3: content 侧 ws_url/消息预览按配置脱敏（与 background CDP ws 路径一致）
    it('redact_data=true 时 ws_url query 脱敏且 data_preview 置 [REDACTED]', () => {
        start_websocket_capture(sender, CAPTURE_ID, START_EPOCH, 0, { redact_data: true, redact_url_query: true });
        post_ws_message('wss://example.com/ws?token=SECRET&id=1', 'received', 'plain message', 13, 'captured');

        expect(sender).toHaveBeenCalledTimes(1);
        const event = sender.mock.calls[0][0];
        expect(event.url_status).toBe('redacted');
        expect(event.ws_url).toContain('%5BREDACTED%5D');
        expect(event.ws_url).not.toContain('SECRET');
        expect(event.ws_url).toContain('id=1');
        expect(event.data_preview).toBe('[REDACTED]');
        // 元数据保留
        expect(event.direction).toBe('received');
        expect(event.data_bytes).toBe(13);
    });

    it('redact_data=true 但 redact_url_query=false 时 ws_url 不脱敏、data_preview 仍脱敏', () => {
        start_websocket_capture(sender, CAPTURE_ID, START_EPOCH, 0, { redact_data: true, redact_url_query: false });
        post_ws_message('wss://example.com/ws?token=SECRET', 'sent', 'raw msg', 7, 'captured');

        expect(sender).toHaveBeenCalledTimes(1);
        const event = sender.mock.calls[0][0];
        expect(event.url_status).toBe('captured');
        expect(event.ws_url).toBe('wss://example.com/ws?token=SECRET');
        expect(event.data_preview).toBe('[REDACTED]');
    });

    it('redact_data=false 时行为与修前一致（不脱敏）', () => {
        start_websocket_capture(sender, CAPTURE_ID, START_EPOCH, 0, { redact_data: false, redact_url_query: true });
        post_ws_message('wss://example.com/ws?token=SECRET', 'sent', 'plain', 5, 'captured');

        expect(sender).toHaveBeenCalledTimes(1);
        const event = sender.mock.calls[0][0];
        expect(event.ws_url).toBe('wss://example.com/ws?token=SECRET');
        expect(event.data_preview).toBe('plain');
        expect(event.url_status).toBe('captured');
    });

    // code_f001: binary/too_large 消息原本 data_preview=null，redact 开启后不混淆为 '[REDACTED]'
    it('redact_data=true 时 binary 消息 data_preview 保持 null（非 [REDACTED]）', () => {
        start_websocket_capture(sender, CAPTURE_ID, START_EPOCH, 0, { redact_data: true, redact_url_query: true });
        post_ws_message('wss://example.com/binary', 'received', null, 512, 'binary');

        expect(sender).toHaveBeenCalledTimes(1);
        const event = sender.mock.calls[0][0];
        expect(event.data_preview).toBeNull();
        expect(event.data_status).toBe('binary');
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
