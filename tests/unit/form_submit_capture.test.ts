// @vitest-environment jsdom
// tests/form_submit_capture.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { CaptureEvent, FormSubmitData, CaptureConfig } from '../../src/shared/types';
import {
    start_form_submit_capture,
    stop_form_submit_capture,
} from '../../src/extension/content/form_submit_capture';

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

describe('form_submit_capture', () => {
    let events: Array<{ event: CaptureEvent; data: FormSubmitData }>;
    let sender: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        events = [];
        sender = vi.fn((event, data) => events.push({ event, data }));
        stop_form_submit_capture();
    });

    afterEach(() => stop_form_submit_capture());

    function create_form(opts: {
        action?: string;
        method?: string;
        id?: string;
        name?: string;
        field_count?: number;
    } = {}): HTMLFormElement {
        const form = document.createElement('form');
        if (opts.action) form.action = opts.action;
        if (opts.method) form.method = opts.method;
        if (opts.id) form.id = opts.id;
        if (opts.name) form.name = opts.name;
        for (let i = 0; i < (opts.field_count ?? 0); i++) {
            const input = document.createElement('input');
            input.name = `field_${i}`;
            form.appendChild(input);
        }
        document.body.appendChild(form);
        return form;
    }

    it('form submit → form_submit 事件', () => {
        start_form_submit_capture(sender, 'cap1', Date.now(), 1, make_config());
        const form = create_form({
            action: 'https://example.com/login',
            method: 'post',
            id: 'login-form',
            name: 'login',
            field_count: 3,
        });
        form.dispatchEvent(new Event('submit', { bubbles: true }));
        expect(sender).toHaveBeenCalledTimes(1);
        const { event, data } = events[0];
        expect(event.type).toBe('form_submit');
        expect(event.category).toBe('user_action');
        expect(data.form_method).toBe('post');
        expect(data.form_id).toBe('login-form');
        expect(data.form_name).toBe('login');
        expect(data.field_count).toBe(3);
    });

    it('redact_data + redact_url_query 启用时 form_action 敏感 query 脱敏', () => {
        start_form_submit_capture(sender, 'cap1', Date.now(), 1, make_config({ redact_data: true, redact_url_query: true }));
        const form = create_form({ action: 'https://example.com/submit?token=SECRET&next=/home' });
        form.dispatchEvent(new Event('submit', { bubbles: true }));
        expect(sender).toHaveBeenCalledTimes(1);
        const action = events[0].data.form_action ?? '';
        expect(action).not.toContain('SECRET');
        expect(action).toContain('%5BREDACTED%5D');
        expect(action).toContain('next=%2Fhome');
    });

    it('redact_url_query=false 时 form_action 保留原值', () => {
        start_form_submit_capture(sender, 'cap1', Date.now(), 1, make_config({ redact_data: true, redact_url_query: false }));
        const form = create_form({ action: 'https://example.com/submit?token=SECRET' });
        form.dispatchEvent(new Event('submit', { bubbles: true }));
        expect(events[0].data.form_action).toContain('SECRET');
    });

    it('stop 后不发送', () => {
        start_form_submit_capture(sender, 'cap1', Date.now(), 1, make_config());
        stop_form_submit_capture();
        const form = create_form({ action: '/submit', field_count: 1 });
        form.dispatchEvent(new Event('submit', { bubbles: true }));
        expect(sender).not.toHaveBeenCalled();
    });

    it('非 form 元素不触发', () => {
        start_form_submit_capture(sender, 'cap1', Date.now(), 1, make_config());
        const div = document.createElement('div');
        document.body.appendChild(div);
        div.dispatchEvent(new Event('submit', { bubbles: true }));
        expect(sender).not.toHaveBeenCalled();
    });

    it('重复 start 不重复注册', () => {
        const spy = vi.spyOn(document, 'addEventListener');
        start_form_submit_capture(sender, 'cap1', Date.now(), 1, make_config());
        start_form_submit_capture(sender, 'cap1', Date.now(), 1, make_config());
        const submit_calls = spy.mock.calls.filter(c => c[0] === 'submit');
        expect(submit_calls).toHaveLength(1);
        spy.mockRestore();
    });
});
