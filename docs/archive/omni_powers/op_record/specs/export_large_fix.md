# 大文件导出修复 Spec

## 1. 核心概念

当前导出链路 `exporter → agent_command_dispatcher → Bridge(HTTP) → MCP(text)` 对 39MB 数据触发三层超时/限流：

| 层 | 当前限制 | 故障现象 |
|---|---|---|
| Bridge result body | `MAX_EXTENSION_RESULT_BODY_BYTES = 32MB` | HTTP 413 |
| Bridge 命令超时 | `command_timeout_ms = 120s` | `COMMAND_TIMEOUT` |
| MCP SDK | 60s 硬超时 + 文本通道无大小限制但极慢 | 客户端超时断开 |

修复策略：两条互补路径，不改现有默认行为。

**路径 A — 旁路写文件**：MCP 工具新增 `output_path` 参数。Bridge 收到 extension 结果后直接 `fs.writeFile` 到本地路径，MCP 只返回 `{file_path, size_bytes}`。绕过 MCP 文本通道，但 extension→bridge 仍受 `MAX_EXTENSION_RESULT_BODY_BYTES` 约束（提升到 64MB）。

**路径 B — 瘦身导出**：MCP 工具新增 `include_response_body` 参数（默认 `true`）。`false` 时 `exporter.ts` 各函数省略 `NetworkRequestData.response_body`，体积从 ~40MB 降到 <1MB，可安全走回 MCP 文本通道。

**超时分层**：`config.ts` 新增 `full_data_timeout_ms`（300s），用于 `capture.export` / `capture.get_all_data` 两类重量命令；其余命令保持 `command_timeout_ms`（120s）。

---

## 2. 接口定义

### 2.1 MCP 工具输入 Schema（schemas.ts）

```typescript
// 修改：export_capture_schema / export_session_schema 共用
const export_capture_schema = z.object({
    capture_id: z.string().min(1, "capture_id is required"),
    format: z.enum(["json", "jsonl", "html", "har"]),
    output_path: z.string().min(1).optional(),          // 新增
    include_response_body: z.boolean().optional(),       // 新增，默认 true
    timeout_ms: z.number().int().positive().optional(),
});

// 修改：get_all_capture_data_schema / get_all_session_data_schema 共用
const get_all_capture_data_schema = z.object({
    capture_id: z.string().min(1, "capture_id is required"),
    output_path: z.string().min(1).optional(),          // 新增
    timeout_ms: z.number().int().positive().optional(),
});
```

### 2.2 导出函数签名（exporter.ts）

```typescript
// 新增选项类型
interface ExportOptions {
    include_response_body?: boolean;  // 默认 true
}

// 修改前：export_json(capture_id: string): Promise<string>
// 修改后：
async function export_json(capture_id: string, options?: ExportOptions): Promise<string>

// 修改前：export_jsonl(capture_id: string): Promise<string>
// 修改后：
async function export_jsonl(capture_id: string, options?: ExportOptions): Promise<string>

// 修改前：export_html(capture_id: string): Promise<string>
// 修改后：
async function export_html(capture_id: string, options?: ExportOptions): Promise<string>

// 修改前：export_har(capture_id: string): Promise<string>
// 修改后：
async function export_har(capture_id: string, options?: ExportOptions): Promise<string>
```

### 2.3 AgentCommandDispatcher 出口（agent_command_dispatcher.ts）

```typescript
// export_capture 函数签名变更
async function export_capture(
    capture_id: string,
    format: string,
    options?: { include_response_body?: boolean },  // 新增第三个参数
): Promise<{ format: string; content: string }>
```

### 2.4 Bridge 命令载荷类型

```typescript
// capture.export 命令 payload（extension 侧接收）
interface ExportCommandPayload {
    capture_id: string;
    format: "json" | "jsonl" | "html" | "har";
    include_response_body?: boolean;  // 新增，默认 true
    output_path?: string;             // 新增，bridge 侧消费，不透传 extension
    timeout_ms?: number;
}

// capture.get_all_data 命令 payload
interface GetAllDataPayload {
    capture_id: string;
    output_path?: string;  // 新增，bridge 侧消费
    timeout_ms?: number;
}
```

### 2.5 Bridge 命令结果类型（protocol.ts）

```typescript
// 新增：output_path 成功时的轻量响应
interface FileOutputResult {
    file_path: string;
    size_bytes: number;
}
```

### 2.6 AgentBridgeConfig（protocol.ts + config.ts）

```typescript
// 已有字段，仅改默认值
interface AgentBridgeConfig {
    host: "127.0.0.1";
    port: number;
    token: string;
    command_timeout_ms: number;       // 默认 120000 不变
    full_data_timeout_ms: number;     // 默认值从 120000 改为 300000
}
```

### 2.7 Bridge 常量（server.ts）

```typescript
// 修改前
const MAX_EXTENSION_RESULT_BODY_BYTES = 32 * 1024 * 1024;

// 修改后
const MAX_EXTENSION_RESULT_BODY_BYTES = 64 * 1024 * 1024;
```

---

## 3. 行为 Spec

### 3.1 include_response_body 行为

**规格**：当 `include_response_body === false` 时，导出的 `NetworkRequestData` 对象省略 `response_body` 字段。其余数据（request_body、headers、timing、status 等）完整保留。

**影响范围**：

| 格式 | response_body 所在位置 | 省略方式 |
|------|----------------------|---------|
| JSON | `network_requests[].response_body` | 字段设为 `undefined` / 不输出 |
| JSONL | 每行 `network_request` 记录 | `response_body` 设为 `undefined` |
| HTML | 内嵌 JSON 中同上 | 同 JSON |
| HAR | `entries[].response.content.text` | 不输出 `text` 属性；`content.size` 仍输出 |

**JSON 示例**（`include_response_body: false`）：

```json
{
  "network_requests": [
    {
      "url": "https://api.example.com/data",
      "method": "GET",
      "status_code": 200,
      "duration_ms": 150,
      "response_headers": { "content-type": "application/json" }
      // response_body 不出现
    }
  ]
}
```

**边界条件**：
- `include_response_body` 省略或 `true`：与当前行为完全一致，所有字段原样输出。
- `include_response_body: false` 且原始数据本身没有 `response_body`（采集时未开启 body capture）：行为不变，本来就没有。
- `include_response_body: false` 对 `get_all_capture_data` 不生效，该函数无此参数。

### 3.2 output_path 行为

**规格**：`output_path` 仅在 Bridge 层消费。Bridge 在 `/mcp/command` 路由中：

1. 正常执行命令（extension 返回 `AgentCommandResult`）
2. 若 `command.ok` 且原始 payload 含 `output_path`：
   - 从 `result.data` 中提取 `content` 字段
   - 调用 `fs.writeFile(output_path, content, "utf-8")`
   - 构造新 result：`{ file_path: output_path, size_bytes: Buffer.byteLength(content) }`
   - 将此轻量对象作为 `data` 返回给 MCP
3. 若 `command.ok === false`：错误走原有错误通道，不写文件。
4. 若 `output_path` 已存在：**覆盖**（truncate write，与 `fs.writeFile` 语义一致）。

**MCP 侧返回示例**（`output_path` 模式）：
```json
{
  "file_path": "/home/user/export/capture_xxx.json",
  "size_bytes": 39123456
}
```

**边界条件**：
- `output_path` 为相对路径：相对 bridge 进程的 `cwd`。建议调用方传绝对路径。
- `output_path` 父目录不存在：`fs.writeFile` 抛出 `ENOENT`，包装为 `BRIDGE_UNAVAILABLE` 错误返回。
- `output_path` 是目录路径：`fs.writeFile` 抛出 `EISDIR`，同上处理。
- 文件系统写入权限不足：抛出 `EACCES`，包装为 `BRIDGE_UNAVAILABLE`。
- `output_path` 不传：行为与当前完全一致，数据走 JSON 文本通道返回。

### 3.3 超时选择逻辑

**位置**：`src/agent/bridge/server.ts` 的 `/mcp/command` 路由。

```typescript
// 伪代码
const FULL_DATA_COMMANDS: Set<AgentCommandType> = new Set([
    "capture.export",
    "capture.get_all_data",
]);

const default_timeout_ms = FULL_DATA_COMMANDS.has(body.type)
    ? config.full_data_timeout_ms   // 300s
    : config.command_timeout_ms;     // 120s

const pending = queue.enqueue(
    body.type,
    body.payload,
    body.timeout_ms || default_timeout_ms,
);
```

**行为**：
- 若 MCP 调用方显式传了 `timeout_ms`：始终以显式值为准（覆盖默认值）。
- 若未传：`capture.export` / `capture.get_all_data` 默认 300s；其余命令默认 120s。
- `full_data_timeout_ms` 默认值由 `config.ts` 的 `?? 120000` 改为 `?? 300000`。

### 3.4 整体数据流

```
MCP Client (LLM)
  │ tool call: export_capture({capture_id, format, output_path?, include_response_body?, timeout_ms?})
  ▼
MCP Server (main.ts)
  │ execute_mcp_tool(client, call)
  │   → 拆出 timeout_ms，其余 payload 传给 bridge
  ▼
Bridge Client (client.ts)
  │ POST /mcp/command  {type: "capture.export", payload: {capture_id, format, include_response_body, output_path}, timeout_ms}
  ▼
Bridge Server (server.ts)
  │ 1. 选超时：full_data → full_data_timeout_ms / 普通 → command_timeout_ms
  │ 2. queue.enqueue → extension 轮询取走
  │ 3. extension 返回 AgentCommandResult
  │ 4. 若 ok && output_path → fs.writeFile, 返回 {file_path, size_bytes}
  │    若 ok && !output_path → 原样透传 result
  │    若 !ok → 透传 error
  ▼
Extension (agent_command_dispatcher.ts)
  │ export_capture(capture_id, format, {include_response_body})
  │   → exporter.export_json(capture_id, {include_response_body})
  │   → 返回 {format, content: "<json string>"}
  ▼
Bridge → MCP → LLM
  │ output_path 有值时：{file_path, size_bytes}（极小）
  │ output_path 无值时：完整 JSON 字符串（可能很大）
```

---

## 4. 错误处理

### 4.1 新增错误码

| 错误码 | 触发条件 | 返回层 |
|--------|---------|--------|
| `BRIDGE_UNAVAILABLE` | `fs.writeFile` 失败（ENOENT/EACCES/EISDIR/ENOSPC 等） | Bridge → MCP |
| `PAYLOAD_TOO_LARGE` | Extension 返回体超过 64MB | Bridge → MCP |
| `COMMAND_TIMEOUT` | Extension 在超时内未响应（300s for export） | Bridge → MCP |
| `EXPORT_FAILED` | exporter 内部抛错（capture 不存在等） | Extension → Bridge → MCP |
| `INVALID_QUERY` | `format` 非法、`capture_id` 缺失 | Extension/MCP schema |

### 4.2 各层错误包装

**Exporter 层**（exporter.ts）：
- `get_capture` 返回 `null` → `throw new Error("Capture not found")` → dispatcher 包装为 `EXPORT_FAILED`

**Dispatcher 层**（agent_command_dispatcher.ts）：
- 所有 exporter 抛错 → `AgentCommandError("EXPORT_FAILED", ...)`
- `format` 非法 → `AgentCommandError("INVALID_QUERY", ...)`

**Bridge 层**（server.ts）：
- `fs.writeFile` 抛错 → `BridgeHttpError(500, "BRIDGE_UNAVAILABLE", ...)`
- Extension result body > 64MB → `BridgeHttpError(413, "PAYLOAD_TOO_LARGE", ...)`
- `queue.enqueue` 超时 → `AgentCommandResult { ok: false, error: { code: "COMMAND_TIMEOUT" } }`

**MCP 层**（main.ts）：
- `execute_mcp_tool` 抛错 → MCP SDK 框架处理为 `{ isError: true, content: [...] }`

### 4.3 错误示例

```json
// output_path 父目录不存在
{
  "ok": false,
  "error": {
    "code": "BRIDGE_UNAVAILABLE",
    "message": "ENOENT: no such file or directory, open '/nonexistent/export.json'"
  }
}

// 数据超过 64MB
{
  "ok": false,
  "error": {
    "code": "PAYLOAD_TOO_LARGE",
    "message": "JSON body is too large"
  }
}
```

---

## 5. 兼容性

### 5.1 不变更项

| 项目 | 值 | 原因 |
|------|-----|------|
| `command_timeout_ms` 默认值 | 120000 | 普通命令无需更长超时 |
| 现有 MCP 工具名 | `export_capture`, `export_session`, `get_all_capture_data`, `get_all_session_data` | 不增不减 |
| 现有工具必填参数 | `capture_id`, `format` (export) | 保持必填 |
| exporter 返回值类型 | `Promise<string>` | 内部返回类型不变 |
| `export_capture` 调度函数名 | `export_capture` | 不重命名 |
| JSON/JSONL/HTML/HAR 格式结构 | 顶层结构不变 | 仅 `response_body` 可选省略 |

### 5.2 默认行为保证

| 场景 | 旧行为 | 新默认行为 |
|------|--------|-----------|
| 不传 `output_path` | 数据走 MCP 文本通道 | **同左** |
| 不传 `include_response_body` | `response_body` 原样输出 | **同左**（默认 `true`） |
| 不传 `timeout_ms` for export | 120s（command_timeout_ms） | **300s**（full_data_timeout_ms） |
| 不传 `timeout_ms` for get_status | 120s（command_timeout_ms） | **同左**（120s） |

唯一的默认行为变化是 export/get_all_data 的隐式超时从 120s 变为 300s。这是**放宽**而非收紧，对现有调用方无破坏性影响。

### 5.3 新增的可选参数汇总

| 参数 | 适用工具 | 类型 | 默认值 | 说明 |
|------|---------|------|--------|------|
| `output_path` | export_capture, export_session, get_all_capture_data, get_all_session_data | `string \| undefined` | `undefined` | Bridge 旁路写文件路径 |
| `include_response_body` | export_capture, export_session | `boolean \| undefined` | `true` | 是否包含 response_body |

---

## 6. 实现清单

| # | 文件 | 改动 |
|---|------|------|
| 1 | `src/agent/shared/protocol.ts` | 新增 `FILE_OUTPUT_FAILED` 到 `AgentErrorCode` 联合类型 |
| 2 | `src/agent/bridge/config.ts` | `full_data_timeout_ms ?? 120000` → `?? 300000` |
| 3 | `src/agent/bridge/server.ts` | `MAX_EXTENSION_RESULT_BODY_BYTES` 32→64MB；`/mcp/command` 路由加超时选择逻辑 + `output_path` 写文件逻辑 |
| 4 | `src/agent/mcp/schemas.ts` | `export_capture_schema` 加 `output_path`、`include_response_body`；`get_all_capture_data_schema` 加 `output_path` |
| 5 | `src/agent/mcp/tools.ts` | `execute_mcp_tool` 透传新参数（无需改，已透传 `...payload`） |
| 6 | `src/background/exporter.ts` | 四个 `export_*` 函数加 `ExportOptions` 参数；`include_response_body=false` 时过滤 `response_body` |
| 7 | `src/background/agent_command_dispatcher.ts` | `export_capture` 函数接收并传递 `include_response_body` 选项 |
