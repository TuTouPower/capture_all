# Task review t127（reviewer_focus: 测试）

- task：`t127_content_capture_state_factory`
- spec：`docs/tasks/t127_content_capture_state_factory/spec.md`
- diff_anchor：`5f985fbe01996d1fd8e884075d84e847261e07d7`
- target：`git diff 5f985fbe01996d1fd8e884075d84e847261e07d7`
- round：1
- reviewed_at：2026-08-11 21:35 UTC+8

reviewed_scope: fabc439fd801a51d

## Findings

无（clean review，禁止凑数）。零 finding 的判定依据见结论。

## 结论

- 前轮 finding 复核：round 1，无前轮。
- 改测方向复核：diff 中测试目录仅新增 `tests/unit/content_capture_state.test.ts`（+64 行），**无任何既有测试文件被修改或删除**。9 模块迁移未触碰既有测试，不存在「迁就当前实现」的改测。
- 本轮新发现：0 条
- 未进表的提示：
  1. `mouse_capture` / `scroll_capture` 两模块无直接单测；`tests/unit/popup_category_capture_gates.test.ts` 对 mouse 仅做 content_script.ts 源码正则匹配，非行为覆盖。此为**既有覆盖空白**（迁移前后一致，非本 task 引入），不构成 AC 缺口。
  2. 工厂 `end()` 只复位 `is_capturing` / `send_event`，`capture_id` / `capture_start_epoch_ms` / `tab_id` getter 保留残留值。各模块 handler 均先查 `state.is_capturing` 早退、`begin` 覆盖式写入，残留值无实际危害；如需更严格复位语义可后续补用例，属「可再加 case」级，不阻断。
- 总体判断：工厂单测 5 用例真实覆盖 begin 写入 / 重复 begin 守卫 / end 复位 / 未激活 end / sender 透传，无假绿、无恒真、无弱化断言；既有 9 模块测试零改动且全绿，证迁移语义等价；全量测试与类型检查通过。

### AC 复验方式

- AC-001 `re_verified`：`grep -rn "let is_capturing\|let capture_id\|let send_event" src/extension/content/*.ts` 确认 9 个迁移模块（focus / form_submit / fullscreen / keyboard / mouse / print / resize / scroll / visibility）无重复状态变量残留；残留位点均属未迁移的 content 模块（content_script / dom_capture / websocket_capture / network_hook / clipboard_capture / storage_capture），不在 spec 9 模块范围内。
- AC-002 `re_verified`：读工厂单测用例 2（重复 begin 返回 false 且不覆盖 capture_id/sender）、用例 3（end 复位后再 begin 成功）、用例 4（未激活 end 返回 false），断言均触达工厂真实守卫/复位逻辑；既有 `focus_capture.test.ts`「重复 start 不重复注册」（spyOn addEventListener）+「stop 后不发送」覆盖行为不变。
- AC-003 `re_verified`：实际重跑 `npm test` → 130 files / 1373 tests 全绿；`npx tsc --noEmit` exit 0。

coverage = 3 / 3

### 系统性 follow-up

- 无。

verdict: PASS
