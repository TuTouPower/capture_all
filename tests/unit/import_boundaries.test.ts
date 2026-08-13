// tests/unit/import_boundaries.test.ts
// t187 AC-003: 产品间 import 边界——src/{extension,bridge,mcp} 互相导入被拒绝；
// src/shared 禁止 Node API（浏览器 bundle 安全）；MCP 不从 bridge 导入（token 中立化后）。

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';

const root = resolve(__dirname, '..', '..');
const src = join(root, 'src');

const PRODUCTS = ['extension', 'bridge', 'mcp'] as const;

function walk_ts_files(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            out.push(...walk_ts_files(full));
        } else if (entry.endsWith('.ts')) {
            out.push(full);
        }
    }
    return out;
}

function product_of(file: string): string | null {
    const rel = relative(src, file).split(sep);
    return PRODUCTS.includes(rel[0] as never) ? rel[0] : null;
}

/** 解析相对 import 的目标（相对 src），返回 null 表示非本仓库源码或无法解析。 */
function resolve_target(file: string, import_path: string): string | null {
    if (!import_path.startsWith('.') && !import_path.startsWith('/')) return null; // bare/别名
    const base_dir = dirname_of(file);
    const resolved = resolve(base_dir, import_path);
    const rel = relative(src, resolved);
    if (rel.startsWith('..') || rel.startsWith(sep)) return null; // src 外
    return rel.split(sep)[0];
}

function dirname_of(file: string): string {
    return file.slice(0, Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\')));
}

function cross_product_imports(): Array<{ from: string; to: string; target: string }> {
    const violations: Array<{ from: string; to: string; target: string }> = [];
    for (const file of walk_ts_files(src)) {
        const product = product_of(file);
        if (!product) continue;
        const content = readFileSync(file, 'utf8');
        // 匹配全部导入形态：from './x' / 副作用 import '../x' / 动态 import('x') / require('x')
        const re = /(?:from\s+|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(content)) !== null) {
            const import_path = m[1] ?? m[2];
            if (!import_path) continue;
            const target = resolve_target(file, import_path);
            if (target && PRODUCTS.includes(target as never) && target !== product) {
                violations.push({ from: relative(src, file), to: target, target: import_path });
            }
        }
    }
    return violations;
}

describe('t187 AC-003: 产品间 import 边界', () => {
    it('src/{extension,bridge,mcp} 无互相导入（架构依赖方向 extension/bridge/mcp → shared）', () => {
        const violations = cross_product_imports();
        expect(violations).toEqual([]);
    });

    it('MCP 不从 bridge 导入（token 文件经 node_shared 中立模块）', () => {
        const mcp_violations = cross_product_imports().filter((v) => v.from.startsWith('mcp'));
        expect(mcp_violations).toEqual([]);
        const token_resolver = readFileSync(join(src, 'mcp', 'token_resolver.ts'), 'utf8');
        expect(token_resolver).toMatch(/from '\.\.\/node_shared\/bridge_token_file'/);
        expect(token_resolver).not.toMatch(/from '\.\.\/bridge\//);
    });

    it('src/shared 不含 Node API 引用（浏览器 bundle 安全；node_shared 为 Node-only 层允许）', () => {
        for (const file of walk_ts_files(join(src, 'shared'))) {
            const content = readFileSync(file, 'utf8');
            expect(content, file).not.toMatch(/from 'node:/);
            expect(content, file).not.toMatch(/require\('node:/);
        }
    });

    it('node_shared 不被 extension 引用（Node-only 层不进浏览器 bundle）', () => {
        const ext_files = walk_ts_files(join(src, 'extension'));
        for (const file of ext_files) {
            const content = readFileSync(file, 'utf8');
            expect(content, file).not.toMatch(/node_shared/);
        }
    });
});
