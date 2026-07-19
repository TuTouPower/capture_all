import type { CategoryKey, EventType } from './types';

const USER_ACTION_TYPES = new Set<EventType>(['mouse_event', 'keyboard_event', 'scroll_event', 'input_event', 'clipboard_write', 'clipboard_read', 'form_submit', 'focus_event', 'resize_event', 'fullscreen_change', 'print_event']);
const NAVIGATION_TYPES = new Set<EventType>(['page_navigation', 'route_change', 'page_load', 'tab_switch', 'tab_created', 'tab_url_change', 'dom_ready', 'visibility_change']);
const ERROR_TYPES = new Set<EventType>(['runtime_exception', 'unhandled_rejection', 'resource_error', 'network_failed', 'capture_error']);
const LIFECYCLE_TYPES = new Set<EventType>(['capture_started', 'capture_stopped', 'capture_config_changed', 'permission_missing', 'debugger_attach_status', 'body_capture_status_changed']);

export function category_for_event_type(type: string): CategoryKey {
    if (USER_ACTION_TYPES.has(type as EventType)) return 'user_action';
    if (NAVIGATION_TYPES.has(type as EventType)) return 'navigation';
    if (ERROR_TYPES.has(type as EventType)) return 'error';
    if (type === 'network_request' || type === 'ws_message' || type === 'ws_frame') return 'network';
    if (type === 'console_event') return 'console';
    if (type === 'storage_change') return 'storage';
    if (type === 'cookie_change') return 'cookie';
    if (LIFECYCLE_TYPES.has(type as EventType)) return 'capture_lifecycle';
    return 'dom_data';
}
