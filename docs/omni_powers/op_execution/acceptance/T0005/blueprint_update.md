# T0005 Blueprint 更新提案

T0005 引入 Bridge 自动 enroll 与 instance_token hash 鉴权，影响 2 个蓝图文件。

---

## 1. doc: op_blueprint/specs/agent_mcp.md

### 1.1 §3 Bridge HTTP 协议 — 端点表追加

```diff
 | `/extension/heartbeat` | POST | 扩展 | 在线状态 + extension_version + active_capture_id |
+| `/extension/enroll`     | POST | 扩展 | 自动登记，返回 instance_id + instance_token + browser_no |
+| `/extension/discover`   | GET  | 扩展 | 本地发现（返回 bridge 版本、enroll 路径，无需 auth） |
 | `/health`              | GET  | 任意 | 健康检查 |
```

### 1.2 §6 安全边界 — 新增 instance_token 鉴权段落

在现有"除 `/health` 外所有 API 必须带 token"之后追加：

```diff
 - 除 `/health` 外所有 API 必须带 token；用户提供，禁止硬编码 / 默认值 / 示例值。无效 / 缺失 → 401，校验使用固定长度摘要恒时比较。
+| 扩展三大数据端点（`/extension/heartbeat`、`/extension/command`、`/extension/result`）同时支持 MCP token 和 instance_token 鉴权。`resolve_extension_auth` 优先级：MCP token → 注册表中 instance_token hash 恒时比较。
+| MCP 路由（`/mcp/*`、`/cdp/*`）仅校验 MCP token，拒绝 instance_token（401 TOKEN_INVALID）。
+| Enroll 仅接受本机 loopback（MCP token）或合法 `chrome-extension://` Origin；无 Origin 的远程请求不可 enroll。
+| Bridge 仅存储 instance_token 的 sha256 hex hash，不保留明文。enroll 响应是 instance_token 唯一一次可见明文。
+| 同 browser_no 再次 enroll 删除旧实例及其命令队列（顶替），保证编号唯一路由。
```

---

## 2. doc: op_blueprint/domain.md

### 2.1 §1 核心术语 — 新增 instance_token

在 Bridge / MCP / Agent 行之后追加：

```diff
 | Bridge | — | 本地 HTTP 桥接服务，监听 127.0.0.1 |
+| instance_token | — | 扩展实例鉴权令牌，enroll 时由 Bridge 生成（`ext_` 前缀），后续 heartbeat/command/result 用此 token；Bridge 仅存储 sha256 hash |
 | MCP | Model Context Protocol | Agent 与 Bridge 间的协议层 |
```

### 2.2 §5 业务不变量 — 新增 instance_token 不变量

```diff
 - **Bridge token 必须由用户提供**，禁止硬编码、禁止默认值、禁止示例值。所有 API 请求必须带 token；无效/缺失返回 401。
+| **instance_token 与 MCP token 分离**：MCP 路由仅接受 MCP token，扩展数据端点接受 MCP token 或 instance_token。instance_token 不能冒充 MCP 访问 `/mcp/*` / `/cdp/*`。
+| **同 browser_no 再次 enroll 顶替旧实例**：删除旧实例注册及命令队列，旧 instance_token 立即失效。
+| **Bridge 仅存储 instance_token 的 sha256 hex hash**，不保留明文。校验使用恒时比较。
 - **Bridge 端口由用户配置**，禁止硬编码；默认配置中的 `agent_bridge_url` 指向 `http://127.0.0.1:17831` 仅是占位，实际端口以用户配置为准。
```

---

## 汇总

| 文件 | 变更项 | 类型 |
|------|--------|------|
| `op_blueprint/specs/agent_mcp.md` | §3 端点表追加 enroll + discover | 新增 |
| `op_blueprint/specs/agent_mcp.md` | §6 新增 instance_token 鉴权段落 | 新增 |
| `op_blueprint/domain.md` | §1 新增 instance_token 术语 | 新增 |
| `op_blueprint/domain.md` | §5 新增 3 条不变量 | 新增 |

共 4 项变更，涉及 2 个文件。architecture.md 与 conventions.md 无需变更（架构引用 agent_mcp spec 间接覆盖，编码规范不涉及）。
