// tests/unit/export_busy_guard.test.ts
// 验证 dashboard export_capture 导出 in-flight 防重入（p027）：
// in-flight 期间重复触发被拦截，单次 flush/构建/下载。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const read_capture_snapshot = vi.hoisted(() => vi.fn());
const build_archive = vi.hoisted(() => vi.fn());
const download_blob = vi.hoisted(() => vi.fn());
const log_write = vi.hoisted(() => vi.fn());

vi.mock('../../src/extension/shared/capture_data_reader', () => ({
    read_capture_snapshot,
}));
vi.mock('../../src/extension/shared/archive_builder', () => ({
    build_archive,
}));
vi.mock('../../src/extension/shared/export_utils', async (import_original) => ({
    ...await import_original<typeof import('../../src/extension/shared/export_utils')>(),
    download_blob,
}));
vi.mock('../../src/extension/background/app_log_storage', () => ({
    get_app_log_transport: () => ({
        write: log_write,
        flush: vi.fn(),
        get_entries: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        clear: vi.fn(),
    }),
}));

let send_message_impl: (msg: any) => Promise<any>;

function install_chrome_mock(): void {
    vi.stubGlobal('chrome', {
        runtime: {
            id: 'test-ext-id',
            sendMessage: vi.fn((msg: any) => send_message_impl(msg)),
        },
    });
}

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    install_chrome_mock();
    send_message_impl = vi.fn(async () => ({ success: true }));
    read_capture_snapshot.mockResolvedValue({
        capture: { capture_id: 'cap_busy' },
        user_events: [], nav_events: [], error_events: [], storage_changes: [], cookie_changes: [],
        network_requests: [], console_events: [],
    });
    build_archive.mockResolvedValue(new Blob(['zip'], { type: 'application/zip' }));
    download_blob.mockResolvedValue(undefined);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('export_capture 防重入 (p027)', () => {
    it('in-flight 期间同 key 重复触发被拦截，单次 flush/构建/下载', async () => {
        const { set_user_config, export_capture } = await import('../../src/extension/dashboard/dashboard_shared');
        set_user_config({
            export_capture_directory: '',
            export_filename_template: '{capture_id}.{ext}',
            export_log_directory: '',
            system_time_timezone: 'UTC+8',
            inline_text_max_bytes: 32768,
        } as any);

        // 第一次调用挂起在 snapshot 读取阶段（in-flight）
        let resolve_snapshot: (v: any) => void = () => {};
        read_capture_snapshot.mockImplementationOnce(() => new Promise((r) => { resolve_snapshot = r; }));

        const first = export_capture('cap_busy', 'archive');
        // in-flight 期间第二次触发 → 拦截
        const second = export_capture('cap_busy', 'archive');
        await second;

        // 释放第一次
        resolve_snapshot({
            capture: { capture_id: 'cap_busy' },
            user_events: [], nav_events: [], error_events: [], storage_changes: [], cookie_changes: [],
            network_requests: [], console_events: [],
        });
        await first;

        // 单次 flush/构建/下载
        expect(download_blob).toHaveBeenCalledTimes(1);
        expect(build_archive).toHaveBeenCalledTimes(1);
        const flush_calls = (globalThis as any).chrome.runtime.sendMessage.mock.calls.filter((c: any) => c[0].action === 'flush');
        expect(flush_calls).toHaveLength(1);
    });

    it('串行两次导出均正常执行（防重入标记释放）', async () => {
        const { set_user_config, export_capture } = await import('../../src/extension/dashboard/dashboard_shared');
        set_user_config({
            export_capture_directory: '',
            export_filename_template: '{capture_id}.{ext}',
            export_log_directory: '',
            system_time_timezone: 'UTC+8',
            inline_text_max_bytes: 32768,
        } as any);

        await export_capture('cap_a', 'archive');
        await export_capture('cap_b', 'archive');

        expect(download_blob).toHaveBeenCalledTimes(2);
    });

    it('不同 capture 的导出互不拦截（批量导出语义保留）', async () => {
        const { set_user_config, export_capture } = await import('../../src/extension/dashboard/dashboard_shared');
        set_user_config({
            export_capture_directory: '',
            export_filename_template: '{capture_id}.{ext}',
            export_log_directory: '',
            system_time_timezone: 'UTC+8',
            inline_text_max_bytes: 32768,
        } as any);

        // cap_a 挂起 in-flight 时，cap_b 导出仍可执行
        let resolve_snapshot_a: (v: any) => void = () => {};
        read_capture_snapshot.mockImplementationOnce(() => new Promise((r) => { resolve_snapshot_a = r; }));

        const first = export_capture('cap_a', 'archive');
        const second = export_capture('cap_b', 'archive');
        await second;

        resolve_snapshot_a({
            capture: { capture_id: 'cap_a' },
            user_events: [], nav_events: [], error_events: [], storage_changes: [], cookie_changes: [],
            network_requests: [], console_events: [],
        });
        await first;

        expect(download_blob).toHaveBeenCalledTimes(2);
    });
});
