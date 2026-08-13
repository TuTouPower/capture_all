// tests/unit/perf_budget_leftovers.test.ts
// t193 AC-001~006: 性能预算遗留项——app log 2× 峰值、captures.list 全量读取、
// app log 导出巨型字符串、Dashboard windowed、ZIP 流式、bundle 门禁。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..', '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

describe('t193 AC-001: app log 配置上限不超过声明峰值 1 倍', () => {
    it('trim 后 _estimated_bytes 设为保留字节（非 0）', () => {
        const src = read('src/extension/background/app_log_storage.ts');
        const trim = src.split('private async trim_if_needed')[1] ?? '';
        expect(trim).toMatch(/_estimated_bytes = Math\.max\(0, total_bytes - freed\)/);
    });
});

describe('t193 AC-002: captures.list 不再全量读取后二次排序 slice', () => {
    it('storage list_captures 支持 offset 下推（cursor.advance）', () => {
        const src = read('src/extension/background/storage.ts');
        const fn = src.split('export async function list_captures')[1] ?? '';
        expect(fn).toMatch(/cursor\.advance\(skip\)/);
        expect(fn).toMatch(/let skip = offset/);
    });

    it('dispatcher 传 offset 且不再 slice（limit 直接截断）', () => {
        const src = read('src/extension/background/agent_command_dispatcher.ts');
        const fn = src.split('async function list_captures')[1] ?? '';
        expect(fn).toMatch(/storage_list_captures\(limit, direction, offset\)/);
        expect(fn).not.toMatch(/\.slice\(offset, offset \+ limit\)/);
    });
});

describe('t193 AC-003: app log 导出显式上限 + 截断标记', () => {
    it('export_app_logs 先 count 判定截断，超限标记 truncated', () => {
        const src = read('src/extension/background/exporter.ts');
        const fn = src.split('export async function export_app_logs')[1] ?? '';
        expect(fn).toMatch(/transport\.count\(/);
        expect(fn).toMatch(/EXPORT_LIMIT = 100000/);
        expect(fn).toMatch(/\[truncated: \$\{total - EXPORT_LIMIT\} entries omitted\]/);
    });
});

describe('t193 AC-004: Dashboard 大列表 DOM 受窗口预算约束', () => {
    it('render_dt_list windowed（LIST_WINDOW 截断 + 超窗省略行）', () => {
        const src = read('src/extension/dashboard/dashboard_detail.ts');
        const fn = src.split('function render_dt_list')[1] ?? '';
        expect(fn).toMatch(/LIST_WINDOW = 500/);
        expect(fn).toMatch(/list\.slice\(0, LIST_WINDOW\)/);
        expect(fn).toMatch(/hidden \(windowed\)/);
    });
});

describe('t193 AC-005: ZIP 流式组装', () => {
    it('assemble_zip 流式组装（Zip + ZipPassThrough，无压缩 worker 竞争）', () => {
        const src = read('src/extension/shared/archive_builder.ts');
        const assemble = src.split('function assemble_zip')[1] ?? '';
        expect(assemble).toMatch(/new Zip\(/);
        expect(assemble).toMatch(/new ZipPassThrough\(entry\.name\)/);
        expect(assemble).toMatch(/file\.push\(entry\.data, true\)/);
        expect(assemble).not.toMatch(/zipSync/);
    });
});

describe('t193 AC-006: bundle size 预算门禁', () => {
    it('check_bundle_budget 脚本存在且含预算阈值', () => {
        const script = read('scripts/check_bundle_budget.mjs');
        expect(script).toMatch(/bridge\.mjs/);
        expect(script).toMatch(/mcp\.mjs/);
        expect(script).toMatch(/extension\.zip/);
        expect(script).toMatch(/artifacts\/dist/);
        expect(script).toMatch(/process\.exit\(1\)/);
    });

    it('package.json 注册 check:bundle 且 build 链尾追加', () => {
        const pkg = JSON.parse(read('package.json'));
        expect(pkg.scripts['check:bundle']).toBe('node scripts/check_bundle_budget.mjs');
        expect(pkg.scripts.build).toMatch(/check:bundle$/);
    });
});