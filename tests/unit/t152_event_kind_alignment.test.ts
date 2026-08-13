// tests/unit/t152_event_kind_alignment.test.ts
// t152 AC-006: event_kind 与 category_for_event_type 对齐——ws/clipboard/form/visibility 等不再错标「生命周期」。
import { describe, expect, it } from 'vitest';
import { event_kind } from '../../src/extension/dashboard/dashboard_shared';
import { category_for_event_type } from '../../src/shared/event_category';
import type { CaptureEvent, EventType } from '../../src/shared/types';

const CATEGORY_TO_KIND: Record<string, string> = {
    user_action: 'user',
    navigation: 'nav',
    network: 'network',
    console: 'console',
    error: 'error',
    storage: 'storage',
    cookie: 'cookie',
    dom_data: 'dom',
    capture_lifecycle: 'capture',
};

function make_event(type: EventType): CaptureEvent {
    return { type } as CaptureEvent;
}

// 覆盖 category_for_event_type 全类别代表性 type（含既往被 default 错标为 capture 的）
const SAMPLE_TYPES: EventType[] = [
    'mouse_event', 'keyboard_event', 'scroll_event', 'input_event',
    'clipboard_write', 'clipboard_read', 'form_submit', 'focus_event',
    'resize_event', 'fullscreen_change', 'print_event',
    'route_change', 'page_load', 'tab_switch',
    'tab_created', 'tab_url_change', 'dom_ready', 'visibility_change',
    'network_request', 'ws_frame', 'ws_message',
    'console_event',
    'runtime_exception', 'capture_error',
    'storage_change',
    'cookie_change',
    'capture_started', 'capture_stopped',
];

describe('t152 AC-006 event_kind 与 category_for_event_type 对齐', () => {
    it('全类别样本：event_kind === CATEGORY_TO_KIND[category_for_event_type]', () => {
        for (const type of SAMPLE_TYPES) {
            const expected = CATEGORY_TO_KIND[category_for_event_type(type)];
            expect(event_kind(make_event(type)), `type=${type}`).toBe(expected);
        }
    });

    it('ws_frame/ws_message 标 network 而非生命周期', () => {
        expect(event_kind(make_event('ws_frame'))).toBe('network');
        expect(event_kind(make_event('ws_message'))).toBe('network');
    });

    it('clipboard/form 标 user 而非生命周期', () => {
        expect(event_kind(make_event('clipboard_write'))).toBe('user');
        expect(event_kind(make_event('form_submit'))).toBe('user');
    });

    it('visibility_change 标 nav 而非生命周期', () => {
        expect(event_kind(make_event('visibility_change'))).toBe('nav');
    });

    it('capture_lifecycle 事件仍标 capture', () => {
        expect(event_kind(make_event('capture_started'))).toBe('capture');
        expect(event_kind(make_event('capture_stopped'))).toBe('capture');
    });
});
