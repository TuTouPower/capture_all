# Task review t126（reviewer_focus: 代码）

- task：`t126_extract_page_script_template`
- spec：`docs/tasks/t126_extract_page_script_template/spec.md`
- diff_anchor：`77c9d91bb1fbcbf8e31ce838343a35fa16f96db8`
- target：`git diff 77c9d91bb1fbcbf8e31ce838343a35fa16f96db8`
- round：1
- reviewed_at：2026-08-12 13:25 UTC+8

## Findings

### t126_code_f001 - spec 范围「HMAC 签名发送 post 逻辑」未按字面抽取，实现共享粒度收敛到 preamble

- 严重度：minor
- 锚点：spec 范围（契约区「范围」小节），非 AC；两处 post 函数非严格同构
- 位置：`src/extension/content/network_hook.ts:27-35`、`src/extension/content/websocket_capture.ts:51-95`、`src/extension/content/content_page_script.ts:21-25`
- 问题：spec 范围把抽取目标列为「重注入还原模板、HMAC 签名发送 post 逻辑」两类同构片段。实现只把「重注入还原守卫」抽为 `page_script_reinstall_guard`，把「SIGNAL/SECRET 声明 + SYNC_HMAC_JS」抽为 `page_script_preamble`；而 post 函数内的 HMAC 签名发送（`X.sig = sign_str(SECRET, X); window.postMessage(X, ...)`）仍各自内联。核查两处 post 并非严格同构：network_hook 就地改传入的 `data`（`data.nonce = window.__capture_all_network_nonce__` 单独赋值），websocket 构造 `payload` 字面量（nonce 内联于字面量且读 `__capture_all_ws_nonce__`），nonce 键名与 payload 形状均不同；硬抽取会引入跨模块间接层且无净行为收益。AC-001（门禁）已满足——两文件均引用共享模板、不再内联同构片段。
- 建议：判为「实现合理但 spec 范围表述过时」，处置为修订 `spec.md` 范围表述（把抽取目标收敛为「重注入还原模板 + SIGNAL/SECRET/HMAC 前置段」），或明确接受当前粒度；不需改代码。不计 FAIL。

## 结论

- 前轮 finding 复核：本轮为 Round 1，无。
- 本轮新发现：1 条 minor。
- 未进表的提示：
  - **文件过大**：无。审查范围内新建 `content_page_script.ts` 25 行；`network_hook.ts` 389 行（<400）、`websocket_capture.ts` 213 行，均未达阈值，且本 task 对两者为净减行。
  - **复杂度**：无。`page_script_reinstall_guard` / `page_script_preamble` 均为单 template literal，CC=1。
  - **范围外观察**：`src/extension/content/storage_capture.ts:28-44` 存在第三处完全同构位点（`__capture_all_storage_installed__` 重注入还原守卫 + SIGNAL/SECRET + SYNC_HMAC_JS + HMAC 签名 post，且其 post 形状与 websocket 完全一致）。属 spec 明确范围外（仅列两处），不判 finding，见系统性 follow-up。

- **AC 复验方式**：
  - AC-001 `re_verified`：代码核对 `network_hook.ts:12,24,25` 与 `websocket_capture.ts:6,31,32` 均 import/调用 `page_script_reinstall_guard`/`page_script_preamble`，内联片段已移除；`tests/unit/content_page_script.test.ts` 结构断言（正反双向）通过。模板输出经插值核对与原内联片段逐行等价（守卫区首行缩进由调用方模板字面量前缀补足，逐字节一致）。
  - AC-002 `re_verified`：重跑 `npx vitest run` 相关 5 个文件（content_page_script / websocket_capture_injected_script / network_hook_gate_behavior / content_postmessage_nonce / content_hmac_vectors）33 tests 全绿；其中 `websocket_capture_injected_script.test.ts:124-146` 覆盖重注入换新 SECRET + per-message HMAC 校验，`content_postmessage_nonce.test.ts` 覆盖 nonce 动态读取与重注入路径。
  - AC-003 `re_verified`：重跑 `npm test`（132 files / 1383 tests 全绿）与 `npx tsc --noEmit`（exit 0）。
  - coverage = 3 / 3

- 总体判断：AC-001/002/003 全部满足，注入脚本行为语义不变，仅有 1 条 minor（spec 范围表述粒度），PASS。
- 系统性 follow-up：建议新增 task `refactor: migrate storage_capture build_page_script to shared page_script template`（将 `storage_capture.ts` 迁移到 `content_page_script.ts` 共享模板；顺带评估 websocket+storage 两处 payload 字面量式 post 的签名发送是否可再抽共享辅助函数）。非阻断。

verdict: PASS

reviewed_scope: 8753eb39c7b5b89c
