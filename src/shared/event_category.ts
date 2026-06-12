import type { CategoryKey } from './types';

const USER_ACTION_TYPES = new Set(['mouse_event', 'keyboard_event', 'scroll_event', 'input_event']);
const NAVIGATION_TYPES = new Set(['page_navigation', 'route_change', 'page_load', 'tab_switch', 'tab_created', 'tab_url_change', 'dom_ready']);
const ERROR_TYPES = new Set(['runtime_exception', 'unhandled_rejection', 'resource_error', 'network_failed', 'capture_error']);

export function category_for_event_type(type: string): CategoryKey {
    if (USER_ACTION_TYPES.has(type)) return 'user_action';
    if (NAVIGATION_TYPES.has(type)) return 'navigation';
    if (ERROR_TYPES.has(type)) return 'error';
    if (type === 'storage_change') return 'storage';
    if (type === 'cookie_change') return 'cookie';
    if (type === 'capture_started' || type === 'capture_stopped') return 'capture_lifecycle';
    return 'dom_data';
}
