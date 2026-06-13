// tests/popup_export.test.ts — P0.35/P0.40 导出按钮测试
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const project_root = resolve(__dirname, '..');
const popup_src = readFileSync(resolve(project_root, 'src/popup/popup.ts'), 'utf8');
const sw_src = readFileSync(resolve(project_root, 'src/background/service_worker.ts'), 'utf8');

describe('P0.35/P0.40 export button wiring', () => {
    it('exportBtn click handler uses async/await for sendMessage', () => {
        const export_block = popup_src.match(
            /#exportBtn.*?addEventListener\('click',\s*async\s*\(/s,
        );
        expect(export_block).not.toBeNull();
    });

    it('exportBtn click handler awaits chrome.runtime.sendMessage', () => {
        const export_section = popup_src.match(
            /#exportBtn[\s\S]*?addEventListener[\s\S]*?\}\);/,
        );
        expect(export_section).not.toBeNull();
        expect(export_section![0]).toMatch(/await\s+chrome\.runtime\.sendMessage/);
    });

    it('exportBtn sends action "get_capture_data" with capture_id (ZIP archive export)', () => {
        expect(popup_src).toMatch(/action:\s*'get_capture_data'/);
        expect(popup_src).toMatch(/capture_id:\s*finished_capture\.capture_id/);
    });

    // P0.40: popup 导出改用 download_blob（统一 chrome.downloads.download 路径）
    it('P0.40: popup export uses download_blob from export_utils', () => {
        expect(popup_src).toMatch(/import.*download_blob.*from.*export_utils/);
        expect(popup_src).toMatch(/download_blob\(/);
    });

    it('P0.40: popup export uses build_capture_filename for filename', () => {
        expect(popup_src).toMatch(/import.*build_capture_filename.*from.*export_utils/);
        expect(popup_src).toMatch(/build_capture_filename\(/);
    });

    it('P0.40: popup export passes save_as: true', () => {
        expect(popup_src).toMatch(/save_as:\s*true/);
    });

    it('exportBtn still checks resp.success before downloading', () => {
        expect(popup_src).toMatch(/resp\?\.\s*success/);
    });

    it('render_saved() is called before wire_view() in render()', () => {
        const render_fn = popup_src.match(
            /function render\(\): void \{[\s\S]*?^    \}/m,
        );
        expect(render_fn).not.toBeNull();
        const body = render_fn![0];
        const saved_idx = body.indexOf('render_saved()');
        const wire_idx = body.indexOf('wire_view()');
        expect(saved_idx).toBeGreaterThan(0);
        expect(wire_idx).toBeGreaterThan(saved_idx);
    });

    it('service worker handles export_json action', () => {
        expect(sw_src).toMatch(/case\s+'export_json'/);
        expect(sw_src).toMatch(/await\s+export_json\(message\.capture_id\)/);
    });
});
