# 实施计划 — 流式 / WebSocket / 子 target 全捕获

关联 spec：`docs/specs/streaming_websocket_capture.md`
方法：TDD（每步先写测试）。文件 `src/extension/background/network_capture.ts` 已 968 行，按 spec §3 拆分。

---

## 阶段 0 — 重构准备（解耦）

`network_capture.ts` 过大，新增三机制前先抽离，便于隔离测试。

- 步骤 0.1：抽 `cdp_event_router`（session 路由 + handler 分派），主 target sessionId 为空。
  - 验证：现有 vitest 全绿，行为不变。
- 步骤 0.2：抽 `stream_buffer`（节流 flush 工具：时间/字节阈值 + force flush）。
  - **事务协调（M2）**：flush 不直接 `get→拼接→put` IndexedDB，而是把增量入队到现有事件批写队列，由队列统一调度，保证单写者模型，避免与事件批写在同一 objectStore 上事务排队/死锁。
  - 验证：单测覆盖阈值触发 + 终态 flush + 并发 safety（多 chunk 与 force flush 交错，L3）。

---

## 阶段 1 — P0：WebSocket 帧

- 步骤 1.1：types.ts 加 `ws_frame` EventType、`WsFrameData`、`NetworkRequestData.ws_*` 字段、`capture_method: cdp_websocket`。
  - 验证：`npm run build` 类型通过。
- 步骤 1.2：先写单测 — 喂 7 个 webSocket* 事件 mock，断言产出 connection record + 逐帧 ws_frame。（RED）
- 步骤 1.3：实现 7 个 `webSocket*` 分支于 router；payload 受 max_body_capture_bytes 截断。（GREEN）
- 步骤 1.4：E2E — WebSocket echo 页，验证 sent/received 全捕获。
  - 验证：`npm run test:e2e -- --project=e2e-p0`。

---

## 阶段 2 — P0：SSE / 流式 body

- 步骤 2.1：先写单测 — 流式判定函数（event-stream / chunked-no-CL / 普通）。（RED）
- 步骤 2.2：实现流式判定 + `responseReceived` 触发 `streamResourceContent`。（GREEN）
- 步骤 2.3：先写单测 — dataReceived 多块 → 节流 flush + 终态强制 flush，status 流转 streaming→captured。（RED）
- 步骤 2.4：接 stream_buffer，增量写 response_body；移除现有 SSE skip。（GREEN）
- 步骤 2.5：types.ts 加 `response_body_status: streaming|partial`、`stream_mode`、`capture_method: cdp_stream`。
- 步骤 2.6：E2E — SSE 页，验证完整 body 重组无丢失。
  - 验证：`npm run test:e2e -- --project=e2e-p0`。

---

## 阶段 3 — P1：大 body buffer

- 步骤 3.1：`Network.enable` 传 maxResourceBufferSize / maxTotalBufferSize（含子 target）。
  - 验证：大响应 E2E 不再 cdp_failed。

---

## 阶段 4 — P1：子 target（worker / iframe）

- 步骤 4.1：先写单测 — 带 sessionId 事件经 router 正确归属。（RED）
- 步骤 4.2：`enable_response_body_capture` 加 `Target.setAutoAttach({autoAttach,waitForDebuggerOnStart,flatten})`。
- 步骤 4.3：`attachedToTarget` → 子 session `Network.enable` + `runIfWaitingForDebugger`；维护 `attached_sessions`。
- 步骤 4.4：`detachedFromTarget` → 清理累积态。
- 步骤 4.4b：**detach 安全阀（M3）** — CDP 整体 detach（如 DevTools 冲突）前，先对所有 `attached_sessions` 发 `Runtime.runIfWaitingForDebugger`，再清理，避免 `waitForDebuggerOnStart` 暂停的子 target 永久冻结。单测覆盖该路径。
- 步骤 4.5：handler 过滤改 `(tabId, sessionId)` 路由（替换 `source.tabId === dbg_tab_id` 单判定）。（GREEN）
- 步骤 4.6：E2E — worker fetch 页，验证子 target 请求被采集。
  - 验证：`npm run test:e2e`。

---

## 阶段 5 — P2：降级

- 步骤 5.1：先写单测 — streamResourceContent 抛错 → partial + capture_error(recoverable, fallback_used)。（RED）
- 步骤 5.2：版本探测 + try/catch 降级到 dataReceived 累积。（GREEN）

---

## 阶段 6 — 收尾

- 步骤 6.1：`npm test` + 全量 E2E 绿，覆盖率 ≥ 80%。
- 步骤 6.2：更新 `docs/specs/data_model.md`、`data_flow.md`、`docs/TASKS.md`（标缺陷已修）。
- 步骤 6.3：code review（network/security/typescript reviewer）。
- 步骤 6.4：提交。

---

## 风险

- `streamResourceContent` 版本依赖 → 阶段 5 降级兜底。
- DevTools 独占冲突 → 复用现有 detach 重连，阶段 4 扩展到子 session 清理。
- WS 帧风暴写压力 → stream_buffer 批写吸收，必要时阶段 1 后做性能基准。
