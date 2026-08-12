# B3 内容脚本层全量审查报告

**范围**：`src/extension/content/` 18 个 .ts（2363 行），跨模块 `src/shared/*`、`src/extension/shared/*`，测试 `tests/unit/` 对应项。

## 审查基线（已核对、无问题的项目约束）
- postMessage 指定 `targetOrigin=window.location.origin`（storage/ws/network 三处注入脚本），接收方校验 `e.origin` + `e.source===window` + nonce + per-message HMAC。合格。
- `type=password` 在 `dom_capture.compute_value_fields` 置 `not_captured`，有测试锁定。合格（但 keyboard 层遗漏，见 High-1）。
- 无 `console.log`；日志走 `MessageLogTransport`。
- `redact_url` 深度 fail-closed、嵌套 query 递归、header 脱敏均经 `redact_headers/redact_url`，background CDP/web_request 路径正确套用 `config.redact_data`（network_capture.ts:256-260）。**但 content 侧 fallback/ws 路径未套用**（见 High-2/3）。
- dashboard 渲染全部经 `esc()`（escape_html），页面可控字符串不构成仪表盘 XSS。链路已验证闭合，无 XSS finding。

## Critical
无（无直接 XSS/RCE/密钥硬编码；注入脚本不插值页面数据）。

## High
### H-1 键盘事件对 type=password 输入框不设防，明文击键入库
- severity: High, confidence 85, **预存**（c88c556f / 2026-06-08）
- file:line: `keyboard_capture.ts` L83-L98（`build_key_event`）
- 证据：`key: masked ? null : event.key`，`masked = config.redact_data`。`keyboard_capture_mode==='all'` 且 `redact_data=false` 时，焦点在 password 输入框内每次击键的 `event.key`（明文密码字符）被采集。全模块无 `target.type==='password'` 检查，违反「type=password input 永不采集」绝对约束。`dom_capture` 有专门守卫（L98-102），keyboard 缺失。现有 `keyboard_capture.test.ts` 只测 redact_data 掩码，**无 password 用例**。
- 修复：`build_key_event` 入口加
  ```ts
  const t = event.target as HTMLElement | null;
  if (t instanceof HTMLInputElement && t.type === 'password') return; // 或置 key=null/key_status='masked'
  ```
  并补测试（all 模式 + password input + redact_data=false → 不采集 key）。
### H-2 WebSocket 内容通道 ws_url 未脱敏、data_preview 不受 redact_data 门控
- severity: High, confidence 75, **预存**（034a7ac6 / 2026-06-14）
- file:line: `websocket_capture.ts` L190-L196（接收）、L61-L86（注入脚本 200 字节 preview 无条件采集）；`network_hook` 同型
- 证据：接收侧 `ws_url: d.ws_url ?? ''` 原样入库，`data_preview` 至多 200 字节原始文本；注入脚本 `build_page_script(secret)` 不接收 redact 参数，默认 `redact_data=true` 时每条 WS 消息前 200 字节仍全量入库。对照 background CDP ws 路径 `network_capture.ts:724` 对 url 做了 `redact_url(..., config.redact_data && config.redact_url_query)`。`ws://host?token=SECRET` 与消息明文默认配置下直接入库。
- 修复：注入脚本 `post()` 前按 redact 配置对 ws_url 做 `redact_url`、对 data_preview 置 `[REDACTED]`（或 content 接收侧统一脱敏），并补测试。
### H-3 network_hook fallback 路径 URL 不脱敏（url_status 恒 'captured'）
- severity: High, confidence 80, **预存**（c88c556f / 2026-06-08）
- file:line: `network_hook.ts` L358-L359（`url: d.url || ''`、`url_status: 'captured'`），注入脚本 L178-L207
- 证据：注入脚本 `post()` 原样携带 `url`（含 query），content 侧 `build_network_data({ url, url_status:'captured' })` 不套 `redact_url`。background CDP/web_request 路径全部 `redact_url`。fallback_hook 是 CDP 与 bridge 均不可用时的唯一通道，此路径下 `?token=` 等敏感 query 默认直存。
- 修复：接收侧对 `d.url` 套 `redact_url(url, config.redact_data && config.redact_url_query)` 并写入 url_status；补测试覆盖 redact 开/关。
### H-4 stop 后页面 hook 永久残留，network_hook 持续对每次 fetch/XHR 全量读 body
- severity: High, confidence 80, **预存**（注入脚本 c88c556f 等）
- file:line: `network_hook.ts` L392-L398（stop 仅删 message_listener）、注入脚本 L178-L208 / L220-L281；同型 `storage_capture.ts` L178-L184、`websocket_capture.ts` L212-L218
- 证据：stop_capture 只 `removeEventListener('message')`，不还原 `window.fetch`/`XMLHttpRequest`/`localStorage`/`WebSocket`。注入脚本闭包对 stop 无感知：停止后页面上每次 fetch 仍执行 `response.clone()` + `clone.text()`（全量读 body 至多 100MB），XHR `loadend` 仍 post；storage 每次 `setItem` 仍跑 HMAC+postMessage。全部消息因 nonce/listener 失效被丢弃，但计算开销与内存峰值持续到页面导航为止，且页面 API 行为被永久改写。
- 修复：stop 时注入一条还原脚本（复用 `__capture_all_*_prev__` 还原点），或注入脚本轮询「enabled」window 标记短路。补 stop→hook 空转验证测试。

## Medium
- **M-1** storage/ws 事件载荷合并到 event 顶层而非 event.data，破坏 TypedCaptureEvent 契约 — `storage_capture.ts` L173、`websocket_capture.ts` L207（`state.sender?.({ ...base, ...data } as ...)`）。其余全部模块把 payload 放 `event.data`；dashboard `event_detail/event_title` 读 `(e.data||{})` → storage 事件 key 丢失，UI 显示「 changed」。修复：改 `state.sender?.(base, data)`，补 e.data 含 key 断言。confidence 90，预存但 8c82218 refactor 保留。
- **M-2** 注入脚本内联 secret 可被页面提取，HMAC 防伪门可被绕过 — `storage_capture.ts` L43、`websocket_capture.ts` L36、`network_hook.ts` L34。注释称 secret 不写 window，但 secret 以 `<script>` 文本注入 DOM，页面可用 MutationObserver/appendChild 钩子截获。拿到 secret 即可对三通道构造合法签名伪造事件。修复：secret 分片/随机化时序，或威胁模型文档明示已接受风险。confidence 70，预存（849b739e），注释已承认 ADR-020。
- **M-3** strict-CSP 页面注入脚本静默失败无诊断 — `storage_capture.ts` L109-118、`websocket_capture.ts` L150-159、`network_hook.ts` L313-322（inject_page_script 空 catch）。script-src 不含 unsafe-inline 时注入被拒，三类采集静默降级 0 条。修复：注入失败发 capture_error（recoverable=false）+ SW 计入 stats。confidence 70。
- **M-4** in-flight 状态轮询可在 stop 后复活采集（zombie 采集）— `poll_capture_status.ts` L43-L54（check_once 不检查 stopped）、`content_script.ts` L66-L81。SW stop drain 期间 is_capturing 仍 true，响应触发 on_active → start_capture 守卫放行 → 内容脚本 zombie 态；此后 SW 再 start，内容脚本 is_capturing=true 吞掉 start 消息。修复：check_once 在 on_active 前加 `if (stopped) return`；on_active 比对 capture_id。confidence 60。
- **M-5** fallback hook 对超大响应体全量缓冲（clone.text() + 结构化克隆）— `network_hook.ts` 注入脚本 L117-L152（fetch）、L231-L245（XHR）。100MB JSON 即 100MB 内存 + postMessage 克隆 + sendMessage + 落库。修复：hook 路径上限收紧（inline_text_max_bytes 级）或流式分段；>N 字节短路置 too_large。confidence 75。
- **M-6** focus 事件双重采集：dom_capture(focusin/focusout) 与 focus_capture(focus/blur) 各发一条 — `dom_capture.ts` L26-L27、`focus_capture.ts` L27-L28。同一元素获焦产生 2 条不同类型事件冗余 ~2x。修复：二选一，补共存回归测试。confidence 85。
- **M-7** network_hook 全部请求 resource_type 恒 'fetch'，XHR 误标 — `network_hook.ts` L361（硬编码 'fetch'），注入脚本 L72/L99 已正确带 'xhr'。修复：读 `d.resource_type` 合法化映射。confidence 85。
- **M-8** content onMessage 对未知 action 不调 sendResponse 却 return true，通道挂起 — `content_script.ts` L43-L58。非 start/stop/ping 消息既不处理也不响应，尾部无条件 return true → 发送端 promise 永不 resolve。修复：未知 action 显式 `sendResponse({success:false,error:'unknown_action'})`。confidence 55。

## Low（预存）
- **L-1** scroll 仅采集窗口滚动，嵌套滚动容器事件重复且坐标不变 — `scroll_capture.ts` L45-L55。修复：捕获 event.target 判断滚动源。
- **L-2** request_id 碰撞 — `network_hook.ts` L356（`hook_${Date.now()}_${6位随机}`）。修复：自增计数器拼接。
- **L-3** XHR 复用对象 loadend 监听累积 — 注入脚本 L226。每次 send() 都 addEventListener。修复：先 removeEventListener。
- **L-4** build_xpath 对 id 含单引号未转义 + selector `#${id}` 原始拼接 — `dom_utils.ts` L15。修复：xpath concat() 转义、CSS.escape(id)。
- **L-5** storage key 名称不脱敏 — `storage_capture.ts` L152-L162。敏感 key 名是隐私外延。建议对 token/secret/password 匹配 key 置 `[REDACTED]`。
- **L-6** page_load 时序可能出现负值 — `content_script.ts` L95-L97（`loadEventEnd-navigationStart || null`，0 时 -5 真值）。修复：显式 `>0 ? ... : null`，改 performance.getEntriesByType('navigation')。
- **L-7** clipboard 双路径可能双报同一操作 — `clipboard_capture.ts` L40-L43。加窗口期去重或文档说明。
- **L-8** 二进制 content-type 在 CAPTURE_BODY=false 时仍报 'unsupported' — 注入脚本 L80-L99。修复：先判 `!CAPTURE_BODY`。

## Info
- **I-1** frame_id 为随机值非真实 frameId，跨 frame 关联弱 — `content_script.ts` L37-L39。SW 侧 get_status 未用 sender.frameId。
- **I-2** create_capture_state begin 的 sender 类型 cast 松动 — `content_event_utils.ts` L67。可改重载/逆变参数避免 cast。
- **I-3** 多个数据字段恒 null（类型占位）— `mouse_capture.ts` L104-L107、`dom_capture.ts` L141/L147。
- **I-4** storage value_length 用 UTF-16 length 非字节 — 注入脚本 L79。
- **I-5** end() 不复位 capture_id/epoch/tab_id — `content_event_utils.ts` L75-L80。
- **I-6** 注入脚本对 undefined 值事件仍 post — `websocket_capture.ts` 注入脚本 L72-L75。

## 测试覆盖核查（P7）
| 关注点 | 状态 |
|---|---|
| password 不采集（dom input） | 有（dom_capture_privacy.test.ts） |
| password 不采集（keyboard） | **缺** → H-1 |
| 脱敏开关生效 | input/keyboard/network URL 有；ws/fallback 无 → H-2/H-3 |
| origin/nonce/HMAC 校验 | 充分（含旋转/伪造/旧签名） |
| stop 清理 | 有 listener 清理断言；缺页面 hook 还原断言 → H-4 |
| ws 二进制/too_large/空 payload | 有 |
| 载荷契约（event.data） | 缺 storage/ws e.data 断言 → M-1（现有测试反而锁定错误行为） |
| 事件去重（focus 双报） | 缺 → M-6 |
| CSP 失败诊断 | 缺 → M-3 |
| content_postmessage_nonce / network_hook_gate_behavior / content_hmac_vectors | 质量高（RFC 向量、双实现漂移、e2e 签名交叉验证）；network_hook_config_gate / status_poll_sender_tab 属表层断言 |

## Summary
- 18 个 .ts，2363 行；跨模块 9 个；测试 18 项。
- Critical 0 / High 4 / Medium 8 / Low 8 / Info 6。
- 核心风险 Top5：
  1. password 击键明文泄漏（H-1）：keyboard 无 password 守卫，违反绝对约束，无测试。
  2. content 侧 URL/消息体脱敏缺失（H-2/H-3）：ws_url、ws 消息前 200 字节、fallback hook URL 默认配置下原文入库。
  3. stop 不还原页面 hook（H-4）：页面 API 永久改写，network_hook 持续全量读 body。
  4. storage/ws 载荷契约破坏（M-1）：payload 在事件顶层，dashboard 丢 key、导出归档错位。
  5. secret 可被页面提取 + CSP 静默失败（M-2/M-3）：HMAC 防伪门可绕过，strict-CSP 站点采集归零无诊断。
