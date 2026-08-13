// tests/unit/detail_poll_incremental.test.ts
// t160 AC-001/002: 详情轮询先 metadata 对比，无推进不读数据；有推进增量拉取 append
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptureRecord } from '../../src/shared/types';

const send_ui_message = vi.hoisted(() => vi.fn());
const read_capture_snapshot = vi.hoisted(() => vi.fn());

vi.mock('../../src/shared/message_contract', () => ({
    send_ui_message,
}));

vi.mock('../../src/extension/shared/capture_data_reader', async (import_original) => ({
    ...await import_original<typeof import('../../src/extension/shared/capture_data_reader')>(),
    read_capture_snapshot,
}));

function make_capture(event_count: number, user_action_count: number, request_count: number): CaptureRecord {    return {
        capture_id: 'c1',
        name: 'Capture',
        status: 'capturing',
        started_at: '2026-01-01T00:00:00Z',
        ended_at: null,
        duration_ms: 0,
        start_url: 'https://example.com',
        end_url: null,
        tab_id: 1,
        window_id: null,
        config_snapshot: {},
        stats: {
            event_count,
            user_action_count,
            nav_count: 0,
            request_count,
            log_count: 0,
            error_count: 0,
            storage_change_count: 0,
            cookie_change_count: 0,
            total_body_bytes: 0,
        },
        tags: [],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
    };
}

function make_event(i: number, category: 'user_action' | 'navigation') {
    return {
        event_id: `evt_${i}`,
        capture_id: 'c1',
        category,
        type: category === 'user_action' ? 'mouse_event' : 'page_load',
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

function make_snapshot(user_events: unknown[], network_requests: unknown[]) {
    return {
        capture: null,
        user_events,
        nav_events: [],
        network_requests,
        console_events: [],
        error_events: [],
        storage_changes: [],
        cookie_changes: [],
    };
}

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal('chrome', { runtime: { id: 'test-ext' } });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

// is_extension 在模块加载时求值（chrome.runtime.id），须 stub chrome 后动态 import
async function import_shared() {
    return await import('../../src/extension/dashboard/dashboard_shared');
}

describe('detail 轮询增量', () => {
    it('AC-001: 连续两个轮询周期无新事件，第二次只做 metadata 不调 read_capture_snapshot', async () => {
        const { load_detail, get_detail_events } = await import_shared();
        send_ui_message.mockResolvedValue({ success: true, data: make_capture(2, 2, 1) });
        read_capture_snapshot.mockResolvedValue(make_snapshot([make_event(1, 'user_action'), make_event(2, 'user_action')], [{ request_id: 'r1' }]));

        // 首次全量加载
        await load_detail('c1');
        expect(read_capture_snapshot).toHaveBeenCalledTimes(1);

        // 第二轮：stats 未推进（仍 2 事件 / 1 请求）→ metadata 仍查询（send_ui_message 被调），但不读数据
        await load_detail('c1', { incremental: true });
        expect(read_capture_snapshot).toHaveBeenCalledTimes(1);
        expect(send_ui_message).toHaveBeenCalledTimes(2);

        // 第三轮：仍无推进 → 依然不读
        await load_detail('c1', { incremental: true });
        expect(read_capture_snapshot).toHaveBeenCalledTimes(1);
        expect(send_ui_message).toHaveBeenCalledTimes(3);
    });

    it('AC-002: stats 推进时触发一次数据刷新（全量重建替换），不无条件每轮读', async () => {
        const { load_detail, get_detail_events, get_detail_network } = await import_shared();
        send_ui_message.mockResolvedValue({ success: true, data: make_capture(2, 2, 1) });
        read_capture_snapshot.mockResolvedValue(make_snapshot([make_event(1, 'user_action'), make_event(2, 'user_action')], [{ request_id: 'r1' }]));

        await load_detail('c1');
        // merge_detail_events 将 network 并入 events（t144）：2 user + 1 net = 3
        expect(get_detail_events().length).toBe(3);
        expect(get_detail_network().length).toBe(1);
        expect(read_capture_snapshot).toHaveBeenCalledTimes(1);

        // stats 推进到 4 事件 / 2 请求 → 触发一次刷新（全量重建替换）；snapshot 与 stats 一致
        send_ui_message.mockResolvedValue({ success: true, data: make_capture(4, 4, 2) });
        read_capture_snapshot.mockResolvedValue(make_snapshot(
            [make_event(1, 'user_action'), make_event(2, 'user_action'), make_event(3, 'user_action'), make_event(4, 'user_action')],
            [{ request_id: 'r1' }, { request_id: 'r2' }],
        ));

        await load_detail('c1', { incremental: true });

        // 刷新 = 全量重读（IDB cursor 非追加序，offset 增量不可靠），但只在推进时发生
        expect(read_capture_snapshot).toHaveBeenCalledTimes(2);
        // 替换为新全量：4 user + 2 net = 6
        expect(get_detail_events().length).toBe(6);
        expect(get_detail_network().length).toBe(2);

        // 再轮询无推进（snapshot 锚点与 stats 一致）→ 不再读
        await load_detail('c1', { incremental: true });
        expect(read_capture_snapshot).toHaveBeenCalledTimes(2);
    });

    it('AC-002b: 仅 event_count 推进（如 ws_frame 写 network store 只增 event_count）也触发刷新', async () => {
        const { load_detail } = await import_shared();
        // fixture 与 stats 对齐：首次含 1 条 network（stats request_count=1）
        send_ui_message.mockResolvedValue({ success: true, data: make_capture(2, 2, 1) });
        read_capture_snapshot.mockResolvedValue(make_snapshot(
            [make_event(1, 'user_action'), make_event(2, 'user_action')],
            [{ request_id: 'r1' }],
        ));

        await load_detail('c1');
        expect(read_capture_snapshot).toHaveBeenCalledTimes(1);

        // 第二轮：仅 event_count 3（+1，模拟 ws_frame 只增 event_count），分项全不变
        send_ui_message.mockResolvedValue({ success: true, data: make_capture(3, 2, 1) });
        await load_detail('c1', { incremental: true });

        // event_count 增量信号触发刷新（f002：ws_frame 漏更新防护）
        expect(read_capture_snapshot).toHaveBeenCalledTimes(2);
    });

    it('AC-002c: 含 ws_frame 累计后无新事件 → 不读（f005：event_count 增量锚点无累计偏差）', async () => {
        const { load_detail } = await import_shared();
        // 首次全量：stats event_count=3（2 user + 1 ws_frame 累计），snapshot 含 2 user + 1 net
        send_ui_message.mockResolvedValue({ success: true, data: make_capture(3, 2, 1) });
        read_capture_snapshot.mockResolvedValue(make_snapshot(
            [make_event(1, 'user_action'), make_event(2, 'user_action')],
            [{ request_id: 'r1' }],
        ));

        await load_detail('c1');
        expect(read_capture_snapshot).toHaveBeenCalledTimes(1);

        // 无新事件：event_count 仍 3（ws_frame 累计偏差存在但锚点已记录）→ 不读
        await load_detail('c1', { incremental: true });
        expect(read_capture_snapshot).toHaveBeenCalledTimes(1);
    });

    it('AC-002d: stats 与 store 条数脱钩时 request_count 增量仍触发（f008：防混合口径回归）', async () => {
        const { load_detail } = await import_shared();
        // 首轮：stats request_count=1，但 snapshot 含 2 条 network（ws_frame 累计使 store 条数 > request_count）
        send_ui_message.mockResolvedValue({ success: true, data: make_capture(3, 2, 1) });
        read_capture_snapshot.mockResolvedValue(make_snapshot(
            [make_event(1, 'user_action'), make_event(2, 'user_action')],
            [{ request_id: 'r1' }, { request_id: 'ws_frame_1' }],
        ));

        await load_detail('c1');
        expect(read_capture_snapshot).toHaveBeenCalledTimes(1);

        // 二轮：仅 request_count 2（+1 心跳请求），event_count 不变 → 须触发刷新
        // （stats 对 stats：2>1 绿；混合口径 request>store 条数：2>2 红——防回归）
        send_ui_message.mockResolvedValue({ success: true, data: make_capture(3, 2, 2) });
        await load_detail('c1', { incremental: true });
        expect(read_capture_snapshot).toHaveBeenCalledTimes(2);
    });
});
