# Task spec - T034 sw_context_clear

## 背景

`src/extension/background/service_worker.ts:554-558` stop_capture_inner 只清 `current_capture`，未清 `current_capture_id`/`start_time`/`current_config`。`get_status()` 不检查 `is_capturing` 直接返回 `{ active_capture_id: current_capture_id }`（line 1086）。停止后 Bridge 仍报告旧采集为 active，Agent 可能错误拒绝新任务、重复 stop 或把后续操作指向已完成采集。

## 范围

代码/配置：

- `src/extension/background/service_worker.ts` stop_capture_inner 在 `current_capture = null` 处同步清空 `current_capture_id`/`start_time`/`current_config`。
- `get_status()` 检查 `is_capturing`：仅 capturing/starting 返回 active id；其他返回 null。

测试：

- 扩展 `tests/unit/stop_capture.test.ts`：stop 后 current_capture_id/start_time/current_config 为初始值。
- get_status 在 stop 后返回 active_capture_id: null。

文档：

- 无 blueprint 改动。

## 非范围

- 不引入新状态字段（T029 capture_state 已有）。

## 验收标准

- [ ] stop 后 current_capture_id === null。-> 验证：单测。-> 预期：null。
- [ ] stop 后 start_time === 0。-> 验证：单测。
- [ ] stop 后 current_config === DEFAULT_CONFIG。-> 验证：单测。
- [ ] `npm test` 全绿。

## 依赖与约束

- 受影响业务不变量：Bridge 状态由采集状态机派生。
- 无数据迁移。
- 无平台限制。
