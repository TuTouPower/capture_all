// content/scroll_capture.ts
import type { CaptureEvent, ScrollEventData } from '../../shared/types';
import { create_content_event, get_relative_time, create_capture_state } from './content_event_utils';

const state = create_capture_state<ScrollEventData>();
let scroll_timer: ReturnType<typeof setTimeout> | null = null;

export function start_scroll_capture(
    sender: (event: CaptureEvent, data: ScrollEventData) => void,
    params: { capture_id: string; capture_start_epoch_ms: number; tab_id: number },
): void {
    if (!state.begin(sender, params)) return;

    document.addEventListener('scroll', handle_scroll, { passive: true });
}

export function stop_scroll_capture(): void {
    if (!state.end()) return;

    document.removeEventListener('scroll', handle_scroll);

    if (scroll_timer) {
        clearTimeout(scroll_timer);
        scroll_timer = null;
    }
}

function handle_scroll(): void {
    if (!state.is_capturing) return;

    if (scroll_timer) clearTimeout(scroll_timer);

    scroll_timer = setTimeout(() => {
        if (!state.is_capturing) return;

        const event = create_content_event({
            capture_id: state.capture_id,
            category: 'user_action',
            type: 'scroll_event',
            relative_time_ms: get_relative_time(state.capture_start_epoch_ms),
            tab_id: state.tab_id,
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

        state.sender?.(event, data);
    }, 200);
}
