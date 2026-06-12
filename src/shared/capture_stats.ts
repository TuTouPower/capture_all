import type { CaptureStats, CategoryKey } from './types';

export const VISIBLE_CAPTURE_STAT_KEYS = [
    'user_action_count',
    'nav_count',
    'request_count',
    'log_count',
    'error_count',
    'storage_change_count',
    'cookie_change_count',
] as const;

export function create_empty_capture_stats(): CaptureStats {
    return {
        event_count: 0,
        user_action_count: 0,
        nav_count: 0,
        request_count: 0,
        log_count: 0,
        error_count: 0,
        storage_change_count: 0,
        cookie_change_count: 0,
    };
}

export function increment_capture_event_stats(stats: CaptureStats, category: CategoryKey): CaptureStats {
    return {
        ...stats,
        event_count: stats.event_count + 1,
        user_action_count: category === 'user_action' ? stats.user_action_count + 1 : stats.user_action_count,
        nav_count: category === 'navigation' ? stats.nav_count + 1 : stats.nav_count,
        error_count: category === 'error' ? stats.error_count + 1 : stats.error_count,
        storage_change_count: category === 'storage' ? stats.storage_change_count + 1 : stats.storage_change_count,
        cookie_change_count: category === 'cookie' ? stats.cookie_change_count + 1 : stats.cookie_change_count,
    };
}

export function visible_capture_stat_counts(stats: CaptureStats): number[] {
    return VISIBLE_CAPTURE_STAT_KEYS.map((key) => stats[key]);
}
