import { describe, expect, it } from 'vitest';
import {
    create_empty_capture_stats,
    increment_capture_event_stats,
    visible_capture_stat_counts,
} from '../src/shared/capture_stats';

describe('capture_stats', () => {
    it('keeps user action count separate from total event count', () => {
        const after_navigation = increment_capture_event_stats(create_empty_capture_stats(), 'navigation');
        const after_user_action = increment_capture_event_stats(after_navigation, 'user_action');

        expect(after_user_action.event_count).toBe(2);
        expect(after_user_action.user_action_count).toBe(1);
        expect(after_user_action.nav_count).toBe(1);
    });

    it('increments request_count for network category', () => {
        const result = increment_capture_event_stats(create_empty_capture_stats(), 'network');
        expect(result.request_count).toBe(1);
        expect(result.event_count).toBe(1);
    });

    it('increments log_count for console category', () => {
        const result = increment_capture_event_stats(create_empty_capture_stats(), 'console');
        expect(result.log_count).toBe(1);
        expect(result.event_count).toBe(1);
    });

    it('uses user_action_count for the visible seven data labels', () => {
        const stats = {
            ...create_empty_capture_stats(),
            event_count: 99,
            user_action_count: 5,
            nav_count: 3,
            request_count: 10,
            log_count: 2,
            error_count: 1,
            storage_change_count: 4,
            cookie_change_count: 7,
        };

        expect(visible_capture_stat_counts(stats)).toEqual([5, 3, 10, 2, 1, 4, 7]);
    });
});
