// scripts/check_e2e_coverage.mjs — t194 AC-001/002: E2E discovery guard。
// 枚举 tests/e2e/**/*.spec.ts，经 `playwright test --list` 判断每文件被零个或多个项目选中；
// 零选中（孤儿）或多选中（重复）即非零退出并报出文件名。
import { readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join, relative } from 'node:path';

const root = resolve(process.cwd());
const e2e_dir = join(root, 'tests', 'e2e');

function walk_specs(dir) {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk_specs(full));
        else if (entry.name.endsWith('.spec.ts')) out.push(full);
    }
    return out;
}

let listing;
try {
    listing = execFileSync('npx', ['playwright', 'test', '--list'], { cwd: root, encoding: 'utf8', timeout: 120000 });
} catch (e) {
    console.error('[e2e-coverage] playwright --list 失败（配置/依赖问题）:', String(e.message || e).slice(0, 200));
    process.exit(1);
}

let failed = false;
for (const spec of walk_specs(e2e_dir)) {
    // t194 f001: 用相对 e2e 目录的完整路径匹配（--list 输出 "[project] › T0001/xxx.spec.ts"），
    // 防未来同名 spec 时真孤儿漏报（basename 合并计数）
    const rel = relative(e2e_dir, spec).split('\\').join('/');
    const re = new RegExp(`› ${rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(:|$)`);
    const matches = listing.split('\n').filter((l) => re.test(l));
    const count = new Set(matches.map((l) => (l.trim().match(/^\[([^\]]+)\]/) || [])[1])).size;
    const rel_root = relative(root, spec);
    if (count === 0) {
        console.error(`[e2e-coverage] ORPHAN ${rel}: 未被任何 Playwright 项目 testMatch 选中`);
        failed = true;
    } else if (count > 1) {
        console.error(`[e2e-coverage] DUP ${rel}: 被 ${count} 个项目选中（应恰好 1 个）`);
        failed = true;
    } else {
        console.log(`[e2e-coverage] ok ${rel_root}`);
    }
}

if (failed) {
    console.error('[e2e-coverage] FAILED: 存在孤儿/重复覆盖的 E2E 文件');
    process.exit(1);
}
console.log(`[e2e-coverage] PASS (${walk_specs(e2e_dir).length} spec files, all covered)`);
