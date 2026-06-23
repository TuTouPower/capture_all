// content/print_capture.ts
import type { CaptureEvent, PrintEventData } from '../shared/types';
import { create_content_event, get_relative_time } from './content_event_utils';

let is_capturing = false;
let _capture_id = '';
let _capture_start_epoch_ms = 0;
let _tab_id = 0;
let _send_event: (event: CaptureEvent, data: PrintEventData) => void;

export function start_print_capture(
    sender: (event: CaptureEvent, data: PrintEventData) => void,
    new_capture_id: string,
    new_capture_start_epoch_ms: number,
    new_tab_id: number,
): void {
    if (is_capturing) return;
    _send_event = sender;
    _capture_id = new_capture_id;
    _capture_start_epoch_ms = new_capture_start_epoch_ms;
    _tab_id = new_tab_id;
    is_capturing = true;
    window.addEventListener('beforeprint', handle_beforeprint);
    window.addEventListener('afterprint', handle_afterprint);
}

export function stop_print_capture(): void {
    if (!is_capturing) return;
    is_capturing = false;
    window.removeEventListener('beforeprint', handle_beforeprint);
    window.removeEventListener('afterprint', handle_afterprint);
}

function handle_beforeprint(): void {
    if (!is_capturing) return;
    send('beforeprint');
}

function handle_afterprint(): void {
    if (!is_capturing) return;
    send('afterprint');
}

function send(action: 'beforeprint' | 'afterprint'): void {
    const event = create_content_event({
        capture_id: _capture_id,
        category: 'user_action',
        type: 'print_event',
        relative_time_ms: get_relative_time(_capture_start_epoch_ms),
        tab_id: _tab_id,
        source: 'content_script',
    });
    const data: PrintEventData = { action };
    _send_event(event, data);
}
