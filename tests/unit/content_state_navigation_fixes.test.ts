// tests/unit/content_state_navigation_fixes.test.ts
// @vitest-environment jsdom
// t189: content 采集正确性缺陷修复——SPA 导航（pushState/replaceState + back/forward 区分）、
// iframe frame_id、selector round-trip、fetch Request method、poll in-flight guard。
// content_script 顶层注册 chrome API 无法 import，导航/iframe 用源码扫描断言（同 content_script_uses_poll 模式）。

import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { start_status_poll } from '../../src/extension/shared/poll_capture_status';
import { _build_css_path_for_test } from '../../src/extension/content/dom_capture';

const root = resolve(__dirname, '..', '..');

// jsdom 未实现 CSS.escape——polyfill（转义非标识符字符，querySelector round-trip 验证用）
if (!(globalThis as { CSS?: { escape?: (s: string) => string } }).CSS?.escape) {
    (globalThis as { CSS: { escape: (s: string) => string } }).CSS = {
        escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`),
    };
}

function read_content_src(): string {
    return readFileSync(resolve(root, 'src/extension/content/content_script.ts'), 'utf8');
}

describe('t189 AC-001: SPA 导航——pushState/replaceState patch + back/forward 区分', () => {
    it('popstate handler 标 back_forward（不再 push_state）', () => {
        const src = read_content_src();
        const popstate_fn = src.split('function handle_popstate_navigation')[1]?.split('function inject_navigation_page_script')[0] ?? '';
        expect(popstate_fn).toMatch(/route_action: 'back_forward'/);
        expect(popstate_fn).not.toMatch(/route_action: 'push_state'/);
    });

    it('MAIN world page script patch pushState/replaceState 并 postMessage（push_state/replace_state）', () => {
        const src = read_content_src();
        expect(src).toMatch(/history\.pushState = function/);
        expect(src).toMatch(/history\.replaceState = function/);
        expect(src).toMatch(/action: 'push_state'/);
        expect(src).toMatch(/action: 'replace_state'/);
        expect(src).toMatch(/window\.postMessage\(/);
    });

    it('stop 还原 history patch（restore 调用存在）+ message listener 移除', () => {
        const src = read_content_src();
        expect(src).toMatch(/restore_navigation_page_script\(\);/); // 调用点（非仅定义）
        expect(src).toMatch(/removeEventListener\('message', handle_navigation_message/);
    });

    it('RouteChangeData.route_action 枚举含 back_forward', () => {
        const types = readFileSync(resolve(root, 'src/shared/types.ts'), 'utf8');
        expect(types).toMatch(/route_action: 'push_state' \| 'replace_state' \| 'hash_change' \| 'back_forward'/);
    });

    it('navigation patch 经 inject_script_element 注入（B3-M3 诊断，非静默）', () => {
        const src = read_content_src();
        expect(src).toMatch(/inject_script_element\(navigation_page_script_text\(\)/);
        expect(src).toMatch(/logger\.warn\('Navigation page script injection failed'/);
    });

    it('handle_navigation_message 对畸形 url 安全忽略（不抛未捕获异常）', () => {
        const src = read_content_src();
        const fn = src.split('function handle_navigation_message')[1] ?? '';
        expect(fn).toMatch(/new URL\(new_url\)/);
        expect(fn).toMatch(/catch \{[\s\S]{0,40}return;\s*\}/);
    });
});

describe('t189 AC-002: iframe 事件用 sender.frameId', () => {
    it('start 消息用 sender.frameId 更新 frame_id（替代随机数）', () => {
        const src = read_content_src();
        expect(src).toMatch(/typeof sender\?\.frameId === 'number'/);
        expect(src).toMatch(/frame_id = sender\.frameId/);
    });
});

describe('t189 AC-003: selector round-trip（特殊字符 + nth）', () => {
    it('含特殊字符 id 的 selector querySelector === target', () => {
        document.body.innerHTML = '<div id="a:b.c d"></div>';
        const target = document.getElementById('a:b.c d')!;
        const sel = _build_css_path_for_test(target);
        expect(document.querySelector(sel)).toBe(target);
    });

    it('nth-of-type：同 tag 兄弟位置正确（querySelector round-trip）', () => {
        document.body.innerHTML = '<section><div class="x"></div><span class="y"></span><div class="x"></div><div class="x"></div></section>';
        // 第 3 个 div（同 tag 兄弟中位置 3，无 id 不走短路）
        const target = document.querySelectorAll('div.x')[2]!;
        const sel = _build_css_path_for_test(target as HTMLElement);
        expect(document.querySelector(sel)).toBe(target);
        // selector 使用 nth-of-type（div 中第 3 个）
        expect(sel).toMatch(/:nth-of-type\(3\)/);
    });

    it('含特殊字符 class 的 selector round-trip', () => {
        document.body.innerHTML = '<div class="foo:bar baz"></div>';
        const target = document.querySelector('.foo\\:bar')!;
        const sel = _build_css_path_for_test(target as HTMLElement);
        expect(document.querySelector(sel)).toBe(target);
    });
});

describe('t189 AC-004: fallback fetch 解析 Request method', () => {
    it('page script 从 Request.method 取 method（非仅 init.method）', () => {
        const src = readFileSync(resolve(root, 'src/extension/content/network_hook.ts'), 'utf8');
        expect(src).toMatch(/input instanceof Request \? input\.method : null/);
        expect(src).toMatch(/var method = \(init && init\.method\)/);
    });

    it('行为测试：eval page script 后 fetch(new Request({method:POST})) 记录 POST（f001 处置）', async () => {
        // 仿 network_hook_gate_behavior 先例：eval build_page_script 后驱动 fetch
        const { build_page_script } = await import('../../src/extension/content/network_hook');
        const messages: Array<{ method: string; url: string }> = [];
        const orig_post_message = window.postMessage.bind(window);
        window.postMessage = ((data: unknown) => {
            const d = data as { source?: string; method?: string; url?: string };
            if (d?.source === '__capture_all_network_hook__') {
                messages.push({ method: d.method ?? '', url: d.url ?? '' });
            }
        }) as typeof window.postMessage;
        // t189 f005: stub fetch 确定性结算（jsdom 下 window.fetch === undici，真实外网依赖）
        const orig_fetch = window.fetch.bind(window);
        window.fetch = (async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })) as typeof window.fetch;
        // eslint-disable-next-line no-eval
        eval(build_page_script(false, 'test_secret'));
        try {
            await window.fetch(new Request('https://example.com/api', { method: 'POST' }));
        } finally {
            window.postMessage = orig_post_message;
            window.fetch = orig_fetch;
        }
        const post = messages.find((m) => m.url.includes('/api'));
        expect(post?.method).toBe('POST');
    });
});

describe('t189 AC-005: poll in-flight guard（stop 后响应不触发 on_active）', () => {
    it('stop 后 in-flight get_status 响应到达不调 on_active', async () => {
        const timers: Array<{ cb: () => void; id: number }> = [];
        let next_id = 1;
        let resolve_status!: (v: { is_capturing: boolean }) => void;
        const on_active = vi.fn();
        const stop = start_status_poll({
            get_status: () => new Promise((r) => { resolve_status = r; }),
            on_active,
            setInterval: (cb: () => void) => { const id = next_id++; timers.push({ cb, id }); return id; },
            clearInterval: () => {},
        });
        // 首次 check_once 在途（get_status 未 resolve）时 stop
        stop();
        // 迟到响应：is_capturing=true 也不得触发 on_active（stop→restart 竞态防护）
        resolve_status({ is_capturing: true });
        await new Promise((r) => setTimeout(r, 10));
        expect(on_active).not.toHaveBeenCalled();
    });

    it('stop 后可重启（新 start_status_poll 实例独立）', async () => {
        const on_active = vi.fn();
        const stop1 = start_status_poll({
            get_status: async () => ({ is_capturing: false }),
            on_active,
            setInterval: () => 1,
            clearInterval: () => {},
        });
        stop1();
        const stop2 = start_status_poll({
            get_status: async () => ({ is_capturing: true, capture_id: 'c2' }),
            on_active,
            setInterval: () => 2,
            clearInterval: () => {},
        });
        await new Promise((r) => setTimeout(r, 10));
        expect(on_active).toHaveBeenCalledWith(expect.objectContaining({ is_capturing: true }));
        stop2();
    });

    it('content_script 轮询接线：加载启动一次、start_capture 停、stop 置空（源码接线）', () => {
        const src = read_content_src();
        expect(src).toMatch(/ensure_status_poll\(\);/); // 加载时启动
        expect(src).toMatch(/stop_status_poll\(\);/); // start/stop 停轮询
        expect(src).toMatch(/stop_status_poll = null/); // 置空（防重启竞态）
        expect(src).toMatch(/in-flight 响应在 stopped 后不触发 on_active/);
    });
});
