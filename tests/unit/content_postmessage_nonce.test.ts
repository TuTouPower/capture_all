// @vitest-environment jsdom
// tests/unit/content_postmessage_nonce.test.ts
// 验证 content page 注入通道（network/ws/storage）per-start nonce 校验：伪造 SIGNAL 被拒、合法入库、旧 nonce 失效
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    start_network_hook,
    stop_network_hook,
    _set_nonce_for_test,
    _set_secret_for_test,
    build_page_script,
} from '../../src/extension/content/network_hook';
import { sign_message, sign_message_with_secret, TEST_SECRET } from '../support/helpers/signed_message';
import { verify_payload } from '../../src/extension/content/content_hmac';

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
        _set_secret_for_test(TEST_SECRET);
    });

    afterEach(() => {
        stop_network_hook();
        _set_nonce_for_test('');
        _set_secret_for_test(null);
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

        dispatch_message(sign_message({
            source: SIGNAL,
            nonce: 'nonce-1',
            method: 'GET',
            url: 'https://example.com/data',
            status: 200,
            response_body: 'body',
            response_body_status: 'captured',
        }));

        expect(sender).toHaveBeenCalledTimes(1);
        const [event, data] = sender.mock.calls[0];
        expect(event.type).toBe('network_request');
        expect(data.url).toBe('https://example.com/data');
    });

    it('AC-002b: 正确 nonce 但签名缺失/不匹配的消息被拒收（T121）', () => {
        _set_nonce_for_test('nonce-1');
        start_network_hook(sender, 'cap', Date.now(), 1);

        // 正确 nonce、无签名 → 拒
        dispatch_message({
            source: SIGNAL,
            nonce: 'nonce-1',
            method: 'GET',
            url: 'https://example.com/nosig',
            status: 200,
            response_body: 'x',
            response_body_status: 'captured',
        });
        expect(sender).not.toHaveBeenCalled();

        // 正确 nonce、错误签名 → 拒
        dispatch_message({
            ...sign_message({
                source: SIGNAL,
                nonce: 'nonce-1',
                method: 'GET',
                url: 'https://example.com/badsig',
                status: 200,
                response_body: 'x',
                response_body_status: 'captured',
            }),
            sig: '0'.repeat(64),
        });
        expect(sender).not.toHaveBeenCalled();
    });

    it('AC-003: 两次 start nonce 不同，旧 nonce 消息被拒、新 nonce 接受', () => {
        _set_nonce_for_test('nonce-a');
        start_network_hook(sender, 'cap1', Date.now(), 1);
        // 旧 nonce 消息
        dispatch_message(sign_message({
            source: SIGNAL,
            nonce: 'nonce-a',
            method: 'GET',
            url: 'https://example.com/old',
            status: 200,
            response_body: 'x',
            response_body_status: 'captured',
        }));
        expect(sender).toHaveBeenCalledTimes(1);

        stop_network_hook();
        _set_nonce_for_test('nonce-b');
        start_network_hook(sender, 'cap2', Date.now(), 1);

        // 旧 nonce（nonce-a）现在失效
        dispatch_message(sign_message({
            source: SIGNAL,
            nonce: 'nonce-a',
            method: 'GET',
            url: 'https://example.com/old2',
            status: 200,
            response_body: 'x',
            response_body_status: 'captured',
        }));
        expect(sender).toHaveBeenCalledTimes(1);

        // 新 nonce（nonce-b）接受
        dispatch_message(sign_message({
            source: SIGNAL,
            nonce: 'nonce-b',
            method: 'GET',
            url: 'https://example.com/new',
            status: 200,
            response_body: 'x',
            response_body_status: 'captured',
        }));
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
        const script = build_page_script(true, TEST_SECRET);
        expect(script).toContain('__capture_all_network_nonce__');
        // eslint-disable-next-line no-eval
        eval(script);

        // 注入脚本同款消息（带正确 nonce 与 T121 签名）达接收端 → 接受
        dispatch_message(sign_message({
            source: '__capture_all_network_hook__',
            nonce: 'nonce-e2e',
            method: 'GET',
            url: 'https://example.com/data',
            status: 200,
            response_body: 'body',
            response_body_status: 'captured',
        }));

        expect(sender).toHaveBeenCalledTimes(1);
        const [, data] = sender.mock.calls[0];
        expect(data.url).toBe('https://example.com/data');
    });

    it('AC-003b: stop→start 后窗口 nonce 旋转，重注入脚本仍发新 nonce 且入库', () => {
        _set_nonce_for_test('nonce-x');
        start_network_hook(sender, 'cap1', Date.now(), 1);
        // 首次注入脚本已安装（guard 置位）
        (window as any).__capture_all_network_hook_installed__ = true;
        // eslint-disable-next-line no-eval
        eval(build_page_script(true, TEST_SECRET));

        // stop→start，nonce 旋转
        stop_network_hook();
        _set_nonce_for_test('nonce-y');
        start_network_hook(sender, 'cap2', Date.now(), 1);

        // 注入脚本 post() 从 window 读 nonce。真实浏览器中 update_page_nonce 注入的
        // 更新脚本会执行并写 window；jsdom 不执行注入 script，故手动设置模拟其效果。
        (window as any).__capture_all_network_nonce__ = 'nonce-y';

        // 注入脚本发送的事件（post 会带 window 里的 nonce）→ 接受
        dispatch_message(sign_message({
            source: SIGNAL,
            nonce: (window as any).__capture_all_network_nonce__,
            method: 'GET',
            url: 'https://example.com/restart',
            status: 200,
            response_body: 'x',
            response_body_status: 'captured',
        }));

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

        // 该 fallback nonce 真实可用：带它的事件被接受入库（T121 签名）
        dispatch_message(sign_message({
            source: SIGNAL,
            nonce: m![1],
            method: 'GET',
            url: 'https://example.com/http',
            status: 200,
            response_body: 'x',
            response_body_status: 'captured',
        }));
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
        dispatch_message(sign_message({
            source: SIGNAL,
            nonce: nonces[0],
            method: 'GET',
            url: 'https://example.com/stale',
            status: 200,
            response_body: 'x',
            response_body_status: 'captured',
        }));
        expect(sender).not.toHaveBeenCalled();

        // 新 nonce（第二次 start 的）接受
        dispatch_message(sign_message({
            source: SIGNAL,
            nonce: nonces[1],
            method: 'GET',
            url: 'https://example.com/two',
            status: 200,
            response_body: 'x',
            response_body_status: 'captured',
        }));
        expect(sender).toHaveBeenCalledTimes(1);
    });

    it('AC-003s: 每次 start 旋转 secret，跨采集旧签名失效（T121）', () => {
        _set_nonce_for_test('nonce-rot');
        _set_secret_for_test('secret-a');
        start_network_hook(sender, 'cap1', Date.now(), 1);

        // secret-a 签名的消息接受
        dispatch_message(sign_message_with_secret({
            source: SIGNAL,
            nonce: 'nonce-rot',
            method: 'GET',
            url: 'https://example.com/a',
            status: 200,
            response_body: 'x',
            response_body_status: 'captured',
        }, 'secret-a'));
        expect(sender).toHaveBeenCalledTimes(1);

        stop_network_hook();
        _set_secret_for_test('secret-b');
        start_network_hook(sender, 'cap2', Date.now(), 1);

        // 旧 secret-a 签名的消息被拒（跨采集旧签名失效）
        dispatch_message(sign_message_with_secret({
            source: SIGNAL,
            nonce: 'nonce-rot',
            method: 'GET',
            url: 'https://example.com/stale',
            status: 200,
            response_body: 'x',
            response_body_status: 'captured',
        }, 'secret-a'));
        expect(sender).toHaveBeenCalledTimes(1);

        // 新 secret-b 签名接受
        dispatch_message(sign_message_with_secret({
            source: SIGNAL,
            nonce: 'nonce-rot',
            method: 'GET',
            url: 'https://example.com/b',
            status: 200,
            response_body: 'x',
            response_body_status: 'captured',
        }, 'secret-b'));
        expect(sender).toHaveBeenCalledTimes(2);
    });

    it('AC-001s: secret 不写 window 全局——仅读 window nonce 的页面脚本无法构造签名', () => {
        _set_nonce_for_test('nonce-secret');
        _set_secret_for_test('secret-hidden');
        const append_spy = vi.spyOn(document.documentElement, 'appendChild');
        start_network_hook(sender, 'cap', Date.now(), 1);

        // 注入脚本源码：SECRET 为闭包 var（非 window 全局赋值）
        const injected = append_spy.mock.calls
            .map((c) => c[0] as HTMLElement)
            .map((el) => el.textContent || '')
            .find((t) => t.includes('__capture_all_network_hook_installed__'));
        expect(injected).toBeDefined();
        expect(injected!).toContain('var SECRET = \'secret-hidden\';');
        expect(injected!).not.toContain('window.__capture_all_network_secret__');
        expect(injected!).not.toContain('window.SECRET');

        // 页面 window 上无 secret 残留（secret 不写 window 全局；对抗性 DOM hook
        // 窃取注入脚本文本的暴露面见 ADR-020 威胁模型边界）
        expect((window as any).__capture_all_network_secret__).toBeUndefined();

        // 仅读 window nonce 的消息（无签名）被拒——页面无法仅凭 nonce 构造合法消息
        dispatch_message({
            source: SIGNAL,
            nonce: 'nonce-secret',
            method: 'GET',
            url: 'https://example.com/forged',
            status: 200,
            response_body: 'x',
            response_body_status: 'captured',
        });
        expect(sender).not.toHaveBeenCalled();
    });

    it('T121e2e: 注入脚本真实 hook 签名路径——JS 签名可被 content TS 校验通过', async () => {
        _set_nonce_for_test('nonce-e2e2');
        _set_secret_for_test(TEST_SECRET);
        start_network_hook(sender, 'cap', Date.now(), 1);
        // jsdom 不执行 update_page_nonce 注入脚本，手动设置模拟其效果（真实浏览器自动执行）
        (window as any).__capture_all_network_nonce__ = 'nonce-e2e2';
        // 先 stub fetch 再注入：注入脚本 hook 捕获 stub 为 orig_fetch
        (window as any).fetch = (input: any) => Promise.resolve(
            new Response('{"ok":1}', { status: 200, headers: { 'content-type': 'application/json' } })
        );
        (window as any).__capture_all_network_hook_installed__ = false;
        // eslint-disable-next-line no-eval
        eval(build_page_script(true, TEST_SECRET));

        // 捕获注入脚本 postMessage
        const messages: any[] = [];
        const listener = (e: MessageEvent) => { if (e.data?.source === SIGNAL) messages.push(e.data); };
        window.addEventListener('message', listener);
        try {
            await (window as any).fetch('https://example.com/api');
            await new Promise((r) => setTimeout(r, 20));
        } finally {
            window.removeEventListener('message', listener);
        }

        const msg = messages.find((m) => m.url === 'https://example.com/api');
        expect(msg).toBeDefined();
        // 注入脚本（JS 实现）构造的签名：content（TS 实现）校验通过
        expect(typeof msg.sig).toBe('string');
        expect(msg.sig.length).toBe(64);
        expect(verify_payload(TEST_SECRET, msg)).toBe(true);
        // 页面伪造：改 url 后签名不匹配
        expect(verify_payload(TEST_SECRET, { ...msg, url: 'https://evil.example.com' })).toBe(false);
        // content listener 接受带签名消息由手动 dispatch 用例覆盖（jsdom postMessage
        // 事件 origin=''/source=null 与真实浏览器不符，此处验证签名交叉正确性即可）
    });

    it('T121restart: stop→start 重注入后注入脚本持新 SECRET，采集不断流（f001 回归）', async () => {
        _set_nonce_for_test('nonce-r');
        _set_secret_for_test('secret-r1');
        start_network_hook(sender, 'cap1', Date.now(), 1);
        // jsdom 不执行 update_page_nonce 注入脚本，手动设置模拟其效果
        (window as any).__capture_all_network_nonce__ = 'nonce-r';
        // 先 stub fetch 再注入（hook 捕获 stub 为 orig；重注入还原后仍回到 stub）
        (window as any).fetch = (input: any) => Promise.resolve(
            new Response('x', { status: 200, headers: { 'content-type': 'text/plain' } })
        );
        (window as any).__capture_all_network_hook_installed__ = false;
        // eslint-disable-next-line no-eval
        eval(build_page_script(true, 'secret-r1'));

        const capture_posted = async (url: string): Promise<any[]> => {
            const messages: any[] = [];
            const listener = (e: MessageEvent) => { if (e.data?.source === SIGNAL) messages.push(e.data); };
            window.addEventListener('message', listener);
            try {
                await (window as any).fetch(url);
                await new Promise((r) => setTimeout(r, 20));
            } finally {
                window.removeEventListener('message', listener);
            }
            return messages.filter((m) => m.url === url);
        };

        // 首轮采集：注入脚本（SECRET-r1）签名消息，与 content 当前 secret 匹配（不断流、无双写）
        const msgs1 = await capture_posted('https://example.com/one');
        expect(msgs1).toHaveLength(1);
        expect(verify_payload('secret-r1', msgs1[0])).toBe(true);

        // stop → start（secret 旋转 r2）→ 重注入（还原上次 hook + 重装新 SECRET）
        stop_network_hook();
        _set_secret_for_test('secret-r2');
        start_network_hook(sender, 'cap2', Date.now(), 1);
        (window as any).__capture_all_network_hook_installed__ = true;
        // eslint-disable-next-line no-eval
        eval(build_page_script(true, 'secret-r2'));

        // 重注入后触发 hook：注入脚本持新 SECRET（r2），与 content 当前 secret 匹配（采集不断流、无双写）
        const msgs2 = await capture_posted('https://example.com/two');
        expect(msgs2).toHaveLength(1);
        expect(verify_payload('secret-r2', msgs2[0])).toBe(true);
        // 旧 SECRET（r1）不再匹配重注入后的注入脚本签名（跨采集旧签名失效）
        expect(verify_payload('secret-r1', msgs2[0])).toBe(false);

        // 旧 SECRET（r1）签名的消息被 content 拒收（跨采集旧签名失效）
        dispatch_message(sign_message_with_secret({
            source: SIGNAL,
            nonce: 'nonce-r',
            method: 'GET',
            url: 'https://example.com/stale',
            status: 200,
            response_body: 'x',
            response_body_status: 'captured',
        }, 'secret-r1'));
        expect(sender).toHaveBeenCalledTimes(0);
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
