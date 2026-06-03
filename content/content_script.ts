// content/content_script.ts
import type { RecordConfig } from '../shared/types';
import { start_mouse_capture, stop_mouse_capture } from './mouse_capture';
import { start_keyboard_capture, stop_keyboard_capture } from './keyboard_capture';
import { start_scroll_capture, stop_scroll_capture } from './scroll_capture';
import { start_dom_capture, stop_dom_capture } from './dom_capture';
import { DEFAULT_CONFIG } from '../shared/constants';

let is_capturing = false;
let frame_id = 0;

// Determine frame ID
if (window !== window.top) {
    frame_id = Math.floor(Math.random() * 1000000);
}

console.log('Record All: Content Script loaded at', window.location.href);

chrome.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: (response: any) => void) => {
    console.log('Record All: Content received message:', message.action);
    if (message.action === 'start') {
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
    start_mouse_capture(config, send_event);
    start_keyboard_capture(config, send_event);
    start_scroll_capture(send_event);
    start_dom_capture(config, send_event);

    // Visibility change
    document.addEventListener('visibilitychange', handle_visibility_change);
}

function stop_capture(): void {
    if (!is_capturing) return;

    is_capturing = false;

    stop_mouse_capture();
    stop_keyboard_capture();
    stop_scroll_capture();
    stop_dom_capture();

    document.removeEventListener('visibilitychange', handle_visibility_change);
}

function handle_visibility_change(): void {
    if (!is_capturing) return;

    send_event('tab_switch', {
        action: document.hidden ? 'deactivate' : 'activate',
        tab_title: document.title
    });
}

function send_event(type: string, data: any): void {
    if (!is_capturing) return;

    const event = {
        session_id: '',  // Will be set by background
        relative_time: performance.now(),
        absolute_time: Date.now(),
        type,
        data,
        tab_id: 0,  // Will be set by background
        frame_id,
        url: window.location.href
    };

    chrome.runtime.sendMessage({
        action: 'event',
        event
    }).catch((_err: unknown) => {
        // Ignore errors (e.g., extension context invalidated)
    });
}
