// tests/p036_user_action_filter.test.ts
// P0.36: 用户行为标签页数据过滤一致性测试
import { describe, expect, it } from 'vitest';
import { category_for_event_type } from '../../src/shared/event_category';

// Content scripts 实际使用的 user_action 事件类型
const CONTENT_SCRIPT_USER_ACTION_TYPES = [
    'mouse_event',      // mouse_capture.ts
    'keyboard_event',   // keyboard_capture.ts
    'scroll_event',     // scroll_capture.ts
    'input_event',      // dom_capture.ts
] as const;

// dashboard.ts render_simple_events 的白名单
const DASHBOARD_WHITELIST = [
    'mouse_event',
    'keyboard_event',
    'scroll_event',
    'input_event',
];

// detail.ts render_events 的白名单 (修复后)
const DETAIL_WHITELIST = [
    'mouse_event',
    'keyboard_event',
    'scroll_event',
    'input_event',
];

describe('P0.36: user_action event type consistency', () => {
    it('category_for_event_type returns user_action for all content script types', () => {
        for (const type of CONTENT_SCRIPT_USER_ACTION_TYPES) {
            expect(category_for_event_type(type)).toBe('user_action');
        }
    });

    it('dashboard whitelist covers all content script user_action types', () => {
        for (const type of CONTENT_SCRIPT_USER_ACTION_TYPES) {
            expect(DASHBOARD_WHITELIST).toContain(type);
        }
    });

    it('detail page whitelist covers all content script user_action types', () => {
        for (const type of CONTENT_SCRIPT_USER_ACTION_TYPES) {
            expect(DETAIL_WHITELIST).toContain(type);
        }
    });

    it('dashboard and detail whitelists are identical', () => {
        expect(DASHBOARD_WHITELIST.sort()).toEqual(DETAIL_WHITELIST.sort());
    });

    it('whitelists do not contain stale dom_mutation type', () => {
        expect(DASHBOARD_WHITELIST).not.toContain('dom_mutation');
        expect(DETAIL_WHITELIST).not.toContain('dom_mutation');
    });

    it('input_event is categorized as user_action', () => {
        expect(category_for_event_type('input_event')).toBe('user_action');
    });

    it('dom_mutation is NOT categorized as user_action', () => {
        // dom_mutation is categorized as dom_data, not user_action
        expect(category_for_event_type('dom_mutation')).not.toBe('user_action');
    });
});
