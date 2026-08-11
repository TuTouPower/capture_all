# Task review t096（reviewer_focus: 代码）

- task：`t096_bridge_auto_export_path`
- spec：`docs/tasks/t096_bridge_auto_export_path/spec.md`
- diff_anchor：`4fd96ee173d1d567e5e38856000df49824f30d18`
- target：`git diff 4fd96ee173d1d567e5e38856000df49824f30d18`
- round：1
- reviewed_at：2026-08-11 03:20 UTC+8

## Findings

### t096_code_f001 - 新增测试 helper 卫生问题（未用参数 + 循环内泄漏 server）

- 严重度：minor
- 锚点：行为缺陷，测试辅助代码卫生；不违反 AC
- 位置：`tests/unit/agent_bridge_server.test.ts:1873`（`run_export_with_format(format, export_dir)` 签名）、`:1917-1918`（AC-001 循环）
- 问题：
  1. `run_export_with_format` 的 `export_dir` 参数从未在函数体内使用，实际导出目录来自调用侧设置的 `process.env.CAPTURE_ALL_EXPORT_DIR`。死参数，签名误导（暗示 helper 使用传入目录）。
  2. AC-001 的 `for (const format of escapes)` 循环对 5 个逃逸样例各调一次 `run_export_with_format`，每次经 `start_test_server()`（`:1874`）新建 HTTP server 并覆写模块级 `cleanup`（`agent_bridge_server.test.ts:23`）；`afterEach`（`:169-174`）只关闭最后 1 个，前 4 个 server 泄漏。本任务前该文件为每测试单 server，循环内多次起 server 属本 diff 引入的回归。实际影响小（ephemeral 端口、进程退出即回收），但属真实卫生退化。
- 建议：helper 去掉 `export_dir` 形参；AC-001 把 server 起动移到循环外复用（单次 `run_export` 逐格式断言），或在 helper 内负责关闭自身 server。

## 结论

- 前轮 finding 复核：Round 1，无
- 本轮新发现：1 条 minor（无 critical / important）
- 未进表的提示：
  - 文件过大（降级规则，只列不进表）：`src/bridge/server.ts` 899 行（本 diff 净增 +4，达 src ≥800 important 阈值）；`tests/unit/agent_bridge_server.test.ts` 1964 行（净增 +94，达 tests ≥1200 important 阈值）。两文件均为历史累积大文件，本 task 增量小，未产生由体量直接导致的可观测缺陷。
  - 复杂度：`resolve_auto_output_path` 手算 CC≈4（2 个三元 + 1 个正则三元），低于阈值，无提示。
  - 范围外观察（不进表）：`src/bridge/server.ts:487-494` 的 `explicit_path`（`payload.output_path`）沿用原值直接写盘，属既有 MCP 契约（`src/mcp/schemas.ts:116,124` 声明 `output_path`），任务非范围已声明不改任意绝对路径导出，未在本 diff 触及；`src/extension/shared/export_settings.ts` 为扩展侧独立导出流，`normalize_download_path` 已滤 `..`，与本桥路径无关。
  - 覆盖可更广（minor，未单列）：`format: 'HAR'` 大写归一、长度 >16 回退两分支无单测；不阻断。
- 总体判断：核心变更（format 白名单 `/^[a-zA-Z0-9]{1,16}$/` + 回退 `json`、`capture_id` 净化保持）足以防 `..`/`/`/`\`/URL 编码逃逸，合法 format 不受影响，AC-001/002/003 均有实现且测试通过；仅 1 条测试 helper 卫生 minor，PASS。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`。重跑 `npx vitest run tests/unit/agent_bridge_server.test.ts -t "T096"` → 3 passed；代码路径 `server.ts:775` 对含 `..`/`/`/`\`/`%2f` 的 format 全部回退 `json`，测试断言结果路径位于 export_dir 内且 `.json` 结尾。
- AC-002：`re_verified`。同一测试运行；`server.ts:777` 对 `jsonl` 走白名单保留，测试断言精确等于 `join(export_dir, 'session-x.jsonl')`。
- AC-003：`re_verified`。同一测试运行；构造保证路径为 `join(dir, safe_id.format)`（`format` 限 `[a-z0-9]{1,16}`、`safe_id` 无路径分隔符），测试用 `realpath` 断言文件前缀等于导出目录 realpath。

coverage = 3 / 3（100%，全 `re_verified`）

reviewed_scope: 3833438285d4b9b4

verdict: PASS

## Round 2 (2026-08-11 03:26 UTC+8)

reviewed_scope: f52ebc0713b7d225

## Findings

本轮无新 finding。

## 结论

- 前轮 finding 复核：
  - t096_code_f001（minor，helper 死参数 + 循环内多 server 泄漏）：已消除。`run_export_with_format` 现仅收 `format` 形参（`tests/unit/agent_bridge_server.test.ts:1873`），`try/finally` 内 `await server.close()` 自关 server（`:1908-1910`）；AC-001 循环 5 次各起 server 均随 helper 关闭，无残留。以 diff 为准核实，非采信处置表。
- 本轮新发现：0 条
- 未进表的提示：
  - 范围外观察（不进表）：helper 关闭自身 server 后，模块级 `cleanup`（`agent_bridge_server.test.ts:23`）仍指向同一 server，`afterEach`（`:169-174`）对其二次 close。Node `server.close()` 对未监听 server 幂等无副作用，全文件 82 用例 1.61s 通过、无挂起/泄漏，不构成缺陷。
  - 文件过大（降级规则，只列不进表）：`src/bridge/server.ts` 899 行；`tests/unit/agent_bridge_server.test.ts` 1966 行。均历史累积大文件，本 task 增量小，未产生由体量直接导致的可观测缺陷。
- 总体判断：Round 1 唯一 minor 已按建议修复；`server.ts:775` 白名单为 `payload.format` 唯一读取处（`grep` 确认仅 `:494` 调用、`:771-775` 净化），AC-001/002/003 均满足。无未解决 critical/important，PASS。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`。重跑 `npx vitest run tests/unit/agent_bridge_server.test.ts -t "T096"` → 3 passed；5 个逃逸串（`..`/`/`/`\`/`%2f`）经 `server.ts:775` 白名单 `/^[a-zA-Z0-9]{1,16}$/` 全部回退 `json`，断言 `startsWith(export_dir + '/')` 且 `.json` 结尾。
- AC-002：`re_verified`。同一运行；`jsonl` 走白名单保留，断言精确等于 `join(export_dir, 'session-x.jsonl')` 且 `ok === true`。
- AC-003：`re_verified`。同一运行；realpath 前缀断言 `file_real.startsWith(dir_real + '/')`（`+ '/'` 防兄弟目录误判），构造保证 resolve 后落点恒在 dir 内。
- 附带：全文件 `npx vitest run tests/unit/agent_bridge_server.test.ts` → 82 passed，确认 helper 修复未破坏既有用例。

coverage = 3 / 3（100%，全 `re_verified`）

verdict: PASS
