// shared/capture_data_reader.ts — 页面侧直连 IndexedDB 读取采集数据
// 不经过 sendMessage，避免 64MB 限制。
// 调用前需先 sendMessage({ action: 'flush' }) 让 SW 落盘缓冲区。

import {
    get_capture,
    get_network_requests,
    get_events_by_category,
    get_console_events,
} from '../background/storage';
import { fetch_all_records } from './paged_reader';
import type { CaptureRecord, CaptureEvent, NetworkRequestData, ConsoleEventData } from '../../shared/types';

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
    // t156: 全量分页读取（PAGE_SIZE=5000 逐类耗尽），替代固定 limit=100000 静默截断
    const [capture, user_events, nav_events, network_requests, console_events, error_events, storage_changes, cookie_changes] = await Promise.all([
        get_capture(capture_id),
        fetch_all_records((offset, limit) => get_events_by_category(capture_id, 'user_action', offset, limit)),
        fetch_all_records((offset, limit) => get_events_by_category(capture_id, 'navigation', offset, limit)),
        fetch_all_records((offset, limit) => get_network_requests(capture_id, offset, limit)),
        fetch_all_records((offset, limit) => get_console_events(capture_id, offset, limit)),
        fetch_all_records((offset, limit) => get_events_by_category(capture_id, 'error', offset, limit)),
        fetch_all_records((offset, limit) => get_events_by_category(capture_id, 'storage', offset, limit)),
        fetch_all_records((offset, limit) => get_events_by_category(capture_id, 'cookie', offset, limit)),
    ]);
    return { capture, user_events, nav_events, network_requests, console_events, error_events, storage_changes, cookie_changes };
}
