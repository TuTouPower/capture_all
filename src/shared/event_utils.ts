// shared/event_utils.ts
import type { CaptureEvent, CategoryKey, EventType, EventSource, Severity } from './types';
import { generate_unique_suffix } from './id';

let event_counter = 0;

export function generate_event_id(): string {
    // T059: 优先用 crypto.randomUUID（MV3 service worker + content script + browser 均支持）
    // fallback Math.random 用于旧环境（如非 secure context）
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return `evt_${crypto.randomUUID()}`;
        }
    } catch {
        // ignore
    }
    event_counter++;
    const ts = Date.now().toString(36);
    // t152 AC-007: 复用 id.ts generate_unique_suffix（消除 random_chars 重复实现）
    return `evt_${ts}_${generate_unique_suffix(6)}_${event_counter}`;
}

export function reset_event_counter(): void {
    event_counter = 0;
}

export function get_relative_time(capture_start_epoch_ms: number): number {
    // t152 AC-009: 时钟回拨（now < start）时 clamp 到 0，避免负相对时间
    return Math.max(0, Date.now() - capture_start_epoch_ms);
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
