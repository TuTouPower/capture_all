// @vitest-environment jsdom
// tests/unit/dom_network_hook_event_id.test.ts
// 验证 dom_capture 与 network_hook 事件含 event_id（满足 IndexedDB keyPath 约束）
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { CaptureEvent, InputEventData, NetworkRequestData } from '../../src/shared/types';
import { start_dom_capture, stop_dom_capture } from '../../src/extension/content/dom_capture';
import { start_network_hook, stop_network_hook } from '../../src/extension/content/network_hook';

describe('dom_capture 与 network_hook 事件含 event_id', () => {
    let events: Array<CaptureEvent & InputEventData>;
    let net_events: Array<CaptureEvent & NetworkRequestData>;

    beforeEach(() => {
        events = [];
        net_events = [];
        stop_dom_capture();
        stop_network_hook();
    });

    afterEach(() => {
        stop_dom_capture();
        stop_network_hook();
    });

    function dispatch_input(target: Element): void {
        target.dispatchEvent(new Event('input', { bubbles: true }));
    }

    it('dom_capture input 事件含 event_id 非空', () => {
        const sender = (event: CaptureEvent, data: InputEventData) => {
            events.push({ ...event, ...data } as CaptureEvent & InputEventData);
        };
        start_dom_capture({
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
            redact_data: false,
            sample_rate_ms: 50,
        }, 'cap1', Date.now(), 1, sender);

        const input = document.createElement('input');
        input.type = 'text';
        document.body.appendChild(input);
        dispatch_input(input);

        expect(events.length).toBeGreaterThanOrEqual(1);
        expect(typeof events[0].event_id).toBe('string');
        expect(events[0].event_id.length).toBeGreaterThan(0);
        expect(events[0].source).toBe('content_script');
    });

    it('network_hook 事件含 event_id 非空', () => {
        const sender = (event: CaptureEvent, _data: NetworkRequestData) => {
            net_events.push(event as CaptureEvent & NetworkRequestData);
        };
        start_network_hook(sender, 'cap2', Date.now(), 2);

        // 直接 emit 模拟 page script postMessage
        window.dispatchEvent(new MessageEvent('message', {
            origin: window.location.origin,
            source: window,
            data: {
                source: '__capture_all_network_hook__',
                method: 'GET',
                url: 'https://example.com/x',
                status: 200,
                duration_ms: 10,
                response_body_status: 'failed',
            },
        }));

        expect(net_events.length).toBeGreaterThanOrEqual(1);
        expect(typeof net_events[0].event_id).toBe('string');
        expect(net_events[0].event_id.length).toBeGreaterThan(0);
        expect(net_events[0].type).toBe('network_request');
    });
});
