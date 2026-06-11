import { describe, expect, test } from 'vitest';
import { build_export_filename } from '../src/shared/export_settings';

const now = new Date('2024-02-03T04:05:06.000Z');

describe('export settings', () => {
    test('builds filename from template tokens', () => {
        const filename = build_export_filename({
            export_directory: '',
            export_filename_template: 'record_all_{session_id}_{date}.{ext}'
        }, 'session_1', 'json', now);

        expect(filename).toBe('record_all_session_1_2024-02-03.json');
    });

    test('prefixes configured download subdirectory', () => {
        const filename = build_export_filename({
            export_directory: 'record-all/exports',
            export_filename_template: '{session_id}.{ext}'
        }, 'session_1', 'har', now);

        expect(filename).toBe('record-all/exports/session_1.har');
    });

    test('removes absolute and parent path segments from download paths', () => {
        const filename = build_export_filename({
            export_directory: '/safe/../exports',
            export_filename_template: '../{session_id}'
        }, 'session_1', 'html', now);

        expect(filename).toBe('safe/exports/session_1.html');
    });

    test('generated filenames pass chrome.downloads.download validation', () => {
        // chrome.downloads.download 文件名约束：
        // - 非绝对路径（不以 / 开头）
        // - 不含 .. 路径穿越
        // - 无连续斜杠（空路径段）
        // - 不含控制字符或 Windows 保留字符 < > : " | ? *
        const ids = ['session_1', 'abc-123', 'test_capture'];
        const exts: Array<'json' | 'jsonl' | 'html' | 'har'> = ['json', 'jsonl', 'html', 'har'];
        const configs = [
            { export_directory: '', export_filename_template: 'capture_all_{capture_id}_{date}.{ext}' },
            { export_directory: 'exports', export_filename_template: '{session_id}.{ext}' },
            { export_directory: 'data/records', export_filename_template: 'capture_{capture_id}.{ext}' },
            { export_directory: '/abs/../safe', export_filename_template: '../{capture_id}_{date}' },
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
});
