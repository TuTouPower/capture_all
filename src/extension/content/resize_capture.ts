// content/resize_capture.ts
import type { CaptureEvent, ResizeEventData } from '../../shared/types';
import { create_content_event, get_relative_time } from './content_event_utils';

let is_capturing = false;
let _capture_id = '';
let _capture_start_epoch_ms = 0;
let _tab_id = 0;
let _send_event: (event: CaptureEvent, data: ResizeEventData) => void;
let _timer: ReturnType<typeof setTimeout> | null = null;

export function start_resize_capture(
    sender: (event: CaptureEvent, data: ResizeEventData) => void,
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
    window.addEventListener('resize', handle_resize);
}

export function stop_resize_capture(): void {
    if (!is_capturing) return;
    is_capturing = false;
    window.removeEventListener('resize', handle_resize);
    if (_timer) { clearTimeout(_timer); _timer = null; }
}

function handle_resize(): void {
    if (!is_capturing) return;
    if (_timer) clearTimeout(_timer);
    _timer = setTimeout(() => {
        if (!is_capturing) return;
        const event = create_content_event({
            capture_id: _capture_id,
            category: 'user_action',
            type: 'resize_event',
            relative_time_ms: get_relative_time(_capture_start_epoch_ms),
            tab_id: _tab_id,
            source: 'content_script',
        });
        const data: ResizeEventData = {
            width: window.outerWidth,
            height: window.outerHeight,
            inner_width: window.innerWidth,
            inner_height: window.innerHeight,
            device_pixel_ratio: window.devicePixelRatio,
        };
        _send_event(event, data);
    }, 200);
}
