// @vitest-environment jsdom
// tests/unit/storage_capture.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { CaptureEvent, StorageChangeData } from '../../src/shared/types';
import { start_storage_capture, stop_storage_capture } from '../../src/extension/content/storage_capture';

const SIGNAL = '__capture_all_storage__';

describe('storage_capture', () => {
    let events: Array<CaptureEvent & StorageChangeData>;
    let sender: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        events = [];
        sender = vi.fn((evt) => events.push(evt as CaptureEvent & StorageChangeData));
        stop_storage_capture();
    });

    afterEach(() => stop_storage_capture());

    function post_message(payload: Record<string, unknown>): void {
        window.dispatchEvent(new MessageEvent('message', {
            origin: window.location.origin,
            source: window,
            data: { source: SIGNAL, ...payload },
        }));
    }

    it('事件 tab_id 使用传入的 tab_id', () => {
        start_storage_capture(sender, 'cap1', Date.now(), 42);
        post_message({ storage_type: 'local', action: 'set', key: 'foo', value_length: 5 });
        expect(sender).toHaveBeenCalledTimes(1);
        expect(events[0].tab_id).toBe(42);
    });

    it('未传 tab_id 默认 0（向后兼容性参考，新调用必须传值）', () => {
        // 即使未来签名要求 tab_id，仍验证默认行为合理
        start_storage_capture(sender, 'cap1', Date.now(), 0);
        post_message({ storage_type: 'local', action: 'set', key: 'foo', value_length: 5 });
        expect(events[0].tab_id).toBe(0);
    });

    it('stop 后不再发送', () => {
        start_storage_capture(sender, 'cap1', Date.now(), 7);
        stop_storage_capture();
        post_message({ storage_type: 'local', action: 'set', key: 'foo', value_length: 5 });
        expect(sender).not.toHaveBeenCalled();
    });
});
