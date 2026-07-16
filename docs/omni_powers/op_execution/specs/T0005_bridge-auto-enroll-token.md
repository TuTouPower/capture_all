---
status: approved
type: feat
eval: required
---
# Bridge 自动 enroll 与 instance_token（hash 存储）
## 一句话意图
扩展通过本地 enroll 接口自动登记，Bridge 生成 `instance_token`、只存 hash，后续 heartbeat/poll/result 用该 token 鉴权并绑定实例，用户无需手抄长 token 给扩展。

## 不变量（INV）
- INV-1: Bridge 不向日志/错误回显 token 明文
- INV-2: 存储仅 token 的 sha256（或等价单向摘要），校验恒时比较
- INV-3: enroll 仅接受本机与合法 `chrome-extension://` Origin（与现 Origin 策略一致）；无 Origin 的任意远程不可 enroll
- INV-4: MCP 通道 token（mcp_token）与 instance_token 分离；本 task 至少定义清晰字段，MCP 不得使用 instance_token
- INV-5: 同 `browser_no` 再次 enroll → **顶替**旧实例绑定（写 app/bridge 日志），保证编号唯一路由

## 验收场景（验收标准 AC）
- AC-1: Given Bridge 已启动 When 扩展 `POST /extension/enroll` 带 `{browser_no:1, browser_label?, extension_version, instance_id?}` Then 200 返回 `{instance_id, instance_token, browser_no}` 且仅此一次可见明文 token
- AC-2: Given 已 enroll When 用 instance_token 调 heartbeat/command/result Then 鉴权通过并路由到该实例队列
- AC-3: Given 已 enroll When 用错误 token 调扩展端点 Then 401 `TOKEN_INVALID`
- AC-4: Given browser_no=1 已绑定实例 A When 再次 enroll browser_no=1 Then 旧 A token 失效，新 token 生效；`list/status` 中 browser_no=1 仅对应新 instance
- AC-5: Given enroll 成功 When 检查 Bridge 持久化或内存注册表 Then 无明文 instance_token 字段（仅 hash）

## 边界与反例
- `browser_no` 缺失/非正整数 → 400 `INVALID_QUERY`
- 磁盘持久化（若做）：文件权限应限制；若本 task 仅内存，重启后需重新 enroll（在 AC 中写明）
- MCP `/mcp/*` 仍用 mcp 通道 token，不能用 instance_token 冒充 MCP

## 不做的事
- 不做扩展 UI（T0006）
- 不做配对批准页/6 位码（T0009）；本 task 可为 S0 本机信任 enroll
- 不改导出业务与大文件落盘逻辑

## 技术决策
### 条件强制
依赖 T0004 实例表与每实例队列。

### 设计探索结论
- 用户主路径去手贴 token → enroll 发 token 是最小闭环
- Bridge 存 hash 可轮换/吊销；轮换 API 可留待后续，本 task 用「再 enroll 顶替」完成弱轮换

### 实现锚点
- 新路由: `POST /extension/enroll`、可选 `GET /extension/discover`
- `server.ts` 鉴权分支: MCP 路由 vs Extension 路由使用不同 token 空间
- 注册表字段: `instance_id`, `browser_no`, `browser_label`, `token_hash`, `extension_version`, `active_capture_id`, `last_seen_at`
- 配置: 可增加 `mcp_token` 与（过渡期）旧单一 `token` 兼容开关，但禁止把用户扩展 token 写回仓库

### 可测性契约
- 通道: 直驱 bridge server 单测
- AC-5 否证: 注册表 dump/序列化断言无 raw token 字符串
- 预期失败模式: 仍用全局单 token 导致多扩展互踢但无法编号路由

## 待澄清 [NEEDS CLARIFICATION]
- 注册表是否落盘到 `~/.capture-all/instances.json`：草案默认 **本 task 内存**；持久化可闸门指定并入本 task 或另开。
