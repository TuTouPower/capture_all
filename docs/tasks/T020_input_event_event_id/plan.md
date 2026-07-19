# Task plan - T020 input_event_event_id

## 步骤

1. 红：扩展 `tests/unit/content_event_utils.test.ts` 或新建 dom/network_hook 单测，断言事件含 `event_id` 非空。
2. 红：跑测试失败。
3. 绿：
   - `dom_capture.ts`：导入 create_content_event；start_dom_capture 接收 capture_id/capture_start_epoch_ms/tab_id；handle_input/handle_change/handle_focus/handle_blur 构造 base event 后调 sender。
   - `network_hook.ts`：同样改造，type 用 `network_request`。
   - `content_script.ts`：send_event 签名收敛，删除旧格式分支；更新两处调用。
4. 全量 `npm test` + `tsc --noEmit`。
5. log + commit + 归档。

## 风险与回退

- 风险：EventType 不含 `network_body_hook`/`input_event` 之一会导致 TS 编译失败。缓解：核对 `src/shared/types.ts` EventType 集合；如缺则用最接近的现有类型。
- 风险：调用方签名变化需同步更新。缓解：tsc 编译期捕获。
- 回退：`git revert <commit>`。
