// tests/unit/content_page_script.test.ts
// t126: build_page_script 共享模板结构断言 + 模板生成行为验证。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { page_script_reinstall_guard, page_script_preamble } from '../../src/extension/content/content_page_script';
import { SYNC_HMAC_JS } from '../../src/extension/content/content_hmac';

const SOURCE_ROOT = new URL('../../src/extension/content/', import.meta.url).pathname;

describe('page_script_reinstall_guard', () => {
    it('生成 installed/prev key 与还原块', () => {
        const out = page_script_reinstall_guard('ws', '            window.WebSocket = prev_hook;');
        expect(out).toContain('window.__capture_all_ws_installed__');
        expect(out).toContain('window.__capture_all_ws_prev__');
        expect(out).toContain('window.WebSocket = prev_hook;');
        expect(out).toContain('window.__capture_all_ws_installed__ = true;');
    });

    it('按 signal 推导模块化 key，且还原块来自调用方', () => {
        const out = page_script_reinstall_guard('network_hook',
            '            window.fetch = prev_hook.fetch;\n            XMLHttpRequest.prototype.open = prev_hook.open;');
        expect(out).toContain('window.__capture_all_network_hook_installed__');
        expect(out).toContain('window.fetch = prev_hook.fetch;');
        // 还原块不内联在模板里，由调用方注入
        expect(out).not.toContain('XMLHttpRequest.prototype.send = prev_hook.send;');
    });
});

describe('page_script_preamble', () => {
    it('生成 SIGNAL/SECRET 声明并内联 SYNC_HMAC_JS', () => {
        const out = page_script_preamble('ws', 'test-secret');
        expect(out).toContain("var SIGNAL = '__capture_all_ws__';");
        expect(out).toContain("var SECRET = 'test-secret';");
        expect(out).toContain(SYNC_HMAC_JS);
    });
});

describe('build_page_script 复用共享模板（AC-001 结构断言）', () => {
    it('network_hook 与 websocket_capture 均引用共享模板，不再各自内联同构片段', () => {
        for (const file of ['network_hook.ts', 'websocket_capture.ts']) {
            const src = readFileSync(SOURCE_ROOT + file, 'utf8');
            // 锚定调用形式而非 import 行，确保 build_page_script 实际组合共享模板
            expect(src).toContain('page_script_reinstall_guard(');
            expect(src).toContain('page_script_preamble(');
            // 同构片段不再各自硬编码：原始内联还原守卫与 SIGNAL/SECRET+SYNC_HMAC_JS 声明
            // 已收敛到 content_page_script.ts（SYNC_HMAC_JS 定义仍在 content_hmac.ts）
            expect(src).not.toMatch(/if \(window\.__capture_all_.*_installed__\)/);
            expect(src).not.toMatch(/var SIGNAL = '\$\{SIGNAL\}';/);
            expect(src).not.toMatch(/\$\{SYNC_HMAC_JS\}/);
        }
    });
});
