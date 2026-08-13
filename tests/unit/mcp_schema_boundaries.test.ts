// tests/unit/mcp_schema_boundaries.test.ts
// t179: MCP schema 边界——source/sources/format 公开枚举编码（BC-005/BM-L002），
// 非法值在 MCP Zod 层拒绝不进入 Bridge；多实例未指定目标错误码文档与实现一致（BC-009）。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MCP_TOOL_SCHEMAS } from '../../src/mcp/schemas';
import { AGENT_DATA_SOURCES, EXPORT_FORMATS } from '../../src/shared/constants';

function parse_ok(tool: string, input: Record<string, unknown>): unknown {
    return MCP_TOOL_SCHEMAS[tool].parse(input);
}

function parse_fail(tool: string, input: Record<string, unknown>): void {
    expect(() => MCP_TOOL_SCHEMAS[tool].parse(input)).toThrow();
}

// ── AC-001：非法 source/sources/format 在 Zod 层拒绝 ────────
describe('t179 AC-001: 非法枚举在 MCP Zod 层拒绝', () => {
    it('list_records: 非法 source 拒绝', () => {
        parse_fail('list_records', { capture_id: 'cap-001', source: 'bogus_source' });
    });

    it('get_record: 非法 source 拒绝', () => {
        parse_fail('get_record', { capture_id: 'cap-001', source: 'network' + 'x', record_id: 'r1' });
    });

    it('get_timeline: sources 数组含非法值拒绝', () => {
        parse_fail('get_timeline', { capture_id: 'cap-001', sources: ['network_requests', 'bogus'] });
    });

    it('get_timeline: sources 数组全非法拒绝', () => {
        parse_fail('get_timeline', { capture_id: 'cap-001', sources: ['console', 'user_actions'] });
    });

    it('export_capture: 非法 format 拒绝（不再透传）', () => {
        parse_fail('export_capture', { capture_id: 'cap-001', format: 'csv' });
    });
});

// ── AC-002：合法枚举正常通过并执行 ──────────────────────────
describe('t179 AC-002: 合法枚举放行（与共享常量派生一致）', () => {
    it('list_records: 全部 7 个合法 source 通过', () => {
        for (const source of AGENT_DATA_SOURCES) {
            const result = parse_ok('list_records', { capture_id: 'cap-001', source }) as { source: string };
            expect(result.source).toBe(source);
        }
    });

    it('get_timeline: sources 全合法通过', () => {
        const result = parse_ok('get_timeline', {
            capture_id: 'cap-001',
            sources: ['user_action_events', 'network_requests', 'error_events'],
        }) as { sources: string[] };
        expect(result.sources).toEqual(['user_action_events', 'network_requests', 'error_events']);
    });

    it('export_capture: 全部 4 个合法 format 通过', () => {
        for (const format of EXPORT_FORMATS) {
            const result = parse_ok('export_capture', { capture_id: 'cap-001', format }) as { format: string };
            expect(result.format).toBe(format);
        }
    });
});

// ── AC-003：多实例未指定目标错误码——文档与实现一致 ────────
describe('t179 AC-003: TARGET_REQUIRED/TARGET_AMBIGUOUS 文档与实现一致', () => {
    const root = resolve(__dirname, '..', '..');

    it('deployment.md：多实例未指定目标为 TARGET_REQUIRED（无旧 AMBIGUOUS 表述）', () => {
        const doc = readFileSync(resolve(root, 'docs/guides/deployment.md'), 'utf8');
        expect(doc).toMatch(/多实例未指定目标时返回 `TARGET_REQUIRED`/);
        expect(doc).not.toMatch(/多实例未指定时返回 `TARGET_AMBIGUOUS`/);
    });

    it('decisions.md ADR 008：未指定 target 为 TARGET_REQUIRED（AMBIGUOUS 仅 label 非唯一）', () => {
        const doc = readFileSync(resolve(root, 'docs/blueprint/decisions.md'), 'utf8');
        expect(doc).toMatch(/未 specify target 时返回 `TARGET_REQUIRED`/);
        expect(doc).toMatch(/`TARGET_AMBIGUOUS` 仅用于显式 `target_label` 命中多个在线实例/);
    });

    it('domain.md §8 Bridge 层错误码表同时收录 TARGET_REQUIRED 与 TARGET_AMBIGUOUS', () => {
        const doc = readFileSync(resolve(root, 'docs/blueprint/domain.md'), 'utf8');
        const bridge_line = doc.split('**Bridge 层**：')[1] ?? '';
        expect(bridge_line).toMatch(/`TARGET_REQUIRED`/);
        expect(bridge_line).toMatch(/`TARGET_AMBIGUOUS`/);
    });

    it('实现 resolve_target：未指定 target 多实例返回 TARGET_REQUIRED，AMBIGUOUS 仅 label 多匹配', () => {
        const src = readFileSync(resolve(root, 'src/bridge/server.ts'), 'utf8');
        const fn = src.split('function resolve_target')[1] ?? '';
        // 无 target 多实例的 else 兜底分支返回 TARGET_REQUIRED
        expect(fn).toMatch(/code: 'TARGET_REQUIRED'/);
        // AMBIGUOUS 只在显式 label 命中多实例分支（matches.length > 1）返回
        expect(fn.indexOf("code: 'TARGET_AMBIGUOUS'")).toBeGreaterThan(fn.indexOf('matches.length > 1'));
        // 行为级覆盖见 agent_bridge_server.test.ts::multi-instance: write without target returns TARGET_REQUIRED
    });

    it('dispatcher 实际接受的导出 format 与 EXPORT_FORMATS 常量一致（防 schema/实现漂移）', () => {
        const src = readFileSync(resolve(root, 'src/extension/background/agent_command_dispatcher.ts'), 'utf8');
        const export_fn = src.split('async function export_capture')[1] ?? '';
        for (const format of EXPORT_FORMATS) {
            expect(export_fn).toMatch(new RegExp(`case '${format}':`));
        }
    });
});
