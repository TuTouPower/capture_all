# Review — 流式 / WebSocket / 子 target 全捕获

日期：2026-06-13
审查文档：
- `docs/specs/streaming_websocket_capture.md`
- `docs/specs/streaming_websocket_capture_plan.md`

---

## 结论：APPROVE（需补充 3 个 MEDIUM 风险点后可实施）

规格根因分析准确，三机制划分合理，TDD 分阶段顺序正确。无 BLOCK 项。

---

## 优点

| 项 | 说明 |
|---|---|
| 根因清晰 | "事后整体取 body" vs "持续流"的矛盾讲透，三类失效场景（SSE/WS/子target）分类完整 |
| 每帧独立 event | WS 帧拆独立 `CaptureEvent`，符合现有 append 模型，无需改写入架构 |
| 禁止 Fetch 拦截 | 明确禁止 `Fetch.requestPaused` 拦截 SSE，防挂死长连接，正确 |
| 阶段 0 先重构 | 先抽 `cdp_event_router` + `stream_buffer`，再加功能，降低集成风险 |
| 全量 TDD | 每阶段先 RED 再 GREEN，符合项目约定 |
| 默认全开 | 随 CDP body capture 启用，无新配置项，符合"全采"定位 |

---

## MEDIUM

### M1：`Network.dataReceived.data` 字段前置条件未说明

**位置**：spec §3.2 步骤 3

spec 说"开启 streaming 后 `dataReceived` 携带 `data` 字段"，但 CDP 文档中 `Network.dataReceived.data` 仅在 `Network.enable({ reportResourceContent: true })` 时才出现。spec 没提这个前置条件。

降级路径（P2）如果依赖 `dataReceived.data` 但没设该 flag，降级也会静默失效。

**修复**：§3.2 步骤 2 补充 `streamResourceContent` 成功后 `dataReceived.data` 的启用机制。降级路径需独立验证 `data` 字段可用性，或显式设 `reportResourceContent: true`。

---

### M2：流式 flush 与现有批写队列的并发协调未说明

**位置**：spec §3.2 步骤 4，plan 阶段 0.2

"每 ~1s 或 ~16KB flush 一次到 IndexedDB（增量更新 `response_body`）"意味着 `get → 拼接 → put`。IndexedDB 事务读写互斥，若主写入（事件批写）和流式 flush 同时操作同一 objectStore，会触发事务排队或死锁。

**修复**：plan 阶段 0.2 明确 `stream_buffer` 的 flush 暂存后入队到现有批写队列，由队列统一调度，保证单写者模型。spec §3.2 步骤 4 补充一句说明事务协调方式。

---

### M3：`Target.setAutoAttach` + `waitForDebuggerOnStart` 的 detach 安全阀缺失

**位置**：spec §3.4，plan 阶段 4

`waitForDebuggerOnStart: true` 让子 target 暂停在启动阶段。若用户此时打开 DevTools 触发 debugger 独占冲突，现有逻辑会 detach CDP session，但子 target 仍处于暂停状态 → worker/iframe 永久冻结，页面功能卡死。

**修复**：plan 阶段 4 增加安全阀步骤——detach 时先对所有 `attached_sessions` 发 `Runtime.runIfWaitingForDebugger`，再清理 session 状态。spec §6 补充此场景的处理说明。

---

## LOW

| # | 内容 |
|---|---|
| L1 | `WsFrameData.payload_bytes` 可在写入时计算，不必存字段，省存储 |
| L2 | 高频 WS（>100帧/s）场景可考虑 per-connection 采样上限，当前批写吸收够用，但 spec 可提及上限策略 |
| L3 | `stream_buffer` 单测应覆盖并发 safety（非仅时间/字节/force 三场景） |

---

## 验证结果

| 检查 | 结果 |
|---|---|
| 架构一致性 | Pass |
| 数据模型向后兼容 | Pass |
| TDD 覆盖设计 | Pass |
| 降级/错误处理 | Pass（P2 覆盖） |
| 安全风险 | Pass（无新暴露面） |
| 可实现性 | Pass（M1-M3 修正后） |

---

## 补充顺序

1. M1：spec §3.2 补 `data` 字段启用条件，P2 降级独立验证
2. M2：spec §3.2 + plan 阶段 0.2 补事务协调说明
3. M3：plan 阶段 4 + spec §6 补 detach 安全阀
4. 进入实施
