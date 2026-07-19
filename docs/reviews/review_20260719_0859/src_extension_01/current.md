# src_extension_01 全量审阅报告（current）

## 当前模型判断依据

- 路线：`current`
- 模型选择：继承主会话 `default_model`，未设置显式 model override。
- 可观测边界：运行时底层实际模型不可观测，因此不推断具体模型名称或版本。

## 审阅范围

按 `docs/review_20260719_0859/MANIFEST.md` 中 `src_extension_01` 清单逐文件审阅：

- `src/extension/_locales/en/messages.json`
- `src/extension/_locales/zh_CN/messages.json`
- `src/extension/background/agent_bridge_client.ts`
- `src/extension/background/agent_command_dispatcher.ts`
- `src/extension/background/agent_data_queries.ts`
- `src/extension/background/app_log_storage.ts`
- `src/extension/background/body_capture_coordinator.ts`
- `src/extension/background/cdp_event_router.ts`

检查维度：correctness、安全、Bridge 路由、命令处理、存储与隐私。为确认接口契约，仅只读追踪直接依赖和调用点；未读取任何其他审阅报告，未运行构建或测试，未修改源文件。

## 高优先级问题（CRITICAL / HIGH）

### 1. 命令执行成功但结果投递失败时不重试，产生“已执行但调用方收到超时”

- 位置：`src/extension/background/agent_bridge_client.ts:150-167`、`src/extension/background/agent_bridge_client.ts:303-315`
- 现象：扩展取出命令并完成 `dispatch_agent_command` 后，`send_result` 失败只写限频日志，不保留结果、不重试，也不阻止继续拉取后续命令。Bridge 已从待取队列移除该命令，最终只能等待命令超时。
- 影响：`capture.start`、`capture.stop` 等有副作用命令可能已经生效，但 MCP 调用方收到 `COMMAND_TIMEOUT`。调用方重试后可能得到“已有活跃采集”或“无活跃采集”，造成状态歧义、重复操作和自动化流程失真。
- 建议：引入按 `command_id` 持久或内存待投递结果队列；结果得到 Bridge 2xx 确认前持续重试，并在投递期间暂停获取新命令或保证严格顺序。Bridge 端同时应支持同一 `command_id` 幂等确认。
- 置信度：高
- 级别：HIGH

### 2. `browser_label` 修改后不会同步到已登记实例，路由长期使用旧标签

- 位置：`src/extension/background/agent_bridge_client.ts:196-205`、`src/extension/background/agent_bridge_client.ts:273-282`
- 现象：存在本地 Bridge session 时直接复用 `instance_token`，不会重新 enroll；heartbeat 仅发送 `instance_id`、版本和活跃 `capture_id`，不发送当前 `browser_label`。因此配置中标签修改后，Bridge 实例元数据仍保留登记时旧标签。
- 影响：按标签选择浏览器可能路由到错误实例，或新标签无法匹配；标签改名、解除标签、复用扩展配置均受影响。此问题直接破坏 Bridge label routing correctness。
- 建议：heartbeat 携带规范化后 `browser_label`，由 Bridge 原子更新；或把已登记标签写入 session，检测配置变化后用 MCP token 重新 enroll。需要覆盖标签修改、清空、重复标签冲突和 Bridge 重启场景。
- 置信度：高
- 级别：HIGH

### 3. “获取全部数据”及其上层查询对每类数据静默截断到 100000 条

- 位置：`src/extension/background/agent_data_queries.ts:51-67`、`src/extension/background/agent_command_dispatcher.ts:51-86`
- 现象：`load_agent_capture_data` 对七类数据统一使用固定 `FULL_DATA_LIMIT = 100000`。`capture.get_all_data` 直接返回该结果；`sources.list`、`data.list`、`data.get`、timeline 查询也先加载这份截断数据。没有 `truncated` 标记、总数提示或错误。
- 影响：大采集的数据会无提示丢失；来源计数错误，超过边界的 record 无法读取，timeline 和导出式全量调用不完整。“all data”语义与实际行为不符，可能导致分析结论错误。
- 建议：取消固定截断，改为 IndexedDB 游标分批读取/流式返回；若协议大小必须设上限，达到上限时返回明确 `PAYLOAD_TOO_LARGE` 或分页游标及 `truncated: true`，不得伪装完整结果。
- 置信度：高
- 级别：HIGH

### 4. 外部 CDP 使用异步 `setInterval`，轮询可重入且停止后仍可能写入数据

- 位置：`src/extension/background/body_capture_coordinator.ts:232-248`、`src/extension/background/body_capture_coordinator.ts:179-197`
- 现象：500ms `setInterval(async () => ...)` 不等待前一次轮询结束。网络延迟超过间隔时会并发请求。停止流程只清除后续 interval；已在途请求返回后仍执行 `deps.on_network_request`，没有 lifecycle/capture 状态校验。
- 影响：事件处理顺序不稳定；停止采集后仍可能写入旧 `capture_id` 数据。快速停止并启动下一次采集时，迟到事件可能污染数据、触发无效 IndexedDB 写入或形成难复现竞态。
- 建议：改为完成后递归 `setTimeout`，确保单飞轮询；维护 coordinator lifecycle token/`AbortController`，停止时取消请求，并在处理每批事件前确认 session key、capture_id 和 lifecycle 仍匹配。
- 置信度：高
- 级别：HIGH

## 中低优先级问题（MEDIUM / LOW）

### 5. 日志分页终止条件错误，`offset > 0` 时最多多返回 `offset` 条

- 位置：`src/extension/background/app_log_storage.ts:54-104`
- 现象：`counted` 只在结果写入后递增，但终止条件使用 `counted >= limit + offset`；跳过 offset 时只递增 `skipped`。例如 `limit=20, offset=10` 会跳过 10 条后再收集 30 条，而非 20 条。
- 影响：分页 API 返回条数违反契约，UI/调用方可能重复加载、内存放大；日志可能比调用方请求范围暴露更多，属于轻度隐私边界偏差。
- 建议：跳过完成后以 `results.length >= limit` 终止；同时校验 limit/offset 为非负整数。
- 置信度：高
- 级别：MEDIUM

### 6. 日志容量估算忽略 `details` 和 `stack`，100MB 限额可被大幅突破

- 位置：`src/extension/background/app_log_storage.ts:8-10`、`src/extension/background/app_log_storage.ts:169-220`；数据结构见 `src/shared/types.ts:687-695`
- 现象：`estimate_entry_bytes` 只计算 `message`、`module` 和固定 40 字节，不计算可包含任意对象的 `details` 与错误 `stack`，也未按 UTF-8 字节计算。
- 影响：包含请求上下文、长错误栈或大对象的日志可能远超配置容量却不触发清理，导致 IndexedDB 持续膨胀；敏感诊断信息保留时间超过用户预期。
- 建议：写入时基于可序列化内容计算 UTF-8 字节并持久化 `size_bytes`；限制/截断 `details` 和 `stack`，清理时使用真实累计大小。无法序列化时采用保守上界或丢弃详情并记录状态。
- 置信度：高
- 级别：MEDIUM

### 7. 日志 flush 在持久化成功前移除 buffer，失败会永久丢日志并产生未处理 Promise rejection

- 位置：`src/extension/background/app_log_storage.ts:22-27`、`src/extension/background/app_log_storage.ts:29-52`
- 现象：`flush` 先执行 `this.buffer.splice(0)`，随后才打开 DB 和事务。任一步失败时 batch 不会放回 buffer。定时器回调直接调用异步 `this.flush()` 且不处理 rejection。
- 影响：IndexedDB 短暂失败即可永久丢失整批日志；后台出现未处理 rejection，后续排障恰好缺失故障窗口日志。
- 建议：事务成功后再确认移除，或失败时把 batch 按原顺序放回并带有界退避重试；定时器使用 `void this.flush().catch(...)`，但错误处理不得递归写入同一失败 transport。
- 置信度：高
- 级别：MEDIUM

### 8. 查询分页参数只检查“有限数字”，负数和小数会进入 `slice`

- 位置：`src/extension/background/agent_command_dispatcher.ts:116-128`、`src/extension/background/agent_command_dispatcher.ts:169-175`、`src/extension/background/agent_data_queries.ts:89-98`、`src/extension/background/agent_data_queries.ts:119-131`
- 现象：`offset`、`limit` 接受所有有限 number，包括负数和小数。随后直接用于数组 `slice`。负 offset 会从尾部计算，负 limit 会改变结束索引，小数被隐式取整。
- 影响：恶意或错误调用可绕过预期分页语义，返回意外数据区间；不同命令结果难以预测，也扩大不必要的数据暴露。
- 建议：为 offset/limit 单独校验非负整数；limit 设协议级最大值。时间范围可允许有限数，但应校验 `start_time <= end_time`。
- 置信度：高
- 级别：MEDIUM

### 9. 任意失败均被 `capture.start` 映射为“已有采集”，掩盖真实存储错误

- 位置：`src/extension/background/agent_command_dispatcher.ts:91-103`；直接 handler 行为见 `src/extension/background/service_worker.ts:267-320`
- 现象：只要 `handlers.start_capture` 返回 `success: false`，dispatcher 一律抛出 `RECORDING_ALREADY_RUNNING`。实际失败还可能来自 capture_id 冲突、IndexedDB 写失败等，handler 已通过 `error` 返回真实原因但错误码被强制覆盖。
- 影响：调用方无法区分状态冲突与存储故障，可能按错误策略重试；重复 capture_id 会被误报为已有活跃采集，降低可诊断性。
- 建议：handler 返回结构化 `AgentErrorCode`；仅 `is_capturing` 分支使用既定并发错误码，存储失败使用 `STORAGE_READ_FAILED` 或新增准确写入错误码，capture_id 冲突返回 `INVALID_QUERY`/专用冲突码。
- 置信度：高
- 级别：MEDIUM

### 10. 未知命令类型会返回 `ok: true, data: undefined`

- 位置：`src/extension/background/agent_command_dispatcher.ts:39-89`
- 现象：switch 无 `default` 分支。虽然 TypeScript 联合类型约束编译期调用，但 Bridge 输入来自 JSON，client 又通过 `as AgentCommandType` 强制断言；运行时未知 type 会自然返回 `undefined`，外层包装成成功结果。
- 影响：协议版本不一致、Bridge 校验遗漏或损坏命令会被误判成功，调用方无法发现命令未执行。
- 建议：增加穷尽性运行时校验；未知类型抛出 `AgentCommandError('INVALID_QUERY', 'Unsupported command type')`。避免在网络边界直接类型断言。
- 置信度：高
- 级别：LOW

## 改进建议

1. 为结果投递建立明确状态机：`fetched → executed → result_pending → acknowledged`，并按 `command_id` 做幂等。
2. Bridge session 增加已登记 `browser_label` 或配置摘要，支持检测路由元数据变化。
3. 数据查询改为按 store 游标分页，不先把七类数据全部加载到内存；全量工具定义明确容量和截断协议。
4. 所有网络轮询统一采用单飞循环、取消信号和 lifecycle token。
5. 日志存储加入真实字节计量、有界字段、失败重试及分页参数验证。
6. 命令边界统一做运行时 schema 校验，handler 返回结构化错误，避免字符串和单一错误码吞并根因。

## 不确定项 / 可能误报

- `browser_label` 也可能由 Bridge 侧独立管理，但当前可见 heartbeat 契约支持 `browser_label` 字段，而 client 未发送；若产品明确要求标签只能在首次 enroll 设置且修改配置不应生效，则问题 2 可降级。现有配置 UI/路由语义通常意味着修改应同步。
- `FULL_DATA_LIMIT` 可能是有意防止超大响应，但当前没有截断提示，且命令名为 `capture.get_all_data`；即使保留上限，静默返回仍属 correctness 问题。
- 外部 CDP 在途轮询写入是否最终落库取决于 `deps.on_network_request` 下游状态检查；本批清单未包含完整下游实现。当前 coordinator 自身缺少停止后的隔离，竞态客观存在，实际污染程度可能低于 HIGH。
- 未发现本地化 JSON、`cdp_event_router.ts` 中可确认的高置信安全或 correctness 缺陷。`cdp_event_router.ts` 的全局 session set 依赖上层在 detach/stop 时完整清理，相关生命周期实现不在本清单内。
