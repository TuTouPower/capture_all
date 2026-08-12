// @vitest-environment jsdom
// tests/unit/t142_stop_restore_page_hooks.test.ts
// t142: stop 后还原注入脚本改写的页面 API（fetch/XHR/WebSocket/localStorage）。
// jsdom 不执行 appendChild 注入脚本，故用 eval 执行 build_page_script（安装 hook）与
// page_script_restore（还原）验证真实行为；stop 接线用 createElement spy 断言。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { page_script_restore } from '../../src/extension/content/content_page_script';
import { build_page_script } from '../../src/extension/content/network_hook';
import { build_page_script as build_ws_script } from '../../src/extension/content/websocket_capture';
import { start_network_hook, stop_network_hook, _set_nonce_for_test as _set_nh_nonce, _set_secret_for_test as _set_nh_secret } from '../../src/extension/content/network_hook';
import { start_websocket_capture, stop_websocket_capture, _set_nonce_for_test as _set_ws_nonce, _set_secret_for_test as _set_ws_secret } from '../../src/extension/content/websocket_capture';
import { TEST_SECRET } from '../support/helpers/signed_message';

function eval_script(src: string): void {
    // eslint-disable-next-line no-eval
    eval(src);
}

describe('page_script_restore 模板 (t142)', () => {
    it('生成 installed 检查 + prev 还原 + 标记清理', () => {
        const out = page_script_restore('network_hook', '            window.fetch = prev.fetch;');
        expect(out).toContain('window.__capture_all_network_hook_installed__');
        expect(out).toContain('window.fetch = prev.fetch;');
        expect(out).toContain('delete window.__capture_all_network_hook_installed__');
        expect(out).toContain('delete window.__capture_all_network_hook_prev__');
    });
});

describe('network_hook stop 还原 (t142 AC-001)', () => {
    let orig_fetch: typeof fetch;
    let orig_open: typeof XMLHttpRequest.prototype.open;
    let orig_send: typeof XMLHttpRequest.prototype.send;

    beforeEach(() => {
        orig_fetch = window.fetch;
        orig_open = XMLHttpRequest.prototype.open;
        orig_send = XMLHttpRequest.prototype.send;
        _set_nh_nonce('nonce-1');
        _set_nh_secret(TEST_SECRET);
    });
    afterEach(() => {
        stop_network_hook();
        window.fetch = orig_fetch;
        XMLHttpRequest.prototype.open = orig_open;
        XMLHttpRequest.prototype.send = orig_send;
        delete (window as Record<string, unknown>).__capture_all_network_hook_installed__;
        delete (window as Record<string, unknown>).__capture_all_network_hook_prev__;
        _set_nh_nonce(null);
        _set_nh_secret(null);
    });

    it('AC-001: eval 注入脚本安装 hook 后 fetch 被替换；restore 还原后恢复原样', () => {
        // 安装 hook（模拟页面注入）
        eval_script(build_page_script(true, TEST_SECRET));
        expect(window.fetch).not.toBe(orig_fetch); // fetch 被 hook
        expect((window as Record<string, unknown>).__capture_all_network_hook_installed__).toBe(true);

        // stop 还原脚本
        eval_script(page_script_restore('network_hook',
            '            window.fetch = prev.fetch;\n            XMLHttpRequest.prototype.open = prev.open;\n            XMLHttpRequest.prototype.send = prev.send;'));
        expect(window.fetch).toBe(orig_fetch); // 还原
        expect(XMLHttpRequest.prototype.open).toBe(orig_open);
        expect(XMLHttpRequest.prototype.send).toBe(orig_send);
        // 标记清理
        expect((window as Record<string, unknown>).__capture_all_network_hook_installed__).toBeUndefined();
        expect((window as Record<string, unknown>).__capture_all_network_hook_prev__).toBeUndefined();
    });

    it('AC-001b: stop_network_hook 注入还原脚本（接线断言——删 restore 调用即红）', () => {
        // 真实 start 安装 hook 到 MAIN world（eval 执行 build_page_script）
        start_network_hook(vi.fn(), 'cap', Date.now(), 1, true, { redact_data: false, redact_url_query: false });
        eval_script(build_page_script(true, TEST_SECRET));
        expect((window as Record<string, unknown>).__capture_all_network_hook_installed__).toBe(true);

        // spy createElement 捕获 stop 创建的还原 script
        const script_spy = vi.spyOn(document, 'createElement');
        stop_network_hook();

        const restore_scripts = script_spy.mock.results
            .map((r) => r.value)
            .filter((el) => el && typeof el.textContent === 'string' && el.textContent.includes('__capture_all_network_hook_installed__'));
        // 有还原 script（含 installed 检查 + prev 还原）
        expect(restore_scripts.length).toBeGreaterThan(0);
        expect(restore_scripts[0].textContent).toContain('window.fetch = prev.fetch;');
        expect(restore_scripts[0].textContent).toContain('XMLHttpRequest.prototype.send = prev.send;');
    });

    it('AC-001c: 未安装时 restore no-op 不报错（installed 守卫）', () => {
        expect(() => eval_script(page_script_restore('network_hook', '            window.fetch = prev.fetch;'))).not.toThrow();
        expect(window.fetch).toBe(orig_fetch);
    });
});

describe('websocket stop 还原 (t142 AC-001)', () => {
    let orig_ws: typeof WebSocket;

    beforeEach(() => {
        orig_ws = window.WebSocket;
        _set_ws_nonce('ws-nonce');
        _set_ws_secret(TEST_SECRET);
    });
    afterEach(() => {
        stop_websocket_capture();
        (window as { WebSocket: typeof WebSocket }).WebSocket = orig_ws;
        delete (window as Record<string, unknown>).__capture_all_ws_installed__;
        delete (window as Record<string, unknown>).__capture_all_ws_prev__;
        _set_ws_nonce(null);
        _set_ws_secret(null);
    });

    it('AC-001: eval 注入 ws 脚本安装 hook 后 WebSocket 被替换；restore 还原', () => {
        eval_script(build_ws_script(TEST_SECRET));
        expect(window.WebSocket).not.toBe(orig_ws); // WebSocket 被 patch
        expect((window as Record<string, unknown>).__capture_all_ws_installed__).toBe(true);

        eval_script(page_script_restore('ws', '            window.WebSocket = prev;'));
        expect(window.WebSocket).toBe(orig_ws); // 还原
        expect((window as Record<string, unknown>).__capture_all_ws_installed__).toBeUndefined();
    });

    it('AC-001b: stop_websocket_capture 注入 ws 还原脚本（接线断言）', () => {
        start_websocket_capture(vi.fn(), 'cap', Date.now(), 1, { redact_data: false, redact_url_query: false });
        eval_script(build_ws_script(TEST_SECRET));
        expect((window as Record<string, unknown>).__capture_all_ws_installed__).toBe(true);

        const script_spy = vi.spyOn(document, 'createElement');
        stop_websocket_capture();

        const restore_scripts = script_spy.mock.results
            .map((r) => r.value)
            .filter((el) => el && typeof el.textContent === 'string' && el.textContent.includes('__capture_all_ws_installed__'));
        expect(restore_scripts.length).toBeGreaterThan(0);
        expect(restore_scripts[0].textContent).toContain('window.WebSocket = prev;');
    });
});

describe('storage stop 还原 (t142 AC-001 localStorage)', () => {
    it('AC-001: storage restore 模板含 localStorage/sessionStorage 还原语句', () => {
        // storage 还原用 page_script_restore('storage', per-prop 守卫 body)——结构断言其接线
        const { readFileSync } = require('node:fs');
        const { resolve } = require('node:path');
        const src = readFileSync(resolve(__dirname, '../../src/extension/content/storage_capture.ts'), 'utf8');
        const restore_block = src.slice(src.indexOf('function restore_page_script'), src.indexOf('export function stop_storage_capture'));
        expect(restore_block).toContain("page_script_restore('storage'");
        expect(restore_block).toContain('window.localStorage.setItem = prev.local_setItem');
        expect(restore_block).toContain('window.sessionStorage.clear = prev.session_clear');
    });
});

describe('restore 降级 (t142 AC-003)', () => {
    it('AC-003: restore 脚本 try/catch 包裹，注入失败静默降级', () => {
        // 生产 restore_page_script 整体 try/catch——结构断言
        const { readFileSync } = require('node:fs');
        const { resolve } = require('node:path');
        const src = readFileSync(resolve(__dirname, '../../src/extension/content/network_hook.ts'), 'utf8');
        const restore_block = src.slice(src.indexOf('function restore_page_script'), src.indexOf('export function stop_network_hook'));
        expect(restore_block).toContain('try {');
        expect(restore_block).toContain('} catch {');
    });
});

