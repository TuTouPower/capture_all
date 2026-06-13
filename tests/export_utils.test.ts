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

describe('download_blob', () => {
    it('calls chrome.downloads.download with saveAs true by default', async () => {
        const blob = new Blob(['test'], { type: 'text/plain' });
        await download_blob(blob, 'test/file.txt');
        expect(mock_download).toHaveBeenCalledWith({
            url: 'blob:mock-url',
            filename: 'test/file.txt',
            saveAs: true,
        });
    });

    it('respects save_as option when false', async () => {
        const blob = new Blob(['test'], { type: 'text/plain' });
        await download_blob(blob, 'test/file.txt', { save_as: false });
        expect(mock_download).toHaveBeenCalledWith({
            url: 'blob:mock-url',
            filename: 'test/file.txt',
            saveAs: false,
        });
    });

    it('returns download_id from chrome.downloads.download', async () => {
        mock_download.mockResolvedValue(99);
        const blob = new Blob(['test'], { type: 'text/plain' });
        const id = await download_blob(blob, 'test/file.txt');
        expect(id).toBe(99);
    });

    it('creates and revokes blob URL', async () => {
        vi.useFakeTimers();
        const blob = new Blob(['test'], { type: 'text/plain' });
        const promise = download_blob(blob, 'test/file.txt');
        await promise;
        expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
        vi.advanceTimersByTime(5000);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
        vi.useRealTimers();
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
        'src/detail/detail.ts',
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
