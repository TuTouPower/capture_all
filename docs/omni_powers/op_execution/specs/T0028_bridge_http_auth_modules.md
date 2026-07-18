---
status: approved
type: refactor
eval: required
---
# 深化 Bridge HTTP 与认证 modules

## 一句话意图
把 listen、HTTP parsing、CORS、body/result limits、error mapping 与两类认证策略收进 BridgeServer implementation 和内部认证 seams。

## 不变量（INV）
- INV-1: Bridge 只监听 `127.0.0.1`，Origin 策略不弱化。
- INV-2: token 来源严格为 `CLI > env > persisted file > generated`，生成文件 mode `0600`。
- INV-3: MCP token 保留 Extension 数据路由 bootstrap 兼容；instance token 不能访问 MCP/CDP。
- INV-4: token hash 与恒时比较、安全 body limits、result file 行为不弱化。

## 验收场景（AC）
- AC-1: Given BridgeServer interface When composition root listen/close Then health、错误处理与资源释放正确。
- AC-2: Given route/auth 矩阵 When 使用 public/MCP/instance/错误 token Then 200/401/403 行为与基线一致。
- AC-3: Given非法 Origin、超限 body、错误 JSON 与 result file request When 请求 Then CORS/413/400/文件响应契约正确。
- AC-4: Given CLI/env/file/generated token source When 启动 Then优先级与权限保持。

## 边界与反例
- `McpAuthenticator`、`InstanceAuthenticator` 是内部 seams；调用者不学习 header/hash 细节。
- 不在此 task 拆实例注册、配对、命令队列和 CDP 行为。

## 不做的事
- 不收紧已接受 bootstrap 兼容。
- 不增加 TLS、远程监听或新 route。
- 不删除旧 `server.ts`，待 T0029 完成剩余拆分后删除。

## 技术决策
### 条件强制（被 2+ task 依赖的决策）
- BridgeServer 对 composition root 只暴露 listen/close；route policy 由单一矩阵驱动。

### 设计探索结论（命中方案先行信号时）
- 候选: 每 route 一个 handler module / HTTP 深 implementation + 领域命令 collaborators。
- 推荐: 后者 —— 避免大量浅转发 module，集中协议与安全规则。
- 已知坑: public early routes 与后置 auth dispatch 易产生权限漂移，矩阵测试必须覆盖全部 route/method。

### 实现锚点（坐标集中地）
- `apps/bridge/http/`、`auth/`、`config/`
- `apps/bridge/server.ts`
- Bridge server/config tests 与 auth fixtures

### 可测性契约（必填，无 N/A 例外）
- 应用启动方式: `npm test && npm run build:bridge`
- AC-1 验收信号: listen/close integration；通道: HTTP。
- AC-2 验收信号: exhaustive route/auth table；通道: HTTP。
- AC-3 验收信号: Origin/body/error fixtures；通道: HTTP。
- AC-4 验收信号: config source/file mode tests；通道: 直驱。
- 预期失败模式（建议每条 AC 1 条反例）:
  - AC-1 若资源未释放则端口重启失败。
  - AC-2 若权限扩大/缩小则矩阵失败。
  - AC-3 若 limit/CORS 回归则状态码或 header 失败。
  - AC-4 若来源优先级改变则 source assertion 失败。

## 待澄清 [NEEDS CLARIFICATION]
无
