// tests/unit/t115_export_save_as_consistency.test.ts
// t115: export_save_as 消费一致性回归。
// helper 判别矩阵（save_as × has_dir × picker 有/无）+ Popup/日志调用点接线。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    download_blob,
    build_capture_filename,
    build_log_filename,
} from '../../src/extension/shared/export_utils';

const mock_download = vi.fn();

beforeEach(() => {
    vi.stubGlobal('chrome', {
        downloads: { download: mock_download },
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

function make_picker() {
    const write = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const create_writable = vi.fn().mockResolvedValue({ write, close });
    const picker = vi.fn().mockResolvedValue({ createWritable: create_writable });
    return { picker, write, close };
}

const blob = new Blob(['test'], { type: 'application/zip' });

describe('t115 helper 判别矩阵（save_as × has_dir × picker）', () => {
    it('AC-003 save_as=false + 无目录 + picker 可用 → downloads API（saveAs:false），不打开 picker', async () => {
        const { picker } = make_picker();
        vi.stubGlobal('showSaveFilePicker', picker);
        await download_blob(blob, 'foo.zip', 'capture_export', false);
        expect(picker).not.toHaveBeenCalled();
        expect(mock_download).toHaveBeenCalledWith({
            url: 'blob:mock-url',
            filename: 'foo.zip',
            saveAs: false,
        });
    });

    it('AC-003 save_as=true + 无目录 + picker 可用 → 优先询问（picker）', async () => {
        const { picker } = make_picker();
        vi.stubGlobal('showSaveFilePicker', picker);
        await download_blob(blob, 'foo.zip', 'capture_export', true);
        expect(picker).toHaveBeenCalledWith(expect.objectContaining({
            suggestedName: 'foo.zip',
            id: 'capture_export',
        }));
        expect(mock_download).not.toHaveBeenCalled();
    });

    it('save_as=undefined + 无目录 + picker 可用 → picker（保持原行为）', async () => {
        const { picker } = make_picker();
        vi.stubGlobal('showSaveFilePicker', picker);
        await download_blob(blob, 'foo.zip', 'capture_export');
        expect(picker).toHaveBeenCalled();
        expect(mock_download).not.toHaveBeenCalled();
    });

    it('save_as=false + 有目录 → downloads API（saveAs:false）', async () => {
        const { picker } = make_picker();
        vi.stubGlobal('showSaveFilePicker', picker);
        await download_blob(blob, 'captures/foo.zip', 'capture_export', false);
        expect(picker).not.toHaveBeenCalled();
        expect(mock_download).toHaveBeenCalledWith({
            url: 'blob:mock-url',
            filename: 'captures/foo.zip',
            saveAs: false,
        });
    });

    it('save_as=true + 有目录 → downloads API（saveAs:true，强制询问）', async () => {
        const { picker } = make_picker();
        vi.stubGlobal('showSaveFilePicker', picker);
        await download_blob(blob, 'captures/foo.zip', 'capture_export', true);
        expect(picker).not.toHaveBeenCalled();
        expect(mock_download).toHaveBeenCalledWith({
            url: 'blob:mock-url',
            filename: 'captures/foo.zip',
            saveAs: true,
        });
    });

    it('save_as=false + 无目录 + picker 不可用 → downloads API（saveAs:false）', async () => {
        await download_blob(blob, 'foo.zip', 'capture_export', false);
        expect(mock_download).toHaveBeenCalledWith({
            url: 'blob:mock-url',
            filename: 'foo.zip',
            saveAs: false,
        });
    });
});

describe('t115 Popup / Dashboard 日志接线', () => {
    const read = (rel: string): string => {
        const { readFileSync } = require('node:fs');
        const { resolve } = require('node:path');
        return readFileSync(resolve(__dirname, '..', '..', rel), 'utf8');
    };

    it('AC-001 Popup ZIP 导出传 export_save_as 第 4 参数', () => {
        const src = read('src/extension/popup/popup.ts');
        // download_blob 调用须带 user_config.export_save_as
        expect(src).toMatch(/download_blob\(\s*blob,\s*filename,\s*'capture_export',\s*user_config\.export_save_as\s*\)/);
    });

    it('AC-002 Dashboard 日志导出传 export_save_as 第 4 参数', () => {
        const src = read('src/extension/dashboard/dashboard_settings.ts');
        expect(src).toMatch(/download_blob\(\s*blob,\s*log_filename,\s*'log_export',\s*get_user_config\(\)\.export_save_as\s*\)/);
    });
});

describe('t115 Dashboard capture AC-004 接线锚定', () => {
    const read = (rel: string): string => {
        const { readFileSync } = require('node:fs');
        const { resolve } = require('node:path');
        return readFileSync(resolve(__dirname, '..', '..', rel), 'utf8');
    };
    const src = read('src/extension/dashboard/dashboard_shared.ts');

    it('archive 路径 flush 先于 read_capture_snapshot（顺序锚定）', () => {
        // 锚定 export_capture 函数体内：flush 调用须在 read_capture_snapshot 之前
        const fn = src.match(/export async function export_capture\([\s\S]*?\n}/);
        expect(fn).not.toBeNull();
        const body = fn![0];
        const flush_idx = body.indexOf(`await send_ui_message('flush', {})`);
        const read_idx = body.indexOf('const snapshot = await read_capture_snapshot(id)');
        expect(flush_idx).toBeGreaterThanOrEqual(0);
        expect(read_idx).toBeGreaterThan(flush_idx);
    });

    it('flush 失败时中止导出（abort 锚定）', () => {
        expect(src).toMatch(/if \(!flush_res\?\.\s*success\) \{ alert\(t\('exportFailedFlush'\)\); return; \}/);
    });

    it('archive 与非 archive 导出均传 export_save_as 第 4 参数', () => {
        // 两处 download_blob（archive zip / json/jsonl/html/har）都带 get_user_config().export_save_as
        const matches = src.match(/download_blob\(\s*blob,\s*capture_filename,\s*'capture_export',\s*get_user_config\(\)\.export_save_as\s*\)/g);
        expect(matches).not.toBeNull();
        expect(matches!.length).toBeGreaterThanOrEqual(2);
    });

    it('非 archive 路径导出前检查 r.success，失败中止（AC-004 abort 链调用方侧）', () => {
        // export_capture 函数体内非 archive 分支：sendMessage 后检查 r?.success，失败 return
        const fn = src.match(/export async function export_capture\([\s\S]*?\n}/);
        expect(fn).not.toBeNull();
        const body = fn![0];
        expect(body).toMatch(/const r = await send_ui_message\(action, \{ capture_id: id \}\)/);
        const success_check = body.indexOf(`if (!r?.success) { alert(t('exportFailed')); return; }`);
        const export_action = body.indexOf(`const r = await send_ui_message(action, { capture_id: id })`);
        expect(success_check).toBeGreaterThan(export_action);
    });
});

describe('t115 SW export 命令 flush 顺序（AC-004 非 archive）', () => {
    const read = (rel: string): string => {
        const { readFileSync } = require('node:fs');
        const { resolve } = require('node:path');
        return readFileSync(resolve(__dirname, '..', '..', rel), 'utf8');
    };

    it('export_json/jsonl/html/har 命令均先 flush_all 再导出', () => {
        const sw = read('src/extension/background/service_worker.ts');
        for (const action of ['export_json', 'export_jsonl', 'export_html', 'export_har']) {
            const idx = sw.indexOf(`case '${action}':`);
            expect(idx).toBeGreaterThanOrEqual(0);
            const case_block = sw.slice(idx, idx + 200);
            expect(case_block).toMatch(/handle_export\(/);
        }
        // handle_export helper 内先 flush_all 再调用导出
        const helper_idx = sw.indexOf('async function handle_export(');
        expect(helper_idx).toBeGreaterThanOrEqual(0);
        const helper_block = sw.slice(helper_idx, helper_idx + 500);
        const flush_idx = helper_block.indexOf('await flush_all()');
        expect(flush_idx).toBeGreaterThanOrEqual(0);
        const export_map_idx = helper_block.indexOf('export_map[format]');
        expect(export_map_idx).toBeGreaterThan(flush_idx);
    });

    it('flush_all 失败经 handle_message catch 返回 success:false（调用方 abort 链）', () => {
        const sw = read('src/extension/background/service_worker.ts');
        expect(sw).toMatch(/handle_message\(message, sender\)\.then\(sendResponse\)\.catch/);
        expect(sw).toMatch(/sendResponse\(\{ success: false, error: /);
    });
});
