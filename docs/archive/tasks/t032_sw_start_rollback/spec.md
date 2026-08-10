# Task spec - T032 sw_start_rollback

## 背景

`src/extension/background/service_worker.ts:316-476` `start_capture_inner` 仅 `create_capture()` 局部 try/catch，其后已设置全局状态并启动 keepalive/flush/network/CDP/cookie 等多个子系统。任一后续 await（`update_capture`、tab 查询、body coordinator）抛错都会让 start 消息失败但无逆序清理：监听器、debugger、timer 残留，CaptureRecord 保持 `capturing`，后续 start 被 `is_capturing` 拒绝。

## 范围

代码/配置：

- `src/extension/background/service_worker.ts`：
  - `start_capture_inner` 主体包裹 try/catch；catch 中调 `stop_capture_inner()` 逆序清理（已实现 drain 流程）。
  - catch 后 `capture_state.rollback()`（通过 begin_start handle）+ 返回失败。
  - 注意：start_capture 已在 T029 用 begin_start handle，但 inner 失败时未调 rollback。

测试：

- 扩展 `tests/unit/stop_capture.test.ts` 或新建：模拟 start 中途失败（如 start_body_capture 抛错），验证 stop_capture 被调用 + 持久化键清 + capture_state 回 idle。

文档：

- 无 blueprint 改动。

## 非范围

- 不改子系统 start 接口。
- 不改 CaptureRecord schema。

## 验收标准

- [ ] start 中途失败时 stop_capture_inner 被调用。-> 验证：单测。-> 预期：mock stop_network 被调。
- [ ] start 失败后 capture_state.phase === 'idle'。-> 验证：单测。-> 预期：'idle'。
- [ ] `npm test` 全绿。

## 依赖与约束

- 依赖 T029 capture_state、T031 stop drain。
- 受影响业务不变量：start 失败不留半启动状态。
- 无数据迁移。
- 无平台限制。
