# Task review t176（reviewer_focus: 测试）

- task：`t176_fix_output_path_contract`
- spec：`docs/tasks/t176_fix_output_path_contract/spec.md`
- diff_anchor：`9b9df37746fa4cd3279a1db8c9cb27330e5d348f`
- target：`git diff 9b9df37746fa4cd3279a1db8c9cb27330e5d348f`
- round：1
- reviewed_at：2026-08-13 20:17 UTC+8
- reviewed_scope: 55baeeed2162efd8

## Findings

### t176_test_f001 - AC-003 测试不区分新旧实现：嵌套父目录创建行为未被断言

- 严重度：important
- 锚点：AC-003（`output_path:"nested/export.json"` 父目录不存在时导出成功）
- 位置：`tests/unit/output_path_contract.test.ts:44-48`（it 'AC-003: 嵌套父目录不存在时导出成功'）
- 问题：该测试只断言 `expect(result).toBe(resolve(base, 'nested/deep/export.json'))`——断言的是 `safe_output_path` 的**返回值**。已在 `.scratch` 复刻 anchor `9b9df37` 旧版 `safe_output_path`（无 `mkdir`）实测：对同一输入（base 存在、`nested/deep` 不存在），旧实现返回**完全相同的值**、断言同样通过，且旧实现**不会**创建 `nested` 目录（实测 `nested dir created by old impl: false`）。即：
  1. 本测试在旧实现上为绿，不满足「代入旧实现会红」的归因要求；
  2. t176 修复的关键行为（`src/bridge/server.ts:921` `mkdir(dirname(resolved), { recursive: true })` 创建嵌套父目录，使写盘不再 500）**无任何断言触达**——无目录存在性断言（`stat`/`lstat`），无写盘路径驱动；若删除该行，本测试仍绿；
  3. AC-003 的 500 根因在写盘层（`writeFile` ENOENT），spec 测试策略明确要求「驱动 `safe_output_path` 与写盘路径」，本单测只驱动了前者且在该输入上行为与旧实现无异。
  对比：AC-002 测试（`tests/unit/output_path_contract.test.ts:37-42`）复刻验证旧实现抛 ENOENT（实测 `AC-002 old: REJECTED -> ENOENT`），为有效红灯；AC-003 缺失同等级有效性。
- 建议：为 AC-003 增加对修复行为的断言，二者选一即可：(a) 断言 `nested/deep` 目录被创建（`await stat(join(base, 'nested/deep'))` 成功且为目录）；或 (b) 走 bridge HTTP 层驱动显式 `output_path: 'nested/export.json'` 写盘，断言返回 200/ok、`file_path` 为绝对路径、文件内容落盘正确。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：不适用（Round 1）
- 改测方向复核：`tests/unit/export_large_fix.test.ts` 三处 `output_path` 由绝对路径改为相对路径（`/tmp/out.json` → `exports/out.json` 等）——属 spec 契约变更驱动的合法更新（范围区明确 schema 新增相对路径/拒绝绝对路径校验，旧断言语义已按 spec 移除），断言强度不变（`toBe` 精确串），且拒绝语义由新增 AC-004d 测试覆盖。无「迁就实现」的改测。
- 本轮新发现：1 条
- 未进表的提示：无
- 总体判断：AC-001/002/004/005 覆盖有效（AC-002 经复刻验证为真红灯，AC-004 拒绝边界、symlink 逃逸与 schema 拒绝均有真实断言），唯一 blocker 是 AC-003 测试不验证修复行为（旧实现同样通过）。修复建议见 f001 后再进下一轮。

### AC 复验方式

- AC-001 `re_verified`：读 `docs/guides/mcp_usage.md` 断言三连（含 `exports/session-xxx.json`、不含 `"/absolute/path/export.json"`、含「相对路径/文件名」），grep 全篇确认无其他绝对路径示例；测试运行绿。
- AC-002 `re_verified`：运行绿；在 `.scratch` 复刻旧版 `safe_output_path` 实测同输入抛 ENOENT（真红灯），新实现 `mkdir(base, {recursive:true})` 后成功返回。
- AC-003 `re_verified`：运行绿，但复刻旧实现实测同输入返回相同值（假绿灯）——见 f001，不构成 AC 通过证据。
- AC-004 `re_verified`：a（绝对路径）/ b（`..`）/ c（base 下预置 symlink 逃逸，断言 `/outside export dir/` 消息）/ d（schema `refine` 拒绝绝对路径与 `..`，合法相对路径通过）均真实断言并运行绿；t137 既有防护测试（`t137_bridge_security.test.ts`）101 tests 全绿，防护无退化。
- AC-005 `re_verified`：四类测试（默认目录不存在、合法相对路径、嵌套目录、base/parent symlink）均在 `output_path_contract.test.ts` 存在并通过；嵌套目录类有效性缺陷见 f001。
- coverage = 5 / 5

- 系统性 follow-up：无

verdict: FAIL

## Round 2 (2026-08-13 20:20 UTC+8)

### 前轮 finding 复核

- **t176_test_f001（important，AC-003 无判别力）— 已消除**。以当前 diff 核实：`tests/unit/output_path_contract.test.ts:49-51` 新增 `await stat(resolve(base, 'nested/deep'))` + `expect(st.isDirectory()).toBe(true)`。判别力验证：
  - 新实现：`src/bridge/server.ts:921` `mkdir(dirname(resolved), { recursive: true })` 真实创建 `nested/deep` → `stat` 成功、`isDirectory` 为真；
  - 旧实现（anchor `9b9df37`，无任何 mkdir）：该目录从未被创建（Round 1 `.scratch` 实测 `nested dir created by old impl: false`）→ `stat` 抛 ENOENT → 断言红。
  - 修复行为（父目录创建，即写盘层 500 的根因消除）被真实触达；断言为副作用直接验证（`stat`+`isDirectory`），非恒真/存在性敷衍，未弱化。AC-003 现为有效红灯测试。
- 处置方向核对：未发现「修成另一种弱化形式」——新增断言强度高于原返回值断言，方向正确。

### 本轮新发现

### t176_test_f002 - 未使用 import 残留（mkdir / writeFile）+ 动态导入冗余

- 严重度：minor
- 锚点：行为缺陷无；风格/清理
- 位置：`tests/unit/output_path_contract.test.ts:4,49`
- 问题：顶层静态 import 中 `mkdir`、`writeFile` 未被测试体使用（`make_export_dir` 用 `mkdtemp`、AC-004c 用 `symlink`、AC-003 用 `stat`）；AC-003 又用 `await import('node:fs/promises')` 动态导入后解构 `stat`，与顶层静态 import 冗余并存。无行为影响（vitest/esbuild 不报），纯清理项。
- 建议：删除未使用的 `mkdir`、`writeFile`；`stat` 并入顶层静态 import，去掉动态导入。

### 结论（Round 2）

- 改测方向复核：本轮仅新增 AC-003 断言，未改动任何既有断言预期；无「迁就实现」的改测。
- 前轮 blocker 状态：f001 已消除（以 diff 与旧实现行为核实，非采信处置表自称）。
- 本轮新发现：1 条（f002 minor）
- AC 复验：`npx vitest run tests/unit/output_path_contract.test.ts` 7 tests 全绿；AC-001~005 覆盖维持（AC-003 已恢复判别力，AC-002 红灯归因沿用 Round 1 复刻验证）。
- 未进表的提示：无
- 系统性 follow-up：无
reviewed_scope: 763a349cce4b3e5e

verdict: PASS
