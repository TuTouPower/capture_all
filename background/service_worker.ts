// background/service_worker.ts
import { init_db, flush_all, get_session, list_sessions as storage_list_sessions, delete_session as storage_delete_session, get_events, get_network_requests, get_console_logs, create_session, update_session, write_events, write_requests, write_logs } from './storage';
import { setup_keepalive_listener, start_keepalive, stop_keepalive } from './keepalive';
import { start_network_capture, stop_network_capture } from './network_capture';
import { start_console_capture, stop_console_capture } from './console_capture';
import { export_json, export_html } from './exporter';
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
        case 'export_html':
            return { success: true, html: await export_html(message.session_id) };
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
    if (config.capture_console && config.capture_mode === 'advanced') {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]?.id) {
            const result = await start_console_capture(session_id, start_time, tabs[0].id, handle_console_log);
            if (!result.success) {
                console.warn('Record All: Console capture failed:', result.error);
            }
        }
    }

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

    // Stop console capture
    await stop_console_capture();

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

function handle_event(event: RecordEvent): { success: boolean } {
    if (!is_capturing || !current_session_id) return { success: true };

    // Set session_id and tab_id from context
    event.session_id = current_session_id;
    event.relative_time = event.absolute_time - start_time;

    // Store event
    write_events([event]).catch((err: unknown) => {
        console.error('Record All: Failed to write event:', err);
    });

    return { success: true };
}

function handle_network_request(request: NetworkRequest): void {
    if (!is_capturing) return;
    write_requests([request]).catch((err: unknown) => {
        console.error('Record All: Failed to write network request:', err);
    });
}

function handle_console_log(log: ConsoleLog): void {
    if (!is_capturing) return;
    write_logs([log]).catch((err: unknown) => {
        console.error('Record All: Failed to write console log:', err);
    });
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

// Global error handler
self.addEventListener('error', (event) => {
    console.error('Record All: SW error:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
    console.error('Record All: SW unhandled rejection:', event.reason);
});
