// tests/unit/t140_resource_budget.test.ts
// t140: 大数据量路径资源预算——CDP body 总字节预算、64MiB 结果预算、cursor 分页。
import 'fake-indexeddb/auto';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { _enforce_body_budget_for_test, _set_max_session_body_bytes_for_test } from '../../src/bridge/cdp_handler';

// ── bridge client 64MiB 测试 mock 环境 ─────────────────────────
const storage_get = vi.hoisted(() => vi.fn());
const storage_set = vi.hoisted(() => vi.fn());
const storage_remove = vi.hoisted(() => vi.fn());

Object.defineProperty(globalThis, 'chrome', {
    value: {
        runtime: { id: 'test-ext-id', getManifest: () => ({ version: '0.1.0' }) },
        storage: { local: { get: storage_get, set: storage_set, remove: storage_remove } },
    },
    writable: true,
    configurable: true,
});

vi.mock('../../src/extension/background/app_log_storage', () => ({
    get_app_log_transport: vi.fn(() => ({ write: vi.fn(), flush: vi.fn(), get_entries: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0), clear: vi.fn() })),
}));
vi.mock('../../src/shared/logger', () => ({
    Logger: class { info() {} warn() {} error() {} debug() {} },
}));
vi.mock('../../src/extension/background/agent_command_dispatcher', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/extension/background/agent_command_dispatcher')>();
    return { ...actual, dispatch_agent_command: vi.fn() };
});

import { start_bridge_client, stop_bridge_client, set_bridge_session_for_tests } from '../../src/extension/background/agent_bridge_client';
import { dispatch_agent_command } from '../../src/extension/background/agent_command_dispatcher';

const MAX_RESULT = 64 * 1024 * 1024;

describe('CDP session body 总字节预算 (t140 AC-009/010)', () => {
    beforeEach(() => {
        _set_max_session_body_bytes_for_test(100);
    });
    afterEach(() => {
        _set_max_session_body_bytes_for_test(200 * 1024 * 1024); // 恢复默认
    });

    function make_session(): { events: Array<{ response_body: string | null }>; body_bytes: number } {
        return { events: [], body_bytes: 0 };
    }

    it('AC-009: body 总字节超预算时丢弃最旧带 body 事件', () => {
        const session = make_session() as never;
        const s = session as { events: Array<{ response_body: string | null }>; body_bytes: number };
        // 预算 100 字节，两条 60 字节 body 回写后触发淘汰
        s.events.push({ response_body: 'x'.repeat(60) });
        s.body_bytes += 60;
        s.events.push({ response_body: 'y'.repeat(60) });
        s.body_bytes += 60; // 总 120 > 100
        _enforce_body_budget_for_test(session);
        expect(s.events.length).toBe(1);
        expect(s.events[0].response_body).toBe('y'.repeat(60)); // 最新保留
    });

    it('AC-010: 预算内事件全部保留', () => {
        const session = make_session() as never;
        const s = session as { events: Array<{ response_body: string | null }>; body_bytes: number };
        s.events.push({ response_body: 'x'.repeat(10) });
        s.body_bytes += 10;
        s.events.push({ response_body: 'y'.repeat(20) });
        s.body_bytes += 20; // 总 30 < 100
        _enforce_body_budget_for_test(session);
        expect(s.events.length).toBe(2);
    });
});

describe('agent 结果 64MiB 预算 (t140 AC-005)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        stop_bridge_client();
        set_bridge_session_for_tests({ instance_id: 'inst_test_session', instance_token: 'ext_test_session_token' });
        storage_get.mockResolvedValue({
            agent_bridge_session: { instance_id: 'inst_test_session', instance_token: 'ext_test_session_token' },
        });
        storage_set.mockResolvedValue(undefined);
        storage_remove.mockResolvedValue(undefined);
        vi.useFakeTimers();
        (dispatch_agent_command as ReturnType<typeof vi.fn>).mockReset();
    });
    afterEach(() => {
        stop_bridge_client();
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('AC-005: 超 64MiB 结果投递 PAYLOAD_TOO_LARGE 错误（非超限 body）', async () => {
        // dispatch 返回超大结果
        (dispatch_agent_command as ReturnType<typeof vi.fn>).mockResolvedValue({
            command_id: 'cmd_big',
            ok: true,
            data: { big: 'x'.repeat(MAX_RESULT + 1) },
        });
        let result_body: string | null = null;
        const fetch_spy = vi.spyOn(global, 'fetch').mockImplementation(
            async (input: string | URL | Request, init?: RequestInit) => {
                const url = input.toString();
                if (url.endsWith('/extension/command')) {
                    return new Response(JSON.stringify({
                        command_id: 'cmd_big',
                        type: 'capture.get_all_data',
                        payload: {},
                        created_at: 1,
                    }), { status: 200 });
                }
                if (url.endsWith('/extension/result')) {
                    result_body = init?.body as string;
                }
                return new Response('{}', { status: 200 });
            },
        );

        start_bridge_client({
            get_user_config: vi.fn(async () => ({
                agent_bridge_enabled: true,
                agent_bridge_url: 'http://127.0.0.1:17831',
                agent_bridge_token: 'bridge_token_test',
                agent_bridge_poll_interval_ms: 250,
                browser_label: '',
            })),
            start_capture: vi.fn(async () => ({ success: true })),
            stop_capture: vi.fn(async () => ({ success: true })),
            get_status: vi.fn(() => ({ active_capture_id: null })),
            extension_version: '0.1.0',
        });
        await vi.advanceTimersByTimeAsync(0);
        stop_bridge_client();

        expect(result_body).not.toBeNull();
        const parsed = JSON.parse(result_body!);
        expect(parsed.ok).toBe(false);
        expect(parsed.error.code).toBe('PAYLOAD_TOO_LARGE');
        expect(parsed.command_id).toBe('cmd_big');
        expect(fetch_spy).toHaveBeenCalled();
    });
});

describe('agent 查询 cursor 分页 (t140 AC-001/002/004)', () => {
    let storage_mod: typeof import('../../src/extension/background/storage');

    beforeEach(async () => {
        vi.resetModules();
        // 注入 chrome mock 以满足 storage init
        Object.defineProperty(globalThis, 'chrome', {
            value: {
                runtime: { id: 'test-ext-id', getManifest: () => ({ version: '0.1.0' }) },
                storage: { local: { get: storage_get, set: storage_set, remove: storage_remove } },
            },
            writable: true,
            configurable: true,
        });
        storage_mod = await import('../../src/extension/background/storage');
        await storage_mod.init_db();
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('AC-002: 分页读取跨页不丢不重（cursor 直接分页）', async () => {
        const cap = 'cap_page';
        // 写入 12 条事件
        const events = Array.from({ length: 12 }, (_, i) => ({
            event_id: `evt_${i}`,
            capture_id: cap,
            category: 'user_action' as const,
            type: 'click',
            relative_time_ms: i,
            tab_id: 1,
            url: 'https://x',
            source: 'test' as const,
            severity: 'info' as const,
            created_at: i,
            data: {},
        }));
        await storage_mod.write_events(events as never);

        // 页 1：offset 0 limit 5
        const page1 = await storage_mod.get_events_by_category(cap, 'user_action', 0, 5);
        // 页 2：offset 5 limit 5
        const page2 = await storage_mod.get_events_by_category(cap, 'user_action', 5, 5);
        // 页 3：offset 10 limit 5
        const page3 = await storage_mod.get_events_by_category(cap, 'user_action', 10, 5);

        expect(page1).toHaveLength(5);
        expect(page2).toHaveLength(5);
        expect(page3).toHaveLength(2); // 剩余 2 条

        // 合并后 12 条，无重复
        const all = [...page1, ...page2, ...page3].map((e) => (e as { event_id: string }).event_id);
        expect(new Set(all).size).toBe(12);
    });

    it('AC-004: 无 getAll 全量调用（cursor 直接分页）', async () => {
        const cap = 'cap_no_getall';
        await storage_mod.write_events([
            { event_id: 'a', capture_id: cap, category: 'user_action', type: 'click', relative_time_ms: 1, tab_id: 1, url: 'https://x', source: 'test', severity: 'info', created_at: 1, data: {} },
        ] as never);
        // 分页查询应通过 cursor（index.openCursor），非 getAll 全量
        const result = await storage_mod.get_events_by_category(cap, 'user_action', 0, 10);
        expect(result).toHaveLength(1);
        // 源码断言：query_by_store 用 openCursor，无 index.getAll( 调用
        const { readFileSync } = require('node:fs');
        const { resolve } = require('node:path');
        const src = readFileSync(resolve(__dirname, '../../src/extension/background/storage.ts'), 'utf8');
        const qb = src.slice(src.indexOf('async function query_by_store'), src.indexOf('// Query with pagination'));
        expect(qb).toContain('index.openCursor');
        expect(qb).not.toContain('index.getAll(');
    });
});
