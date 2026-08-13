# Task review t194（reviewer_focus: 测试）

- task：`t194_ci_e2e_project_coverage`
- spec：`docs/tasks/t194_ci_e2e_project_coverage/spec.md`
- diff_anchor：`18f891abc7c72cc0b9692d72513d28a784ca3e4a`
- target：`git diff 18f891abc7c72cc0b9692d72513d28a784ca3e4a`
- round：1
- reviewed_at：2026-08-14 02:15 UTC+8

## 审查说明

- 工作区状态：t194 分支基于 `18f891a`，实现尚未提交；`scripts/check_e2e_coverage.mjs` 为 untracked 文件（`git status` 中 `??`），但它被 `package.json` 新脚本 `check:e2e-coverage` 引用、被新增测试真实执行，是本次任务核心产物，一并纳入审查。
- 复验命令（全部真实执行，非仅读代码）：
  - `node scripts/check_e2e_coverage.mjs` → `PASS (37 spec files, all covered)`，exit 0
  - 临时创建 `tests/e2e/e2e-orphan-guard-test.spec.ts` 再跑 guard → `ORPHAN tests/e2e/e2e-orphan-guard-test.spec.ts` + `FAILED`，exit 1（验证后已清理）
  - `npx vitest run tests/unit/e2e_project_coverage.test.ts tests/unit/open_source_automation.test.ts` → 20/20 passed
- 手工核对 37 个 spec 的项目归属：根目录 35 个 `.spec.ts`（e2e 1 + e2e-ext 23 + e2e-real 1 + e2e-cdp-capture 1 + e2e-mcp 1 + e2e-p1 6 + e2e-streaming 2 = 35），加子目录 2 个（`T0001/zoom-slider.spec.ts` → e2e-t0001、`T0003/nav-settings.spec.ts` → e2e-t0003），总计 37，与 guard 输出一致；`tests/e2e/T0002/e2e-final-t0002.cjs` 非 `.spec.ts`，不在 AC-001 范围，正确排除。

## Findings

### t194_test_f001 - AC-001 测试硬编码 spec 文件数 37（快照断言）

- 严重度：minor
- 锚点：AC-001（覆盖完整但断言脆弱）
- 位置：`tests/unit/e2e_project_coverage.test.ts:19`
- 问题：`expect(out).toMatch(/PASS \(37 spec files, all covered\)/)` 把当前文件数 37 写死进断言。guard 输出数字由自身枚举决定，AC-001 的语义是「每个文件至少被一个项目选中」而非「恰好 37 个」；未来任何新增/删除 spec 都会让该测试无条件变红，需同步手改数字。测试仍验证了真实行为（非恒真），仅属快照式断言脆弱性。
- 建议：断言 `PASS \(` 前缀 + 数字与独立枚举（如 `walk` 计数或 `readdir` 数 `.spec.ts`）一致性，不绑定具体值；或保留 37 但加注释说明更新时机。

### t194_test_f002 - AC-003 反向断言正则无 m flag，防旧命令回归能力失效

- 严重度：minor
- 锚点：AC-003（正向断言已覆盖实质，此条仅影响防回归强度）
- 位置：`tests/unit/e2e_project_coverage.test.ts:59`
- 问题：`expect(e2e_job).not.toMatch(/npm run test:e2e\s*$/)` 未带 `m` flag，JS 正则 `$` 只锚定整个输入末尾（此处文本以 `xvfb-run -a npm run test:e2e:all\n` 结尾，`test:e2e` 后跟 `:all`，恒不匹配），因此若 ci.yml 命令序列**中间**残留旧 `- run: npm run test:e2e` 行（与 `test:e2e:all` 并存），该反向断言不会失败，测试仍 PASS。AC-003 的核心（CI 跑 `test:e2e:all` 全项目集）由 `toMatch(/xvfb-run -a npm run test:e2e:all/)` 正向断言保证，故不阻断。
- 建议：改用 `not.toContain('npm run test:e2e\n')`、逐行断言命令序列（`toEqual` 数组），或正则加 `m` flag 并写 `^\s*- run: npm run test:e2e\s*$`。

### t194_test_f003 - guard 的 DUP（多项目选中）分支无测试覆盖

- 严重度：minor
- 锚点：spec 范围段「任何文件被零个项目选中（或意外被多项目选中）则失败」（非 AC 编号项）
- 位置：`scripts/check_e2e_coverage.mjs:40-42`（实现存在），`tests/unit/e2e_project_coverage.test.ts`（仅测 ORPHAN 分支）
- 问题：spec 范围明确要求「意外被多项目选中」时 guard 失败并报文件名，实现已含 `count > 1 → DUP + exit(1)`，但测试只覆盖零选中（AC-002 孤儿路径），DUP 分支无任何测试；若未来配置改动引入多项目命中（如 `testDir` 与根目录 `testMatch` 重叠），guard 会正确拦截但无人回归保护。当前配置实测无 DUP（guard 输出全部 `ok`），非现网缺陷。
- 建议：仿照 AC-002 测试补一个临时 DUP 场景（如临时让 `e2e-real.spec.ts` 同时匹配进两个项目）断言 exit 非 0 且输出含 DUP 与文件名，测后还原。

## 结论

- 前轮 finding 复核：Round 1，无
- 改测方向复核：无「迁就实现」改测。`tests/unit/open_source_automation.test.ts:119-126` 将 `e2e_commands` 从 `['npm ci', 'npx playwright install --with-deps chromium', 'npm run test:e2e']` 更新为含 `build` / `check:e2e-coverage` / `xvfb-run test:e2e:all` 的精确数组断言，与 `ci.yml` 实际步骤逐一对应，是 AC-003 应有预期的体现，非实现驱动测试。
- 本轮新发现：3 条（全 minor）
- 未进表的提示：
  - 孤儿测试（`e2e_project_coverage.test.ts:32-49`）在工作区 `tests/e2e/` 写临时文件、靠 `finally` 清理；与 AC-001 测试同文件，依赖 vitest 默认同文件串行 + 声明顺序（`vitest.config.ts` 无 `sequence.shuffle`），当前无竞态，但若未来开启 shuffle/并发会互相污染，可考虑临时文件写 `.scratch/` 或 `os.tmpdir()`。
  - CI e2e job 中显式 `npm run build` 与 webServer `serve:e2e`（= `npm run build && vite preview`）在 CI 上重复构建一次，幂等无害，属可选优化。
  - `open_source_automation.test.ts:99` 测试名「separate quality and base E2E jobs」在 e2e job 改为全项目集后轻微过时，非功能问题。
  - `playwright.config.ts:49` e2e-ext `testMatch` 以追加枚举方式接入 7 个新文件而非通配重构，未来新增 spec 不在列表会被 guard 报 ORPHAN（有 guard 兜底，行为正确）。
  - guard（`check_e2e_coverage.mjs:31-35`）按 base 文件名统计项目命中数：若未来两个不同子目录出现同名 spec（如 `T0001/foo.spec.ts` 与 `T0003/foo.spec.ts`），计数会混淆。当前文件无重名，不触发。
  - CI `timeout-minutes: 15 → 30` 为容纳全项目集（xvfb headed + 构建），有正当理由，不属阈值掩盖。
- 总体判断：AC-001/002/004 由真实运行验证（guard 实测 PASS、孤儿实测失败并报文件名、package.json 断言），AC-003 按可测试性声明以 ci.yml 静态检查覆盖；无未解决 critical/important，3 条 minor 不阻断。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified` — 实际运行 `node scripts/check_e2e_coverage.mjs`，输出 `PASS (37 spec files, all covered)` exit 0；手工核对 37 文件项目归属无孤儿无重复。
- AC-002：`re_verified` — 实际创建 `e2e-orphan-guard-test.spec.ts` 后运行 guard，exit 1 且输出 `ORPHAN tests/e2e/e2e-orphan-guard-test.spec.ts`（已清理）；测试自身亦为真实创建+失败断言。
- AC-003：`trust_prior` — `[deploy]` 项，需真实 GitHub Actions 环境验证；本地仅复验 `ci.yml` 内容（build + check:e2e-coverage + `xvfb-run -a npm run test:e2e:all`、无残留单项目命令），真实 CI 运行结果依赖实施侧后续 CI 反馈。
- AC-004：`re_verified` — 本人读 `package.json`：`test:e2e:all = playwright test`（全项目）、`test:e2e = playwright test --project=e2e`，与测试断言一致。

coverage = 3 / 4

reviewed_scope: 4579c95cf8e7067e

verdict: PASS

## Round 2 复核 (2026-08-14 02:22 UTC+8)

前轮 finding 复核（以当前工作区 diff 与代码为准，不采信处置表自述）：

- **f001（minor）— 已修，处置充分**：`tests/unit/e2e_project_coverage.test.ts:19-26` 以 `count_specs` 独立递归枚举 `tests/e2e` 下 `.spec.ts` 数，断言 `[e2e-coverage] PASS` 与 `(N spec files, all covered)` 与枚举数一致，不再硬编码 37。guard 输出 PASS 行自身亦由 `walk_specs(e2e_dir).length` 生成，两处同构；若 guard 报 FAILED 则 `PASS` 断言不成立。无弱化（`toContain` 仍锚定完整 PASS 行与具体数字）。
- **f002（minor）— 已修，处置充分**：`tests/unit/e2e_project_coverage.test.ts:66` 反向断言正则加 `m` flag。独立语义验证：构造含中间残留 `- run: npm run test:e2e` 的 ci 文本，旧写法（无 m）不命中（false），新写法命中（true）→ `not.toMatch` 会失败，防回归真实生效；当前 `ci.yml` 无命中，测试通过。未换成别的弱化形式。
- **f003（minor）— 确认，可接受**：guard DUP 分支保留（`scripts/check_e2e_coverage.mjs:41-43`，`count > 1 → DUP + exit 1`），当前配置实测输出全部 `ok` 无 DUP；未补 DUP 回归测试，task.md 处置表以「已修（保留并说明）」登记。原 finding 即 minor、现网无缺陷，DUP 行为由 guard 实现保证，不阻断。另：guard 在 code review 轮已升级为相对 e2e 目录完整路径匹配（`check_e2e_coverage.mjs:31-34`），顺带消除了 Round 1 结论提示中「跨子目录同名 spec 按 basename 合并计数」的误判风险，该风险现由实现修复。

改测方向复核：无（本 task 测试侧改动为新增 + f001/f002 处置，无迁就实现的改测）。

本轮新发现：0 条。

复验命令结果：
- `npx vitest run tests/unit/e2e_project_coverage.test.ts` → 5/5 passed（含孤儿场景真实 ORPHAN + exit 非 0 断言）
- `npx tsc --noEmit` → exit 0
- 危险模式扫描：无恒真/弱化/删断言/skip/only/ts-ignore 新增项

总体判断：f001/f002 处置充分，f003 属 minor 遗留且行为由实现保证；无未解决 critical/important，verdict PASS。

reviewed_scope: 082d50bfae7b5800

verdict: PASS
