# Task review t187（reviewer_focus: 代码）

- task：`t187_refactor_mcp_bridge_token_dep`
- spec：`docs/tasks/t187_refactor_mcp_bridge_token_dep/spec.md`
- diff_anchor：`92c143d19fe6790da64c5bf4b132f83de85fb037`
- target：`git diff 92c143d19fe6790da64c5bf4b132f83de85fb037`
- round：1
- reviewed_at：2026-08-13 23:47 UTC+8

## Findings

### t187_code_f001 - src/node_shared/ 未跟踪（git untracked），提交时可能漏掉新模块导致构建断裂

- 严重度：minor
- 锚点：AC-001 / AC-002 的实现主体 `src/node_shared/bridge_token_file.ts` 尚未被 git 跟踪
- 位置：`src/node_shared/bridge_token_file.ts`（`git status` 显示 `?? src/node_shared/`）
- 问题：`config.ts` 与 `token_resolver.ts` 均 `import ... from '../node_shared/bridge_token_file'`，但该文件目前是 untracked，`git diff 92c143d…` 不含它。若实现者在执行 commit 时未 `git add src/node_shared/`，提交中将引用不存在的模块，合并后构建/测试立即断裂；同时 review 指纹按 `git diff` 计算，untracked 文件不在其中，提交后再 add 会改变指纹语义。文件内容本身已逐符号核对与旧实现一致，本 finding 仅指提交环节风险。
- 建议：执行 commit 前确认 `git add src/node_shared/bridge_token_file.ts` 进入本次提交，并核实提交中确实包含该文件（如 `git show --stat <commit>`）。

### t187_code_f002 - import-boundary 扫描仅匹配静态 `from '...'`，动态 import/require 跨产品引用会漏检

- 严重度：minor
- 锚点：AC-003 守卫测试的覆盖缺口；本仓库已存在动态 import 写法（`src/extension/dashboard/dashboard_settings.ts:223` 的 `await import('../shared/export_utils')`），说明该语法是活路径
- 位置：`tests/unit/import_boundaries.test.ts:53`（`/from\s+['"]([^'"]+)['"]/g`）
- 问题：`cross_product_imports()` 只扫描 `from 'x'` 静态形式；`import('../bridge/config')` 动态导入或 `require('../bridge/config')` 不会被发现。当前代码树无动态跨产品引用（已核查 `import(` 仅 2 处且目标均为 `../shared/*`），AC-003 现况成立，但守卫对未来新增的懒加载式跨产品引用会静默漏过，与「拒绝互相导入」的守卫意图不符。
- 建议：在扫描中补充 `import(` 与 `require(` 形式（或显式声明仅静态 import 受约束并在测试名/注释中说明）。

## 结论

- 前轮 finding 复核：Round 1，无。
- 本轮新发现：2 条（均 minor）。
- 未进表的提示：
  - 文件过大：无。涉及文件 `wc -l`：`src/bridge/config.ts` 170、`src/node_shared/bridge_token_file.ts` 66、`src/mcp/token_resolver.ts` 17、`tests/unit/import_boundaries.test.ts` 99，均低于阈值。
  - 复杂度：无。触及函数均无新增分支（迁移逐行等价），`load_bridge_token_file` 嵌套 try/catch 为原样搬移，估算 CC ≈ 6，未达提示阈值。
  - 范围外观察（minor 级风格，不进表）：`config.ts:5-16` 对同一模块出现 import + export 双份符号列表，轻微重复但意图清晰；`import_boundaries.test.ts:79-90` 第三用例标题称检查 shared 与 node_shared 两层的 Node API，实际断言仅作用于 `shared`（`node_shared` 循环体为空操作）；`import_boundaries.test.ts:75` 用正则硬编码具体 import 路径，未来路径重构（如加 barrel index）会误伤，属过度锁定。
- 总体判断：token 文件契约逐符号等价迁移（脚本比对 5 个符号全部 IDENTICAL），re-export 保持导出面，MCP 已无任何 bridge 导入，node_shared 层级与 architecture.md 依赖表一致，全量单测通过；仅有 2 条 minor，PASS。
- 系统性 follow-up：无。`node_shared` 中立层已写入 `docs/blueprint/architecture.md` 依赖表；import-boundary 动态导入缺口建议后续随测试硬化一并处理，无需独立 task。

### AC 复验方式

- AC-001：`re_verified`。grep 全 `src/mcp` 无任何 `../bridge` / `../extension` 导入；`src/mcp/token_resolver.ts:1-2` 改为从 `../node_shared/bridge_token_file` 导入；boundary 测试通过。
- AC-002：`re_verified`。脚本对 5 个符号（`default_token_file_path` / `TokenFileFailureReason` / `TokenFileLoadResult` / `load_bridge_token_file` / `persist_bridge_token`）逐段比对迁移前后文本全部 IDENTICAL；`src/bridge/config.ts:10-16` re-export 完整覆盖原导出面；`npx tsc --noEmit` 通过。
- AC-003：`re_verified`。阅读 `tests/unit/import_boundaries.test.ts` 并运行通过（4 tests）；逻辑覆盖 `src/{extension,bridge,mcp}` 两两互导（`product_of` / `resolve_target` 解析相对路径，静态 import 全量扫描）。
- AC-004：`re_verified`。运行 `mcp_token_fallback.test.ts`（5 pass）、`agent_bridge_config.test.ts`（25 pass，含 token 文件读写/权限/fallback 全组）、`import_boundaries.test.ts`（4 pass）；另跑全量单测 192 文件 / 1821 tests 全部通过。

coverage = 4 / 4

reviewed_scope: fec1497babd0dae5

verdict: PASS

## Round 2 (2026-08-13 23:51 UTC+8)

### 前轮 finding 复核

- **t187_code_f001**（minor，已修）：处置为 finish 后 `git add -A` 提交覆盖跟踪。当前 worktree 中 `src/node_shared/bridge_token_file.ts` 仍存在（`?? src/node_shared/`），`git add -A` 机制可完整覆盖 untracked 文件，处置方案成立。该 finding 本质是提交环节风险，最终成立需在 commit 后确认，属提交时动作，本次以处置机制合理 + 文件在树确认。已消除。
- **t187_code_f002**（minor，已修）：`tests/unit/import_boundaries.test.ts:52-53` 扫描正则扩展为四种形态：命名/type-only `from`、动态 `import('x')`、`require('x')`、副作用 `import 'x'`。独立用 node 逐样本验证 5 种导入形态（named / type-only / dynamic / require / side-effect）均被捕获且目标提取正确，`../shared/*` 仍正确放行（target 非 PRODUCTS）。未引入误报：`npx tsc --noEmit` 通过、`import_boundaries.test.ts`（4 tests）全绿。已消除。
- 顺带确认：第三用例标题已改为「src/shared 不含 Node API（node_shared 为 Node-only 层允许）」，断言面与标题一致（此前结论段提示的 loop 空转已随重构消除）。

### 本轮新发现

0 条。

### 复验

- `npx tsc --noEmit`：exit 0。
- `npx vitest run import_boundaries / mcp_token_fallback / agent_bridge_config`：34/34 通过（4 + 5 + 25）。

reviewed_scope: 670d388755d246cd

verdict: PASS
