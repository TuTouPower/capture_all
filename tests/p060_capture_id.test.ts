// tests/p060_capture_id.test.ts — P0.60 capture_id 去前缀 + 默认导出文件名模板改造
import { describe, test, expect } from 'vitest';
import { build_export_filename } from '../src/extension/shared/export_settings';
import { DEFAULT_USER_CONFIG } from '../src/shared/constants';
import { generate_capture_id } from '../src/shared/id';

describe('P0.60 capture_id format', () => {
    test('capture_id 不含 capture_ 子串', () => {
        const id = generate_capture_id();
        expect(id).not.toContain('capture_');
    });

    test('capture_id 仍含 _ 分隔符（两段结构）', () => {
        const id = generate_capture_id();
        expect(id).toContain('_');
        // 两段：<timestamp>_<random>
        const parts = id.split('_');
        expect(parts.length).toBe(2);
        expect(parts[0]).toMatch(/^\d+$/);       // 时间戳纯数字
        expect(parts[1]).toMatch(/^[a-z0-9]+$/); // 随机段小写字母数字
    });
});

describe('P0.60 default export filename template', () => {
    test('默认模板渲染结果形如 capture_YYYYMMDD_HHMMSS.ext，无 capture_id', () => {
        const template = DEFAULT_USER_CONFIG.export_filename_template;
        // 新默认模板不含 {capture_id}
        expect(template).not.toContain('{capture_id}');
        expect(template).toBe('capture_{date}.{ext}');

        // 渲染结果验证
        const config = {
            export_capture_directory: '',
            export_filename_template: template,
            system_time_timezone: 'UTC' as const,
        };
        const fixed_now = new Date('2026-06-13T22:55:26.000Z');
        const filename = build_export_filename(config, '1781359011242_ui1gk45', 'zip', fixed_now);
        // 不含 capture_id 值
        expect(filename).not.toContain('1781359011242_ui1gk45');
        // 形如 capture_20260613_225526.zip
        expect(filename).toMatch(/^capture_\d{8}_\d{6}\.zip$/);
    });

    test('紧凑日期格式不含 - : 和空格', () => {
        const config = {
            export_capture_directory: '',
            export_filename_template: 'capture_{date}.{ext}',
            system_time_timezone: 'UTC' as const,
        };
        const fixed_now = new Date('2026-06-13T22:55:26.000Z');
        const filename = build_export_filename(config, 'test_id', 'zip', fixed_now);
        // 从文件名提取日期部分
        const date_match = filename.match(/^capture_(\d{8}_\d{6})\.zip$/);
        expect(date_match).not.toBeNull();
        const date_str = date_match![1];
        expect(date_str).not.toContain('-');
        expect(date_str).not.toContain(':');
        expect(date_str).not.toContain(' ');
    });
});

describe('P0.60 backward compatibility', () => {
    test('用户自定义模板仍可使用 {capture_id} 占位符', () => {
        const config = {
            export_capture_directory: '',
            export_filename_template: 'my_export_{capture_id}_{date}.{ext}',
            system_time_timezone: 'UTC' as const,
        };
        const fixed_now = new Date('2026-06-13T22:55:26.000Z');
        const capture_id = '1781359011242_ui1gk45';
        const filename = build_export_filename(config, capture_id, 'json', fixed_now);
        expect(filename).toContain(capture_id);
        expect(filename).toMatch(/^my_export_1781359011242_ui1gk45_\d{8}_\d{6}\.json$/);
    });
});
