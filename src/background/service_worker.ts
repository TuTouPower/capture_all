// background/service_worker.ts
import {
    init_db, flush_all,
    get_capture, list_captures as storage_list_captures,
    delete_capture as storage_delete_capture,
    get_events_by_category, get_network_requests, get_console_events,
    create_capture, update_capture,
    write_events, write_network_requests, write_console_events,
} from './storage';
import { setup_keepalive_listener, start_keepalive, stop_keepalive } from './keepalive';
import { start_network_capture, stop_network_capture, set_cdp_body_event_handler } from './network_capture';
import { start_console_capture, stop_console_capture } from './console_capture';
import { start_exception_capture, stop_exception_capture } from './exception_capture';
import { start_cookie_capture, stop_cookie_capture } from './cookie_capture';
import { export_json, export_jsonl, export_html, export_har, export_app_logs } from './exporter';
import { start_bridge_client, stop_bridge_client, type AgentBridgeClientDeps } from './agent_bridge_client';
import { start_body_capture, stop_body_capture_with_cleanup, get_body_capture_result } from './body_capture_coordinator';
import { build_cdp_only_request, type CdpBodyEvent } from './network_correlator';
import { redact_url } from '../shared/redaction';
import { create_base_event, get_relative_time } from '../shared/event_utils';
import { Logger } from '../shared/logger';
import { get_app_log_transport } from './app_log_storage';
import { load_user_config } from '../shared/user_config';
import type {
    UserConfig, RecordConfig, CaptureEvent, CaptureRecord,
    NetworkRequestData, ConsoleEventData,
    TabSwitchData, TabCreatedData, TabUrlChangeData,
    CaptureStartedData, CaptureStoppedData,
} from '../shared/types';
import { DEFAULT_CONFIG } from '../shared/constants';

const logger = new Logger('background/sw', get_app_log_transport());

let is_capturing = false;
let current_capture: CaptureRecord | null = null;
let current_capture_id: string | null = null;
let start_time: number = 0;
let current_config: RecordConfig = DEFAULT_CONFIG;

// Track last active tab for tab_switch events
const last_active_tab = new Map<number, { tab_id: number; url: string }>();

// Initialize
chrome.runtime.onInstalled.addListener(async () => {
    await init_db();
    const config = await load_user_config();
    Logger.set_level(config.log_level);
    logger.info('Extension installed');
    start_agent_bridge();
});

// Setup keepalive listener
setup_keepalive_listener();

// Message handler
chrome.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: (response: any) => void) => {
    handle_message(message).then(sendResponse).catch(error => {
        logger.error('Message handler error', error);
        sendResponse({ success: false, error: error.message });
    });
    return true; // Keep channel open for async response
});

async function handle_message(message: any): Promise<any> {
    switch (message.action) {
        case 'start':
            return start_recording(message.session_id, message.config || DEFAULT_CONFIG);
        case 'stop':
            return stop_recording();
        case 'event':
            return handle_event(message.event);
        case 'get_status':
            return {
                is_capturing,
                capture_id: current_capture_id,
                current_capture,
                config: current_config,
                body_capture: get_body_capture_result()
            };
        case 'get_session_data':
            return get_capture_data(message.session_id);
        case 'list_sessions':
            return storage_list_captures();
        case 'delete_session':
            await storage_delete_capture(message.session_id);
            return { success: true };
        case 'export_json':
            return { success: true, json: await export_json(message.session_id) };
        case 'export_jsonl':
            return { success: true, jsonl: await export_jsonl(message.session_id) };
        case 'export_html':
            return { success: true, html: await export_html(message.session_id) };
        case 'export_har':
            return { success: true, har: await export_har(message.session_id) };
        case 'restart_bridge':
            stop_bridge_client();
            start_agent_bridge();
            return { success: true };
        case 'test_bridge_fetch':
            try {
                const cfg = await get_user_config_for_bridge();
                const bridge_url = cfg.agent_bridge_url || '';
                const res = await fetch(`${bridge_url}/health`);
                const data = await res.json();
                return { success: true, bridge_url, health: data };
            } catch (e: unknown) {
                return { success: false, error: e instanceof Error ? e.message : String(e) };
            }
        case 'app_log_batch': {
            const transport = get_app_log_transport();
            for (const entry of (message.entries || [])) {
                transport.write(entry);
            }
            return { success: true };
        }
        case 'export_app_logs': {
            try {
                const content = await export_app_logs(message.options || { format: 'json' });
                return { success: true, data: content };
            } catch (e) {
                return { success: false, error: e instanceof Error ? e.message : String(e) };
            }
        }
        case 'clear_app_logs': {
            await get_app_log_transport().clear();
            return { success: true };
        }
        case 'get_app_log_count': {
            const count = await get_app_log_transport().count();
            return { success: true, count };
        }
        default:
            return { success: false, error: 'Unknown action' };
    }
}

async function get_capture_data(capture_id: string): Promise<any> {
    const capture = await get_capture(capture_id);
    if (!capture) return { success: false, error: 'Capture not found' };

    const [user_events, nav_events, network_requests, console_events, error_events, storage_changes, cookie_changes] = await Promise.all([
        get_events_by_category(capture_id, 'user_action', 0, 100000),
        get_events_by_category(capture_id, 'navigation', 0, 100000),
        get_network_requests(capture_id, 0, 100000),
        get_console_events(capture_id, 0, 100000),
        get_events_by_category(capture_id, 'error', 0, 100000),
        get_events_by_category(capture_id, 'storage', 0, 100000),
        get_events_by_category(capture_id, 'cookie', 0, 100000)
    ]);

    const all_events = [...user_events, ...nav_events, ...error_events, ...storage_changes, ...cookie_changes];

    return {
        success: true,
        session: capture,
        events: all_events,
        nav_events,
        network_requests,
        console_logs: console_events,
        error_events,
        storage_changes,
        cookie_changes
    };
}

/** Map RecordConfig.capture_mode to CaptureRecord.mode */
function map_capture_mode(mode: 'basic' | 'advanced'): 'standard' | 'deep' | 'custom' {
    return mode === 'advanced' ? 'deep' : 'standard';
}

async function start_recording(session_id: string, config: RecordConfig): Promise<{ success: boolean; error?: string }> {
    if (is_capturing) {
        return { success: false, error: 'Already recording' };
    }

    const now = Date.now();
    const now_iso = new Date().toISOString();

    // Get initial tab info for CaptureRecord
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const active_tab = tabs[0];
    const start_url = active_tab?.url || '';
    const tab_id = active_tab?.id ?? 0;
    const window_id = (active_tab as { windowId?: number })?.windowId ?? null;

    // Create CaptureRecord in IndexedDB
    const capture: CaptureRecord = {
        capture_id: session_id,
        name: 'Capture ' + new Date().toLocaleString(),
        status: 'capturing',
        mode: map_capture_mode(config.capture_mode),
        started_at: now_iso,
        ended_at: null,
        duration_ms: 0,
        start_url,
        end_url: null,
        tab_id,
        window_id,
        config_snapshot: config,
        stats: {
            event_count: 0,
            nav_count: 0,
            request_count: 0,
            log_count: 0,
            error_count: 0,
            storage_change_count: 0,
            cookie_change_count: 0,
        },
        tags: [],
        created_at: now_iso,
        updated_at: now_iso,
    };

    try {
        await create_capture(capture);
    } catch (err) {
        return { success: false, error: `Failed to create capture: ${err}` };
    }

    current_capture = capture;
    current_capture_id = session_id;
    current_config = config;
    start_time = now;
    is_capturing = true;

    // Write capture_lifecycle.capture_started event
    const started_data: CaptureStartedData = {
        capture_id: session_id,
        mode: map_capture_mode(config.capture_mode),
        config_snapshot: config,
        start_url,
        trigger: 'popup',
    };
    const started_event = create_base_event({
        capture_id: session_id,
        category: 'capture_lifecycle',
        type: 'capture_started',
        relative_time_ms: 0,
        tab_id,
        url: start_url,
        source: 'background',
    });
    await write_events([{ ...started_event, data: started_data } as any]);

    // Start keepalive
    start_keepalive();

    // Start network capture if enabled
    if (config.capture_network) {
        start_network_capture(session_id, start_time, config, tab_id, handle_network_request);
    }

    // Start console capture if enabled (advanced mode)
    let debugger_attached_tab_id: number | null = null;
    if (config.capture_console && config.capture_mode === 'advanced') {
        if (tabs[0]?.id) {
            const result = await start_console_capture(session_id, start_time, tabs[0].id, config.redact_data, handle_console_log);
            if (!result.success) {
                logger.warn('Console capture failed', result.error);
            } else {
                debugger_attached_tab_id = tabs[0].id;
            }
            const ex_result = await start_exception_capture(session_id, start_time, tabs[0].id, handle_console_log);
            if (!ex_result.success) {
                logger.warn('Exception capture failed', ex_result.error);
            } else {
                debugger_attached_tab_id = tabs[0].id;
            }
        }
    }

    // Enable response body capture via coordinator (advanced mode)
    if (config.capture_network && config.capture_response_body && config.capture_mode === 'advanced') {
        let target_tab_id: number | null = null;
        if (config.capture_console) {
            target_tab_id = debugger_attached_tab_id;
        }
        if (target_tab_id === null) {
            target_tab_id = active_tab?.id ?? null;
        }

        const get_active_tab_url = async () => {
            const t = await chrome.tabs.query({ active: true, currentWindow: true });
            return t[0]?.url || null;
        };

        const get_bridge_config = async () => {
            const cfg = await get_user_config_for_bridge();
            return {
                bridge_url: cfg.agent_bridge_url || '',
                bridge_token: cfg.agent_bridge_token || '',
                cdp_ports: [] // Use defaults in detect_external_cdp
            };
        };

        // Set up CDP body event handler for correlator-based dispatch
        set_cdp_body_event_handler((cdp_event: CdpBodyEvent) => {
            handle_cdp_body_event(cdp_event);
        });

        const result = await start_body_capture(
            session_id, start_time, config, target_tab_id,
            {
                get_active_tab_url,
                get_bridge_config,
                on_network_request: handle_network_request
            }
        );

        if (current_capture) {
            current_capture.body_capture_mode = result.mode;
            current_capture.body_capture_status = result.status;
            current_capture.body_capture_failure_reason = result.failure_reason;
            current_capture.body_capture_message = result.message;
            await update_capture(current_capture);
        }
    } else {
        // Record body capture as not enabled
        if (current_capture) {
            current_capture.body_capture_mode = 'none';
            current_capture.body_capture_status = 'not_enabled';
            current_capture.body_capture_message = 'Response body capture not enabled';
            await update_capture(current_capture);
        }
    }

    // Start cookie change capture (always, regardless of capture_network)
    start_cookie_capture(session_id, start_time, handle_cookie_change);

    // Notify all content scripts to start — pass capture context
    const all_tabs = await chrome.tabs.query({});
    logger.info(`Notifying ${all_tabs.length} tabs to start`);
    for (const tab of all_tabs) {
        if (tab.id) {
            try {
                await chrome.tabs.sendMessage(tab.id, {
                    action: 'start',
                    config,
                    capture_id: session_id,
                    capture_start_epoch_ms: start_time,
                    tab_id: tab.id,
                });
                logger.debug(`Sent start to tab ${tab.id}`, { url: tab.url });
            } catch (err) {
                logger.warn(`Failed to send start to tab ${tab.id}`, err);
            }
        }
    }

    // Track initial active tab
    if (active_tab?.id) {
        last_active_tab.set((active_tab as { windowId?: number }).windowId ?? 0, { tab_id: active_tab.id, url: active_tab.url || '' });
    }

    logger.info('Recording started');
    return { success: true };
}

async function stop_recording(): Promise<{ success: boolean }> {
    if (!is_capturing) {
        return { success: false };
    }

    is_capturing = false;

    // Write capture_lifecycle.capture_stopped event
    if (current_capture && current_capture_id) {
        const duration_ms = Date.now() - start_time;
        const stopped_event = create_base_event({
            capture_id: current_capture_id,
            category: 'capture_lifecycle',
            type: 'capture_stopped',
            relative_time_ms: get_relative_time(start_time),
            tab_id: current_capture.tab_id,
            url: current_capture.start_url,
            source: 'background',
        });
        const stopped_data: CaptureStoppedData = {
            capture_id: current_capture_id,
            reason: 'user_stop',
            duration_ms,
            stats: current_capture.stats,
        };
        await write_events([{ ...stopped_event, data: stopped_data } as any]);

        // Update capture end fields
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        current_capture.status = 'completed';
        current_capture.ended_at = new Date().toISOString();
        current_capture.duration_ms = duration_ms;
        current_capture.end_url = tabs[0]?.url || null;
        current_capture.updated_at = new Date().toISOString();

        try {
            await update_capture(current_capture);
        } catch (err) {
            logger.error('Failed to update capture', err);
        }
    }

    // Stop keepalive
    stop_keepalive();

    // Stop network capture
    stop_network_capture();
    set_cdp_body_event_handler(null);

    // Stop body capture coordinator (cleanup bridge/external CDP)
    const get_bridge_config_for_cleanup = async () => {
        const cfg = await get_user_config_for_bridge();
        return {
            bridge_url: cfg.agent_bridge_url || '',
            bridge_token: cfg.agent_bridge_token || '',
            cdp_ports: []
        };
    };
    await stop_body_capture_with_cleanup({ get_bridge_config: get_bridge_config_for_cleanup });

    // Stop cookie capture
    stop_cookie_capture();

    // Stop console capture
    await stop_console_capture();
    await stop_exception_capture();

    // Notify all content scripts to stop
    const all_tabs = await chrome.tabs.query({});
    for (const tab of all_tabs) {
        if (tab.id) {
            try {
                await chrome.tabs.sendMessage(tab.id, { action: 'stop' });
            } catch {
                // Tab might not have content script
            }
        }
    }

    // Flush all buffered data
    await flush_all();

    current_capture = null;
    last_active_tab.clear();
    logger.info('Recording stopped');
    return { success: true };
}

async function persist_stats(): Promise<void> {
    if (!current_capture) return;
    try {
        current_capture.updated_at = new Date().toISOString();
        await update_capture(current_capture);
    } catch (err) {
        logger.error('Failed to persist capture stats', err);
    }
}

async function handle_event(event: CaptureEvent | any): Promise<{ success: boolean }> {
    if (!is_capturing || !current_capture_id || !current_capture) return { success: true };

    // Route fallback body hook events separately
    if (event.type === 'network_body_hook') {
        await handle_fallback_body_event(event.data);
        return { success: true };
    }

    // Set capture_id and relative_time_ms from context
    event.capture_id = current_capture_id;
    if (event.absolute_time && typeof event.absolute_time === 'number') {
        event.relative_time_ms = event.absolute_time - start_time;
    }

    try {
        await write_events([event]);
        current_capture.stats.event_count++;
        if (event.category === 'navigation') {
            current_capture.stats.nav_count++;
        }
        if (event.category === 'storage') {
            current_capture.stats.storage_change_count++;
        }
        if (event.category === 'cookie') {
            current_capture.stats.cookie_change_count++;
        }
        if (event.category === 'error') {
            current_capture.stats.error_count++;
        }
        await persist_stats();
    } catch (err) {
        logger.error('Failed to write event', err);
    }

    return { success: true };
}

async function handle_cookie_change(event: CaptureEvent): Promise<void> {
    if (!is_capturing) return;
    await handle_event(event);
}

// CDP body event handler — dispatched via network_capture's set_cdp_body_event_handler
function handle_cdp_body_event(cdp_event: CdpBodyEvent): void {
    if (!is_capturing || !current_capture) return;

    // Build request directly from CDP body event
    const request = build_cdp_only_request(
        cdp_event,
        current_capture.capture_id,
        start_time
    );
    handle_network_request(request);
}

// Fallback network body hook events from content script
async function handle_fallback_body_event(data: any): Promise<void> {
    if (!is_capturing || !current_capture) return;

    const url = current_config.redact_data && current_config.redact_url_query
        ? redact_url(data.url || '', true)
        : data.url || '';

    const request: NetworkRequestData = {
        capture_id: current_capture_id ?? undefined,
        event_id: `fallback_${Date.now().toString(36)}`,
        request_id: `fallback_${Date.now()}`,
        method: data.method || 'GET',
        url,
        url_status: 'captured',
        status_code: data.status || null,
        status_text: null,
        protocol: null,
        resource_type: (data.resource_type || 'xhr') as NetworkRequestData['resource_type'],
        initiator: null,
        duration_ms: data.duration_ms || null,
        start_time_ms: null,
        end_time_ms: null,
        request_headers: {},
        response_headers: {},
        headers_status: 'captured',
        request_body: data.request_body ?? null,
        request_body_status: data.request_body_status || 'not_enabled',
        response_body: data.response_body ?? null,
        response_preview: null,
        response_body_status: data.response_body_status || 'failed',
        mime_type: null,
        request_size_bytes: null,
        response_size_bytes: null,
        transfer_size_bytes: null,
        from_cache: null,
        cache_status: null,
        error_text: null,
        capture_method: 'fallback_hook',
        body_capture_mode: 'fallback_hook',
    };

    await handle_network_request(request);
}

async function handle_network_request(payload: { event: CaptureEvent; data: NetworkRequestData } | NetworkRequestData): Promise<void> {
    if (!is_capturing || !current_capture) return;
    const request: NetworkRequestData = 'event' in payload ? (payload as { data: NetworkRequestData }).data : (payload as NetworkRequestData);
    if (!request.capture_id) request.capture_id = current_capture_id ?? undefined;
    if (!request.event_id) request.event_id = `net_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    try {
        await write_network_requests([request]);
        current_capture.stats.request_count++;
        await persist_stats();
    } catch (err) {
        logger.error('Failed to write network request', err);
    }
}

async function handle_console_log(event: CaptureEvent): Promise<void> {
    if (!is_capturing || !current_capture) return;
    try {
        const data = event.data as ConsoleEventData;
        if (data) {
            data.capture_id = current_capture_id ?? undefined;
            data.event_id = event.event_id;
        }
        await write_console_events([data]);
        current_capture.stats.log_count++;
        await persist_stats();
    } catch (err) {
        logger.error('Failed to write console log', err);
    }
}

// Tab activation listener - send start to new tab's content script
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    if (!is_capturing) return;

    // Write tab_switch event with from/to tracking
    const prev = last_active_tab.get(activeInfo.windowId);
    const tab = await (chrome.tabs as any).get(activeInfo.tabId) as { url?: string; id?: number; windowId?: number };
    const tab_url = tab.url || '';

    const switch_data: TabSwitchData = {
        from_tab_id: prev?.tab_id ?? null,
        to_tab_id: activeInfo.tabId,
        from_url: prev?.url ?? null,
        to_url: tab_url,
    };

    const switch_event = create_base_event({
        capture_id: current_capture_id!,
        category: 'navigation',
        type: 'tab_switch',
        relative_time_ms: get_relative_time(start_time),
        tab_id: activeInfo.tabId,
        url: tab_url,
        source: 'background',
    });
    await write_events([{ ...switch_event, data: switch_data } as any]);

    // Update tracking
    last_active_tab.set(activeInfo.windowId, { tab_id: activeInfo.tabId, url: tab_url });

    // Send start to the newly activated tab
    try {
        await chrome.tabs.sendMessage(activeInfo.tabId, {
            action: 'start',
            config: current_config,
            capture_id: current_capture_id,
            capture_start_epoch_ms: start_time,
            tab_id: activeInfo.tabId,
        });
        logger.debug(`Sent start to tab ${activeInfo.tabId}`);
    } catch (err) {
        logger.warn(`Failed to send start to tab ${activeInfo.tabId}`, err);
    }
});

// Tab close listener - session continues, just logs
chrome.tabs.onRemoved.addListener((_tabId: number) => {
    if (!is_capturing) return;
    // Tab closed during recording - data already captured, session continues
});

// Tab created listener
chrome.tabs.onCreated.addListener((tab) => {
    if (!is_capturing) return;

    const data: TabCreatedData = {
        new_tab_id: tab.id ?? -1,
        opener_tab_id: tab.openerTabId ?? null,
        url: tab.url || tab.pendingUrl || '',
    };

    const event = create_base_event({
        capture_id: current_capture_id!,
        category: 'navigation',
        type: 'tab_created',
        relative_time_ms: get_relative_time(start_time),
        tab_id: tab.id ?? -1,
        url: tab.url || tab.pendingUrl || '',
        source: 'background',
    });
    write_events([{ ...event, data } as any]);
});

// Tab URL change listener
const last_tab_urls = new Map<number, string>();
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!is_capturing) return;
    if (changeInfo.status !== 'loading') return;
    const new_url = changeInfo.url || tab.url || '';
    if (!new_url) return;
    const prev_url = last_tab_urls.get(tabId);
    if (prev_url === new_url) return;
    last_tab_urls.set(tabId, new_url);

    const data: TabUrlChangeData = {
        from_url: prev_url ?? null,
        to_url: new_url,
        change_reason: null,
    };

    const event = create_base_event({
        capture_id: current_capture_id!,
        category: 'navigation',
        type: 'tab_url_change',
        relative_time_ms: get_relative_time(start_time),
        tab_id: tabId,
        url: new_url,
        source: 'background',
    });
    write_events([{ ...event, data } as any]);
});

chrome.tabs.onRemoved.addListener((tabId: number) => {
    last_tab_urls.delete(tabId);
});

// Agent bridge client
async function get_user_config_for_bridge(): Promise<Pick<UserConfig, 'agent_bridge_enabled' | 'agent_bridge_url' | 'agent_bridge_token' | 'agent_bridge_poll_interval_ms'>> {
    const result = await chrome.storage.local.get('user_config');
    return result.user_config ?? {};
}

function start_agent_bridge(): void {
    const bridge_deps: AgentBridgeClientDeps = {
        get_user_config: get_user_config_for_bridge,
        start_recording: (session_id, config) => start_recording(session_id, config),
        stop_recording: () => stop_recording(),
        get_status: () => ({ active_session_id: current_capture_id }),
        extension_version: chrome.runtime.getManifest().version
    };
    start_bridge_client(bridge_deps);
}

// Global error handler
self.addEventListener('error', (event) => {
    logger.error('SW error', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
    logger.error('SW unhandled rejection', event.reason);
});
