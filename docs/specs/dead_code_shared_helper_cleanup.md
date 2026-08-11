# spec: dead_code_shared_helper_cleanup

## 背景

三处代码质量遗留（均 minor，pre-existing）：`network_capture.ts` 模块级 `cdp_primary_emitted` Set 只 add/clear 从不读取；`generate_nonce()` 在 network_hook / websocket_capture / storage_capture 三通道各一份 verbatim 实现；dashboard_detail `render_dt_rail` 的 value 转义用内联 replace 链，未复用统一 `esc` helper（少转 `>` 与 `'`）。

## 验收标准

- AC-001：全仓无 `cdp_primary_emitted` 引用残留（production、context、测试 fixture 均删除；「字段已删除」负向断言除外），现有测试全绿。
- AC-002：`generate_nonce` 收敛为单一共享实现（`src/extension/content/content_nonce.ts`），三通道均复用；nonce 语义不变（crypto.randomUUID + fallback）。
- AC-003：`render_dt_rail` 的 value 转义改用统一 `esc` helper，XSS 测试向量（含 `>`、`'`）输出与统一 helper 一致。

## 可测试性

全部 AC 可自动测试：grep 无残留 + 现有测试回归 + 转义断言。

## 测试钩子约定

`src/` 测试钩子导出须带 `_for_test` 命名约定。
