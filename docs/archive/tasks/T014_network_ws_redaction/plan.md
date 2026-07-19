# Task plan - T014 network_ws_redaction

## 步骤

1. 红：扩展 `tests/unit/network_capture.test.ts` 与 `tests/unit/network_cdp.test.ts`（或新增独立 ws 测试），覆盖 WebSocket url/headers 脱敏 + status 字段。
2. 红：跑测试失败。
3. 绿：两个文件 `send_ws_connection_event` 内对 url/headers 走 redact_*，`send_ws_frame` 与 frame_error 的 url 走 redact_url。
4. 全量 npm test + tsc。
5. log + commit + 归档。

## 风险与回退

- 风险：现有 WebSocket 测试断言原 url 字面值。缓解：用 redact_data=false 保留旧行为；新增用例用 redact_data=true。
- 回退：`git revert <commit>`。
