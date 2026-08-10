// tests/unit/cookie_empty_domain_scope.test.ts
// 验证 Cookie 目标域为空时不退化全浏览器采集（P1-7）
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

let start_cookie_capture: any;
let stop_cookie_capture: any;

const on_changed_listeners: Array<(info: any) => void> = [];
const on_changed = {
    addListener: vi.fn((cb: (info: any) => void) => on_changed_listeners.push(cb)),
    removeListener: vi.fn((cb: (info: any) => void) => {
        const idx = on_changed_listeners.indexOf(cb);
        if (idx !== -1) on_changed_listeners.splice(idx, 1);
    }),
};

beforeEach(async () => {
    on_changed_listeners.length = 0;
    on_changed.addListener.mockClear();
    on_changed.removeListener.mockClear();
    vi.stubGlobal('chrome', { cookies: { onChanged: on_changed } });
    vi.resetModules();
    ({ start_cookie_capture, stop_cookie_capture } = await import('../../src/extension/background/cookie_capture'));
});

afterEach(() => {
    stop_cookie_capture();
    vi.unstubAllGlobals();
});

function emit_cookie(info: any): void {
    for (const cb of [...on_changed_listeners]) cb(info);
}

describe('cookie 空域不退化全浏览器 (T104)', () => {
    test('AC-001: 空 URL 时不注册 onChanged listener（不全量监听）', async () => {
        const sender = vi.fn();
        start_cookie_capture('cap', Date.now(), sender, '');

        expect(on_changed.addListener).not.toHaveBeenCalled();
        expect(on_changed_listeners.length).toBe(0);
    });

    test('AC-001b: about:blank / chrome:// 等无域名 URL 不注册 listener', async () => {
        const sender = vi.fn();
        for (const url of ['about:blank', 'chrome://extensions', 'chrome-extension://abc/']) {
            stop_cookie_capture();
            on_changed.addListener.mockClear();
            start_cookie_capture('cap', Date.now(), sender, url);
            expect(on_changed.addListener).not.toHaveBeenCalled();
        }
    });

    test('AC-002: https 普通域名时仍注册并按域过滤（回归）', async () => {
        const sender = vi.fn();
        start_cookie_capture('cap', Date.now(), sender, 'https://example.com/page');

        expect(on_changed.addListener).toHaveBeenCalledTimes(1);
        // example.com 域 cookie 被采
        emit_cookie({
            cookie: { name: 'a', domain: 'example.com', path: '/', secure: true, httpOnly: false },
            removed: false, cause: 'explicit',
        });
        expect(sender).toHaveBeenCalledTimes(1);
        // 其他域被过滤
        emit_cookie({
            cookie: { name: 'b', domain: 'other.org', path: '/', secure: true, httpOnly: false },
            removed: false, cause: 'explicit',
        });
        expect(sender).toHaveBeenCalledTimes(1);
    });

    test('AC-003: 空域降级时不进入 capturing 状态（可观察降级信号）', async () => {
        const { is_cookie_capture_active } = await import('../../src/extension/background/cookie_capture');
        const sender = vi.fn();
        start_cookie_capture('cap', Date.now(), sender, '');

        // 降级：不注册 listener，且采集未激活（后续 URL 就绪可重新 start）
        expect(on_changed_listeners.length).toBe(0);
        expect(is_cookie_capture_active()).toBe(false);
    });
});
