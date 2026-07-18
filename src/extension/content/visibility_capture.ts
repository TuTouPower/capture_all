// content/visibility_capture.ts
import type { CaptureEvent, VisibilityChangeData } from '../../shared/types';
import { create_content_event, get_relative_time } from './content_event_utils';

let is_capturing = false;
let _capture_id = '';
let _capture_start_epoch_ms = 0;
let _tab_id = 0;
let _send_event: (event: CaptureEvent, data: VisibilityChangeData) => void;

export function start_visibility_capture(
    sender: (event: CaptureEvent, data: VisibilityChangeData) => void,
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

    document.addEventListener('visibilitychange', handle_visibility_change);
}

export function stop_visibility_capture(): void {
    if (!is_capturing) return;
    is_capturing = false;

    document.removeEventListener('visibilitychange', handle_visibility_change);
}

function handle_visibility_change(): void {
    if (!is_capturing) return;

    const state = document.visibilityState === 'visible' ? 'visible' : 'hidden';

    const event = create_content_event({
        capture_id: _capture_id,
        category: 'navigation',
        type: 'visibility_change',
        relative_time_ms: get_relative_time(_capture_start_epoch_ms),
        tab_id: _tab_id,
        source: 'content_script',
    });

    const data: VisibilityChangeData = {
        state,
        url: window.location.href,
    };

    _send_event(event, data);
}
