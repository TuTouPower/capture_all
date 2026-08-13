# Task review t194（reviewer_focus: 代码）

- task：`t194_ci_e2e_project_coverage`
- spec：`docs/tasks/t194_ci_e2e_project_coverage/spec.md`
- diff_anchor：`18f891abc7c72cc0b9692d72513d28a784ca3e4a`
- target：`git diff 18f891abc7c72cc0b9692d72513d28a784ca3e4a`
- round：1
- reviewed_at：2026-08-14 02:15 UTC+8

## Findings

### t194_code_f001 - guard 按文件名匹配 `--list` 输出，同名 spec 场景会漏报孤儿

- 严重度：minor
- 锚点：行为缺陷（未来场景）——AC-001/002 的 guard 解析脆弱性
- 位置：`scripts/check_e2e_coverage.mjs:31-35`
- 问题：guard 对每个 spec 取 `base`（仅文件名，`split(/[\\/]/).pop()`），用正则 `› .*${base}(:|$)` 在 `playwright test --list` 输出中按文件名计数项目数。当前 `tests/e2e/**` 37 个文件无同名，实测 PASS（37 files, all covered），不误报。但 `--list` 输出路径是相对 cwd（实测 `[e2e] › e2e.spec.ts:...`、`[e2e-t0001] › T0001/zoom-slider.spec.ts:...`），guard 丢弃目录信息只按文件名匹配。`tests/e2e` 已含子目录（`T0001/`、`T0003/`），未来若新增子目录且与根层文件同名（如 `T0001/e2e-capture-baidu.spec.ts`），同名两文件的测试行会合并计数：若其中一个真孤儿而另一个被项目选中，count≥1 → 孤儿漏报，guard 应失败却 PASS。当前不可触发，属解析逻辑固有脆弱点。
- 建议：用 spec 相对路径而非 base 匹配 `--list` 行（如 `relative(e2e_dir, spec)` 与行内路径段匹配），或在 `--list` 输出中取 `›` 后路径段与 spec 相对路径比对；同时保留文件名报错可读性。

### t194_code_f002 - AC-001 单测硬编码 spec 文件数 37，与 guard 输出耦合导致虚假失败

- 严重度：minor
- 锚点：测试脆弱断言（AC-001 覆盖）
- 位置：`tests/unit/e2e_project_coverage.test.ts:17`
- 问题：`expect(out).toMatch(/PASS \(37 spec files, all covered\)/)` 将 37 硬编码进断言。guard 输出 `PASS (${walk_specs(e2e_dir).length} spec files, all covered)` 是真实枚举结果——未来新增/删除任一 spec（即使 glob 与 guard 全部正确同步更新），guard 输出变为 38，该测试无条件红，需人工同步测试内字符串。断言与实际文件数耦合，制造与 guard 正确性无关的虚假失败。
- 建议：断言 `/PASS \(\d+ spec files, all covered\)/` 保留"guard 自检通过"语义；文件数准确性由 guard 内部 walk 枚举 + AC-002 孤儿场景覆盖，无需在测试中复制常量。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
  - 文件过大：无超阈值文件（guard 52 行、`e2e_project_coverage.test.ts` 70 行、`playwright.config.ts` 143 行，均远低于 400/600 阈值）。
  - 复杂度：无 ≥10 函数；guard 主循环为单层遍历，无嵌套分支。
  - 范围外观察：`scripts/check_e2e_coverage.mjs:52` 与循环内重复调用 `walk_specs`（DRY 微瑕，可复用循环计数，无行为影响）；CI e2e job `npm run build` 与 webServer `serve:e2e`（内部再 `npm run build && vite preview`）重复构建，属效率冗余非正确性问题；AC-003 真实 CI 全项目运行结果 [deploy] 无法本地自证，是否稳定待 CI 实测，spec 风险段已备回退方案。
- 总体判断：AC-001/002/004 实现与实测均正确（guard PASS 37 全覆盖、孤儿 exit 1 报文件名、`test:e2e:all`=全项目），AC-003 CI 静态结构正确且 xvfb 方案按 spec 已核实结论；仅 2 条 minor，无未解决 critical / important，可 PASS。
- 系统性 follow-up：无（guard 同名解析脆弱性暂不构成独立 task；若未来引入 `tests/e2e` 子目录同名文件可随 F001 处置）。无

### AC 复验方式

- AC-001 `re_verified`：实际运行 `node scripts/check_e2e_coverage.mjs` → PASS（37 spec files, all covered），无 ORPHAN/DUP；`playwright.config.ts` e2e-ext glob 新增 7 文件与既有项目无重复（`--list` 实测各文件恰一个项目）。
- AC-002 `re_verified`：手动写入孤儿 `tests/e2e/e2e-orphan-guard-test.spec.ts` 后运行 guard → 输出 `ORPHAN tests/e2e/e2e-orphan-guard-test.spec.ts` 且 exit=1，清理后恢复 PASS；单测同场景全绿。
- AC-003 `trust_prior`：`[deploy]` 真实 CI 运行无法本地自证；依赖证据：spec 上下文区 xvfb-run 本地核实结论（2026-08-14）、ci.yml 静态结构（build → check:e2e-coverage → `xvfb-run -a npm run test:e2e:all`）、`tests/unit/open_source_automation.test.ts` 对 workflow 命令的镜像断言（实测全绿）、`e2e-helpers.ts:49` 经 `--load-extension=artifacts/dist` 加载、CI build 先行产出该目录。
- AC-004 `re_verified`：`package.json` `test:e2e:all` = `playwright test`（全项目）、`test:e2e` = `playwright test --project=e2e`；guard 保证全文件入项目。
- 覆盖率：`coverage = 3 / 4`（re_verified 75%，trust_prior 25% ≤ 30%）

reviewed_scope: 4579c95cf8e7067e

verdict: PASS

## Round 2 复核 (2026-08-14 02:21 UTC+8)

### 前轮 finding 复核（以 diff 为准）

- **t194_code_f001：已消除。** `scripts/check_e2e_coverage.mjs:33-34` 改用 `relative(e2e_dir, spec)` 全路径（`split('\\').join('/')` 统一分隔符）构造正则 `› ${rel}(:|$)`，不再按 basename 合并计数——同名 spec 场景下真孤儿（count=0）不再被同名被选中文件的行掩盖。实测 `--list` 输出 `[project] › e2e.spec.ts` / `[e2e-t0001] › T0001/zoom-slider.spec.ts`（相对 cwd）与 `relative(e2e_dir, spec)` 完全对齐：guard 实跑 PASS（37 spec files, all covered），无 ORPHAN/DUP 误报，证明新匹配路径成立。
- **t194_code_f002：已消除。** `tests/unit/e2e_project_coverage.test.ts:20-26` 改为 `count_specs` 独立递归枚举统计 spec 数，断言 `[e2e-coverage] PASS` + `(${expected} spec files, all covered)` 动态匹配，不再硬编码 37；同时保留 `not.toMatch(/ORPHAN|DUP/)`。AC-003 测试另加固 `m` flag（`:66`），无新问题。
- 附带观察（非 finding）：AC-001 测试标题仍写「当前 37 个 spec」，纯描述性文本不影响断言语义。

### 本轮复验命令（均实跑）

- `node scripts/check_e2e_coverage.mjs` → `PASS (37 spec files, all covered)`，exit=0
- `npx vitest run tests/unit/e2e_project_coverage.test.ts` → 5 tests passed（含 AC-002 孤儿场景：guard 报 `ORPHAN e2e-orphan-guard-test.spec.ts` 且 exit≠0，测后清理）
- `npx tsc --noEmit` → exit=0

### 本轮新发现

0 条。处置未引入新问题（正则去 `.*` 前缀后 37 文件全部匹配、DUP 判定路径不变、测试动态断言与 guard 枚举语义一致）。

### 结论

- 前轮 2 条 minor 均已充分处置，未发现新 blocker；无未解决 critical / important。
- 系统性 follow-up：无。

verdict: PASS

reviewed_scope: 082d50bfae7b5800
