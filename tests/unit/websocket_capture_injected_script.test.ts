// @vitest-environment jsdom
// tests/unit/websocket_capture_injected_script.test.ts
// 验证 PAGE_SCRIPT 注入脚本行为：单 listener、UTF-8 字节、removeEventListener 透传
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { start_websocket_capture, stop_websocket_capture, build_page_script, _set_nonce_for_test, _set_secret_for_test } from '../../src/extension/content/websocket_capture';
import { TEST_SECRET } from '../support/helpers/signed_message';
import { verify_payload } from '../../src/extension/content/content_hmac';

const SIGNAL = '__capture_all_ws__';
const NONCE = 'test-nonce';

class MockOriginWS {
    static instances: MockOriginWS[] = [];
    url: string;
    message_listeners: Array<{ listener: EventListenerOrEventListenerObject; options?: any }> = [];
    send = vi.fn();

    constructor(url: string) {
        this.url = url;
        MockOriginWS.instances.push(this);
    }

    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: any): void {
        if (type === 'message') {
            this.message_listeners.push({ listener, options });
        }
    }

    removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: any): void {
        if (type !== 'message') return;
        const idx = this.message_listeners.findIndex(
            (e) => e.listener === listener && JSON.stringify(e.options) === JSON.stringify(options),
        );
        if (idx >= 0) this.message_listeners.splice(idx, 1);
    }

    dispatch_message(data: unknown): void {
        const ev = new MessageEvent('message', { data });
        for (const { listener } of this.message_listeners) {
            if (typeof listener === 'function') (listener as (e: MessageEvent) => void)(ev);
            else listener.handleEvent(ev);
        }
    }
}

describe('websocket_capture 注入脚本', () => {
    let sender: ReturnType<typeof vi.fn>;
    let posted_messages: any[];
    const original_WS = (globalThis as any).WebSocket;

    beforeEach(() => {
        stop_websocket_capture();
        sender = vi.fn();
        posted_messages = [];
        MockOriginWS.instances = [];
        // 重置注入 guard，让 PAGE_SCRIPT 每个 test 重新 patch
        (window as any).__capture_all_ws_installed__ = false;
        (globalThis as any).WebSocket = MockOriginWS as any;
        vi.spyOn(window, 'postMessage').mockImplementation((data: any) => {
            if (data && data.source === SIGNAL) posted_messages.push(data);
        });
        // 注入脚本发送的每条消息必须带正确 nonce（T097：接收端校验）
        vi.spyOn(window, 'addEventListener').mockImplementation(() => {});
        const orig_post = posted_messages.push.bind(posted_messages);
        posted_messages.push = (m: any) => {
            expect(m.nonce).toBe(NONCE);
            return orig_post(m);
        };
        // T097: 注入脚本从 window 动态读 nonce，测试先设 window 变量
        (window as any).__capture_all_ws_nonce__ = NONCE;
        // eslint-disable-next-line no-eval
        eval(build_page_script(TEST_SECRET));
        _set_nonce_for_test(NONCE);
        _set_secret_for_test(TEST_SECRET);
        start_websocket_capture(sender, 'cap1', Date.now(), 1);
    });

    afterEach(() => {
        stop_websocket_capture();
        (globalThis as any).WebSocket = original_WS;
        vi.restoreAllMocks();
    });

    it('同一 message 仅采集一次（页面注册多个 addEventListener）', () => {
        const PatchedWS = (globalThis as any).WebSocket;
        const ws = new PatchedWS('wss://example.com/ws');
        ws.addEventListener('message', () => {});
        ws.addEventListener('message', () => {});
        (ws as any).dispatch_message('hello');

        const received_posts = posted_messages.filter((m) => m.direction === 'received');
        expect(received_posts.length).toBe(1);
        expect(received_posts[0].data_preview).toBe('hello');
    });

    it('removeEventListener 透传：移除后不再被调', () => {
        const PatchedWS = (globalThis as any).WebSocket;
        const ws = new PatchedWS('wss://example.com/ws');
        const handler = vi.fn();
        ws.addEventListener('message', handler);
        ws.removeEventListener('message', handler);
        (ws as any).dispatch_message('after-remove');
        expect(handler).not.toHaveBeenCalled();
    });

    it('字符串 data_bytes 按 UTF-8 字节计（中文=6）', () => {
        const PatchedWS = (globalThis as any).WebSocket;
        const ws = new PatchedWS('wss://example.com/ws');
        (ws as any).dispatch_message('中文');
        const received = posted_messages.find((m) => m.direction === 'received');
        expect(received).toBeDefined();
        expect(received.data_bytes).toBe(6);
    });

    it('send 调用产生 sent post', () => {
        const PatchedWS = (globalThis as any).WebSocket;
        const ws = new PatchedWS('wss://example.com/ws');
        ws.send('ping');
        const sent = posted_messages.find((m) => m.direction === 'sent');
        expect(sent).toBeDefined();
        expect(sent.data_preview).toBe('ping');
    });

    it('重注入后注入脚本持新 SECRET，旧 SECRET 签名失效（ws 注入脚本级，p031）', () => {
        // 首轮（beforeEach 已注入 TEST_SECRET）：send 消息签名匹配 TEST_SECRET
        const PatchedWS1 = (globalThis as any).WebSocket;
        const ws1 = new PatchedWS1('wss://example.com/ws1');
        ws1.send('one');
        const sent1 = posted_messages.find((m) => m.direction === 'sent');
        expect(sent1).toBeDefined();
        expect(verify_payload(TEST_SECRET, sent1)).toBe(true);

        // 重注入（已安装 → 还原上次 hook 后重装，持 secret-w2）
        (window as any).__capture_all_ws_installed__ = true;
        // eslint-disable-next-line no-eval
        eval(build_page_script('secret-w2'));

        const PatchedWS2 = (globalThis as any).WebSocket;
        const ws2 = new PatchedWS2('wss://example.com/ws2');
        ws2.send('two');
        const sent2 = posted_messages.find((m) => m.direction === 'sent' && m.ws_url === 'wss://example.com/ws2');
        expect(sent2).toBeDefined();
        expect(verify_payload('secret-w2', sent2)).toBe(true);
        // 旧 SECRET 不再匹配（跨采集旧签名失效）
        expect(verify_payload(TEST_SECRET, sent2)).toBe(false);
    });
});
