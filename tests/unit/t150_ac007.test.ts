// tests/unit/t150_ac007.test.ts
// t150 AC-007: 未处理 rejection 位点补 .catch 后不产生 unhandled rejection。
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const load_user_config = vi.hoisted(() => vi.fn());
const get_db_mock = vi.hoisted(() => vi.fn());

vi.mock('../../src/extension/background/storage', async (import_original) => ({
    ...await import_original<typeof import('../../src/extension/background/storage')>(),
    get_db: get_db_mock,
}));
vi.mock('../../src/shared/user_config', () => ({ load_user_config }));
vi.mock('../../src/extension/background/app_log_storage', async (import_original) => ({
    ...await import_original<typeof import('../../src/extension/background/app_log_storage')>(),
    get_app_log_transport: () => ({
        write: sw_log_write,
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

describe('app_log_storage schedule_flush 未处理 rejection（t150 AC-007）', () => {
    let unhandled: Error[];
    const on_unhandled = (e: PromiseRejectionEvent | Event): void => {
        const err = (e as PromiseRejectionEvent).reason;
        unhandled.push(err instanceof Error ? err : new Error(String(err)));
    };

    beforeEach(() => {
        vi.clearAllMocks();
        load_user_config.mockResolvedValue({ agent_bridge_enabled: false, log_level: 'error' });
        unhandled = [];
        process.on('unhandledRejection', on_unhandled);
    });
    afterEach(() => {
        process.off('unhandledRejection', on_unhandled);
    });

    it('flush 抛错时 schedule_flush .catch 生效，无未处理 rejection 且 flush 路径执行', async () => {
        // flush 内部 get_db 抛错
        get_db_mock.mockRejectedValue(new Error('db unavailable'));
        const { IndexedDBLogTransport } = await import('../../src/extension/background/app_log_storage');
        const transport = new IndexedDBLogTransport();

        // write 触发 schedule_flush（setTimeout 100ms 后 flush）
        transport.write({ id: 'e1', timestamp: 1, level: 'info', module: 'm', message: 'x', details: null } as never);

        // 等 flush 定时器触发（100ms）并完成 .catch
        await new Promise((r) => setTimeout(r, 200));

        // 正向断言：flush 路径确实执行（get_db 被调），非依赖隐式失败
        expect(get_db_mock).toHaveBeenCalled();
        // 无未处理 rejection 泄漏（.catch 生效）
        expect(unhandled).toEqual([]);
    });
});

// ── service_worker tabs.get 未处理 rejection（t150 AC-007 f001 第二处位点） ──
const sw_log_write = vi.hoisted(() => vi.fn());
let on_message_cb: ((msg: any, _s: any, send: (r: any) => void) => void) | undefined;

function add_listener(): { addListener: ReturnType<typeof vi.fn> } {
    return { addListener: vi.fn() };
}

let tabs_get_mock: ReturnType<typeof vi.fn>;

function install_sw_chrome_mock(): void {
    tabs_get_mock = vi.fn(async () => ({ id: 42, url: 'https://example.com' }));
    vi.stubGlobal('self', { addEventListener: vi.fn() });
    vi.stubGlobal('chrome', {
        dbg: { attach: vi.fn(async () => {}), detach: vi.fn(async () => {}), sendCommand: vi.fn(async () => ({})), onEvent: { addListener: vi.fn(), removeListener: vi.fn() } },
        debugger: { attach: vi.fn(async () => {}), detach: vi.fn(async () => {}), sendCommand: vi.fn(async () => ({})), onEvent: { addListener: vi.fn(), removeListener: vi.fn() } },
        runtime: { getManifest: vi.fn(() => ({ version: '0.1.0' })), onInstalled: add_listener(), onMessage: { addListener: (cb: any) => { on_message_cb = cb; } } },
        storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) }, onChanged: { addListener: vi.fn() } },
        tabs: {
            query: vi.fn(async () => [{ id: 42, url: 'https://example.com', title: 'T', windowId: 1 }]),
            get: tabs_get_mock,
            sendMessage: vi.fn(async () => undefined),
            onActivated: add_listener(),
            onRemoved: add_listener(),
            onCreated: add_listener(),
            onUpdated: add_listener(),
        },
        webRequest: { onBeforeRequest: add_listener(), onBeforeSendHeaders: add_listener(), onHeadersReceived: add_listener(), onCompleted: add_listener(), onErrorOccurred: add_listener() },
        cookies: { onChanged: add_listener(), getAll: vi.fn(async () => []) },
    });
}

describe('service_worker tabs.get 未处理 rejection（t150 AC-007 f001）', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        on_message_cb = undefined;
        install_sw_chrome_mock();
        load_user_config.mockResolvedValue({ agent_bridge_enabled: false, log_level: 'error' });
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('tab 激活后 tabs.get 抛错不产生 unhandled rejection（B2-M4 try/catch 生效）', async () => {
        await import('../../src/extension/background/service_worker');

        // 先 start 进 capturing（is_capturing=true，否则 onActivated handler 首行提前返回）
        const start_res = await new Promise((resolve) => on_message_cb!({ action: 'start', payload: { capture_id: 'cap_ac007', config: { capture_network: false, capture_console: false } } }, {}, resolve));
        expect((start_res as { success?: boolean }).success).toBe(true);

        // tabs.get reject（tab 已关闭）
        tabs_get_mock.mockRejectedValue(new Error('No tab with id'));

        const on_activated_cb = (globalThis as any).chrome.tabs.onActivated.addListener.mock.calls[0][0] as (info: { tabId: number; windowId: number }) => Promise<void>;
        // 触发 onActivated，tabs.get 抛错被 try/catch 捕获（warn + return），不冒泡
        await expect(on_activated_cb({ tabId: 42, windowId: 1 })).resolves.toBeUndefined();
        // 正向断言：tabs.get 确实被调（非空转）
        expect(tabs_get_mock).toHaveBeenCalled();
    });
});
