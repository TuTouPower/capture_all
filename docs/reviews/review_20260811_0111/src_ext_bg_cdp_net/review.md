# 全量审阅 src_ext_bg_cdp_net

- 范围：当前工作区文件状态（禁止 diff/log）
- 模块：`src/extension/background` CDP / network / console / cookie / exception / exporter
- 文件：9；清单见 `file_list.txt`
- reviewed_at：2026-08-11（UTC+8）
- 视角：CDP 状态键、网络关联、body 捕获、Cookie 范围、console/exception 过滤、导出、竞态

## Findings

### f001 - 生产路径未用 session 复合键，跨子目标 requestId 碰撞

- 严重度：critical
- 锚点：行为缺陷 — auto-attach 后 iframe/worker 与主文档 requestId 可重复，Map 互相覆盖 → 串 body / 丢事件
- 位置：
  - `src/extension/background/network_capture.ts:42-60,400-457,461-514,525-643,656-730`（`cdp_request_meta` / `cdp_body_results` / `streaming_requests` / `ws_connections` 等均以裸 `req_id` 为键）
  - 对照：`src/extension/background/cdp_handler.ts:131-135,186-190` 已实现 `cdp_request_key = ${sessionId ?? 'root'}:${requestId}`，但 **service_worker 实际调用的是 `network_capture` 内联 `handle_cdp_event`，未委托 `cdp_handler.handle_cdp_event`**
- 问题：
  - `domain.md` / ADR 009 / architecture 均要求复合键；`network_capture` 仍单键。
  - `Target.setAutoAttach({ flatten: true })` 已启用（`network_capture.ts:216-220`），碰撞条件真实存在。
  - 碰撞后 `requestWillBeSent` 覆盖 meta、`loadingFinished` 取到错误 meta、SSE 流 append 到错误 buffer。
- 建议：生产路径统一 `cdp_request_key`；Map/Set/stream_buffer/deferred 索引全用复合键；对外 `request_id` 字段仍可保留原始 CDP requestId（并可选附 `cdp_session_id`）。

### f002 - 子目标 CDP 命令未带 sessionId，iframe/worker body 必然失败

- 严重度：critical
- 锚点：行为缺陷 — 子 session 的 `getResponseBody` / `streamResourceContent` 打到 root session → `cdp_failed` 或空 body
- 位置：
  - `network_capture.ts:498-501` `streamResourceContent`：`{ tabId: dbg_tab_id }` 无 `sessionId`
  - `network_capture.ts:562-565` `getResponseBody`：同上
  - `cdp_handler.ts:301-304,383-386` 同样缺失（即便将来切换到该模块仍坏）
  - `chrome.d.ts` 已声明 `target: { tabId; sessionId? }`，类型允许但未使用
- 问题：auto-attach 子目标事件 `source.sessionId` 有值，但取 body 时命令目标不含 session → Chrome 在 root session 查 requestId 失败。主框架请求不受影响，带 iframe/worker 的页面系统性丢 body。
- 建议：`sendCommand({ tabId, sessionId: source.sessionId }, ...)`；root 事件 `sessionId` 省略。

### f003 - runtime exception 事件结构错误且写入错误 sink，异常全丢

- 严重度：critical
- 锚点：行为缺陷 — `Runtime.exceptionThrown` 永不入库
- 位置：
  - `exception_capture.ts:165`：`send_event({ ...event, ...event_data })` 把 `message`/`stack_trace` 摊到顶层，**无 `data` 字段**
  - 对照正确写法 `console_capture.ts:168`：`{ ...base, data }`
  - `service_worker.ts:472-474`：`start_exception_capture(..., handle_console_log, ...)`
  - `service_worker.ts:871-874`：`handle_console_log` 要求 `event.data`，缺失则 `return`
- 问题：
  1. `event.data` 为 undefined → 静默丢弃。
  2. 即便补上 `data`，仍走 `write_console_events`，而 domain 规定 Console / Error **分 store**（`runtime_exception` 属 error）。
- 建议：`send_event({ ...base, data: event_data })`；SW 侧单独 `handle_exception` → `write_events`（category=`error`），勿复用 `handle_console_log`。

### f004 - stop 未取消 deferred / orphan timer，跨采集串写与幽灵事件

- 严重度：important
- 锚点：竞态 — stop 后 timer 仍 fire；新 start 后旧 callback 污染新 capture 状态
- 位置：
  - `network_capture.ts:119-160` `stop_network_capture`：未遍历 `deferred_web_requests` 做 `clearTimeout`，未 `deferred_web_requests.clear()` / `_deferred_cdp_index.clear()`
  - `network_capture.ts:1092-1113` deferred 回调无 `is_capturing` 守卫即 `send_to_background`
  - `network_capture.ts:779-815` `schedule_orphan_check` 裸 `setTimeout`，无 timer 表；`cdp_handler.ts:841-879` 有 `orphan_timers` + `clear_orphan_timers`，生产路径未用
  - 在途 `getResponseBody` `.then`（`network_capture.ts:566-643`）stop 清 map 后仍 `cdp_body_results.set` + `schedule_orphan_check`，可写入**下一次** capture 的模块级 Map
- 问题：
  - SW stop 刻意延迟 `is_capturing=false` 以 drain（`service_worker.ts:609-651`），deferred 1.5s 内仍可写入当前 capture（半预期）。
  - 危险路径：stop → 立即 start → 旧 deferred/orphan/getResponseBody 回调污染新 map 或向错误 capture 发事件。
- 建议：stop 时 `clearTimeout` 全部 deferred/orphan；`_deferred_cdp_index.clear()`；async CDP 回调入口校验 `is_capturing` + `capture_id` generation；在途 promise 丢弃结果。

### f005 - `finished_before_stream` 只增不减（非 SSE 请求），长采集 Map 泄漏

- 严重度：important
- 锚点：资源泄漏 — 每个 `loadingFinished` 向 Set 插入，非流式路径从不 delete
- 位置：`network_capture.ts:527` add；仅 `491` 在 stream race 路径 delete；stop 才 `clear`（155）
- 问题：普通 XHR/document 请求占绝大多数，长会话 Set 无界增长；与 `cdp_handler` emit 路径清理（`355/378/433/458/484`）行为不一致。
- 建议：非 stream 分支在处理完 loadingFinished 后立即 `finished_before_stream.delete(req_id)`，或仅 stream 候选才 add。

### f006 - loadingFailed 不立即 emit，失败请求延迟 3s 且无 error_text

- 严重度：important
- 锚点：行为缺陷 — 失败网络事件丢失时效 / 缺错误信息
- 位置：
  - `network_capture.ts:646-654`：只 `cdp_body_results.set` + deferred/orphan，不 `send_to_background`
  - 对照 `cdp_handler.ts:467-490`：有 meta 时立即 emit 并写入 `error_text`
  - CDP-first 下 attached tab 的 webRequest 已跳过（`840,1026`），失败请求唯一出口是 3s orphan → `build_cdp_only_request`（`network_correlator.ts:114-161`）无 `error_text` 字段
- 问题：用户可见为：失败请求晚 3s 才出现，且无 `errorText`（如 net::ERR_*）。
- 建议：对齐 cdp_handler——有 meta 立即 emit + `error_text`；扩展 `CdpBodyEvent` 或主路径直写。

### f007 - HAR `startedDateTime` 在 CDP-primary 路径退化为 1970

- 严重度：important
- 锚点：导出缺陷 — HAR 时间线不可用
- 位置：
  - `network_capture.ts:993-995` / `cdp_handler.ts:720-721`：`start_time_ms` / `end_time_ms` 恒 `null`
  - `exporter.ts:317-321`：`abs_time_ms = r.start_time_ms ?? 0` → `new Date(0).toISOString()`
- 问题：CDP-first 是 attached tab 主路径，导出 HAR 时几乎所有条目时间戳为 epoch。
- 建议：emit 时填 `start_time_ms = meta.timestamp`（或 CDP monotonic 转换）；exporter 回退用 `absolute_time` / capture start + relative。

### f008 - HAR 对 base64 响应未设 `content.encoding`

- 严重度：important
- 锚点：导出缺陷 — 二进制 body 被当 UTF-8 文本
- 位置：`exporter.ts:340-344`；CDP 侧 base64 时 `response_body_encoding: 'base64'`（`network_capture.ts:578-586,1008`）
- 问题：`build_har_entry` 把 base64 字符串写入 `content.text` 但不写 `encoding: 'base64'`，HAR 消费方误解码。
- 建议：`response_body_encoding === 'base64'` 时设置 `content.encoding = 'base64'`；`size` 用解码字节数（已有 `response_body_bytes` 路径可复用）。

### f009 - Cookie 目标域为空时退化为全浏览器采集

- 严重度：important
- 锚点：Cookie 范围 — 越权采全浏览器 cookie 变更
- 位置：
  - `cookie_capture.ts:44-46`：`target_domains.size === 0` → `return true`（不过滤）
  - `cookie_capture.ts:110`：`target_tab_url ? extract_target_domains(...) : new Set()`
  - `service_worker.ts:541`：`start_url || null`；`start_url` 空 / 非 URL 时 domains 为空
- 问题：隐私注释写「按目标 tab domain 过滤」（`cookie_capture.ts:64`），空 URL 时静默放开全浏览器 `chrome.cookies.onChanged`。
- 建议：domains 为空时 **默认不匹配**（或仅记 warn 并不采集）；`extract_target_domains` 失败与「未传 URL」区分。

### f010 - 双实现分叉：`cdp_handler` / `network_context` 旁路与生产路径语义漂移

- 严重度：important
- 锚点：架构缺陷 — 修复落在未接线模块，生产继续带病
- 位置：
  - 生产：`service_worker` → `network_capture` 模块级状态 + 内联 CDP/webRequest
  - 旁路：`cdp_handler.ts`（复合键、orphan_timers、loadingFailed 即发）、`network_context.ts`、`network_webrequest.create_webrequest_handlers`、`webrequest_handler` / `ws_handler` 未被 network_capture 编排
  - `cdp_primary_emitted`（`network_capture.ts:50,555,602,634`）只 add/clear **从不 has**，注释承诺的去重未实现（同 tab 现靠 `dbg_tab_id` 跳过 webRequest 部分兜住）
- 问题：T022/ADR009 修复若只在 `cdp_handler`，生产仍暴露 f001/f002/f004/f006。后续改一处漏一处。
- 建议：要么完成编排切到 state 对象 + cdp_handler，要么删除/折叠死代码并只维护 `network_capture` 一条路径。

### f011 - SSE/WS 截断有 status 但 body 无 `...[TRUNCATED]` 标记

- 严重度：minor
- 锚点：body 截断一致性
- 位置：
  - SSE cap：`network_capture.ts:195-208` 按字节切片，`response_body_status='too_large'`，无后缀标记
  - WS：`network_capture.ts:318-323` `payload.slice` + `too_large`
  - 对照 `redaction.truncate`：普通响应截断带 `...[TRUNCATED]`
- 问题：下游仅看 body 字符串时无法区分「完整」与「截断」；status 字段存在则影响有限。
- 建议：截断路径统一追加标记，或导出/UI 强制展示 `*_status`。

### f012 - console source filter 正确；exception 同构但被 f003 短路

- 严重度：minor（观察）
- 锚点：console/exception 过滤
- 位置：`console_capture.ts:108-136`、`exception_capture.ts:87-118` 均 `should_handle_event` + Target 生命周期 register/unregister
- 问题：过滤逻辑本身正确；共享 `cdp_event_router.attached_sessions` 全局 Set，多子系统并发 register/unregister 可接受。console 的 `_redactData` 参数未使用（仅 truncate args）。
- 建议：exception 修 f003 后保持同一 filter；未用参数删除或真正做内容脱敏。

### f013 - exporter 分页与 HTML escape 达标；app log 仍固定 10 万条

- 严重度：minor
- 锚点：导出
- 位置：
  - 分页：`exporter.ts:22-59` PAGE_SIZE=5000 循环至耗尽 — 符合 ADR 012
  - HTML：`escape_for_html_embed` + `escape_html`（`exporter.ts:149,167-168`）— 符合 domain
  - `export_app_logs`：`get_entries(100000, 0, ...)`（`exporter.ts:432`）仍静默截断
  - `include_response_body=false` 只剥 `response_body`，request body / preview 仍导出（`61-65`）
- 建议：app log 分页；敏感导出选项扩展到 request body。

### f014 - 关联器 concurrent 同 URL 可能 body 张冠李戴

- 严重度：minor
- 锚点：网络关联
- 位置：`network_correlator.ts:42-57`；`network_capture.ts:1154-1191` `find_matching_cdp_request` 取时间最近；`try_resolve_deferred`「第一个 pending 清空的 deferred 赢得 body」（`750-768`）
- 问题：CDP-first 下 attached tab 已不走 webRequest 关联，风险主要在 **未 attach / 跨 tab webRequest + 残留 CDP meta** 路径。同 URL 并发时 body 错配仍可能。
- 建议：关联键加入更多维度或 CDP-first 后彻底关闭 deferred 路径。

## 结论

- 本轮新发现：**14** 条（critical **3** / important **7** / minor **4**）
- 未进表提示：
  - 文件过大：`network_capture.ts` ~1198 行、`cdp_handler.ts` ~891 行（重要逻辑重复），建议拆分但本身不 blocking
  - `is_streaming_response` 仅 `text/event-stream` 合理，避免 chunked 误判（`network_capture.ts:829-833`）
  - Cookie 永不采 value（`value_status: 'not_captured'`）正确
  - 请求/响应头脱敏与 URL query 脱敏在 CDP/webRequest 主路径基本到位
- 总体判断：生产网络路径与文档/ADR 的 session 隔离承诺**不一致**；子目标 body 命令缺 sessionId；exception 采集链路**完全失效**。三项均为可观测缺陷，判定 FAIL。
- 系统性 follow-up 建议：
  1. 统一 CDP 状态键 + sendCommand sessionId（f001+f002）
  2. 修复 exception 事件形状与写入路径（f003）
  3. stop 生命周期闭合 timers/async（f004+f005）
  4. 折叠 `cdp_handler`/`network_capture` 双实现（f010）
  5. HAR 时间与 base64 encoding（f007+f008）

verdict: FAIL

## 计数

| 级别 | 数量 |
|------|------|
| critical | 3 |
| important | 7 |
| minor | 4 |
| **合计** | **14** |

输出路径：`/home/karon/karson_ubuntu/capture_all/docs/reviews/review_20260811_0111/src_ext_bg_cdp_net/review.md`
