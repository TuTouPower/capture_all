# Task plan — T013 content_capture_privacy

## 步骤

1. 红：新增/扩展 `tests/unit/keyboard_capture.test.ts`、`tests/unit/form_submit_capture.test.ts`（如不存在则新建）、`tests/unit/storage_capture.test.ts`（已存在则补用例）覆盖 4 项验收。
2. 红：跑测试确认失败。
3. 绿：
   - keyboard_capture.ts：移除 `!is_shortcut_mode()`；提取 input.type。
   - form_submit_capture.ts：加 CaptureConfig 参数；form_action 走 redact_url。
   - storage_capture.ts：加 tab_id 参数。
   - content_script.ts：调用点更新。
4. 跑测试变绿。
5. 黑盒：`npm test`。
6. log + commit + 归档。

## 风险与回退

- 风险：现有调用方签名变更可能漏改。缓解：通过 TypeScript 编译捕获（`npm run build` 或 vitest 编译）。
- 风险：redact_url 对 form.action 为绝对/相对 URL 的行为差异（form.action 总是返回绝对 URL）。
- 回退：`git revert <commit>`。
