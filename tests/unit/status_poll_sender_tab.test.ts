// tests/unit/status_poll_sender_tab.test.ts
// 验证 get_status 按 sender.tab.id 权威回填 tab_id（P1-8）
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const log_write = vi.hoisted(() => vi.fn());
const storage_get = vi.hoisted(() => vi.fn());
const storage_set = vi.hoisted(() => vi.fn());
const tabs_query = vi.hoisted(() => vi.fn());

vi.mock('../../src/extension/background/app_log_storage', () => ({
    get_app_log_transport: () => ({
        write: log_write,
        flush: vi.fn(),
        get_entries: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        clear: vi.fn(),
    }),
}));
vi.mock('../../src/extension/background/keepalive', () => ({
    setup_keepalive_listener: vi.fn(),
    start_keepalive: vi.fn(),
    stop_keepalive: vi.fn(),
}));

function add_listener(): { addListener: ReturnType<typeof vi.fn> } {
    return { addListener: vi.fn() };
}

let on_message_cb: ((msg: any, sender: any, send: (r: any) => void) => void) | undefined;

function install_chrome_mock(): void {
    vi.stubGlobal('self', { addEventListener: vi.fn() });
    vi.stubGlobal('chrome', {
        debugger: {},
        runtime: {
            getManifest: vi.fn(() => ({ version: '0.1.0' })),
            onInstalled: add_listener(),
            onMessage: { addListener: (cb: any) => { on_message_cb = cb; } },
        },
        storage: {
            local: { get: storage_get, set: storage_set },
            onChanged: { addListener: vi.fn() },
        },
        tabs: {
            query: tabs_query,
            get: vi.fn(async () => ({ id: 5, url: 'https://example.com' })),
            sendMessage: vi.fn(async () => undefined),
            onActivated: add_listener(),
            onRemoved: add_listener(),
            onCreated: add_listener(),
            onUpdated: add_listener(),
        },
        webRequest: {
            onBeforeRequest: add_listener(),
            onBeforeSendHeaders: add_listener(),
            onHeadersReceived: add_listener(),
            onCompleted: add_listener(),
            onErrorOccurred: add_listener(),
        },
        cookies: { onChanged: add_listener(), getAll: vi.fn(async () => []) },
    });
}

function send_message(action: string, sender: any): Promise<any> {
    if (!on_message_cb) throw new Error('no listener');
    return new Promise((resolve) => on_message_cb!({ action }, sender, resolve));
}

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    install_chrome_mock();
    storage_get.mockResolvedValue({});
    storage_set.mockResolvedValue(undefined);
    tabs_query.mockResolvedValue([{ id: 5, url: 'https://example.com', title: 'T', windowId: 1 }]);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('get_status 按 sender.tab.id 权威 (T105)', () => {
    test('AC-001: get_status 请求 sender.tab.id 与 active tab 不同时，响应 tab_id 为 sender 的', async () => {
        await import('../../src/extension/background/service_worker');

        // sender.tab.id=5，current active tab 假设为 0（未采集）
        const resp = await send_message('get_status', { tab: { id: 5, url: 'https://example.com' } });
        expect(resp.tab_id).toBe(5);
    });

    test('AC-001b: 采集进行中 current_capture.tab_id(A) 与 sender.tab.id(B) 不同时，响应为 B', async () => {
        const { init_db } = await import('../../src/extension/background/storage');
        await init_db();
        await import('../../src/extension/background/service_worker');

        // 真实 start_capture：tabs.query mock 返回 active tab id=7 → current_capture.tab_id=7
        tabs_query.mockResolvedValue([{ id: 7, url: 'https://a.com', title: 'A', windowId: 1 }]);
        const start_res = await new Promise((resolve) => on_message_cb!({ action: 'start', capture_id: 'cap_7', config: {} }, { tab: { id: 7, url: 'https://a.com' } }, resolve));
        expect(start_res.success).toBe(true);

        // sender.tab.id=5 ≠ 7
        const resp = await send_message('get_status', { tab: { id: 5, url: 'https://example.com' } });
        expect(resp.tab_id).toBe(5);
    });

    test('AC-002: content 侧 on_active 使用 resp.tab_id（消息契约）', async () => {
        // content_script on_active 用 resp.tab_id（SW 已按 sender 权威回填）
        const fs = await import('node:fs');
        const path = await import('node:path');
        const src = fs.readFileSync(
            path.resolve(__dirname, '..', '..', 'src', 'extension', 'content', 'content_script.ts'),
            'utf8'
        );
        const on_active = src.split(/on_active:/)[1] ?? '';
        expect(on_active).toMatch(/tab_id = resp\.tab_id/);
    });
});
