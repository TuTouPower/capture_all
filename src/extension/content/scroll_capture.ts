// content/scroll_capture.ts
import type { CaptureEvent, ScrollEventData } from '../../shared/types';
import { create_content_event, get_relative_time } from './content_event_utils';

let is_capturing = false;
let capture_id = '';
let capture_start_epoch_ms = 0;
let tab_id = 0;
let send_event: (event: CaptureEvent, data: ScrollEventData) => void;
let scroll_timer: ReturnType<typeof setTimeout> | null = null;

export function start_scroll_capture(
    sender: (event: CaptureEvent, data: ScrollEventData) => void,
    params: { capture_id: string; capture_start_epoch_ms: number; tab_id: number },
): void {
    if (is_capturing) return;

    send_event = sender;
    capture_id = params.capture_id;
    capture_start_epoch_ms = params.capture_start_epoch_ms;
    tab_id = params.tab_id;
    is_capturing = true;

    document.addEventListener('scroll', handle_scroll, { passive: true });
}

export function stop_scroll_capture(): void {
    if (!is_capturing) return;
    is_capturing = false;

    document.removeEventListener('scroll', handle_scroll);

    if (scroll_timer) {
        clearTimeout(scroll_timer);
        scroll_timer = null;
    }
}

function handle_scroll(): void {
    if (!is_capturing) return;

    if (scroll_timer) clearTimeout(scroll_timer);

    scroll_timer = setTimeout(() => {
        if (!is_capturing) return;

        const event = create_content_event({
            capture_id,
            category: 'user_action',
            type: 'scroll_event',
            relative_time_ms: get_relative_time(capture_start_epoch_ms),
            tab_id,
            source: 'content_script',
        });

        const data: ScrollEventData = {
            scroll_x: window.scrollX,
            scroll_y: window.scrollY,
            scroll_height: document.documentElement.scrollHeight,
            scroll_width: document.documentElement.scrollWidth,
            viewport_height: window.innerHeight,
            viewport_width: window.innerWidth,
            target_selector: null,
            target_xpath: null,
            is_document_scroll: true,
        };

        send_event(event, data);
    }, 200);
}
