// background/exception_capture.ts
import type { ConsoleLog } from '../shared/types';

let is_capturing = false;
let session_id: string;
let start_time: number;
let tab_id: number;
let send_to_background: (log: ConsoleLog) => void;
let attached_by_us = false;

export async function start_exception_capture(
    sid: string,
    startTime: number,
    targetTabId: number,
    sender: (log: ConsoleLog) => void
): Promise<{ success: boolean; error?: string }> {
    if (is_capturing) return { success: true };

    session_id = sid;
    start_time = startTime;
    tab_id = targetTabId;
    send_to_background = sender;

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
    const url: string = first_frame?.url || details.url || '';
    const line: number = first_frame?.lineNumber ?? details.lineNumber ?? 0;
    const column: number = first_frame?.columnNumber ?? details.columnNumber ?? 0;
    const stack_trace: string | null = exception.description || details.stackTrace?.description || null;

    const ts: number = params.timestamp || Date.now();

    const log: ConsoleLog = {
        session_id,
        relative_time: ts - start_time,
        absolute_time: ts,
        tab_id,
        level: 'error',
        args: [message],
        stack_trace,
        url,
        line,
        column
    };

    send_to_background(log);
}
