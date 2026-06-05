// background/service_worker.ts
import { init_db, flush_all, get_session, list_sessions as storage_list_sessions, delete_session as storage_delete_session, get_events, get_network_requests, get_console_logs, create_session, update_session, write_events, write_requests, write_logs } from './storage';
import { setup_keepalive_listener, start_keepalive, stop_keepalive } from './keepalive';
import { start_network_capture, stop_network_capture, enable_response_body_capture } from './network_capture';
import { start_console_capture, stop_console_capture } from './console_capture';
import { start_exception_capture, stop_exception_capture } from './exception_capture';
import { start_cookie_capture, stop_cookie_capture } from './cookie_capture';
import { export_json, export_jsonl, export_html, export_har } from './exporter';
import { start_bridge_client, stop_bridge_client, type AgentBridgeClientDeps } from './agent_bridge_client';
import type { UserConfig } from '../shared/types';
import type { RecordConfig, RecordEvent, NetworkRequest, ConsoleLog, Session } from '../shared/types';
import { DEFAULT_CONFIG } from '../shared/constants';

let is_capturing = false;
let current_session: Session | null = null;
let current_session_id: string | null = null;
let start_time: number = 0;
let current_config: RecordConfig = DEFAULT_CONFIG;

// Initialize
chrome.runtime.onInstalled.addListener(async () => {
    await init_db();
    console.log('Record All: Extension installed');
    start_agent_bridge();
});

// Setup keepalive listener
setup_keepalive_listener();

// Message handler
chrome.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: (response: any) => void) => {
    handle_message(message).then(sendResponse).catch(error => {
        console.error('Record All: Message handler error:', error);
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
            return { is_capturing, session_id: current_session_id, config: current_config };
        case 'get_session_data':
            return get_session_data(message.session_id);
        case 'list_sessions':
            return storage_list_sessions();
        case 'delete_session':
            await storage_delete_session(message.session_id);
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
        default:
            return { success: false, error: 'Unknown action' };
    }
}

async function get_session_data(session_id: string): Promise<any> {
    const session = await get_session(session_id);
    if (!session) return { success: false, error: 'Session not found' };

    const [events, network_requests, console_logs] = await Promise.all([
        get_events(session_id, 0, 100000),
        get_network_requests(session_id, 0, 100000),
        get_console_logs(session_id, 0, 100000)
    ]);

    return { success: true, session, events, network_requests, console_logs };
}

async function start_recording(session_id: string, config: RecordConfig): Promise<{ success: boolean; error?: string }> {
    if (is_capturing) {
        return { success: false, error: 'Already recording' };
    }

    // Create session in IndexedDB
    const session: Session = {
        id: session_id,
        start_time: Date.now(),
        end_time: null,
        config,
        stats: { event_count: 0, request_count: 0, log_count: 0, dom_changes: 0 }
    };

    try {
        await create_session(session);
    } catch (err) {
        return { success: false, error: `Failed to create session: ${err}` };
    }

    current_session = session;
    current_session_id = session_id;
    current_config = config;
    start_time = Date.now();
    is_capturing = true;

    // Start keepalive
    start_keepalive();

    // Start network capture if enabled
    if (config.capture_network) {
        start_network_capture(session_id, start_time, config, handle_network_request);
    }

    // Start console capture if enabled (advanced mode)
    let debugger_attached_tab_id: number | null = null;
    if (config.capture_console && config.capture_mode === 'advanced') {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]?.id) {
            const result = await start_console_capture(session_id, start_time, tabs[0].id, config.redact_data, handle_console_log);
            if (!result.success) {
                console.warn('Record All: Console capture failed:', result.error);
            } else {
                debugger_attached_tab_id = tabs[0].id;
            }
            const ex_result = await start_exception_capture(session_id, start_time, tabs[0].id, handle_console_log);
            if (!ex_result.success) {
                console.warn('Record All: Exception capture failed:', ex_result.error);
            } else {
                debugger_attached_tab_id = tabs[0].id;
            }
        }
    }

    // Enable response body capture (advanced mode). Reuses an already-attached
    // debugger when present so we don't conflict with console/exception capture.
    if (config.capture_network && config.capture_response_body && config.capture_mode === 'advanced') {
        let target_tab_id = debugger_attached_tab_id;
        let already_attached = target_tab_id !== null;
        if (target_tab_id === null) {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            target_tab_id = tabs[0]?.id ?? null;
            already_attached = false;
        }
        if (target_tab_id !== null) {
            const result = await enable_response_body_capture(target_tab_id, already_attached);
            if (!result.success) {
                console.warn('Record All: Response body capture failed:', result.error);
            }
        }
    }

    // Start cookie change capture (always, regardless of capture_network)
    start_cookie_capture(session_id, start_time, handle_cookie_change);

    // Notify all content scripts to start
    const all_tabs = await chrome.tabs.query({});
    console.log('Record All: Notifying', all_tabs.length, 'tabs to start');
    for (const tab of all_tabs) {
        if (tab.id) {
            try {
                await chrome.tabs.sendMessage(tab.id, { action: 'start', config });
                console.log('Record All: Sent start to tab', tab.id, tab.url);
            } catch (err) {
                console.warn('Record All: Failed to send start to tab', tab.id, err);
            }
        }
    }

    console.log('Record All: Recording started');
    return { success: true };
}

async function stop_recording(): Promise<{ success: boolean }> {
    if (!is_capturing) {
        return { success: false };
    }

    is_capturing = false;

    // Update session end_time
    if (current_session) {
        current_session.end_time = Date.now();
        try {
            await update_session(current_session);
        } catch (err) {
            console.error('Record All: Failed to update session:', err);
        }
    }

    // Stop keepalive
    stop_keepalive();

    // Stop network capture
    stop_network_capture();

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

    current_session = null;
    console.log('Record All: Recording stopped');
    return { success: true };
}

async function persist_stats(): Promise<void> {
    if (!current_session) return;
    try {
        await update_session(current_session);
    } catch (err) {
        console.error('Record All: Failed to persist session stats:', err);
    }
}

async function handle_event(event: RecordEvent): Promise<{ success: boolean }> {
    if (!is_capturing || !current_session_id || !current_session) return { success: true };

    // Set session_id and tab_id from context
    event.session_id = current_session_id;
    event.relative_time = event.absolute_time - start_time;

    try {
        await write_events([event]);
        current_session.stats.event_count++;
        if (event.type === 'dom_change') {
            current_session.stats.dom_changes++;
        }
        await persist_stats();
    } catch (err) {
        console.error('Record All: Failed to write event:', err);
    }

    return { success: true };
}

async function handle_cookie_change(event: RecordEvent): Promise<void> {
    if (!is_capturing) return;
    await handle_event(event);
}

async function handle_network_request(request: NetworkRequest): Promise<void> {
    if (!is_capturing || !current_session) return;
    try {
        await write_requests([request]);
        current_session.stats.request_count++;
        await persist_stats();
    } catch (err) {
        console.error('Record All: Failed to write network request:', err);
    }
}

async function handle_console_log(log: ConsoleLog): Promise<void> {
    if (!is_capturing || !current_session) return;
    try {
        await write_logs([log]);
        current_session.stats.log_count++;
        await persist_stats();
    } catch (err) {
        console.error('Record All: Failed to write console log:', err);
    }
}

// Tab activation listener - send start to new tab's content script
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    if (!is_capturing) return;

    console.log('Record All: Tab activated:', activeInfo.tabId);
    // Send start to the newly activated tab
    try {
        await chrome.tabs.sendMessage(activeInfo.tabId, {
            action: 'start',
            config: current_config
        });
        console.log('Record All: Sent start to tab', activeInfo.tabId);
    } catch (err) {
        console.warn('Record All: Failed to send start to tab', activeInfo.tabId, err);
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
    const now = Date.now();
    handle_event({
        session_id: '',
        relative_time: 0,
        absolute_time: now,
        type: 'tab_created',
        data: {
            tab_id: tab.id ?? -1,
            url: tab.url || tab.pendingUrl || '',
            opener_tab_id: tab.openerTabId ?? null,
            window_id: tab.windowId,
            title: tab.title || ''
        },
        tab_id: tab.id ?? -1,
        frame_id: 0,
        url: tab.url || tab.pendingUrl || ''
    } as any);
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
    const now = Date.now();
    handle_event({
        session_id: '',
        relative_time: 0,
        absolute_time: now,
        type: 'tab_url_change',
        data: {
            tab_id: tabId,
            url: new_url,
            title: tab.title || ''
        },
        tab_id: tabId,
        frame_id: 0,
        url: new_url
    } as any);
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
        get_status: () => ({ active_session_id: current_session_id }),
        extension_version: chrome.runtime.getManifest().version
    };
    start_bridge_client(bridge_deps);
}

// Global error handler
self.addEventListener('error', (event) => {
    console.error('Record All: SW error:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
    console.error('Record All: SW unhandled rejection:', event.reason);
});
