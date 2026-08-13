// tests/unit/store_contract_consistency.test.ts
// t180: store 数量契约对齐（10 vs 14）、capture_lifecycle_events 可见性（快照/export/Agent 源）、
// IndexedDB versionchange 长连接处理。AC-004 真实多上下文行为标注 [deploy]（spec 认可）。

import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { init_db, get_events_by_category, get_capture, get_network_requests, get_console_events } from '../../src/extension/background/storage';
import { read_capture_snapshot } from '../../src/extension/shared/capture_data_reader';
import { AGENT_DATA_SOURCES } from '../../src/shared/constants';

const root = resolve(__dirname, '..', '..');

function make_event(id: string, category: string, type: string) {
    return {
        event_id: id, capture_id: 'c1', category, type, relative_time_ms: 100,
        tab_id: 1, url: 'https://e.com', source: 'test', severity: 'info', created_at: 1,
    };
}

const lifecycle_event = make_event('lc1', 'capture_lifecycle', 'capture_started');

// ── AC-001：fresh install 实际 store 数量与文档一致 ─────────
describe('t180 AC-001: fresh DB store 数量契约', () => {
    it('init_db 后 objectStoreNames = 14（10 当前 + 4 legacy）', async () => {
        const db = await init_db();
        const names = Array.from(db.objectStoreNames);
        // 10 个当前 store（STORE_NAMES）由 AGENT_DATA_SOURCES + captures/app_logs/lifecycle 覆盖
        expect(names).toContain('captures');
        expect(names).toContain('app_logs');
        expect(names).toContain('capture_lifecycle_events');
        // 4 个 legacy stores 保留（旧版本兼容，仅不再写入）
        for (const legacy of ['sessions', 'events', 'console_logs', 'error_log']) {
            expect(names).toContain(legacy);
        }
        expect(names.length).toBe(14);
    });

    it('AGENT_DATA_SOURCES 含 capture_lifecycle_events（8 源，Agent 层可查）', () => {
        expect(AGENT_DATA_SOURCES).toContain('capture_lifecycle_events');
        expect(AGENT_DATA_SOURCES.length).toBe(8);
    });
});

// ── AC-002：export 事件合并包含 lifecycle ────────────────────
// mock 仅覆盖数据源读取函数，转发真实 init_db 等（AC-001/AC-004 用真实 fake-indexeddb）
vi.mock('../../src/extension/background/storage', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/extension/background/storage')>();
    return {
        ...actual,
        get_capture: vi.fn(async () => ({
            capture_id: 'c1', name: 'n', status: 'completed', started_at: '2026-01-01T00:00:00Z',
            ended_at: '2026-01-01T00:01:00Z', duration_ms: 60000, start_url: 'https://e.com', end_url: null,
            tab_id: 1, window_id: null, config_snapshot: {}, tags: [], created_at: '', updated_at: '',
            stats: { event_count: 0, user_action_count: 0, nav_count: 0, request_count: 0, log_count: 0, error_count: 0, storage_change_count: 0, cookie_change_count: 0, total_body_bytes: 0 },
        })),
        get_events_by_category: vi.fn(async (_capture_id: string, category: string) =>
            category === 'capture_lifecycle' ? [lifecycle_event] : []),
        get_network_requests: vi.fn(async () => []),
        get_console_events: vi.fn(async () => []),
    };
});

// AC-002 的 export 合并断言：exporter 事件读取包含 capture_lifecycle 类别
import { export_json } from '../../src/extension/background/exporter';
import { merge_detail_events } from '../../src/extension/dashboard/dashboard_shared';
import { load_agent_capture_data } from '../../src/extension/background/agent_data_queries';
import { write_events } from '../../src/extension/background/storage';
import { DB_NAME, DB_VERSION } from '../../src/shared/constants';
vi.mock('../../src/shared/user_config', () => ({
    load_user_config: vi.fn(async () => ({ system_time_timezone: 'UTC' })),
}));

describe('t180 AC-002: export 合并包含 lifecycle', () => {
    it('export_json 输出 events 含 capture_lifecycle 事件', async () => {
        const json = await export_json('c1');
        const data = JSON.parse(json);
        const types = data.events.map((e: { type: string }) => e.type);
        expect(types).toContain('capture_started');
    });
});

// ── AC-003：CaptureSnapshot 含 lifecycle；UI 不展示 ──────────
describe('t180 AC-003: lifecycle 可见性边界', () => {
    it('read_capture_snapshot 读取 capture_lifecycle 类别并返回 lifecycle_events', async () => {
        // 重置 AC-002 的模块级 mock 行为：read_capture_snapshot 依赖的 storage 函数
        vi.mocked(get_events_by_category).mockImplementation(async (_id: string, category: string) =>
            category === 'capture_lifecycle' ? [lifecycle_event] : []);
        const snapshot = await read_capture_snapshot('c1');
        expect(snapshot.lifecycle_events).toEqual([lifecycle_event]);
        expect(get_events_by_category).toHaveBeenCalledWith('c1', 'capture_lifecycle', 0, 5000);
    });

    it('UI detail timeline 不展示 lifecycle（merge_detail_events 显式 Pick 不含 lifecycle_events）', () => {
        const src = readFileSync(resolve(root, 'src/extension/dashboard/dashboard_shared.ts'), 'utf8');
        const pick_line = src.split('Pick<CaptureSnapshot,')[1]?.split('>')[0] ?? '';
        expect(pick_line).not.toContain('lifecycle_events');
    });

    it('Agent 下推路径 SOURCE_STORE 含 lifecycle 映射（get_entry_pushdown 可查）', () => {
        const src = readFileSync(resolve(root, 'src/extension/background/agent_data_queries.ts'), 'utf8');
        expect(src).toMatch(/capture_lifecycle_events: STORE_NAMES\.CAPTURE_LIFECYCLE_EVENTS/);
    });

    it('行为链路：写入 lifecycle 事件 → load_agent_capture_data 8 源返回（Agent 查询可达）', async () => {
        // 恢复真实读取（本文件 storage mock 覆盖读取函数，此处转发原实现验证写→读闭环）
        const actual = await vi.importActual<typeof import('../../src/extension/background/storage')>('../../src/extension/background/storage');
        vi.mocked(get_events_by_category).mockImplementation(actual.get_events_by_category);
        await write_events([lifecycle_event]);
        const data = await load_agent_capture_data('c1');
        expect(data.sources.capture_lifecycle_events.some((e) => e.event_id === 'lc1')).toBe(true);
        // sources.list 汇总包含 lifecycle 源
        const { list_sources_pushdown } = await import('../../src/extension/background/agent_data_queries');
        const summaries = await list_sources_pushdown('c1');
        const lc = summaries.find((s) => s.source === 'capture_lifecycle_events');
        expect(lc?.count).toBe(1);
    });

    it('行为链路：merge_detail_events 不含 lifecycle（UI 详情 timeline 不展示）', () => {
        // 传入含 lifecycle 事件的完整 snapshot（Pick 忽略未列字段）——输出须含普通事件、不含 lifecycle
        const ui_event = make_event('u1', 'user_action', 'mouse_event');
        const events = merge_detail_events('c1', {
            user_events: [ui_event],
            nav_events: [],
            error_events: [],
            storage_changes: [],
            cookie_changes: [],
            network_requests: [],
            console_events: [],
            lifecycle_events: [lifecycle_event],
        } as never);
        expect(events.some((e) => e.event_id === 'u1')).toBe(true);
        expect(events.some((e) => (e as { category?: string }).category === 'capture_lifecycle')).toBe(false);
        expect(events.some((e) => e.event_id === 'lc1')).toBe(false);
    });
});

// ── AC-004：versionchange 长连接处理（[deploy] 标注） ────────
describe('t180 AC-004: IndexedDB versionchange 处理（[deploy] 需真实多上下文验证）', () => {
    it('init_db 连接注册 onversionchange 且触发后关闭（不阻塞其他上下文 schema bump）', async () => {
        const db = await init_db();
        expect(typeof db.onversionchange).toBe('function');
        // fake-indexeddb：触发 versionchange 会调用注册回调；此处验证回调存在且可安全调用
        expect(() => {
            const handler = db.onversionchange as (() => void) | null;
            if (handler) handler();
        }).not.toThrow();
    });

    it('真实 versionchange 路径：更高版本 open 触发旧连接关闭，新连接不被 blocked', async () => {
        const db1 = await init_db();
        expect(db1.onversionchange).toBeTruthy();
        // 第二连接以更高版本打开 → 应触发 db1 的 versionchange（close），而不是无限 blocked
        const open_result = await new Promise<boolean>((resolve) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION + 100);
            req.onblocked = () => resolve(false); // 旧连接未关闭才触发
            req.onsuccess = () => resolve(true);
            req.onerror = () => resolve(false);
            // 防挂起
            setTimeout(() => resolve(false), 2000);
        });
        expect(open_result).toBe(true);
    });

    it('源码 onsuccess 分支设置 onversionchange 关闭并置空 db（防旧上下文阻塞）', () => {
        const src = readFileSync(resolve(root, 'src/extension/background/storage.ts'), 'utf8');
        expect(src).toMatch(/db\.onversionchange/);
        expect(src).toMatch(/db\?\.close\(\)/);
        expect(src).toMatch(/db = null/);
    });
});
