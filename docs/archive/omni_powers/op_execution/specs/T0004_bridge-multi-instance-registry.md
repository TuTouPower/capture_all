---
status: approved
type: feat
eval: required
---
# Bridge 多扩展实例注册表与按实例命令队列
## 一句话意图
把 Bridge 从「单 heartbeat + 单队列」改成「多扩展实例注册 + 每实例独立命令队列」，使多个浏览器扩展可同时在线且命令不串台。

## 不变量（INV）
- INV-1: Bridge 仅监听 `127.0.0.1`，鉴权与 Origin 规则不弱化
- INV-2: 每个 online 实例有独立命令队列；实例 A 的 command 只能被 A poll 走，结果只能由 A 回传
- INV-3: 无 `browser_no` / `target_instance_id` 且 online 实例数 > 1 时，写类命令（start/stop/export/get_all_data 等）返回明确错误 `TARGET_REQUIRED`，禁止静默 round-robin
- INV-4: online 实例恰好 1 个时，可省略 target，行为兼容旧单扩展
- INV-5: MCP 仍只通过 HTTP 调 Bridge，本 task 不改 MCP 业务 schema 真相源

## 验收场景（验收标准 AC）
- AC-1: Given 两个实例 heartbeat 均在 TTL 内 When `GET /mcp/status` Then 返回 `extensions` 数组长度 2，且各自含 `instance_id`、`online: true`
- AC-2: Given 两实例 online When 对实例 A enqueue 命令且 A poll `/extension/command` Then A 取到该命令；B 同接口取不到 A 的命令
- AC-3: Given 两实例 online 且命令未指定 target When `POST /mcp/command` 写类 type Then `ok=false` 且 `error.code=TARGET_REQUIRED`
- AC-4: Given 仅一实例 online When 未指定 target 发 `captures.list` Then 命令成功入队并可被该实例取走（兼容旧路径）
- AC-5: Given 某实例超过 heartbeat TTL When status 查询 Then 该实例 `online=false` 或不出现在可路由目标中

## 边界与反例
- 未知 `instance_id` 作为 target → `EXTENSION_OFFLINE` 或 `TARGET_NOT_FOUND`（二选一写死并测）
- 旧扩展未带 `instance_id` 的 heartbeat → 拒绝或映射为临时 id；本 task 选定「拒绝并记日志」，强制后续 T0006 带 id
- result 的 `command_id` 不属于该实例队列 → 拒绝 resolve，防串台

## 不做的事
- 不做 enroll / token 自动生成（T0005）
- 不改扩展设置 UI（T0006）
- 不改 MCP 工具列表与 schema 瘦身（T0007）
- 不做配对批准页（T0009）

## 技术决策
### 条件强制
被 T0005/T0006/T0007 依赖，须先合入。

### 设计探索结论
- 每实例一队列优于「全局队列 + target 过滤 poll」：poll 竞态更小、串台面更窄。
- 用户对话语言后续用 `browser_no`；本 task 注册表至少存 `instance_id`，`browser_no` 字段可先占位（enroll 后写入）。

### 实现锚点
- `src/agent/bridge/server.ts`: 替换 `let heartbeat` 为 `Map`/`Record` 实例表
- `src/agent/bridge/command_queue.ts`: 支持多队列或 `AgentCommandQueue` 多实例包装
- `src/agent/shared/protocol.ts`: `AgentStatus` 扩展为多实例列表；错误码增 `TARGET_REQUIRED`（及可选 `TARGET_NOT_FOUND`）
- heartbeat 请求体：要求 `instance_id: string` + 既有 `extension_version` / `active_capture_id`
- `/extension/command`：按请求鉴权上下文或 query/header 中的 instance 绑定取队（实现时与 T0005 token 绑定衔接；本 task 可用临时 header `X-Capture-All-Instance-Id` 测通，T0005 改为 token→instance）

### 可测性契约
- 应用启动方式: `npm test` 单测驱动 `create_bridge_server`
- AC-1~5 通道: 直驱（`tests/agent_bridge_server.test.ts` 双客户端模拟）
- 否证: 不存在「全局单一 `heartbeat` 变量决定 online」的旧行为（源码/测试断言多实例）
- 预期失败模式: 单队列实现导致 B 取到 A 的 command

## 待澄清 [NEEDS CLARIFICATION]
- 旧扩展无 `instance_id` 的过渡策略：当前草案为直接拒绝；若需一版兼容窗口请闸门 A 明确。
