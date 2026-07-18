// content/fullscreen_capture.ts
import type { CaptureEvent, FullscreenChangeData } from '../../shared/types';
import { create_content_event, get_relative_time } from './content_event_utils';

let is_capturing = false;
let _capture_id = '';
let _capture_start_epoch_ms = 0;
let _tab_id = 0;
let _send_event: (event: CaptureEvent, data: FullscreenChangeData) => void;

export function start_fullscreen_capture(
    sender: (event: CaptureEvent, data: FullscreenChangeData) => void,
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
    document.addEventListener('fullscreenchange', handle_fullscreen);
}

export function stop_fullscreen_capture(): void {
    if (!is_capturing) return;
    is_capturing = false;
    document.removeEventListener('fullscreenchange', handle_fullscreen);
}

function handle_fullscreen(): void {
    if (!is_capturing) return;
    const fs_element = document.fullscreenElement;
    const event = create_content_event({
        capture_id: _capture_id,
        category: 'user_action',
        type: 'fullscreen_change',
        relative_time_ms: get_relative_time(_capture_start_epoch_ms),
        tab_id: _tab_id,
        source: 'content_script',
    });
    const data: FullscreenChangeData = {
        action: fs_element ? 'enter' : 'exit',
        element_tag: fs_element?.tagName ?? null,
        element_id: fs_element?.id ?? null,
    };
    _send_event(event, data);
}
