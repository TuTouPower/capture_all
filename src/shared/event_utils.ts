// shared/event_utils.ts
import type { CaptureEvent, CategoryKey, EventType, EventSource, Severity } from './types';

let event_counter = 0;

function random_chars(len: number): string {
    let s = Math.random().toString(36).slice(2, 2 + len);
    while (s.length < len) s = '0' + s;
    return s;
}

export function generate_event_id(): string {
    event_counter++;
    const ts = Date.now().toString(36);
    return `evt_${ts}_${random_chars(6)}_${event_counter}`;
}

export function reset_event_counter(): void {
    event_counter = 0;
}

export function get_relative_time(capture_start_epoch_ms: number): number {
    return Date.now() - capture_start_epoch_ms;
}

export function create_base_event(params: {
    capture_id: string;
    category: CategoryKey;
    type: EventType;
    relative_time_ms: number;
    tab_id: number;
    frame_id?: number;
    url?: string;
    source: EventSource;
    severity?: Severity;
    page_title?: string | null;
    top_frame_url?: string | null;
}): CaptureEvent {
    const now = new Date().toISOString();
    return {
        event_id: generate_event_id(),
        capture_id: params.capture_id,
        category: params.category,
        type: params.type,
        relative_time_ms: params.relative_time_ms,
        absolute_time: now,
        tab_id: params.tab_id,
        frame_id: params.frame_id ?? 0,
        url: params.url ?? '',
        top_frame_url: params.top_frame_url ?? null,
        page_title: params.page_title ?? null,
        source: params.source,
        severity: params.severity ?? 'info',
        related_event_ids: [],
        redaction_status: 'none',
        raw_available: true,
        created_at: now,
    };
}
