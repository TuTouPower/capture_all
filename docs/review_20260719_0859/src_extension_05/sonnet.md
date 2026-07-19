# src_extension_05 审阅报告

- 审阅人：sonnet
- 日期：2026-07-19
- 范围：`src/extension/background/ws_handler.ts` + `src/extension/content/` 全部 15 文件（16 文件，1934 行）
- 关注点：content 事件采集、隐私、输入过滤、listener 生命周期、消息边界

---

## Finding 1 [HIGH] keyboard_capture.ts: shortcuts 模式下 redact_data 不生效

- 位置：`src/extension/content/keyboard_capture.ts:77`
- 现象：`const masked = config.redact_data && !is_shortcut_mode();` 当 `keyboard_capture_mode='shortcuts'` 时，无论 `redact_data` 为何值，`masked` 始终 `false`，key/code 明文发送。
- 影响：shortcuts 模式下按键元数据（key、code）在 redact_data=true 时不脱敏。虽然 shortcuts 通常只含修饰键组合（Ctrl+C 等），但 `event.key` 和 `event.code` 仍可能泄露用户按下的具体字符。
- 建议：如果 shortcuts 模式需要保留 key 用于调试，应在文档中明确声明此例外；否则修正为 `config.redact_data` 即可。
- 置信度：9/10
- 级别：高（隐私策略不一致）

## Finding 2 [HIGH] form_submit_capture.ts: form_action URL 未做参数脱敏

- 位置：`src/extension/content/form_submit_capture.ts:56`
- 现象：`form_action: form.action || null` 直接取原值。`shared/redaction.ts` 提供了 `redact_url()` 对敏感查询参数（token、key、secret、password、auth）做脱敏，但此处未调用。
- 影响：表单 action URL 含敏感参数时（如 `/submit?token=xxx`），token 明文入库。违反项目 `redact_url_query` 配置意图。
- 建议：引入 `redact_url(form.action, config.redact_url_query)` 或至少传入 config 做条件判断。注意 form_submit_capture 当前不接收 config 参数，需从 content_script.ts 传入。
- 置信度：9/10
- 级别：高（隐私泄漏）

## Finding 3 [HIGH] storage_capture.ts: tab_id 硬编码为 0

- 位置：`src/extension/content/storage_capture.ts:104`
- 现象：`tab_id: 0` 硬编码。`start_storage_capture()` 签名不接收 `tab_id` 参数，content_script.ts:106 调用时也未传入。
- 影响：所有 storage_change 事件的 tab_id 为 0，无法关联到具体标签页。MCP 按 tab 过滤时丢失 storage 数据。
- 建议：`start_storage_capture` 签名加入 `tab_id` 参数，content_script.ts 传入当前 tab_id。
- 置信度：10/10
- 级别：高（数据完整性）

## Finding 4 [MEDIUM] network_hook.ts: tab_id 硬编码为 0，与 storage_capture 相同问题

- 位置：`src/extension/content/network_hook.ts:266-296`
- 现象：`start_network_hook` 不接收 tab_id/capture_id，发送的事件中无 tab_id 字段（由 content_script send_event 旧格式填充为模块级 tab_id=0 的情况不适用，此处 send_event 直接传字符串类型，由 content_script 旧格式路径使用模块级 tab_id）。实际 tab_id 取决于 content_script 模块变量，该变量在 content_script.ts:48 设置。
- 影响：需确认 content_script 的模块级 tab_id 是否正确传播到旧格式路径。经核查 content_script.ts:248 `tab_id` 使用模块变量（line 34），在 start_capture 时已设置。因此 network_hook 的 tab_id 实际正确。storage_capture 问题更严重因直接硬编码 0。
- 建议：确认后降级为 info，或统一接口避免歧义。
- 置信度：7/10
- 级别：中（需确认）

## Finding 5 [MEDIUM] dom_capture.ts: send_event 类型签名与实际调用不匹配

- 位置：`src/extension/content/dom_capture.ts:7,142`
- 现象：`send_event` 声明为 `(type: string, data: any) => void`，调用 `send_event('input_event', data)`。但 content_script.ts:105 传入的 `send_event` 签名是 `(type_or_event: string | CaptureEvent, data?: unknown) => void`。运行时走旧格式路径（typeof === 'string'），生成的事件对象结构与 `create_base_event` 生成的不同（缺少 `event_id`、`severity`、`source` 等字段，多出 `data` 属性）。
- 影响：dom 事件（input/change/focus/blur）与已迁移到 create_content_event 的模块事件结构不一致。background 存储时可能字段缺失。
- 建议：将 dom_capture.ts 迁移到新格式，使用 `create_content_event` + 类型化 sender。
- 置信度：8/10
- 级别：中（结构不一致）

## Finding 6 [MEDIUM] network_hook.ts: 字符级截断可能切断多字节 UTF-8

- 位置：`src/extension/content/network_hook.ts:79-83`（注入的页面脚本内）
- 现象：`TextEncoder().encode(text)` 计算字节长度，但截断用 `text.slice(0, MAX)` 按字符切，再 `TextDecoder().decode(bytes.slice(0, MAX))`。如果字符边界与字节边界不对齐，`decode(bytes.slice())` 可能在多字节字符中间截断，产生 replacement character（U+FFFD）。
- 影响：response_body 末尾可能出现乱码字符。对 JSON 等结构化数据，截断位置的字节损坏可能导致解析失败。
- 建议：统一用 `TextDecoder().decode(bytes.slice(0, MAX))` 作为截断结果，不要先 `text.slice` 再 `bytes.slice`。或接受字符级截断的近似。
- 置信度：8/10
- 级别：中（数据质量）

## Finding 7 [MEDIUM] ws_handler.ts: WebSocket 连接 Map 无上限保护

- 位置：`src/extension/background/ws_handler.ts:17,138`
- 现象：`ws_connections` Map 在 `handle_ws_created` 时添加，仅在 `handle_ws_closed` 时删除。若 CDP 不发送 close 事件（tab 崩溃、网络中断），连接条目永远不被清除。
- 影响：长时间采集 + 频繁 WebSocket 页面可能导致内存累积。单次采集 24 小时上限下影响有限。
- 建议：在采集 stop 时清空 ws_connections；或添加 LRU 上限。
- 置信度：7/10
- 级别：中（内存）

## Finding 8 [MEDIUM] content_script.ts: 旧格式事件缺少 event_id

- 位置：`src/extension/content/content_script.ts:241-253`
- 现象：`send_event` 旧格式路径（type 为 string 时）直接构造对象，不含 `event_id`、`source`、`severity`、`redaction_status`、`raw_available`、`created_at` 等 `create_base_event` 标准字段。调用方包括 dom_capture、network_hook。
- 影响：这些事件入库后字段不一致，MCP 查询和导出时结构差异。event_id 缺失可能影响去重和关联。
- 建议：将所有模块迁移到新格式，消除旧格式路径。
- 置信度：9/10
- 级别：中（架构债务）

## Finding 9 [LOW] injected scripts 不可逆：network_hook.ts 和 storage_capture.ts

- 位置：`network_hook.ts:11-233,301-308`；`storage_capture.ts:13-51,113-120`
- 现象：两个模块通过 `document.createElement('script')` 注入页面级脚本，monkey-patch `fetch`/`XMLHttpRequest`/`localStorage`/`sessionStorage`。`stop_*` 只移除 content script 侧的 message listener，不恢复页面原生方法。`__capture_all_*_installed__` guard 防止重复注入。
- 影响：capture 停止后页面 API 行为不变（仍向已移除的 listener 发 postMessage，消息被丢弃）。若页面其他库在注入后也做了 monkey-patch，停止 capture 不会影响它们的包装器。但如果重启 capture，guard 阻止重新注入，hook 恢复后仍指向旧闭包。
- 建议：文档记录此设计限制。如果需要完全可逆，需改为链式包装（保存前一个 wrapper 并在 stop 时恢复）。
- 置信度：8/10
- 级别：低（设计限制，功能影响小）

## Finding 10 [LOW] mouse_capture.ts: wheel/dragstart/dragend 事件 target 元数据缺失

- 位置：`src/extension/content/mouse_capture.ts:134-165`
- 现象：`handle_wheel`、`handle_dragstart`、`handle_dragend` 构造 target 时 `text: null`，而 `handle_click` 通过 `get_target_info()` 获取 `target_text_preview`、`target_role`、`target_label`、`target_rect`（后三者本身也是 null）。
- 影响：wheel/drag 事件缺少 target_text_preview。点击事件有文本预览可用于分析用户意图，wheel/drag 没有。
- 建议：统一调用 `get_target_info(event)` 或明确文档说明差异是有意为之（减少高频事件数据量）。
- 置信度：9/10
- 级别：低（数据一致性）

## Finding 11 [LOW] ws_handler.ts: params 参数全部为 any 类型

- 位置：`src/extension/background/ws_handler.ts:75,128,142,149,159`
- 现象：所有 CDP 事件参数类型为 `any`（如 `params: any`），无类型校验。
- 影响：CDP 参数结构变更时无编译期保护，运行时靠 `?.` 可选链防御。
- 建议：定义 CDP WebSocket 事件的最小接口类型（url、headers、status、payloadData、opcode 等）。
- 置信度：9/10
- 级别：低（类型安全）

## Finding 12 [LOW] keyboard_capture.ts: target_input_type 未填充

- 位置：`src/extension/content/keyboard_capture.ts:103`
- 现象：`target_input_type: null` 硬编码。当 keydown 发生在 input 元素上时，未提取 `target.type`。
- 影响：无法区分键盘事件发生在 text/password/email/number 等不同输入类型上。
- 建议：与 focus_capture.ts 保持一致，提取 `(event.target as HTMLInputElement).type || null`。
- 置信度：9/10
- 级别：低（数据完整性）

## Finding 13 [LOW] content_script.ts: iframe frame_id 用 Math.random() 生成

- 位置：`src/extension/content/content_script.ts:38`
- 现象：`frame_id = Math.floor(Math.random() * 1000000)` 对 iframe 生成随机 ID，同一页面多个 iframe 可能碰撞。
- 影响：概率低（百万分之一），但无唯一性保证。
- 建议：可接受当前实现。如需更强保证，可用 `crypto.getRandomValues` 或递增计数器。
- 置信度：9/10
- 级别：低（边缘场景）

---

## 总结

| 级别 | 数量 | 关键项 |
|------|------|--------|
| 高   | 3    | keyboard shortcuts 脱敏失效；form_action URL 未脱敏；storage tab_id 硬编码 |
| 中   | 5    | dom_capture 旧格式结构不一致；截断多字节问题；ws_connections 无上限；旧格式缺 event_id；network_hook tab_id 待确认 |
| 低   | 5    | injected scripts 不可逆；wheel/drag 缺 target 文本；params any 类型；keyboard target_input_type 为空；iframe frame_id 碰撞 |

核心风险集中在 **隐私一致性**（keyboard shortcuts 脱敏例外、form_action URL 泄漏）和 **数据完整性**（storage tab_id=0、dom_capture 事件结构差异）。listener 生命周期管理整体良好，所有模块均有 start/stop 配对和 is_capturing 守卫。消息边界方面，postMessage origin 校验和 source 校验到位，但 injected script 不可逆是已知设计限制。
