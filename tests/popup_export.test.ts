// tests/popup_export.test.ts — P0.35 导出按钮事件绑定回归测试
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const project_root = resolve(__dirname, '..');
const popup_src = readFileSync(resolve(project_root, 'src/popup/popup.ts'), 'utf8');
const sw_src = readFileSync(resolve(project_root, 'src/background/service_worker.ts'), 'utf8');

describe('P0.35 export button wiring', () => {
    it('exportBtn click handler uses async/await for sendMessage', () => {
        // The handler must await the response to trigger download
        const export_block = popup_src.match(
            /#exportBtn.*?addEventListener\('click',\s*async\s*\(/s
        );
        expect(export_block).not.toBeNull();
    });

    it('exportBtn click handler awaits chrome.runtime.sendMessage', () => {
        // Must use `await chrome.runtime.sendMessage` inside the handler
        const export_section = popup_src.match(
            /#exportBtn[\s\S]*?addEventListener[\s\S]*?\}\);/
        );
        expect(export_section).not.toBeNull();
        expect(export_section![0]).toMatch(/await\s+chrome\.runtime\.sendMessage/);
    });

    it('exportBtn sends action "export_json" with session_id', () => {
        expect(popup_src).toMatch(/action:\s*'export_json'/);
        expect(popup_src).toMatch(/session_id:\s*finished_capture\.capture_id/);
    });

    it('export handler creates Blob and triggers download', () => {
        // Must create a Blob from the response JSON
        expect(popup_src).toMatch(/new\s+Blob\(\[resp\.json\]/);
        // Must create an anchor element for download
        expect(popup_src).toMatch(/createElement\('a'\)/);
        // Must set download filename
        expect(popup_src).toMatch(/\.download\s*=/);
        // Must click the anchor to trigger download
        expect(popup_src).toMatch(/a\.click\(\)/);
        // Must revoke object URL to prevent memory leak
        expect(popup_src).toMatch(/revokeObjectURL/);
    });

    it('export handler checks resp.success before downloading', () => {
        // Must check success before creating blob — find the export handler block
        expect(popup_src).toMatch(/resp\?\.\s*success\s*&&\s*resp\.json/);
    });

    it('export handler cleans up anchor after click', () => {
        // Must remove the temporary anchor element
        expect(popup_src).toMatch(/removeChild\(a\)/);
    });

    it('service worker handles export_json action', () => {
        // SW must have the case branch
        expect(sw_src).toMatch(/case\s+'export_json'/);
        // SW must call export_json function
        expect(sw_src).toMatch(/await\s+export_json\(message\.session_id\)/);
    });

    it('render_saved() is called before wire_view() in render()', () => {
        // Verify the render order: innerHTML set, then wire_view called
        const render_fn = popup_src.match(
            /function render\(\): void \{[\s\S]*?^    \}/m
        );
        expect(render_fn).not.toBeNull();
        const body = render_fn![0];
        const saved_idx = body.indexOf('render_saved()');
        const wire_idx = body.indexOf('wire_view()');
        expect(saved_idx).toBeGreaterThan(0);
        expect(wire_idx).toBeGreaterThan(saved_idx);
    });

    it('download filename includes capture_id', () => {
        expect(popup_src).toMatch(
            /download.*?capture_all_\$.*?capture_id/
        );
    });
});
