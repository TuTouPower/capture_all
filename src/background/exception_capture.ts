// background/exception_capture.ts
import type { CaptureEvent, RuntimeExceptionData } from '../shared/types';
import { create_base_event, get_relative_time } from '../shared/event_utils';

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
    sender: (event: CaptureEvent) => void
): Promise<{ success: boolean; error?: string }> {
    if (is_capturing) return { success: true };

    capture_id = cid;
    start_time = start_time_ms;
    tab_id = target_tab_id;
    send_event = sender;

    try {
        // Try attach (may already be attached by console_capture; that's fine)
        try {
            await chrome.dbg.attach({ tabId: tab_id }, '1.3');
            attached_by_us = true;
        } catch {
            attached_by_us = false;
        }
        await chrome.dbg.sendCommand({ tabId: tab_id }, 'Runtime.enable');

        chrome.dbg.onEvent.addListener(handle_debugger_event);
        is_capturing = true;

        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: `Failed to start exception capture: ${error}`
        };
    }
}

export async function stop_exception_capture(): Promise<void> {
    if (!is_capturing) return;
    is_capturing = false;

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

function handle_debugger_event(_source: any, method: string, params: any): void {
    if (!is_capturing) return;
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
