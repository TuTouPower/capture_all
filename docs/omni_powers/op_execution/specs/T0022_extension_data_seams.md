---
status: approved
type: refactor
eval: required
---
# 建立 Extension logging、persistence 与 snapshot seams

## 一句话意图
用 `LogSink`、`LogRepository`、`CaptureReader`、`CaptureWriter`、`CaptureSnapshotGateway` 消除 UI/content 对 background implementation 的反向依赖。

## 不变量（INV）
- INV-1: interface 放 `capture_domain`，Chrome adapter 放 `apps/extension/runtime` 或 background persistence。
- INV-2: snapshot 必须先请求成功 flush，再由页面上下文直读 IndexedDB。
- INV-3: 大 snapshot 不通过 `chrome.runtime.sendMessage` response body。
- INV-4: IndexedDB 仍使用 `capture_all_db` v3，日志过滤、容量和清理语义不变。

## 验收场景（AC）
- AC-1: Given Popup、Dashboard、DevTools、Content import graph When 扫描 Then 不再 import `background/**` implementation。
- AC-2: Given UI 查询/写日志 When 通过 runtime adapter Then 结果、过滤、flush 与错误语义和基线一致。
- AC-3: Given 大 capture When UI 读取 snapshot Then runtime 仅协调 flush，数据直接从 IndexedDB 读取且无消息大小失败。
- AC-4: Given fake 与生产 adapter When 通过同一 interface 测试 Then 调用者无需知道 store、消息 action 或 Chrome 细节。

## 边界与反例
- 不为只有一个实现且无变化价值的简单函数建立 pass-through seam。
- storage implementation 此 task 只适配 interface，不拆 schema/buffer。

## 不做的事
- 不建立统一 typed message router。
- 不拆 Service Worker 状态机。
- 不深度重构 IndexedDB implementation。

## 技术决策
### 条件强制（被 2+ task 依赖的决策）
- UI/content 只依赖 `runtime/` 与 `packages/*`。
- `CaptureSnapshotGateway` interface 包含一致性顺序与大数据性能契约，不仅是类型签名。

### 设计探索结论（命中方案先行信号时）
- 候选: 所有数据走 runtime message / 页面直读 DB + flush 协调。
- 推荐: 保留直读 DB —— 避免 Chrome message 大 payload 限制。
- 已知坑: flush 失败不能继续读出伪一致 snapshot，错误必须显式传播。

### 实现锚点（坐标集中地）
- `packages/capture_domain/src/logging/`、`persistence/`、`snapshot/`
- `apps/extension/runtime/`
- `apps/extension/background/persistence/`
- UI logging/snapshot 调用点

### 可测性契约（必填，无 N/A 例外）
- 应用启动方式: `npm test && npm run build && npm run test:e2e:all`
- AC-1 验收信号: reverse dependency scanner 零 finding；通道: CLI。
- AC-2 验收信号: shared contract tests；通道: 直驱。
- AC-3 验收信号: flush-before-read 顺序与大 payload fixture；通道: 直驱 + CDP。
- AC-4 验收信号: fake/production adapter contract suite；通道: 直驱。
- 预期失败模式（建议每条 AC 1 条反例）:
  - AC-1 若 UI 仍导入 background 则静态门失败。
  - AC-2 若 adapter 改日志语义则 fixture 失败。
  - AC-3 若未 flush 或通过 message 返回数据则否证失败。
  - AC-4 若调用者依赖实现细节则 fake 无法替换。

## 待澄清 [NEEDS CLARIFICATION]
无
