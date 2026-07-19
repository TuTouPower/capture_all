# src_bridge_mcp_shared_02 审阅报告

- 审阅模型：Sonnet
- 日期：2026-07-19
- 范围：12 文件，1837 行（`src/shared/` 下 constants, escape, event_category, event_utils, hash, id, logger, protocol, redaction, system_time, types, user_config）
- 检查维度：correctness、安全、类型、脱敏、配置、时间处理

---

## 发现汇总

| 级别 | 数量 |
|------|------|
| HIGH | 2 |
| MEDIUM | 5 |
| LOW | 5 |
| INFO | 2 |

---

## HIGH

### H1. `system_time.ts` IANA-to-offset 映射丢失 DST 信息，夏令时区域时间显示错误

- 位置：`src/shared/user_config.ts` L10-360（IANA_TO_OFFSET 表），`src/shared/system_time.ts` L98-108（偏移路径）
- 影响：所有 DST 区域（如 `America/New_York`、`Europe/London`、`Australia/Sydney`）的用户，全年显示为固定标准时间偏移。`America/New_York` 永久显示 UTC-5，夏令时期间实际应为 UTC-4，偏差 1 小时。影响 exported capture 数据的时间戳准确性。
- 说明：设计决策记录于 `docs/blueprint/decisions.md`（P0.34），属于已知取舍。但风险在于：用户看到导出数据的时间与真实时间有 1 小时偏差，可能误判事件顺序或排查问题。`system_time.ts` 中偏移量的计算 `ms + offset_minutes * 60000` 对固定偏移本身正确。
- 建议：至少在 UI（settings 页）或导出文件中明确标注"此为固定偏移，不追踪夏令时变化"。若未来允许用户输入自定义偏移，需重新设计此处。
- 置信度：高（IANA 表与标准时区数据库逐条核对可见固定偏移）
- 级别：HIGH（数据准确性问题，影响所有 DST 区域用户）

### H2. `protocol.ts` 错误码使用被禁止术语 `session`/`record`

- 位置：`src/shared/protocol.ts` L23 `SESSION_NOT_FOUND`，L25 `RECORD_NOT_FOUND`
- 影响：违反 `docs/blueprint/domain.md` 中的硬约束——"禁用 `session`/`record`/`录制`/`记录` 作产品术语"。这些错误码可能通过 Bridge API 返回给 MCP 客户端（AI Agent），成为用户可见的错误消息字符串的一部分。
- 建议：重命名为 `CAPTURE_NOT_FOUND`（对应 `SESSION_NOT_FOUND` 的实际语义——即活跃采集不存在）和 `DATA_ENTRY_NOT_FOUND`（对应 `RECORD_NOT_FOUND` 的语义）。同时更新所有引用处。
- 置信度：高（`domain.md` 明确禁止；`protocol.ts` 是公共协议文件，错误码会被外部消费）
- 级别：HIGH（术语违规，可能影响用户体验和 API 一致性）

---

## MEDIUM

### M1. `types.ts` L358 `NetworkRequestData.absolute_time` 类型为 `number`，与 `CaptureEvent.absolute_time: string` 不一致

- 位置：`src/shared/types.ts` L358 `absolute_time?: number;`
- 影响：`CaptureEvent`（L54）定义 `absolute_time: string`（ISO 字符串），但 `NetworkRequestData.absolute_time` 为 `number`（epoch ms）。`system_time.ts:add_absolute_system_time`（L141-148）对两者统一处理（`typeof === 'string' || typeof === 'number'`），运行时无报错，但类型语义不一致，下游消费者（导出、UI 渲染）可能混淆。
- 同样问题：`ConsoleEventData`（L397 附近）和 `RuntimeExceptionData`（L411 附近）的 `absolute_time` 也缺失或类型不一致——这两个接口根本没有 `absolute_time` 字段，但 `add_system_times_to_capture_data`（L125-127）对它们调用了 `add_absolute_system_time`，该函数会静默跳过（因为 `rec.absolute_time` 为 `undefined`）。
- 建议：统一为 `string | number`，或在 `NetworkRequestData` 中改为 `string`，并确保 `ConsoleEventData` 和 `RuntimeExceptionData` 有 `absolute_time` 字段（如果需要）。
- 置信度：高（类型定义直接可验证）
- 级别：MEDIUM（类型不一致，可能导致下游 bug）

### M2. `redact_url` 仅精确匹配 5 个敏感参数名，遗漏常见变体

- 位置：`src/shared/redaction.ts` L11 `SENSITIVE_URL_PARAMS`
- 当前值：`['token', 'key', 'secret', 'password', 'auth']`
- 影响：不会脱敏 `access_token`、`refresh_token`、`auth_token`、`jwt`、`api_key`、`client_secret`、`session_id`、`sid` 等常见敏感参数。`URL.searchParams.has(param)` 是精确匹配，不会匹配包含这些子串的参数名。
- 对比：`redact_headers`（L40）使用 `.includes(pattern)` 做子串匹配，覆盖更广。URL 参数的脱敏粒度远低于 Header 脱敏。
- 建议：扩展列表或改用子串匹配（检查参数名是否包含 `token`/`key`/`secret`/`password`/`auth`），与 `redact_headers` 保持一致的匹配策略。注意误报风险，需权衡。
- 置信度：高（代码逻辑直接可验证）
- 级别：MEDIUM（脱敏覆盖不足，安全敏感）

### M3. `logger.ts` `set_level` 不校验输入值

- 位置：`src/shared/logger.ts` L73-75
- 影响：`set_level('typo')` 会导致所有日志被过滤（因为 `LEVEL_WEIGHT['typo']` 为 `undefined`，`undefined < 0` 为 `false`），日志静默丢失且无报错提示。开发者调试时可能误以为没有日志产生。
- 建议：增加校验，拒绝无效值或 fallback 到 `'debug'`：
  ```ts
  static set_level(level: LogLevel): void {
      if (!(level in LEVEL_WEIGHT)) {
          // 忽略或 console.warn
          return;
      }
      _global_level = level;
  }
  ```
- 置信度：高（`LEVEL_WEIGHT` 为 Record 类型，key 访问无编译期检查）
- 级别：MEDIUM（可能导致静默日志丢失）

### M4. `escape.ts` `escape_for_html_embed` 顺序冗余

- 位置：`src/shared/escape.ts` L6-9
- 影响：L6 先替换 `</script>` → `<\/script>`，L7 再替换所有 `<` → `<`。由于 L7 使用全局 `<` 正则，L6 的输出 `<\/script>` 中的 `<` 会被 L7 再次替换，最终结果 `<\/script>` 与跳过 L6 直接运行 L7 的结果 `</script>` 不同（多了转义的 `/`）。功能上两者都安全（均阻止了 `</script>` 注入），但 L6 的处理实际上被 L7 覆盖后产生了额外的转义噪音。
- 实际验证：输入 `</script>` → L6 后 `<\/script>` → L7 后 `<\/script>`。如果跳过 L6：`</script>` → L7 后 `</script>`。两者都安全，但多了个无意义的 `\/`。
- 建议：删除 L6（`<\/script>` 替换），L7 的 `<` → `<` 已完全覆盖所有 `<` 注入场景。简化代码，消除困惑。
- 置信度：高（逐条替换逻辑可验证）
- 级别：MEDIUM（代码质量，无功能 bug 但易误导读者）

### M5. `constants.ts` `DEFAULT_CONFIG.keyboard_capture_mode` 与 `DEFAULT_USER_CONFIG.keyboard_capture_mode` 默认值不一致

- 位置：`src/shared/constants.ts` L33 vs L47
- `DEFAULT_CONFIG`（运行时采集配置）：`keyboard_capture_mode: 'shortcuts'`
- `DEFAULT_USER_CONFIG`（用户持久化配置）：`keyboard_capture_mode: 'none'`
- 影响：如果某处用 `DEFAULT_CONFIG` 作为 fallback 而另一处用 `DEFAULT_USER_CONFIG`，键盘采集行为不一致。两个"默认配置"的语义不同，但命名相似，容易误用。
- 建议：在两个常量上方加注释说明用途差异（`DEFAULT_CONFIG` = 采集会话启动参数；`DEFAULT_USER_CONFIG` = 用户偏好持久化默认值），或考虑合并为单一来源。
- 置信度：中（需确认两处各在哪些场景使用，可能存在合理设计意图）
- 级别：MEDIUM（易引发混淆导致配置行为不符预期）

---

## LOW

### L1. `event_utils.ts` / `id.ts` / `logger.ts` 使用 `Math.random()` 生成标识符

- 位置：`src/shared/event_utils.ts` L7，`src/shared/id.ts` L4，`src/shared/logger.ts` L79
- 影响：`Math.random()` 非密码学安全，理论上可预测。用于 event_id、capture_id、log_id 生成。这些 ID 不涉及安全认证，碰撞概率在正常使用下极低（capture_id 有时间戳前缀），风险可接受。
- 建议：无需改动。若未来 ID 空间需要更强唯一性保证（如分布式场景），可改用 `crypto.getRandomValues()`。
- 置信度：高
- 级别：LOW（已知取舍，当前场景风险极低）

### L2. `logger.ts` L97-104 `send_batch` 静默吞错

- 位置：`src/shared/logger.ts` L102 `.catch(() => {})`
- 影响：Service Worker 休眠时 `chrome.runtime.sendMessage` 失败，日志批次被丢弃且无任何提示。这是有意设计（避免日志系统自身产生更多错误），但丢失的日志无法追踪。
- 建议：可考虑在丢弃时更新一个 `dropped_batches` 计数器，供 `flush()` 返回或诊断使用。
- 置信度：高
- 级别：LOW（设计取舍，改进可选）

### L3. `logger.ts` L107-112 `flush()` 可能无限循环

- 位置：`src/shared/logger.ts` L107-112
- 影响：`flush()` 在 `while (buffer.length > 0)` 中调用 `send_batch()`。如果 `sendMessage` 持续失败（catch 吞错），`buffer.splice(0)` 会清空 buffer，循环实际会终止。因此不会真的无限循环。但如果 `send_batch` 的实现变更不再清空 buffer，存在风险。
- 建议：添加最大重试次数或超时机制作为防御。
- 置信度：高（当前实现安全，仅防御性建议）
- 级别：LOW

### L4. `user_config.ts` IANA 迁移持久化写入整个 merged config

- 位置：`src/shared/user_config.ts` L390 `chrome.storage.local.set({ [STORAGE_KEY]: merged })`
- 影响：迁移时写入完整 `merged` 对象，而非仅写入 `system_time_timezone` 字段。如果 `chrome.storage.local` 中有其他进程并发写入的字段，merge 后的值可能覆盖它们。在 Chrome 扩展单线程模型下实际冲突概率极低。
- 建议：改为 `chrome.storage.local.set({ [STORAGE_KEY]: { ...stored, system_time_timezone: migrated } })` 更精确，但当前实现无实际 bug。
- 置信度：中（理论竞态，实际极低概率）
- 级别：LOW

### L5. `types.ts` 废弃别名标注"temporary, remove after Phase 2"但未清理

- 位置：`src/shared/types.ts` L705-719
- 影响：`Session`、`RecordEvent`、`RecordConfig` 等别名仍存在，代码中可能有引用。注释说 Phase 2 后移除，但未见 Phase 完成标记。
- 建议：确认 Phase 2 是否已完成；若已完成，移除废弃别名并更新引用。
- 置信度：低（不确定 Phase 2 状态）
- 级别：LOW（技术债务）

---

## INFO

### I1. `system_time.ts` `get_locale_formatter` 的未使用参数

- 位置：`src/shared/system_time.ts` L46 `function get_locale_formatter(_user_offset_minutes: number | null, user_tz: string)`
- 说明：`_user_offset_minutes` 参数从未被使用（`_` 前缀已表明），函数内部固定使用 `timeZone: 'UTC'`。可移除该参数简化签名。
- 级别：INFO

### I2. `protocol.ts` `AgentBridgeConfig.host` 类型为字面量 `'127.0.0.1'`

- 位置：`src/shared/protocol.ts` L60
- 说明：符合项目硬约束（Bridge 仅绑定 127.0.0.1）。类型系统层面强制了这一约束，设计良好。
- 级别：INFO（正面发现）

---

## 总体评价

`src/shared/` 模块整体质量较高，职责划分清晰，类型系统使用规范。主要风险集中在：

1. **时间处理**：IANA-to-fixed-offset 迁移是明确的设计取舍，但 DST 偏差对数据准确性有实质影响，建议在 UI 或文档中增加提示。
2. **术语合规**：`SESSION_NOT_FOUND` / `RECORD_NOT_FOUND` 与 domain.md 的硬约束冲突，需修正。
3. **脱敏覆盖**：URL 参数脱敏策略远弱于 Header 脱敏，存在敏感数据泄露风险。
4. **类型一致性**：`absolute_time` 在不同接口中类型不统一（string vs number vs 缺失），需要对齐。
