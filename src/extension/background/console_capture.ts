// background/console_capture.ts
import type { CaptureEvent, ConsoleEventData } from '../../shared/types';
import { create_base_event, get_relative_time } from '../../shared/event_utils';
import { truncate_console_args } from '../../shared/redaction';
import { Logger } from '../../shared/logger';
import { get_app_log_transport } from './app_log_storage';
import { register_session, unregister_session, should_handle_event } from './cdp_event_router';

const logger = new Logger('background/console', get_app_log_transport());

let is_capturing = false;
let attached_by_us = false;
let capture_id: string;
let start_time: number;
let tab_id: number;
let send_to_background: (event: CaptureEvent) => void;

export async function start_console_capture(
    cid: string,
    startTime: number,
    targetTabId: number,
    _redactData: boolean,
    sender: (event: CaptureEvent) => void,
    already_attached?: boolean
): Promise<{ success: boolean; error?: string }> {
    if (is_capturing) return { success: true };

    capture_id = cid;
    start_time = startTime;
    tab_id = targetTabId;
    send_to_background = sender;

    try {
        if (already_attached) {
            attached_by_us = false;
        } else {
            try {
                await chrome.dbg.attach({ tabId: tab_id }, '1.3');
                attached_by_us = true;
            } catch {
                attached_by_us = false;
            }
        }
        await chrome.dbg.sendCommand({ tabId: tab_id }, 'Runtime.enable');

        chrome.dbg.onEvent.addListener(handle_debugger_event);
        is_capturing = true;
        logger.info('Console capture started', { tab_id, attached_by_us, already_attached });

        return { success: true };
    } catch (error) {
        // Runtime.enable 失败时若已 attach 则 best-effort detach，避免残留 debugger attachment
        if (attached_by_us) {
            try {
                await chrome.dbg.detach({ tabId: tab_id });
            } catch {
                // ignore detach errors during cleanup
            }
            attached_by_us = false;
        }
        is_capturing = false;
        return {
            success: false,
            error: `Failed to attach debugger: ${error}. Please open F12 for DevTools mode.`
        };
    }
}

export function is_console_active(): boolean {
    return is_capturing;
}

export function get_attached_tab_id(): number | null {
    return is_capturing ? tab_id : null;
}

export async function stop_console_capture(): Promise<void> {
    if (!is_capturing) return;
    is_capturing = false;
    logger.info('Console capture stopped');

    chrome.dbg.onEvent.removeListener(handle_debugger_event);

    if (attached_by_us) {
        try {
            await chrome.dbg.detach({ tabId: tab_id });
        } catch {
            // Ignore detach errors
        }
        attached_by_us = false;
    }
}

function map_console_level(level: string): 'log' | 'warn' | 'info' | 'debug' | 'error' {
    if (level === 'warning') return 'warn';
    if (['log', 'warn', 'info', 'debug', 'error'].includes(level)) {
        return level as 'log' | 'warn' | 'info' | 'debug' | 'error';
    }
    return 'log';
}

function map_severity(level: string): 'info' | 'warning' | 'error' {
    if (level === 'error') return 'error';
    if (level === 'warn' || level === 'warning') return 'warning';
    return 'info';
}

function handle_debugger_event(source: { tabId?: number; sessionId?: string }, method: string, params: any): void {
    if (!is_capturing) return;

    // Target.* lifecycle 事件用于注册/注销 session，先处理（仅校验 tabId）
    if (method === 'Target.attachedToTarget') {
        if (source?.tabId !== tab_id) return;
        const child_session = params?.sessionId;
        if (child_session) {
            register_session(child_session);
            const child_target = { tabId: tab_id, sessionId: child_session };
            chrome.dbg.sendCommand(child_target, 'Runtime.enable').catch((err: any) => {
                logger.debug('sub_target_runtime_enable_failed', { sessionId: child_session, error: String(err).slice(0, 80) });
            });
            logger.debug('sub_target_console_runtime_enabled', { sessionId: child_session });
        }
        return;
    }

    if (method === 'Target.detachedFromTarget') {
        if (source?.tabId !== tab_id) return;
        const child_session = params?.sessionId;
        if (child_session) {
            unregister_session(child_session);
        }
        return;
    }

    // 其他事件按 tabId + 已登记 session 严格过滤
    if (!should_handle_event(source, tab_id)) return;

    if (method !== 'Runtime.consoleAPICalled') return;

    const args = params.args.map((arg: any) => arg.value || arg.description || '');
    const truncated_args = truncate_console_args(args);
    const level = map_console_level(params.type);
    const frame = params.stackTrace?.callFrames?.[0];

    const base = create_base_event({
        capture_id,
        category: 'console',
        type: 'console_event',
        relative_time_ms: get_relative_time(start_time),
        tab_id,
        url: frame?.url || '',
        source: 'background',
        severity: map_severity(level),
    });

    const data: ConsoleEventData = {
        level,
        args_preview: truncated_args,
        args_status: 'captured',
        stack_trace: params.stackTrace?.description || null,
        source_url: frame?.url || null,
        line: frame?.lineNumber ?? null,
        column: frame?.columnNumber ?? null,
        repeat_count: null,
        related_network_request_id: null,
    };

    send_to_background({ ...base, data });
}
