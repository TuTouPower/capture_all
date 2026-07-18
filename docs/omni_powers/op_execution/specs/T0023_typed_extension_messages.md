---
status: approved
type: refactor
eval: required
---
# 建立 typed Extension messages 与统一 MessageRouter

## 一句话意图
用判别联合消息 interface、runtime client 和统一 MessageRouter 替换裸 action 字符串、`any` 与分散错误处理。

## 不变量（INV）
- INV-1: 所有现有消息可观察行为、异步响应与错误语义保持。
- INV-2: commit 结束时生产 sender 全部经 runtime client，旧裸 action 协议不再接受。
- INV-3: 不在此 task 重写 capture start/stop implementation。
- INV-4: snapshot 大数据路径保持 T0022 契约。

## 验收场景（AC）
- AC-1: Given 每类合法请求 When 经 runtime client 发送 Then typed response 与旧行为一致。
- AC-2: Given malformed 或未知 action When 发送 Then 返回确定 typed error，不抛未处理异常或静默成功。
- AC-3: Given生产代码扫描 When 执行 Then 无裸 `chrome.runtime.sendMessage({ action: ... })` 与主路由 `message: any`。
- AC-4: Given旧 action 格式 When 发送 Then 明确拒绝，防止双协议永久并存。

## 边界与反例
- task 内允许短暂双协议以迁 sender，但 commit 最终态不保留旧分支。
- Router 必须隐藏校验、分派、异步错误映射，不能只把原 switch 一行一函数平移。

## 不做的事
- 不提取 CaptureRuntime、TabEventCapture 或 StopPipeline。
- 不改变 UI 功能。
- 不把大 snapshot 放入 response union。

## 技术决策
### 条件强制（被 2+ task 依赖的决策）
- 消息 interface 属于调用者与 background 共知契约，定义在公共 package；Chrome client/handler adapter 属于 Extension runtime。

### 设计探索结论（命中方案先行信号时）
- 候选: 保留 string action + overload / 判别联合 + 单 client。
- 推荐: 判别联合 + 单 client —— 编译期覆盖 request/response 对应关系，减少调用者知识。
- 已知坑: Chrome listener 必须保持 `return true` 异步生命周期。

### 实现锚点（坐标集中地）
- `packages/agent_protocol/src/extension_messages/`
- `apps/extension/runtime/messages.ts`、`client.ts`
- `apps/extension/background/messaging/`
- 全部 popup/dashboard/devtools/content/agent sender

### 可测性契约（必填，无 N/A 例外）
- 应用启动方式: `npm test && npm run build && npm run test:e2e:all`
- AC-1 验收信号: request/response contract table；通道: 直驱。
- AC-2 验收信号: malformed/unknown error fixture；通道: 直驱。
- AC-3 验收信号: AST/static scan；通道: CLI。
- AC-4 验收信号: legacy request negative test；通道: 直驱。
- 预期失败模式（建议每条 AC 1 条反例）:
  - AC-1 若 mapping 缺失则 exhaustive check/test 失败。
  - AC-2 若错误未归一则 response 不匹配。
  - AC-3 若 sender 绕过 client 则扫描失败。
  - AC-4 若旧协议仍成功则否证失败。

## 待澄清 [NEEDS CLARIFICATION]
无
