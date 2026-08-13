# Task review t187（reviewer_focus: 测试）

- task：`t187_refactor_mcp_bridge_token_dep`
- spec：`docs/tasks/t187_refactor_mcp_bridge_token_dep/spec.md`
- diff_anchor：`92c143d19fe6790da64c5bf4b132f83de85fb037`
- target：`git diff 92c143d19fe6790da64c5bf4b132f83de85fb037`
- round：1
- reviewed_at：2026-08-14 00:10 UTC+8
reviewed_scope: fec1497babd0dae5

## Findings

### t187_test_f001 - import 边界扫描只匹配 `from '...'` 形态，旁路 import/动态 import/require 漏网

- 严重度：minor
- 锚点：AC-003（当前树无违规，测试不失效；属扫描器覆盖不完整）
- 位置：`tests/unit/import_boundaries.test.ts:53`
- 问题：`cross_product_imports()` 的正则 `/from\s+['"]([^'"]+)['"]/g` 只捕获 `from '...'` 与 `export ... from '...'`。已用 node 内存复现确认三种 import 形态无法被捕获：副作用导入 `import '../bridge/config'`、动态导入 `import('../bridge/config')`、`require('../bridge/config')`——三者均构成跨产品导入但扫描静默放行。当前树经 `grep -rnE` 确认无任何非 `from` 形态的跨产品导入（验证命令：`grep -rnE "^import '[^']*(extension|bridge|mcp)/|require\(...|import\(..." src/` 结果为空），故 AC-003 现有效；这是未来回归防护缺口，非当前违规。
- 建议：正则扩展为同时匹配 `import\s*['"]...`、`import\(['"]...`、`require\(['"]...` 三种形态（或对内容做多模式扫描）。

### t187_test_f002 - it 标题声称校验 shared 与 node_shared 两层，实际断言只覆盖 shared

- 严重度：minor
- 锚点：无 AC 违反；测试名与断言不一致，误导读者
- 位置：`tests/unit/import_boundaries.test.ts:79-88`
- 问题：it 标题「src/shared 与 src/node_shared 不含 Node API 引用（浏览器 bundle 安全）」，但循环体 `if (layer === 'shared')` 使 node_shared 迭代被跳过；`src/node_shared/bridge_token_file.ts` 实际含 `node:fs/promises`（第 4 行），断言本就不该覆盖它。标题与断言面不一致，未来读者可能误以为 node_shared 已被验证为无 Node API。内联注释已说明意图，行为正确，仅命名误导。
- 建议：标题改为「src/shared 不含 Node API 引用」或将 node_shared 从循环中移除以保持名称与断言一致。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无（Round 1）
- 改测方向复核：无。diff 未修改任何既有测试文件（`agent_bridge_config.test.ts`、`mcp_token_fallback.test.ts` 零改动），仅新增 `import_boundaries.test.ts`；不存在「把旧测试预期改成新实现输出」的迁就实现改测。
- 本轮新发现：2 条（均 minor）
- 未进表的提示：AC-002 的「Bridge config 亦依赖中立模块」方向未被测试直接钉住（测试 2 只断言 MCP 侧 import 指向 node_shared；若将来有人把 token 逻辑内联回 bridge/config 而不经 node_shared，既有测试与 import-boundary 测试都不会报警——因为 node_shared 非产品目录，bridge/config 不含跨产品导入即合法）。当前代码经查证 bridge/config.ts 以 re-export 方式依赖 node_shared，结构正确；可选在测试 2 中补一条断言钉住。属「可加 case」扩展，不阻断。
- 总体判断：新增测试直接扫描真实源码树（非 mock），断言为行为断言（violations 全等空），无危险模式命中；AC-001/002/003/004 均有测试覆盖并复验通过，2 条 minor 不阻断。
- 系统性 follow-up：无

### AC 复验披露

- AC-001（MCP 不从 `src/bridge` 导入任何符号，token 逻辑经中立模块获得）：`re_verified` —— `git diff` 显示 `src/mcp/token_resolver.ts:1-2` 改从 `../node_shared/bridge_token_file` 导入；独立 grep `src/` 确认 mcp 目录无任何 bridge 导入；`import_boundaries.test.ts` 测试 2 断言 `mcp_violations` 为空。
- AC-002（Bridge config 与 MCP resolver 均依赖中立模块，token 文件格式/读取行为不变）：`re_verified` —— 代码查证 `src/bridge/config.ts:4-17` 从 `../node_shared/bridge_token_file` 导入并 re-export（导出面保持）；`tests/unit/agent_bridge_config.test.ts`（25 用例，含 default_token_file_path 三分支 / persist / load 行为）与 `mcp_token_fallback.test.ts`（5 用例）原样通过。
- AC-003（import-boundary 测试拒绝产品间互相导入）：`re_verified` —— 新文件 4 项测试全部通过；正则捕获能力用 node 内存脚本独立验证（`from` 形态可捕获，旁路形态见 f001）；当前树 grep 无跨产品导入。
- AC-004（既有 MCP token fallback 与 Bridge config 测试通过）：`re_verified` —— 独立执行 `npx vitest run`：192 文件 / 1821 用例全部通过（含目标两个测试文件 34 用例）。

coverage = 4 / 4

verdict: PASS

## Round 2 复核 (2026-08-14 00:15 UTC+8)

- 前轮 finding 复核（以 diff 与代码为准）：
  - t187_test_f001：已消除。`tests/unit/import_boundaries.test.ts:53` 正则扩展为 `(?:from\s+|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]`，`while` 循环内以 `m[1] ?? m[2]` 取值。已用 node 逐形态独立复验（每 case 新正则，避免 lastIndex 残留）：from 导入、副作用 `import '../x'`、动态 `import('x')`、`require('x')`、`export ... from`、type-only 六种形态全部捕获。处置充分。
  - t187_test_f002：已消除。`tests/unit/import_boundaries.test.ts:81` 标题改为「src/shared 不含 Node API 引用（浏览器 bundle 安全；node_shared 为 Node-only 层允许）」，循环范围收窄为仅 `walk_ts_files(join(src, 'shared'))`，标题与断言面一致。
- 改测方向复核：无（仍只改新增测试文件，未触碰既有测试）。
- 本轮新发现：0 条
- 未进表的提示：无
- 总体判断：f001 处置未弱化为其他形式（正则从单一 `from` 形态扩展为全覆盖，未删除/反转任何断言），f002 命名与断言一致；复验命令：`npx vitest run tests/unit/import_boundaries.test.ts` 4 用例全绿，`npx tsc --noEmit` exit 0。无未解决 blocking。

verdict: PASS
reviewed_scope: 670d388755d246cd
