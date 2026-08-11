// content/content_event_utils.ts
// Wrapper for create_base_event that auto-fills page_title and top_frame_url from the DOM.

import { create_base_event, get_relative_time, generate_event_id, reset_event_counter } from '../../shared/event_utils';
import type { CategoryKey, EventType, EventSource, Severity, CaptureEvent } from '../../shared/types';

/** Get the top frame URL. Returns null for the top frame itself, or the top URL for iframes. */
function get_top_frame_url(): string | null {
    try {
        if (window.top && window.top !== window) {
            return window.top.location.href;
        }
    } catch {
        // Cross-origin iframe — cannot access top
    }
    return null;
}

/** Create a base event with page_title and top_frame_url filled from the DOM. */
export function create_content_event(params: {
    capture_id: string;
    category: CategoryKey;
    type: EventType;
    relative_time_ms: number;
    tab_id: number;
    frame_id?: number;
    url?: string;
    source: EventSource;
    severity?: Severity;
}): CaptureEvent {
    return create_base_event({
        ...params,
        page_title: document.title || null,
        top_frame_url: get_top_frame_url(),
    });
}

export { get_relative_time, generate_event_id, reset_event_counter };

/** Content capture 模块共享状态：is_capturing + capture_id + epoch + tab_id + sender。 */
export function create_capture_state<TData = never>() {
    let is_capturing = false;
    let capture_id = '';
    let capture_start_epoch_ms = 0;
    let tab_id = 0;
    let send_event: ((event: CaptureEvent, data?: TData) => void) | null = null;

    return {
        get is_capturing(): boolean {
            return is_capturing;
        },
        get capture_id(): string {
            return capture_id;
        },
        get capture_start_epoch_ms(): number {
            return capture_start_epoch_ms;
        },
        get tab_id(): number {
            return tab_id;
        },
        get sender(): ((event: CaptureEvent, data?: TData) => void) | null {
            return send_event;
        },
        /** 已捕获中返回 false（重入守卫）；否则写入运行参数并返回 true。 */
        begin(sender: (event: CaptureEvent, data: TData) => void, params: { capture_id: string; capture_start_epoch_ms: number; tab_id: number }): boolean {
            if (is_capturing) return false;
            send_event = sender as (event: CaptureEvent, data?: TData) => void;
            capture_id = params.capture_id;
            capture_start_epoch_ms = params.capture_start_epoch_ms;
            tab_id = params.tab_id;
            is_capturing = true;
            return true;
        },
        /** 复位捕获状态，返回是否曾处于捕获中。 */
        end(): boolean {
            if (!is_capturing) return false;
            is_capturing = false;
            send_event = null;
            return true;
        },
    };
}
