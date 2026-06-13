# Capture All — TASKS.md

> 基准：`docs/design/caputue-all/project/record-all/` (commit `f7fe756`)

---

## P0 · 功能缺陷


## P0 · 功能缺陷（待修复）

### ✅ P0.57 streamResourceContent 对所有请求触发（is_streaming_response 匹配过宽）
- **状态**：已修复 — 2026-06-13
- **现象**：采集 chatgpt.com 时日志出现大量 `streamResourceContent_failed`，涉及 favicon、CSS、woff2、POST 等**非流式请求**。正常采集流程不应对这些请求调用 `streamResourceContent`。
- **根因**：`src/background/network_capture.ts` 的 `is_streaming_response()` 判定过宽：
  1. `ct.includes('stream')` 会匹配任何 content-type 含 `stream` 的响应（如未来可能出现的 `application/stream+json` 等非 SSE 类型）。
  2. **更关键**：`te.includes('chunked') && !cl` 条件——HTTP/1.1 普通响应也带 `transfer-encoding: chunked`（无 `content-length`），此条件会把**所有 HTTP/1.1 chunked 响应**误判为流式。实际只有 SSE（`text/event-stream`）和真正的 fetch streaming 才应走 `streamResourceContent` 路径。
- **影响**：
  - 每个非流式请求都多一次无意义的 CDP 调用（`streamResourceContent`），增加延迟和日志噪音。
  - `streamResourceContent` 失败后设置 `response_body_status = 'partial'`，导致普通请求的 body 状态被错误降级为 partial（应为 captured）。
  - 如果 `streamResourceContent` 恰好在 `loadingFinished` 之前成功，会把普通请求当流式处理（走 stream_buffer 而非 getResponseBody），可能丢失 body。
- **测试为什么没发现**：单测只测了干净的 header 组合（`{ 'transfer-encoding': 'chunked' }` 无 content-length），没测真实浏览器场景——HTTP/1.1 chunked 响应同时带 `content-type: text/css` 等非流式 MIME。
- **要求**：
  1. `is_streaming_response` 只匹配 `text/event-stream` 和明确的流式 content-type（含 `stream` 且非 `application/octet-stream` 等）。
  2. 移除 `transfer-encoding: chunked && !content-length` 条件（HTTP/1.1 chunked 是传输编码，不是流式语义）。
  3. 补测试：`{ 'transfer-encoding': 'chunked', 'content-type': 'text/css' }` → `false`；`{ 'content-type': 'text/event-stream' }` → `true`。

### ✅ P0.58 send_ws_frame 中 raw_payload 为 undefined 时触发 TypeError
- **状态**：已修复 — 2026-06-13
- **现象**：WebSocket 帧采集时抛出 `TypeError: Cannot read properties of undefined (reading 'replace')`，来自 `base64_decoded_size(undefined)`。
- **根因**：`src/background/network_capture.ts` 的 `send_ws_frame()` 中：
  ```ts
  const raw_payload = resp.payloadData ?? null;  // ?? 只拦截 null，不拦截 undefined
  ```
  CDP 的 `webSocketFrameReceived`/`webSocketFrameSent` 事件中，控制帧（ping/pong/close）或无 payload 的帧可能不携带 `payloadData` 字段，此时 `resp.payloadData` 为 `undefined`，`?? null` 不生效，`raw_payload` 保持 `undefined`。随后：
  ```ts
  payload_bytes = is_binary
      ? base64_decoded_size(raw_payload)  // undefined.replace() → TypeError
      : new TextEncoder().encode(raw_payload).length;
  ```
- **影响**：任何无 payload 的 WebSocket 控制帧都会导致整个 `handle_cdp_event` 函数崩溃，后续所有 CDP 事件（包括普通网络请求）都不会被处理。
- **测试为什么没发现**：mock 中 `payloadData` 始终传了字符串（`'hello'`/`'world'`），没测 `payloadData` 缺失的帧。CDP 实际返回的控制帧无此字段。
- **要求**：
  1. `raw_payload` 用 `|| null` 替代 `?? null`，或在使用前判空。
  2. `payloadData` 为空时设 `payload_status = 'captured'`、`payload = null`、`payload_bytes = 0`。
  3. 补测试：`webSocketFrameReceived` 无 `payloadData` → 不崩溃，`payload` 为 null。

### ⛔ P0.56 导出时间字段仍为 UNIX 时间戳（P0.51 假修复，仅追加未替换）
- **状态**：待修复 — 2026-06-13
- **现象**：导出采集记录（ZIP 的 `network.jsonl`/`events.jsonl`，以及 JSON 导出）中时间字段仍是 UNIX 时间戳数字（如 `1781328968343`），不是用户设置时区的人类可读时间。
- **根因（P0.51 假修复）**：P0.51 标记「已修复」，但实现只是**追加**了一个平行字段，原始 UNIX 字段原封未动：
  1. `src/shared/system_time.ts:24` `add_absolute_system_time`：`...obj` 保留原 `absolute_time`(UNIX 数字)，只新增 `absolute_time_system_time` 字符串。
  2. `src/shared/archive_builder.ts:248-253` network 请求：保留 `start_time_ms`/`end_time_ms`(UNIX)，旁边加 `start_time_system_time`；且 network 请求无 `absolute_time` 字段，`add_absolute_system_time(req)` 直接原样返回，等于没格式化。
  3. JSON 导出同为「追加」模式，同样问题。
- **要求（方案 A — 直接替换）**：
  1. 原始时间字段（`absolute_time`/`start_time_ms`/`end_time_ms`/`timestamp` 等）直接替换为格式化字符串 `YYYY-MM-DD HH:mm:ss`（按 `system_time_timezone`），导出中**彻底不保留 UNIX 数字**，不保留 `*_raw`。
  2. ZIP（`network.jsonl`/`events.jsonl`）与 JSON 导出行为一致，统一走替换。
  3. network 请求的 `start_time_ms`/`end_time_ms` 也要替换，不能因无 `absolute_time` 字段而被跳过。
- **测试**：补回归测试——导入真实导出 JSON/JSONL，断言所有时间字段为格式化字符串、且不存在任何纯数字 UNIX 时间字段。
- **教训**：P0.51 核验时只确认「调了格式化函数」就判真，未区分**替换 vs 追加**。标 ✅ 前须按 TEST_STRATEGY §6 逐项验证实际产物。

### ✅ P0.46 导出入口与 SW action 契约断裂，测试只做源码审计导致漏检
- **状态**：已修复 — 2026-06-13
- **触发日志**：`data/` 新日志中出现 `Export failed "Unknown action"`
- **现象**：无法正常导出采集记录。popup 上的导出与采集记录面板里的导出报错不一致。
- **直接根因**：导出入口发送的 message action 与 `src/background/service_worker.ts` 注册的 action 不一致。真实问题中 UI 侧发送 `action: 'get_capture_data'`，但 SW 只处理：
  ```typescript
  case 'get_session_data':
      return get_capture_data(message.session_id);
  ```
  `get_capture_data` 是 SW 内部函数名，不是公开 message action。发到 SW 后落入 default，返回 `{ success: false, error: 'Unknown action' }`。
- **为什么 popup 和采集记录面板报错不一样**：
  1. popup 路径先在 message routing 层失败，收到 `Unknown action`，所以提示导出失败/未知 action
  2. dashboard/detail 路径可能走旧的 `get_session_data` 或其他导出 action，进入后续数据组装/ZIP 构建/响应字段读取阶段，失败点不同，错误文案也不同
  3. 三个导出入口（popup/dashboard/detail）各自硬编码 action 和响应读取字段，没有共享契约，错误不会统一
- **测试为什么没有发现**：
  1. `tests/popup_export.test.ts` 主要是 `readFileSync + toMatch` 源码正则，只验证源码里出现 `action: 'get_session_data'`、`download_blob`、`build_capture_filename` 等字符串，不触发真实 click handler，不捕获实际 `chrome.runtime.sendMessage` 参数
  2. `tests/archive_entry.test.ts`、`tests/entry_unification.test.ts` 只验证入口 import 了 `build_archive` / `download_blob`，不验证运行时是否调用、不验证 action 是否被 SW 处理
  3. `tests/export_utils.test.ts` 只测 `download_blob()`、文件名等工具函数；P0.40/P0.45/P0.53 入口统一部分仍是源码正则审计
  4. `tests/live_data_queries.test.ts` 在测试文件里重新实现了 `get_capture_data()`，直接调 mock 存储层，完全绕过 `service_worker.ts` 的 `handle_message` switch
  5. `tests/export_integrity.test.ts` 使用手写 fixture，不来自真实 `get_session_data -> build_archive -> download_blob` 链路
  6. `tests/e2e-export.spec.ts` / `tests/e2e-export-content.spec.ts` 主要覆盖 dashboard 的 JSON/HAR/HTML 等导出，不覆盖 popup ZIP 导出按钮
  7. `tests/e2e-baidu.spec.ts`、`tests/e2e-toutiao.spec.ts`、`tests/e2e-sina.spec.ts`、`tests/e2e-qq.spec.ts` 的断言文案写成 `get_capture_data 应成功`，但实际 action 应为 `get_session_data`，文案本身会误导排查
- **高风险测试反模式**：
  1. **源码正则审计替代行为测试**：字符串存在不等于该字符串在正确 handler 中被使用
  2. **纯函数测试断链**：`build_archive()`、`download_blob()` 都可通过，但 UI 入口拿不到数据仍会失败
  3. **mock 过宽**：`chrome.runtime.sendMessage` 或模拟函数不校验 action，任何 action 都可返回 success
  4. **测试自测自**：测试复制生产逻辑，未调用真实 SW 路由
  5. **硬编码 fixture**：导出数据结构由测试手写，无法发现真实返回字段漂移
- **需要改什么**：
  1. 把 popup/dashboard/detail 所有 ZIP 完整包导出入口统一为发送 `action: 'get_session_data'`
  2. 不要把内部函数名 `get_capture_data` 当 message action 使用
  3. 增加 UI action 集合与 SW handler 集合的契约测试：UI 发出的每个 action 必须被 `service_worker.ts` 处理
  4. 增加 `get_session_data` 返回形状测试：返回值必须满足 `build_archive()` 需要的数据结构
  5. 增加 popup 导出行为测试：点击完成态 `#exportBtn` 后实际发送 `get_session_data`，拿到数据后调用 `build_archive()` 和 `download_blob()`
  6. 增加 dashboard/detail ZIP 导出行为测试：确认 action、response 字段、ZIP 构建输入一致
  7. 修正 E2E 断言文案：`get_capture_data 应成功` → `get_session_data 应成功`
  8. 逐步替换导出相关 `readFileSync + toMatch` 测试为行为测试；保留源码审计只能作为补充，不能作为主保护
- **怎么改（最小路径）**：
  1. 新增 `tests/sw_action_contract.test.ts`
     - 从 `src/popup/popup.ts`、`src/dashboard/dashboard.ts`、`src/detail/detail.ts` 提取 `chrome.runtime.sendMessage({ action: '...' })`
     - 从 `src/background/service_worker.ts` 提取 `case '...'`
     - 断言 UI action 集合是 SW case 集合子集
     - 断言不存在 `get_capture_data` 作为 UI action
  2. 新增/改造 `tests/popup_export.test.ts`
     - mock `chrome.runtime.sendMessage`
     - 构造 finished capture 状态
     - 触发 `#exportBtn.click()`
     - 断言第一条 message 为 `{ action: 'get_session_data', session_id: finished_capture.capture_id }`
     - mock 成功响应后断言 `download_blob()` 被调用，文件名为 `.zip`
  3. 新增 `tests/export_action_response_contract.test.ts`
     - 覆盖 `get_session_data` 返回 `success`、`capture/session`、`events`、`network_requests`、`console_events/console_logs`、`error_events`、`storage_changes`、`cookie_changes`
     - 覆盖 `export_json` 返回 `json`、`export_jsonl` 返回 `jsonl`、`export_html` 返回 `html`、`export_har` 返回 `har`
     - 断言前端读取字段与 SW 返回字段完全一致
  4. 改 E2E：新增 `tests/e2e-popup-export.spec.ts`
     - start capture → stop capture → popup 完成态点击导出 → 监听下载 → 验证 `.zip` 文件存在且可解包
     - ZIP 至少包含 `capture.json`/`README`/`network_requests.jsonl`（按当前 archive_builder 实际产物命名断言）
  5. 修正现有误导文案：`tests/e2e-baidu.spec.ts`、`tests/e2e-toutiao.spec.ts`、`tests/e2e-sina.spec.ts`、`tests/e2e-qq.spec.ts` 中 `get_capture_data 应成功` 改为 `get_session_data 应成功`
- **验收标准**：
  1. `npm test -- tests/sw_action_contract.test.ts tests/popup_export.test.ts tests/export_action_response_contract.test.ts` 通过
  2. `npm run test:e2e -- --project=e2e-p0 tests/e2e-popup-export.spec.ts` 通过
  3. 手动从 popup、dashboard、detail 三处导出同一采集记录，三处都成功下载 ZIP
  4. 任意 UI action 改成未注册字符串时，契约测试必须失败
  5. 任意 SW 导出响应字段改名时，对应前端契约测试必须失败
- **影响文件**：
  - `src/popup/popup.ts` — ZIP 导出 action 与 response 读取
  - `src/dashboard/dashboard.ts` — ZIP 导出 action 与 response 读取
  - `src/detail/detail.ts` — ZIP 导出 action 与 response 读取
  - `src/background/service_worker.ts` — action 注册与导出响应字段
  - `tests/popup_export.test.ts` — 从源码正则改为行为测试
  - `tests/sw_action_contract.test.ts` — 新增 action 集合契约测试
  - `tests/export_action_response_contract.test.ts` — 新增响应字段契约测试
  - `tests/e2e-popup-export.spec.ts` — 新增 popup ZIP 导出 E2E
  - `tests/e2e-baidu.spec.ts`、`tests/e2e-toutiao.spec.ts`、`tests/e2e-sina.spec.ts`、`tests/e2e-qq.spec.ts` — 修正断言文案

### ✅ P0.47 sendMessage 超 64MB 崩溃 + 架构修复
- **状态**：已修复 — 2026-06-13
- **触发日志**：`data/capture_all_logs_2026-06-13_13-38-23.log` 中大量 `Message exceeded maximum allowed size of 64MiB`
- **现象**：采集含图片后，popup 导出无反应、dashboard 详情页黑屏、所有依赖 `get_capture_data` 的功能全挂。
- **根因**：P0.45 让采集层保存二进制 body（base64），`get_capture_data` 把全量数据（含 base64 body + 7 类事件）通过 `sendMessage` 传给页面，超过 Chrome 64MB 限制。不只是 body 问题——长时间采集（事件多）也会超。
- **架构修复**：`get_capture_data` 改为只返回元数据（capture record + stats），页面侧直连 IndexedDB 读取详情（`read_capture_snapshot()`）。SW flush 后页面直接读 DB，不经过 sendMessage。
- **测试为什么没发现**：
  1. `tests/live_data_queries.test.ts` 自己重写了 `get_capture_data()` 直接读 IndexedDB，完全绕过 `sendMessage`，测不到大小限制
  2. 所有测试 fixture 只有几条事件/请求，不可能触发 64MB 限制
  3. 没有测试验证 `get_capture_data` 响应是否只含元数据（不含 events/network/bodies）
  4. 没有测试验证 sendMessage 响应大小是否在安全范围内
- **需要补的测试**（待实现）：
  1. `tests/sw_response_contract.test.ts` — SW 响应契约：
     - 断言 `get_capture_data` 响应不含 `events`/`network_requests`/`console_logs` 字段
     - 断言响应只含 `success` 和 `capture`（元数据）
     - 估算响应大小 < 10KB
     - 对 `list_captures`、`get_status` 也验证大小安全
  2. `tests/capture_data_reader.test.ts` — 页面侧直读：
     - 验证 `read_capture_snapshot` 返回完整数据（events、network、console）
     - 构造大数据场景（1000+ 条事件），验证读取正确
  3. `tests/archive_builder.test.ts` 补充：
     - 验证大数据场景（1000+ 请求）ZIP 生成不超时
  4. 若有人把 `get_capture_data` 改回返回全量数据，契约测试必须失败
- **影响文件**：
  - `src/background/service_worker.ts` — `get_capture_data` 改为轻量返回
  - `src/shared/capture_data_reader.ts` — 新建，页面侧直读
  - `src/popup/popup.ts` / `src/dashboard/dashboard.ts` / `src/detail/detail.ts` — 改用直读

### ✅ P0.48 跨域 PUT/POST 上传内容未抓取（cdp_failed）
- **状态**：已修复 — 2026-06-13
- **复现数据**：`chatgpt_web_reverse/data/capture_all_capture_1781328968343_uzvscx9_2026-06-13_14-00-33.zip`
- **现象**：用户在 ChatGPT 上传文件（张屿川照片.png 981KB、代码.txt 3.4KB、clean_temp.bat 307B），files/library API 响应正确记录了文件列表和元数据，但上传到 oaiusercontent 的 PUT 请求 body 未被抓取，`response_body_status: cdp_failed`。
- **具体证据**：
  - `POST https://chatgpt.com/backend-api/files` — 200，`response_body_status: captured`（返回 upload_url）
  - `POST https://chatgpt.com/backend-api/files/library` — 200，`response_body_status: captured`（返回文件列表，含 file_name/file_size/mime_type）
  - `PUT https://sdmntprwestus3.oaiusercontent.com/files/.../raw` — 201，`response_body_status: cdp_failed`（上传内容丢失）
  - `OPTIONS https://sdmntprwestus3.oaiusercontent.com/files/.../raw` — 200，`response_body_status: cdp_failed`（CORS 预检也失败）
- **根因分析**：
  - CDP `Network.getResponseBody` 对跨域请求（oaiusercontent.com 与 chatgpt.com 不同 origin）可能返回错误
  - PUT 请求的 request body 是二进制文件内容，CDP 的 `Network.requestWillBeSent` 对 FormData/multipart 上传的 `postData` 可能为空或不完整
  - OPTIONS 预检请求通常无 body，CDP 返回错误属于预期行为（但状态应为 `not_enabled` 而非 `cdp_failed`）
  - 现有代码对 `cdp_failed` 不做区分——OPTIONS 无 body 的正常失败和真正的 body 获取失败用同一个状态
- **影响**：
  - 上传到 GPT 的文件内容无法在导出中还原
  - 用户上传的图片、文档、代码等关键证据丢失
  - 只能从 files/library 元数据知道"上传了什么"，无法知道"内容是什么"
- **修复要点**：
  1. 区分 `cdp_failed` 的原因：OPTIONS/HEAD 等无 body 方法应标 `not_enabled` 而非 `cdp_failed`
  2. 对 PUT/POST 的 request body（上传内容）：尝试从 `Network.requestWillBeSent` 的 `postData` 或 `request.postDataEntries` 获取
  3. 对跨域响应 body：检查 `Network.getResponseBody` 错误码，若为 `-32000`（No resource）则标 `not_enabled`（资源已释放），其他错误保留 `cdp_failed`
  4. 考虑在 `Network.loadingFinished` 时立即获取 body，减少"资源已释放"的超时窗口
  5. 补测试：模拟跨域 PUT 请求，验证 request body 采集和状态标记
- **影响文件**：
  - `src/background/network_capture.ts` — loadingFinished 处理、request body 提取、状态区分
  - `tests/network_cdp.test.ts` — 跨域 PUT 测试用例

### ✅ P0.49 ZIP 导出 network.jsonl 缺失 mime_type
- **状态**：已修复 — 2026-06-13
- **复现数据**：同 P0.48
- **现象**：导出 ZIP 中 `network.jsonl` 的所有请求 `mime_type` 字段为 `null`，即使 response headers 中有 `content-type`。
- **具体证据**：
  - manifest 显示 3 张图片、343 个 body 文件
  - `network.jsonl` 中 estuary/content 请求（PNG 2.7MB）：`mime_type: null`，但 body 文件已正确保存为 `bodies/response/230772.1173.bin`
  - `file` 命令确认该文件是 `PNG image data, 1448 x 1086, 8-bit/color RGB`
  - 所有 882 条网络请求的 `mime_type` 均为 `null`
- **根因分析**：
  - `NetworkRequestData` 接口有 `mime_type: string | null` 字段
  - CDP `Network.responseReceived` 事件的 `response.headers` 包含 `content-type`
  - `src/background/network_capture.ts` 在 `Network.responseReceived` handler 中提取 headers，但可能未正确写入 `mime_type` 字段
  - webRequest 路径的 `onHeadersReceived` 也能获取 content-type，但同样可能未传递到最终数据
  - `archive_builder.ts` 的 `ext_for_mime()` 函数依赖 `mime_type` 推断扩展名——当 mime 为 null 时所有文件都变成 `.bin`
- **影响**：
  - ZIP 中所有 body 文件扩展名为 `.bin`，无法通过扩展名识别文件类型
  - 需要用 `file` 命令或手动检查才能确定实际格式
  - 图片无法双击打开（系统不知道 .bin 是 PNG）
  - `ext_for_mime()` 推断逻辑形同虚设
- **修复要点**：
  1. `Network.responseReceived` handler 中从 `params.response.headers` 提取 `content-type` 写入 `mime_type`
  2. webRequest `onHeadersReceived` handler 中从 `details.responseHeaders` 提取 content-type 写入 `mime_type`
  3. CDP path 的 `build_cdp_primary_network_event` 和 `build_cdp_body_event` 确保传递 `mime_type`
  4. `network_correlator.ts` 的 `merge_matched`/`build_cdp_only_request`/`build_web_request_only_request` 确保 `mime_type` 不丢失
  5. body_routing 的 `ext_for_mime()` 从网络请求的 response headers 提取 content-type 作为兜底
  6. 补测试：验证 CDP responseReceived 后 `mime_type` 非空；验证 ZIP 中图片文件扩展名为 `.png`/`.jpg` 而非 `.bin`
- **影响文件**：
  - `src/background/network_capture.ts` — responseReceived handler、build_cdp_primary_network_event、build_cdp_body_event
  - `src/background/network_correlator.ts` — merge_matched、build_cdp_only_request、build_web_request_only_request
  - `src/shared/archive_builder.ts` — body 文件扩展名推断兜底
  - `tests/network_cdp.test.ts` — mime_type 写入测试
  - `tests/archive_builder.test.ts` — 扩展名推断测试

### ✅ P0.50 MCP 桥接默认开启，用户未配置也自动启动
- **状态**：已修复 — 2026-06-13
- **现象**：扩展安装后 MCP 桥接默认开启，即使用户未配置 token/URL 也自动启动 bridge client，产生不必要的连接尝试和日志。
- **期望行为**：MCP 桥接应默认关闭，用户在设置页主动开启后才启动。
- **影响**：未使用 MCP 功能的用户也会看到 bridge 相关日志和错误，干扰排查。

### ✅ P0.51 导出 ZIP 时间字段仍为 UNIX 时间戳，未使用用户设置时区
- **状态**：已修复 — 2026-06-13
- **复现数据**：`capture_all_capture_1781328968343_uzvscx9_2026-06-13_14-00-33.zip`
- **现象**：导出 ZIP 中 `network.jsonl` 和 `events.jsonl` 的时间字段仍为 UNIX 时间戳（数字），不是用户在设置中选择的时区格式化时间。文件名中的日期正确（`2026-06-13_14-00-33`），但 JSON 内的时间字段没有格式化。
- **期望行为**：所有时间字段应按用户设置的 `system_time_timezone` 格式化为人类可读时间（如 `2026-06-13 14:00:33`），与 JSON 导出的行为一致。
- **历史修复参考**：P0.33/P0.38 修复了 JSON 导出的时间格式化（`add_system_times_to_capture_data`、`add_absolute_system_time`），但 ZIP 导出的 `archive_builder.ts` 可能未调用这些函数，或调用时传入的 timezone 参数不对。
- **影响**：用户打开 network.jsonl 看到的是 `1781328968343` 而不是 `2026-06-13 14:00:33 (UTC+8)`，需要自行换算，违背"采集包直接可读"的设计目标。

### ✅ P0.52 运行日志改用文件大小限制，默认 100MB
- **状态**：已修复 — 2026-06-13
- **现象**：当前运行日志用条目数量限制存储，不合理。应改为文件大小限制。
- **要求**：
  1. 日志最大存储改为文件大小限制，默认 100MB
  2. 设置页去掉"最大储存条数"输入框和"当前日志数"显示
  3. 设置页新增"最大日志大小"输入框（单位 MB，默认 100）
  4. 设置页新增"当前日志大小"显示（实际占用 MB）
  5. "最大日志大小"和"日志级别"放到同一行，有间距，不重叠

### ✅ P0.53 导出目录仍未记住（采集记录/日志分开）
- **状态**：已修复 — 2026-06-13
- **现象**：导出采集记录和导出运行日志时，保存对话框没有回到上次选择的目录；修改"采集导出目录"配置也不生效，永远是默认目录。
- **根因**：`last_dir` 回填机制从设计上跑不通。`chrome.downloads.search()` 返回磁盘**绝对路径**（如 `/home/x/Downloads/exports`），被 `track_export_dir()` 持久化；但 `chrome.downloads.download({filename})` 只接受**相对 Downloads 根**的相对路径。下次导出 `build_capture_filename` 用 `last_dir || config` —— stale 绝对路径既覆盖了用户配置目录，经 `normalize_download_path` 剥掉前导 `/` 后又被 Chrome 判为非法 → 回退默认目录。P0.40-R1 接入 `load_last_export_dirs`/`track_export_dir` 反而引入了这条覆盖链。
- **修复**：移除整套 `last_dir` 持久化机制（`load_last_export_dirs`/`save_last_export_dir`/`track_export_dir`/`extract_dir_from_filename` 及两个 storage key）。导出目录唯一来源为用户配置（`export_capture_directory`/`export_log_directory`）；`saveAs` 对话框由 Chrome 自身记忆上次文件夹。`build_capture_filename`/`build_log_filename` 去掉 `last_dir` 参数。
- **测试**：`tests/export_utils.test.ts` 改为验证「目录来自配置」「config 空时扁平文件名」「三入口不再引用 `load_last_export_dirs`/`track_export_dir`」「export_utils 不再导出持久化辅助函数」。

### ✅ P0.54 采集记录面板列精简 + 7 种数据标签统计
- **状态**：已修复 — 2026-06-13
- **现象**：采集记录总面板有多余列（页面URL、标签、导出状态），且统计只显示部分数据（事件数、请求数、错误数），不是完整的 7 种数据标签。
- **要求**：
  1. 去掉"页面URL"列
  2. 去掉"标签"列
  3. 去掉"导出状态"列
  4. 统计列改为 7 种标准数据标签：用户行为数、页面导航数、网络请求数、控制台数、错误异常数、Storage 数、Cookie 数
  5. 列名使用标准数据标签名称（与 popup 7 标签一致）

### ✅ P0.55 采集记录占用空间统计不含二进制文件
- **状态**：已修复 — 2026-06-13
- **现象**：采集记录面板显示的占用空间大小只统计了 IndexedDB 中的结构化数据，没有包含 ZIP 导出时 `bodies/` 目录下的二进制文件大小。P0.45 让采集层保存了 base64 二进制 body，这些数据在 IndexedDB 中占用空间，但当前统计函数 `est_bytes()` 用固定系数估算，不反映真实大小。
- **要求**：占用空间统计应包含二进制 body 的实际字节数（从 `response_body_bytes`/`request_body_bytes` 字段累加），不用固定系数估算。

### ✅ P0.45 二进制响应体被丢弃 + 新增 ZIP 完整包导出
- **状态**：已实现 — 2026-06-13
- **详细设计**：`docs/superpowers/specs/2026-06-13-zip-archive-export-design.md`
- **实施计划**：`docs/superpowers/plans/2026-06-13-zip-archive-export.md`
- **审阅**：`docs/review.md`
- **现象**：CDP 返回 base64Encoded 的图片/字体等二进制响应被标 unsupported_binary、body 置 null；单 JSON 承载大二进制导致导出内存爆且 grep 受污染。
- **修复**：
  1. 采集层保存二进制为 base64（不再丢弃），记录 `response_body_encoding`/`response_body_bytes`/`request_body_mime`，`too_large` 时保留 encoding 元数据
  2. 新增 ZIP 完整包导出：页面侧 `archive_builder` 组装（`src/shared/archive_builder.ts`），走已有 `get_capture_data` 通道，`fflate.zipSync` 打包，bodies/ 独立文件 + jsonl 引用 + README
  3. body 上限统一为采集上限(100MB)+内联阈值(32KB)，取代原 1MB 双上限
  4. popup/dashboard/detail 三个入口均接入 ZIP 导出
  5. 采用子代理驱动开发（subagent-driven），9 个独立 task，TDD 红绿重构
- **影响文件**：network_capture.ts、archive_builder.ts、body_routing.ts、hash.ts、types.ts、constants.ts、redaction.ts、external_cdp_bridge_client.ts、body_capture_coordinator.ts、service_worker.ts、cdp_handler.ts、network_hook.ts、popup/dashboard/detail、export_utils.ts、export_settings.ts、设置 UI

### ✅ P0.31-R1 CDP 路径 resource_type 未归一化，大写 CDP 类型混入导出
- **状态**：已修复 — 2026-06-12
- **复现文件**：`data/capture_all_capture_1781262222966_2lkg3rn.json`
- **现象**：P0.31 修复后导出仍有两套 resource_type 混存：
  - webRequest 路径已归一：`font`/`script`/`stylesheet`/`xhr`（小写，RESOURCE_TYPE_MAP 生效）
  - CDP 路径未归一：`Font`/`Stylesheet`/`Script`/`Image`/`Media`/`Manifest`/`Fetch`（PascalCase，CDP 原始值）
  同一导出 JSON 中 `type: "Font"` 和 `type: "font"` 并存，`type: "Fetch"` 和 `type: "xhr"` 并存。
- **根因**：RESOURCE_TYPE_MAP（line 441）+ `resolve_resource_type()`（line 458）仅在 `build_network_event` 的 webRequest 路径（line 537）被调用。CDP 路径 6 处直接使用原始值，绕过映射：
  1. `network_capture.ts:219` — `Network.requestWillBeSent` CDP 事件存储 `params?.type || 'other'`（Chrome CDP 返回 PascalCase：`Document`/`Stylesheet`/`Script`/`Font`/`Image`/`Media`/`Fetch`/`Manifest`/`XHR`/`Ping`/`WebSocket`/`Other`）
  2. `network_capture.ts:241` — `Network.responseReceived` CDP 事件，同上
  3. `network_capture.ts:348` — `build_cdp_body_event()` 取 `meta?.resource_type || 'other'`（直接透传 CDP meta 原始值）
  4. `network_correlator.ts:74` — `merge_matched()` 取 `web_meta.resource_type || cdp_event.resource_type`（两边均可能为原始值）
  5. `network_correlator.ts:120` — `build_cdp_only_request()` 直接 `cdp_event.resource_type as NetworkRequestData['resource_type']`（PascalCase CDP 值强转）
  6. `network_correlator.ts:163` — `build_web_request_only_request()` 直接 `web_meta.resource_type as NetworkRequestData['resource_type']`（webRequest 原始值强转）
- **影响**：
  - 导出 JSON 中 resource_type 字段同义多值，下游按 type 过滤/分组失效
  - Dashboard 网络列表 type 列显示 `Font`/`font` 两种，用户困惑
  - 统计分析无法信任 type 字段
- **修复要点**：
  1. 在 `CdpRequestMeta` 和 `CdpBodyEvent` 存储 resource_type 时调用 `resolve_resource_type()` 归一化（或添加 CDP 大写→标准小写映射表：`{Document: 'document', Stylesheet: 'stylesheet', Script: 'script', Font: 'font', Image: 'image', Media: 'media', Fetch: 'fetch', Manifest: 'other', XHR: 'xhr', Ping: 'ping', WebSocket: 'websocket', Other: 'other'}`）
  2. `network_correlator.ts` 中 `build_cdp_only_request`/`build_web_request_only_request`/`merge_matched` 3 处写入前调用 `resolve_resource_type()`
  3. 补测试：给定 CDP 大写类型字符串，验证输出为归一化小写标准类型
- **影响文件**：
  - `src/background/network_capture.ts` — CdpRequestMeta 写入处 + build_cdp_body_event
  - `src/background/network_correlator.ts` — merge_matched / build_cdp_only_request / build_web_request_only_request
  - `tests/network_capture.test.ts` — CDP 类型归一化测试


### ✅ P0.39 CDP retry 跨 tab 假成功：dbg_tab_id guard 不检查 tab_id 匹配
- **状态**：已修复 — 2026-06-12
- **复现数据**：`data/capture_all_capture_1781265766247_7vafphp.json` + `data/capture_all_logs_2026-06-12_20-06-14.log`
- **现象**：从 `chrome://extensions/` 启动采集 → CDP attach 失败（预期）→ 切换到正常网页后 CDP retry 日志显示多次 "Body capture retry succeeded"，但导出 JSON 中 93 条 `network_requests` 全部 `response_body: null`、`cdp: {}`、`response_body_status: not_enabled`，同时 `body_capture_mode` 显示 `extension_cpd`（误导）。
- **根因**：`src/background/network_capture.ts:187` — `enable_response_body_capture()` 的 guard 条件：

  ```typescript
  if (dbg_tab_id !== null) return { success: true };  // ← 不检查 dbg_tab_id === tab_id
  ```

  **完整链路**：
  1. 初始 CDP attach 失败（chrome:// URL），`dbg_tab_id = null`
  2. Tab 切换到 **1793063486**（中间 tab）→ retry 成功，`dbg_tab_id = 1793063486`
  3. Tab 切换到 **1793063493**（chrome://newtab/，仍受限）→ retry 调用 `enable_response_body_capture(1793063493)`，第 187 行 `dbg_tab_id !== null` 为 true，直接返回 `{ success: true }`，**没有实际 attach 到新 tab**
  4. Tab 1793063493 URL 变为 `https://opencode.ai/`（正常 URL）→ retry 同样被第 187 行短路，返回假成功
  5. CDP `Network.*` 事件只来自 tab 1793063486，webRequest 事件来自 tab 1793063493（用户实际浏览的 tab），`find_matching_cdp_request()` 永远匹配不到 → 所有请求 `response_body_status: not_enabled`

  日志证据（20:02:47 → 20:02:56）：
  ```
  20:02:47 CDP body capture enabled {"tab_id":1793063486,"already_attached":true}  ← 唯一一次真正 attach
  20:02:50 Body capture retry succeeded on tab 1793063478    ← 假成功（dbg 粘在 1793063486）
  20:02:51 Body capture retry succeeded on tab 1793063493    ← 假成功（dbg 粘在 1793063486）
  20:02:56 Body capture retry succeeded on tab 1793063493 (URL changed)  ← 假成功（dbg 粘在 1793063486）
  ```
  只有 tab 1793063486 触发了真正的 "CDP body capture enabled"，其他 3 次 retry 全部假成功。

- **加重因素**：`body_capture_mode` 由 `config.capture_response_body` 静态决定（`network_capture.ts:560`），不反映 CDP 实际工作状态，retry 假成功后 `body_capture_coordinator` 的 `coordinator_state.mode` 也被覆盖为 `extension_cdp`，日志和元数据都显示正常但实际 body 全空。

- **为什么 P0.10 修复未能防止此 bug**：P0.10 修复了三系统 CDP 抢占问题（统一 attach），并增加了 tab 切换/URL 跳转时的 retry 路径。但 `enable_response_body_capture` 的 guard 条件从一开始就没有考虑「CDP 已 attach 到其他 tab」的情况。P0.10 的 retry 路径依赖 `enable_response_body_capture` 返回 success，但该函数对跨 tab 调用始终返回 success，retry 路径无法感知失败。

- **测试为什么没发现**（三层遗漏）：

  **L1 — 单元测试把 bug 当正确行为**（`tests/network_cdp.test.ts:91-99`）：
  ```typescript
  it('returns success when already attached', async () => {
      // tab 1 attach 成功
      await enable_response_body_capture(1, false);
      expect(mock_chrome_debugger.attach_count).toBe(1);
      // tab 2 调用 → 期望 success + 不 re-attach
      const result = await enable_response_body_capture(2, false);
      expect(result.success).toBe(true);           // ← 明确验证了这个 bug
      expect(mock_chrome_debugger.attach_count).toBe(1);  // ← 验证没有 re-attach
  });
  ```
  测试用例把「dbg 在 tab 1 但对 tab 2 返回 success」当作**期望行为**来验证，因为当时的设计假设是「一个采集周期只监听一个 tab」。P0.10 引入多 tab retry 后，这个假设被打破，但测试没有更新。

  **L2 — E2E CDP retry 测试不验证 body 内容**（`tests/e2e-cdp-retry.spec.ts`）：
  - 只验证 `body_capture_mode` 存在（line 108），不检查 `network_requests[].response_body` 非空
  - `console_events` 用 `if (data.console_events.length > 0)` 条件跳过（line 99），零数据不算失败
  - 单 tab 场景（chrome://extensions → test-page.html）只有一个 tab 切换，CDP 粘在正确的 tab 上时碰巧能工作；多 tab 切换场景（用户实际使用：chrome://extensions/ → 多个中间 tab → opencode.ai）才会触发此 bug

  **L3 — 无多 tab 切换 retry 测试**：所有 CDP retry 测试只模拟「一个受限 tab → 一个正常 tab」的线性切换。真实场景中 Service Worker 为所有已打开的 tab 各触发一次 `tabs.onActivated` retry，导致多次 `start_body_capture` 调用顺序竞争：先成功的 tab 锁定 `dbg_tab_id`，后续 tab 的 retry 全部假成功。

- **文档关于自动 re-attach 的说明**：
  - P0.10 任务描述记录了 CDP 抢占问题和统一 attach 修复，但未描述 `dbg_tab_id` guard 的行为约束
  - Commit `fbd3046`（标签页切换时重试 CDP attach）和 `031e912`（同标签页 URL 跳转时也重试 CDP attach）的 message 描述了 retry 触发条件，未提及 `enable_response_body_capture` 的复用限制
  - `docs/E2E_GAP.md:185-200` 记录了 CDP retry E2E 的测试场景，只覆盖单 tab 切换
  - **没有文档描述 `enable_response_body_capture` 的 `dbg_tab_id` guard 行为和跨 tab 调用的局限性**
  - 2026-06-12 已在 `docs/specs/architecture.md` §2.7 和 `docs/specs/data_flow.md` §3 写入 CDP retry 机制（触发条件、重试流程、关键状态变量、已知约束）

- **修复要点**：
  1. `enable_response_body_capture` line 187 guard 改为 `if (dbg_tab_id === tab_id) return { success: true }`；或当 `dbg_tab_id !== tab_id` 时先 detach 旧 tab 再 attach 新 tab
  2. 对应的 `body_capture_coordinator.start_body_capture` 应能区分「已在目标 tab attach」和「在其他 tab attach」两种情况
  3. 补单元测试：`enable_response_body_capture(1)` 成功后，`enable_response_body_capture(2)` 应触发 detach(1) + attach(2)，而非直接返回 success（除非 tab_id 匹配）
  4. 补 E2E：多 tab 场景（受限 tab → 中间 tab A → 目标 tab B），验证目标 tab B 的 `network_requests[].response_body` 非空
  5. 补 E2E：验证 `dbg_tab_id` 始终等于当前活跃 tab

- **影响文件**：
  - `src/background/network_capture.ts` — `enable_response_body_capture` line 187 guard
  - `tests/network_cdp.test.ts` — "returns success when already attached" 用例重写
  - `tests/e2e-cdp-retry.spec.ts` — 增加 response_body 非空断言 + 多 tab 场景


### ✅ P0.35 采集完成态导出按钮点击无反应
- **状态**：已修复 — 2026-06-12
- **现象**：popup 采集完成状态显示「导出」按钮（P0.26 新增），但点击后无任何反应，不触发下载、不弹出保存对话框、控制台无报错。
- **期望行为**：点击「导出」按钮应直接触发采集数据导出（默认 JSON 格式），弹出浏览器保存对话框。
- **影响**：P0.26 按钮拆分为无效改动，用户仍必须进入详情页才能导出。
- **初步判断**：`wire_view()` 中 `exportBtn` 的 click 事件绑定可能未正确注册，或事件处理函数中 `chrome.runtime.sendMessage` 调用方式有误（handler 不存在/action 名不匹配/权限不足）。`render_saved()` 每次状态切换重新 innerHTML 赋值，`wire_view()` 之后绑定可能被覆盖或过早调用。也可能是 `wire_view()` 只在首次调用，后续 `render()` 更新 innerHTML 后未重新绑定 `exportBtn` 事件。
- **修复要点**：
  1. 跟踪 `wire_view()` 调用时机 vs `render_saved()` innerHTML 替换时机
  2. 确认 `exportBtn` click handler 中 message action 在 SW 中已注册
  3. 补测试：完成态点击 exportBtn 触发 chrome.runtime.sendMessage
- **影响文件**：
  - `src/popup/popup.ts` — wire_view / render / render_saved
  - `src/background/service_worker.ts` — message handler 注册
- **测试遗漏原因**：
  1. `tests/popup_layout.test.ts` 只断言 HTML 中存在 `exportBtn` 元素 id，不对元素执行 click 事件，不模拟 `chrome.runtime.sendMessage` 调用，不验证下载触发器
  2. 无测试覆盖 popup 与 SW 的 message 往返（`chrome.runtime.sendMessage` 的 action 和参数）
  3. 无 E2E 测试验证「采集完成 → 点击导出按钮 → 浏览器弹出保存对话框」完整链路
  4. 对比 dashboard 的 `export_session()`（有完整 await+Blob+download 链路），popup 只 fire-and-forget，无人发现差异因无测试对比两处导出路径


### ✅ P0.36 采集详情页「用户行为」标签页显示无数据
- **状态**：已修复 — 2026-06-12
- **根因**：`detail.ts` 的 `render_events()` 使用了错误的 type 白名单 `['mouse_event', 'keyboard_event', 'scroll_event', 'dom_mutation']`，其中 `dom_mutation` 不是实际事件类型，而 content script 上报的 `input_event` 缺失。同时 `storage.ts` 未实现周期性 flush，少量事件可能滞留内存 buffer 未写入 IndexedDB。
- **修复内容**：
  1. `src/detail/detail.ts` 行 205：白名单修正为 `['mouse_event', 'keyboard_event', 'scroll_event', 'input_event']`
  2. `src/detail/detail.ts` 行 348：`get_event_detail()` 的 `dom_mutation` case 替换为 `input_event`
  3. `src/background/storage.ts`：新增 `start_periodic_flush()` / `stop_periodic_flush()`，利用已定义的 `FLUSH_INTERVAL_MS`（1s）周期性 flush 缓冲区
  4. `src/background/service_worker.ts`：采集开始时调用 `start_periodic_flush()`，停止时调用 `stop_periodic_flush()`


### ✅ P0.37 导出文件名不含 date，未使用系统时区
- **状态**：已修复 — 2026-06-12
- **现象**：导出采集记录文件名格式为 `capture_all_capture_{capture_id}.json`（如 `capture_all_capture_1781265766247_7vafphp.json`），不包含 `{date}` 占位符对应的时间戳。文件名 date 未按用户设置的系统时区格式化。
- **期望行为**：导出文件名应包含用户设置时区的日期时间，格式如 `capture_all_{capture_id}_2026-06-12_20-02-46.json`（browser/UTC+8 时区）。
- **影响**：用户无法从文件名获知导出时间，P0.22（文件名用时区时间）实际未生效。
- **根因**：`export_session()`（`src/dashboard/dashboard.ts:368-369`）直接硬编码文件名：
  ```typescript
  const capture_filename = capture_dir
      ? `${capture_dir}/capture_all_${id}.${ext}`
      : `capture_all_${id}.${ext}`;
  ```
  完全不调用 `build_export_filename()`，`{date}` 模板从未参与实际下载路径。`build_export_filename()` 及其测试独立存在但未被实际导出流程使用。
- **影响文件**：
  - `src/shared/export_settings.ts` — build_export_filename / 模板替换
  - `src/dashboard/dashboard.ts` — 导出入口文件名拼接
  - `src/background/exporter.ts` — SW 端导出文件名
- **测试遗漏原因**：
  1. `tests/export_settings.test.ts` 测试了 `build_export_filename()` 函数本身（含 `{date}` 模板替换和时区格式化），但没发现该函数从未被 `export_session()` 实际调用
  2. `tests/e2e-export.spec.ts` 只验证导出文件可下载/内容可解析，不捕获最终传给 `chrome.downloads.download` 的 `filename` 参数值
  3. 无集成测试连接「用户配置的 filename_template → 实际下载文件名」完整链路
  4. `export_session()` 的硬编码文件名路径与 `build_export_filename()` 独立存在，两个模块各自有测试但无交叉验证


### ✅ P0.38 导出 JSON 顶层时间字段仍为 UTC，system_time_timezone 未写入
- **状态**：已修复 — 2026-06-12
- **现象**：导出 JSON 中 `started_at: "2026-06-12T12:02:46.247Z"`、`ended_at: "2026-06-12T12:03:04.157Z"` 仍为 UTC `Z` 格式，P0.33 新增的 `*_time_label`/`*_system_time` 字段虽存在且正确（`20:02:46 (browser)`），但顶层主要时间字段 `started_at`/`ended_at` 用户第一眼看到的就是 UTC，容易误判时区设置未生效。同时 `system_time_timezone` 字段为 `undefined`，未写入导出 JSON，用户无法从导出文件确认当前时区设置。
- **期望行为**：`started_at`/`ended_at` 等顶层时间字段应直接使用用户设置时区格式化（或至少在显眼位置标注人读时间），`system_time_timezone` 必须写入导出 JSON。
- **影响**：用户看到 `Z` 时间后判断「跟随浏览器」未生效，P0.22/P0.33 修复实际未覆盖顶层字段。
- **根因**：
  1. `add_system_times_to_capture_data()` 只追加 `*_system_time` 后缀字段（如 `start_time_system_time`），不替换原有的 `started_at`/`ended_at` 值
  2. `system_time_timezone` 未从 `user_config` 传入导出数据流
- **影响文件**：
  - `src/background/exporter.ts` — add_system_times_to_capture_data
  - `src/shared/system_time.ts` — format_system_time / 时间字段转换
- **测试遗漏原因**：
  1. `tests/system_time.test.ts` P0.33 新增测试只断言 `*_time_label` 字段存在且不以 `Z` 结尾，不检查顶层 `started_at`/`ended_at` 是否仍为 UTC
  2. 无测试验证导出 JSON 的 `system_time_timezone` 字段非空
  3. `add_system_times_to_capture_data()` 的测试（如果有）只验证追加字段的存在性，不验证原始字段被替换


### ✅ P0.40-R1 导出文件夹位置未记住，采集记录/日志目录未分开回填
- **状态**：已修复 — 2026-06-13
- **现象**：用户在保存对话框中选择导出目录后，下次导出没有回到上次目录；采集记录导出和日志导出也没有分别记住各自位置。
- **根因**：`src/shared/export_utils.ts` 已实现 `last_capture_export_dir` / `last_log_export_dir` 两个独立 key、`load_last_export_dirs()`、`track_export_dir()`，但实际入口只调用 `download_blob()`：
  1. `src/popup/popup.ts` 采集记录导出未读取 `capture_dir`，下载完成后未 `track_export_dir(..., 'capture')`
  2. `src/dashboard/dashboard.ts` 采集记录导出未读取 `capture_dir`，下载完成后未 `track_export_dir(..., 'capture')`
  3. `src/detail/detail.ts` 采集记录导出未读取 `capture_dir`，下载完成后未 `track_export_dir(..., 'capture')`
  4. `src/dashboard/dashboard.ts` 日志导出未读取 `log_dir`，下载完成后未 `track_export_dir(..., 'log')`
- **为什么测试没发现**：`tests/export_utils.test.ts` 只验证了工具函数自身和入口 `import download_blob`，没有验证实际入口是否调用 `load_last_export_dirs()`、是否把 last dir 传入文件名构建、是否在下载完成后按 `capture`/`log` 分别 track。
- **修复**：所有采集记录导出入口读取 `capture_dir` 并 track `capture`；日志导出读取 `log_dir` 并 track `log`。补回归测试锁定两个目录必须独立读取和记录。
- **影响文件**：
  - `src/shared/export_utils.ts` — 已有工具函数保持不变
  - `src/popup/popup.ts` — 采集记录导出读取/记录 capture 目录
  - `src/dashboard/dashboard.ts` — 采集记录导出读取/记录 capture 目录；日志导出读取/记录 log 目录
  - `src/detail/detail.ts` — 详情页导出读取/记录 capture 目录
  - `tests/export_utils.test.ts` — 新增入口级回归测试


### ✅ P0.40 popup 导出按钮无法选择导出文件夹（含导出代码碎片化）
- **状态**：已修复 — 2026-06-13
- **修复内容**：
  1. 创建 `src/shared/export_utils.ts` 统一导出模块：`download_blob()` + `build_capture_filename()` + `build_log_filename()` + 目录持久化
  2. popup exportBtn → 改用 `download_blob(blob, filename, { save_as: true })` + `build_export_filename()`，统一 `chrome.downloads.download` 路径
  3. dashboard `export_session()` → 改用 `download_blob()` + `build_capture_filename()`
  4. dashboard 日志导出 → 改用 `download_blob()` + `build_log_filename()`
  5. detail `download_export()` → 改用 `download_blob()`
  6. `chrome.storage.local` 中分别存储 `last_capture_export_dir` / `last_log_export_dir`，下载完成后通过 `track_export_dir()` 自动提取并持久化
  7. `chrome.d.ts` 补充 `downloads.search`、`downloads.onChanged`、`runtime.lastError` 类型声明
  8. 测试：`tests/export_utils.test.ts`（20 tests） + 更新 `tests/popup_export.test.ts`


### ✅ P0.44 Body 大小限制改为可配置（1MB 默认 + 设置 UI）
- **状态**：已修复 — 2026-06-13
- **详细文档**：`docs/P0.44_BODY_SIZE_CONFIG.md`
- **现象**：请求体限制 10KB、响应体限制 50KB，硬编码。上次采集 16 条请求超 50KB 被截断。
- **修复要点**：
  1. 默认值改为 1MB
  2. UserConfig 新增 `max_request_body_bytes` / `max_response_body_bytes`
  3. 采集代码改为从 config 读取（非全局常量）
  4. Dashboard 设置页面添加数字输入框
- **影响文件**：
  - `src/shared/constants.ts` — 默认值 + DEFAULT_USER_CONFIG
  - `src/shared/types.ts` — UserConfig
  - `src/background/network_capture.ts` — 4 处大小检查
  - `src/dashboard/dashboard.ts` — 设置 UI


### ✅ P0.43 采集记录详情页用户行为 tab 显示「暂无数据」
- **状态**：已修复 — 2026-06-13
- **根因**：`get_capture_data` 读取 IndexedDB 事件之前未 flush 写入缓冲区。统计计数 (`user_action_count`) 在事件写入时通过 `persist_stats()` 立即持久化到 capture 记录，但事件数据经 `write_events` 进入 per-store 缓冲区后需等 `FLUSH_INTERVAL_MS`（1s）周期 flush 才落盘到 IndexedDB。用户在 1s 窗口内查看详情页时，stats 已更新但事件未落盘，`get_events_by_category('user_action')` 返回空数组，导致 user_action tab 渲染「暂无数据」。
- **现象**：采集记录详情页统计数据明确显示采集到了多条用户行为事件，但点击「用户行为」标签页后内容区域显示「暂无数据」。
- **修复**：`get_capture_data` 在并行查询前先 `await flush_all()`，确保所有缓冲区事件落盘后再读取。dashboard 和独立详情页共享同一数据加载路径（均调用 `get_capture_data`），一处修复覆盖两个入口。
- **影响文件**：
  - `src/background/service_worker.ts` — `get_capture_data` 前置 flush_all
  - `tests/p043_flush_before_read.test.ts` — 新增单测覆盖


### ✅ P0.41 Response Body 采集时序竞态 — web_request 路径 ~98% not_enabled
- **状态**：已修复 — 2026-06-12（CDP-first 架构重构）
- **详细文档**：`docs/P0.41_BODY_CAPTURE_RACE.md`
- **现象**：导出 JSON 中 `web_request` 路径的请求 ~98% 为 `response_body_status: "not_enabled"`，`extension_cdp` 路径正常。
- **根因**：`find_matching_cdp_request` 匹配成功后从 `cdp_request_meta` 删除条目，导致后续 `find_cdp_candidates` 看到 0 候选 → deferred 条目 `pending_cdp_ids` 为空 → 必然超时 → not_enabled。次要原因：页面加载时 CDP 事件晚于 webRequest，`cdp_request_meta` 初始为空。
- **修复要点**：
  1. `find_matching_cdp_request` 匹配到但无 body 时，不删除 `cdp_request_meta` 条目，将该 CDP ID 传入 deferred `pending_cdp_ids`
  2. 或将删除操作延迟到 body 确认可用后
  3. 补测试：deferred 条目在 `find_matching_cdp_request` 匹配后仍有候选
- **影响文件**：
  - `src/background/network_capture.ts` — handle_completed / find_matching_cdp_request / find_cdp_candidates
  - `tests/network_cdp.test.ts` — deferred 匹配测试

---

## ✅ 用户加的bug记录（全部已修复）

以下 bug 都要找原因为什么测试没有发现，测试有问题就补测试，文档有问题就改文档，最后才是改代码解决 bug。我要的是这次错了修正后以后不再犯。

---

## P1 · 测试缺口（流式/WS 采集）

### ✅ T1 websocket_capture.test.ts — 缺 undefined payloadData、控制帧测试
- **状态**：已补 — 2026-06-13
- **关联**：P0.58
- **缺口**：所有测试用例的 `payloadData` 均为字符串（`'hello'`/`'world'`/`'a'.repeat(100)`），未覆盖：
  1. `payloadData` 字段缺失（CDP 控制帧不携带此字段，值为 `undefined`）
  2. 控制帧（opcode 8=close, 9=ping, 10=pong）通常无 payload
  3. 二进制帧（opcode 2）的 base64 payload + 截断
- **原因**：mock 数据来自开发者想象，未参考 CDP 实际事件格式。Chrome 的 `webSocketFrameReceived` 对 ping/pong 帧不填 `payloadData`。
- **补测要求**：
  1. `webSocketFrameReceived` 无 `payloadData` → 不崩溃，`payload` 为 null，`payload_status` 为 captured
  2. `webSocketFrameReceived` opcode=9 (ping) → 正常产出 ws_frame event
  3. `webSocketFrameSent` opcode=2 (binary) + base64 payload → `payload_encoding` 为 base64

### ✅ T2 streaming_capture.test.ts — 缺 chunked + 非流式 MIME 组合测试
- **状态**：已补 — 2026-06-13
- **关联**：P0.57
- **缺口**：`is_streaming_response` 测试只测了：
  - `transfer-encoding: chunked`（无 content-length）→ true ✓
  - `transfer-encoding: chunked` + `content-length` → false ✓
  - 但没测 `transfer-encoding: chunked` + `content-type: text/css`（真实 HTTP/1.1 场景）
- **原因**：测试按 spec 条件逐一验证，未模拟真实浏览器响应 header 组合。HTTP/1.1 普通响应（CSS/JS/JSON）也带 `transfer-encoding: chunked` 且无 `content-length`。
- **补测要求**：
  1. `{ 'transfer-encoding': 'chunked', 'content-type': 'text/css' }` → false
  2. `{ 'transfer-encoding': 'chunked', 'content-type': 'application/json' }` → false
  3. `{ 'transfer-encoding': 'chunked', 'content-type': 'text/event-stream' }` → true
  4. `{ 'content-type': 'text/event-stream' }`（无 transfer-encoding）→ true

### ✅ T3 stream_buffer.test.ts — 缺并发 append 安全测试
- **状态**：已补 — 2026-06-13
- **缺口**：7 个测试全部是串行调用 `append`，未验证多 request 并发写入场景。虽然 `create_stream_buffer` 内部用 Map 隔离 request_id，但无测试证明：
  1. 两个不同 request_id 同时 append 不互相干扰
  2. 同一 request_id 在 flush 期间被再次 append 不丢数据
- **风险**：低。Map 天然隔离 request_id，当前实现无并发 bug，但缺测试作为回归保障。
- **补测要求**：
  1. 两个 request_id 交替 append → 各自独立 flush，数据不混
  2. flush 回调中再次 append 同一 request_id → 新数据正确累积

### ✅ T4 network_cdp.test.ts — 缺 header 边界场景
- **状态**：已补 — 2026-06-13
- **缺口**：
  1. 响应 header 为空对象 `{}` → `extract_mime_type` 返回 null，未测试此路径
  2. header key 大小写混合（CDP 给小写，webRequest 给首字母大写）→ `headers_map_from_cdp` 直接 spread，未验证大小写一致性
  3. 响应 body 为超大文本（>max_body_capture_bytes）→ `build_cdp_body_result` 截断 + too_large，现有测试只测了二进制超限
- **风险**：低。现有代码对这些场景有基本处理，但缺回归保障。
- **补测要求**：
  1. `responseReceived` header 为空 → `mime_type` 为 null，不崩溃
  2. `responseReceived` header key 大写 `Content-Type` → 正确提取 mime
  3. 文本 body 超 `max_body_capture_bytes` → `body_status` 为 too_large，body 被截断

### 根因总结

| 模式 | 涉及测试 | 根因 |
|---|---|---|
| mock 数据太理想 | T1, T2 | 开发者按 spec 写 mock，未参考 CDP/HTTP 真实行为 |
| 缺字段缺失场景 | T1 | CDP 可选字段在控制帧中不出现，mock 始终提供 |
| 缺真实组合 | T2 | 按 spec 条件逐一验证，未做交叉组合 |
| 缺并发测试 | T3 | 串行思维，未考虑多 request 同时写入 |

---

---

## 测试策略改进 (2026-06-13)

> 详细文档：`docs/TEST_STRATEGY.md`
> 起因：P0.36/P0.38/P0.39/P0.40/P0.41/P0.43 共 6 个 bug 均为用户发现而非测试发现。当前 542 个测试几乎全是孤立单元测试（mock 一切），缺少跨模块协作验证。

### ✅ T0.1 回归快照测试

- **目的**：每个已修复 P0 bug 一个断言，防复发
- **文件**：`tests/regression_smoke.test.ts`
- **测试项**：
  - P0.31: 导出 JSON 中 resource_type 全小写
  - P0.38: started_at 不含 'Z'，system_time_timezone 非空
  - P0.39: enable_response_body_capture(1) 后 enable_response_body_capture(2) 触发 detach+re-attach
  - P0.40: 三个导出入口均 import download_blob from export_utils
  - P0.41: not_enabled 占比 < 50%
  - P0.43: stats.user_action_count === events.filter(user_action).length

### ✅ T0.2 数据管道测试

- **目的**：验证「写入 → flush → 读取」闭环一致性，stats 计数与 event 数组长度匹配
- **文件**：`tests/pipeline_consistency.test.ts`

### ✅ T0.3 导出闭环测试

- **目的**：导入真实导出 JSON，验证字段完备（时区、resource_type、capture_method、body_status 分布）
- **文件**：`tests/export_integrity.test.ts`

### ✅ T0.4 渲染数据一致性测试

- **目的**：stats 数字 vs UI 渲染行数，确保每个 tab 都有数据行
- **文件**：`tests/detail_render_consistency.test.ts`

### ✅ T0.5 入口去重审计测试

- **目的**：扩展 P0.40 修复的 import 检查模式到所有共享函数（redaction、build_export_filename 等）
- **文件**：`tests/entry_unification.test.ts`

### ✅ T0.6 E2E 断言收紧

- **目的**：去掉条件跳过，改为强制断言
- **影响文件**：`tests/e2e-export.spec.ts`、`tests/e2e-detail-tabs.spec.ts`、`tests/e2e-cdp-retry.spec.ts` 等
- **具体**：
  - `if (data.console_events.length > 0)` → 强制 `expect(data.console_events.length).toBeGreaterThanOrEqual(0)`
  - 导出验证：`expect(body_capture_mode).not.toBe('extension_cdp')` → 改为检查 `not_enabled` 占比
  - detail tab：每个 tab 断言至少有一行数据

---

## 测试审计报告 (2026-06-12)

10 组并行审计，检查「测试通过但功能不工作」的脱节模式。

### 审计发现汇总

| 组 | 范围 | 脱节数 | 严重度 |
|----|------|--------|--------|
| 1 | popup_layout | 全部 54 测试 | **严重** |
| 2 | export_settings/system_time | 2 | 高 |
| 3 | dashboard | 3 + 1 潜伏 bug | 高 |
| 4 | E2E export | 5 | 高 |
| 5 | E2E detail tabs | 5/8 tab 未覆盖 | 高 |
| 6 | settings | 2 | 中 |
| 7 | network | 6 | **严重** |
| 8 | E2E capture | 5 | 高 |
| 9 | agent/bridge | 0 | ✅ 干净 |
| 10 | 剩余单元测试 | 6 | 高 |

### 关键发现

**G1 popup** — `popup_layout.test.ts` 54 个测试全部是布局常量断言（宽/高/列数），零交互测试。所有按钮的 click handler、chrome.runtime.sendMessage 调用、状态转换逻辑均无测试覆盖。

**G7 network** — `resolve_resource_type()` 仅在 webRequest 路径被调用，CDP 初次存储和 `network_correlator.ts` 三个构建函数（`merge_matched`/`build_cdp_only_request`/`build_web_request_only_request`）全部直接透传原始 type 值，不归一化。测试未覆盖 CDP PascalCase 输入。

**G3 dashboard** — `event_category.ts` 潜伏 bug：`category_for_event_type()` 对 `network_request`/`console_event`/`capture_config_changed` 等会错误落到 `'dom_data'` category（目前因生产者显式设 category 未触发）。

**G2 export** — `export_session()` 硬编码文件名 `capture_all_${id}.${ext}`，`build_export_filename()` 及 `{date}` 模板从未参与实际下载路径。`migrate_iana_timezone()` 测试仅纯函数，不覆盖 `load_user_config()` 完整加载路径。

**G4 E2E export** — 未断言 filename 含 date、未断言 `started_at` 非 UTC、未断言 `system_time_timezone` 非空、未断言 `resource_type` 无 PascalCase、`console_events` 非空用条件跳过。

**G5 E2E detail** — 8 个 tab 中 5 个未验证（user_action/navigation/cookie/error/config），selector 与实际 DOM 不匹配。

**G8 E2E capture** — 停止采集不验证 `success=true` 返回值；CDP 测试不验证 `response_body` 非空；状态测试缺多个元素。

**G10 单元测试** — `session_manager` 测试自测自（不调生产代码）、`console_capture` 测试不触 CDP 监听器、`redaction` 测试的脱敏函数在 `exporter.ts` 中零调用、`tab_events` 不覆盖受限 URL 重试、`ui_strings` 不扫 `session` 残留词、`event_category` 仅覆盖 2/20+ 映射。

### 脱节模式分类

1. **纯函数测试，不知生产调用方**（最常见）：函数被完整测试但无人验证它在真实路径被调用。例：`build_export_filename`、redaction 函数。
2. **DOM 存在性断言，无交互验证**：断言元素 id/class 存在，不模拟 click、不验证事件副作用。例：popup_layout 全部测试。
3. **mock 数据与小写/标准值，CDP 实际给 PascalCase**：例：network 测试全用小写输入，CDP 给 `Document`/`Fetch`。
4. **条件跳过代替强制断言**：`if (length > 0) { expect... }` 掩盖零数据问题。

