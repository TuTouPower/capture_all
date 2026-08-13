# 契约与 Breaking 审阅报告

## 结论摘要

本轮从消息协议、Bridge HTTP、MCP schema、IndexedDB schema、配置边界、共享类型与公开文档契约切入，共确认 **10 条 finding**：

- Critical：0
- High：0
- Medium：5
- Low：5

最高风险集中在三类边界漂移：显式 `output_path` 的公开行为已被安全修复改变且首次使用可返回 500；`timeout_ms` 在 MCP、Bridge 与文档间存在值域和实际生效差异；Bridge 对扩展结果仅做 TypeScript cast，未做运行时协议校验。

未发现可定级为 Critical/High 的问题。重点对 `output_path` 任意写、Bridge 鉴权/实例归属、结果回传、超时上限和 IndexedDB 升级路径做了反向检查：现有 token/origin/owner 校验、路径 containment 与 symlink 收敛显著限制攻击面，因此相关问题定为 Medium 或 Low，而非 High。

## 审阅范围与方法

审阅范围：

- 共享消息与类型契约：`src/shared/message_contract.ts`、`src/shared/protocol.ts`、`src/shared/types.ts`、`src/shared/constants.ts`
- Bridge：配置解析、HTTP 路由、鉴权、目标路由、命令队列、结果回传、文件输出
- MCP：Zod schema、tool dispatch、Bridge client、使用指南
- 扩展边界：Bridge client、command dispatcher、Service Worker handler、数据查询
- 持久化：IndexedDB 初始化/schema、`chrome.storage.local` 用户配置读写
- 当前 blueprint/spec/guides，以及相关 archived spec 作为历史判断材料
- 相关 unit tests，重点寻找值域、错误码、首次初始化与 malformed payload 覆盖
- `git log` / `git blame`，用于判断新回归或 pre-existing

方法限制：按审阅任务约束，仅做静态阅读、搜索及只读 Git 历史检查；**未运行单元测试、E2E 或全量验证**，也未修改任何源码、测试、配置或既有文档。

---

## Findings

### BC-001 — 显式 `output_path` 公开契约已被安全约束改变，默认导出目录首次使用还会返回 500

- **Severity**：Medium
- **Confidence**：High
- **Location**：
  - `docs/guides/mcp_usage.md:46-71`
  - `src/mcp/schemas.ts:115-129`
  - `src/bridge/server.ts:504-509`
  - `src/bridge/server.ts:536-549`
  - `src/bridge/server.ts:823-869`
  - `src/bridge/server.ts:582-593`
  - `tests/unit/t137_bridge_security.test.ts:16-17`
  - `tests/unit/t137_bridge_security.test.ts:66-105`
- **可复现证据与调用链**：
  1. 指南把 `output_path` 公开为普通本地输出路径，示例明确使用 `"/absolute/path/export.json"`，并承诺“指定 `output_path`：始终写文件”（`docs/guides/mcp_usage.md:46-71`）。
  2. MCP schema 仅要求非空字符串，不表达“只能是 `CAPTURE_ALL_EXPORT_DIR` 内相对路径”（`src/mcp/schemas.ts:115-129`）。
  3. `/mcp/command` 在目标路由前调用 `safe_output_path`，写文件前再次调用（`src/bridge/server.ts:504-509,536-549`）。`safe_output_path` 使用 `resolve(base, raw)` 并拒绝 base 外路径，因此指南示例在绝大多数环境必定得到 HTTP 400 / `INVALID_QUERY`（`src/bridge/server.ts:841-869`）。
  4. 对合法相对路径，例如默认环境下首次调用 `output_path: "export.json"`，`safe_output_path` 会先执行 `realpath(base)`（`src/bridge/server.ts:848`）；但只有自动输出路径会提前 `mkdir(dir, { recursive: true })`（`src/bridge/server.ts:823-826`）。默认导出目录尚不存在时，`realpath` 抛 `ENOENT`，顶层转成 HTTP 500 / `BRIDGE_UNAVAILABLE`（`src/bridge/server.ts:582-593`）。
  5. 即使 base 已存在，`nested/export.json` 的父目录不存在时，校验会通过，但 `writeFile` 在 `src/bridge/server.ts:874-883` 失败并返回 500。
  6. t137 测试通过 `mkdtemp` 预先创建所有 base（`tests/unit/t137_bridge_security.test.ts:16,95,101`），因此未覆盖默认目录首次使用或嵌套父目录缺失。
- **影响**：文档中合法调用变成 breaking behavior；新安装或清理过临时目录的环境，首次显式相对路径导出也可能失败。调用方无法仅凭 MCP schema 预先发现限制，错误在较深 HTTP 边界才出现。
- **修复建议**：
  1. 明确选择并发布单一契约：建议把 `output_path` 定义为“导出根目录内相对路径/文件名”，指南删除任意绝对路径示例，并解释返回的实际绝对 `file_path`。
  2. MCP schema 增加相对路径、禁止 `..`/绝对路径的校验，使错误在 tool 输入边界产生。
  3. `safe_output_path` 在 `realpath(base)` 前安全创建 base；写入嵌套路径时，在 containment/symlink 校验不退化前提下创建目标父目录并再次校验。
  4. 补默认目录不存在、合法相对路径、嵌套目录、base/parent symlink 四类测试。
- **History / pre-existing**：绝对路径能力与文档由 `da722d5` / `5649916` 引入；目录 containment 由 `7daf059 security(t137)` 引入。绝对路径不兼容和首次目录 500 属于 t137 后的新回归；父目录创建语义此前已不明确。
- **证伪说明**：t137 已有效阻止绝对路径和 `..`/symlink 逃逸，未发现任意文件写入，因此不定 High；问题是安全修复后契约和初始化路径未同步。

### BC-002 — `timeout_ms` 在 MCP schema、工具实现、Bridge 与文档间漂移

- **Severity**：Medium
- **Confidence**：High
- **Location**：
  - `src/mcp/schemas.ts:3-6`
  - `src/mcp/schemas.ts:45-64`
  - `src/mcp/tools.ts:33-52`
  - `src/mcp/client.ts:7-34`
  - `src/bridge/server.ts:519-525`
  - `src/bridge/server.ts:926-950`
  - `docs/guides/mcp_usage.md:24-28`
  - `docs/guides/mcp_usage.md:87-93`
  - `docs/blueprint/domain.md:122-137`
  - `tests/unit/mcp_schema.test.ts:24-29`
  - `tests/unit/mcp_schema.test.ts:301-325`
- **可复现证据与调用链**：
  1. MCP 共用 schema 只要求 `timeout_ms` 为正整数，没有 Bridge 的 300000ms 上限（`src/mcp/schemas.ts:4`）。例如 `timeout_ms: 300001` 会通过 MCP Zod，然后在 `/mcp/command` 被 Bridge 以 400 / `INVALID_QUERY` 拒绝（`src/bridge/server.ts:939-943`）。
  2. `get_status` 与 `list_browsers` schema 接受 `timeout_ms`（`src/mcp/schemas.ts:46-52`），但 `execute_mcp_tool` 两条分支完全不读取 arguments，直接调用 `client.get_status()`（`src/mcp/tools.ts:33-41`）。
  3. `BridgeMcpClient.get_status()` 固定使用 10 秒；普通 command 默认 120 秒，全量/导出默认 300 秒（`src/mcp/client.ts:7-34`）。
  4. 指南称 `get_status` 有 `timeout_ms`，且“所有工具支持”“显式传入始终优先”（`docs/guides/mcp_usage.md:24-28,87-93`），与 no-op 实现冲突。
  5. 当前 domain blueprint 又声明查询 30 秒、全量/导出 120 秒、start/stop 15 秒（`docs/blueprint/domain.md:128-137`），与 client/Bridge 的 120/300 默认值冲突。
  6. schema 测试只覆盖正负值及“所有工具接受 3000”，未覆盖 `300001`，也未验证参数实际传入 client（`tests/unit/mcp_schema.test.ts:24-29,301-325`）。
- **影响**：工具元数据会接受实际不可执行的值；status 类调用看似可配置，实际固定 10 秒；使用 blueprint 或指南估算超时的调用方会得到不同结果。错误可能表现为 Zod 成功后 HTTP 400，或合法的用户参数静默失效。
- **修复建议**：抽取共享 `MAX_COMMAND_TIMEOUT_MS = 300000`，MCP Zod 使用 `.max(...)`，Bridge 复用同一常量。`get_status` / `list_browsers` 要么把 timeout 传至 `BridgeMcpClient.get_status(timeout_ms)`，要么从 schema 与指南删除该参数。统一 blueprint、archived spec 与指南中的默认值，并增加 schema→tool→client 参数传递测试。
- **History / pre-existing**：MCP schema 无上限自早期实现存在；Bridge 上限由 `492a37e` 后加，未同步 MCP。status timeout 长期为 no-op；`325e93b` 只收紧未知键，未解决值域和消费问题。整体为 pre-existing 契约漂移。
- **证伪说明**：Bridge 最终仍强制 300000ms 上限，不会形成无界等待；因此不定 High。

### BC-003 — Bridge 未运行时校验 `AgentCommandResult`，畸形成功结果可原样进入 MCP

- **Severity**：Medium
- **Confidence**：High
- **Location**：
  - `src/shared/protocol.ts:17-43`
  - `src/shared/protocol.ts:52-57`
  - `src/extension/background/agent_bridge_client.ts:129-153`
  - `src/extension/background/agent_bridge_client.ts:321-348`
  - `src/bridge/server.ts:461-497`
  - `src/bridge/command_queue.ts:56-68`
  - `src/bridge/server.ts:519-553`
  - `src/mcp/client.ts:28-49`
  - `tests/unit/agent_bridge_server.test.ts:594-612`
- **可复现证据与调用链**：
  1. 共享线协议声明结果至少包含 `command_id: string`、`ok: boolean`，错误码须属于 `AgentErrorCode`（`src/shared/protocol.ts:17-57`）。
  2. 正常扩展生产方经 `dispatch_agent_command` 产生结果并发送，通常满足类型契约（`src/extension/background/agent_bridge_client.ts:129-153,321-348`）。但这是生产方实现事实，不是 HTTP 信任边界校验。
  3. `/extension/result` 对 JSON 仅执行 `as AgentCommandResult`，随后只用 `body.command_id` 检查 owner/queue；未验证 `command_id` 类型、`ok` boolean、`error.code`、成功/失败字段组合（`src/bridge/server.ts:469-489`）。
  4. 取得合法 pending `command_id` 后，可由对应已鉴权实例 POST：`{"command_id":"<pending>","ok":"yes","error":{"code":"BOGUS"}}`。owner 检查通过，queue 原样 `pending.resolve(result)`（`src/bridge/command_queue.ts:56-68`）。
  5. `/mcp/command` 对该结果返回 HTTP 200（`src/bridge/server.ts:525-553`）；MCP client 对所有 2xx body 直接 cast 为 `AgentCommandResult`（`src/mcp/client.ts:39-49`）。调用方最终收到违反公开 schema 的“成功”响应。
  6. 现有测试覆盖未知 `command_id`、实例 owner 和 body 大小，但未覆盖 malformed result；例如 `tests/unit/agent_bridge_server.test.ts:594-612` 仅验证未知 ID。
- **影响**：扩展 bug、版本错配或被同一实例 token 控制的进程可破坏 MCP 返回结构，导致 false success、错误码不可识别、调用方分支失效。Bridge 作为跨进程/跨版本边界，TypeScript cast 不能提供运行时兼容保证。
- **修复建议**：在 `/extension/result` 增加共享运行时 schema：验证 plain object、非空 `command_id`、boolean `ok`、合法 `AgentErrorCode`、`ok:true` 不带 error、`ok:false` 必须带 error；失败返回 400 / `INVALID_QUERY`，且不得 resolve/delete pending command。MCP client 也可对 Bridge 响应做防御性 parse。补畸形 `ok`、未知 error code、缺失 error、owner 合法但 body 非法测试。
- **History / pre-existing**：结果路由初始实现即以 cast 代替校验；后续只补 owner、大小和未知 ID 处理。pre-existing。
- **证伪说明**：默认扩展生产方走类型化 dispatcher，且 result 路由要求有效 instance token 与 command owner，外部未鉴权请求不能直接注入；攻击面受限，因此不定 High。

### BC-004 — 空闲态 `stop_recording` 返回成功和 `capture_id: null`，已声明的 `NO_ACTIVE_CAPTURE` 在真实调用链不可达

- **Severity**：Medium
- **Confidence**：High
- **Location**：
  - `src/shared/protocol.ts:17-37`
  - `src/extension/background/agent_command_dispatcher.ts:122-131`
  - `src/extension/background/service_worker.ts:689-713`
  - `docs/blueprint/domain.md:139-143`
  - `tests/unit/agent_command_dispatcher.test.ts:127-136`
- **可复现证据与调用链**：
  1. 协议和当前 domain 都声明扩展错误码 `NO_ACTIVE_CAPTURE`（`src/shared/protocol.ts:25`；`docs/blueprint/domain.md:139-143`）。
  2. dispatcher 先读取 `active_capture_id`，再调用 stop handler；只有 handler 返回 `success:false` 才映射为 `NO_ACTIVE_CAPTURE`（`src/extension/background/agent_command_dispatcher.ts:122-130`）。
  3. 真实 Service Worker 在 idle 状态显式返回 `{ success: true }`，`stop_capture_inner` 对 `!is_capturing` 也返回成功（`src/extension/background/service_worker.ts:689-713`）。
  4. 因此空闲实例调用 MCP `stop_recording` 的实际结果是 `ok:true, data:{ capture_id:null, status:"stopped" }`，而不是声明错误。
  5. dispatcher 测试人为把 `stop_capture` mock 为 `{ success:false }`，只证明映射分支存在，没有触达真实 SW 语义（`tests/unit/agent_command_dispatcher.test.ts:127-136`）。
- **影响**：调用方无法区分“本次真正停止一个 capture”和“原本已空闲”；`capture_id` 的实际 nullability 超出通常成功结果预期；公开错误码存在但真实生产链不产生，容易造成自动化状态机误判。
- **修复建议**：先明确产品语义。若 stop 非幂等，dispatcher 在调用 handler 前发现 `active_capture_id === null` 应直接返回 `NO_ACTIVE_CAPTURE`。若 stop 有意幂等，应删除/降级该错误码契约，并把成功 data 明确定义为 `capture_id: string | null`，同步文档和测试。不要同时保留两套含义。
- **History / pre-existing**：dispatcher 的失败映射自 2026-06 已存在；SW 至少自 2026-07 明确 idle success。`5f985fb` 仅将旧错误码重命名为新码。pre-existing 语义漂移。
- **证伪说明**：操作本身幂等且不会丢数据，问题主要是状态和错误契约，不定 High。

### BC-005 — MCP schema 未编码公开的 `source` / `sources` / `format` 枚举

- **Severity**：Low
- **Confidence**：High
- **Location**：
  - `src/mcp/schemas.ts:84-106`
  - `src/mcp/schemas.ts:122-129`
  - `src/extension/background/agent_data_queries.ts:14-21`
  - `src/extension/background/agent_data_queries.ts:43-51`
  - `src/extension/background/agent_data_queries.ts:179-185`
  - `src/extension/background/agent_command_dispatcher.ts:156-168`
  - `docs/guides/mcp_usage.md:48-52`
  - `docs/guides/mcp_usage.md:73-85`
  - `tests/unit/mcp_schema.test.ts:135-185`
  - `tests/unit/mcp_schema.test.ts:223-225`
- **可复现证据与调用链**：
  1. 指南公开七种 data source 和四种 export format（`docs/guides/mcp_usage.md:48-52,73-85`）。
  2. 扩展实现也仅支持七种 source（`src/extension/background/agent_data_queries.ts:14-21,43-51`），无效 source 最终抛 `SOURCE_NOT_FOUND`（`src/extension/background/agent_data_queries.ts:179-185`）；export dispatcher 仅支持 `json/jsonl/html/har`（`src/extension/background/agent_command_dispatcher.ts:156-168`）。
  3. MCP schema 却使用任意非空 string / string array：`source: z.string()`、`sources: z.array(z.string())`、`format: z.string()`（`src/mcp/schemas.ts:84-106,122-129`）。
  4. 测试把并非真实 source 的 `"network"` / `"console"` 固化为正例，并明确要求 `csv` 通过 schema（`tests/unit/mcp_schema.test.ts:135-185,223-225`）。
- **影响**：MCP tool schema 无法向 Agent 暴露可选值，非法调用会跨过 MCP/Bridge 后才在扩展失败；错误正例测试进一步阻碍契约收紧。
- **修复建议**：定义共享 `AGENT_DATA_SOURCES` 与 `EXPORT_FORMATS` const tuple；类型、MCP `z.enum`、dispatcher 和文档均复用同一来源。把 `network`/`console`/`csv` 正例改为拒绝测试，并覆盖 timeline sources 数组元素。
- **History / pre-existing**：早期 schema 即有意 passthrough；`325e93b` 只把顶层对象改 `.strict()`，未收紧值域。pre-existing。

### BC-006 — `save_user_config` 未在写入边界 sanitize，违反当前生效 spec

- **Severity**：Medium
- **Confidence**：High
- **Location**：
  - `docs/specs/user_config.md:1-26`
  - `src/shared/user_config.ts:378-431`
  - `src/shared/user_config.ts:434-464`
  - `src/extension/background/service_worker.ts:290-295`
  - `src/shared/logger.ts:143-149`
  - `tests/unit/user_config_persistence.test.ts:35-219`
- **可复现证据与调用链**：
  1. 当前生效 spec 明确要求 `user_config` 所有字段“经 `sanitize_user_config` 白名单校验后落库”（`docs/specs/user_config.md:1-4`），并列出值域和读写语义（`docs/specs/user_config.md:5-26`）。
  2. sanitizer 已完整实现（`src/shared/user_config.ts:378-431`），`load_user_config` 返回前会调用它（`src/shared/user_config.ts:434-455`）。
  3. `save_user_config` 却只执行 `{ ...current, ...patch }` 后原样 `chrome.storage.local.set`，没有 sanitize 或 reject（`src/shared/user_config.ts:460-464`）。`Partial<UserConfig>` 仅是编译期约束，不能保护 runtime message、JS 调用方、导入数据或未来版本错配。
  4. `set_log_level` 消息分支在 truthy 检查后把任意 `payload.level` cast 为 `LogLevel`，直接设置全局 logger 并直接写 storage（`src/extension/background/service_worker.ts:290-295`）；`Logger.set_level` 本身无运行时校验（`src/shared/logger.ts:143-149`）。例如 payload `{level:"verbose"}` 可令当前运行态和原始 storage 持有非法值，直到下一次 load 才回退。
  5. persistence tests 全部从预置 raw storage 调用 `load_user_config`，或用合法 patch 验证字段保留；未测试非法 patch 的落库结果（`tests/unit/user_config_persistence.test.ts:35-219`）。
- **影响**：持久化原始值和当前运行态可短期偏离 `UserConfig` 契约；消费方若绕过 `load_user_config`，或在同一生命周期使用已设置的 logger level，会观察到非法状态。也使“写入即合法”的生效 spec 不成立。
- **修复建议**：`save_user_config` 对合并后的对象调用 `sanitize_user_config` 再落库；对外部消息边界最好显式拒绝非法 patch，而不是静默回退。`set_log_level` 使用共享 enum guard，并统一调用 `save_user_config({ log_level })`。增加非法 enum/number/type patch 不得进入 storage，以及非法 `set_log_level` 返回失败的测试。
- **History / pre-existing**：`save_user_config` 当前写法可追溯至 `bdcfcdaa`；T060 后只增强 load 边界，未补 save。pre-existing，且与现行 spec 存在直接冲突。
- **证伪说明**：正常 TypeScript UI 调用受静态类型约束，后续 load 也会 sanitize，影响受限；不构成持久化代码执行或权限提升，因此不定 High。

### BC-007 — 文档宣称 IndexedDB v3 为 10 stores，fresh DB 实际创建 14 stores

- **Severity**：Low
- **Confidence**：High
- **Location**：
  - `src/shared/constants.ts:4-18`
  - `src/extension/background/storage.ts:26-65`
  - `src/extension/background/storage.ts:65-131`
  - `docs/blueprint/architecture.md:14-17`
  - `docs/blueprint/architecture.md:29-36`
  - `docs/blueprint/domain.md:126`
  - `docs/blueprint/decisions.md:60-65`
  - `docs/archive/specs/storage.md:5-27`
  - `docs/archive/specs/storage.md:56-61`
- **可复现证据与调用链**：
  1. 当前 constants 列出 10 个现代 stores，`DB_VERSION = 3`（`src/shared/constants.ts:4-18`）。当前 blueprint/ADR 也明确写“v3，10 stores”（`docs/blueprint/architecture.md:14-17,29-36`；`docs/blueprint/domain.md:126`；`docs/blueprint/decisions.md:60-65`）。
  2. `onupgradeneeded` 无条件检查并创建四个 legacy stores：`sessions`、`events`、`console_logs`、`error_log`（`src/extension/background/storage.ts:39-64`），随后再创建 10 个现代 stores（`src/extension/background/storage.ts:65-131`）。
  3. 因逻辑不检查 `event.oldVersion`，全新数据库从 0 升 v3 时也会创建四个 legacy stores，最终 `objectStoreNames.length === 14`；升级用户同样会保留这些 stores。
  4. archived storage spec 虽要求旧库升级“不丢 records、保留旧 stores”（`docs/archive/specs/storage.md:56-61`），但也把 object stores 定义为 10 个（`docs/archive/specs/storage.md:12-27`），没有区分 fresh schema 与兼容遗留 schema。
- **影响**：schema inspection、迁移工具、容量分析和未来版本迁移会基于错误 store count；fresh install 永久携带无用途 legacy schema，增加下一次 breaking migration 的判断复杂度。
- **修复建议**：先定义两个明确契约：fresh vNext schema 与旧库升级后的兼容 schema。若 fresh 应只有 10 stores，应通过新的 `DB_VERSION` 和 `oldVersion` 分支设计迁移，不能在 v3 内悄悄改变；遵守 ADR 007，不得直接删除含 records 的旧 store。若 14 stores 是有意状态，则更新 blueprint/ADR/常量说明并增加 fresh/upgrade schema 测试，明确 10 active + 4 legacy。
- **History / pre-existing**：legacy 与现代 store 同时创建由 `c88c556` 引入；`DB_VERSION=3` 自 `6a7b094`。后续文档固化为 10 stores。pre-existing 实现/文档漂移。

### BC-008 — IndexedDB 长连接未处理 `versionchange`，未来 schema bump 可能被旧上下文阻塞

- **Severity**：Low
- **Confidence**：High
- **Location**：
  - `src/extension/background/storage.ts:20-40`
  - `src/extension/shared/capture_data_reader.ts:1-35`
  - `docs/blueprint/decisions.md:60-65`
  - `docs/archive/specs/storage.md:63-66`
- **可复现证据与调用链**：
  1. `storage.ts` 以模块全局 `db` 缓存连接，`onsuccess` 后直接 resolve；没有注册 `db.onversionchange` 来 close/reset，也没有 `request.onblocked` 可观测分支（`src/extension/background/storage.ts:20-40`）。
  2. Dashboard 页面侧直接 import background storage 读取 IndexedDB（`src/extension/shared/capture_data_reader.ts:1-35`），因此 Service Worker 与页面上下文可能分别持有长连接。
  3. 下一次提高 `DB_VERSION` 时，任一旧上下文连接未关闭都会使 upgrade request 进入 blocked，直到上下文销毁；当前代码既不主动关闭，也不报告 blocked 原因。
  4. ADR 007 要求版本化升级并保留历史数据（`docs/blueprint/decisions.md:60-65`）。历史 storage spec 甚至明确写 `db.onversionchange` 自动 close（`docs/archive/specs/storage.md:63-66`），但实现没有该行为。
- **影响**：当前 v3 正常运行不受影响；未来 schema migration 发布后，部分用户可能遇到初始化悬挂、Dashboard/SW 互相阻塞，只能关闭页面或重启浏览器恢复。这会把下一次 schema bump 变成难诊断的 breaking rollout。
- **修复建议**：成功 open 后设置 `db.onversionchange = () => { db?.close(); db = null; }`；增加 `request.onblocked` 日志/状态反馈。建议同时缓存 opening promise，避免 db 尚未赋值时多个调用并发 open。补两个连接下触发版本升级、旧连接自动关闭的测试。
- **History / pre-existing**：连接缓存和 open 流程自初始 storage 实现即存在。pre-existing；当前无 schema bump，属于下一次 breaking change 前应处理的迁移风险。
- **证伪说明**：`DB_VERSION` 当前固定为 3，问题不会在无升级时触发，因此定 Low。

### BC-009 — 多实例未指定目标的公开错误码文档与实现不一致

- **Severity**：Low
- **Confidence**：High
- **Location**：
  - `src/shared/protocol.ts:33-37`
  - `src/bridge/server.ts:75-123`
  - `docs/guides/deployment.md:72-80`
  - `docs/blueprint/decisions.md:67-72`
  - `docs/archive/specs/mcp_server.md:29-36`
- **可复现证据与调用链**：
  1. `resolve_target` 在多个 online 实例且未给 target 时返回 `TARGET_REQUIRED`（`src/bridge/server.ts:107-123`）；`TARGET_AMBIGUOUS` 只用于显式 `target_label` 命中多个实例（`src/bridge/server.ts:96-103`）。
  2. archived MCP spec 记录的语义与实现一致：多实例未指定为 `TARGET_REQUIRED`，显式 label 非唯一为 `TARGET_AMBIGUOUS`（`docs/archive/specs/mcp_server.md:29-36`）。
  3. 当前 deployment guide 却称“多实例未指定时返回 `TARGET_AMBIGUOUS`”（`docs/guides/deployment.md:72-80`）；当前 ADR 008 也保留同一旧表述（`docs/blueprint/decisions.md:67-72`）。
- **影响**：按文档处理错误码的 Agent/脚本会监听错误分支，无法给出正确的“必须指定 target”恢复提示；错误码兼容说明自身不可信。
- **修复建议**：以当前代码与 archived MCP spec 的更细粒度语义为准，更新 deployment guide 和 ADR：未指定目标=`TARGET_REQUIRED`；显式 label 非唯一=`TARGET_AMBIGUOUS`。增加文档契约或 server test，固定两种情形。
- **History / pre-existing**：browser label 路由设计阶段曾使用 `TARGET_AMBIGUOUS` 描述无 target 场景，后续实现拆分出 `TARGET_REQUIRED`，部分文档未同步。pre-existing 文档漂移。

### BC-010 — Bridge timeout 配置字段缺少运行时 parse 校验

- **Severity**：Low
- **Confidence**：High
- **Location**：
  - `src/shared/protocol.ts:59-66`
  - `src/bridge/config.ts:6-37`
  - `src/bridge/config.ts:40-64`
  - `src/bridge/server.ts:519-525`
  - `src/bridge/command_queue.ts:45-68`
  - `tests/unit/agent_bridge_config.test.ts:21-63`
- **可复现证据与调用链**：
  1. `parse_bridge_config` 对 host、port、token 做运行时校验，但 `command_timeout_ms` / `full_data_timeout_ms` 只用 nullish default 后原样返回（`src/bridge/config.ts:14-37`）。
  2. 因此程序化调用 `parse_bridge_config({port:17831,token:"x",command_timeout_ms:-1,full_data_timeout_ms:Infinity})` 会成功产生违反共享 `AgentBridgeConfig` 语义的配置。
  3. server 把这些值作为默认 timeout 交给 queue（`src/bridge/server.ts:519-525`），queue 最终交给 `setTimeout`；负数、非整数、Infinity/超大值会被 JS timer 归零、截断或产生运行时 warning，行为与 120/300 秒契约不符。
  4. 当前 CLI parser 只接收 port/token（`src/bridge/config.ts:40-64`），所以普通 CLI 用户暂时无法直接传入非法 timeout；风险主要位于程序化 server 调用和未来 config 接线。
  5. config tests 只验证 host/port/token 与默认 timeout，不覆盖 timeout 非法值（`tests/unit/agent_bridge_config.test.ts:21-63`）。
- **影响**：测试、嵌入式启动或未来配置入口可让命令立即 timeout、异常长等待或出现平台相关 timer 行为；共享 config type 给出虚假安全保证。
- **修复建议**：在 `parse_bridge_config` 验证两个 timeout 为 finite positive safe integer，并与公开上限统一（建议 `<= 300000`）；抽取与 Bridge request/MCP schema 共用常量。补 0、负数、小数、NaN、Infinity、超过上限测试。
- **History / pre-existing**：timeout 字段引入后一直缺校验；T063 只补了每次 command request 的 `timeout_ms`，未覆盖 server config。pre-existing。
- **证伪说明**：当前 CLI 不暴露这两个参数，默认值合法，生产触发面有限，因此定 Low。

---

## Strengths

- UI 消息已集中到 `src/shared/message_contract.ts` 的 `{ action, payload }` / `{ success, data?, error? }` 映射，`tests/unit/sw_action_contract.test.ts` 对 Service Worker action 覆盖形成门禁，减少跨页面消息名和返回形状漂移。
- Bridge 已实现 loopback 绑定、token/origin 校验、instance owner 校验、1 MiB 普通 body 与 64 MiB result body 限额、结构化 HTTP error、300000ms timeout 上限。
- t137 的 `output_path` containment + `realpath` symlink 收敛有效封堵已知任意路径写入；BC-001 是公开契约和初始化遗漏，不是否定该安全修复。
- MCP 顶层 Zod schema 已使用 `.strict()`，嵌套 capture config 使用 `.strip()`；dispatcher 对 config 和 query 仍有第二层运行时检查，形成部分纵深防御。
- IndexedDB 写入路径重视 durability：立即 flush、事务完成后确认、失败 batch 回填、跨 store 删除事务等语义已有测试和文档约束。
- Agent 查询对部分旧 storage 形状保留 fallback，Bridge 实例顶替会 cancel pending command，体现跨版本与生命周期兼容意识。

## 未覆盖区域

- 未启动 Chrome 扩展、Bridge 或 MCP 进程，未做真实端到端 wire capture。
- 未运行 unit/E2E/coverage；所有复现步骤基于静态调用链与现有测试缺口分析。
- 未审查 UI 视觉、采集准确性、性能、隐私脱敏算法、CDP 数据完整性等非“契约与 Breaking”主题。
- 未验证操作系统差异下 `realpath`、临时目录、文件权限和 timer clamp 的具体错误文本。
- archived specs 仅用于历史与兼容判断，不视为当前生效 spec；当前有效约束以 `docs/specs_index.md`、`docs/specs/` 与 blueprint/guides 为主。
