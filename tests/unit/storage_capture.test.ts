// @vitest-environment jsdom
// tests/unit/storage_capture.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { CaptureEvent, StorageChangeData } from '../../src/shared/types';
import { start_storage_capture, stop_storage_capture, _set_nonce_for_test, _set_secret_for_test, build_page_script } from '../../src/extension/content/storage_capture';
import { verify_payload } from '../../src/extension/content/content_hmac';
import { sign_message, sign_message_with_secret, TEST_SECRET } from '../support/helpers/signed_message';

const SIGNAL = '__capture_all_storage__';
const NONCE = 'test-nonce';

describe('storage_capture', () => {
    let events: Array<CaptureEvent & StorageChangeData>;
    let sender: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        events = [];
        sender = vi.fn((evt) => events.push(evt as CaptureEvent & StorageChangeData));
        stop_storage_capture();
        _set_nonce_for_test(NONCE);
        _set_secret_for_test(TEST_SECRET);
    });

    afterEach(() => {
        stop_storage_capture();
        _set_secret_for_test(null);
    });

    function post_message(payload: Record<string, unknown>): void {
        window.dispatchEvent(new MessageEvent('message', {
            origin: window.location.origin,
            source: window,
            data: sign_message({ source: SIGNAL, nonce: NONCE, ...payload }),
        }));
    }

    it('事件 tab_id 使用传入的 tab_id', () => {
        start_storage_capture(sender, 'cap1', Date.now(), 42);
        post_message({ storage_type: 'local', action: 'set', key: 'foo', value_length: 5 });
        expect(sender).toHaveBeenCalledTimes(1);
        expect(events[0].tab_id).toBe(42);
    });

    it('t152 AC-004: payload 在 event.data（第二参数），事件顶层不混入 data 字段', () => {
        start_storage_capture(sender, 'cap1', Date.now(), 42);
        post_message({ storage_type: 'session', action: 'remove', key: 'bar', value_length: 0 });
        expect(sender).toHaveBeenCalledTimes(1);
        const [event, data] = sender.mock.calls[0];
        expect(event.type).toBe('storage_change');
        expect(event.category).toBe('storage');
        expect(data.storage_type).toBe('session');
        expect(data.action).toBe('remove');
        expect(data.key).toBe('bar');
        expect(event.storage_type).toBeUndefined();
        expect(event.key).toBeUndefined();
    });

    // B3-L5: token/secret/password 匹配的 key 名脱敏为 [REDACTED]
    it('redacts sensitive storage key names (B3-L5)', () => {
        start_storage_capture(sender, 'cap1', Date.now(), 42);
        post_message({ storage_type: 'local', action: 'set', key: 'auth_token', value_length: 5 });
        post_message({ storage_type: 'local', action: 'set', key: 'password_hash', value_length: 5 });
        post_message({ storage_type: 'local', action: 'set', key: 'api_key', value_length: 5 });
        post_message({ storage_type: 'local', action: 'set', key: 'regular_key', value_length: 5 });
        expect(sender).toHaveBeenCalledTimes(4);
        const keys = sender.mock.calls.map(([, data]) => data.key);
        expect(keys[0]).toBe('[REDACTED]');
        expect(keys[1]).toBe('[REDACTED]');
        expect(keys[2]).toBe('[REDACTED]');
        expect(keys[3]).toBe('regular_key');
    });

    it('未传 tab_id 默认 0（向后兼容性参考，新调用必须传值）', () => {
        // 即使未来签名要求 tab_id，仍验证默认行为合理
        start_storage_capture(sender, 'cap1', Date.now(), 0);
        post_message({ storage_type: 'local', action: 'set', key: 'foo', value_length: 5 });
        expect(events[0].tab_id).toBe(0);
    });

    it('无 nonce 的伪造 SIGNAL 消息被拒', () => {
        start_storage_capture(sender, 'cap1', Date.now(), 7);
        window.dispatchEvent(new MessageEvent('message', {
            origin: window.location.origin,
            source: window,
            data: { source: SIGNAL, storage_type: 'local', action: 'set', key: 'x', value_length: 1 },
        }));
        expect(sender).not.toHaveBeenCalled();
    });

    it('错误 nonce 的伪造 SIGNAL 消息被拒', () => {
        start_storage_capture(sender, 'cap1', Date.now(), 7);
        window.dispatchEvent(new MessageEvent('message', {
            origin: window.location.origin,
            source: window,
            data: { source: SIGNAL, nonce: 'wrong', storage_type: 'local', action: 'set', key: 'x', value_length: 1 },
        }));
        expect(sender).not.toHaveBeenCalled();
    });

    it('正确 nonce 但签名缺失的消息被拒（T121）', () => {
        start_storage_capture(sender, 'cap1', Date.now(), 7);
        window.dispatchEvent(new MessageEvent('message', {
            origin: window.location.origin,
            source: window,
            data: { source: SIGNAL, nonce: NONCE, storage_type: 'local', action: 'set', key: 'x', value_length: 1 },
        }));
        expect(sender).not.toHaveBeenCalled();
    });

    it('stop 后不再发送', () => {
        start_storage_capture(sender, 'cap1', Date.now(), 7);
        stop_storage_capture();
        post_message({ storage_type: 'local', action: 'set', key: 'foo', value_length: 5 });
        expect(sender).not.toHaveBeenCalled();
    });

    it('stop→start secret 旋转后新签名接受、旧签名被拒（T121 storage 通道）', () => {
        start_storage_capture(sender, 'cap1', Date.now(), 1);
        stop_storage_capture();
        _set_secret_for_test('secret-2');
        start_storage_capture(sender, 'cap2', Date.now(), 1);
        // 新 secret 签名的消息被接受（旋转后采集不中断）
        window.dispatchEvent(new MessageEvent('message', {
            origin: window.location.origin,
            source: window,
            data: sign_message_with_secret({ source: SIGNAL, nonce: NONCE, storage_type: 'local', action: 'set', key: 'k', value_length: 1 }, 'secret-2'),
        }));
        expect(sender).toHaveBeenCalledTimes(1);
        // 旧 secret 签名被拒（跨采集旧签名失效）
        window.dispatchEvent(new MessageEvent('message', {
            origin: window.location.origin,
            source: window,
            data: sign_message_with_secret({ source: SIGNAL, nonce: NONCE, storage_type: 'local', action: 'set', key: 'k2', value_length: 1 }, TEST_SECRET),
        }));
        expect(sender).toHaveBeenCalledTimes(1);
    });

    it('stop→start 重注入后注入脚本持新 SECRET（storage 注入脚本级，p031）', async () => {
        // jsdom 的 localStorage.setItem 不可覆盖，替换为可赋值 mock（注入脚本 hook 目标）
        const store: Record<string, string> = {};
        const mock_storage = {
            setItem: (k: string, v: string) => { store[k] = v; },
            removeItem: (k: string) => { delete store[k]; },
            clear: () => { for (const k in store) delete store[k]; },
        };
        const orig_ls = Object.getOwnPropertyDescriptor(window, 'localStorage');
        Object.defineProperty(window, 'localStorage', { value: mock_storage, configurable: true });
        try {
            // 首轮注入：SECRET-s1 闭包
            (window as any).__capture_all_storage_nonce__ = NONCE;
            (window as any).__capture_all_storage_installed__ = false;
            // eslint-disable-next-line no-eval
            eval(build_page_script('secret-s1'));

            const capture_posted = async (): Promise<any[]> => {
                const msgs: any[] = [];
                const listener = (e: MessageEvent) => { if (e.data?.source === SIGNAL) msgs.push(e.data); };
                window.addEventListener('message', listener);
                window.localStorage.setItem('probe', 'v');
                // jsdom postMessage 事件异步派发
                await new Promise((r) => setTimeout(r, 10));
                window.removeEventListener('message', listener);
                return msgs;
            };

            // 首轮：注入脚本（SECRET-s1）签名
            const msgs1 = await capture_posted();
            expect(msgs1.length).toBe(1);
            expect(verify_payload('secret-s1', msgs1[0])).toBe(true);

            // 重注入（已安装 → 还原上次 hook 后重装，持 SECRET-s2）
            (window as any).__capture_all_storage_installed__ = true;
            // eslint-disable-next-line no-eval
            eval(build_page_script('secret-s2'));

            const msgs2 = await capture_posted();
            expect(msgs2.length).toBe(1);
            expect(verify_payload('secret-s2', msgs2[0])).toBe(true);
            // 旧 SECRET 不再匹配（跨采集旧签名失效）
            expect(verify_payload('secret-s1', msgs2[0])).toBe(false);
        } finally {
            if (orig_ls) Object.defineProperty(window, 'localStorage', orig_ls);
            else delete (window as any).localStorage;
        }
    });
});
