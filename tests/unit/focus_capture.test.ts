// @vitest-environment jsdom
// tests/focus_capture.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { CaptureEvent, FocusEventData } from '../../src/shared/types';
import {
    start_focus_capture,
    stop_focus_capture,
} from '../../src/extension/content/focus_capture';

describe('focus_capture', () => {
    let events: Array<{ event: CaptureEvent; data: FocusEventData }>;
    let sender: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        events = [];
        sender = vi.fn((event, data) => events.push({ event, data }));
        stop_focus_capture();
    });

    afterEach(() => stop_focus_capture());

    it('input focus → focus_event action=focus', () => {
        start_focus_capture(sender, 'cap1', Date.now(), 1);
        const input = document.createElement('input');
        input.id = 'email';
        document.body.appendChild(input);
        input.dispatchEvent(new FocusEvent('focus', { bubbles: false }));
        expect(sender).toHaveBeenCalledTimes(1);
        const { event, data } = events[0];
        expect(event.type).toBe('focus_event');
        expect(event.category).toBe('user_action');
        expect(data.action).toBe('focus');
        expect(data.target_tag).toBe('input');
        expect(data.target_selector).toBe('#email');
    });

    it('input blur → action=blur', () => {
        start_focus_capture(sender, 'cap1', Date.now(), 1);
        const input = document.createElement('input');
        document.body.appendChild(input);
        input.dispatchEvent(new FocusEvent('blur', { bubbles: false }));
        expect(sender).toHaveBeenCalledTimes(1);
        expect(events[0].data.action).toBe('blur');
    });

    it('非表单元素不触发', () => {
        start_focus_capture(sender, 'cap1', Date.now(), 1);
        const div = document.createElement('div');
        document.body.appendChild(div);
        div.dispatchEvent(new FocusEvent('focus', { bubbles: false }));
        expect(sender).not.toHaveBeenCalled();
    });

    it('stop 后不发送', () => {
        start_focus_capture(sender, 'cap1', Date.now(), 1);
        stop_focus_capture();
        const input = document.createElement('input');
        document.body.appendChild(input);
        input.dispatchEvent(new FocusEvent('focus', { bubbles: false }));
        expect(sender).not.toHaveBeenCalled();
    });

    it('textarea focus 也触发', () => {
        start_focus_capture(sender, 'cap1', Date.now(), 1);
        const ta = document.createElement('textarea');
        document.body.appendChild(ta);
        ta.dispatchEvent(new FocusEvent('focus', { bubbles: false }));
        expect(sender).toHaveBeenCalledTimes(1);
        expect(events[0].data.target_tag).toBe('textarea');
    });

    it('重复 start 不重复注册', () => {
        const spy = vi.spyOn(document, 'addEventListener');
        start_focus_capture(sender, 'cap1', Date.now(), 1);
        start_focus_capture(sender, 'cap1', Date.now(), 1);
        const focus_calls = spy.mock.calls.filter(c => c[0] === 'focus');
        expect(focus_calls).toHaveLength(1);
        spy.mockRestore();
    });
});
