# src_bridge_mcp_shared_02 当前视角代码审阅

## 当前模型判断依据

继承主会话 default_model；运行时底层模型不可观测，不作额外推断。

## 审阅范围

依据 `docs/review_20260719_0859/MANIFEST.md` 中 `src_bridge_mcp_shared_02` 清单，完整审阅以下 12 个文件：

- `src/shared/constants.ts`
- `src/shared/escape.ts`
- `src/shared/event_category.ts`
- `src/shared/event_utils.ts`
- `src/shared/hash.ts`
- `src/shared/id.ts`
- `src/shared/logger.ts`
- `src/shared/protocol.ts`
- `src/shared/redaction.ts`
- `src/shared/system_time.ts`
- `src/shared/types.ts`
- `src/shared/user_config.ts`

同时按需核对：

- `CLAUDE.md` 硬约束
- `docs/blueprint/architecture.md`
- `docs/blueprint/conventions.md`
- `docs/blueprint/domain.md`
- `docs/blueprint/decisions.md`
- 相关生产调用路径与现有单元测试

未运行构建或测试。

## 高优先级问题（CRITICAL / HIGH）

CRITICAL：未发现。

### 1. 旧格式 `input_event` 缺少 `event_id`，IndexedDB 写入会失败

- 位置：`src/shared/event_utils.ts:26-59`；实际缺口入口 `src/extension/content/content_script.ts:236-258`、`src/extension/content/dom_capture.ts:118-143`；持久化约束 `src/extension/background/storage.ts:78-83, 275-295`
- 级别：HIGH
- 现象：`create_base_event()` 会生成 `event_id`，但兼容旧格式的 `send_event(type, data)` 没有调用它，只构造 `capture_id/category/relative_time_ms/absolute_time/type/data/tab_id/frame_id/url`。`dom_capture.ts` 仍通过该旧格式发送全部输入事件。后台 `handle_event()` 仅补 `capture_id/category/relative_time_ms`，不会补 `event_id`。目标 store 使用 `event_id` 作为 keyPath，缺失 key 会使 `store.put(item)` 触发 DataError/事务失败。
- 影响：文本输入、change、focus、blur 等 `input_event` 无法可靠持久化；同批事务内其他事件也可能随事务中止丢失。该行为违反“所有事件 store 用 `event_id` 作 keyPath”硬约束。
- 建议：删除旧格式分支或让其统一调用 `create_content_event()` / `create_base_event()`；后台持久化边界增加完整事件校验并为兼容输入补 UUID。补一条从 DOM input 事件经 `send_event`、后台处理到 IndexedDB 写入的行为测试，不能只断言数据载荷。
- 置信度：高

### 2. Agent 线协议仍返回已禁用旧错误码和旧状态术语

- 位置：`src/shared/protocol.ts:17-37`；实际返回路径 `src/extension/background/agent_command_dispatcher.ts:91-113, 131-135, 277-285`
- 级别：HIGH
- 现象：协议声明并实际返回 `SESSION_NOT_FOUND`、`RECORDING_ALREADY_RUNNING`、`NO_ACTIVE_RECORDING`，启动结果状态为 `recording`。长期领域文档及硬约束要求 `CAPTURE_NOT_FOUND`、`CAPTURE_ALREADY_RUNNING`、`NO_ACTIVE_CAPTURE`，产品术语禁止使用 session / recording。
- 影响：MCP/Agent 消费者按公开错误码处理时无法识别真实响应；同一时间仅一次活跃采集约束虽可能生效，但错误码契约不符，自动化重试和错误分支可能失效。
- 建议：在 `AgentErrorCode`、dispatcher、schema/测试中原子替换为 capture 术语；若必须兼容旧客户端，只在明确兼容层接收旧码，输出统一新码，并标注废弃期限。
- 置信度：高

### 3. 日志系统无脱敏或大小限制，生产调用会持久化完整敏感 URL

- 位置：`src/shared/logger.ts:40-67`；实际调用 `src/extension/content/content_script.ts:41`、`src/extension/background/service_worker.ts:465, 838, 868`
- 级别：HIGH
- 现象：`Logger.write()` 将任意 `message/details` 原样写入 transport，仅特殊处理 `Error`。默认日志级别为 `debug`（`src/shared/constants.ts:67`）。生产调用把 `window.location.href`、tab URL、URL 变更前后值原样放入日志；这些 URL 可含 token、password、auth 等 query，且不经过 `redact_url()`。日志 details 也无递归敏感字段脱敏或单条大小上限。
- 影响：即使采集配置启用 URL query 脱敏，诊断日志仍会在 IndexedDB 留存明文凭据和页面敏感参数，形成旁路泄露；大 details 还可快速消耗日志配额。
- 建议：在进入 Logger 前对 URL 调用 `redact_url()`，并在日志 transport 边界增加统一、可测试的敏感键/URL 脱敏与单条大小限制。避免仅依赖各调用方自律。补验证 IndexedDB 最终日志内容的行为测试。
- 置信度：高

### 4. URL query 脱敏只匹配少量、大小写敏感的精确参数名

- 位置：`src/shared/redaction.ts:11, 53-67`
- 级别：HIGH
- 现象：仅循环 `token/key/secret/password/auth` 并用 `URLSearchParams.has()` 精确匹配。常见 `access_token`、`api_key`、`client_secret`、`auth_token`、`session_token` 及 `Token`/`AUTH` 等不会被脱敏；URL fragment 内参数也不处理。现有测试只覆盖小写 `token`。
- 影响：开启 `redact_url_query` 后仍可采集并导出常见凭据，用户会误以为 URL 已脱敏。
- 建议：遍历全部 query key，以小写后的敏感词规则判断；明确是否处理 fragment 参数。规则应覆盖常见组合词，同时避免过宽误杀。增加大小写、组合参数名、重复参数、编码参数测试。
- 置信度：高

## 中低优先级问题（MEDIUM / LOW）

### 5. `event_id` 不符合 UUID 硬约束，且跨执行上下文缺乏全局唯一保证

- 位置：`src/shared/event_utils.ts:4-20`
- 级别：MEDIUM
- 现象：ID 由 `Date.now()`、`Math.random()` 6 字符和进程内 counter 拼接，不是 UUID。每个 frame/content script/SW 有独立 counter，扩展上下文重启后归零。
- 影响：违反领域文档“全局唯一 UUID”约束。碰撞概率虽低，但多 frame 同毫秒、上下文重启及可预测 PRNG 会削弱 keyPath 唯一性；碰撞时 `put()` 会静默覆盖同 key 旧事件。
- 建议：优先使用 `crypto.randomUUID()`；需兼容旧环境时用 `crypto.getRandomValues()` 实现 UUID v4。测试校验格式、批量唯一性及不同上下文生成器独立实例场景。
- 置信度：高

### 6. `redact_password()` 允许配置关闭后返回明文密码，API 与硬约束冲突

- 位置：`src/shared/redaction.ts:79-83`；对应测试 `tests/unit/redaction.test.ts:185-190`
- 级别：MEDIUM
- 现象：函数先判断 `enabled`，为 `false` 时即使 `input_type === 'password'` 也返回原值。项目硬约束要求 `type=password` 永远不采集。当前 DOM 采集路径另有独立保护，因此暂未形成已确认生产泄露，但共享 API 和测试将不安全行为固化为预期。
- 影响：后续调用方若复用该函数并传入 `redact_data=false`，会直接泄露密码；函数名容易让调用者误判为安全边界。
- 建议：password 判断必须优先于 `enabled`；或删除 `enabled` 参数，将“可配置数据脱敏”和“密码永不采集”拆成两个 API。修改测试，明确密码在任何配置下都不返回原值。
- 置信度：高

### 7. 用户配置只做浅合并和类型断言，存储边界没有运行时校验

- 位置：`src/shared/user_config.ts:377-408`
- 级别：MEDIUM
- 现象：`load_user_config()` 将 `chrome.storage.local` 内容直接与默认值浅合并，再 `as UserConfig`；除 timezone 外不验证 enum、boolean、数值范围、URL、poll interval、日志容量。`save_user_config()` 同样直接合并任意 `Partial<UserConfig>`。
- 影响：损坏、旧版本或其他扩展页面写入的配置可让运行时收到 `NaN`、负数、错误字符串或越界值，导致轮询异常、大小限制失效、日志保留异常或功能静默降级。TypeScript 断言无法保护持久化数据边界。
- 建议：建立单一运行时 config schema/normalizer；加载时逐字段校验并回退默认值，保存时拒绝无效 patch。至少覆盖所有数值上下限、enum、boolean、Bridge URL 和 label 长度。
- 置信度：高

### 8. 生命周期事件分类表漏掉 4 个合法类型，默认落入 `dom_data`

- 位置：`src/shared/event_category.ts:7-17`；类型全集 `src/shared/types.ts:123-130`
- 级别：MEDIUM
- 现象：`capture_config_changed`、`permission_missing`、`debugger_attach_status`、`body_capture_status_changed` 属于合法生命周期事件，却未映射到 `capture_lifecycle`；未知类型统一返回 `dom_data`。
- 影响：一旦这些已声明事件开始产生，会被写进 user action fallback store，而非 lifecycle store，导致 sources、统计、查询和导出分类错误。当前源码未发现这些 4 类事件生产调用，因此属于明确潜在缺陷而非当前数据损坏证据。
- 建议：用 `Record<EventType, CategoryKey>` 或 exhaustive switch 建立编译期完整映射，禁止合法类型依赖默认分支；未知外部输入应在边界拒绝或显式标记。
- 置信度：高

### 9. `MessageLogTransport.flush()` 不等待消息实际送达

- 位置：`src/shared/logger.ts:97-111`
- 级别：LOW
- 现象：`send_batch()` 启动 `chrome.runtime.sendMessage()` 后立即返回，`flush()` 只等待 buffer 被清空和固定 50ms，不等待 Promise 完成；失败还被静默丢弃。
- 影响：页面卸载、扩展上下文失效或 SW 唤醒较慢时，调用方收到 flush 完成但日志尚未持久化，诊断尾部日志易丢失。
- 建议：让 `send_batch()` 返回 Promise，`flush()` await 所有在途批次；失败至少保留有限重试或向调用方返回失败状态，避免伪成功。
- 置信度：中

### 10. 活跃类型仍暴露 `session_id`，未限定为废弃兼容字段

- 位置：`src/shared/types.ts:366-379`
- 级别：LOW
- 现象：`WsFrameData.session_id` 仍是普通可选字段，没有 `@deprecated` 或迁移说明；同文件仅末尾 aliases 被明确标为兼容层。
- 影响：新代码可能继续写入禁用术语和旧标识，扩大迁移负担，并造成 `capture_id` / `session_id` 双真相。
- 建议：确认线协议是否仍需要该字段。无需兼容则改为 `capture_id`；需要兼容则增加 `capture_id` 主字段，将 `session_id` 标记 deprecated，并在单一适配边界转换。
- 置信度：中

## 改进建议

1. 将事件规范化收敛到单一边界：所有 content/background 事件写入前必须补齐并验证 `event_id`、`capture_id`、`category`、时间、source、severity。
2. 用 exhaustive 类型映射替换 `event_category.ts` 的字符串 Set + 默认回退，新增 EventType 时由编译器强制更新分类。
3. 把脱敏作为持久化边界能力：采集数据、诊断日志、导出各自明确安全策略，避免原始 URL 从日志旁路泄露。
4. 为 `UserConfig` 建立运行时 schema；UI clamp 只能改善输入体验，不能替代存储边界校验。
5. 协议术语与错误码建立单一真相源，避免 shared protocol、dispatcher、MCP schema、文档各自维护字符串。
6. 增加真实行为测试：DOM input → runtime message → SW normalize → IndexedDB；敏感 URL → Logger → app_logs；Agent command → 最终错误码。避免只做源字符串或孤立纯函数断言。

## 不确定项 / 可能误报

- `MessageLogTransport` 可能有意采用 best-effort 语义；若产品明确允许 content script 日志丢失，第 9 项可降为建议，但 `flush()` 命名仍会误导调用者。
- IANA timezone 迁移将夏令时区固定为标准 UTC offset，且半小时/45 分钟时区被取整；代码注释显示这是既定 P0.34 决策，本报告未作为问题上报。若产品承诺保留历史时区语义，应另立时间迁移问题。
- `event_id` 当前碰撞概率低，第 5 项主要依据明确 UUID 硬约束及多上下文模型，不代表已观察到生产碰撞。
- 4 个漏分类生命周期类型当前无生产调用，第 8 项影响尚未触发，但类型已公开，后续启用时会确定性错路由。
