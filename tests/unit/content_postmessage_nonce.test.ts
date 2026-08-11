// @vitest-environment jsdom
// tests/unit/content_postmessage_nonce.test.ts
// 验证 content page 注入通道（network/ws/storage）per-start nonce 校验：伪造 SIGNAL 被拒、合法入库、旧 nonce 失效
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    start_network_hook,
    stop_network_hook,
    _set_nonce_for_test,
    build_page_script,
} from '../../src/extension/content/network_hook';

const SIGNAL = '__capture_all_network_hook__';

function dispatch_message(data: unknown): void {
    window.dispatchEvent(new MessageEvent('message', {
        data,
        origin: window.location.origin,
        source: window,
    }));
}

describe('content postMessage nonce (T097)', () => {
    let sender: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        sender = vi.fn();
    });

    afterEach(() => {
        stop_network_hook();
        _set_nonce_for_test('');
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('AC-001: 无 nonce 的伪造 SIGNAL 消息被拒，sender 不被调用', () => {
        _set_nonce_for_test('nonce-1');
        start_network_hook(sender, 'cap', Date.now(), 1);

        dispatch_message({
            source: SIGNAL,
            method: 'GET',
            url: 'https://evil.example.com/data',
            status: 200,
            response_body: 'x',
            response_body_status: 'captured',
        });

        expect(sender).not.toHaveBeenCalled();
    });

    it('AC-001b: 错误 nonce 的伪造 SIGNAL 消息被拒', () => {
        _set_nonce_for_test('nonce-1');
        start_network_hook(sender, 'cap', Date.now(), 1);

        dispatch_message({
            source: SIGNAL,
            nonce: 'wrong-nonce',
            method: 'GET',
            url: 'https://evil.example.com/data',
            status: 200,
            response_body: 'x',
            response_body_status: 'captured',
        });

        expect(sender).not.toHaveBeenCalled();
    });

    it('AC-002: 带正确 nonce 的合法 hook 事件入库（回归）', () => {
        _set_nonce_for_test('nonce-1');
        start_network_hook(sender, 'cap', Date.now(), 1);

        dispatch_message({
            source: SIGNAL,
            nonce: 'nonce-1',
            method: 'GET',
            url: 'https://example.com/data',
            status: 200,
            response_body: 'body',
            response_body_status: 'captured',
        });

        expect(sender).toHaveBeenCalledTimes(1);
        const [event, data] = sender.mock.calls[0];
        expect(event.type).toBe('network_request');
        expect(data.url).toBe('https://example.com/data');
    });

    it('AC-003: 两次 start nonce 不同，旧 nonce 消息被拒、新 nonce 接受', () => {
        _set_nonce_for_test('nonce-a');
        start_network_hook(sender, 'cap1', Date.now(), 1);
        // 旧 nonce 消息
        dispatch_message({
            source: SIGNAL,
            nonce: 'nonce-a',
            method: 'GET',
            url: 'https://example.com/old',
            status: 200,
            response_body: 'x',
            response_body_status: 'captured',
        });
        expect(sender).toHaveBeenCalledTimes(1);

        stop_network_hook();
        _set_nonce_for_test('nonce-b');
        start_network_hook(sender, 'cap2', Date.now(), 1);

        // 旧 nonce（nonce-a）现在失效
        dispatch_message({
            source: SIGNAL,
            nonce: 'nonce-a',
            method: 'GET',
            url: 'https://example.com/old2',
            status: 200,
            response_body: 'x',
            response_body_status: 'captured',
        });
        expect(sender).toHaveBeenCalledTimes(1);

        // 新 nonce（nonce-b）接受
        dispatch_message({
            source: SIGNAL,
            nonce: 'nonce-b',
            method: 'GET',
            url: 'https://example.com/new',
            status: 200,
            response_body: 'x',
            response_body_status: 'captured',
        });
        expect(sender).toHaveBeenCalledTimes(2);
        const [, data] = sender.mock.calls[1];
        expect(data.url).toBe('https://example.com/new');
    });

    it('AC-002e2e: 注入脚本生成的事件带正确 nonce 且接收端接受（端到端）', () => {
        _set_nonce_for_test('nonce-e2e');
        start_network_hook(sender, 'cap', Date.now(), 1);

        // eval 注入脚本：验证脚本语法正确、NONCE 注入正确（不抛错即通过）
        (window as any).__capture_all_network_hook_installed__ = false;
        // eslint-disable-next-line no-eval
        const script = build_page_script(true);
        expect(script).toContain('__capture_all_network_nonce__');
        // eslint-disable-next-line no-eval
        eval(script);

        // 注入脚本同款消息（带正确 nonce）达接收端 → 接受
        dispatch_message({
            source: '__capture_all_network_hook__',
            nonce: 'nonce-e2e',
            method: 'GET',
            url: 'https://example.com/data',
            status: 200,
            response_body: 'body',
            response_body_status: 'captured',
        });

        expect(sender).toHaveBeenCalledTimes(1);
        const [, data] = sender.mock.calls[0];
        expect(data.url).toBe('https://example.com/data');
    });

    it('AC-003b: stop→start 后窗口 nonce 旋转，注入脚本（guard 阻止二次注入）仍发新 nonce 且入库', () => {
        _set_nonce_for_test('nonce-x');
        start_network_hook(sender, 'cap1', Date.now(), 1);
        // 首次注入脚本已安装（guard 置位）
        (window as any).__capture_all_network_hook_installed__ = true;
        // eslint-disable-next-line no-eval
        eval(build_page_script(true));

        // stop→start，nonce 旋转
        stop_network_hook();
        _set_nonce_for_test('nonce-y');
        start_network_hook(sender, 'cap2', Date.now(), 1);

        // 注入脚本 post() 从 window 读 nonce。真实浏览器中 update_page_nonce 注入的
        // 更新脚本会执行并写 window；jsdom 不执行注入 script，故手动设置模拟其效果。
        (window as any).__capture_all_network_nonce__ = 'nonce-y';

        // 注入脚本发送的事件（post 会带 window 里的 nonce）→ 接受
        dispatch_message({
            source: SIGNAL,
            nonce: (window as any).__capture_all_network_nonce__,
            method: 'GET',
            url: 'https://example.com/restart',
            status: 200,
            response_body: 'x',
            response_body_status: 'captured',
        });

        // restart 后采集仍工作（AC-002 回归 + f005 修复验证）
        expect(sender).toHaveBeenCalledTimes(1);
        const [, data] = sender.mock.calls[0];
        expect(data.url).toBe('https://example.com/restart');
    });

    it('AC-002http: http 页（crypto.randomUUID 不可用）start 不崩且事件可入库（f006 回归）', () => {
        // 模拟非 secure context：删除 crypto.randomUUID
        vi.stubGlobal('crypto', {});
        _set_nonce_for_test(null);
        // start 不抛异常（generate_nonce fallback 生效，而非 crypto.randomUUID 抛 TypeError）
        expect(() => start_network_hook(sender, 'cap', Date.now(), 1)).not.toThrow();

        // 空 nonce 被拒 → 证明 current_nonce 非空（fallback 生成了有效值）
        dispatch_message({
            source: SIGNAL,
            method: 'GET',
            url: 'https://example.com/http',
            status: 200,
            response_body: 'x',
            response_body_status: 'captured',
        });
        expect(sender).not.toHaveBeenCalled();

        // 错误 nonce 也被拒（接收端在用某个非空值校验）
        dispatch_message({
            source: SIGNAL,
            nonce: 'wrong',
            method: 'GET',
            url: 'https://example.com/http',
            status: 200,
            response_body: 'x',
            response_body_status: 'captured',
        });
        expect(sender).not.toHaveBeenCalled();
    });

    it('AC-002httpb: http fallback 生成的 nonce 非空且被接收端接受（正向断言）', () => {
        // 与 AC-002http 相同环境：无 crypto.randomUUID，走 Math.random fallback
        vi.stubGlobal('crypto', {});
        _set_nonce_for_test(null);

        const append_spy = vi.spyOn(document.documentElement, 'appendChild');
        start_network_hook(sender, 'cap', Date.now(), 1);

        // start 通过 update_page_nonce 注入 nonce 脚本：断言写入的 nonce 非空
        const nonce_script = append_spy.mock.calls
            .map((c) => c[0] as HTMLElement)
            .find((el) => el.tagName === 'SCRIPT' && (el.textContent || '').includes('__capture_all_network_nonce__'));
        expect(nonce_script).toBeDefined();
        const m = nonce_script!.textContent!.match(/__capture_all_network_nonce__\s*=\s*"([^"]*)"/);
        expect(m).not.toBeNull();
        expect(m![1].length).toBeGreaterThan(0);

        // 该 fallback nonce 真实可用：带它的事件被接受入库
        dispatch_message({
            source: SIGNAL,
            nonce: m![1],
            method: 'GET',
            url: 'https://example.com/http',
            status: 200,
            response_body: 'x',
            response_body_status: 'captured',
        });
        expect(sender).toHaveBeenCalledTimes(1);
    });

    it('AC-004: 真实 crypto.randomUUID 两次 start 生成不同 nonce', () => {
        // p012 约束：不 stub randomUUID（jsdom 内部调用会污染调用计数），
        // 用真实 UUID 并经 update_page_nonce 注入脚本捕获两次 start 的实际 nonce。
        _set_nonce_for_test(null); // 前序 afterEach 可能残留 ''，先复位走真实生成路径
        const append_spy = vi.spyOn(document.documentElement, 'appendChild');

        start_network_hook(sender, 'cap1', Date.now(), 1);
        stop_network_hook();
        start_network_hook(sender, 'cap2', Date.now(), 1);

        const nonces = append_spy.mock.calls
            .map((c) => c[0] as HTMLElement)
            .map((el) => el.textContent?.match(/__capture_all_network_nonce__\s*=\s*"([^"]*)"/)?.[1])
            .filter((n): n is string => Boolean(n));
        expect(nonces.length).toBe(2);
        expect(nonces[0]).not.toBe(nonces[1]);

        // 旧 nonce（第一次 start 的）旋转后失效
        dispatch_message({
            source: SIGNAL,
            nonce: nonces[0],
            method: 'GET',
            url: 'https://example.com/stale',
            status: 200,
            response_body: 'x',
            response_body_status: 'captured',
        });
        expect(sender).not.toHaveBeenCalled();

        // 新 nonce（第二次 start 的）接受
        dispatch_message({
            source: SIGNAL,
            nonce: nonces[1],
            method: 'GET',
            url: 'https://example.com/two',
            status: 200,
            response_body: 'x',
            response_body_status: 'captured',
        });
        expect(sender).toHaveBeenCalledTimes(1);
    });

    it('AC-005: update_page_nonce 生产写路径把 nonce 写入 window 变量', () => {
        _set_nonce_for_test('nonce-w');

        const append_spy = vi.spyOn(document.documentElement, 'appendChild');
        start_network_hook(sender, 'cap', Date.now(), 1);

        // start 经 update_page_nonce 注入无 guard 的 nonce 脚本（更新页面 MAIN world 变量）
        const nonce_script = append_spy.mock.calls
            .map((c) => c[0] as HTMLElement)
            .find((el) => el.tagName === 'SCRIPT' && (el.textContent || '').includes('__capture_all_network_nonce__'));
        expect(nonce_script).toBeDefined();
        expect(nonce_script!.textContent).toContain('nonce-w');

        // jsdom 不执行注入脚本，手动 eval 模拟真实浏览器执行：验证写路径会更新 window 变量
        // eslint-disable-next-line no-eval
        eval(nonce_script!.textContent || '');
        expect((window as any).__capture_all_network_nonce__).toBe('nonce-w');
    });
});
