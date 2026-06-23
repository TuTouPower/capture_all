// content/content_event_utils.ts
// Wrapper for create_base_event that auto-fills page_title and top_frame_url from the DOM.

import { create_base_event, get_relative_time, generate_event_id, reset_event_counter } from '../shared/event_utils';
import type { CategoryKey, EventType, EventSource, Severity, CaptureEvent } from '../shared/types';

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
