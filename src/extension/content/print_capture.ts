// content/print_capture.ts
import type { CaptureEvent, PrintEventData } from '../../shared/types';
import { create_content_event, get_relative_time, create_capture_state } from './content_event_utils';

const state = create_capture_state<PrintEventData>();

export function start_print_capture(
    sender: (event: CaptureEvent, data: PrintEventData) => void,
    new_capture_id: string,
    new_capture_start_epoch_ms: number,
    new_tab_id: number,
): void {
    if (!state.begin(sender, {
        capture_id: new_capture_id,
        capture_start_epoch_ms: new_capture_start_epoch_ms,
        tab_id: new_tab_id,
    })) return;
    window.addEventListener('beforeprint', handle_beforeprint);
    window.addEventListener('afterprint', handle_afterprint);
}

export function stop_print_capture(): void {
    if (!state.end()) return;
    window.removeEventListener('beforeprint', handle_beforeprint);
    window.removeEventListener('afterprint', handle_afterprint);
}

function handle_beforeprint(): void {
    if (!state.is_capturing) return;
    send('beforeprint');
}

function handle_afterprint(): void {
    if (!state.is_capturing) return;
    send('afterprint');
}

function send(action: 'beforeprint' | 'afterprint'): void {
    const event = create_content_event({
        capture_id: state.capture_id,
        category: 'user_action',
        type: 'print_event',
        relative_time_ms: get_relative_time(state.capture_start_epoch_ms),
        tab_id: state.tab_id,
        source: 'content_script',
    });
    const data: PrintEventData = { action };
    state.sender?.(event, data);
}
