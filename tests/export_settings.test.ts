import { describe, expect, test } from 'vitest';
import { build_export_filename } from '../src/shared/export_settings';

const now = new Date('2024-02-03T04:05:06.000Z');

const config = { system_time_timezone: 'Asia/Shanghai' as const };

describe('export settings', () => {
    test('builds filename from capture tokens and configured timezone', () => {
        const filename = build_export_filename({
            export_capture_directory: '',
            export_filename_template: 'capture_all_{capture_id}_{date}.{ext}',
            ...config,
        }, 'capture_1', 'json', now);

        expect(filename).toBe('capture_all_capture_1_2024-02-03_12-05-06.json');
        expect(filename).not.toContain('session');
    });

    test('prefixes configured download subdirectory', () => {
        const filename = build_export_filename({
            export_capture_directory: 'record-all/exports',
            export_filename_template: '{capture_id}.{ext}',
            ...config,
        }, 'capture_1', 'har', now);

        expect(filename).toBe('record-all/exports/capture_1.har');
    });

    test('removes absolute and parent path segments from download paths', () => {
        const filename = build_export_filename({
            export_capture_directory: '/safe/../exports',
            export_filename_template: '../{capture_id}',
            ...config,
        }, 'capture_1', 'html', now);

        expect(filename).toBe('safe/exports/capture_1.html');
    });

    test('generated filenames pass chrome.downloads.download validation', () => {
        // chrome.downloads.download 文件名约束：
        // - 非绝对路径（不以 / 开头）
        // - 不含 .. 路径穿越
        // - 无连续斜杠（空路径段）
        // - 不含控制字符或 Windows 保留字符 < > : " | ? *
        const ids = ['capture_1', 'abc-123', 'test_capture'];
        const exts: Array<'json' | 'jsonl' | 'html' | 'har'> = ['json', 'jsonl', 'html', 'har'];
        const configs = [
            { export_capture_directory: '', export_filename_template: 'capture_all_{capture_id}_{date}.{ext}', ...config },
            { export_capture_directory: 'exports', export_filename_template: '{capture_id}.{ext}', ...config },
            { export_capture_directory: 'data/records', export_filename_template: 'capture_{capture_id}.{ext}', ...config },
            { export_capture_directory: '/abs/../safe', export_filename_template: '../{capture_id}_{date}', ...config },
        ];

        for (const config of configs) {
            for (const id of ids) {
                for (const ext of exts) {
                    const filename = build_export_filename(config, id, ext, now);

                    expect(filename, `"${filename}" 不应以 / 开头`).not.toMatch(/^\//);
                    expect(filename, `"${filename}" 不应包含 ..`).not.toContain('..');
                    expect(filename, `"${filename}" 不应有连续斜杠`).not.toMatch(/\/\//);
                    expect(filename, `"${filename}" 应以 .${ext} 结尾`).toMatch(new RegExp(`\\.${ext}$`));
                    expect(filename, `"${filename}" 不应包含非法文件名字符`).not.toMatch(/[\x00-\x1f<>:"|?*]/);
                }
            }
        }
    });

    test('capture and log export directories are independent', () => {
        // P0.27: 两类导出位置分别记录，互不覆盖
        const capture_cfg = {
            export_capture_directory: 'capture-exports',
            export_filename_template: '{capture_id}.{ext}',
            ...config,
        };
        const log_cfg = {
            export_capture_directory: 'log-exports',
            export_filename_template: 'logs_{date}.log',
            ...config,
        };

        const cap = build_export_filename(capture_cfg, 'cap_1', 'json', now);
        const log = build_export_filename(log_cfg, 'cap_1', 'json', now);

        expect(cap).toContain('capture-exports/');
        expect(cap).not.toContain('log-exports/');
        expect(log).toContain('log-exports/');
        expect(log).not.toContain('capture-exports/');
    });
});
