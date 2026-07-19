# Task spec - T023 cdp_state_cleanup

## 背景

`src/extension/background/cdp_handler.ts` 三处状态泄漏：

1. `cdp_primary_emitted` (line 30, 352, 375, 422, 454)：只 `add` 从未 `delete` 或读取，纯无用 Set 永久增长。
2. `finished_before_stream` (line 333)：`handle_loading_finished` 每次都 `add`，正常请求完成后清理 `cdp_request_meta` 却不清理 `finished_before_stream`，长采集期间线性增长；request ID 重用时还可能误判新请求已 finished。
3. `schedule_orphan_check` 用裸 `setTimeout` 不保存句柄；停止或切换 capture 后旧 timer 继续存活，回调读取 state 中当前数据可能进入新 capture 上下文（与 T022 修复前的 sessionId 隔离不全配套）。

## 范围

代码/配置：

- `src/extension/background/cdp_handler.ts`：
  - 删除 `cdp_primary_emitted` Set 及所有引用。
  - `handle_loading_finished` 完成 emit 并 `cdp_request_meta.delete` 后，同步 `finished_before_stream.delete(req_key)`。
  - `CdpHandlerState` 加 `orphan_timers: Map<string, ReturnType<typeof setTimeout>>`；`schedule_orphan_check` 保存句柄，回调内 `delete`；新增 `clear_orphan_timers(state)` 在 stop/reset 时清所有 timer。

测试：

- 新建 `tests/unit/cdp_state_cleanup.test.ts`：
  - 完成 100 个请求后 `cdp_primary_emitted` 不存在（或为空）。
  - `finished_before_stream` 在请求完成后清理，size 不无限增长。
  - orphan timer 跟踪（mock setTimeout）。

文档：

- 无 blueprint 改动。

## 非范围

- 不改 stream_buffer 清理（T024）。
- 不改 deferred timer 取消（network_context.ts MEDIUM-10 与 T025）。

## 验收标准

- [ ] 100 个请求完成后 `finished_before_stream.size === 0`。-> 验证：单测。-> 预期：0。
- [ ] `cdp_primary_emitted` 字段不存在或 Set 已删。-> 验证：grep 无引用。-> 预期：无匹配。
- [ ] orphan timer 句柄保存在 Map，回调触发后 Map 中删除。-> 验证：单测。-> 预期：fire 后 size=0。
- [ ] `npm test` 全绿。

## 依赖与约束

- 受影响业务不变量：长采集下内存稳定；停止后 timer 不残留。
- 无数据迁移。
- 无平台限制。
