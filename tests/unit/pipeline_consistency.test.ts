import { describe, expect, it } from 'vitest';
import { category_for_event_type } from '../../src/shared/event_category';
import {
    create_empty_capture_stats,
    increment_capture_event_stats,
    visible_capture_stat_counts,
} from '../../src/extension/shared/capture_stats';
import type { CaptureEvent, CategoryKey } from '../../src/shared/types';

function event(type: CaptureEvent['type']): CaptureEvent {
    return {
        event_id: type,
        capture_id: 'capture-1',
        category: category_for_event_type(type),
        type,
        relative_time_ms: 1,
        absolute_time: '2026-06-13T00:00:00+08:00',
        tab_id: 1,
        frame_id: 0,
        url: 'https://example.com',
        top_frame_url: null,
        page_title: null,
        source: 'background',
        severity: 'info',
        related_event_ids: [],
        redaction_status: 'none',
        raw_available: false,
        created_at: '2026-06-13T00:00:00+08:00',
    };
}

describe('pipeline_consistency', () => {
    it('keeps visible stats consistent with event categories', () => {
        const events = [
            event('mouse_event'),
            event('page_navigation'),
            event('storage_change'),
            event('cookie_change'),
            event('runtime_exception'),
        ];
        const stats = events.reduce(
            (current, item) => increment_capture_event_stats(current, item.category),
            create_empty_capture_stats()
        );
        const counts_by_category = events.reduce<Record<CategoryKey, number>>((current, item) => ({
            ...current,
            [item.category]: current[item.category] + 1,
        }), {
            user_action: 0,
            navigation: 0,
            network: 0,
            console: 0,
            error: 0,
            storage: 0,
            cookie: 0,
            dom_data: 0,
            capture_lifecycle: 0,
        });

        expect(stats.event_count).toBe(events.length);
        expect(stats.user_action_count).toBe(counts_by_category.user_action);
        expect(stats.nav_count).toBe(counts_by_category.navigation);
        expect(stats.error_count).toBe(counts_by_category.error);
        expect(stats.storage_change_count).toBe(counts_by_category.storage);
        expect(stats.cookie_change_count).toBe(counts_by_category.cookie);
        expect(visible_capture_stat_counts(stats)).toEqual([1, 1, 0, 0, 1, 1, 1]);
    });
});
