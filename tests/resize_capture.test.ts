// @vitest-environment jsdom
// tests/resize_capture.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { start_resize_capture, stop_resize_capture } from '../src/content/resize_capture';

describe('resize_capture', () => {
    let sender: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        sender = vi.fn();
        stop_resize_capture();
        vi.useFakeTimers();
    });

    afterEach(() => {
        stop_resize_capture();
        vi.useRealTimers();
    });

    it('resize → send_event 含 width/height', () => {
        start_resize_capture(sender, 'cap1', Date.now(), 1);
        window.dispatchEvent(new Event('resize'));
        vi.advanceTimersByTime(200);
        expect(sender).toHaveBeenCalledTimes(1);
        const [evt, data] = sender.mock.calls[0];
        expect(evt.type).toBe('resize_event');
        expect(evt.category).toBe('user_action');
        expect(data).toHaveProperty('inner_width');
        expect(data).toHaveProperty('inner_height');
    });

    it('防抖：快速连续 resize 只触发一次', () => {
        start_resize_capture(sender, 'cap1', Date.now(), 1);
        window.dispatchEvent(new Event('resize'));
        window.dispatchEvent(new Event('resize'));
        window.dispatchEvent(new Event('resize'));
        vi.advanceTimersByTime(200);
        expect(sender).toHaveBeenCalledTimes(1);
    });

    it('stop 后不发送', () => {
        start_resize_capture(sender, 'cap1', Date.now(), 1);
        stop_resize_capture();
        window.dispatchEvent(new Event('resize'));
        vi.advanceTimersByTime(200);
        expect(sender).not.toHaveBeenCalled();
    });
});
