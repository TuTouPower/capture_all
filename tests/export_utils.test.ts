// tests/export_utils.test.ts — P0.40 导出统一模块测试
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    download_blob,
    build_capture_filename,
    build_log_filename,
    extract_dir_from_filename,
    load_last_export_dirs,
    save_last_export_dir,
    track_export_dir,
} from '../src/shared/export_utils';

// Mock chrome APIs
const mock_download = vi.fn();
const mock_storage_get = vi.fn();
const mock_storage_set = vi.fn();
const mock_on_changed_listeners: Array<(delta: { id: number; state?: { current: string } }) => void> = [];
const mock_search = vi.fn();

beforeEach(() => {
    vi.stubGlobal('chrome', {
        downloads: {
            download: mock_download,
            search: mock_search,
            onChanged: {
                addListener: vi.fn((fn) => mock_on_changed_listeners.push(fn)),
                removeListener: vi.fn((fn) => {
                    const idx = mock_on_changed_listeners.indexOf(fn);
                    if (idx >= 0) mock_on_changed_listeners.splice(idx, 1);
                }),
            },
        },
        storage: {
            local: {
                get: mock_storage_get,
                set: mock_storage_set,
            },
        },
    });
    vi.stubGlobal('URL', {
        createObjectURL: vi.fn(() => 'blob:mock-url'),
        revokeObjectURL: vi.fn(),
    });
    mock_download.mockReset();
    mock_storage_get.mockReset();
    mock_storage_set.mockReset();
    mock_search.mockReset();
    mock_on_changed_listeners.length = 0;
    mock_download.mockResolvedValue(42);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

const now = new Date('2024-02-03T04:05:06.000Z');
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

    it('uses last_dir over config directory when provided', () => {
        const name = build_capture_filename(
            {
                export_capture_directory: 'captures',
                export_filename_template: '{capture_id}.{ext}',
                ...tz_config,
            },
            'cap_1',
            'json',
            'my-custom-dir',
        );
        expect(name).toContain('my-custom-dir/');
        expect(name).not.toContain('captures/');
    });
});

describe('build_log_filename', () => {
    it('uses export_log_directory from config', () => {
        const name = build_log_filename(
            {
                export_log_directory: 'logs',
                ...tz_config,
            },
        );
        expect(name).toMatch(/^logs\/capture_all_logs_/);
    });

    it('uses last_dir over config directory when provided', () => {
        const name = build_log_filename(
            {
                export_log_directory: 'logs',
                ...tz_config,
            },
            'my-log-dir',
        );
        expect(name).toMatch(/^my-log-dir\/capture_all_logs_/);
    });

    it('returns filename without directory when both are empty', () => {
        const name = build_log_filename(
            {
                export_log_directory: '',
                ...tz_config,
            },
        );
        expect(name).toMatch(/^capture_all_logs_/);
        expect(name).not.toContain('/');
    });
});

describe('extract_dir_from_filename', () => {
    it('extracts directory from path', () => {
        expect(extract_dir_from_filename('logs/export.log')).toBe('logs');
    });

    it('returns empty for flat filename', () => {
        expect(extract_dir_from_filename('export.log')).toBe('');
    });

    it('returns empty for root-level file', () => {
        expect(extract_dir_from_filename('/export.log')).toBe('');
    });

    it('handles nested directories', () => {
        expect(extract_dir_from_filename('a/b/c/file.txt')).toBe('a/b/c');
    });
});

describe('last export dirs storage', () => {
    it('load_last_export_dirs returns empty strings when nothing stored', async () => {
        mock_storage_get.mockResolvedValue({});
        const dirs = await load_last_export_dirs();
        expect(dirs).toEqual({ capture_dir: '', log_dir: '' });
    });

    it('load_last_export_dirs returns stored values', async () => {
        mock_storage_get.mockResolvedValue({
            last_capture_export_dir: 'my-captures',
            last_log_export_dir: 'my-logs',
        });
        const dirs = await load_last_export_dirs();
        expect(dirs).toEqual({
            capture_dir: 'my-captures',
            log_dir: 'my-logs',
        });
    });

    it('save_last_export_dir stores capture dir', async () => {
        await save_last_export_dir('capture', 'new-capture-dir');
        expect(mock_storage_set).toHaveBeenCalledWith({
            last_capture_export_dir: 'new-capture-dir',
        });
    });

    it('save_last_export_dir stores log dir', async () => {
        await save_last_export_dir('log', 'new-log-dir');
        expect(mock_storage_set).toHaveBeenCalledWith({
            last_log_export_dir: 'new-log-dir',
        });
    });

    it('track_export_dir stores capture dir when download completes', async () => {
        // Initial search: not yet complete → register listener
        mock_search.mockResolvedValueOnce([{ id: 42, filename: 'tmp/file.json', state: 'in_progress' }]);
        // Search after listener fires: complete
        mock_search.mockResolvedValueOnce([{ id: 42, filename: 'picked/capture/file.json', state: 'complete' }]);
        track_export_dir(42, 'capture');
        await Promise.resolve();

        mock_on_changed_listeners[0]({ id: 42, state: { current: 'complete' } });
        await Promise.resolve();
        await Promise.resolve();

        expect(mock_search).toHaveBeenCalledWith({ id: 42 });
        expect(mock_storage_set).toHaveBeenCalledWith({
            last_capture_export_dir: 'picked/capture',
        });
        expect(mock_on_changed_listeners).toHaveLength(0);
    });

    it('track_export_dir removes listener when download is interrupted', async () => {
        mock_search.mockResolvedValueOnce([{ id: 42, filename: 'tmp/file.json', state: 'in_progress' }]);
        track_export_dir(42, 'log');
        await Promise.resolve();

        mock_on_changed_listeners[0]({ id: 42, state: { current: 'interrupted' } });

        expect(mock_storage_set).not.toHaveBeenCalled();
        expect(mock_on_changed_listeners).toHaveLength(0);
    });

    it('track_export_dir persists dir if download already completed', async () => {
        mock_search.mockResolvedValueOnce([{ id: 42, filename: 'picked/already/file.json', state: 'complete' }]);
        track_export_dir(42, 'capture');
        await Promise.resolve();
        await Promise.resolve();

        expect(mock_storage_set).toHaveBeenCalledWith({
            last_capture_export_dir: 'picked/already',
        });
        expect(mock_on_changed_listeners).toHaveLength(0);
    });
});

describe('P0.40: three export entries unified', () => {
    it('dashboard imports download_blob from export_utils', () => {
        const { readFileSync } = require('node:fs');
        const { resolve } = require('node:path');
        const dashboard_src = readFileSync(
            resolve(__dirname, '..', 'src/dashboard/dashboard.ts'),
            'utf8',
        );
        expect(dashboard_src).toMatch(
            /import.*download_blob.*from.*export_utils/,
        );
    });

    it('detail imports download_blob from export_utils', () => {
        const { readFileSync } = require('node:fs');
        const { resolve } = require('node:path');
        const detail_src = readFileSync(
            resolve(__dirname, '..', 'src/detail/detail.ts'),
            'utf8',
        );
        expect(detail_src).toMatch(
            /import.*download_blob.*from.*export_utils/,
        );
    });

    it('popup imports download_blob from export_utils', () => {
        const { readFileSync } = require('node:fs');
        const { resolve } = require('node:path');
        const popup_src = readFileSync(
            resolve(__dirname, '..', 'src/popup/popup.ts'),
            'utf8',
        );
        expect(popup_src).toMatch(
            /import.*download_blob.*from.*export_utils/,
        );
    });

    it('all capture export entries load and track the last capture directory', () => {
        const { readFileSync } = require('node:fs');
        const { resolve } = require('node:path');
        const sources = [
            readFileSync(resolve(__dirname, '..', 'src/dashboard/dashboard.ts'), 'utf8'),
            readFileSync(resolve(__dirname, '..', 'src/detail/detail.ts'), 'utf8'),
            readFileSync(resolve(__dirname, '..', 'src/popup/popup.ts'), 'utf8'),
        ];

        for (const source of sources) {
            expect(source).toMatch(/load_last_export_dirs/);
            expect(source).toMatch(/capture_dir/);
            expect(source).toMatch(/track_export_dir\([^)]*,\s*'capture'\)/);
        }
    });

    it('dashboard log export loads and tracks the last log directory separately', () => {
        const { readFileSync } = require('node:fs');
        const { resolve } = require('node:path');
        const dashboard_src = readFileSync(
            resolve(__dirname, '..', 'src/dashboard/dashboard.ts'),
            'utf8',
        );

        expect(dashboard_src).toMatch(/load_last_export_dirs/);
        expect(dashboard_src).toMatch(/log_dir/);
        expect(dashboard_src).toMatch(/track_export_dir\([^)]*,\s*'log'\)/);
    });
});
