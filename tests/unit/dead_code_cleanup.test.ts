// tests/unit/dead_code_cleanup.test.ts
// t192 AC-001~004: 死代码清理静态断言——零引用导出删除、AgentStatus deprecated 字段移除、
// 无生产者事件契约删除、MCP session alias 退出条件文档化。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..', '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
const src_ts = (p: string) => read(`src/${p}`);

describe('t192 AC-001: 零引用 exported API 已删除', () => {
    const files = {
        bridge_error: 'bridge/logger.ts',
        write_error_events: 'extension/background/storage.ts',
        ExtensionBridgeConfig: 'shared/protocol.ts',
        RedactionStatus: 'shared/types.ts',
        CaptureEventUnion: 'shared/types.ts',
    };
    for (const [sym, file] of Object.entries(files)) {
        it(`${sym} 不再定义于 ${file}`, () => {
            expect(src_ts(file)).not.toMatch(new RegExp(`export (async )?(function|type|interface) ${sym}\\b`));
        });
    }
    it('全仓无残留引用（含测试，排除本测试文件自身）', () => {
        const grep_syms = ['bridge_error', 'write_error_events', 'ExtensionBridgeConfig', 'RedactionStatus', 'CaptureEventUnion'];
        const { execSync } = require('node:child_process');
        const out = execSync(`grep -rn "\\b${grep_syms.join('\\|')}\\b" src/ tests/ --include='*.ts' || true`).toString();
        // 排除本文件（断言目标符号名）+ log_bridge_error（不同私有符号）
        const filtered = out.split('\n').filter((l) => !l.includes('dead_code_cleanup.test.ts')).join('\n').replace(/log_bridge_error/g, '');
        expect(filtered).not.toMatch(new RegExp(grep_syms.join('|')));
    });
});

describe('t192 AC-002: AgentStatus deprecated 顶层字段已移除', () => {
    it('protocol.ts AgentStatus 无 extension_online/extension_version/active_capture_id', () => {
        const src = src_ts('shared/protocol.ts');
        const status_block = src.split('export interface AgentStatus')[1]?.split('export interface AgentExtensionStatus')[0] ?? '';
        expect(status_block).not.toMatch(/extension_online:/);
        expect(status_block).not.toMatch(/extension_version:/);
        expect(status_block).not.toMatch(/active_capture_id:/);
        expect(status_block).not.toMatch(/@deprecated/);
    });

    it('registry build_status 无 primary 派生与旧字段', () => {
        const src = src_ts('bridge/registry.ts');
        const build = src.split('build_status(host: string, port: number)')[1] ?? '';
        expect(build).not.toMatch(/extension_online:/);
        expect(build).not.toMatch(/const primary/);
    });

    it('测试不再反向固化旧字段（unit + e2e）', () => {
        const unit = read('tests/unit/agent_bridge_server.test.ts') + read('tests/unit/agent_mcp_client.test.ts');
        expect(unit).not.toMatch(/extension_online/);
        const e2e = read('tests/e2e/e2e-mcp.spec.ts') + read('tests/e2e/e2e-mcp-full.spec.ts');
        expect(e2e).not.toMatch(/extension_online/);
    });
});

describe('t192 AC-003: 无生产者事件契约已删除', () => {
    const dead_events = ['page_navigation', 'unhandled_rejection', 'resource_error', 'network_failed', 'dom_mutation', 'capture_config_changed', 'permission_missing', 'debugger_attach_status', 'body_capture_status_changed'];

    it('EventType 不含 9 个无生产者事件', () => {
        const types = src_ts('shared/types.ts');
        for (const ev of dead_events) {
            expect(types, ev).not.toMatch(new RegExp(`\\| '${ev}'`));
        }
    });

    it('dashboard_format 无对应渲染分支', () => {
        const fmt = src_ts('extension/dashboard/dashboard_format.ts');
        expect(fmt).not.toMatch(/case 'page_navigation'/);
        expect(fmt).not.toMatch(/case 'dom_mutation'/);
    });

    it('dashboard_detail 渲染列表不含已删事件', () => {
        const detail = src_ts('extension/dashboard/dashboard_detail.ts');
        expect(detail).not.toMatch(/'page_navigation'/);
        expect(detail).not.toMatch(/'unhandled_rejection'/);
        expect(detail).not.toMatch(/'network_failed'/);
    });

    it('event_category 分类集合不含已删事件', () => {
        const cat = src_ts('shared/event_category.ts');
        expect(cat).not.toMatch(/'page_navigation'/);
        expect(cat).not.toMatch(/'capture_config_changed'/);
    });

    it('测试 fixture 已迁移到真实事件类型（route_change）', () => {
        const fixture = read('tests/unit/detail_render_consistency.test.ts') + read('tests/unit/detail_search_preserve_input.test.ts') + read('tests/unit/pipeline_consistency.test.ts');
        expect(fixture).not.toMatch(/'page_navigation'/);
        expect(fixture).toMatch(/'route_change'/);
    });

    it('全仓（src + tests）无 9 个已删事件残留（f001 全仓扫描）', () => {
        const { execSync } = require('node:child_process');
        const dead = ['page_navigation', 'unhandled_rejection', 'resource_error', 'network_failed', 'dom_mutation', 'capture_config_changed', 'permission_missing', 'debugger_attach_status', 'body_capture_status_changed'];
        const out = execSync(`grep -rn "\\b${dead.join('\\|')}\\b" src/ tests/ --include='*.ts' || true`).toString();
        // 排除本测试文件（断言目标符号名）与注释行（历史说明可提及已删事件）
        const filtered = out.split('\n').filter((l) => {
            if (!l) return false;
            if (l.includes('dead_code_cleanup.test.ts')) return false;
            const code = l.replace(/^[^:]+:\d+:\s*/, '');
            return !code.trimStart().startsWith('//');
        }).join('\n');
        expect(filtered, filtered).toBe('');
    });
});

describe('t192 AC-004: MCP session alias 退出条件文档化', () => {
    it('domain.md 记录保留决策与退出条件', () => {
        const domain = read('docs/blueprint/domain.md');
        expect(domain).toMatch(/session alias 退出条件（t192）/);
        expect(domain).toMatch(/用户决策保留的显式兼容面/);
        expect(domain).toMatch(/v2\.0/);
        expect(domain).toMatch(/TOOL_COMMANDS/);
    });
});
