import { describe, expect, test } from 'vitest';
import { build_export_filename } from '../src/shared/export_settings';

const now = new Date('2024-02-03T04:05:06.000Z');

const config = { system_time_timezone: 'UTC+8' as const };

describe('export settings', () => {
    test('builds filename from capture tokens and configured timezone', () => {
        const filename = build_export_filename({
            export_capture_directory: '',
            export_filename_template: 'capture_all_{capture_id}_{date}.{ext}',
            ...config,
        }, 'capture_1', 'json', now);

        // P0.60: date 格式从 YYYY-MM-DD_HH-MM-SS 改为 YYYYMMDD_HHMMSS
        expect(filename).toBe('capture_all_capture_1_20240203_120506.json');
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

    test('P0.37: default template produces filename containing date', () => {
        // 模拟 export_session() 使用 DEFAULT_USER_CONFIG 的 export_filename_template
        // P0.60: 默认模板改为 'capture_{date}.{ext}'，此测试用旧模板验证向后兼容
        const default_template_cfg = {
            export_capture_directory: '',
            export_filename_template: 'capture_all_{capture_id}_{date}.{ext}',
            ...config,
        };
        const filename = build_export_filename(default_template_cfg, '1781265766247_7vafphp', 'json', now);

        // P0.60: compact date format
        expect(filename).toContain('20240203');
        expect(filename).toContain('capture_all_1781265766247_7vafphp');
        expect(filename).toMatch(/\.json$/);
        expect(filename).not.toMatch(/^capture_all_1781265766247_7vafphp\.json$/);
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
