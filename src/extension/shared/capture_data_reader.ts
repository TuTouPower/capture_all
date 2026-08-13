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

// t160 已移除的 SourceCounts/source_counts_from_snapshot/read_capture_snapshot_incremental：
// IDB cursor 按 event_id 随机 UUID 字典序非追加序，offset 增量不可靠（review 实证）；
// 详情轮询改为「stats 快照全分项增量比较」锚点（dashboard_shared `_detail_loaded_stats`），
// 无推进不读、有推进全量重建，消除 stats 字段与 store 条数混合口径错位。

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

// t160 实施调整：IDB cursor 非追加序（event_id 随机 UUID），offset 增量不可靠（review 实证）。
// 有推进时全量重建替换（正确性优先）；无推进不读（保留主要性能收益）。
