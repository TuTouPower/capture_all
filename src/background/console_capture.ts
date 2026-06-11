// background/console_capture.ts
import type { CaptureEvent, ConsoleEventData } from '../shared/types';
import { create_base_event, get_relative_time } from '../shared/event_utils';
import { truncate_console_args } from '../shared/redaction';
import { Logger } from '../shared/logger';
import { get_app_log_transport } from './app_log_storage';

const logger = new Logger('background/console', get_app_log_transport());

let is_capturing = false;
let capture_id: string;
let start_time: number;
let tab_id: number;
let send_to_background: (event: CaptureEvent) => void;

export async function start_console_capture(
    cid: string,
    startTime: number,
    targetTabId: number,
    _redactData: boolean,
    sender: (event: CaptureEvent) => void
): Promise<{ success: boolean; error?: string }> {
    if (is_capturing) return { success: true };

    capture_id = cid;
    start_time = startTime;
    tab_id = targetTabId;
    send_to_background = sender;

    try {
        await chrome.dbg.attach({ tabId: tab_id }, '1.3');
        await chrome.dbg.sendCommand({ tabId: tab_id }, 'Runtime.enable');

        chrome.dbg.onEvent.addListener(handle_debugger_event);
        is_capturing = true;
        logger.info('Console capture started', { tab_id });

        return { success: true };
    } catch (error) {
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

export async function stop_console_capture(): Promise<void> {
    if (!is_capturing) return;
    is_capturing = false;
    logger.info('Console capture stopped');

    chrome.dbg.onEvent.removeListener(handle_debugger_event);

    try {
        await chrome.dbg.detach({ tabId: tab_id });
    } catch {
        // Ignore detach errors
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

function handle_debugger_event(_source: any, method: string, params: any): void {
    if (!is_capturing) return;
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
