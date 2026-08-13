// tests/unit/capture_archive_count.test.ts
// t156 AC-003/004: Popup ZIP / Dashboard ZIP manifest 计数与 Dashboard 详情展示条数
// 与持久化统计一致（不因固定 100000 截断而偏小）。
// 测试策略见 spec 可测试性声明：mock read_capture_snapshot + archive builder 单测。
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { build_archive } from '../../src/extension/shared/archive_builder';
import { merge_detail_events } from '../../src/extension/dashboard/dashboard_shared';
import type { CaptureEvent, CaptureRecord, NetworkRequestData } from '../../src/shared/types';

vi.mock('../../src/extension/shared/capture_data_reader', () => ({
    read_capture_snapshot: vi.fn(),
}));

import { read_capture_snapshot } from '../../src/extension/shared/capture_data_reader';

const USER_ACTION_COUNT = 100001;
const NETWORK_COUNT = 3;

function make_event(i: number): CaptureEvent {
    return {
        event_id: `evt_${i}`,
        capture_id: 'capture_big',
        category: 'user_action',
        type: 'mouse_event',
        relative_time_ms: i,
        absolute_time: '2026-01-01T00:00:00Z',
        tab_id: 1,
        frame_id: 0,
        url: 'https://example.com',
        top_frame_url: null,
        page_title: null,
        source: 'content_script',
        severity: 'info',
        related_event_ids: [],
        redaction_status: 'none',
        raw_available: true,
        created_at: '2026-01-01T00:00:00Z',
    };
}

function make_request(i: number): NetworkRequestData {
    return {
        request_id: `req_${i}`,
        method: 'GET',
        url: `https://example.com/api/${i}`,
        url_status: 'captured',
        status_code: 200,
        status_text: 'OK',
        protocol: 'http/2',
        resource_type: 'fetch',
        initiator: null,
        duration_ms: 10,
        start_time_ms: i,
        end_time_ms: i + 10,
        request_headers: null,
        response_headers: null,
        headers_status: 'captured',
        request_body: null,
        request_body_status: 'not_enabled',
        request_body_encoding: null,
        request_body_bytes: null,
        request_body_mime: null,
        response_body: null,
        response_preview: null,
        response_body_status: 'not_enabled',
        response_body_encoding: null,
        response_body_bytes: null,
        mime_type: null,
        request_size_bytes: null,
        response_size_bytes: null,
        transfer_size_bytes: null,
        from_cache: null,
        cache_status: null,
        error_text: null,
        capture_method: 'web_request',
        body_capture_mode: 'off',
    };
}

function make_capture(): CaptureRecord {
    return {
        capture_id: 'capture_big',
        name: 'big',
        status: 'completed',
        started_at: '2026-01-01T00:00:00Z',
        ended_at: '2026-01-01T00:10:00Z',
        duration_ms: 600000,
        start_url: 'https://example.com',
        end_url: null,
        tab_id: 1,
        window_id: null,
        config_snapshot: {},
        stats: {
            event_count: USER_ACTION_COUNT,
            user_action_count: USER_ACTION_COUNT,
            nav_count: 0,
            request_count: NETWORK_COUNT,
            log_count: 0,
            error_count: 0,
            storage_change_count: 0,
            cookie_change_count: 0,
            total_body_bytes: 0,
        },
        tags: [],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:10:00Z',
    };
}

describe('AC-003/AC-004: >100000 条 capture 的 ZIP manifest 与详情条数', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        read_capture_snapshot.mockResolvedValue({
            capture: make_capture(),
            user_events: Array.from({ length: USER_ACTION_COUNT }, (_, i) => make_event(i)),
            nav_events: [],
            network_requests: Array.from({ length: NETWORK_COUNT }, (_, i) => make_request(i)),
            console_events: [],
            error_events: [],
            storage_changes: [],
            cookie_changes: [],
        });
    });

    it('AC-003: Popup/Dashboard ZIP manifest 计数与持久化统计一致（不因截断偏小）', async () => {
        const snapshot = await read_capture_snapshot('capture_big');
        const archive = await build_archive(
            {
                capture: snapshot.capture!,
                events: [...snapshot.user_events, ...snapshot.nav_events, ...snapshot.error_events, ...snapshot.storage_changes, ...snapshot.cookie_changes],
                network_requests: snapshot.network_requests,
                console_events: snapshot.console_events,
            },
            { inline_text_max_bytes: 4096, system_time_timezone: 'browser' },
        );
        const files = unzipSync(archive);
        const manifest = JSON.parse(strFromU8(files['manifest.json'])) as { counts: { events: number; network: number; console: number } };
        // 不因 100000 截断而偏小：events 计数 = 全量事件统计
        expect(manifest.counts.events).toBe(USER_ACTION_COUNT);
        expect(manifest.counts.network).toBe(NETWORK_COUNT);
        expect(manifest.counts.events).toBeGreaterThan(100000);
    });

    it('AC-004: Dashboard 详情展示条数与持久化统计一致（>100000 不截断）', async () => {
        const snapshot = await read_capture_snapshot('capture_big');
        const events = merge_detail_events('capture_big', snapshot);
        // 详情时间线条目 = 事件统计 + 网络请求统计（merge 将 network/console 并入 timeline）
        expect(events.length).toBe(snapshot.capture!.stats.event_count + snapshot.capture!.stats.request_count);
        expect(events.length).toBeGreaterThan(100000);
    });
});
