// tests/unit/network_hook_config_gate.test.ts
// 「结构契约」标注（t151 AC-003 处置 B3 表层断言）：
// 本文件为源码结构锚点——断言 content_script.start_capture 的接线形态
// （capture_network 条件门控、start_network_hook 参数传递、单次调用），
// 源码重命名即脆断，不验证运行行为。行为级语义（hook 未 start 不转发 /
// start 后转发 / body 采集开关 / URL 脱敏）由 network_hook_gate_behavior.test.ts 覆盖。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const content_script_src = readFileSync(
    resolve(__dirname, '..', '..', 'src', 'extension', 'content', 'content_script.ts'),
    'utf8'
);

describe('content_script network_hook 配置门控 (T098)', () => {
    it('AC-001: network_hook 与 websocket_capture 受 capture_network 条件门控', () => {
        const start_section = content_script_src.split(/function\s+start_capture/)[1] ?? '';
        const conditional = start_section.match(/if\s*\(\s*config\.capture_network\s*\)[\s\S]*?start_network_hook[\s\S]*?start_websocket_capture/);
        expect(conditional).not.toBeNull();
        // else 分支显式停用防残留注入
        const else_branch = start_section.match(/else\s*\{[\s\S]*?stop_network_hook[\s\S]*?stop_websocket_capture/);
        expect(else_branch).not.toBeNull();
    });

    it('AC-002: 门控保留 capture_network true 路径（回归锚点）', () => {
        const start_section = content_script_src.split(/function\s+start_capture/)[1] ?? '';
        // start_network_hook 第 5 参传 config.capture_response_body，第 6 参传 redact 配置对象
        expect(start_section).toMatch(/start_network_hook\([^)]*config\.capture_response_body[^)]*redact_data/);
    });

    it('AC-003: network_hook 接收 capture_response_body 且注入脚本按配置控制 body 采集', () => {
        const start_section = content_script_src.split(/function\s+start_capture/)[1] ?? '';
        // start_network_hook 第 5 参传 config.capture_response_body
        expect(start_section).toMatch(/start_network_hook\([^)]*config\.capture_response_body/);
    });

    it('AC-004: start_network_hook 在 start_capture 内恰好出现一次（p015）', () => {
        const start_section = content_script_src.split(/function\s+start_capture/)[1] ?? '';
        const matches = start_section.match(/start_network_hook\(/g) ?? [];
        expect(matches).toHaveLength(1);
    });
});
