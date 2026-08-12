# Task review t126（reviewer_focus: 测试）

- task：`t126_extract_page_script_template`
- spec：`docs/tasks/t126_extract_page_script_template/spec.md`
- diff_anchor：`77c9d91bb1fbcbf8e31ce838343a35fa16f96db8`
- target：`git diff 77c9d91bb1fbcbf8e31ce838343a35fa16f96db8`
- round：1
- reviewed_at：2026-08-12 13:23 UTC+8
reviewed_scope: 8753eb39c7b5b89c

## Findings

### t126_test_f001 - AC-001 结构断言正向断言锚定 import 而非实际调用点

- 严重度：minor
- 锚点：AC-001
- 位置：`tests/unit/content_page_script.test.ts:42-43`
- 问题：AC-001 结构断言的 `expect(src).toContain("page_script_reinstall_guard")` 与 `expect(src).toContain("page_script_preamble")` 只做子串匹配，命中 import 语句即通过（`network_hook.ts:12`、`websocket_capture.ts:6` 的 `import { page_script_reinstall_guard, page_script_preamble } from './content_page_script';` 已含该子串），无法区分「build_page_script 实际调用模板」与「import 了但未在 build_page_script 内使用」。若未来回归为 import 保留、调用移除、且旧内联模式也一并删除，本断言不会失败，AC-001 结构被违反而测试仍绿。真正起作用的是三条反向正则，正向断言实际冗余。
- 建议：正向断言改为锚定调用形式，如 `expect(src).toContain('page_script_reinstall_guard(')` 与 `expect(src).toContain('page_script_preamble(')`（或按 signal 精确断言 `page_script_reinstall_guard('network_hook',` / `('ws',`），使「被两者引用」落到调用点而非 import 行。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无（Round 1）
- 改测方向复核：无。diff 中 7 个既有受影响测试文件（network_hook_gate_behavior / network_hook_config_gate / websocket_capture / websocket_capture_page / websocket_capture_injected_script / content_hmac_vectors / dom_network_hook_event_id）均无改动，另经 grep 确认实际执行注入脚本的 `content_postmessage_nonce.test.ts` 亦未改动。无「迁就实现」式改测；测试原样保留且语义仍成立，符合 refactor 型 task 合法做法。
- 本轮新发现：1 条
- 未进表的提示：
  - `page_script_preamble` 测试 `expect(out).toContain(SYNC_HMAC_JS)`（`content_page_script.test.ts:34`）随模板 `${SYNC_HMAC_JS}` 内嵌而恒真，仅防「停止内嵌」回归，作为模板契约 smoke check 可接受，无需处理；HMAC 行为本身由既有 `content_hmac_vectors.test.ts` 逐字节锁定。
  - 新测试未直接断言 `build_page_script` 组合后的完整脚本顺序/缩进（guard→preamble 拼装正确性仅靠既有 eval 行为测试间接覆盖：`content_postmessage_nonce.test.ts` T121restart / `websocket_capture_injected_script.test.ts` p031）。组合语义经逐字节比对与旧内联输出等价，可作可选扩展项，不阻断。
- 总体判断：refactor 行为等价，既有测试零改动且断言仍匹配新生成脚本；新测试可信且对 AC-001 有真实约束，仅 1 条 minor，无 blocking。
- 系统性 follow-up：无

## AC 复验方式

- AC-001：`re_verified` — 结构测试逐文件断言 `network_hook.ts` / `websocket_capture.ts` 引用两模板函数，且三条反向正则（`/if \(window\.__capture_all_.*_installed__\)/`、`/var SIGNAL = '\$\{SIGNAL\}';/`、`/\$\{SYNC_HMAC_JS\}/`）经查证两文件实际源码均不命中；模板落点 `content_page_script.ts` 已建。
- AC-002：`re_verified` — 手工逐字比对新旧生成脚本：network_hook 仅声明顺序变化（`var CAPTURE_BODY` 移到 SECRET/SYNC_HMAC_JS 之后，var 提升无行为影响）与注释删「时」；ws 仅 `if (prev_hook)` 由单行改带花括号块（语义等价）。既有字符串断言全部仍匹配（`CAPTURE_BODY = false/true`、`clone.text()`、`var SECRET = '...';` 且不含 `window.SECRET`/`window.__capture_all_network_secret__`、`__capture_all_network_hook_installed__` 子串），eval 行为测试（还原重装 T121restart/p031、per-message HMAC 签名 T121e2e/content_hmac_vectors、nonce 动态读取 content_postmessage_nonce）依赖的生成逻辑逐行未变。证据：`src/extension/content/network_hook.ts:20-27`、`websocket_capture.ts:28-32` 与 `content_page_script.ts:10-25` 的展开结果。
- AC-003：`trust_prior` — `npm test` 全绿与 `npx tsc --noEmit` 通过需执行命令验证，review 禁跑测试；依赖实施侧产出证据（test 全绿 / tsc 通过的自述与 handoff）。

coverage = 2 / 3

建议合并前人工抽查 trust_prior 项（AC-003 占 1/3，超 30%）。

verdict: PASS
