// tests/export_utils.test.ts — 导出统一模块测试
// P0.53: 移除 last_dir 持久化机制（chrome.downloads 只接受相对路径，
// 却返回绝对路径，回填必然失败）。导出目录唯一来源为用户配置。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    download_blob,
    build_capture_filename,
    build_log_filename,
} from '../src/shared/export_utils';

// Mock chrome APIs
const mock_download = vi.fn();

beforeEach(() => {
    vi.stubGlobal('chrome', {
        downloads: {
            download: mock_download,
        },
    });
    vi.stubGlobal('URL', {
        createObjectURL: vi.fn(() => 'blob:mock-url'),
        revokeObjectURL: vi.fn(),
    });
    mock_download.mockReset();
    mock_download.mockResolvedValue(42);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

const tz_config = { system_time_timezone: 'UTC+8' as const };

// P0.61: saveAs 由 filename 是否含子目录自动决定，opts.save_as 不再参与。
// - filename 含 '/' → saveAs: false（直接存，不弹框）
// - filename 不含 '/' → saveAs: true（弹框让 Chrome 记忆）
describe('download_blob', () => {
    it('P0.61: saveAs=false when filename has subdirectory (captures/foo.zip)', async () => {
        const blob = new Blob(['test'], { type: 'application/zip' });
        await download_blob(blob, 'captures/foo.zip');
        expect(mock_download).toHaveBeenCalledWith({
            url: 'blob:mock-url',
            filename: 'captures/foo.zip',
            saveAs: false,
        });
    });

    it('P0.61: saveAs=true when filename has no subdirectory (foo.zip)', async () => {
        const blob = new Blob(['test'], { type: 'application/zip' });
        await download_blob(blob, 'foo.zip');
        expect(mock_download).toHaveBeenCalledWith({
            url: 'blob:mock-url',
            filename: 'foo.zip',
            saveAs: true,
        });
    });

    it('P0.61: saveAs=false when filename has deeper subdirectory (logs/bar.log)', async () => {
        const blob = new Blob(['log data'], { type: 'text/plain' });
        await download_blob(blob, 'logs/bar.log');
        expect(mock_download).toHaveBeenCalledWith({
            url: 'blob:mock-url',
            filename: 'logs/bar.log',
            saveAs: false,
        });
    });

    it('returns download_id from chrome.downloads.download', async () => {
        mock_download.mockResolvedValue(99);
        const blob = new Blob(['test'], { type: 'text/plain' });
        const id = await download_blob(blob, 'cap_1.json');
        expect(id).toBe(99);
    });

    it('creates and revokes blob URL', async () => {
        vi.useFakeTimers();
        const blob = new Blob(['test'], { type: 'text/plain' });
        const promise = download_blob(blob, 'cap_1.json');
        await promise;
        expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
        vi.advanceTimersByTime(5000);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
        vi.useRealTimers();
    });
});

// P0.62: 空目录时优先用 showSaveFilePicker（浏览器按 id 记忆上次任意文件夹），
// 不可用时退回 chrome.downloads.download。
describe('download_blob: showSaveFilePicker', () => {
    const make_picker = () => {
        const write = vi.fn().mockResolvedValue(undefined);
        const close = vi.fn().mockResolvedValue(undefined);
        const create_writable = vi.fn().mockResolvedValue({ write, close });
        const picker = vi.fn().mockResolvedValue({ createWritable: create_writable });
        return { picker, write, close };
    };

    it('uses picker (not downloads API) when filename has no subdirectory', async () => {
        const { picker, write, close } = make_picker();
        vi.stubGlobal('showSaveFilePicker', picker);
        const blob = new Blob(['test'], { type: 'application/zip' });
        const ret = await download_blob(blob, 'foo.zip', 'capture_export');
        expect(picker).toHaveBeenCalledWith(expect.objectContaining({
            suggestedName: 'foo.zip',
            id: 'capture_export',
        }));
        expect(write).toHaveBeenCalledWith(blob);
        expect(close).toHaveBeenCalled();
        expect(mock_download).not.toHaveBeenCalled();
        expect(ret).toBeUndefined();
    });

    it('bypasses picker and uses downloads API when filename has subdirectory', async () => {
        const { picker } = make_picker();
        vi.stubGlobal('showSaveFilePicker', picker);
        const blob = new Blob(['test'], { type: 'application/zip' });
        await download_blob(blob, 'captures/foo.zip', 'capture_export');
        expect(picker).not.toHaveBeenCalled();
        expect(mock_download).toHaveBeenCalledWith({
            url: 'blob:mock-url',
            filename: 'captures/foo.zip',
            saveAs: false,
        });
    });

    it('swallows AbortError (user cancel) without throwing or falling back', async () => {
        const picker = vi.fn().mockRejectedValue(
            new DOMException('cancelled', 'AbortError'),
        );
        vi.stubGlobal('showSaveFilePicker', picker);
        const blob = new Blob(['test'], { type: 'application/zip' });
        const ret = await download_blob(blob, 'foo.zip', 'capture_export');
        expect(ret).toBeUndefined();
        expect(mock_download).not.toHaveBeenCalled();
    });

    it('rethrows non-AbortError picker failures', async () => {
        const picker = vi.fn().mockRejectedValue(new Error('disk full'));
        vi.stubGlobal('showSaveFilePicker', picker);
        const blob = new Blob(['test'], { type: 'application/zip' });
        await expect(download_blob(blob, 'foo.zip', 'log_export')).rejects.toThrow('disk full');
    });

    it('falls back to downloads API when picker is unavailable', async () => {
        const blob = new Blob(['test'], { type: 'application/zip' });
        await download_blob(blob, 'foo.zip', 'capture_export');
        expect(mock_download).toHaveBeenCalledWith({
            url: 'blob:mock-url',
            filename: 'foo.zip',
            saveAs: true,
        });
    });
});

describe('build_capture_filename', () => {
    it('uses export_capture_directory from config', () => {
        const name = build_capture_filename(
            {
                export_capture_directory: 'captures',
                export_filename_template: '{capture_id}.{ext}',
                ...tz_config,
            },
            'cap_1',
            'json',
        );
        expect(name).toContain('captures/');
        expect(name).toMatch(/cap_1\.json$/);
    });

    it('returns flat filename when config directory empty', () => {
        const name = build_capture_filename(
            {
                export_capture_directory: '',
                export_filename_template: '{capture_id}.{ext}',
                ...tz_config,
            },
            'cap_1',
            'json',
        );
        expect(name).toMatch(/^cap_1\.json$/);
        expect(name).not.toContain('/');
    });
});

describe('build_log_filename', () => {
    it('uses export_log_directory from config', () => {
        const name = build_log_filename({
            export_log_directory: 'logs',
            ...tz_config,
        });
        expect(name).toMatch(/^logs\/capture_all_logs_/);
    });

    it('returns filename without directory when config empty', () => {
        const name = build_log_filename({
            export_log_directory: '',
            ...tz_config,
        });
        expect(name).toMatch(/^capture_all_logs_/);
        expect(name).not.toContain('/');
    });
});

describe('P0.40/P0.53: export entries unified, no last_dir override', () => {
    const read = (rel: string): string => {
        const { readFileSync } = require('node:fs');
        const { resolve } = require('node:path');
        return readFileSync(resolve(__dirname, '..', rel), 'utf8');
    };
    const entries = [
        'src/dashboard/dashboard.ts',
        'src/popup/popup.ts',
    ];

    it('all entries import download_blob from export_utils', () => {
        for (const f of entries) {
            expect(read(f)).toMatch(/import.*download_blob.*from.*export_utils/);
        }
    });

    it('no entry references the removed last_dir tracking API', () => {
        for (const f of [...entries]) {
            const src = read(f);
            expect(src).not.toMatch(/load_last_export_dirs/);
            expect(src).not.toMatch(/track_export_dir/);
        }
    });

    it('export_utils no longer exposes last_dir storage helpers', () => {
        const src = read('src/shared/export_utils.ts');
        expect(src).not.toMatch(/load_last_export_dirs/);
        expect(src).not.toMatch(/save_last_export_dir/);
        expect(src).not.toMatch(/track_export_dir/);
        expect(src).not.toMatch(/last_capture_export_dir/);
    });
});
