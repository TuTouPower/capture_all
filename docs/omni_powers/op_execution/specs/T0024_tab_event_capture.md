---
status: approved
type: refactor
eval: required
---
# 提取 TabEventCapture 与 background 路由实现

## 一句话意图
把 tab listener 注册、状态判断和事件生成收进深 module，并让 MessageRouter 只依赖命令 handlers。

## 不变量（INV）
- INV-1: tab create/update/activate/remove 事件字段、顺序与过滤逻辑不变。
- INV-2: Service Worker restart 后 listener 不重复注册、事件不重复写入。
- INV-3: MessageRouter interface 不扩大为 Chrome 全局对象透传。
- INV-4: start/stop pipeline 仍保持现状，留给 T0025。

## 验收场景（AC）
- AC-1: Given capturing 与非 capturing 状态 When 触发各 tab lifecycle Then 仅合法状态写入对应事件。
- AC-2: Given SW 初始化/重启 When 注册 listeners Then 每类 listener 恰好一份。
- AC-3: Given message 请求 When Router 分派 Then 只调用 typed handler，不直接操作全部 capture adapters。
- AC-4: Given `service_worker.ts` 扫描 When 完成 Then 不再包含消息 switch 与 tab 事件 implementation。

## 边界与反例
- `TabEventCapture` interface 不暴露内部 map、listener 或 Chrome event 细节。
- 不借机调整 tab URL 过滤、active tab fallback 或窗口逻辑。

## 不做的事
- 不提取 CaptureRuntime。
- 不改变消息 interface。
- 不拆 storage 或 exporter。

## 技术决策
### 条件强制（被 2+ task 依赖的决策）
- TabEventCapture 对外只表达注册/停止或摄取所需最小 interface，复杂状态留 implementation。

### 设计探索结论（命中方案先行信号时）
- 候选: 每个 Chrome event 一个 module / 单一 TabEventCapture。
- 推荐: 单一深 module —— tab 状态和过滤知识集中，减少重复 listener 生命周期。
- 已知坑: listener callback identity 影响 removeListener，implementation 必须持有稳定引用。

### 实现锚点（坐标集中地）
- `apps/extension/background/tabs/`
- `apps/extension/background/messaging/`
- `apps/extension/background/service_worker.ts`

### 可测性契约（必填，无 N/A 例外）
- 应用启动方式: `npm test && npm run build`
- AC-1 验收信号: tab event table；通道: 直驱。
- AC-2 验收信号: listener registration counters；通道: 直驱。
- AC-3 验收信号: handler fake interactions；通道: 直驱。
- AC-4 验收信号: implementation responsibility scan；通道: CLI。
- 预期失败模式（建议每条 AC 1 条反例）:
  - AC-1 若过滤变化则事件数量/字段失败。
  - AC-2 若重复注册则计数和重复事件失败。
  - AC-3 若 Router 越过 handler 则 fake interaction 失败。
  - AC-4 若旧实现残留则扫描失败。

## 待澄清 [NEEDS CLARIFICATION]
无
