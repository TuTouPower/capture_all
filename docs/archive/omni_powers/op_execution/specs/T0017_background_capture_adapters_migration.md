---
status: approved
type: refactor
eval: required
---
# 纯迁移 Background capture adapters

## 一句话意图
把网络、CDP、body、WebSocket、console、exception、cookie 等采集 adapter 迁入 Extension 产品目录，不改变采集顺序或事件语义。

## 不变量（INV）
- INV-1: 仅移动文件和更新 import，函数签名与实现逻辑不变。
- INV-2: CDP attach/detach、body 获取、redaction、stream buffering 与重试语义不变。
- INV-3: 事件 category、type、relative time 和 body 截断阈值不变。
- INV-4: 不重新设计现有网络子模块 interface。

## 验收场景（AC）
- AC-1: Given network/CDP/WebRequest/WebSocket 单元与集成测试 When 执行 Then 全部通过且发现数不变。
- AC-2: Given headed capture 场景 When 产生请求、响应 body、console、exception 与 cookie 变化 Then 记录内容与基线一致。
- AC-3: Given build When 生成 Extension bundle Then 采集 adapters 均从 `apps/extension/background/capture` 解析。

## 边界与反例
- 不移动 storage、exporter、service worker 或 Agent adapters。
- 不优化 event router、correlator 或 stream buffer。

## 不做的事
- 不建立 CaptureRuntime。
- 不改变 debugger permission、attach policy 或 error mapping。
- 不修复无关 flaky 测试。

## 技术决策
### 条件强制（被 2+ task 依赖的决策）
- 所有浏览器采集实现归 `apps/extension/background/capture` 所有。

### 设计探索结论（命中方案先行信号时）
- 候选: 按文件逐 task / 按 capture adapter 群迁移。
- 推荐: 单群机械迁移 —— 文件相互依赖密集，拆开会制造大量临时转导。
- 已知坑: CDP 与 WebRequest 共享 correlation/body 状态，禁止跨 task 改 interface。

### 实现锚点（坐标集中地）
- `src/extension/background/network_*.ts`、`cdp_*.ts`
- `body_capture_coordinator.ts`、`stream_buffer.ts`
- `console_capture.ts`、`exception_capture.ts`、`cookie_capture.ts`
- `apps/extension/background/capture/`

### 可测性契约（必填，无 N/A 例外）
- 应用启动方式: `npm test && npm run build && npm run test:e2e:all`
- AC-1 验收信号: capture test summary；通道: 直驱。
- AC-2 验收信号: headed E2E capture records；通道: CDP。
- AC-3 验收信号: import scan + artifact smoke；通道: CLI。
- 预期失败模式（建议每条 AC 1 条反例）:
  - AC-1 若 import 环断裂则 typecheck/build 失败。
  - AC-2 若顺序或阈值变化则 fixture 字段不匹配。
  - AC-3 若旧实现残留则 duplicate source scan 失败。

## 待澄清 [NEEDS CLARIFICATION]
无
