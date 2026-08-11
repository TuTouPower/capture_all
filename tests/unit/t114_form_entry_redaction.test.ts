// @vitest-environment jsdom
// tests/unit/t114_form_entry_redaction.test.ts
// t114 AC-003 接线级回归：form action 经 document base 解析后嵌套 query 不泄露。
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

describe('t114 form 入口嵌套 query 脱敏', () => {
    let events: Array<{ event: CaptureEvent; data: FormSubmitData }>;

    beforeEach(() => {
        events = [];
        stop_form_submit_capture();
    });

    afterEach(() => stop_form_submit_capture());

    function submit_form(action: string): void {
        start_form_submit_capture(
            (_e, d) => events.push({ event: _e, data: d }),
            'cap1',
            Date.now(),
            1,
            make_config(),
        );
        const form = document.createElement('form');
        form.action = action;
        document.body.appendChild(form);
        form.dispatchEvent(new Event('submit', { bubbles: true }));
    }

    it('AC-003 form action 嵌套相对 query 不泄露（base-resolved absolute）', () => {
        submit_form('https://example.com/start?next=/child?token=secret_form');
        const action = events[0]?.data.form_action ?? '';
        expect(action).not.toContain('secret_form');
        expect(action).toContain('REDACTED');
    });

    it('AC-003 form action encoded 嵌套 query 不泄露', () => {
        submit_form('https://example.com/start?next=child%3Ftoken%3Dsecret_form_enc');
        const action = events[0]?.data.form_action ?? '';
        expect(action).not.toContain('secret_form_enc');
        expect(action).toContain('REDACTED');
    });
});
