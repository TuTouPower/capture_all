// shared/capture_data_reader.ts — 页面侧直连 IndexedDB 读取采集数据
// 不经过 sendMessage，避免 64MB 限制。
// 调用前需先 sendMessage({ action: 'flush' }) 让 SW 落盘缓冲区。

import {
    get_capture,
    get_network_requests,
    get_events_by_category,
    get_console_events,
} from '../background/storage';
import type { CaptureRecord, CaptureEvent, NetworkRequestData, ConsoleEventData } from './types';

export interface CaptureSnapshot {
    capture: CaptureRecord | null;
    user_events: CaptureEvent[];
    nav_events: CaptureEvent[];
    network_requests: NetworkRequestData[];
    console_events: ConsoleEventData[];
    error_events: CaptureEvent[];
    storage_changes: CaptureEvent[];
    cookie_changes: CaptureEvent[];
}

export async function read_capture_snapshot(capture_id: string): Promise<CaptureSnapshot> {
    const [capture, user_events, nav_events, network_requests, console_events, error_events, storage_changes, cookie_changes] = await Promise.all([
        get_capture(capture_id),
        get_events_by_category(capture_id, 'user_action', 0, 100000),
        get_events_by_category(capture_id, 'navigation', 0, 100000),
        get_network_requests(capture_id, 0, 100000),
        get_console_events(capture_id, 0, 100000),
        get_events_by_category(capture_id, 'error', 0, 100000),
        get_events_by_category(capture_id, 'storage', 0, 100000),
        get_events_by_category(capture_id, 'cookie', 0, 100000),
    ]);
    return { capture, user_events, nav_events, network_requests, console_events, error_events, storage_changes, cookie_changes };
}
