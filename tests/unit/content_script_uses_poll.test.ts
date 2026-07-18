// tests/content_script_uses_poll.test.ts
// BUG-004 契约测试：content_script 必须使用 start_status_poll
//
// 回归防御：如果未来误删 content_script 中的轮询逻辑，回到"一次性 get_status"
// 旧实现，本测试会失败。
//
// 详见 src/extension/shared/poll_capture_status.ts 的根因说明。
//
// 注意：content_script.ts 顶层执行 chrome.runtime.onMessage 等浏览器 API，
// 不能在 node 环境直接 import，本测试只做静态源码扫描。

import { describe, it, expect } from 'vitest';
import * as poll_module from '../../src/extension/shared/poll_capture_status';

describe('BUG-004 contract: content_script uses status polling', () => {
    it('poll_capture_status module exports start_status_poll', () => {
        expect(typeof poll_module.start_status_poll).toBe('function');
    });

    it('content_script source integrates start_status_poll (regression guard)', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const src = fs.readFileSync(
            path.resolve(__dirname, '..', '..', 'src', 'extension', 'content', 'content_script.ts'),
            'utf8'
        );

        // 必须导入 start_status_poll
        expect(src).toMatch(/import\s+\{[^}]*start_status_poll[^}]*\}\s+from\s+['"][^'']*poll_capture_status['"]/);

        // 必须实际调用 start_status_poll（不是只 import 不用）
        expect(src).toMatch(/start_status_poll\s*\(\s*\{/);

        // 必须在 stop_capture 中调用 stop_status_poll
        expect(src).toMatch(/stop_status_poll\s*\(\s*\)/);

        // 不能再使用"加载时一次性 get_status + 直接判断"的旧 fallback 模式。
        // 旧模式特征：chrome.runtime.sendMessage(...).then((response) => { if (response?.is_capturing ...)
        // 修复后：所有 get_status 都通过 start_status_poll deps 注入。
        const legacy_pattern = /chrome\.runtime\.sendMessage\(\s*\{\s*action:\s*['"]get_status['"]\s*\}\s*\)\s*\.then\(\s*\(response[^)]*\)\s*=>\s*\{[^}]*is_capturing/s;
        expect(src).not.toMatch(legacy_pattern);
    });

    it('REGRESSION BUG-004: content_script stop_capture calls stop_status_poll', async () => {
        // 防御：如果采集停止时不清除轮询定时器，会导致已 stop 的 content_script
        // 在下一轮 poll 时重新触发 start_capture，污染下一次采集。
        const fs = await import('fs');
        const path = await import('path');
        const src = fs.readFileSync(
            path.resolve(__dirname, '..', '..', 'src', 'extension', 'content', 'content_script.ts'),
            'utf8'
        );
        // stop_status_poll 必须出现在 stop_capture 函数体内（粗略：在 stop_mouse_capture 附近）
        expect(src).toMatch(/stop_status_poll\s*\(\s*\)/);
        const stop_section = src.split(/function\s+stop_capture/)[1] ?? '';
        expect(stop_section).toMatch(/stop_status_poll/);
    });
});

