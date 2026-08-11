// content/resize_capture.ts
import type { CaptureEvent, ResizeEventData } from '../../shared/types';
import { create_content_event, get_relative_time, create_capture_state } from './content_event_utils';

const state = create_capture_state<ResizeEventData>();
let _timer: ReturnType<typeof setTimeout> | null = null;

export function start_resize_capture(
    sender: (event: CaptureEvent, data: ResizeEventData) => void,
    new_capture_id: string,
    new_capture_start_epoch_ms: number,
    new_tab_id: number,
): void {
    if (!state.begin(sender, {
        capture_id: new_capture_id,
        capture_start_epoch_ms: new_capture_start_epoch_ms,
        tab_id: new_tab_id,
    })) return;
    window.addEventListener('resize', handle_resize);
}

export function stop_resize_capture(): void {
    if (!state.end()) return;
    window.removeEventListener('resize', handle_resize);
    if (_timer) { clearTimeout(_timer); _timer = null; }
}

function handle_resize(): void {
    if (!state.is_capturing) return;
    if (_timer) clearTimeout(_timer);
    _timer = setTimeout(() => {
        if (!state.is_capturing) return;
        const event = create_content_event({
            capture_id: state.capture_id,
            category: 'user_action',
            type: 'resize_event',
            relative_time_ms: get_relative_time(state.capture_start_epoch_ms),
            tab_id: state.tab_id,
            source: 'content_script',
        });
        const data: ResizeEventData = {
            width: window.outerWidth,
            height: window.outerHeight,
            inner_width: window.innerWidth,
            inner_height: window.innerHeight,
            device_pixel_ratio: window.devicePixelRatio,
        };
        state.sender?.(event, data);
    }, 200);
}
