// tests/unit/e2e_project_coverage.test.ts
// t194 AC-001~004: CI E2E 项目覆盖——discovery guard 全文件覆盖、孤儿 spec 失败、
// CI release-gate 项目集、test:e2e:all 语义。

import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, rmSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';

const root = resolve(__dirname, '..', '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

describe('t194 AC-001: 全部 E2E spec 被 Playwright 项目选中', () => {
    it('discovery guard 存在且当前 37 个 spec 全覆盖（PASS）', () => {
        const script = read('scripts/check_e2e_coverage.mjs');
        expect(script).toMatch(/playwright test --list/);
        expect(script).toMatch(/ORPHAN/);
        const out = execFileSync('node', ['scripts/check_e2e_coverage.mjs'], { cwd: root, encoding: 'utf8', timeout: 120000 });
        // t194 f001: 断言数 = 独立枚举的 spec 数（不硬编码，防增删 spec 虚假失败）
        const count_specs = (dir: string): number => readdirSync(dir).reduce((n, e) => {
            const f = join(dir, e);
            return n + (statSync(f).isDirectory() ? count_specs(f) : e.endsWith('.spec.ts') ? 1 : 0);
        }, 0);
        const expected = count_specs(join(root, 'tests', 'e2e'));
        expect(out).toContain('[e2e-coverage] PASS');
        expect(out).toContain(`(${expected} spec files, all covered)`);
        expect(out).not.toMatch(/ORPHAN|DUP/);
    });

    it('playwright.config 含此前 7 个未覆盖文件（capture-baidu 等）', () => {
        const cfg = read('playwright.config.ts');
        for (const name of ['capture-baidu', 'capture-local', 'cdp-retry', 'cycle-integrity', 'export-content', 'settings-effects', 'toggle-effects']) {
            expect(cfg, name).toMatch(name);
        }
    });
});

describe('t194 AC-002: 孤儿 spec 使 guard 失败并报出文件名', () => {
    it('临时未匹配 spec → guard exit 非 0 且输出含文件名（测后清理）', () => {
        const orphan = join(root, 'tests', 'e2e', 'e2e-orphan-guard-test.spec.ts');
        writeFileSync(orphan, "import { test } from '@playwright/test';\ntest('orphan', async () => {});\n");
        try {
            let failed = false;
            let out = '';
            try {
                out = execFileSync('node', ['scripts/check_e2e_coverage.mjs'], { cwd: root, encoding: 'utf8', timeout: 120000 });
            } catch (e) {
                failed = true;
                out = String(e.stdout || '') + String(e.stderr || '');
            }
            expect(failed).toBe(true);
            expect(out).toMatch(/e2e-orphan-guard-test\.spec\.ts/);
        } finally {
            rmSync(orphan, { force: true });
        }
    });
});

describe('t194 AC-003: CI E2E job 跑 release-gate 项目集（[deploy] 真实 CI 验证）', () => {
    it('ci.yml 含 build + check:e2e-coverage + xvfb-run test:e2e:all（非仅静态 headless）', () => {
        const ci = read('.github/workflows/ci.yml');
        const e2e_job = ci.split('    e2e:')[1] ?? '';
        expect(e2e_job).toMatch(/npm run build/);
        expect(e2e_job).toMatch(/check:e2e-coverage/);
        expect(e2e_job).toMatch(/xvfb-run -a npm run test:e2e:all/);
        expect(e2e_job).not.toMatch(/npm run test:e2e\s*$/m); // f002: m flag 防命令序列中间残留
    });
});

describe('t194 AC-004: test:e2e:all 语义完整', () => {
    it('test:e2e:all = playwright test（全项目）；guard 保证全文件入项目', () => {
        const pkg = JSON.parse(read('package.json'));
        expect(pkg.scripts['test:e2e:all']).toBe('playwright test');
        expect(pkg.scripts['test:e2e']).toBe('playwright test --project=e2e');
        expect(pkg.scripts['check:e2e-coverage']).toBe('node scripts/check_e2e_coverage.mjs');
    });
});
