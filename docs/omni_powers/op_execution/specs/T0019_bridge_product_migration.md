---
status: approved
type: refactor
eval: required
---
# 纯迁移 Bridge 产品

## 一句话意图
把 Bridge 现有文件形状整体迁入 `apps/bridge`，保持 bundle、route、鉴权、多实例、配对和 CDP 行为不变。

## 不变量（INV）
- INV-1: `server.ts` 保持现有单文件 implementation，不提前拆 module。
- INV-2: 仅监听 `127.0.0.1`，Origin 规则不弱化。
- INV-3: token 来源保持 `CLI > env > file > generated`，生成 token 以 `0600` 持久化。
- INV-4: MCP token 继续可访问 Extension 数据路由；instance token 不能访问 MCP/CDP。
- INV-5: registry 只保存 instance token hash，并使用恒时比较。

## 验收场景（AC）
- AC-1: Given `npm run bridge` 与 bundle When 启动 Then health 返回 200 且进程只绑定 loopback。
- AC-2: Given T0011 route/auth 矩阵 When 对迁移后 Bridge 执行 Then public/MCP/instance/错误 token 状态码完全一致。
- AC-3: Given CLI、env、file、无 token 四种启动 When 解析配置 Then 来源优先级、持久化内容和权限一致。
- AC-4: Given多实例、配对、result file、body limit、CDP 场景 When 执行 Then 行为与基线一致。

## 边界与反例
- 不修改 route URL、HTTP method、错误码或 timeout。
- 不把 bootstrap 兼容误判为漏洞并删除。
- 不夹带 architecture 文档变更，最终由 T0032 对齐。

## 不做的事
- 不拆 HTTP/auth/registry/pairing/commands/CDP modules。
- 不改变 token 策略。
- 不新增远程监听能力。

## 技术决策
### 条件强制（被 2+ task 依赖的决策）
- `apps/bridge` 成为唯一 Bridge source entry，产物仍为 `artifacts/bridge/bridge.mjs`。

### 设计探索结论（命中方案先行信号时）
- 候选: 迁移时拆 server / 先整体迁移。
- 推荐: 先整体迁移 —— route/auth 回归可明确归因于路径。
- 已知坑: CLI cwd 会影响默认 token file 路径，bundle smoke 需固定临时 cwd。

### 实现锚点（坐标集中地）
- `src/agent/bridge/`
- `apps/bridge/`
- `package.json` 与 `tooling/build/` Bridge entry

### 可测性契约（必填，无 N/A 例外）
- 应用启动方式: `npm test && npm run build:bridge`
- AC-1 验收信号: health + listening address；通道: HTTP/直驱。
- AC-2 验收信号: status/body auth matrix；通道: HTTP。
- AC-3 验收信号: config source 与 token file mode；通道: 直驱。
- AC-4 验收信号: 现有 Bridge/CDP behavior tests；通道: 直驱 + HTTP。
- 预期失败模式（建议每条 AC 1 条反例）:
  - AC-1 若绑定非 loopback 则配置测试失败。
  - AC-2 若权限变化则矩阵失败。
  - AC-3 若 fallback 顺序变化则来源断言失败。
  - AC-4 若队列/配对状态丢失则多实例测试失败。

## 待澄清 [NEEDS CLARIFICATION]
无
