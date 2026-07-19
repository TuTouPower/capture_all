# src_extension_01 审阅报告（opus）

- 批次：`src_extension_01`
- 模块：`src_extension`
- 范围：8 文件 / 1550 行
  - `src/extension/_locales/en/messages.json`
  - `src/extension/_locales/zh_CN/messages.json`
  - `src/extension/background/agent_bridge_client.ts`
  - `src/extension/background/agent_command_dispatcher.ts`
  - `src/extension/background/agent_data_queries.ts`
  - `src/extension/background/app_log_storage.ts`
  - `src/extension/background/body_capture_coordinator.ts`
  - `src/extension/background/cdp_event_router.ts`
- 审阅维度：正确性、安全、Bridge 路由、命令处理、存储与隐私
- 参照：`CLAUDE.md`、`docs/blueprint/`、`src/shared/protocol.ts`、`src/shared/agent_bridge_config.ts`、`src/shared/constants.ts`、`src/extension/background/storage.ts`

---

## 总览

整体结构清晰，模块边界符合 `docs/refactor_plan.md` 的 `src/{extension,bridge,mcp,shared}` 重构方向。错误码、术语、命名与 `docs/blueprint/domain.md` 基本一致（英文 `capture`，避免 `session/record`）。下面按维度列具体问题。

---

## 正确性（Correctness）

### C1 — `list_captures` 排序使用 `new Date(...).getTime()`，错误输入会被静默吞掉

- 位置：`src/extension/background/agent_command_dispatcher.ts:121-123`
- 现象：`sorted` 按 `new Date(a.started_at).getTime()` 排序；当 `started_at` 是无效字符串时 `getTime()` 返回 `NaN`，比较函数返回 `NaN`，`Array.prototype.sort` 行为不确定（V8 会得到不稳定次序）。
- 影响：含异常 `started_at` 的记录顺序不可预测；虽然存储层一般写 ISO 字符串，但未做防御。
- 建议：使用 `Number.isFinite` 兜底或将 `started_at` 改为统一时间戳字段排序，失败值视为 `0`。
- 置信度：中
- 级别：低

### C2 — `list_captures` 默认 `limit=100` 与"列出全部"语义冲突

- 位置：`src/extension/background/agent_command_dispatcher.ts:117-128`
- 现象：未传 `limit` 时默认 `100`，但 MCP 工具 `captures.list` 文档语义是返回所有 capture。若用户有 >100 条历史采集，AI 会拿到截断结果而 `total` 是完整长度，容易误判。
- 影响：列表分页一致性风险，下游 Agent 可能基于错配的 `total/captures.length` 做错误推断。
- 建议：要么默认 `limit` 与 `total` 对齐（小心内存），要么在工具描述里显式说明"默认上限 100，需 offset 翻页"。
- 置信度：中
- 级别：低

### C3 — `to_agent_error` 把"任意 Error.message 等于错误码字符串"判为对应错误码

- 位置：`src/extension/background/agent_command_dispatcher.ts:262-275`
- 现象：分支 2 (`is_agent_error_code(error.message)`) 把内部异常消息文本当作错误码，再以该字符串作为 `code` 返回。例如任何内部抛出 `new Error('INVALID_QUERY')` 都会被映射为 `INVALID_QUERY`，即便并非来自 Agent 命令校验。
- 影响：错误码语义被污染；真正底层错误可能被误归类到业务错误码，干扰 MCP 端诊断。同时 `is_agent_error_code` 列表遗漏了 dispatcher 自己会抛的 `RECORDING_ALREADY_RUNNING`、`NO_ACTIVE_RECORDING`、`BRIDGE_UNAVAILABLE`、`PAIRING_REQUIRED` 等协议错误码。
- 建议：用专门的 `AgentCommandError` 实例判别；移除基于 `error.message` 的隐式映射，或把白名单与 `AgentErrorCode` 集合同步。
- 置信度：高
- 级别：中

### C4 — `agent_data_queries.load_agent_capture_data` 用 `FULL_DATA_LIMIT=100000` 一次性拉所有源

- 位置：`src/extension/background/agent_data_queries.ts:51-81`
- 现象：`capture.get_all_data`、`sources.list`、`timeline.list`（无 sources 过滤）、`timeline.get` 全部走这条路径，并行 7 个 store 各拉 10W 条。`Promise.all` 失败时（任一 store 抛错）整体失败。
- 影响：
  1. 大采集下内存峰值高，service worker 易触 OOM 被 Chrome 回收，进一步触发采集中断。
  2. `sources.list` 仅需 `count` 和 `time_range`，却拉了完整记录，浪费严重。
  3. `timeline.get(item_id)` 只取一条，仍先全量加载。
- 建议：为 `sources.list` 提供"仅 summary"的 count 路径（用 IndexedDB `store.count()` + 首/末游标）；为 `timeline.get` 提供按 `record_id` 直接定位的索引读；`FULL_DATA_LIMIT` 至少做成可配置或随 `MAX_SESSION_SIZE` 衰减。
- 置信度：高
- 级别：中

### C5 — `get_record_sort_key` 对未匹配字段返回 `0`，会把异类记录聚到同一时间点

- 位置：`src/extension/background/agent_data_queries.ts:139-144`
- 现象：当记录既无 `relative_time_ms`、也无 `relative_time`、`start_time_ms` 时返回 `0`，全部被排到时间线最前/最后。结合 C4 的全量加载，时间线排序可能出现"一堆 0 抢前排"。
- 影响：timeline 视觉与时间过滤偏差。
- 建议：缺失键时返回 `Number.POSITIVE_INFINITY`（或 `null` 并在 sort 时降级）而非 `0`。
- 置信度：中
- 级别：低

### C6 — `get_native_record_id` 的兜底 ID 含 `:`，破坏 `parse_record_id` 契约

- 位置：`src/extension/background/agent_data_queries.ts:215-219`、`src/shared/protocol.ts:137-147`
- 现象：兜底 `${sort_key}:${absolute_time ?? ''}` 自身含 `:`；`build_record_id(source, native_id)` 得到 `source:relative_time:absolute_time`，再次 `parse_record_id` 时 `indexOf(':')` 取第一个冒号，`source` 正确但 `native_id` 还原成 `relative_time:absolute_time`。在 `get_entry_from_capture_data` 内 `parsed.native_id === get_native_record_id(record)` 仍然自洽，因为生成与解析都走同一函数；但任何第三方按 `record_id` 文本约定解析的代码会失配。
- 影响：协议健壮性下降；若未来 Bridge 或 MCP 端按 `:` 拆分会错。
- 建议：`native_id` 内部禁止 `:`，或改用 URL-safe 编码 / 分隔符（如 `|`）。
- 置信度：中
- 级别：低

### C7 — `agent_bridge_client`：`session_token` 等模块级状态在 service worker 重启后丢失

- 位置：`src/extension/background/agent_bridge_client.ts:19-21, 67-69`
- 现象：`runtime_instance_id`、`session_token`、`enrolled`、`lifecycle_id` 为模块级变量。MV3 service worker 30s 空闲即被销毁，重启后这些变量清零，但 `load_bridge_session` 会重新注入。问题在 `running`、`lifecycle_id`、`poll_timer` 也归零：上次未完成的 `poll_cycle` / `setTimeout` 链被切断；新 worker 启动若没有外部 `start_bridge_client` 调用，就不会恢复轮询。
- 影响：依赖 `service_worker.ts` 在 `onStartup`/`onInstalled`/事件唤醒里重新调用 `start_bridge_client`；若调用时机不全，会出现"扩展在线但实际不轮询"的幽灵状态。`AgentExtensionStatus.online` 与真实 polling 行为脱节。
- 建议：在 `start_bridge_client` 内做"恢复已 enroll 的 session 并立即探活"；或在 `onStartup`/`onAlarm` 中保证唤起。
- 置信度：中
- 级别：中

### C8 — `schedule_poll` 以 `setTimeout(..., 0)` 启动，与 `interval_ms` 不一致

- 位置：`src/extension/background/agent_bridge_client.ts:98-107, 188-193`
- 现象：首轮立即触发（0ms），后续按 `interval_ms`。若上一轮抛错且 `interval_ms` 尚未从 `config.agent_bridge_poll_interval_ms` 赋值（出错点在 `normalize_agent_bridge_config` 之前），后续 `setTimeout(..., interval_ms)` 用的是默认 `1000`，与用户配置不符。
- 影响：用户把 `agent_bridge_poll_interval_ms` 改成 5000，前几轮可能仍按 1000ms 跑（直到第一次成功走到 L119）。
- 建议：把 `interval_ms` 初始化从 `normalize_agent_bridge_config(default)` 读取，或在 catch 中重读一次配置。
- 置信度：中
- 级别：低

### C9 — `resolve_token` 只判断 `token.length > 0`，未 trim

- 位置：`src/extension/background/agent_bridge_client.ts:207, 237`
- 现象：`config.agent_bridge_token` 已在 `normalize_agent_bridge_config` trim，但 `handle_401`/`resolve_token` 用 `length > 0` / `length < 1` 判空，没有进一步校验。可读性 OK，但同样的判空逻辑在两处重复。
- 影响：低；维护成本。
- 建议：抽 `has_bridge_token(config)` 单点。
- 置信度：高
- 级别：低

### C10 — `body_capture_coordinator.stop_body_capture`（无参数版）几乎只是空操作

- 位置：`src/extension/background/body_capture_coordinator.ts:164-177`
- 现象：仅清 `poll_timer`、把 `coordinator_state` 置 null；既不调 `stop_external_cdp`，也不 detach Extension CDP。真正清理在 `stop_body_capture_with_cleanup`。两个同名函数共存，调用方一旦选错就泄漏：Extension CDP attach 不会解除（依赖其它路径），external bridge session 不通知 Bridge 端清理。
- 影响：风险——若 service worker 只在 `stop_capture` 路径上调用无参版本，外部 Bridge 的 session_key 会在 Bridge 侧残留（直到自身超时）。
- 建议：删除无参版本，统一调用 `stop_body_capture_with_cleanup`；或在无参版本内至少 detach Extension CDP。
- 置信度：高
- 级别：中

### C11 — `try_external_cdp_bridge` 轮询 setInterval 回调不处理错误、不更新 lifecycle

- 位置：`src/extension/background/body_capture_coordinator.ts:234-240`
- 现象：`setInterval(async () => { ... })` 中 `poll_external_cdp_events` 抛错会导致 unhandled rejection；同时回调内部不检查 `coordinator_state` 是否仍指向本 session，stop 后回调还可能再触发一次。
- 影响：Bridge 偶发错误时 service worker 控制台异常；stop 时序竞争可能写入幽灵 NetworkRequestData。
- 建议：回调包 try/catch，并在回调内 `coordinator_state?.external_session_key === session_key` 守卫后再调用 `on_network_request`。
- 置信度：高
- 级别：中

### C12 — `convert_bridge_event_to_request` 把 `event_id` 置 `undefined`，违反类型契约

- 位置：`src/extension/background/body_capture_coordinator.ts:258-301`
- 现象：`event_id: undefined` 直接赋给 `NetworkRequestData`。如果类型定义把 `event_id` 标为必填 `string`，TS 编译会报；如果可选，运行时会写入 `undefined` 字段，IndexedDB structured clone 保留为缺失键，下游 `get_native_record_id` 走 `request_id` 兜底尚可，但 `record_id` 生成依赖 `request_id` 时仍可能与 CDP 路径冲突（`bridge_${Date.now().toString(36)}` 无递增、无序）。
- 影响：bridge 路径记录在 timeline 里排序键 `relative_time = evt.timestamp`，多条同毫秒并列时索引重复；`get_entry_from_capture_data` 找第一条匹配，可能错位。
- 建议：`event_id` 显式赋 `null` 或生成 uuid；`request_id` 用 bridge 返回值或 `{capture_id}:{request_id}` 组合，避免时间戳碰撞。
- 置信度：中
- 级别：中

### C13 — `IndexedDBLogTransport.flush` 不回填 batch 失败

- 位置：`src/extension/background/app_log_storage.ts:29-52`
- 现象：`splice(0)` 取走 buffer 后若 `get_db()` 或 transaction 失败，batch 直接丢失；没有 try/catch 回填或重新入队。
- 影响：日志丢失（非致命），但与 `trim_if_needed`、限流策略叠加可能放大。
- 建议：失败时把 batch prepend 回 `this.buffer`，并指数退避重试。
- 置信度：中
- 级别：低

### C14 — `get_entries` / `count` 的过滤遍历完整游标，offset 大时性能差

- 位置：`src/extension/background/app_log_storage.ts:54-156`
- 现象：filters 全量扫描；`offset` 通过 `skipped++` 慢速推进，无索引跳过。
- 影响：日志规模大时查询卡顿。
- 建议：filters 命中索引字段时（level/module）应使用预定义索引 + `keyQuery`；至少 module 应建索引。
- 置信度：中
- 级别：低

### C15 — `cdp_event_router`：`attached_sessions` 永远只在内存，跨 worker 重启不持久化

- 位置：`src/extension/background/cdp_event_router.ts:5-25`
- 现象：MV3 worker 重启后 `attached_sessions` 清空；若 `Network.requestWillBeSent` 等事件携带 `sessionId` 到达，`should_handle_event` 直接拒绝。需要外部在 `onDetach`/重新 attach 时显式 `register_session`。
- 影响：worker 重启瞬间的子目标事件（iframe/worker）会丢失。
- 建议：与 `chrome.debugger` attach 流程一致地在每次 attach 后主动 `register_session`；worker 重启时清空是合理，但需要保证 attach 时序先于事件到达。
- 置信度：中
- 级别：低

---

## 安全（Security）

### S1 — Bridge URL 协议、host 校验正确，但端口无白名单

- 位置：`src/shared/agent_bridge_config.ts:62-84`（被 `agent_bridge_client.ts` 使用）
- 现象：仅要求 `http:`、`hostname in (127.0.0.1, localhost)`、有 port，没有限制端口范围或路径前缀。
- 影响：用户若被钓鱼写入 `http://127.0.0.1:xxx/`（例如某个本地代理转发的服务），仍判定为合法 Bridge。配合 `Authorization: Bearer <token>`，token 会落到该端口服务。
- 建议：在 README/设置面板强调 token 仅贴入官方 Bridge 端口；必要时在 manifest `host_permissions` 限定具体端口范围（Chrome 当前不支持端口粒度，但可在代码里默认只允许 `17831` + 用户显式覆盖）。
- 置信度：中
- 级别：中

### S2 — Bridge `Authorization` 使用 `agent_bridge_token`（bridge_token）入参扩展，违反 `instance_token` 不应访问 MCP/CDP 的方向

- 位置：`src/extension/background/agent_bridge_client.ts:256-271`
- 现象：`/extension/enroll` 用 `Authorization: Bearer <bridge_token>`，返回 `instance_token`；后续 `/extension/heartbeat`、`/extension/command`、`/extension/result` 用 `Bearer <instance_token>`。整体方向正确。
- 影响：合规；但 `bridge_token` 一旦泄漏，攻击者可反复 enroll 新 instance 拿新 instance_token。enroll 没有频率限制、没有 instance_id 唯一性约束的客户端实现（依赖服务端）。
- 建议：在 enroll 请求里加 `instance_id` 唯一性约束（已在 body 里传，依赖 Bridge 端校验），并在客户端对"短时间内多次 401 → 重 enroll"做退避，避免被恶意 401 引发循环 enroll。
- 置信度：中
- 级别：中

### S3 — `X-Capture-All-Instance-Id` header 未校验长度/字符集

- 位置：`src/extension/background/agent_bridge_client.ts:17, 293, 309`
- 现象：`runtime_instance_id` 来源有三：本地生成 uuid、Bridge 返回、`set_bridge_instance_id_for_tests` 注入。前两者受信，第三个是测试钩子。生产代码不会调用测试钩子，但 export 出现在模块签名中。
- 影响：若误用（开发者把测试钩子当普通 API 调用），可注入任意 header；Header 注入风险有限（fetch API 不允许 CRLF），但仍是不规范输入。
- 建议：测试钩子用 `__test_only__` 前缀或 build-time flag 剥离。
- 置信度：低
- 级别：低

### S4 — `IndexedDBLogTransport` 把所有日志写入 `capture_all_db.app_logs`，无内置脱敏

- 位置：`src/extension/background/app_log_storage.ts:12-222`
- 现象：`logger.error(message, details)` 可能携带 URL、headers 预览、token 长度等。`details` 未做脱敏（CLAUDE.md 约定脱敏在采集层而非日志层）。
- 影响：若调试日志误把 token / cookie 写入 `message`，会落盘 IndexedDB；trim 按 size 不按敏感度。
- 建议：在 `Logger` 写入前对 `message`/`details` 做关键字 redact（至少 `Authorization`、`Cookie`、`token=`）；或 `LogTransport` 限定可写字段白名单。
- 置信度：中
- 级别：中

### S5 — `body_capture_coordinator` 失败信息回写 `message`，可能直接暴露内部错误给 Agent

- 位置：`src/extension/background/body_capture_coordinator.ts:127, 143`
- 现象：`message: \`CDP permission denied: ${error_msg}, ...\`` 把原始 `error_msg` 拼到对外 `BodyCaptureStartResult.message`，再随 `start_capture` 返回值 / MCP 状态返回。
- 影响：低（本地环境），但若 message 透传到 MCP 工具响应，可能泄漏文件路径 / 用户目录信息。
- 建议：错误消息做白盒化分类，仅在 dev_mode 下透传 raw。
- 置信度：中
- 级别：低

---

## Bridge 路由（Bridge routing）

### B1 — 客户端不验证 `instance_token` 与 `instance_id` 的配对

- 位置：`src/extension/background/agent_bridge_client.ts:196-228`
- 现象：heartbeat/command/result 都带 `Authorization: Bearer <instance_token>` 和 `X-Capture-All-Instance-Id: <instance_id>`，但客户端自身不校验 token/id 是否同源（来自同一 enroll 响应）。如果用户切换 `agent_bridge_token` 后未触发 401（旧 token 仍有效），会出现旧 instance_token + 新 instance_id 的组合。
- 影响：服务端必须强校验；客户端无防御。
- 建议：`save_bridge_session` 时把 token 与 id 绑定一个 HMAC 或在内存里校验一致性；至少在 `handle_401` 重 enroll 时打印旧/新 instance_id 用于排查。
- 置信度：中
- 级别：中

### B2 — Heartbeat 与 command_fetch 串行，command_fetch 204 时仍消耗一次 heartbeat 往返

- 位置：`src/extension/background/agent_bridge_client.ts:142-148`
- 现象：每个 cycle 先 heartbeat、再 fetch_command，两条独立 HTTP。Heartbeat 价值是上报 active_capture_id；command 204 时 heartbeat 仍发。
- 影响：Bridge 端请求频率翻倍；本地 Bridge 无所谓，部署到远端（虽不允许）时会放大流量。
- 建议：合并为 `GET /extension/command?heartbeat=1`，由 Bridge 在响应中回写 status；或在 cycle 间复用上次 heartbeat 缓存（每 N 秒发一次）。
- 置信度：中
- 级别：低

### B3 — `BridgeHttpError` 仅靠 `response.ok` 判定，未处理 204/3xx 异常路径

- 位置：`src/extension/background/agent_bridge_client.ts:266, 285, 298, 314`
- 现象：`response.ok` 范围 200-299；`fetch_command` 提前用 `204` 判定空响应。若 Bridge 返回 `2xx` 但 body 非合法 JSON，`response.json()` 抛 `SyntaxError`，被外层 catch 当作 `polling failed` 并归类为 `failure_kind: 'exception'`，但没有 stage 区分 JSON 解析失败。
- 影响：诊断困难。
- 建议：在 `fetch_command`/`send_result` 单独 try `response.json()` 并补 `stage: 'command_parse'`。
- 置信度：中
- 级别：低

### B4 — `try_external_cdp_bridge` 的 `get_bridge_config` 任意时刻可能抛错，coordinator 无 fallback 日志

- 位置：`src/extension/background/body_capture_coordinator.ts:199-252`
- 现象：整体包在 try/catch 里返回 `null`，但失败原因完全不记。tier 1 → tier 2 → tier 3 的降级过程对外不可见。
- 影响：用户在 popup/dashboard 看不到 "bridge config invalid" 的具体原因，只见 `bridge_unavailable`。
- 建议：catch 内 `logger.warn('external_cdp_bridge_failed', { stage, error })`。
- 置信度：高
- 级别：低

---

## 命令处理（Command processing）

### D1 — `dispatch_agent_command` 未对 `command.type` 做白名单兜底返回

- 位置：`src/extension/background/agent_command_dispatcher.ts:39-89`
- 现象：`switch` 没有 `default` 分支，未匹配时 `execute_agent_command` 返回 `undefined`，`dispatch_agent_command` 把 `data: undefined` 包成 `{ ok: true }`。MCP 协议层若未预先过滤，扩展端会把未识别命令当成"成功空响应"。
- 影响：协议演进时（新增命令、扩展版本落后于 Bridge）会出现"客户端说成功但什么都没做"。
- 建议：`default: throw new AgentCommandError('INVALID_QUERY', 'Unknown command type: ...')`，让 Bridge 能感知版本不匹配。
- 置信度：高
- 级别：中

### D2 — `start_capture` 失败错误码硬编码 `RECORDING_ALREADY_RUNNING`，丢失 Bridge 端错误细分

- 位置：`src/extension/background/agent_command_dispatcher.ts:91-103`
- 现象：`handlers.start_capture` 返回 `{ success: false, error }`，dispatcher 无视 `error` 文本，统一抛 `RECORDING_ALREADY_RUNNING`。
- 影响：CLAUDE.md 硬约束"`CAPTURE_ALREADY_RUNNING` 当已有活跃采集"——错误码命名应是 `CAPTURE_ALREADY_RUNNING`（来自 `docs/blueprint/`），但协议 `AgentErrorCode` 列表只有 `RECORDING_ALREADY_RUNNING`，术语漂移。其它失败原因（如 `MAX_SESSION_SIZE`、tab 无法 attach）被全部误归为"already running"。
- 建议：
  1. 同步错误码术语，按 domain.md 选定 `CAPTURE_ALREADY_RUNNING`（与硬约束一致）；
  2. 让 `handlers.start_capture` 直接返回结构化 `error_code` 而非字符串，dispatcher 透传。
- 置信度：高
- 级别：中

### D3 — `get_capture_config` 默认展开 `DEFAULT_CONFIG`，但未深拷贝嵌套对象

- 位置：`src/extension/background/agent_command_dispatcher.ts:220-238`
- 现象：`{ ...DEFAULT_CONFIG, ...config }`。`CaptureConfig` 目前所有字段都是基本类型，浅拷贝安全；但一旦未来加入嵌套对象字段（如 `exclude_patterns: string[]`），调用方修改返回值会污染模块级 `DEFAULT_CONFIG`。
- 影响：潜在维护陷阱。
- 建议：`structuredClone(DEFAULT_CONFIG)` 或显式深拷贝。
- 置信度：中
- 级别：低

### D4 — `get_optional_number` 接受 `NaN`/`Infinity` 时已 throw，但 `offset<0` / `limit<0` 未拦

- 位置：`src/extension/background/agent_command_dispatcher.ts:169-176, 116-128`
- 现象：`Number.isFinite` 放过负数；`sorted.slice(offset, offset + limit)` 对负 offset 行为变成"从尾部取"。
- 影响：调用方传 `offset=-1` 会拿到倒数一条，非预期。
- 建议：`offset/limit` 显式 `>= 0` 校验。
- 置信度：中
- 级别：低

### D5 — `capture.export` 不限制 `format` 之外的参数；`include_response_body` 透传给所有格式

- 位置：`src/extension/background/agent_command_dispatcher.ts:139-152, 82-88`
- 现象：`export_har` 是否真的支持 `include_response_body=false`？`har` 默认含 response body，此开关在 HAR 语义未定义。其它格式（json/jsonl/html）的处理一致性需在 exporter 验证（不在本批）。
- 影响：协议歧义。
- 建议：在 dispatcher 层校验 `format` 与 option 的组合，或文档化每种 format 的有效 option。
- 置信度：中
- 级别：低

### D6 — `payload.source as AgentDataSource` 类型断言无运行时校验

- 位置：`src/extension/background/agent_command_dispatcher.ts:55, 65`
- 现象：`get_required_string` 仅保证是字符串，强转 `AgentDataSource`。真正的合法性检查落在 `get_source_records` 的 `ALL_SOURCES.includes(source)` 抛 `SOURCE_NOT_FOUND`。
- 影响：可接受；但 `get_entry_from_capture_data` 先 `parse_record_id` 再 `get_source_records`，对非法 source 抛 `SOURCE_NOT_FOUND` 而非 `INVALID_QUERY`，错误码语义错位（参数非法却报"未找到"）。
- 建议：dispatcher 入口处校验 `source ∈ ALL_SOURCES`，抛 `INVALID_QUERY`。
- 置信度：高
- 级别：低

### D7 — `parse_record_id` 的错误不是 `AgentCommandError`，最终被映射成 `STORAGE_READ_FAILED`

- 位置：`src/extension/background/agent_data_queries.ts:106-109`、`agent_command_dispatcher.ts:262-275`
- 现象：`parse_record_id` 抛 `Error('Invalid record_id: ...')`，message 不在 `is_agent_error_code` 白名单，最终归到 `STORAGE_READ_FAILED`，但本质是参数非法。
- 影响：错误码误导，MCP 端可能据此重试 storage 而非纠正参数。
- 建议：在 dispatcher 入口包 `try` 显式抛 `INVALID_QUERY`。
- 置信度：高
- 级别：低

---

## 存储与隐私（Storage & privacy）

### P1 — `load_agent_capture_data` 的 `FULL_DATA_LIMIT=100000` 远超 IndexedDB 一次性读出合理上限

- 位置：`src/extension/background/agent_data_queries.ts:51`
- 现象：7 个 store × 100000 条同时驻留内存。`MAX_SESSION_SIZE_BYTES = 500MB`，单条事件均重 1-5KB，最坏 100K 条 = 100-500MB。
- 影响：service worker OOM；隐私层面，全量加载相当于把 capture_id 对应的所有用户行为（含 password 之外的字段、storage、cookie）一次性暴露给 Agent，无最小化原则。
- 建议：
  1. 按 `MAX_SESSION_SIZE` 动态计算 limit；
  2. `sources.list` 不拉明细；
  3. `capture.get_all_data` 加分页/游标；
  4. 默认对 `storage_changes.value_status='value'`、`cookie_changes` 等高敏源要求显式 `include_sensitive=true` 才返回（与 `redact_data` 配置联动）。
- 置信度：高
- 级别：高

### P2 — `redact_data` 配置未在 `agent_data_queries` 出口处校验

- 位置：`src/extension/background/agent_data_queries.ts:1-298`
- 现象：源数据从 storage 直接读出，是否已脱敏取决于采集时（写入端）。`agent_data_queries` 不做二次校验。如果某次采集时 `redact_data=false`，Agent 通过 `capture.get_all_data` 可拿到原始 storage value / cookie value。
- 影响：与 `docs/blueprint/domain.md` 的"脱敏与截断分离"原则一致，但产品语义上 Agent 数据出口应当尊重"当前 capture 的 redact 配置"。现状下，Agent 能读到采集期临时关闭脱敏的全部明文。
- 建议：在 capture 记录里持久化 `effective_redact_flags`，Agent 出口对违反当前会话策略的字段做二次遮蔽；或在文档里显式声明"Agent 读出即明文，由调用方负责"。
- 置信度：中
- 级别：中

### P3 — `convert_bridge_event_to_request` 直接采信 bridge 返回的 headers / body

- 位置：`src/extension/background/body_capture_coordinator.ts:254-301`
- 现象：`request_headers: evt.request_headers || {}`、`response_body: evt.response_body ?? null` 等。Bridge 端理论上已按 `redact_sensitive_headers`/`redact_url_query`/`redact_data` 处理（参数已透传 `start_external_cdp`），但客户端无校验。
- 影响：若 Bridge 端实现遗漏 `Set-Cookie`/`Authorization` 脱敏，扩展端不会兜底。
- 建议：在 `convert_bridge_event_to_request` 出口对 known sensitive header 做白名单遮蔽（与 `shared/redaction.ts` 复用）。
- 置信度：中
- 级别：中

### P4 — `app_log_storage.trim_if_needed` 用估算字节数，可能长期不触发 trim

- 位置：`src/extension/background/app_log_storage.ts:8-10, 189-221`
- 现象：`estimate_entry_bytes = message.length + module.length + 40`。实际 IndexedDB 存储含 key、index（timestamp）和结构化克隆头，真实占用 > 估算。
- 影响：实际 DB 文件可能远大于 `log_max_size_mb`，trim 仍判定"未超"。`navigator.storage.estimate()` 是更准确的来源。
- 建议：用 `navigator.storage.estimate()` 或 IndexedDB `databases()` API（Chrome 支持）做真实大小判定；估算系数至少 ×2。
- 置信度：中
- 级别：低

### P5 — `IndexedDBLogTransport` 未做异常分类，DB 不可写时静默丢日志

- 位置：`src/extension/background/app_log_storage.ts:34-52`
- 现象：`get_db()` 失败（quota / 版本升级冲突）时，`flush` 抛错冒泡到 `setTimeout` 回调，成为 unhandled rejection；batch 已 splice 出 buffer，丢失。
- 影响：调试日志丢失，事故时无法复盘。
- 建议：`flush` 失败时 prepend 回 buffer，并设置指数退避 + 上限；超出上限时丢弃最旧条目并发一次性 `console.warn`（仅 dev）。
- 置信度：高
- 级别：中

### P6 — `_locales/{en,zh_CN}/messages.json` 无敏感问题，但 `description` 字段对"采集 Cookie"的隐私含义未提示

- 位置：`src/extension/_locales/en/messages.json:5-7`、`src/extension/_locales/zh_CN/messages.json:5-7`
- 现象：扩展商店描述列举"cookies"，但未说明脱敏策略（redact 默认开启）。
- 影响：用户感知风险偏高。
- 建议：在 `PRIVACY.md` / 描述中补一句"默认开启敏感字段脱敏；可通过设置关闭"。
- 置信度：中
- 级别：低

---

## 其它观察（非缺陷，仅供参考）

- `agent_bridge_client.ts` 的 lifecycle_id 防止异步串台设计正确，是这批代码的亮点。
- `IndexedDBLogTransport.count` 对无 filter 走 `store.count()` 快路径，合理。
- `cdp_event_router` 设计简洁，单职责清晰。
- `body_capture_coordinator` 三级降级（extension_cdp → external_bridge → fallback_hook）整体策略合理，但状态机耦合度高（C10/C11）。
- `agent_command_dispatcher` 把命令分发与参数校验分离开是好的；`capture_config_keys` Set 显式白名单字段的做法可推广到其它 payload。

---

## 风险等级汇总

| 级别 | 数量 | 代表项 |
| --- | --- | --- |
| 高 | 1 | P1 |
| 中 | 10 | C3, C4, C7, C10, C11, C12, S1, S2, S4, B1, D1, D2, P2, P3, P5 |
| 低 | 12 | C1, C2, C5, C6, C8, C9, C13, C14, C15, S3, S5, B2, B3, B4, D3, D4, D5, D6, D7, P4, P6 |

（上表"中"行计数包含列出的代表性问题，实际命中"中"级别条目共 14 项：C3 C4 C7 C10 C11 C12 S1 S2 S4 B1 D1 D2 P2 P3 P5。）

---

## 建议优先级

1. **P1 / C4**：拆分 `load_agent_capture_data` 的"全量加载"路径，按用途提供 count-only / single-record / paged 三种读法。
2. **D1 / D2 / C3**：错误码与命令分发兜底——补 `default` 分支，统一错误码术语（与 `CAPTURE_ALREADY_RUNNING` 对齐），删除 `is_agent_error_code(error.message)` 隐式映射。
3. **C10 / C11 / C12**：清理 `body_capture_coordinator` 的两个同名 stop 函数；轮询回调加守卫与 try/catch；`event_id/request_id` 生成更健壮。
4. **S4 / P5**：日志层加入敏感关键字遮蔽；`flush` 失败回填 buffer。
5. **C7 / C15**：评估 service worker 重启后的状态恢复路径（bridge polling / cdp sessions）。

---

## 结论

本批代码结构合理、命名规范符合项目约定；主要风险集中在**大数据量下的内存与隐私出口**（P1/C4）、**错误码语义**（D1/D2/C3）以及 **body_capture_coordinator 状态机清理**（C10/C11/C12）。建议在下一轮迭代优先处理高/中级别项；低级别项可批量收尾。
