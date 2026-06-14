// @vitest-environment jsdom
// tests/print_capture.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { start_print_capture, stop_print_capture } from '../src/content/print_capture';

describe('print_capture', () => {
    let sender: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        sender = vi.fn();
        stop_print_capture();
    });

    afterEach(() => stop_print_capture());

    it('beforeprint → action=beforeprint', () => {
        start_print_capture(sender, 'cap1', Date.now(), 1);
        window.dispatchEvent(new Event('beforeprint'));
        expect(sender).toHaveBeenCalledTimes(1);
        const [evt, data] = sender.mock.calls[0];
        expect(evt.type).toBe('print_event');
        expect(evt.category).toBe('user_action');
        expect(data.action).toBe('beforeprint');
    });

    it('afterprint → action=afterprint', () => {
        start_print_capture(sender, 'cap1', Date.now(), 1);
        window.dispatchEvent(new Event('afterprint'));
        expect(sender).toHaveBeenCalledTimes(1);
        expect(sender.mock.calls[0][1].action).toBe('afterprint');
    });

    it('stop 后不发送', () => {
        start_print_capture(sender, 'cap1', Date.now(), 1);
        stop_print_capture();
        window.dispatchEvent(new Event('beforeprint'));
        expect(sender).not.toHaveBeenCalled();
    });
});
