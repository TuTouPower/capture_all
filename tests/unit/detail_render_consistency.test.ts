import { describe, expect, it } from 'vitest';
import { VISIBLE_CAPTURE_STAT_KEYS } from '../../src/extension/shared/capture_stats';
import { category_for_event_type } from '../../src/shared/event_category';
import type { CaptureStats, EventType } from '../../src/shared/types';

const tab_expectations: Array<{
    tab: string;
    stat_key: keyof CaptureStats;
    event_type: EventType;
    category: string;
}> = [
    { tab: '用户行为', stat_key: 'user_action_count', event_type: 'input_event', category: 'user_action' },
    { tab: '页面导航', stat_key: 'nav_count', event_type: 'page_navigation', category: 'navigation' },
    { tab: '网络请求', stat_key: 'request_count', event_type: 'network_request', category: 'network' },
    { tab: '控制台', stat_key: 'log_count', event_type: 'console_event', category: 'console' },
    { tab: '错误异常', stat_key: 'error_count', event_type: 'runtime_exception', category: 'error' },
    { tab: 'Storage', stat_key: 'storage_change_count', event_type: 'storage_change', category: 'storage' },
    { tab: 'Cookie', stat_key: 'cookie_change_count', event_type: 'cookie_change', category: 'cookie' },
];

describe('detail_render_consistency', () => {
    it('keeps the seven visible tabs aligned with visible stats keys', () => {
        expect(tab_expectations.map(item => item.stat_key)).toEqual(VISIBLE_CAPTURE_STAT_KEYS);
    });

    it('maps each visible tab event type to its render category', () => {
        for (const item of tab_expectations) {
            expect(category_for_event_type(item.event_type), item.tab).toBe(item.category);
        }
    });

    it('requires a rendered row when the tab stat is non-zero', () => {
        const stats = Object.fromEntries(
            tab_expectations.map(item => [item.stat_key, 1])
        ) as Pick<CaptureStats, typeof tab_expectations[number]['stat_key']>;

        for (const item of tab_expectations) {
            expect(stats[item.stat_key], item.tab).toBeGreaterThan(0);
        }
    });
});
