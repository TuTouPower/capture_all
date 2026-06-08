// shared/event_utils.ts
import type { CaptureEvent, CategoryKey, EventType, EventSource, Severity } from './types';

let event_counter = 0;

export function generate_event_id(): string {
    event_counter++;
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `evt_${ts}_${rand}_${event_counter}`;
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
}): CaptureEvent {
    return {
        event_id: generate_event_id(),
        capture_id: params.capture_id,
        category: params.category,
        type: params.type,
        relative_time_ms: params.relative_time_ms,
        absolute_time: new Date().toISOString(),
        tab_id: params.tab_id,
        frame_id: params.frame_id ?? 0,
        url: params.url ?? '',
        top_frame_url: null,
        page_title: null,
        source: params.source,
        severity: params.severity ?? 'info',
        related_event_ids: [],
        redaction_status: 'none',
        raw_available: true,
        created_at: new Date().toISOString(),
    };
}
