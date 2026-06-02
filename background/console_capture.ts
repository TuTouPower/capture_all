// background/console_capture.ts
import type { ConsoleLog } from '../shared/types';
import { truncate_console_args } from '../shared/redaction';

let is_capturing = false;
let session_id: string;
let start_time: number;
let tab_id: number;
let send_to_background: (log: ConsoleLog) => void;

export async function start_console_capture(
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
        // Try to attach debugger
        await chrome.dbg.attach({ tabId: tab_id }, '1.3');
        await chrome.dbg.sendCommand({ tabId: tab_id }, 'Runtime.enable');

        chrome.dbg.onEvent.addListener(handle_debugger_event);
        is_capturing = true;

        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: `Failed to attach debugger: ${error}. Please open F12 for DevTools mode.`
        };
    }
}

export async function stop_console_capture(): Promise<void> {
    if (!is_capturing) return;
    is_capturing = false;

    chrome.dbg.onEvent.removeListener(handle_debugger_event);

    try {
        await chrome.dbg.detach({ tabId: tab_id });
    } catch {
        // Ignore detach errors
    }
}

function handle_debugger_event(_source: any, method: string, params: any): void {
    if (!is_capturing) return;

    if (method === 'Runtime.consoleAPICalled') {
        const args = params.args.map((arg: any) => arg.value || arg.description || '');
        const truncated_args = truncate_console_args(args);

        const log: ConsoleLog = {
            session_id,
            relative_time: params.timestamp - start_time,
            absolute_time: params.timestamp,
            tab_id,
            level: params.type,
            args: truncated_args,
            stack_trace: params.stackTrace?.description || null,
            url: params.stackTrace?.callFrames?.[0]?.url || '',
            line: params.stackTrace?.callFrames?.[0]?.lineNumber || 0,
            column: params.stackTrace?.callFrames?.[0]?.columnNumber || 0
        };

        send_to_background(log);
    }
}
