// @vitest-environment jsdom
// tests/unit/keyboard_capture.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { CaptureEvent, KeyboardEventData, CaptureConfig } from '../../src/shared/types';
import { start_keyboard_capture, stop_keyboard_capture } from '../../src/extension/content/keyboard_capture';

function make_config(overrides: Partial<CaptureConfig> = {}): CaptureConfig {
    return {
        mouse_precision: 'clicks_scroll_drag',
        capture_console: true,
        capture_network: true,
        keyboard_capture_mode: 'all',
        capture_input_values: true,
        capture_request_body: true,
        capture_response_body: true,
        max_body_capture_bytes: 104857600,
        inline_text_max_bytes: 1024,
        redact_sensitive_headers: true,
        redact_url_query: true,
        redact_data: true,
        sample_rate_ms: 50,
        ...overrides,
    };
}

describe('keyboard_capture', () => {
    let events: Array<{ event: CaptureEvent; data: KeyboardEventData }>;
    let sender: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        events = [];
        sender = vi.fn((event, data) => events.push({ event, data }));
        stop_keyboard_capture();
    });

    afterEach(() => stop_keyboard_capture());

    function dispatch_key(target: Element | null, key: string, code: string, modifiers: Partial<KeyboardEventInit> = {}): void {
        const event = new KeyboardEvent('keydown', {
            key,
            code,
            bubbles: true,
            cancelable: true,
            ...modifiers,
        });
        (target ?? document).dispatchEvent(event);
    }

    it('shortcuts 模式 + redact_data=true 时 key/code 脱敏', () => {
        start_keyboard_capture(make_config({ keyboard_capture_mode: 'shortcuts', redact_data: true }), 'cap1', Date.now(), 1, sender);
        dispatch_key(document.body, 'a', 'KeyA', { ctrlKey: true });
        expect(sender).toHaveBeenCalledTimes(1);
        const { data } = events[0];
        expect(data.key).toBeNull();
        expect(data.code).toBeNull();
        expect(data.key_status).toBe('masked');
    });

    it('all 模式 + redact_data=true 时 key/code 脱敏', () => {
        start_keyboard_capture(make_config({ keyboard_capture_mode: 'all', redact_data: true }), 'cap1', Date.now(), 1, sender);
        dispatch_key(document.body, 'a', 'KeyA');
        expect(sender).toHaveBeenCalledTimes(1);
        expect(events[0].data.key).toBeNull();
        expect(events[0].data.code).toBeNull();
    });

    it('all 模式 + redact_data=false 时 key/code 保留', () => {
        start_keyboard_capture(make_config({ keyboard_capture_mode: 'all', redact_data: false }), 'cap1', Date.now(), 1, sender);
        dispatch_key(document.body, 'a', 'KeyA');
        expect(events[0].data.key).toBe('a');
        expect(events[0].data.code).toBe('KeyA');
    });

    it('target_input_type 取自 input.type', () => {
        start_keyboard_capture(make_config({ keyboard_capture_mode: 'all', redact_data: false }), 'cap1', Date.now(), 1, sender);
        const input = document.createElement('input');
        input.type = 'email';
        document.body.appendChild(input);
        dispatch_key(input, 'a', 'KeyA');
        expect(events[0].data.target_input_type).toBe('email');
    });

    it('target 为非 input 元素时 target_input_type 为 null', () => {
        start_keyboard_capture(make_config({ keyboard_capture_mode: 'all', redact_data: false }), 'cap1', Date.now(), 1, sender);
        dispatch_key(document.body, 'a', 'KeyA');
        expect(events[0].data.target_input_type).toBeNull();
    });

    it('shortcuts 模式下非修饰键事件不发送', () => {
        start_keyboard_capture(make_config({ keyboard_capture_mode: 'shortcuts', redact_data: false }), 'cap1', Date.now(), 1, sender);
        dispatch_key(document.body, 'a', 'KeyA');
        expect(sender).not.toHaveBeenCalled();
    });
});
