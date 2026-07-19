// background/service_worker.ts
import {
    init_db, flush_all,
    get_capture, list_captures as storage_list_captures,
    delete_capture as storage_delete_capture,
    create_capture, update_capture,
    write_events, write_network_requests, write_console_events,
    start_periodic_flush, stop_periodic_flush,
} from './storage';
import { setup_keepalive_listener, start_keepalive, stop_keepalive } from './keepalive';
import { start_network_capture, stop_network_capture, set_cdp_body_event_handler } from './network_capture';
import { start_console_capture, stop_console_capture, is_console_active } from './console_capture';
import { start_exception_capture, stop_exception_capture, is_exception_active } from './exception_capture';
import { start_cookie_capture, stop_cookie_capture } from './cookie_capture';
import * as capture_state from './capture_state';
import { export_json, export_jsonl, export_html, export_har, export_app_logs } from './exporter';
import { start_bridge_client, stop_bridge_client, type AgentBridgeClientDeps } from './agent_bridge_client';
import { start_body_capture, stop_body_capture_with_cleanup, get_body_capture_result } from './body_capture_coordinator';
import { build_cdp_only_request, type CdpBodyEvent } from './network_correlator';
import { redact_url } from '../../shared/redaction';
import { create_base_event, get_relative_time } from '../../shared/event_utils';
import { create_empty_capture_stats, increment_capture_event_stats } from '../shared/capture_stats';
import { category_for_event_type } from '../../shared/event_category';
import { Logger } from '../../shared/logger';
import { get_app_log_transport } from './app_log_storage';
import { load_user_config } from '../../shared/user_config';
import { normalize_agent_bridge_config } from '../../shared/agent_bridge_config';
import type {
    UserConfig, CaptureConfig, CaptureEvent, CaptureRecord,
    NetworkRequestData, ConsoleEventData, WsFrameData,
    TabSwitchData, TabCreatedData, TabUrlChangeData,
    CaptureStartedData, CaptureStoppedData,
    BodyCaptureStartResult,
} from '../../shared/types';
import { DEFAULT_CONFIG } from '../../shared/constants';

const logger = new Logger('background/sw', get_app_log_transport());

function serialize_error(error: unknown): Record<string, unknown> {
    if (error instanceof Error) {
        return { name: error.name, message: error.message, stack: error.stack };
    }
    return { message: String(error) };
}

/** content script 尚未注入时 sendMessage 常失败；短延迟重试，与 poll_capture_status 双保险。 */
async function tabs_send_message_retry(
    tab_id: number,
    message: unknown,
    opts: { retries?: number; delay_ms?: number; label?: string } = {}
): Promise<boolean> {
    const retries = opts.retries ?? 3;
    const delay_ms = opts.delay_ms ?? 200;
    const label = opts.label ?? 'message';
    let last_err: unknown;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await chrome.tabs.sendMessage(tab_id, message);
            if (attempt > 1) {
                logger.debug(`sendMessage ${label} ok after retry`, { tab_id, attempt });
            }
            return true;
        } catch (err) {
            last_err = err;
            if (attempt < retries) {
                await new Promise((r) => setTimeout(r, delay_ms * attempt));
            }
        }
    }
    logger.warn(`Failed to send ${label} to tab ${tab_id} after ${retries} tries`, last_err);
    return false;
}

async function run_stop_step(name: string, step: () => void | Promise<void>): Promise<void> {
    try {
        await step();
    } catch (error: unknown) {
        logger.error(`Stop step failed: ${name}`, serialize_error(error));
    }
}

// Bind chrome.dbg alias to real chrome.debugger API (debugger is reserved in TS)
(chrome as any).dbg = (chrome as any).debugger;

let is_capturing = false;
let current_capture: CaptureRecord | null = null;
let current_capture_id: string | null = null;
let start_time: number = 0;
let current_config: CaptureConfig = DEFAULT_CONFIG;

// Track last active tab for tab_switch events
const last_active_tab = new Map<number, { tab_id: number; url: string }>();

// Track which tab has the shared CDP debugger attached
let debugger_attached_tab_id: number | null = null;

// Initialize
chrome.runtime.onInstalled.addListener(async () => {
    await init_db();
    const config = await load_user_config();
    Logger.set_level(config.log_level);
    logger.info('Extension installed');
    if (config.agent_bridge_enabled) {
        start_agent_bridge();
        logger.info('Agent bridge started');
    }
});

async function initialize_agent_bridge(): Promise<void> {
    const config = normalize_agent_bridge_config(await load_user_config());
    if (config.agent_bridge_enabled) {
        start_agent_bridge();
        logger.info('Agent bridge started');
    }
}

setTimeout(() => {
    initialize_agent_bridge().catch((error: unknown) => {
        logger.error('Agent bridge initialization failed', serialize_error(error));
    });
}, 0);

// Clean up stale capture state on service worker restart
async function cleanup_stale_capture_state(): Promise<void> {
    // 读取活跃采集持久化键（T030 新增）+ 旧键（向后兼容）
    const result = await chrome.storage.local.get([
        'is_capturing', 'current_capture',
        'active_capture_id', 'active_capture_start_ms', 'active_capture_config', 'active_capture_generation',
    ]);
    const stale_capture_id = result.active_capture_id as string | undefined;
    const legacy_active = result.is_capturing || stale_capture_id;
    if (legacy_active) {
        logger.warn('Detected stale capturing state, cleaning up', { stale_capture_id });
        const stale_capture = (result.current_capture as CaptureRecord | null) ?? null;
        if (stale_capture?.capture_id) {
            await update_capture({
                ...stale_capture,
                status: 'completed',
                ended_at: new Date().toISOString(),
                duration_ms: stale_capture.started_at
                    ? Date.now() - new Date(stale_capture.started_at).getTime()
                    : 0,
            });
        } else if (stale_capture_id) {
            // 仅有 active_capture_id 无完整 record：按 id 加载并终态化
            try {
                const rec = await get_capture(stale_capture_id);
                if (rec) {
                    await update_capture({
                        ...rec,
                        status: 'completed',
                        ended_at: new Date().toISOString(),
                        duration_ms: rec.started_at
                            ? Date.now() - new Date(rec.started_at).getTime()
                            : 0,
                    });
                }
            } catch (err) {
                logger.warn('Failed to load stale capture by id', { stale_capture_id, err: String(err).slice(0, 80) });
            }
        }
        await chrome.storage.local.set({
            is_capturing: false,
            current_capture: null,
            active_capture_id: null,
            active_capture_start_ms: null,
            active_capture_config: null,
            active_capture_generation: null,
        });
        logger.info('Stale capture state cleaned up');
    }
}

setTimeout(() => {
    cleanup_stale_capture_state().catch((error: unknown) => {
        logger.error('Stale capture cleanup failed', serialize_error(error));
    });
}, 0);

// Setup keepalive listener
setup_keepalive_listener();

// Message handler
chrome.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: (response: any) => void) => {
    handle_message(message).then(sendResponse).catch(error => {
        logger.error('Message handler error', serialize_error(error));
        sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
    });
    return true; // Keep channel open for async response
});

async function handle_message(message: any): Promise<any> {
    switch (message.action) {
        case 'start':
            return start_capture(message.capture_id, message.config || DEFAULT_CONFIG);
        case 'stop':
            return stop_capture();
        case 'event':
            return handle_event(message.event);
        case 'get_status':
            return {
                is_capturing,
                capture_id: current_capture_id,
                current_capture,
                config: current_config,
                start_time,
                tab_id: current_capture?.tab_id ?? 0,
                body_capture: get_body_capture_result()
            };
        case 'get_capture_data':
            return get_capture_data(message.capture_id);
        case 'list_captures':
            return storage_list_captures();
        case 'delete_capture':
            await storage_delete_capture(message.capture_id);
            return { success: true };
        case 'export_json':
            return { success: true, json: await export_json(message.capture_id) };
        case 'export_jsonl':
            return { success: true, jsonl: await export_jsonl(message.capture_id) };
        case 'export_html':
            return { success: true, html: await export_html(message.capture_id) };
        case 'export_har':
            return { success: true, har: await export_har(message.capture_id) };
        case 'restart_bridge':
            stop_bridge_client();
            {
                const cfg = await load_user_config();
                if (cfg.agent_bridge_enabled) start_agent_bridge();
            }
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
                if (!entry.id) continue;
                transport.write(entry);
            }
            return { success: true };
        }
        case 'export_app_logs': {
            try {
                const content = await export_app_logs(message.options || {});
                return { success: true, data: content };
            } catch (e) {
                return { success: false, error: e instanceof Error ? e.message : String(e) };
            }
        }
        case 'clear_app_logs': {
            await get_app_log_transport().clear();
            return { success: true };
        }
        case 'get_app_log_size': {
            const size_bytes = await get_app_log_transport().get_total_size_bytes();
            return { success: true, size_bytes };
        }
        case 'set_log_level': {
            if (message.level) {
                Logger.set_level(message.level);
                await chrome.storage.local.set({ user_config: { ...(await load_user_config()), log_level: message.level } });
            }
            return { success: true };
        }
        case 'flush_app_logs': {
            await get_app_log_transport().flush();
            return { success: true };
        }
        default:
            logger.warn('Unknown message action', { action: message.action });
            return { success: false, error: 'Unknown action' };
    }
}

async function get_capture_data(capture_id: string): Promise<any> {
    const capture = await get_capture(capture_id);
    if (!capture) return { success: false, error: 'Capture not found' };

    // P0.43: flush all write buffers before reading, so that stats (persisted
    // immediately via persist_stats) and events (buffered, flushed periodically
    // every FLUSH_INTERVAL_MS) are consistent for the caller.
    await flush_all();

    return {
        success: true,
        capture,
    };
}

async function start_capture(capture_id: string, config: CaptureConfig): Promise<{ success: boolean; error?: string }> {
    // 串行化：等待前一次 start/stop 完成
    return capture_state.run_exclusive(async () => {
        if (is_capturing || capture_state.get_state().phase !== 'idle') {
            logger.warn('start_capture called while not idle', { phase: capture_state.get_state().phase });
            return { success: false, error: 'Already capturing' };
        }

        const start_handle = capture_state.begin_start(capture_id, config);

        try {
            const result = await start_capture_inner(capture_id, config);
            if (result.success) {
                start_handle.commit();
            } else {
                start_handle.rollback();
            }
            return result;
        } catch (err) {
            start_handle.rollback();
            throw err;
        }
    });
}

async function start_capture_inner(capture_id: string, config: CaptureConfig): Promise<{ success: boolean; error?: string }> {
    if (is_capturing) {
        logger.warn('start_capture_inner called while already capturing');
        return { success: false, error: 'Already capturing' };
    }

    try {
        return await start_capture_inner_impl(capture_id, config);
    } catch (err) {
        // 任一子系统启动失败：逆序清理已启动的部分，避免半启动 + 永久 capturing
        logger.error('start_capture_inner failed, rolling back', serialize_error(err));
        try {
            await stop_capture_inner();
        } catch (cleanup_err) {
            logger.error('rollback stop_capture_inner failed', serialize_error(cleanup_err));
        }
        return { success: false, error: `Start failed: ${err}` };
    }
}

async function start_capture_inner_impl(capture_id: string, config: CaptureConfig): Promise<{ success: boolean; error?: string }> {
    if (is_capturing) {
        logger.warn('start_capture_inner_impl called while already capturing');
        return { success: false, error: 'Already capturing' };
    }

    const now = Date.now();
    const now_iso = new Date().toISOString();

    // Get initial tab info for CaptureRecord
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const active_tab = tabs[0];
    const start_url = active_tab?.url || '';
    const tab_title = active_tab?.title || '';
    const tab_id = active_tab?.id ?? 0;
    const window_id = (active_tab as { windowId?: number })?.windowId ?? null;

    // Build tags from config toggle fields
    const cfg = config as unknown as Record<string, unknown>;
    const tags: string[] = [];
    if (cfg.event_count_enabled !== false) tags.push('用户行为');
    if (cfg.nav_count_enabled !== false) tags.push('页面导航');
    if (config.capture_network) tags.push('网络请求');
    if (config.capture_console) tags.push('控制台');
    if (cfg.error_count_enabled !== false) tags.push('错误异常');
    if (cfg.storage_change_count_enabled !== false) tags.push('Storage');
    if (cfg.cookie_change_count_enabled !== false) tags.push('Cookie');

    // Create CaptureRecord in IndexedDB
    const capture: CaptureRecord = {
        capture_id: capture_id,
        name: 'Capture ' + new Date().toLocaleString(),
        status: 'capturing',
        started_at: now_iso,
        ended_at: null,
        duration_ms: 0,
        start_url,
        end_url: null,
        tab_id,
        window_id,
        config_snapshot: config,
        stats: create_empty_capture_stats(),
        tags,
        url: start_url,
        tab_title,
        created_at: now_iso,
        updated_at: now_iso,
    };

    try {
        await create_capture(capture);
    } catch (err) {
        return { success: false, error: `Failed to create capture: ${err}` };
    }

    current_capture = capture;
    current_capture_id = capture_id;
    current_config = config;
    start_time = now;
    is_capturing = true;

    // Write capture_lifecycle.capture_started event
    const started_data: CaptureStartedData = {
        capture_id: capture_id,
        config_snapshot: config,
        start_url,
        trigger: 'popup',
    };
    const started_event = create_base_event({
        capture_id: capture_id,
        category: 'capture_lifecycle',
        type: 'capture_started',
        relative_time_ms: 0,
        tab_id,
        url: start_url,
        source: 'background',
    });
    await write_events([{ ...started_event, data: started_data }]);

    // Start keepalive
    start_keepalive();

    // Start periodic flush to ensure buffered events reach IndexedDB promptly
    start_periodic_flush();

    // Start network capture if enabled
    if (config.capture_network) {
        start_network_capture(capture_id, start_time, config, tab_id, handle_network_request);
    }

    // Start console capture if enabled
    if (config.capture_console) {
        if (tabs[0]?.id) {
            const tab_id = tabs[0].id;

            // Attach CDP debugger once for all subsystems (console + exception + body)
            let cdp_attached = false;
            try {
                await chrome.dbg.attach({ tabId: tab_id }, '1.3');
                cdp_attached = true;
                debugger_attached_tab_id = tab_id;
                logger.info('CDP debugger attached', { tab_id });
            } catch (e) {
                logger.warn('CDP attach failed', String(e));
            }

            const result = await start_console_capture(
                capture_id, start_time, tab_id, config.redact_data, handle_console_log,
                cdp_attached
            );
            if (!result.success) {
                logger.warn('Console capture failed', result.error);
            }

            const ex_result = await start_exception_capture(
                capture_id, start_time, tab_id, handle_console_log,
                cdp_attached
            );
            if (!ex_result.success) {
                logger.warn('Exception capture failed', ex_result.error);
            }
        }
    }

    // Enable response body capture via coordinator
    if (config.capture_network && config.capture_response_body) {
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
            capture_id, start_time, config, target_tab_id,
            {
                get_active_tab_url,
                get_bridge_config,
                on_network_request: handle_network_request
            },
            debugger_attached_tab_id
        );

        if (current_capture) {
            current_capture.body_capture_mode = result.mode;
            current_capture.body_capture_status = result.status;
            current_capture.body_capture_failure_reason = result.failure_reason;
            current_capture.body_capture_message = result.message;
            await update_capture(current_capture);
        }
        logger.info(`Body capture started via ${result.mode}`, { status: result.status, message: result.message });
    } else {
        // Note: body capture not enabled
        if (current_capture) {
            current_capture.body_capture_mode = 'none';
            current_capture.body_capture_status = 'not_enabled';
            current_capture.body_capture_message = 'Response body capture not enabled';
            await update_capture(current_capture);
        }
    }

    // Start cookie change capture (always, regardless of capture_network)
    start_cookie_capture(capture_id, start_time, handle_cookie_change);

    // Notify all content scripts to start — pass capture context
    const all_tabs = await chrome.tabs.query({});
    const capturable_tabs = all_tabs.filter(t => /^https?:\/\//.test(t.url || ''));
    logger.info(`Notifying ${capturable_tabs.length} tabs to start (of ${all_tabs.length} total)`);
    for (const tab of capturable_tabs) {
        if (tab.id) {
            const ok = await tabs_send_message_retry(tab.id, {
                action: 'start',
                config,
                capture_id: capture_id,
                capture_start_epoch_ms: start_time,
                tab_id: tab.id,
            }, { label: 'start' });
            if (ok) {
                logger.debug(`Sent start to tab ${tab.id}`, { url: tab.url });
            }
        }
    }

    // Track initial active tab
    if (active_tab?.id) {
        last_active_tab.set((active_tab as { windowId?: number }).windowId ?? 0, { tab_id: active_tab.id, url: active_tab.url || '' });
    }

    // 持久化活跃采集状态，SW 重启时 cleanup_stale_capture_state 读取恢复/终态化
    try {
        await chrome.storage.local.set({
            active_capture_id: capture_id,
            active_capture_start_ms: now,
            active_capture_config: config,
            active_capture_generation: capture_state.current_generation(),
        });
    } catch (err) {
        logger.warn('Failed to persist active capture state', { error: String(err).slice(0, 80) });
    }

    logger.info('Capture started');
    return { success: true };
}

async function stop_capture(): Promise<{ success: boolean }> {
    // 串行化：等待前一次 start/stop 完成
    return capture_state.run_exclusive(async () => {
        if (!is_capturing && capture_state.get_state().phase === 'idle') {
            return { success: true };
        }
        const stop_handle = capture_state.begin_stop();
        try {
            const result = await stop_capture_inner();
            if (result.success) {
                stop_handle.commit();
            }
            return result;
        } catch (err) {
            // 异常时也回到 idle，避免卡在 stopping
            stop_handle.commit();
            throw err;
        }
    });
}

async function stop_capture_inner(): Promise<{ success: boolean }> {
    if (!is_capturing) {
        return { success: true };
    }

    // 不立即翻 is_capturing=false：让 in-flight 回调继续 drain，
    // 通过 capture_state.phase='stopping' 拒绝新 start/stop 命令（T029）。

    // Reset shared CDP debugger tracking
    debugger_attached_tab_id = null;

    // 1. 先停生产者（让 in-flight 回调自然结束）
    await run_stop_step('stop_keepalive', () => stop_keepalive());
    await run_stop_step('stop_network_capture', () => stop_network_capture());
    await run_stop_step('clear_cdp_body_handler', () => set_cdp_body_event_handler(null));

    const get_bridge_config_for_cleanup = async () => {
        const cfg = await get_user_config_for_bridge();
        return {
            bridge_url: cfg.agent_bridge_url || '',
            bridge_token: cfg.agent_bridge_token || '',
            cdp_ports: []
        };
    };
    await run_stop_step('stop_body_capture', () => stop_body_capture_with_cleanup({ get_bridge_config: get_bridge_config_for_cleanup }));
    await run_stop_step('stop_cookie_capture', () => stop_cookie_capture());
    await run_stop_step('stop_console_capture', () => stop_console_capture());
    await run_stop_step('stop_exception_capture', () => stop_exception_capture());

    await run_stop_step('notify_content_scripts_stop', async () => {
        const all_tabs = await chrome.tabs.query({});
        for (const tab of all_tabs) {
            if (tab.id) {
                await tabs_send_message_retry(tab.id, { action: 'stop' }, {
                    retries: 2,
                    delay_ms: 100,
                    label: 'stop',
                });
            }
        }
    });

    // 2. drain：停 flush 调度 + 最后一次 flush 落库剩余事件
    await run_stop_step('stop_periodic_flush', () => { stop_periodic_flush(); });
    await run_stop_step('flush_all', () => flush_all());

    // 3. drain 完成后翻 is_capturing=false，回调入口不再处理新事件
    is_capturing = false;

    // 4. 写 stopped lifecycle event + 更新 CaptureRecord（含 drain 后的最终 stats）
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
        await run_stop_step('write_stopped_event', () => write_events([{ ...stopped_event, data: stopped_data }]));

        await run_stop_step('update_capture', async () => {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            current_capture!.status = 'completed';
            current_capture!.ended_at = new Date().toISOString();
            current_capture!.duration_ms = duration_ms;
            current_capture!.end_url = tabs[0]?.url || null;
            current_capture!.updated_at = new Date().toISOString();
            await update_capture(current_capture!);
        });
        await run_stop_step('flush_stopped_event', () => flush_all());
    }

    // 5. 清空持久化活跃采集状态
    await run_stop_step('clear_active_capture_state', async () => {
        try {
            await chrome.storage.local.set({
                active_capture_id: null,
                active_capture_start_ms: null,
                active_capture_config: null,
                active_capture_generation: null,
            });
        } catch (err) {
            logger.warn('Failed to clear active capture state', { error: String(err).slice(0, 80) });
        }
    });

    current_capture = null;
    last_active_tab.clear();
    logger.info('Capture stopped');
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
    event.category = event.category || category_for_event_type(event.type);
    if (event.absolute_time) {
        const absolute_ms = typeof event.absolute_time === 'number'
            ? event.absolute_time
            : Date.parse(event.absolute_time);
        if (Number.isFinite(absolute_ms)) {
            event.relative_time_ms = absolute_ms - start_time;
        }
    }
    if (typeof event.relative_time_ms !== 'number' || event.relative_time_ms > 10_000_000_000) {
        event.relative_time_ms = Date.now() - start_time;
    }

    try {
        await write_events([event]);
        current_capture.stats = increment_capture_event_stats(current_capture.stats, event.category);
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
        request_body_encoding: data.request_body ? 'utf8' : null,
        request_body_bytes: data.request_body ? new TextEncoder().encode(data.request_body).length : null,
        request_body_mime: null,
        response_body: data.response_body ?? null,
        response_preview: data.response_preview ?? null,
        response_body_status: data.response_body_status || 'failed',
        response_body_encoding: data.response_body ? 'utf8' : null,
        response_body_bytes: data.response_body ? new TextEncoder().encode(data.response_body).length : null,
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

function normalize_network_request(request: NetworkRequestData): void {
    if (!request.request_id) request.request_id = `nr_${Date.now().toString(36)}`;
    if (request.url_status === undefined) request.url_status = 'captured';
    if (request.headers_status === undefined) request.headers_status = 'captured';
    if (request.request_body_status === undefined) request.request_body_status = 'not_enabled';
    if (request.response_body_status === undefined) request.response_body_status = 'not_enabled';
    if (request.capture_method === undefined) request.capture_method = 'web_request';
    if (request.body_capture_mode === undefined) request.body_capture_mode = 'none';
}

async function handle_network_request(payload: { event: CaptureEvent; data: NetworkRequestData | WsFrameData } | NetworkRequestData): Promise<void> {
    if (!is_capturing || !current_capture) return;

    const event = 'event' in payload ? (payload as { event: CaptureEvent; data: NetworkRequestData | WsFrameData }).event : null;
    const data = 'event' in payload ? (payload as { data: NetworkRequestData | WsFrameData }).data : (payload as NetworkRequestData);

    if (event?.type === 'ws_frame') {
        const frame = data as WsFrameData;
        if (!event.capture_id) event.capture_id = current_capture_id ?? '';
        event.data = frame;
        try {
            await write_events([event]);
            current_capture.stats.event_count = (current_capture.stats.event_count || 0) + 1;
            await persist_stats();
        } catch (err) {
            logger.error('Failed to write ws_frame event', err);
        }
        return;
    }

    const request = data as NetworkRequestData;
    if (!request.capture_id) request.capture_id = current_capture_id ?? undefined;
    if (!request.event_id) request.event_id = `net_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    normalize_network_request(request);
    try {
        await write_network_requests([request]);
        current_capture.stats.request_count++;
        current_capture.stats.total_body_bytes += (request.response_body_bytes || 0) + (request.request_body_bytes || 0);
        await persist_stats();
    } catch (err) {
        logger.error('Failed to write network request', err);
    }
}

async function handle_console_log(event: CaptureEvent): Promise<void> {
    if (!is_capturing || !current_capture) return;
    const data = event.data as ConsoleEventData;
    if (!data) return;
    if (!current_capture_id) {
        logger.warn('handle_console_log skipped: capture_id is empty');
        return;
    }
    try {
        data.capture_id = current_capture_id;
        data.event_id = event.event_id;
        await write_console_events([data]);
        current_capture.stats.log_count++;
        await persist_stats();
    } catch (err) {
        logger.error('Failed to write console log', err);
    }
}

async function update_capture_body_state(result: BodyCaptureStartResult): Promise<void> {
    if (!current_capture) return;
    current_capture.body_capture_mode = result.mode;
    current_capture.body_capture_status = result.status;
    current_capture.body_capture_failure_reason = result.failure_reason;
    current_capture.body_capture_message = result.message;
    await update_capture(current_capture);
}

// Tab activation listener - send start to new tab's content script
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    if (!is_capturing) return;
    // 捕获当前 generation，await 后校验避免跨采集写入
    const gen = capture_state.current_generation();
    const cap_id = current_capture_id;
    const cap_start = start_time;
    const cap_config = current_config;
    logger.debug(`Tab activated: ${activeInfo.tabId}`);

    // Write tab_switch event with from/to tracking
    const prev = last_active_tab.get(activeInfo.windowId);
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (!capture_state.is_active_generation(gen)) return; // await 后采集已切换
    const tab_url = tab.url || '';

    const switch_data: TabSwitchData = {
        from_tab_id: prev?.tab_id ?? null,
        to_tab_id: activeInfo.tabId,
        from_url: prev?.url ?? null,
        to_url: tab_url,
    };

    const switch_event = create_base_event({
        capture_id: cap_id!,
        category: 'navigation',
        type: 'tab_switch',
        relative_time_ms: get_relative_time(cap_start),
        tab_id: activeInfo.tabId,
        url: tab_url,
        source: 'background',
    });
    await write_events([{ ...switch_event, data: switch_data }]);
    if (!capture_state.is_active_generation(gen)) return;

    // Update tracking
    last_active_tab.set(activeInfo.windowId, { tab_id: activeInfo.tabId, url: tab_url });

    // Send start to the newly activated tab（content script 可能尚未 ready，重试）
    const start_ok = await tabs_send_message_retry(activeInfo.tabId, {
        action: 'start',
        config: cap_config,
        capture_id: cap_id,
        capture_start_epoch_ms: cap_start,
        tab_id: activeInfo.tabId,
    }, { label: 'start-on-activate' });
    if (!capture_state.is_active_generation(gen)) return;
    if (start_ok) {
        logger.debug(`Sent start to tab ${activeInfo.tabId}`);
    }

    // Retry CDP-based capture on tab switch if previously failed (e.g. chrome:// URL at start)
    if (cap_config.capture_console && !is_console_active()) {
        const result = await start_console_capture(
            cap_id!, cap_start, activeInfo.tabId,
            cap_config.redact_data, handle_console_log
        );
        if (!capture_state.is_active_generation(gen)) return;
        if (result.success) {
            debugger_attached_tab_id = activeInfo.tabId;
            logger.info('Console capture retry succeeded on tab ' + activeInfo.tabId);
        }
    }
    if (current_config.capture_console && !is_exception_active()) {
        const result = await start_exception_capture(
            current_capture_id!, start_time, activeInfo.tabId, handle_event,
            debugger_attached_tab_id === activeInfo.tabId
        );
        if (result.success) {
            debugger_attached_tab_id = activeInfo.tabId;
            logger.info('Exception capture retry succeeded on tab ' + activeInfo.tabId);
        }
    }
    if (cap_config.capture_network && cap_config.capture_response_body) {
        const body_result = await start_body_capture(
            cap_id!, cap_start, cap_config, activeInfo.tabId,
            {
                get_active_tab_url: async () => tab_url,
                get_bridge_config: async () => {
                    const uc = await load_user_config();
                    return { bridge_url: uc.agent_bridge_url, bridge_token: uc.agent_bridge_token, cdp_ports: [] };
                },
                on_network_request: handle_network_request
            },
            debugger_attached_tab_id
        );
        if (!capture_state.is_active_generation(gen)) return;
        await update_capture_body_state(body_result);
        if (body_result.mode === 'extension_cdp' || body_result.mode === 'external_cdp_bridge') {
            logger.info('Body capture retry succeeded on tab ' + activeInfo.tabId);
        }
    }
});

// Tab close listener - capture continues, just logs
chrome.tabs.onRemoved.addListener((_tabId: number) => {
    if (!is_capturing) return;
    // Tab closed during capture - data already captured
});

// Tab created listener
chrome.tabs.onCreated.addListener(async (tab) => {
    if (!is_capturing) return;
    logger.debug(`Tab created: ${tab.id}`, { url: tab.url || tab.pendingUrl });

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
    await write_events([{ ...event, data }]);
});

// Tab URL change listener
const last_tab_urls = new Map<number, string>();
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (!is_capturing) return;
    if (changeInfo.status !== 'loading') return;
    const new_url = changeInfo.url || tab.url || '';
    if (!new_url) return;
    const prev_url = last_tab_urls.get(tabId);
    if (prev_url === new_url) return;
    last_tab_urls.set(tabId, new_url);
    logger.debug(`Tab URL changed: ${tabId}`, { from: prev_url, to: new_url });

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
    await write_events([{ ...event, data }]);

    // Retry CDP-based capture if navigating from restricted URL to normal page
    const is_restricted = prev_url?.startsWith('chrome://') || prev_url?.startsWith('chrome-extension://') || prev_url?.startsWith('about:');
    const is_normal = new_url.startsWith('http://') || new_url.startsWith('https://');
    if (is_restricted && is_normal) {
        if (current_config.capture_console && !is_console_active()) {
            const result = await start_console_capture(
                current_capture_id!, start_time, tabId,
                current_config.redact_data, handle_console_log
            );
            if (result.success) {
                debugger_attached_tab_id = tabId;
                logger.info('Console capture retry succeeded on tab ' + tabId + ' (URL changed)');
            }
        }
        if (current_config.capture_console && !is_exception_active()) {
            const result = await start_exception_capture(
                current_capture_id!, start_time, tabId, handle_event,
                debugger_attached_tab_id === tabId
            );
            if (result.success) {
                debugger_attached_tab_id = tabId;
                logger.info('Exception capture retry succeeded on tab ' + tabId + ' (URL changed)');
            }
        }
        if (current_config.capture_network && current_config.capture_response_body) {
            const body_result = await start_body_capture(
                current_capture_id!, start_time, current_config, tabId,
                {
                    get_active_tab_url: async () => new_url,
                    get_bridge_config: async () => {
                        const uc = await load_user_config();
                        return { bridge_url: uc.agent_bridge_url, bridge_token: uc.agent_bridge_token, cdp_ports: [] };
                    },
                    on_network_request: handle_network_request
                },
                debugger_attached_tab_id
            );
            await update_capture_body_state(body_result);
            if (body_result.mode === 'extension_cdp' || body_result.mode === 'external_cdp_bridge') {
                logger.info('Body capture retry succeeded on tab ' + tabId + ' (URL changed)');
            }
        }
    }
});

chrome.tabs.onRemoved.addListener((tabId: number) => {
    last_tab_urls.delete(tabId);
});

// Agent bridge client
async function get_user_config_for_bridge(): Promise<Pick<UserConfig, 'agent_bridge_enabled' | 'agent_bridge_url' | 'agent_bridge_token' | 'agent_bridge_poll_interval_ms' | 'browser_label'>> {
    const result = await chrome.storage.local.get('user_config');
    return result.user_config ?? {};
}

function start_agent_bridge(): void {
    const bridge_deps: AgentBridgeClientDeps = {
        get_user_config: get_user_config_for_bridge,
        start_capture: (capture_id, config) => start_capture(capture_id, config),
        stop_capture: () => stop_capture(),
        get_status: () => ({ active_capture_id: current_capture_id }),
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
