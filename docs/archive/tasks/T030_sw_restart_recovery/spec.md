# Task spec - T030 sw_restart_recovery

## 背景

`src/extension/background/service_worker.ts:122-138` `cleanup_stale_capture_state` 读 `chrome.storage.local` 的 `is_capturing`/`current_capture`，但 `start_capture`/`stop_capture` 都不写这两个键（cleanup 是历史死代码）。MV3 SW 被回收后内存状态重置为未采集，IndexedDB 中旧 CaptureRecord 仍可能保持 `capturing`，旧内容脚本/监听器无法恢复或结束。随后可再启动新采集，违反"同一时间只允许一次活跃采集"，旧采集永久悬挂。

## 范围

代码/配置：

- `src/extension/background/service_worker.ts`：
  - `start_capture_inner` commit 后写持久化键：`active_capture_id`/`active_capture_start_ms`/`active_capture_config`/`active_capture_generation`。
  - `stop_capture_inner` 在最终清理前清空这些键。
  - `cleanup_stale_capture_state` 读新键，存在则恢复/终止旧采集（将 CaptureRecord 标 completed + ended_at + duration）。
  - 启动时先 `await cleanup_stale_capture_state()` 再处理消息（已在 setTimeout 0，改为 await onInstalled + 顶层初始化）。

测试：

- `tests/unit/service_worker_stale_cleanup.test.ts` 或扩展现有：
  - mock chrome.storage.local 返回 active_capture_id，cleanup 将对应 CaptureRecord 标 completed。
  - start_capture 成功后持久化键被写。
  - stop_capture 后持久化键被清。

文档：

- 无 blueprint 改动。

## 非范围

- 完整恢复（重新 attach debugger、重连生产者）超出范围，仅做 CaptureRecord 终态化与状态清理。

## 验收标准

- [ ] start_capture 成功后 `chrome.storage.local` 含 active_capture_id 等键。-> 验证：单测。-> 预期：set 被调。
- [ ] stop_capture 后这些键被清。-> 验证：单测。-> 预期：set null/空。
- [ ] cleanup_stale_capture_state 读到残留 active_capture_id 时将 CaptureRecord 标 completed。-> 验证：单测。-> 预期：update_capture 被调。
- [ ] `npm test` 全绿。

## 依赖与约束

- 依赖 T029 capture_state。
- 受影响业务不变量：SW 重启不丢活跃采集状态；不会重复 start。
- 无数据迁移（仅新增持久化键）。
- 无平台限制。
