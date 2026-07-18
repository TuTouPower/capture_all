---
status: approved
type: refactor
eval: required
---
# 提取 CaptureRuntime、StopPipeline 与 background main

## 一句话意图
把采集状态与 start/stop/ingest 行为收进 `CaptureRuntime`，把停止顺序收进 `StopPipeline`，使 background 入口只负责组装。

## 不变量（INV）
- INV-1: start、stop、flush、capture completion、debugger detach 与 Bridge teardown 既有顺序不变。
- INV-2: stale recovery 与 Service Worker restart 行为保持。
- INV-3: `main.ts` 不保存 capture 状态，不包含 action switch，不逐个编排所有采集器。
- INV-4: 任一 teardown 错误不能导致强制 flush 被跳过。

## 验收场景（AC）
- AC-1: Given stopped 状态 When start Then adapters 按既有顺序启动并返回 current status。
- AC-2: Given active capture 与部分 teardown 失败 When stop Then flush 必执行、capture 最终状态和错误聚合符合契约。
- AC-3: Given输入事件 When ingest Then 相对时间、分类、buffer 写入与 size guard 保持。
- AC-4: Given SW restart/stale capture When 初始化 Then 恢复或收口行为与基线一致。
- AC-5: Given入口扫描 When 完成 Then旧 `service_worker.ts` 删除，`main.ts` 仅组装 modules/listeners/error handling。

## 边界与反例
- CaptureRuntime interface 固定为 `start`、`stop`、`status`、`ingest`；内部 adapter 不向调用者泄漏。
- 不在此 task 深拆 persistence 或 exporter。

## 不做的事
- 不改变产品状态模型或新增恢复策略。
- 不改变消息 action/interface。
- 不调整 capture 配置默认值。

## 技术决策
### 条件强制（被 2+ task 依赖的决策）
- CaptureRuntime 是 background 核心外部 seam；StopPipeline 是其内部 seam，不扩大公共 interface。

### 设计探索结论（命中方案先行信号时）
- 候选: 一个大 Runtime / Runtime + 内部 StopPipeline。
- 推荐: 后者 —— 外部 interface 小，停止复杂度具有 locality 并可独立否证顺序。
- 已知坑: finally 顺序与错误聚合容易改变完成状态，须用调用序列测试锁定。

### 实现锚点（坐标集中地）
- `apps/extension/background/capture_runtime/`
- `apps/extension/background/main.ts`
- `apps/extension/background/service_worker.ts`
- capture/persistence/agent/tabs/messaging composition wiring

### 可测性契约（必填，无 N/A 例外）
- 应用启动方式: `npm test && npm run build && npm run test:e2e:all`
- AC-1 验收信号: adapter call order；通道: 直驱。
- AC-2 验收信号: forced failure call sequence + final DB state；通道: 直驱。
- AC-3 验收信号: ingest fixture/store writes；通道: 直驱。
- AC-4 验收信号: restart/stale tests；通道: 直驱 + CDP。
- AC-5 验收信号: entry responsibility scan + true Chrome workflow；通道: CLI + CDP。
- 预期失败模式（建议每条 AC 1 条反例）:
  - AC-1 若启动顺序漂移则 call-order 失败。
  - AC-2 若 flush 被跳过则 DB event count 减少。
  - AC-3 若状态外泄则 interface test 无法用 fake。
  - AC-4 若恢复回归则 stale fixture 状态错误。
  - AC-5 若入口含业务编排则扫描失败。

## 待澄清 [NEEDS CLARIFICATION]
无
