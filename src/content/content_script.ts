// content/content_script.ts
import type { CaptureConfig, CaptureEvent, EventType, RouteChangeData, DomReadyData, PageLoadData } from '../shared/types';
import { create_content_event, get_relative_time } from './content_event_utils';
import { category_for_event_type } from '../shared/event_category';
import { start_mouse_capture, stop_mouse_capture } from './mouse_capture';
import { start_keyboard_capture, stop_keyboard_capture } from './keyboard_capture';
import { start_scroll_capture, stop_scroll_capture } from './scroll_capture';
import { start_dom_capture, stop_dom_capture } from './dom_capture';
import { start_storage_capture, stop_storage_capture } from './storage_capture';
import { start_network_hook, stop_network_hook } from './network_hook';
import { start_clipboard_capture, stop_clipboard_capture } from './clipboard_capture';
import { start_form_submit_capture, stop_form_submit_capture } from './form_submit_capture';
import { start_focus_capture, stop_focus_capture } from './focus_capture';
import { start_visibility_capture, stop_visibility_capture } from './visibility_capture';
import { start_resize_capture, stop_resize_capture } from './resize_capture';
import { start_fullscreen_capture, stop_fullscreen_capture } from './fullscreen_capture';
import { start_print_capture, stop_print_capture } from './print_capture';
import { start_websocket_capture, stop_websocket_capture } from './websocket_capture';
import { DEFAULT_CONFIG } from '../shared/constants';
import { Logger, MessageLogTransport } from '../shared/logger';
import { start_status_poll, type CaptureStatusResponse } from '../shared/poll_capture_status';

/** Unified sender type accepted by all content capture modules. */
type ContentSender = (event: CaptureEvent, data?: unknown) => void;

const log_transport = new MessageLogTransport();
const logger = new Logger('content/script', log_transport);

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

logger.info('Content script loaded', { url: window.location.href });

chrome.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: (response: any) => void) => {
    logger.debug('Content received message', { action: message.action });
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

// Check if recording is already active when content script loads.
// BUG-004 修复：原实现只在加载时调用一次 get_status；若 SW 此时未采集就退出，
// 之后 SW 开始采集时给本 tab 发 sendMessage 会失败（"Receiving end does not exist"），
// 导致用户行为 / storage 事件 0 条。改为周期轮询，直到 SW 采集开始或脚本被卸载。
//
// 详见 tests/poll_capture_status.test.ts。
const stop_status_poll = start_status_poll({
    get_status: (): Promise<CaptureStatusResponse | null> =>
        chrome.runtime.sendMessage({ action: 'get_status' })
            .then((r: CaptureStatusResponse | null) => r)
            .catch(() => null),
    on_active: (resp: CaptureStatusResponse): void => {
        if (is_capturing) return;
        capture_id = resp.capture_id ?? '';
        capture_start_epoch_ms = resp.start_time ?? Date.now();
        tab_id = resp.tab_id ?? 0;
        logger.info('Recording already active (detected via poll), starting capture');
        start_capture((resp.config as CaptureConfig) || DEFAULT_CONFIG);
    },
    setInterval: (handler: () => void, ms: number) => window.setInterval(handler, ms),
    clearInterval: (id: unknown) => window.clearInterval(id as number),
});

function start_capture(config: CaptureConfig): void {
    if (is_capturing) return;

    is_capturing = true;
    logger.info('Content capture started');

    // Send page load event
    const page_load_data: PageLoadData = {
        url: window.location.href,
        title: document.title,
        load_event_time_ms: performance.timing.loadEventEnd - performance.timing.navigationStart || null,
        dom_content_loaded_time_ms: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart || null,
        navigation_start_time: performance.timeOrigin ? new Date(performance.timeOrigin).toISOString() : null,
    };
    send_capture_event('navigation', 'page_load', page_load_data);

    // Start capture modules based on config
    // Wrapper adapts send_event's union-param signature to the typed sender each module expects.
    const sender: ContentSender = (event, data) => send_event(event, data);
    start_mouse_capture(config, capture_id, capture_start_epoch_ms, tab_id, sender);
    start_keyboard_capture(config, capture_id, capture_start_epoch_ms, tab_id, sender);
    start_scroll_capture(sender, { capture_id, capture_start_epoch_ms, tab_id });
    start_dom_capture(config, send_event);
    start_storage_capture(sender, capture_id, capture_start_epoch_ms);
    start_network_hook(send_event);
    start_clipboard_capture(sender, capture_id, capture_start_epoch_ms, tab_id);
    start_form_submit_capture(sender, capture_id, capture_start_epoch_ms, tab_id);
    start_focus_capture(sender, capture_id, capture_start_epoch_ms, tab_id);
    start_visibility_capture(sender, capture_id, capture_start_epoch_ms, tab_id);
    start_resize_capture(sender, capture_id, capture_start_epoch_ms, tab_id);
    start_fullscreen_capture(sender, capture_id, capture_start_epoch_ms, tab_id);
    start_print_capture(sender, capture_id, capture_start_epoch_ms, tab_id);
    start_websocket_capture(sender, capture_id, capture_start_epoch_ms);

    logger.debug('All capture modules started', {
        modules: ['mouse', 'keyboard', 'scroll', 'dom', 'storage', 'network_hook', 'clipboard', 'form_submit', 'focus', 'visibility', 'resize', 'fullscreen', 'print', 'websocket'],
        config: {
            capture_network: config.capture_network,
            capture_console: config.capture_console,
            capture_response_body: config.capture_response_body,
        }
    });

    // SPA navigation — popstate + hashchange
    window.addEventListener('popstate', handle_popstate_navigation);
    window.addEventListener('hashchange', handle_hashchange_navigation);

    // DOMContentLoaded (may have already fired)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', handle_dom_ready);
    } else {
        handle_dom_ready();
    }
}

function handle_popstate_navigation(): void {
    if (!is_capturing) return;
    const new_url = window.location.href;
    if (new_url === last_url) return;
    const from = last_url;
    last_url = new_url;

    const data: RouteChangeData = {
        from_url: from,
        to_url: new_url,
        route_action: 'push_state',
        from_path: new URL(from).pathname,
        to_path: new URL(new_url).pathname,
        title: document.title,
        is_spa: true,
    };
    send_capture_event('navigation', 'route_change', data);
}

function handle_hashchange_navigation(event: HashChangeEvent): void {
    if (!is_capturing) return;
    const from = event.oldURL;
    const to = event.newURL;
    last_url = to;

    const data: RouteChangeData = {
        from_url: from,
        to_url: to,
        route_action: 'hash_change',
        from_path: new URL(from).pathname,
        to_path: new URL(to).pathname,
        title: document.title,
        is_spa: true,
    };
    send_capture_event('navigation', 'route_change', data);
}

function handle_dom_ready(): void {
    if (!is_capturing) return;
    const data: DomReadyData = {
        url: window.location.href,
        title: document.title,
        ready_state: document.readyState as 'loading' | 'interactive' | 'complete',
    };
    send_capture_event('navigation', 'dom_ready', data);
}

function stop_capture(): void {
    if (!is_capturing) return;

    is_capturing = false;
    logger.info('Content capture stopped');

    stop_mouse_capture();
    stop_keyboard_capture();
    stop_scroll_capture();
    stop_dom_capture();
    stop_storage_capture();
    stop_network_hook();
    stop_clipboard_capture();
    stop_form_submit_capture();
    stop_focus_capture();
    stop_visibility_capture();
    stop_resize_capture();
    stop_fullscreen_capture();
    stop_print_capture();
    stop_websocket_capture();

    // BUG-004: 停止轮询（避免 stop 后仍触发 start_capture）
    stop_status_poll();

    window.removeEventListener('popstate', handle_popstate_navigation);
    window.removeEventListener('hashchange', handle_hashchange_navigation);

    // Flush remaining log entries before shutdown
    log_transport.flush().catch(() => {});
}

/** Send a fully-typed CaptureEvent for navigation/lifecycle events */
function send_capture_event(category: 'navigation' | 'capture_lifecycle', type: EventType, data: unknown): void {
    const event = create_content_event({
        capture_id,
        category,
        type,
        relative_time_ms: get_relative_time(capture_start_epoch_ms),
        tab_id,
        frame_id,
        url: window.location.href,
        source: 'content_script',
    });
    chrome.runtime.sendMessage({
        action: 'event',
        event: { ...event, data }
    }).catch((_err: unknown) => {
        // Ignore errors (e.g., extension context invalidated)
    });
}

function send_event(type_or_event: string | CaptureEvent, data?: unknown): void {
    if (!is_capturing) return;

    // New format: called with (CaptureEvent, data) from migrated modules
    // Old format: called with (type: string, data) from un-migrated modules
    const event = typeof type_or_event === 'string'
        ? {
            capture_id,
            category: category_for_event_type(type_or_event),
            relative_time_ms: get_relative_time(capture_start_epoch_ms),
            absolute_time: new Date().toISOString(),
            type: type_or_event,
            data,
            tab_id,
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
