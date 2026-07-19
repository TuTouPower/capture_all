// background/exception_capture.ts
import type { CaptureEvent, RuntimeExceptionData } from '../../shared/types';
import { create_base_event, get_relative_time } from '../../shared/event_utils';
import { Logger } from '../../shared/logger';
import { get_app_log_transport } from './app_log_storage';
import { register_session, unregister_session, should_handle_event } from './cdp_event_router';

const logger = new Logger('background/exception', get_app_log_transport());

let is_capturing = false;
let capture_id: string;
let start_time: number;
let tab_id: number;
let send_event: (event: CaptureEvent) => void;
let attached_by_us = false;

export async function start_exception_capture(
    cid: string,
    start_time_ms: number,
    target_tab_id: number,
    sender: (event: CaptureEvent) => void,
    already_attached?: boolean
): Promise<{ success: boolean; error?: string }> {
    if (is_capturing) return { success: true };

    capture_id = cid;
    start_time = start_time_ms;
    tab_id = target_tab_id;
    send_event = sender;

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
        logger.info('Exception capture started', { tab_id, attached_by_us, already_attached });

        return { success: true };
    } catch (error) {
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
            error: `Failed to start exception capture: ${error}`
        };
    }
}

export function is_exception_active(): boolean {
    return is_capturing;
}

export async function stop_exception_capture(): Promise<void> {
    if (!is_capturing) return;
    is_capturing = false;
    logger.info('Exception capture stopped');

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
                logger.debug('sub_target_runtime_enable_failed', {
                    sessionId: child_session,
                    error: String(err).slice(0, 80),
                });
            });
            logger.debug('sub_target_exception_runtime_enabled', { sessionId: child_session });
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

    if (method !== 'Runtime.exceptionThrown') return;

    const details = params.exceptionDetails || {};
    const exception = details.exception || {};
    const message: string =
        exception.description ||
        details.text ||
        exception.value ||
        'Unknown exception';

    const first_frame = details.stackTrace?.callFrames?.[0];
    const source_url: string = first_frame?.url || details.url || '';
    const line: number = first_frame?.lineNumber ?? details.lineNumber ?? 0;
    const column: number = first_frame?.columnNumber ?? details.columnNumber ?? 0;
    const stack_trace: string | null =
        exception.description ||
        details.stackTrace?.description ||
        null;

    const error_name: string | null =
        exception.className ?? extract_error_name(message) ?? null;

    const event_data: RuntimeExceptionData = {
        message,
        error_name,
        stack_trace,
        source_url,
        line,
        column,
        exception_id: exception.objectId ?? null,
        severity: 'error',
        related_event_ids: [],
    };

    const event = create_base_event({
        capture_id,
        category: 'error',
        type: 'runtime_exception',
        relative_time_ms: get_relative_time(start_time),
        tab_id,
        url: source_url,
        source: 'background',
        severity: 'error',
    });

    send_event({ ...event, ...event_data } as CaptureEvent & RuntimeExceptionData);
}

function extract_error_name(msg: string): string | null {
    const match = /^(\w+Error|Error):/.exec(msg);
    return match ? match[1] : null;
}
