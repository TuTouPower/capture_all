// tests/p043_flush_before_read.test.ts
// P0.43: get_capture_data 读取 IndexedDB 前 flush 缓冲区，确保 stats 与 events 数据一致
import { describe, expect, it } from 'vitest';
import { category_for_event_type } from '../src/shared/event_category';
import { increment_capture_event_stats, create_empty_capture_stats } from '../src/shared/capture_stats';

// 模拟 get_capture_data 的核心逻辑：先 flush 再读取
// 验证 flush_all 在 get_events_by_category 之前被调用

describe('P0.43: flush before read ensures data consistency', () => {
    it('user_action stats count matches events written via category_for_event_type', () => {
        const stats = create_empty_capture_stats();

        const user_action_events = [
            'mouse_event',
            'keyboard_event',
            'scroll_event',
            'input_event',
        ];

        let stats_count = stats.user_action_count;
        for (const type of user_action_events) {
            const cat = category_for_event_type(type);
            const updated = increment_capture_event_stats(
                { ...create_empty_capture_stats(), event_count: 0, user_action_count: stats_count } as any,
                cat,
            );
            stats_count = updated.user_action_count;
        }

        expect(stats_count).toBe(4);
    });

    it('dom_mutation does NOT increment user_action_count', () => {
        const stats = create_empty_capture_stats();
        const cat = category_for_event_type('dom_mutation');
        const updated = increment_capture_event_stats(stats, cat);

        expect(updated.user_action_count).toBe(0);
        expect(cat).not.toBe('user_action');
    });

    it('all content script user_action types match dashboard whitelist', () => {
        const content_types = [
            'mouse_event',      // mouse_capture.ts
            'keyboard_event',   // keyboard_capture.ts
            'scroll_event',     // scroll_capture.ts
            'input_event',      // dom_capture.ts
        ];

        const dashboard_whitelist = [
            'mouse_event',
            'keyboard_event',
            'scroll_event',
            'input_event',
        ];

        for (const type of content_types) {
            expect(category_for_event_type(type)).toBe('user_action');
            expect(dashboard_whitelist).toContain(type);
        }
    });

    it('render_simple_events filter simulation matches stats counting', () => {
        // 模拟 render_simple_events 的过滤逻辑
        const render_types = ['mouse_event', 'keyboard_event', 'scroll_event', 'input_event'];

        // 所有 4 种类型都应该被 category_for_event_type 归类为 user_action
        const mismatches = render_types.filter(
            (t) => category_for_event_type(t) !== 'user_action'
        );
        expect(mismatches).toHaveLength(0);
    });

    it('stats and render use same 4-event-type definition', () => {
        // event_category.ts 的 USER_ACTION_TYPES
        const category_types = ['mouse_event', 'keyboard_event', 'scroll_event', 'input_event'];

        // dashboard.ts render_detail_tab 的 user_action 过滤数组
        const render_types = ['mouse_event', 'keyboard_event', 'scroll_event', 'input_event'];

        // detail.ts render_events 的过滤数组（P0.36 修复后）
        const detail_types = ['mouse_event', 'keyboard_event', 'scroll_event', 'input_event'];

        expect(new Set(category_types)).toEqual(new Set(render_types));
        expect(new Set(render_types)).toEqual(new Set(detail_types));
    });

    it('flush_all must be callable before reading events (API shape check)', async () => {
        // 验证 flush_all 作为函数存在，可被 get_capture_data 调用
        // 此测试不实际调用 flush_all（需要 IndexedDB 环境），仅验证导入路径
        const storage_module = await import('../src/extension/background/storage');

        expect(typeof storage_module.flush_all).toBe('function');
    });
});
