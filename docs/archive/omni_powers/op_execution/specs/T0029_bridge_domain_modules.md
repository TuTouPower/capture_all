---
status: approved
type: refactor
eval: required
---
# 深化 Bridge 实例、配对、命令与 CDP modules

## 一句话意图
把实例注册、目标选择、配对、命令所有权和 CDP 收进内部深 modules，删除 Bridge 上帝文件并让 main 只负责组装。

## 不变量（INV）
- INV-1: 同 `browser_no` 重 enroll 后旧 token、旧 instance 与旧 queue 立即失效。
- INV-2: 多实例未指定目标时保持 `TARGET_REQUIRED`，单实例兼容路径不变。
- INV-3: pairing 窗口、批准、S0/dev 与 allowlist 行为不变。
- INV-4: CDP detect/start/events/stop route、redaction 与错误行为不变。
- INV-5: registry 不保存明文 instance token。

## 验收场景（AC）
- AC-1: Given enroll/heartbeat/re-enroll/TTL 场景 When 经 InstanceRegistry Then online 状态、替换与旧 token 失效正确。
- AC-2: Given零/一/多实例与显式目标 When TargetResolver 选择 Then success/error 与基线一致。
- AC-3: Given pairing open/status/approve/close When 操作 Then窗口与批准状态正确且未授权 enroll 被拒。
- AC-4: Given per-instance command/result When poll/resolve Then命令不串台，错误 owner 被拒。
- AC-5: Given CDP routes When 执行 Then capture/redaction 结果与基线一致，`main.ts` 只配置、组装、listen、退出。

## 边界与反例
- 内部 modules 不等于每个 route 一个 pass-through 文件。
- HTTP tests 只验证 composition；领域行为经 module interface contract 测试。

## 不做的事
- 不改变 route URL、tool schema 或 Extension client。
- 不新增 pairing 模式。
- 不改变 token 来源策略。

## 技术决策
### 条件强制（被 2+ task 依赖的决策）
- `InstanceRegistry`、`TargetResolver`、`PairingManager`、`CommandGateway`、`CdpAdapter` 是 BridgeServer implementation 内部 seams。

### 设计探索结论（命中方案先行信号时）
- 候选: route-oriented / knowledge-oriented modules。
- 推荐: knowledge-oriented —— 实例、配对、命令、CDP 各隐藏状态与不变量，HTTP 只是 adapter。
- 已知坑: re-enroll 必须原子撤销旧 auth 与 queue，否则短窗口串台。

### 实现锚点（坐标集中地）
- `apps/bridge/instances/`、`pairing/`、`commands/`、`cdp/`
- `apps/bridge/main.ts`、`server.ts`、`command_queue.ts`、`cdp_handler.ts`

### 可测性契约（必填，无 N/A 例外）
- 应用启动方式: `npm test && npm run build:bridge && npm run test:e2e:all`
- AC-1 验收信号: registry state/auth contract；通道: 直驱 + HTTP。
- AC-2 验收信号: target table；通道: 直驱。
- AC-3 验收信号: pairing state machine；通道: HTTP。
- AC-4 验收信号: two-client queue/result test；通道: HTTP。
- AC-5 验收信号: CDP tests + entry responsibility scan；通道: 直驱 + HTTP。
- 预期失败模式（建议每条 AC 1 条反例）:
  - AC-1 若旧 token 仍有效则 auth 否证失败。
  - AC-2 若多实例静默选目标则错误码失败。
  - AC-3 若窗口关闭后仍 approve/enroll 则状态机失败。
  - AC-4 若 B 取得 A 命令则隔离测试失败。
  - AC-5 若 main 含领域状态或 server 上帝文件残留则扫描失败。

## 待澄清 [NEEDS CLARIFICATION]
无
