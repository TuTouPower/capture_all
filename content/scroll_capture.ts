// content/scroll_capture.ts
import type { ScrollEventData } from '../shared/types';

let is_capturing = false;
let send_event: (type: string, data: any) => void;
let scroll_timer: ReturnType<typeof setTimeout> | null = null;

export function start_scroll_capture(sender: (type: string, data: any) => void): void {
    if (is_capturing) return;

    send_event = sender;
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

        send_event('scroll', {
            scroll_x: window.scrollX,
            scroll_y: window.scrollY,
            scroll_height: document.documentElement.scrollHeight,
            scroll_width: document.documentElement.scrollWidth
        } as ScrollEventData);
    }, 200);
}
