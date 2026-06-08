// content/content_script.ts
import type { RecordConfig } from '../shared/types';
import { start_mouse_capture, stop_mouse_capture } from './mouse_capture';
import { start_keyboard_capture, stop_keyboard_capture } from './keyboard_capture';
import { start_scroll_capture, stop_scroll_capture } from './scroll_capture';
import { start_dom_capture, stop_dom_capture } from './dom_capture';
import { start_storage_capture, stop_storage_capture } from './storage_capture';
import { start_xhr_fetch_capture, stop_xhr_fetch_capture } from './xhr_fetch_capture';
import { start_network_hook, stop_network_hook } from './network_hook';
import { DEFAULT_CONFIG } from '../shared/constants';

let is_capturing = false;
let frame_id = 0;
let last_url = window.location.href;
let capture_id = '';
let capture_start_epoch_ms = 0;
let tab_id = 0;

// Determine frame ID
if (window !== window.top) {
    frame_id = Math.floor(Math.random() * 1000000);
}

console.log('Record All: Content Script loaded at', window.location.href);

chrome.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: (response: any) => void) => {
    console.log('Record All: Content received message:', message.action);
    if (message.action === 'start') {
        capture_id = message.capture_id ?? '';
        capture_start_epoch_ms = message.capture_start_epoch_ms ?? Date.now();
        tab_id = message.tab_id ?? 0;
        start_capture(message.config || DEFAULT_CONFIG);
        sendResponse({ success: true });
    } else if (message.action === 'stop') {
        stop_capture();
        sendResponse({ success: true });
    } else if (message.action === 'ping') {
        sendResponse({ is_capturing, frame_id });
    }
    return true;
});

// Check if recording is already active when content script loads
chrome.runtime.sendMessage({ action: 'get_status' }).then((response: any) => {
    if (response?.is_capturing && !is_capturing) {
        console.log('Record All: Recording already active, starting capture');
        start_capture(response.config || DEFAULT_CONFIG);
    }
}).catch((_err: unknown) => {
    // Extension context might not be ready
});

function start_capture(config: RecordConfig): void {
    if (is_capturing) return;

    is_capturing = true;
    console.log('Record All: Content capture started');

    // Send page load event
    send_event('page_load', {
        load_time_ms: performance.timing.loadEventEnd - performance.timing.navigationStart,
        dom_content_loaded_ms: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart
    });

    // Start capture modules based on config
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    start_mouse_capture(config, capture_id, capture_start_epoch_ms, tab_id, send_event as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    start_keyboard_capture(config, capture_id, capture_start_epoch_ms, tab_id, send_event as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    start_scroll_capture(send_event as any, { capture_id, capture_start_epoch_ms, tab_id });
    start_dom_capture(config, send_event);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    start_storage_capture(send_event as any, capture_id, capture_start_epoch_ms);
    start_xhr_fetch_capture(send_event);
    start_network_hook(send_event);

    // Visibility change
    document.addEventListener('visibilitychange', handle_visibility_change);

    // SPA navigation
    window.addEventListener('popstate', handle_navigation);
    window.addEventListener('hashchange', handle_navigation);

    // DOMContentLoaded (may have already fired)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', handle_dom_ready);
    } else {
        handle_dom_ready();
    }
}

function handle_navigation(): void {
    if (!is_capturing) return;
    const new_url = window.location.href;
    if (new_url === last_url) return;
    const from = last_url;
    last_url = new_url;
    send_event('navigation', { from, to: new_url });
}

function handle_dom_ready(): void {
    if (!is_capturing) return;
    send_event('dom_ready', { timestamp: Date.now() });
}

function stop_capture(): void {
    if (!is_capturing) return;

    is_capturing = false;

    stop_mouse_capture();
    stop_keyboard_capture();
    stop_scroll_capture();
    stop_dom_capture();
    stop_storage_capture();
    stop_xhr_fetch_capture();
    stop_network_hook();

    document.removeEventListener('visibilitychange', handle_visibility_change);
    window.removeEventListener('popstate', handle_navigation);
    window.removeEventListener('hashchange', handle_navigation);
}

function handle_visibility_change(): void {
    if (!is_capturing) return;

    send_event('tab_switch', {
        action: document.hidden ? 'deactivate' : 'activate',
        tab_title: document.title
    });
}

function send_event(type_or_event: string | Record<string, unknown>, data?: unknown): void {
    if (!is_capturing) return;

    // New format: called with (CaptureEvent, data) from migrated modules
    // Old format: called with (type: string, data) from un-migrated modules
    const event = typeof type_or_event === 'string'
        ? {
            session_id: '',
            relative_time: performance.now(),
            absolute_time: Date.now(),
            type: type_or_event,
            data,
            tab_id: 0,
            frame_id,
            url: window.location.href
        }
        : type_or_event;

    chrome.runtime.sendMessage({
        action: 'event',
        event
    }).catch((_err: unknown) => {
        // Ignore errors (e.g., extension context invalidated)
    });
}
