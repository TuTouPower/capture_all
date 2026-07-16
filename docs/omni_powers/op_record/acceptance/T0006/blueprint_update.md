# T0006 Blueprint 变更

## agent_mcp.md

### §2 MCP 工具 — get_status 返回扩展
- 扩展 online 身份现由 `instance_token`（enroll 签发）标识，不再仅依赖 MCP token。

### §3 Bridge HTTP 协议
- `/extension/heartbeat` 鉴权改为 `instance_token`（MCP token 亦兼容）。
- `/extension/enroll` 请求体现 `browser_no` + `version`；响应 `instance_id` + `instance_token` + `browser_no`。

### §6 安全边界
- 新增：**同 browser_no 再次 enroll 顶替旧实例**（删除旧注册 + 命令队列，旧 instance_token 立即失效）。
- 新增：**browser_no 自动登记** —— 扩展端只需配 browser_no（正整数），启动时自动调用 enroll，Bridge 签发 instance_token，不再强制手贴 token。手贴 MCP token 保留为高级/兼容路径。
- 原规则「Bridge token 必须由用户提供」修订为「MCP token 可选提供（browser_no 自动登记后使用 instance_token）；MCP 路由仍仅接受 MCP token」。

### §7 默认配置
`DEFAULT_USER_CONFIG` 新增字段：

```typescript
browser_no: 0,        // 0 = 未设置，不自动 enroll
browser_label: '',     // 可选备注名（仅 UI 展示）
```

### §8 关键文件
`src/shared/agent_bridge_config.ts` 职责扩展为「配置类型 + normalize 逻辑 + Session 管理（`BridgeSession` 读写 + `generate_instance_id()`）」。

---

## domain.md

### §1 核心术语
新增术语：

| 术语 | 英文 | 含义 |
|---|---|---|
| 浏览器编号 | browser_no | 扩展自动登记的浏览器标识（正整数），用户设定后扩展启动时自动 enroll |
| instance_id | — | 扩展实例 UUID（`crypto.randomUUID()`），跨重启持久化到 `agent_bridge_session` |

### §5 业务不变量
新增不变量：

- **browser_no > 0 时扩展启动自动 enroll**，Bridge 签发 `instance_token`。enroll 后扩展使用 instance_token 进行后续通信，不再依赖手贴 MCP token。
- **instance_id 跨重启持久化**到 `chrome.storage.local` 的 `agent_bridge_session` key。仅 browser_no 变更或手动清除时重置。
- **401 响应自动触发一次 re-enroll**（使用已存 instance_id + browser_no），re-enroll 失败则放弃（记录日志），不回退到手贴 token 模式。

修订既有不变量：
- 「Bridge token 必须由用户提供」→「MCP token 可选；browser_no 自动登记路径使用 instance_token；/mcp/* / /cdp/* 路由仍只接受 MCP token」。

---

## dashboard.md

### §4 设置页 — 集成分区重构
Bridge 配置区 UI 变更为：

- **主入口**：`<input type="number" min="1">` — 浏览器编号（正整数）。browser_no>0 时扩展启动自动 enroll。
- **可选备注**：`<input type="text">` — 浏览器标签（仅 UI 展示，不与 Bridge 通信）。
- **高级/兼容**：折叠区（`<details>`），内含旧 MCP Token 输入框。仅 legacy 配置（有 token 无 browser_no）或高级用户手动展开。
- 所有文案使用 i18n `t()` 函数（新增 14 个 key：zh/en）。

### §5 MCP 集成页
描述不变。实际 UI 已非「集成页」而是设置页内的集成分区，入口为设置 → 浏览器编号。

---

## 变更项合计

| 蓝图文件 | 变更项数 |
|---|---|
| agent_mcp.md | 5（§2/§3/§6/§7/§8） |
| domain.md | 2（§1 新增术语 + §5 新增/修订不变量） |
| dashboard.md | 2（§4 UI 重构 + §5 描述修正） |
| **总计** | **9** |
