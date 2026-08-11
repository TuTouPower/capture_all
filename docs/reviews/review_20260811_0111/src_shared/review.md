# src_shared 全量审阅报告

- reviewed_at: 2026-08-11T01:11:00+08:00
- scope: 当前工作区 `src/shared/**` 全量只读审阅（非 diff；未跑 `git diff` / `git log`）
- files: 14（见同目录 `file_list.txt`）
- method: 逐文件通读；对照 `docs/archive/specs/privacy_redaction.md` 与调用方（dashboard / service_worker / archive_builder / network capture）交叉验证

## Findings

### f001 - `sanitize_user_config` 丢弃 `browser_label` 与 `agent_bridge_poll_interval_ms`

- 严重度: **blocking**
- 位置: `src/shared/user_config.ts` `sanitize_user_config`（约 L378–L411）；连带 `load_user_config` / `save_user_config`
- 问题:
  - 校验从 `DEFAULT_USER_CONFIG` 白名单拷贝字段，但**未处理** `browser_label`、`agent_bridge_poll_interval_ms`（二者在 `UserConfig` / `DEFAULT_USER_CONFIG` / 设置页均存在）。
  - 每次 `load_user_config()` 将二者重置为默认：`browser_label: ''`、`agent_bridge_poll_interval_ms: 1000`。
  - `save_user_config(patch)` 先 `load_user_config()` 再 merge 写回：任意**不含**上述字段的 partial 保存（主题、脱敏开关、log_level 等）会把 storage 中已写入的 label / 轮询间隔**静默覆盖为默认值**。
  - 可观测路径：
    - Dashboard 启动 `set_user_config(await load_user_config())`（`dashboard.ts`）→ 设置页永远显示空 label、1000ms。
    - SW 写 log_level：`{ ...(await load_user_config()), log_level }`（`service_worker.ts`）→ 整表重写时抹掉 label。
    - Bridge 侧 `get_user_config_for_bridge` 虽读 raw storage 可暂避，但其他 save 路径仍会破坏 storage。
  - 多实例 `target_label` 依赖 `browser_label`；该缺陷直接破坏多扩展实例路由配置的持久化。
- 建议:
  1. `sanitize_user_config` 补齐：`browser_label`（string trim，可设长度上限）、`agent_bridge_poll_interval_ms`（finite int，clamp 到与 `agent_bridge_config` 一致的 250–300000）。
  2. `save_user_config` 写前对 merge 结果再跑 sanitize；禁止 load 白名单漏字段后回写整表。
  3. 补单测：storage 预置非默认 label/poll → load 保留；`save({ theme })` 不抹掉 label/poll。
- 置信度: 高

### f002 - Logger 对 `Error.stack` 未做 URL 脱敏（违背 privacy 规格）

- 严重度: **blocking**（隐私边界）
- 位置: `src/shared/logger.ts` `sanitize_value` Error 分支（约 L45–L50）；对照 `docs/archive/specs/privacy_redaction.md`「Error message/stack 也净化」
- 问题:
  - `message` 走 `sanitize_string`（含 URL query 脱敏）。
  - `stack` 仅 `truncate_bytes_safe`，**不**跑 `sanitize_string` / `redact_url`。
  - 调用栈、源 URL、带 query 的资源路径中的 `token`/`key`/`auth` 等参数可原样进入 `AppLogEntry.details` 或 Error 序列化结果。
  - `Map`/`Set`/`ArrayBuffer` 按规格原样保留；若 details 塞进未扫的容器，敏感串也会绕过（规格允许，但与「统一净化入口」目标冲突——本次以 Error.stack 为主因）。
- 建议:
  - Error.stack 与 Logger 自生成 `entry.stack` 一律 `sanitize_string` 后再截断。
  - 单测：Error.stack 含 `https://x.test/a?access_token=secret` → 日志中为 `[REDACTED]`。
- 置信度: 高

### f003 - `redact_url` 解析失败时 fail-open，相对 URL / 非标准串不脱敏

- 严重度: **important**
- 位置: `src/shared/redaction.ts` `redact_url` catch（约 L74–L76）
- 问题:
  - `new URL(url)` 失败（相对路径 `?token=...` / `path?api_key=x`、残缺串）时返回**原始 url** 且 `url_status: 'captured'`。
  - 调用方如 form `action`、部分导航/referrer 可能是相对 URL；`redact_data && redact_url_query` 开启仍可能漏脱敏。
  - 与 header 路径「宁可多遮」不一致；规格未写 fail-open，属可观测隐私缺口。
- 建议:
  - 相对 URL：`new URL(url, 'https://redact.invalid')` 或仅解析 `?[query]` 段后脱敏再拼回。
  - 无法安全解析且含 `=`/`?` 可疑串时，至少标记 `url_status: 'redacted'` 或整体替换为 `[UNPARSEABLE_URL]`，避免静默放行。
- 置信度: 高

### f004 - `system_time_timezone` sanitize 未校验 allowlist；非法值静默生效

- 严重度: **important**
- 位置: `src/shared/user_config.ts` L405；`src/shared/system_time.ts` `parse_utc_offset` / `format_system_time`
- 问题:
  - sanitize 仅要求「非空 string」，不校验 `VALID_UTC_OFFSETS` / `SystemTimeTimezone`。
  - load 路径对 IANA 有 `migrate_iana_timezone`，但 **未知偏移**（如 `UTC+14` 映射表有、allowlist 无 → 回落 browser）与 **直接写入非法串**（`save_user_config` 不重校验）行为不一致。
  - `format_system_time`：`parse_utc_offset` 返回 `null` 时用 `offset_minutes ?? 0`，非法 tz **显示成 UTC** 且无报错，导出时间语义错误。
  - IANA 表含 `UTC+13`/`UTC+14`（如 `Pacific/Kiritimati`），但 `VALID_UTC_OFFSETS` / `SystemTimeTimezone` 上限 `UTC+12`，迁移后被迫 `browser`。
- 建议:
  - sanitize 后只接受 allowlist；非法 → `browser` 或拒绝 patch。
  - 扩展 allowlist 至 `UTC±13/14` 或迁移表钳制到最近合法偏移并文档化。
  - `save_user_config` 统一过 sanitize。
- 置信度: 高

### f005 - `detail_time_display_mode` 接受 `'absolute'`，类型与默认 schema 不符

- 严重度: **important**（协议/类型一致性）
- 位置: `src/shared/user_config.ts` L392；`src/shared/types.ts` `DetailTimeDisplayMode = 'relative' | 'system'`
- 问题:
  - 运行时 sanitize 允许 `'absolute'` 写入配置对象。
  - 类型与 `DEFAULT_USER_CONFIG` 无 `absolute`；调用方若按类型穷尽 switch，会漏分支，UI/导出时间模式语义不清。
  - 历史 dashboard spec 曾列 absolute；当前 types 已收窄，边界校验却仍放行。
- 建议: 三选一对齐——恢复类型与 UI 的 `absolute`，或 sanitize 拒绝/映射 `absolute→system`，并加回归测试。
- 置信度: 高

### f006 - 数值配置无上界：`max_body_capture_bytes` / `inline_text_max_bytes` 可静默接受极端值

- 严重度: **important**
- 位置: `src/shared/user_config.ts` L394–L398；`src/shared/constants.ts` `MAX_BODY_CAPTURE_BYTES` / `INLINE_TEXT_MAX_BYTES`
- 问题:
  - sanitize 条件：`Number.isInteger(v) && v >= 0`，无上限、不钳制到常量硬顶。
  - 可写入超大整数（内存/IDB/导出 OOM 风险）或 `0`（静默关闭 body 有效采集，难排查）。
  - UI 层 `clamp_body_size_bytes` 有上限，但 agent/MCP/直接 storage 写入可绕过 UI。
- 建议: sanitize 钳制 `0..MAX_BODY_CAPTURE_BYTES`（inline 用独立上限）；非有限整数回落默认。
- 置信度: 高

### f007 - `plan_body` 在 `byte_size == null` 时按 0 处理，大文本可能被错误 inline

- 严重度: **important**
- 位置: `src/shared/body_routing.ts` `plan_body`（约 L102–L105）
- 问题:
  - `(opts.byte_size ?? 0) >= inline_text_max_bytes`：缺省 size 的大文本/未知体积 body 被判为 inline。
  - 归档路径 `archive_builder` 把 `response_body_bytes`/`request_body_bytes` 原样传入；历史/部分路径可为 null 且 body 非空 → jsonl 内嵌超大串，违背 inline 阈值语义，放大内存与导出体积。
- 建议:
  - `byte_size == null` 且 `has_body`：按实际 body 算字节，或保守 `placement: 'file'`。
  - 单测：body 很长、`byte_size: null` 不得 inline。
- 置信度: 中高

### f008 - `safe_request_id` 碰撞去重可选，生产导出路径未传 `used`

- 严重度: **important**
- 位置: `src/shared/body_routing.ts` `safe_request_id`（约 L112–L128）；生产调用 `src/extension/shared/archive_builder.ts` `safe_request_id(req.request_id)`（无 `used`）
- 问题:
  - 非法字符统一替换后，不同 `request_id` 可归一为同一 safe id（如 `a/b` 与 `a_b`）。
  - 未传 `used` 时直接返回，archive 写 `bodies/response/${safe_id}.${ext}` **后写覆盖先写**。
  - 结果：body 文件丢失或跨请求错配（同 capture 内污染），jsonl 多行指向同一 path。
  - 模块提供了 `used` 去重，但默认不安全；唯一生产调用未启用。
- 建议:
  - archive 构建时维护全局 `used` Set 并传入；或 `safe_request_id` 在无 used 时附加短 hash 降低碰撞。
  - 单测：两 id sanitize 冲突时 path 唯一。
- 置信度: 高

### f009 - `category_for_event_type` 未知类型静默归为 `dom_data`

- 严重度: **important**
- 位置: `src/shared/event_category.ts` L8–L18；调用 `service_worker` `event.category || category_for_event_type(event.type)`
- 问题:
  - 未识别 `type` 一律 `'dom_data'`，可写入错误 category / 错误 object store 语义。
  - 新 EventType 漏登记时无告警，造成统计、timeline、按类查询静默错误。
- 建议: 未知类型返回明确 sentinel 或 throw；开发/debug 打 warn；保证 `EventType` 全集与 Set 表同步的单测。
- 置信度: 中高

### f010 - `generate_capture_id` 使用 `Math.random`，与 event id 的 CSPRNG 路径不一致

- 严重度: **minor**
- 位置: `src/shared/id.ts`；对照 `src/shared/event_utils.ts` `generate_event_id`（优先 `crypto.randomUUID`）
- 问题:
  - capture_id = `Date.now()` + `Math.random()` 7 位 base36；非安全随机。
  - 用途主要为唯一标识非密钥，碰撞概率低；但 SW 高频重启 + 时钟回拨时，同毫秒弱随机存在理论碰撞，且与 event_id 策略不一致。
  - 不构成加密误用，但 ID 生成规范分裂。
- 建议: 与 event 对齐，优先 `crypto.getRandomValues` / `randomUUID` 派生后缀；保留格式 `{ms}_{suffix}`。
- 置信度: 中

### f011 - `DEFAULT_CONFIG` 与 `DEFAULT_USER_CONFIG` 键盘默认值分叉

- 严重度: **minor**
- 位置: `src/shared/constants.ts` L30–L44 vs L46–L70
- 问题:
  - `DEFAULT_CONFIG.keyboard_capture_mode = 'shortcuts'`
  - `DEFAULT_USER_CONFIG.keyboard_capture_mode = 'none'`
  - 网络等路径以 `DEFAULT_CONFIG` 为 fallback，popup 从 user_config 组装 CaptureConfig；未显式合并时行为依赖入口，增加「默认是否采键盘」歧义。
- 建议: 单一权威默认源；另一处 derive 或注释强制入口契约。
- 置信度: 高

### f012 - Logger 仅脱敏 URL 子串，结构化敏感字段名不处理

- 严重度: **minor**（规格内局限；残留风险）
- 位置: `src/shared/logger.ts` `sanitize_string` / `sanitize_value`
- 问题:
  - 按 privacy 规格只做 URL query 脱敏；`details: { token, authorization, cookie, agent_bridge_token }` 等**非 URL** 明文键值原样落盘。
  - 默认 `log_level: 'debug'` 放大暴露面。
  - 非规格违反，但是日志隐私的系统性残留风险。
- 建议: 对已知敏感 key（token/password/authorization/cookie/secret）递归替换；生产默认 log_level 不低于 `info`。
- 置信度: 中

## 非 finding 备注（已核对，未升格）

| 主题 | 结论 |
|------|------|
| header 名/值 pattern 脱敏 | 与 `privacy_redaction.md` 三重规则一致；值含 `key/token` 可能过宽，属规格定义 |
| body 内容不脱敏 | 规格「数据脱敏」覆盖键盘/input/cookie，不含 network body；仅截断 |
| `redact_password` | 符合 password 永红；当前 src 内几乎无调用，DOM 层另有保护 |
| `agent_bridge` 空 token + enabled | T091 零配置设计；URL 限 loopback |
| `hash.sha256_hex` | `crypto.subtle` 用法正确 |
| `escape_*` | HTML / script 嵌入转义合理 |
| `protocol` 新旧错误码 | 显式兼容别名，可接受 |
| `plan_body` 无 session 维度 | placement 决策无 capture 字段；跨 session 隔离由调用方路径负责，本模块无直接污染逻辑 |
| fragment URL | 规格声明「不处理 fragment」 |

## 结论

- finding 计数: **12**（blocking 2 / important 7 / minor 3）
- verdict: **FAIL**

阻塞原因：
1. **f001** 用户配置校验白名单漏字段 → multi-instance `browser_label` 与 poll 间隔无法可靠持久化，且 partial save 可破坏 storage。
2. **f002** Logger 未净化 Error.stack → 与项目隐私规格冲突，敏感 query 可进本地日志。

修复 f001+f002 并至少处理 f003/f006/f008 后可重审。
