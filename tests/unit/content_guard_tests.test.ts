// tests/unit/content_guard_tests.test.ts
// t195 AC-001~005: content 守卫行为测试与缺陷修复——storage_capture 共享模板迁移、
// clipboard 内容去重、onMessage 未知 action 响应纯函数、start 并行通知/生成守卫行为级测试。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { unknown_action_response } from '../../src/extension/content/content_message';
import { notify_tabs_in_parallel } from '../../src/extension/background/notify_tabs';

const root = resolve(__dirname, '..', '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

describe('t195 AC-001: storage_capture 注入脚本迁移共享模板', () => {
    it('build_page_script 经 page_script_reinstall_guard/page_script_preamble 生成（无内联双份）', () => {
        const src = read('src/extension/content/storage_capture.ts');
        expect(src).toMatch(/page_script_reinstall_guard\('storage'/);
        expect(src).toMatch(/page_script_preamble\('storage', secret\)/);
        // 不再内联 SYNC_HMAC_JS 字面与手写还原守卫
        const build = src.split('export function build_page_script')[1] ?? '';
        expect(build).not.toMatch(/\$\{SYNC_HMAC_JS\}/);
        expect(build).not.toMatch(/var SIGNAL = '\$\{SIGNAL\}'/); // 旧内联 SIGNAL 字面（模板展开后无）
        expect(src).toMatch(/page_script_reinstall_guard, page_script_preamble/);
    });
});

describe('t195 AC-002: clipboard 去重叠加内容匹配', () => {
    it('实现读取 clipboardData 内容 + 去重键含内容（源码断言）', () => {
        const src = read('src/extension/content/clipboard_capture.ts');
        expect(src).toMatch(/read_clipboard_text/);
        expect(src).toMatch(/cd\?\.getData/);
        expect(src).toMatch(/prev\.content === content/);
    });
    // 行为测试见 clipboard_capture.test.ts（p043 两用例 + B3-L7 同内容去重更新）
});

describe('t195 AC-003: onMessage 未知 action 响应纯函数', () => {
    it('unknown_action_response 返回失败响应（通道不挂起语义）', () => {
        const resp = unknown_action_response();
        expect(resp).toEqual({ success: false, error: 'unknown_action' });
    });

    it('content_script else 分支调用纯函数', () => {
        const src = read('src/extension/content/content_script.ts');
        expect(src).toMatch(/sendResponse\(unknown_action_response\(\)\)/);
        expect(src).toMatch(/import \{ unknown_action_response \} from '\.\/content_message'/);
    });
});

describe('t195 AC-004: start 并行通知与 generation 守卫行为级', () => {
    it('notify_tabs_in_parallel 对全部 http tab 并行通知（Promise.all 语义）', async () => {
        const sent: number[] = [];
        const results = await notify_tabs_in_parallel(
            [{ id: 1, url: 'https://a.com' }, { id: 2, url: 'http://b.com' }, { id: 3, url: 'chrome://ext' }],
            async (tabId) => { sent.push(tabId); return true; },
        );
        // chrome:// 被过滤；1/2 并行通知
        expect(sent.sort()).toEqual([1, 2]);
        expect(results).toEqual([true, true]);
    });

    it('notify_tabs_in_parallel 无 id tab 跳过', async () => {
        const sent: number[] = [];
        await notify_tabs_in_parallel(
            [{ url: 'https://x.com' }, { id: 9, url: 'https://y.com' }],
            async (tabId) => { sent.push(tabId); },
        );
        expect(sent).toEqual([9]);
    });

    it('service_worker start 经 notify_tabs_in_parallel（源码接线）', () => {
        const src = read('src/extension/background/service_worker.ts');
        expect(src).toMatch(/notify_tabs_in_parallel\(capturable_tabs/);
        expect(src).toMatch(/import \{ notify_tabs_in_parallel \} from '\.\/notify_tabs'/);
    });

    // generation 守卫行为（begin_start → 激活 / 新 start 后旧 gen 失活）见 capture_state.test.ts
});
