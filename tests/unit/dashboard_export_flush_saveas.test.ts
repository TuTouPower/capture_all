// tests/unit/dashboard_export_flush_saveas.test.ts
// 验证导出前 flush + export_save_as 控制 saveAs（P1-10）
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { download_blob } from '../../src/extension/shared/export_utils';

const flush_all = vi.hoisted(() => vi.fn());
const export_json = vi.hoisted(() => vi.fn());

vi.mock('../../src/extension/background/storage', async (import_original) => ({
    ...await import_original<typeof import('../../src/extension/background/storage')>(),
    flush_all,
}));
vi.mock('../../src/extension/background/exporter', async (import_original) => ({
    ...await import_original<typeof import('../../src/extension/background/exporter')>(),
    export_json,
}));

const log_write = vi.hoisted(() => vi.fn());
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

let on_message_cb: ((msg: any, _s: any, send: (r: any) => void) => void) | undefined;

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
            local: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) },
            onChanged: { addListener: vi.fn() },
        },
        tabs: {
            query: vi.fn(async () => [{ id: 1, url: 'https://example.com', title: 'T', windowId: 1 }]),
            get: vi.fn(async () => ({ id: 1, url: 'https://example.com' })),
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
        downloads: { download: vi.fn(async () => 1) },
    });
}

function send_message(action: string): Promise<any> {
    return new Promise((resolve) => on_message_cb!({ action, capture_id: 'cap' }, {}, resolve));
}

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    install_chrome_mock();
    flush_all.mockResolvedValue(undefined);
    export_json.mockResolvedValue('{}');
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('导出 flush + saveAs (T107)', () => {
    test('AC-001: export_json 请求前调用 flush_all', async () => {
        await import('../../src/extension/background/service_worker');
        await send_message('export_json');
        expect(flush_all).toHaveBeenCalled();
        expect(export_json).toHaveBeenCalledWith('cap');
    });

    test('AC-002: export_save_as=true 时 downloads.download saveAs=true', async () => {
        // 无 showSaveFilePicker（node 环境）→ 走 downloads 兜底
        const download_spy = (globalThis as any).chrome.downloads.download;
        const blob = new Blob(['{}'], { type: 'application/json' });
        await download_blob(blob, 'cap.json', 'capture_export', true);
        expect(download_spy).toHaveBeenCalledWith(expect.objectContaining({ saveAs: true }));
    });

    test('AC-003: export_save_as=false 时不强制 saveAs true', async () => {
        const download_spy = (globalThis as any).chrome.downloads.download;
        const blob = new Blob(['{}'], { type: 'application/json' });
        await download_blob(blob, 'cap.json', 'capture_export', false);
        expect(download_spy).toHaveBeenCalledWith(expect.objectContaining({ saveAs: false }));
    });
});
