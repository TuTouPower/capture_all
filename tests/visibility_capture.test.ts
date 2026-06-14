// @vitest-environment jsdom
// tests/visibility_capture.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { start_visibility_capture, stop_visibility_capture } from '../src/content/visibility_capture';

describe('visibility_capture', () => {
    let sender: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        sender = vi.fn();
        stop_visibility_capture();
    });

    afterEach(() => stop_visibility_capture());

    it('visible → hidden → state=hidden', () => {
        start_visibility_capture(sender, 'cap1', Date.now(), 1);
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        expect(sender).toHaveBeenCalledTimes(1);
        const [evt, data] = sender.mock.calls[0];
        expect(evt.type).toBe('visibility_change');
        expect(evt.category).toBe('navigation');
        expect(data.state).toBe('hidden');
    });

    it('hidden → visible → state=visible', () => {
        start_visibility_capture(sender, 'cap1', Date.now(), 1);
        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        expect(sender).toHaveBeenCalledTimes(1);
        expect(sender.mock.calls[0][1].state).toBe('visible');
    });

    it('stop 后不发送', () => {
        start_visibility_capture(sender, 'cap1', Date.now(), 1);
        stop_visibility_capture();
        document.dispatchEvent(new Event('visibilitychange'));
        expect(sender).not.toHaveBeenCalled();
    });
});
