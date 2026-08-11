# Review: src/extension/content（全量当前状态）

- **批次**: `src_ext_content`
- **范围**: 16 个 `.ts`（见 `file_list.txt`）
- **方式**: 只读当前文件；未用 git diff/log
- **评审重点**: 注入安全、隐私、event_id/tab_id/frame_id、network_hook 体截断/流式、生命周期、高频节流

---

## Findings

### B1. `network_hook` 无条件启动，配置与 body 降级策略均被绕过

**严重度**: blocking  
**文件**: `src/extension/content/content_script.ts` L106；`src/extension/content/network_hook.ts` 全文  
**问题**:  
`start_capture` 无条件调用 `start_network_hook`，不读 `config.capture_network`、`config.capture_response_body`，也不感知 background `body_capture_mode`。  
架构/spec 写明 fallback hook 仅在 CDP 与 external bridge 均不可用时使用；实现是**始终**注入 page fetch/XHR hook 并上报。

**可观测后果**:
1. `capture_network=false` 或 `capture_response_body=false` 时仍 monkey-patch 页面网络并采集响应体。
2. CDP/`webRequest` 正常工作时，同一 XHR/fetch 可能双路入库：background `write_network_requests(flat NetworkRequestData)` + content `handle_event` → `write_events`（`type: network_request`，`data` 嵌套）。
3. SW `handle_event` 仍特判 `type === 'network_body_hook'`（`service_worker.ts`），content 实际发 `network_request`，fallback 相关分支成死代码；hook 事件不经 `handle_network_request`，`request_count` 等 stats 路径不一致。

**建议**: content 仅在 SW 下发 `body_capture_mode === 'fallback_hook'`（或显式 start flag）时启动；并尊重 `capture_network` / `capture_response_body`；事件类型/写入路径与 SW 契约统一（优先 `handle_fallback_body_event` 或统一 flat `NetworkRequestData`）。

---

### B2. Page → content `postMessage` 仅靠静态 SIGNAL，无 nonce，可伪造采集事件

**严重度**: blocking（数据完整性 / 注入安全）  
**文件**:
- `network_hook.ts` L11–16, L270–276
- `websocket_capture.ts` L12–18, L138–143
- `storage_capture.ts` L12–17, L80–85

**问题**:  
校验仅有 `e.origin === location.origin`、`e.source === window`、`d.source === SIGNAL`。`SIGNAL` 为编译期常量（`__capture_all_network_hook__` / `__capture_all_ws__` / `__capture_all_storage__`），页面可读、可伪造。无 per-session nonce，无字段 schema 校验（method/url/action/direction 等任意可写）。

**可观测后果**: 任意同源页面脚本：

```js
window.postMessage({
  source: '__capture_all_network_hook__',
  method: 'POST',
  url: 'https://attacker.example/poison',
  status: 200,
  response_body: 'forged',
  response_body_status: 'captured',
  duration_ms: 1
}, location.origin);
```

在采集中即可写入伪造 `network_request` / `ws_message` / `storage_change`，污染 session。

**建议**: 注入前生成一次性 nonce（仅 content 持有），page script 闭包携带；content 校验 nonce；对 payload 做白名单/类型收窄。

---

### B3. 状态轮询路径 `tab_id` 串台

**严重度**: blocking  
**文件**: `content_script.ts` L65–77（`on_active` 使用 `resp.tab_id`）  
**对照**: SW `get_status` 返回 `current_capture?.tab_id`（**启动时** active tab，非消息发送方 tab）

**问题**:  
BUG-004 轮询恢复时：`tab_id = resp.tab_id ?? 0`。该值是 capture 记录上的起始 tab，不是当前 content 所在 tab。  
`tabs.sendMessage` 的 start 路径正确传 `tab_id: tab.id`；**仅 poll 恢复路径错误**。

**可观测后果**:  
多 tab 同时 capturable、或 start 消息失败后靠 poll 拉起时，非起始 tab 上的 mouse/keyboard/dom/network 等事件全部打上错误 `tab_id`，时间线串台、按 tab 过滤失真。Content 侧无法从 `chrome.runtime` 可靠自知 tab id，必须由 SW 在 get_status/start 中按 **sender.tab.id** 下发。

**建议**: `get_status` 用 `sender.tab?.id`；或 poll 响应不带全局 tab_id，改为 SW 在确认 active 后对该 tab 发带正确 `tab_id` 的 `start`。

---

### H1. `frame_id` 未传入各采集模块（iframe 恒为 0）

**严重度**: high  
**文件**: `content_script.ts` L35–38, L101–114, L217–224；各 `*_capture.ts` 的 `create_content_event` 调用

**问题**:  
iframe 内 `frame_id = Math.floor(Math.random() * 1000000)`，但只用于 content_script 自身 navigation 事件与 ping。所有模块 `create_content_event` 未传 `frame_id`，默认 `0`（`event_utils`）。

**可观测后果**: `all_frames: true` 下 iframe 与顶层用户行为/输入/网络 hook 事件无法区分 frame；随机 `frame_id` 形同虚设。

**建议**: `create_content_event` 默认读模块级 frame_id，或 start_* 统一增加 frame_id 参数。

---

### H2. `storage_capture` / `websocket_capture` 事件载荷扁平化，与 `data` 嵌套契约不一致

**严重度**: high  
**文件**:
- `storage_capture.ts` L102–111：`send_event({ ...base, ...data })`
- `websocket_capture.ts` L153–162：同上
- 对照：`mouse_capture` / `dom_capture` / `network_hook` / `form_submit` 等经 `send_event(event, data)` → `{ ...event, data }`

**问题**:  
`CaptureEvent` / dashboard（`e.data || {}`）约定类型载荷在 `data`。storage/ws 把 `StorageChangeData` / `WsMessageData` 摊到根上，`data` 缺省。

**可观测后果**: dashboard 时间线 `storage_change` 的 key/详情为空或错误；与 agent 侧把 storage 当 flat `StorageChangeData` 的假设也不一致（消费者分裂）。导出/查询若统一读 `event.data` 则丢字段。

**建议**: 一律 `sender(base, data)`；SW/查询层只认一种形状。

---

### H3. 密码框键盘事件未单独屏蔽

**严重度**: high（隐私，配置组合可触发）  
**文件**: `keyboard_capture.ts` L64–106；对照 `dom_capture.ts` L104–108

**问题**:  
`dom_capture` 对 `type=password` **永远** `value_status: not_captured`。  
`keyboard_capture` 仅当 `redact_data` 时 mask `key`/`code`；`keyboard_capture_mode === 'all'` 且 `redact_data === false` 时，密码框逐键完整采集。

**可观测后果**: 关闭 redact 并全量键盘时，密码可从 key 序列还原；与 DOM 密码策略不一致。`target_input_type` 仍会标 `password`，但不足以保护内容。

**建议**: `target.type === 'password'`（及 `autocomplete` 敏感类型）强制 `key`/`code` null + `key_status: 'masked'`，优先于 redact 开关（对齐 `redact_password` 语义）。

---

### M1. `fetch` 仅从 `init.method` 取方法，`Request` 对象方法丢失

**严重度**: medium  
**文件**: `network_hook.ts` L134–136

```js
var method = (init && init.method) || 'GET';
var url = typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input));
```

**可观测后果**: `fetch(new Request(url, { method: 'POST', body }))` 无第二参时记成 `GET`。

**建议**: `input instanceof Request` 时用 `input.method`，`init?.method` 覆盖。

---

### M2. SPA `history.pushState` / `replaceState` 未 hook；`popstate` 动作标错

**严重度**: medium  
**文件**: `content_script.ts` L125–154

**问题**:  
仅 `popstate` + `hashchange`。现代 SPA 主路径 `history.pushState`/`replaceState` 不触发 `popstate`，`route_change` 大量缺失。  
`handle_popstate_navigation` 固定 `route_action: 'push_state'`，实际多为 back/forward。

**建议**: page 注入 patch `history.pushState`/`replaceState` + 正确枚举 `route_action`。

---

### M3. `network_hook` 全量 `text()` 再截断，无 streaming；大响应内存风险

**严重度**: medium  
**文件**: `network_hook.ts` L79–86, L187–195；`constants.ts` `MAX_BODY_CAPTURE_BYTES = 100MB`

**问题**:  
`clone.text()` / `responseText` 先整包进内存，再 `TextEncoder` 二次分配后截断。多字节截断本身（byte slice + `TextDecoder`）正确，但：
- 无 streaming / 增量上限
- 接近 100MB 文本时主线程与堆压力可观测（卡顿/OOM）
- 未使用 per-capture `config.max_body_capture_bytes`

**建议**: 优先 `ReadableStream` 限长读取；注入上限取 config；超限尽早 abort clone 消费。

---

### M4. stop 后 page 侧 hook 永不卸载；poll 永久停止导致二次 start 无 poll 兜底

**严重度**: medium  
**文件**:
- `network_hook.ts` / `websocket_capture.ts` / `storage_capture.ts`：`__capture_all_*_installed__` 永久；`stop_*` 只摘 content listener
- `content_script.ts` L205–206：`stop_capture` 调用 `stop_status_poll()`

**问题**:
1. stop 后页面仍跑 patch 的 fetch/XHR/WS/storage（持续 postMessage，content 因 `is_capturing` 丢弃）——开销与攻击面残留。
2. 一次 stop 后 poll 不再启动；后续仅依赖 `tabs.sendMessage(start)`。若 start 消息再失败，BUG-004 场景复发直至导航重载 content。
3. `poll_capture_status.check_once` 在 `await get_status` 返回后不检查 `stopped`，与 stop 竞态下 theoretically 可 `on_active` 再 start（窗口窄，取决于 SW 状态）。

**建议**: stop 可恢复 page 原型（或 postMessage 带 generation，stop 后 generation++）；stop 后若需支持再 start，保留“仅在 SW 仍 capturing 时”的轻量 poll，或 SW 保证 start 重试。

---

### M5. `clipboard_capture` 仅 patch content isolated world 的 `navigator.clipboard`

**严重度**: medium  
**文件**: `clipboard_capture.ts` L29–41

**问题**: Content script 与 page 不共享 JS 对象；页面调用 `navigator.clipboard.writeText/readText` **不会**进入 content 的 monkey-patch。仅 `copy`/`paste` DOM 事件覆盖用户快捷键/菜单路径。

**可观测后果**: 站点用 Clipboard API 的读写在采集中缺失（与 storage/WS 的 page inject 模式不一致）。

**建议**: 与 storage 相同，注入 page script patch + postMessage（注意不采集剪贴板正文，仅 action——当前隐私策略可保留）。

---

### M6. CSS 路径用 `nth-of-type` 计数却输出 `:nth-child`

**严重度**: medium  
**文件**: `dom_capture.ts` L53–70

```ts
const n = get_nth_of_type(element); // 同 tag 序号
return `${tag}${class_part}:nth-child(${n})`;
```

**可观测后果**: 兄弟中存在其他 tag 时 selector 不匹配真实节点，回放/定位错误。应改为 `:nth-of-type(n)` 或按**所有** children 下标用 `:nth-child`。

---

### M7. `resource_type` 恒写 `fetch`；XHR 与 fetch 不可分

**严重度**: medium  
**文件**: `network_hook.ts` L48/71/95 等 page 侧 `resource_type: 'xhr'`，L285 content 侧强制 `resource_type: 'fetch'`

**可观测后果**: 所有 fallback 请求类型失真。

---

### M8. 高频路径节流基本有效；边界需注意

**严重度**: low / 观察项  
**文件**: `mouse_capture.ts` L167–185；`scroll_capture.ts` L39–69；`resize_capture.ts` L34–55

- mousemove：`sample_rate_ms` + rAF 合并，逻辑正确；`sample_rate_ms` 缺省/0 时比较失效会退化为每帧一条（依赖 config 完整性）。
- scroll/resize：200ms debounce，stop 清 timer，正确。
- wheel/click 无节流：符合“精确点击”预期，`full_trajectory` 下 wheel 仍可能偏密。

---

### L1. 其它（non-blocking）

| ID | 说明 |
|----|------|
| L1 | `form_submit` 仅元数据、不采字段值，隐私面良好；`form_action` 脱敏需 `redact_data && redact_url_query` 同时为真 |
| L2 | `network_hook` 永不采 request body（`not_enabled`），与 `capture_request_body` 无关——降级能力缺口 |
| L3 | `performance.timing` 已废弃，`page_load` 耗时常为 0/null |
| L4 | `focus_capture` 与 `dom_capture` 对表单控件双发 focus/blur（不同类型），属产品选择但事件量×2 |
| L5 | `event_id` 经 `create_content_event` → `generate_event_id`，模块侧齐全 |
| L6 | start 消息来自扩展上下文，页面无法直接 `chrome.runtime` 伪 start（边界正确） |

---

## 结论

Content 层模块切分清晰，stop 时 DOM listener 摘除较完整，`dom_capture` 密码值、`clipboard` 不落正文、`storage` 只记长度等隐私默认值多数合理。`create_content_event` 统一 event_id/source 有利于入库。

但本批存在三类必须修的问题：

1. **注入通道**：静态 SIGNAL 的 postMessage 可被页面伪造（B2）。  
2. **网络 hook 策略**：无条件 fallback + 错误事件类型/写入路径，配置失效且可能与 CDP 重复污染（B1）。  
3. **身份字段**：poll 路径 `tab_id` 串台（B3）；`frame_id` 未进模块（H1）；storage/ws 载荷形状分裂（H2）。

隐私上键盘对密码框缺少与 DOM 对称的硬屏蔽（H3）。性能上 mouse/scroll 节流主体可用；network 全量 body 缓冲是 fallback 模式下的主要风险点（M3）。

---

## Verdict

**REQUEST CHANGES**

| 级别 | 数量 |
|------|------|
| blocking | 3（B1–B3） |
| high | 3（H1–H3） |
| medium | 7（M1–M7） |
| low / 观察 | 若干（M8、L*） |

合并或发布前至少关闭 B1–B3；建议同步处理 H1–H3。

---

## 文件覆盖

| 文件 | 结论摘要 |
|------|----------|
| `content_script.ts` | 编排完整；poll tab_id、frame_id 未下发、network 无条件 start、SPA 不全 |
| `content_event_utils.ts` | 薄封装 OK；frame_id 可选默认 0 |
| `network_hook.ts` | 多字节截断 OK；伪造/无配置/全量 text/method/Request 问题 |
| `websocket_capture.ts` | 单 listener 设计好；SIGNAL 可伪造；载荷扁平 |
| `storage_capture.ts` | 不采 value OK；SIGNAL 可伪造；载荷扁平 |
| `dom_capture.ts` | 密码值保护好；nth-child 错误 |
| `keyboard_capture.ts` | redact/shortcuts OK；密码键缺口 |
| `mouse_capture.ts` | 节流 OK |
| `scroll_capture.ts` / `resize_capture.ts` | debounce OK |
| `form_submit_capture.ts` | 元数据 only，较好 |
| `clipboard_capture.ts` | 不采正文；isolated patch 漏 page API |
| `focus_capture.ts` / `visibility_capture.ts` / `fullscreen_capture.ts` / `print_capture.ts` | 生命周期 stop 正确；问题少 |
