// tests/unit/output_path_contract.test.ts
// t176 AC-001~005: output_path 契约——相对路径、base/父目录自动创建、逃逸拒绝不退化
import { describe, expect, it, afterEach } from 'vitest';
import { mkdtemp, rm, symlink, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _safe_output_path_for_test } from '../../src/bridge/server';
import { MCP_TOOL_SCHEMAS } from '../../src/mcp/schemas';
import { readFileSync } from 'node:fs';
import { resolve as resolve_path } from 'node:path';

const project_root = resolve_path(__dirname, '..', '..');
const guide = readFileSync(resolve_path(project_root, 'docs/guides/mcp_usage.md'), 'utf8');

let cleanup_dirs: string[] = [];

async function make_export_dir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 't176-export-'));
    cleanup_dirs.push(dir);
    return dir;
}

afterEach(async () => {
    for (const dir of cleanup_dirs) {
        await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
    cleanup_dirs = [];
});

describe('output_path 契约', () => {
    it('AC-001: 指南示例用相对路径，不含绝对路径示例', () => {
        expect(guide).toContain('"output_path": "exports/session-xxx.json"');
        expect(guide).not.toContain('"/absolute/path/export.json"');
        expect(guide).toContain('相对路径/文件名');
    });

    it('AC-002: 默认导出目录不存在时首次相对路径导出成功（safe_output_path 创建 base）', async () => {
        const base = join(tmpdir(), `t176-missing-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const result = await _safe_output_path_for_test('export.json', base);
        expect(result).toBe(resolve(base, 'export.json'));
        cleanup_dirs.push(base);
    });

    it('AC-003: 嵌套父目录不存在时导出成功（自动创建 + 再校验）', async () => {
        const base = await make_export_dir();
        const result = await _safe_output_path_for_test('nested/deep/export.json', base);
        expect(result).toBe(resolve(base, 'nested/deep/export.json'));
        // 修复行为：嵌套父目录已被创建（旧实现不创建，写盘层 500）
        const st = await stat(resolve(base, 'nested/deep'));
        expect(st.isDirectory()).toBe(true);
    });

    it('AC-004a: 绝对路径仍被拒绝（防护不退化）', async () => {
        const base = await make_export_dir();
        await expect(_safe_output_path_for_test('/etc/passwd', base)).rejects.toThrow('output_path must be inside export dir');
    });

    it('AC-004b: .. 穿越仍被拒绝', async () => {
        const base = await make_export_dir();
        await expect(_safe_output_path_for_test('../../escape.txt', base)).rejects.toThrow('output_path must be inside export dir');
    });

    it('AC-004c: base 下预置 symlink 指向外部仍被拒绝（创建后再校验）', async () => {
        const base = await make_export_dir();
        const outside = await mkdtemp(join(tmpdir(), 't176-outside-'));
        cleanup_dirs.push(outside);
        await symlink(outside, join(base, 'link'));
        await expect(_safe_output_path_for_test('link/evil.txt', base)).rejects.toThrow(/outside export dir/);
    });

    it('AC-004d: MCP schema 拒绝绝对路径与 ..', () => {
        expect(() => MCP_TOOL_SCHEMAS.export_capture.parse({ capture_id: 'c1', format: 'json', output_path: '/etc/x.json' })).toThrow();
        expect(() => MCP_TOOL_SCHEMAS.export_capture.parse({ capture_id: 'c1', format: 'json', output_path: '../x.json' })).toThrow();
        // 合法相对路径通过
        expect(MCP_TOOL_SCHEMAS.export_capture.parse({ capture_id: 'c1', format: 'json', output_path: 'exports/x.json' }).output_path).toBe('exports/x.json');
    });
});
