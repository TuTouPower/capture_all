// dashboard/dashboard_data.ts — t186: Dashboard 数据服务（load/export）。
// 依赖 state（set_detail_*）与 format（merge_detail_events）；无 UI 渲染逻辑。
import type { CaptureStats } from '../../shared/types';
import { read_capture_snapshot } from '../shared/capture_data_reader';
import { send_ui_message, type UiAction } from '../../shared/message_contract';
import { build_archive } from '../shared/archive_builder';
import { download_blob, build_capture_filename } from '../shared/export_utils';
import {
    is_extension,
    logger,
    merge_detail_events,
} from './dashboard_format';
import {
    get_captures,
    set_captures,
    get_user_config,
    set_detail_capture,
    set_detail_events,
    set_detail_network,
    set_detail_console,
} from './dashboard_state';
import { t } from '../shared/i18n';

// ── captures 列表 ───────────────────────────────────────────────────────
export async function load_captures(): Promise<void> {
    if (!is_extension) return;
    try {
        const resp = await send_ui_message('list_captures', {});
        // t154 AC-005: 非数组响应防御——响应形状异常时降级为空列表，避免下游 .filter/.map 崩溃
        set_captures(Array.isArray(resp?.data) ? resp.data : []);
    }
    catch { set_captures([]); }
    logger.debug('Captures loaded', { count: get_captures().length });
}

// t160: 详情轮询锚点——当前详情 capture 与上轮 stats 快照（f005/f006：stats 全分项增量比较，
// 消除「stats 字段 vs store 条数」混合口径错位；ws_frame 等仅增 event_count 的写入无累计偏差）。
let _detail_id: string | null = null;
let _detail_loaded_stats: CaptureStats | null = null;
export const _reset_detail_poll_state_for_test = () => { _detail_id = null; _detail_loaded_stats = null; };

export async function load_detail(id: string, opts: { incremental?: boolean } = {}): Promise<void> {
    if (!is_extension) return;
    // 全量模式（首次打开/切换 capture）清空内存态并重置锚点；增量模式保留
    if (!opts.incremental) {
        set_detail_capture(null); set_detail_events([]); set_detail_network([]); set_detail_console([]);
        _detail_id = null;
        _detail_loaded_stats = null;
    }
    try {
        const r = await send_ui_message('get_capture_data', { capture_id: id });
        if (!r?.success) return;
        const capture = r.data ?? null;
        set_detail_capture(capture);
        if (!capture) {
            set_detail_events([]); set_detail_network([]); set_detail_console([]);
            _detail_id = null;
            _detail_loaded_stats = null;
            return;
        }

        const use_incremental = opts.incremental === true && _detail_id === id && _detail_loaded_stats !== null;
        if (use_incremental) {
            // t160 AC-001: metadata 计数未推进 → 不读数据（仅更新 capture record/状态）
            if (!detail_counts_advanced(capture.stats, _detail_loaded_stats!)) {
                logger.debug('Detail poll: metadata unchanged, skip data read', { capture_id: id });
                return;
            }
            // t160 AC-002（实施调整）：有推进时全量重建替换——IDB cursor 非追加序（event_id 随机
            // UUID），offset 增量不可靠（review 实证），正确性优先；成本仍只在变化时付出。
            const snapshot = await read_capture_snapshot(id);
            const events = merge_detail_events(id, snapshot);
            set_detail_events(events);
            set_detail_network(snapshot.network_requests);
            set_detail_console(snapshot.console_events);
            _detail_loaded_stats = { ...capture.stats };
            logger.debug('Detail loaded (refresh)', { capture_id: id, events: events.length });
            return;
        }

        const snapshot = await read_capture_snapshot(id);
        const events = merge_detail_events(id, snapshot);
        set_detail_events(events);
        set_detail_network(snapshot.network_requests);
        set_detail_console(snapshot.console_events);
        _detail_id = id;
        _detail_loaded_stats = { ...capture.stats };

        logger.debug('Detail loaded', { capture_id: id, events: events.length });
    } catch { /* best effort */ }
}

// t160: stats 全分项增量比较——任一计数超过上轮快照即视为有新数据（口径统一为 stats 对 stats，
// 覆盖 user/nav/request/log/error/storage/cookie/event_count 全部推进信号，含 ws_frame 只增 event_count）
function detail_counts_advanced(s: CaptureStats, prev: CaptureStats): boolean {
    return s.event_count > prev.event_count
        || s.user_action_count > prev.user_action_count
        || s.nav_count > prev.nav_count
        || s.request_count > prev.request_count
        || s.log_count > prev.log_count
        || s.error_count > prev.error_count
        || s.storage_change_count > prev.storage_change_count
        || s.cookie_change_count > prev.cookie_change_count;
}

// p027: 导出 in-flight 标记（按 id+format key），防同一导出的重复触发并行执行；
// 不同 capture 的合法导出（批量导出）互不拦截。
const export_in_flight = new Map<string, true>();

export async function export_capture(id: string, format: string = 'archive'): Promise<void> {
    if (!is_extension) return;
    const key = `${id}:${format}`;
    if (export_in_flight.has(key)) return; // 同 key 重复触发被拦截，单次执行
    export_in_flight.set(key, true);
    try {
        if (format === 'archive') {
            // T107: 导出前 flush 缓冲事件，避免丢最近数据；flush 失败则中止（不静默旧快照）
            const flush_res = await send_ui_message('flush', {});
            if (!flush_res?.success) { alert(t('exportFailedFlush')); return; }
            const snapshot = await read_capture_snapshot(id);
            if (!snapshot.capture) { alert(t('exportFailed')); return; }
            const archive = await build_archive({
                capture: snapshot.capture,
                events: [
                    ...snapshot.user_events,
                    ...snapshot.nav_events,
                    ...snapshot.error_events,
                    ...snapshot.storage_changes,
                    ...snapshot.cookie_changes,
                    // t180: lifecycle 视为完整采集证据，archive 导出事件合并包含
                    ...snapshot.lifecycle_events,
                ],
                network_requests: snapshot.network_requests,
                console_events: snapshot.console_events,
            }, {
                inline_text_max_bytes: get_user_config().inline_text_max_bytes,
                system_time_timezone: get_user_config().system_time_timezone,
            });
            const blob = new Blob([archive as BlobPart], { type: 'application/zip' });
            const capture_filename = build_capture_filename({
                export_capture_directory: get_user_config().export_capture_directory,
                export_filename_template: get_user_config().export_filename_template,
                system_time_timezone: get_user_config().system_time_timezone,
            }, id, 'zip');
            await download_blob(blob, capture_filename, 'capture_export', get_user_config().export_save_as);
            return;
        }
        const action: UiAction = format === 'html' ? 'export_html' : format === 'har' ? 'export_har' : format === 'jsonl' ? 'export_jsonl' : 'export_json';
        const r = await send_ui_message(action, { capture_id: id });
        if (!r?.success) { alert(t('exportFailed')); return; }
        const ext = format === 'html' ? 'html' as const : format === 'har' ? 'har' as const : format === 'jsonl' ? 'jsonl' as const : 'json' as const;
        const mime = format === 'html' ? 'text/html' : 'application/json';
        const content = r.data ?? '';
        const blob = new Blob([content], { type: mime });
        const capture_filename = build_capture_filename({
            export_capture_directory: get_user_config().export_capture_directory,
            export_filename_template: get_user_config().export_filename_template,
            system_time_timezone: get_user_config().system_time_timezone,
        }, id, ext);
        await download_blob(blob, capture_filename, 'capture_export', get_user_config().export_save_as);
    } catch (err) {
        // t190 AC-002: export failure visible to user (not just log)
        logger.error('Export error', err);
        try { alert(t('exportFailed')); } catch { /* alert unavailable: silent */ }
    }
    finally {
        export_in_flight.delete(key);
    }
}
