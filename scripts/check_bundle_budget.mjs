// scripts/check_bundle_budget.mjs — t193 AC-006: bundle size 预算门禁。
// 构建产物大小超预算即非零退出（CI/发布前检查）。预算基于 2026-08-14 实测 + 50% 余量
// （bridge.mjs 77KB / mcp.mjs 1.1MB / extension.zip 124KB / dist 508KB）。
import { statSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const BUDGETS = [
    { path: 'artifacts/bridge/bridge.mjs', max_bytes: 200 * 1024 },
    { path: 'artifacts/mcp/mcp.mjs', max_bytes: 2 * 1024 * 1024 },
    { path: 'artifacts/extension.zip', max_bytes: 500 * 1024 },
];

const DIST_DIR = resolve(process.cwd(), 'artifacts/dist');
const DIST_MAX_BYTES = 2 * 1024 * 1024;

function dir_size(dir) {
    let total = 0;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) total += dir_size(full);
        else total += statSync(full).size;
    }
    return total;
}

let failed = false;

function check(label, size, max_bytes) {
    const ok = size <= max_bytes;
    console.log(`[bundle-budget] ${ok ? 'ok   ' : 'OVER '} ${label}: ${(size / 1024).toFixed(1)} KB / ${(max_bytes / 1024).toFixed(1)} KB`);
    if (!ok) failed = true;
}

for (const { path, max_bytes } of BUDGETS) {
    const full = resolve(process.cwd(), path);
    if (!existsSync(full)) {
        console.error(`[bundle-budget] MISSING ${path}（先运行 npm run build）`);
        failed = true;
        continue;
    }
    check(path, statSync(full).size, max_bytes);
}

if (existsSync(DIST_DIR)) {
    check('artifacts/dist/', dir_size(DIST_DIR), DIST_MAX_BYTES);
}

if (failed) {
    console.error('[bundle-budget] FAILED: bundle size over budget');
    process.exit(1);
}
console.log('[bundle-budget] PASS');
