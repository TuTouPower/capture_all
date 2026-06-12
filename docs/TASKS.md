# Capture All — TASKS.md

> 基准：`docs/design/caputue-all/project/record-all/` (commit `f7fe756`)

---

## P0 · 功能缺陷

### ✅ P0.0 数据标签应为可点击的采集开关
- **状态**：已修复 — `4ada80a`。8 标签卡片改为可点击开关，'ready' 状态下可切换，toggle 状态存入 chrome.storage
- **现象**：弹出窗口中 8 个数据标签（用户行为/页面导航/网络请求/控制台/错误异常/Storage/Cookie/脱敏）只是静态展示卡片，不可交互
- **期望行为**：
  - 每个数据标签卡片是一个开关按钮，用户可以点击切换开启/关闭
  - 点击=开启采集该类型数据（卡片高亮/选中态），没点=关闭采集（卡片灰显/未选中态）
  - 脱敏卡片：点击=开启脱敏，没点=关闭脱敏
  - 网络请求卡片：点击=采集网络请求，没点=不采集网络请求
  - 状态切换应在开始采集前完成，采集中不可切换
- **影响**：用户无法控制采集范围，所有类型强制全采或全不采

### ✅ P0.1 采集中标签计数始终为 0
- **状态**：已修复。`get_status` 返回 `current_capture`，popup `refresh_counts` 可读取实时 stats

### ✅ P0.2 停止采集按钮无效
- **状态**：已修复。`stop_capture` 容错处理，即使 SW 返回失败也强制转换状态

### ✅ P0.3 实时详情页内容为空
- **状态**：已修复。`get_capture_data` 现在查询全部 7 个 category store

### ✅ P0.4 页面导航事件采集不到数据
- **状态**：已修复。`CaptureStats` 新增 `nav_count`，SW 中 navigation category 事件计入 nav_count

### ✅ P0.5 主面板状态不实时更新
- **状态**：已修复。dashboard 每 2s 自动轮询 `load_sessions()`，状态变化自动 re-render

### ✅ P0.6 采集详情页完全不可用
- **状态**：已修复。`get_capture_data` 查询全部 7 个 store，合并为 all_events 返回。格式选择器 + 导出按钮已有

### ✅ P0.7 导出按钮点击无效
- **状态**：已修复。`export_session` 创建 Blob 下载，支持 JSON/JSONL/HTML/HAR。详情页加格式选择器

### ✅ P0.8 去掉导出状态字段
- **状态**：已修复。`export_status` 字段从 `CaptureRecord` 移除，dashboard 导出列替换为「已完成」统计

### ✅ P0.9 导出文件数据为空
- **状态**：已修复 — commit 待推送。两个独立 bug 均已修复
- **现象**：导出 JSON 中 `events`、`network_requests`、`console_events` 三个数组全部为 `[]`，但 `stats` 显示有 260 events + 1000 requests。元数据正常，实际采集数据全部丢失。复现文件：`C:\Users\Karson\Downloads\capture_all_session_1780969915280_vczrqep.json`
- **根因分析**（2026-06-09）：**两个独立 bug**
  ---
  **Bug A — `NetworkRequestData` / `ConsoleEventData` 缺少 `capture_id` 字段，数据写入 IndexedDB 但无法按 `capture_id` 检索**
  - `src/shared/types.ts`:242 — `NetworkRequestData` 没有 `capture_id` 字段<br>
    `src/shared/types.ts`:284 — `ConsoleEventData` 没有 `capture_id` 字段
  - `src/background/storage.ts`:86-91 — `NETWORK_REQUESTS` store 定义：
    ```typescript
    keyPath: 'event_id',           // NetworkRequestData 没有 event_id → key 为 undefined → DB 自动生成 key
    index: 'capture_id',           // NetworkRequestData 没有 capture_id → 索引值为 undefined → 查询永远返回空
    ```
  - `src/background/storage.ts`:93-98 — `CONSOLE_EVENTS` store 同样问题
  - `src/background/network_capture.ts`:434-478 — `build_network_event()` 只把 `capture_id` 设在 `event` 上，传给 `data: NetworkRequestData` 时未设置
  - `src/background/service_worker.ts`:520-530 — `handle_network_request()` 只取 payload 的 `data` 部分调 `write_network_requests()`，丢弃了含 `capture_id` 的 `event` 部分
  - `src/background/service_worker.ts`:532-541 — `handle_console_log()` 同样，只传 `event.data`，不传 `capture_id`
  - 结果：数据通过 `store.put(item)` 成功写入（key 自动生成），stats 计数器正常增长，但 `get_network_requests(capture_id)` / `get_console_events(capture_id)` 用 `IDBKeyRange.only(capture_id)` 查索引，因为存储对象上没有 `capture_id` 属性，索引值为 `undefined`，永远查不到 → 返回空数组
  - 同样影响 `RuntimeExceptionData`（`error_events` store）、`StorageChangeData`（`storage_changes` store）、`CookieChangeData`（`cookie_changes` store）
  ---
  **Bug B — `exporter.ts` 只查询 `user_action` 一个 event category，漏了其余 6 个**
  - `src/background/exporter.ts`:14 — `export_json()` 只调用：
    ```typescript
    get_events_by_category(capture_id, 'user_action', 0, 100000)
    ```
    未查询 `navigation`、`error`、`storage`、`cookie`、`capture_lifecycle` 等 category
  - `src/background/exporter.ts`:30-32 — `export_jsonl()` 同样只查 `user_action`
  - `src/background/exporter.ts`:57-59 — `export_html()` 同样只查 `user_action`
  - `src/background/service_worker.ts`:111-119 — `get_capture_data()`（dashboard 用）已在 P0.6 修过，查全部 7 个 category，但 exporter 未同步更新
  - 结果：即使 Bug A 修好后 events 能查到，`navigation`/`storage`/`cookie` 等事件也不会出现在导出文件中。`network_requests` 和 `console_events` 用的是专用 reader，不受此 bug 影响
  ---
- **修复要点**：
  1. `NetworkRequestData`、`ConsoleEventData`、`RuntimeExceptionData`、`StorageChangeData`、`CookieChangeData` 加 `capture_id?: string` 字段
  2. `NetworkRequestData` 加 `event_id?: string` 字段（对齐 store 的 `keyPath: 'event_id'`）
  3. `build_network_event()` 设置 `data.capture_id` 和 `data.event_id`
  4. `handle_console_log()` 设置 console event data 的 `capture_id` 和 `event_id`
  5. 其他 data 类型（error/storage/cookie）同样在写入前设置 `capture_id` + `event_id`
  6. `export_json()` / `export_jsonl()` / `export_html()` 改为查询全部 7 个 category store（与 `get_capture_data` 一致）
  7. 测试：写入 → flush → 按 capture_id 查询 → 验证数据不丢失；导出 JSON 验证 events/network_requests/console_events 非空

### ✅ P0.10 网络请求返回体全部未捕获（CDP debugger 抢占）
- **状态**：已修复。CDP attach 统一到 service_worker，三系统共享同一 debugger<br>
  console_capture/exception_capture 新增 `already_attached` 参数，body_capture_coordinator 新增 `already_attached_tab_id` 参数<br>
  重试路径（onActivated/onUpdated）同步更新
- **现象**：导出 JSON 中 `network_requests` 数组有 132 条，弹窗统计也正确。但所有 132 条的 `response_body` 全部为空，`response_body_status` 全部为 `not_enabled`，`body_capture_mode` 显示 `extension_cdp` 但 body 实际并未捕获。复现文件：`capture_all_session_1781180877123_cw5hegh.json`
- **直接根因**：`network_capture.ts:168` 的 `enable_response_body_capture()` 中 `dbg_tab_id` 始终为 `null`，导致 `handle_completed()` 所有请求走 line 502 `send_to_background(build_network_event(pending, details, null, 'not_enabled'))`，body 不捕获
- **上游根因 — CDP 抢占**：启动时在 `chrome://newtab/`（受限 URL），`chrome.dbg.attach` 失败。用户切换到 `https://opencode.ai/` 后，`tab.onUpdated` 触发重试（line 751-788），但重试顺序导致抢占：
  1. `start_console_capture()` → `chrome.dbg.attach(tabId)` **成功**，占用 debugger
  2. `start_exception_capture()` → `chrome.dbg.attach(tabId)` **失败**（已被占用）
  3. `start_body_capture()` → `enable_response_body_capture(tabId, false)` → `chrome.dbg.attach(tabId)` **失败**（已被占用）→ coordinator 降级为 `fallback_hook` → body 无法捕获
- **加重因素**：
  - `body_capture_coordinator.start_body_capture()` 始终传 `already_attached: false`，即使 debugger 已被 console 占用，不知道可以复用
  - `network_capture.ts:487` 的 `body_capture_mode` 只看 `config.capture_response_body`，不看 coordinator 实际状态，降级后仍显示 `extension_cdp`，误导排查
  - `body_capture_coordinator` 降级到 `fallback_hook` 后，content script 的 `network_hook.ts` / `xhr_fetch_capture.ts` 也全部设 `response_body_status: 'not_enabled'`，fallback 路径实际不工作
  - 首次导航时 `last_tab_urls` 可能无初始 URL 记录，`prev_url?.startsWith('chrome://')` 为 undefined，不触发重试（本次复现中重试已触发，但此场景仍有隐患）
- **修复要点**：
  1. **`enable_response_body_capture` 支持 `already_attached=true`** — console 已 attach 时只 `Network.enable`，不重复 `attach`
  2. **`body_capture_coordinator` 传递正确的 `already_attached`** — 从 `service_worker` 获取 debugger 已 attach 的 tab_id
  3. **`network_capture.build_network_event()` 的 `body_capture_mode` 反映实际 coordinator 状态** — 而非只看 `config.capture_response_body`
  4. **`fallback_hook` 路径的 content script 应尝试捕获 response body** — `network_hook.ts` 和 `xhr_fetch_capture.ts` 当前只写 `not_enabled`
  5. **初始 tab URL 记录** — 录制开始时 `last_tab_urls.set(active_tab.id, active_tab.url)`，确保首次导航也能触发受限于→正常的重试
  6. **E2E 测试验证** — 模拟 chrome://newtab 启动 → 导航到目标网站 → 验证 `network_requests[].response_body` 非空
- **影响文件**：
  - `src/background/network_capture.ts` — `enable_response_body_capture` + `build_network_event`
  - `src/background/body_capture_coordinator.ts` — `start_body_capture` 接收 `already_attached` 参数
  - `src/background/service_worker.ts` — 初始/重试调用传递 `debugger_attached_tab_id`；`last_tab_urls` 初始化
  - `src/content/network_hook.ts` / `src/content/xhr_fetch_capture.ts` — fallback body 捕获

### ✅ P0.11 CDP 重试成功后 current_capture 元数据未更新
- **状态**：已修复 — `0f9e1f1`。提取 `update_capture_body_state` 辅助函数，onActivated/onUpdated 两处重试路径调用，失败时也更新
- **现象**：从 `chrome://extensions/` 启动采集 → CDP attach 失败 → 用户切换到正常网页 → CDP 重试可能成功，但导出 JSON 的 `body_capture_mode` 仍为 `fallback_hook`，`body_capture_failure_reason` 仍为 `cdp_attach_failed`，与实际运行状态脱节。复现文件：`D:\Kar\Code\omni_usage\data\capture_all_session_1781230856919_jlxe8pa.json`
- **根因**：两处重试路径只打日志，不更新 `current_capture` 的 `body_capture_*` 字段：
  - `service_worker.ts:738-740` — tab 激活重试（`chrome.tabs.onActivated`）：`start_body_capture()` 返回后，成功时仅 `logger.info('Body capture retry succeeded on tab ...')`，**无** `current_capture.body_capture_mode = result.mode` 等赋值
  - `service_worker.ts:839-841` — URL 从受限跳正常重试（`chrome.tabs.onUpdated`）：同上，成功时仅打日志
- **对比初始启动**（`service_worker.ts:377-382`）：
  ```typescript
  current_capture.body_capture_mode = result.mode;
  current_capture.body_capture_status = result.status;
  current_capture.body_capture_failure_reason = result.failure_reason;
  current_capture.body_capture_message = result.message;
  ```
  初始启动正确更新了这 4 个字段，但两处重试路径完全遗漏。
- **影响**：
  - 导出 JSON 的 `capture.body_capture_mode/status/failure_reason/message` 永远反映初始失败状态，无法判断重试是否生效
  - 用户/调试者看到 `fallback_hook` + `cdp_attach_failed` 会误以为整个采集期间 CDP 从未成功
  - 无法通过导出数据判断 body capture 实际工作模式
- **修复要点**：
  1. 提取 `update_capture_body_state(result: BodyCaptureStartResult)` 辅助函数，封装 4 字段赋值 + `update_capture()`
  2. Tab 激活重试（line 738）成功时调用 `update_capture_body_state(body_result)`
  3. URL 变更重试（line 839）成功时调用 `update_capture_body_state(body_result)`
  4. 失败时也更新（state 可能从之前的部分成功变为新的失败），确保导出数据始终反映最新状态
- **测试遗漏原因**：E2E CDP 重试测试（`e2e-cdp-retry.spec.ts`）只验证 `start_body_capture` 调用成功，不检查 export JSON 中 `body_capture_mode` 字段是否反映重试后的实际状态
- **影响文件**：
  - `src/background/service_worker.ts` — 两处重试路径补充 `current_capture` 更新

### ✅ P0.12 网络请求 response_body 全部为 null — 三层根因叠加
- **状态**：L1+L2 已修复，L3 为 Chrome 架构限制无法修复
- **L1 修复**：P0.11 — CDP 重试后元数据更新（`0f9e1f1`）
- **L2 修复**：fallback hook 路由断层 — `network_hook.ts` 发送 `type: 'network_body_hook'`；`xhr_fetch_capture.ts` 已删除（与 network_hook 重复拦截，不捕获 body）
- **L3 未修复**：`chrome.webRequest.onCompleted` 不含 response body（Chrome 架构限制），script/font/stylesheet 等声明式资源无法通过 content script hook 拦截，CDP 不可用时永远无法获取

### ✅ P0.13 CDP 重试回调不匹配导致事件写入错误表
- **状态**：已修复 — `0a2cd8a`。4 处回调替换：console retry → handle_console_log，body retry → handle_network_request
- **现象**：从 chrome:// URL 启动后切换到正常网页时，CDP 重试使用的回调函数与初始启动不同，导致重试后的事件写入错误的数据表，统计计数不递增
- **根因**：初始启动和重试路径使用了不同的回调函数：

  | 子系统 | 初始启动回调 | retry 回调（onActivated + onUpdated） | 后果 |
  |--------|------------|--------------------------------------|------|
  | console | `handle_console_log` | `handle_event` | console 事件写入 `events` 表而非 `console_events` 表，`log_count` 不递增 |
  | exception | `handle_console_log` | `handle_event` | 异常事件写入 `events` 表而非 `error_events` 表（此处 retry 回调反而比初始路径更合理，异常不应走 `log_count`） |
  | body capture | `handle_network_request` | `(req) => handle_event(req)` | body 事件写入 `events` 表而非 `network_requests` 表，`request_count` 不递增 |

  共 **4 处回调不匹配**：onActivated console retry (line 708)、onActivated body retry (line 734)、onUpdated console retry (line 809)、onUpdated body retry (line 835)
- **对比**：`handle_console_log` 内部调用 `write_console_events()` 并递增 `log_count`；`handle_network_request` 调用 `write_network_requests()` 并递增 `request_count`。而 `handle_event` 调用 `write_events()` 并递增 `event_count`。retry 路径用后者，数据落入了错误的 store
- **特别说明**：此 bug 在 P0.10 的修复（统一 CDP attach）中**未涉及**，P0.10 只修了 debugger 抢占问题，没有修回调不匹配
- **修复要点**：
  1. onActivated/onUpdated console retry：`handle_event` → `handle_console_log`
  2. onActivated/onUpdated body retry：`(req) => handle_event(req)` → `handle_network_request`
  3. 可选：提取 retry 函数 `retry_console_capture(tab_id)` / `retry_body_capture(tab_id)` 封装正确回调，避免手动写错
- **测试遗漏原因**：无测试验证 retry 后的数据落在正确的 IndexedDB store 中；无测试对比初始启动和 retry 路径的数据表分布
- **影响文件**：
  - `src/background/service_worker.ts` — 4 处回调替换

### ✅ P0.14 build_network_event 中 response_preview 始终为 null
- **状态**：已修复 — `a7309a6`。CdpBodyResult 加 preview 字段，build_network_event 接收并使用，覆盖 CDP matched + orphan 双路径
- **现象**：导出 JSON 中所有 `network_requests[].response_preview` 均为 `null`，即使 `truncate_response_body()` 已经生成了前 200 字符的 preview
- **根因**：`network_capture.ts:478` — `build_network_event` 中 `response_preview: null` 硬编码，未使用 `TruncateBodyResult.response_preview`
  - `truncate_response_body`（`redaction.ts:90-97`）返回 `{ body, response_preview }`（前 200 字符）
  - 但在 `network_capture.ts:252` 的 body 截断调用中，只用 `result.body!` 存入 `cdp_body_results`，`result.response_preview` 被丢弃
  - `build_network_event` 第 478 行直接写死 `response_preview: null`
- **修复要点**：
  1. `cdp_body_results` 的 value 类型增加 `preview` 字段
  2. `build_network_event` 接收 preview 参数，传入 `response_preview`
  3. fallback hook（`network_hook.ts`）同样适用——已生成 preview（截断时），但未传递到最终 NetworkRequestData
- **影响文件**：
  - `src/background/network_capture.ts` — cdp_body_results value 类型 + build_network_event 签名
  - `src/content/network_hook.ts` — fallback 路径透传 preview
  - `src/shared/types.ts` — 无需改（`NetworkRequestData.response_preview` 字段已存在，只是从未被填充）

### ✅ P0.15 CDP body 与 webRequest 竞态导致 not_enabled 虚高 + 同请求重复记录
- **状态**：部分修复 — `c98b2a9`。延迟写入 + `try_resolve_deferred` 使 body_capture_mode 全部正确且 response_preview 正确填充，但多候选 CDP 响应共享 deferred_key 导致重复残留（详见 P0.15-R1）
- **现象**：导出 387 条 network_requests 中，`response_body_status=not_enabled` 占 63%（245 条），但 `body_capture_mode=extension_cdp` 的也有 265 条（68%），说明 CDP 明明在运行，大量请求却被标为 not_enabled。同时 `correlation_status=cdp_only` 的记录（≈122 条，32%）正是这些请求的 CDP body 单独写出的第二份记录。复现文件：`D:\Kar\Code\omni_usage\data\capture_all_session_1781231089152_1o34e4b.json`
- **根因**：`network_capture.ts:494-528` — `handle_completed()` 同步查 CDP body，但 `Network.getResponseBody` 是异步的，webRequest 到达时 body 大概率还没 resolve：
  1. `webRequest.onCompleted` 触发 → 调用 `find_matching_cdp_request()`（line 508）
  2. `cdp_body_results` 中找不到 → 立即写 `response_body_status: 'not_enabled'`（line 528）
  3. 稍后 CDP `Network.getResponseBody` resolve → body 进入 `cdp_body_results`
  4. 3 秒 orphan timeout 后 → 作为 `cdp_only` 写出第二份记录（line 272-305）
  5. 同一请求变成两条记录：一条 webRequest metadata (not_enabled) + 一条 CDP body (captured/too_large/…)

  `find_matching_cdp_request()`（line 531-554）另有三个匹配失败点：
  - **时间戳体系不一致**：CDP meta 用 `Date.now()`（line 208/230），webRequest 用 `details.timeStamp`（Chrome 内部时钟），两者非同一时钟源，可能偏差超出 2s 窗口
  - **status_code=0 不匹配**：CDP `Network.responseReceived` 可能晚于 `Network.loadingFinished`，此时 `meta.status_code` 还是 0，而 webRequest 有真实 status，匹配失败
  - **多候选直接放弃**：同 URL + method + status 的并发请求 >1 时，`candidates.length !== 1` 返回 null（line 552-553）
- **影响**：
  - 导出数据量虚增（重复记录），实际唯一请求 ≈387-122≈265
  - `not_enabled` 占比虚高，掩盖真正的 body capture 成功率
  - `cdp_only` 和 `web_request` 两条记录需手动关联才能拼回完整请求
- **修复要点**：
  1. `handle_completed()` 收到 webRequest 时不立即写 not_enabled，改为等待 CDP body（设超时，如 3s），超时后再写
  2. 或改为：webRequest 先写一条（response_body 暂空），CDP body 到达后 UPDATE 该记录而非 INSERT 新记录
  3. `find_matching_cdp_request()` 统一时间戳来源（全部用 `Date.now()` 或全部用 Chrome timestamp）
  4. `find_matching_cdp_request()` status_code=0 时放宽条件（仅匹配 URL + method + 时间窗口，忽略 status）
  5. 多候选时返回最佳匹配（时间最近者）而非放弃
- **测试遗漏原因**：
  - `handle_completed()` 和 `find_matching_cdp_request()` — **零单元测试**
  - CDP `Network.loadingFinished` → `Network.getResponseBody` 异步链路 — **零测试**
  - `schedule_orphan_check()` 3 秒延迟逻辑 — **零测试**
  - `network_capture.test.ts` 只测纯函数（脱敏、body 解析），不测请求生命周期
  - `network_correlator.test.ts` 测了 `correlate()` 函数级匹配，但 `handle_completed()` 中的实际匹配流程（line 508-528）完全不同且无测试
  - E2E 测试从不统计 `response_body_status` 分布，无法发现 not_enabled 占比异常
- **影响文件**：
  - `src/background/network_capture.ts` — handle_completed + find_matching_cdp_request + schedule_orphan_check

### ✅ P0.16 CDP orphan / bridge 路径构造的 NetworkRequestData 缺少必填字段
- **状态**：已修复 — `f7e95ee`。4 个 builder 函数返回类型 any → NetworkRequestData，补全全部 30 个必填字段；handle_network_request 新增 normalize_network_request 校验
- **现象**：导出 387 条中 32%（≈122 条）`body_capture_mode=undefined`，同时还缺 `capture_method`、`capture_id`、`event_id`、`response_preview`、`url_status` 等字段。这些记录恰好对应 `correlation_status=cdp_only` 的数量，是 CDP body 成功捕获但未与 webRequest 匹配的 orphan 记录。复现文件同上 P0.15
- **根因**：3 个函数返回 `any` 类型，构造不完整对象，绕过 TypeScript 检查：
  1. `network_correlator.ts:85-108` — `build_cdp_only_request()` 返回 `any`，缺少 `body_capture_mode`、`capture_method`、`capture_id`、`event_id`、`response_preview`、`url_status`、`status_text`、`protocol`、`initiator`、`mime_type`、`request_size_bytes`、`response_size_bytes`、`transfer_size_bytes`、`from_cache`、`cache_status`、`error_text` 等 **17 个字段**
  2. `body_capture_coordinator.ts:251-274` — `convert_bridge_event_to_request()` 返回 `any`，同样缺 `body_capture_mode`、`capture_method` 等字段
  3. `network_correlator.ts:57-83` — `merge_matched()` 返回 `any`，同样不完整
  4. `network_correlator.ts:111-130` — `build_web_request_only_request()` 返回 `any`，缺 `body_capture_mode`、`capture_method`
  5. `service_worker.ts:629-640` — `handle_network_request()` 只补 `capture_id` + `event_id`，不 normalize 其他缺失字段，直接写入 IndexedDB
- **为什么 `any` 能通过 review**：类型标注 `NetworkRequestData` 有 30+ 必填字段，如果这 4 个函数返回类型标为 `NetworkRequestData`，TS 编译就会报错。但全部标为 `any`，完全绕过了类型检查
- **修复要点**：
  1. `build_cdp_only_request()` 返回类型改为 `NetworkRequestData`，补全所有缺失字段（未获取到的设 null 或合理默认值）
  2. `convert_bridge_event_to_request()` 同上
  3. `merge_matched()` 同上
  4. `build_web_request_only_request()` 同上
  5. `handle_network_request()` 加 schema normalize：检查必填字段，缺失时补默认值 + warn 日志
  6. 全局搜索 `): any {` 返回类型，逐一审查是否为数据写入路径
- **测试遗漏原因**：
  - `network_correlator.test.ts` 测了 `build_cdp_only_request` 的部分字段（session_id、response_body、correlation_status），但**从不验证 `body_capture_mode` 是否存在**
  - 无测试验证 `handle_network_request()` 写入前的数据完整性
  - 无类型级测试（如 vitest `expectTypeOf()` 验证返回值类型 = `NetworkRequestData`）
  - E2E 导出测试只检查特定字段，不遍历所有记录验证必填字段非 undefined
- **影响文件**：
  - `src/background/network_correlator.ts` — build_cdp_only_request / merge_matched / build_web_request_only_request
  - `src/background/body_capture_coordinator.ts` — convert_bridge_event_to_request
  - `src/background/service_worker.ts` — handle_network_request normalize
  - `tests/network_correlator.test.ts` — 补字段完整性断言

### ✅ P0.17 测试文件补充清单（P0.15-P0.16 暴露的测试缺口）
- **状态**：已补充 — `5697410` + 后续。network_capture.test.ts +11 测试、network_correlator.test.ts +4 字段完整性测试、network_cdp.test.ts +6 CDP mock 测试、chrome.debugger mock 已创建
- 以下函数/路径完全无测试覆盖，本次问题全部发生在此处：
  | 函数/路径 | 文件 | 行号 | 缺失后果 |
  |-----------|------|------|----------|
  | `handle_completed()` | network_capture.ts | 494-528 | P0.15 竞态 + 重复记录 |
  | `find_matching_cdp_request()` | network_capture.ts | 531-554 | P0.15 匹配失败 |
  | `schedule_orphan_check()` | network_capture.ts | 272-305 | P0.15 orphan 延迟写出 |
  | `handle_cdp_event()` CDP listener | network_capture.ts | 191-270 | P0.15 全链路 |
  | `build_cdp_only_request()` 字段完整性 | network_correlator.ts | 85-108 | P0.16 |
  | `convert_bridge_event_to_request()` 字段完整性 | body_capture_coordinator.ts | 251-274 | P0.16 |
  | `merge_matched()` 字段完整性 | network_correlator.ts | 57-83 | P0.16 |
  | `build_web_request_only_request()` 字段完整性 | network_correlator.ts | 111-130 | P0.16 |
  | `handle_network_request()` normalize | service_worker.ts | 629-640 | P0.16 |
- **额外需要 mock 的能力**：`chrome.debugger`（attach/sendCommand/onEvent）目前零 mock，所有 CDP 链路无法单测。需要创建 `tests/__mocks__/chrome_debugger.ts`
- **影响文件**：
  - `tests/network_capture.test.ts` — 补 CDP 链路测试
  - `tests/network_correlator.test.ts` — 补字段完整性测试
  - `tests/__mocks__/chrome_debugger.ts` — 新建
  - `tests/e2e-cdp-capture.spec.ts` — 补 response_body_status 分布统计 + body_capture_mode 非空断言

### ✅ P0.18 导出事件 relative_time_ms 混入 epoch 时间戳
- **状态**：已修复 — content script 响应式启动从 `get_status` 继承 `capture_id/start_time/tab_id`；SW 写入前归一 ISO/epoch `absolute_time`，防止 13 位 epoch 写入 `relative_time_ms`。
- **复现文件**：`data/capture_all_session_1781258248327_wifgs4c.json`
- **现象**：导出 JSON 可解析，`capture.status=completed`，`network_requests=191`，`body_capture_status=active`，但 `events[].relative_time_ms` 部分记录不是相对采集开始的毫秒数，而是 epoch 毫秒：
  - 正常：`tab_url_change` 为 `5535` / `7709` / `11395` / `12890`
  - 异常：`dom_ready` / `page_load` 出现 `1781258254133`、`1781258259855`、`1781258259856`
- **期望行为**：所有 `relative_time_ms` 必须满足 `0 <= relative_time_ms <= capture.duration_ms + 少量容差`；本次采集 duration 为 `15195ms`，不应出现 13 位 epoch 时间。
- **影响**：
  - Dashboard 时间线排序/比例尺可能异常
  - 导出数据下游分析会把页面加载事件误判为远未来事件
  - `absolute_time` 正常时，`relative_time_ms` 与 `absolute_time - started_at` 不一致，破坏时间字段不变量
- **初步判断**：某些导航事件构造路径把 `Date.now()` 或事件绝对时间直接写入 `relative_time_ms`，而不是减去 `current_capture.started_at/start_time_ms`。`tab_url_change` 路径正常，`content_script` 上报的 `dom_ready/page_load` 路径异常概率高。
- **测试遗漏原因**：现有 E2E 只验证 timeline 有事件/计数，不校验 `relative_time_ms` 范围，也不校验 `absolute_time - capture.started_at ≈ relative_time_ms`。
- **修复要点**：
  1. 查所有构造 `relative_time_ms` 的路径，统一使用采集开始时间计算相对毫秒
  2. 对 content script 上报事件与 SW 生成事件建立同一时间基准
  3. 写入前增加 normalize/断言：若 `relative_time_ms` 大于 `duration_ms` 明显过多，按 `absolute_time - started_at` 修正或拒绝写入
  4. 补单元测试：给定 `started_at` + `absolute_time`，验证导出事件 `relative_time_ms` 为相对值
  5. 补 E2E/导出测试：遍历 `events`，断言所有 `relative_time_ms` 在采集窗口内
- **影响文件**：
  - `src/background/service_worker.ts` — 事件接收/normalize/写入路径
  - `src/content/content_script.ts` 或相关 content capture 模块 — `dom_ready/page_load` 上报路径
  - `tests/e2e-export-content.spec.ts` / `tests/e2e-consistency.spec.ts` — 增加时间不变量验证

### ✅ P0.19 停止采集返回 success=false 但 UI 强制完成
- **状态**：已修复 — `stop_capture` 改为幂等 success；停止清理步骤逐项容错并继续 flush；`Message handler error` 日志展开 `Error.name/message/stack`，避免导出 `{}`。
- **复现文件**：`data/capture_all_logs_2026-06-12T09-58-31-230Z.json`
- **现象**：采集停止时日志出现：
  - `2026-06-12T09:57:43.521Z info popup Stopping capture`
  - `2026-06-12T09:57:43.523Z info background/cookie Cookie capture stopped`
  - `2026-06-12T09:57:43.523Z info background/console Console capture stopped`
  - `2026-06-12T09:57:43.523Z info background/network Network capture stopped`
  - `2026-06-12T09:57:43.525Z info background/exception Exception capture stopped`
  - `2026-06-12T09:57:43.527Z info content/script Content capture stopped`
  - `2026-06-12T09:57:43.532Z error background/sw Message handler error {}`
  - `2026-06-12T09:57:43.532Z warn popup stop returned success=false, forcing state transition {}`
- **期望行为**：所有子系统停止成功时，`stop_capture` 应返回 `success=true`；popup 不应依赖强制状态切换兜底完成正常流程。
- **影响**：
  - 用户看到 UI 已完成，但内部协议认为停止失败
  - 日志导出存在 error/warn，无法区分真实停止失败和已成功但返回值错误
  - 后续如果某个子系统真的停止失败，当前兜底可能掩盖问题
- **已确认正常项**：导出主体仍生成，`capture.status=completed`，dashboard 详情加载到 `events=205`（`14 events + 191 network_requests`）。因此这是停止返回路径/错误处理问题，不是数据完全丢失问题。
- **相关可接受日志**：同次启动有两条 `Failed to send start to tab ...`，发生在通知 3 个 tab 时，只有当前目标 tab 成功。其它 tab 可能是不可注入/已关闭/受限页，若不影响当前采集，可降级或细化日志，不作为本条主问题。
- **初步判断**：`stop_capture` 清理子系统后，某个后续消息响应或状态更新抛错；`logger.error('Message handler error', error)` 导出的 `details` 为空，导致根因不可见。
- **测试遗漏原因**：P0.2 只验证“停止按钮能让 UI 完成”，但没有断言 SW 返回 `success=true`，也没有断言运行日志无 `Message handler error` / `stop returned success=false`。
- **修复要点**：
  1. 建立最小复现：运行一次 start → stop，断言 `stop_capture` response 为 `success=true`
  2. 修复 `Message handler error` 的日志 details，至少导出 `message/name/stack`，避免 `{}`
  3. 定位 stop handler 在所有子系统 stopped 后仍抛错的位置
  4. 只在真正失败时返回 `success=false`；已成功完成状态更新时必须返回 `success=true`
  5. popup 保留兜底但不应在正常路径触发 warn
  6. 补 E2E/日志测试：停止后导出日志不含 `Message handler error`，popup 不出现 `stop returned success=false`
- **影响文件**：
  - `src/background/service_worker.ts` — message handler / stop_capture 返回路径 / error details
  - `src/popup/popup.ts` — stop 返回值处理与 warn 触发条件
  - `tests/e2e-stop.spec.ts` / `tests/e2e-logging.spec.ts` — 增加停止协议与日志断言

### ✅ P0.20 运行日志导出不应让用户选择 JSON/JSONL，应统一为 .log
- **状态**：已修复 — 诊断日志 UI 合并为单一「导出运行日志」入口；`export_app_logs()` 输出人可读 `.log` 文本；下载文件名固定 `.log`。
- **现象**：当前诊断日志设置页允许用户选择/触发 JSON、JSONL 两种运行日志导出格式，导出文件示例为 `capture_all_logs_2026-06-12T09-58-31-230Z.json`。
- **期望行为**：
  - 运行日志导出统一使用 `.log` 格式
  - 不向用户暴露 JSON / JSONL 格式选择
  - UI 文案只保留一个「导出运行日志」入口
  - 文件扩展名固定为 `.log`
  - 日志内容应适合人直接阅读：每行包含时间、级别、模块、消息、必要 details
- **影响**：
  - 当前 JSON/JSONL 选择增加用户决策成本
  - `.json` 文件更像数据交换格式，不符合“运行日志”直觉
  - 后续排障希望用户直接上传/查看 `.log`，避免格式分歧
- **修复要点**：
  1. Dashboard 诊断日志设置页移除 JSON / JSONL 两个导出按钮或格式选择
  2. 统一调用运行日志导出时传 `format: 'log'` 或移除 format 参数
  3. `export_app_logs()` 新增/改为 `.log` 文本格式输出
  4. 下载文件名从 `capture_all_logs_*.json/jsonl` 改为 `capture_all_logs_*.log`
  5. 保留内部结构化日志存储，不影响 IndexedDB `app_logs` schema
  6. 更新 E2E：只断言存在单一导出入口，下载文件名为 `.log`，内容包含 `[level] [module] message` 等可读文本
- **测试遗漏原因**：现有 `tests/e2e-logging.spec.ts` 验证 JSON/JSONL 导出存在，未覆盖产品期望“运行日志只有一种 .log 格式”。
- **影响文件**：
  - `src/dashboard/dashboard.ts` — 诊断日志导出 UI / handler
  - `src/background/exporter.ts` — `export_app_logs` 输出格式与文件名
  - `src/background/service_worker.ts` — `export_app_logs` action 参数处理
  - `tests/e2e-logging.spec.ts` — 更新运行日志导出断言

### ✅ P0.21 用户可见命名不应使用 session，应统一为 capture / 采集记录
- **状态**：已修复 — 新建采集记录 id 前缀改为 `capture_`；导出模板测试改用 `{capture_id}`；运行日志/采集导出文件名不再生成 `session`。
- **现象**：代码、导出文件名、协议参数、示例和文档中仍大量使用 `session` 表示“单次采集记录”，例如：
  - 导出文件：`capture_all_session_1781258248327_wifgs4c.json`
  - 记录 id：`session_1781258248327_wifgs4c`
  - API/测试/文档中出现 `session_id`、`export_session`、`session.export`
- **期望行为**：
  - 产品和用户可见概念统一为“采集记录”
  - 英文统一使用 `capture` / `capture record`
  - 用户可见文件名不再出现 `session`
  - 新记录 id 前缀从 `session_...` 改为 `capture_...`
  - 用户可见参数/导出字段如必须展示，应使用 `capture_id`，不使用 `session_id`
- **范围说明**：
  - 用户可见：UI 文案、导出文件名、导出内容字段、MCP/Agent 对外协议、README/docs/specs、测试 fixture 中可见样例，必须改
  - 内部实现：若短期迁移成本高，可先保留内部兼容别名，但不得泄露到用户可见输出
  - 兼容读取：旧数据中 `session_...` id 应能继续读取/展示，但新建数据必须使用 `capture_...`
- **影响**：
  - `session` 容易被理解成浏览器会话/登录会话，不符合 Capture All 的产品心智
  - 导出文件名和记录 id 与产品核心动词 `capture` 不一致
  - 后续文档、MCP 工具和用户反馈会继续混用概念
- **修复要点**：
  1. 全局审计用户可见 `session`：UI、导出文件名、导出 JSON 字段、MCP tool/action、文档、测试断言
  2. 新建采集记录 id 生成逻辑：`session_...` → `capture_...`
  3. 导出文件名模板：`capture_all_session_{...}` → `capture_all_capture_{...}` 或更简洁 `capture_all_{capture_id}_{date}`，不得含 `session`
  4. 对外 action/tool/参数：`session_id` → `capture_id`，`export_session` → `export_capture`；必要时保留旧名兼容但标记 deprecated 且不在 UI 展示
  5. 导出 JSON 顶层字段若含 `capture_id` 保持；不得新增/继续输出 `session_id`
  6. 更新所有测试，确保新建记录 id 前缀为 `capture_`，导出文件名不含 `session`
- **测试遗漏原因**：现有测试只验证导出成功和内容结构，没有断言用户可见命名禁用词；需要新增字符串审计测试，禁止 UI/导出文件名/新 id 出现 `session`。
- **影响文件**：
  - `src/background/service_worker.ts` / `src/background/exporter.ts` / `src/background/storage.ts` — id 生成、导出命名、对外字段
  - `src/agent/**` — MCP/Agent 对外 tool/action/参数命名
  - `src/dashboard/dashboard.ts` / `src/popup/popup.ts` — UI 文案和下载文件名
  - `tests/**` — `session_id` fixture、导出文件名、MCP 协议断言
  - `docs/**` — 规格和任务文档中的用户可见命名

### ✅ P0.22 所有用户可见 date 必须使用用户设置的时区
- **状态**：已修复 — 新增 `format_system_time_filename()`；导出采集记录和运行日志文件名统一使用用户设置时区，避免 UTC `Z` 文件名。
- **现象**：导出采集记录文件名中的 date 使用了默认/UTC 时间，而不是用户设置的时区时间。运行日志导出文件示例也使用 `2026-06-12T09-58-31-230Z` 这种 UTC `Z` 时间。
- **期望行为**：
  - 所有用户可见 date/time 都必须使用用户设置的时区
  - 导出采集记录文件名中的 `{date}` 使用用户设置时区格式化
  - 运行日志 `.log` 文件名、导出报告标题、Dashboard/Popup 可见时间、HTML 导出中的时间，也统一使用用户设置时区
  - 内部存储仍可保留 UTC/epoch，显示和文件名层统一格式化
- **影响**：
  - 用户按本地时间查找导出文件时会错位
  - 同一条采集记录在 UI、文件名、导出内容中可能显示不同日期
  - UTC `Z` 文件名对普通用户不直观
- **修复要点**：
  1. 找到用户设置中的时区字段/默认值，定义唯一的 display datetime formatter
  2. 所有用户可见时间入口统一调用该 formatter，不允许直接 `new Date().toISOString()` 生成展示/文件名
  3. 导出文件名 `{date}` 使用用户设置时区，并使用文件名安全格式（例如 `YYYY-MM-DD_HH-mm-ss`）
  4. 运行日志文件名改 `.log` 时同步使用用户时区
  5. 导出 JSON 内部机器字段可继续 UTC，但面向人阅读的 `exported_at_label` / HTML / log 文本必须是用户时区
  6. 补测试：设置固定时区后导出，断言文件名 date 与该时区一致，不是 UTC `Z`
- **测试遗漏原因**：现有导出测试只校验文件存在/内容结构，未设置非 UTC 时区，也未断言文件名和 UI 时间格式。
- **影响文件**：
  - `src/shared/system_time.ts` 或新增共享时间格式化模块 — 用户时区格式化
  - `src/background/exporter.ts` — 采集记录/日志导出文件名与报告时间
  - `src/dashboard/dashboard.ts` / `src/popup/popup.ts` — 用户可见时间
  - `tests/e2e-export-content.spec.ts` / `tests/e2e-logging.spec.ts` / `tests/system_time.test.ts` — 时区断言

### ✅ P0.23 采集记录详情「用户行为」标签页为空
- **状态**：已修复 — 2026-06-12 统一用户行为独立计数与事件分类兜底
- **现象**：采集记录详情中明明统计显示采到了 `23` 个用户行为，但点击「用户行为」标签页后内容区域为空，看不到任何用户行为明细。
- **期望行为**：
  - 「用户行为」标签页必须展示已采集到的全部用户行为明细
  - 计数显示多少条，列表至少能看到对应数量或可分页/可滚动查看
  - 每条用户行为应显示时间、类型、页面/元素摘要、必要 data
- **影响**：
  - 用户无法查看最核心的行为采集结果
  - 统计数字与详情内容矛盾，降低可信度
  - E2E 只验证有计数，不代表详情页可用
- **初步判断**：详情页用户行为 tab 的数据源/过滤条件可能只取了错误 category/type，或渲染函数没有处理 `user_action` 数据；也可能 all_events 合并后有数据但 tab 读取了另一个空数组。
- **修复要点**：
  1. 用复现导出或 IndexedDB 数据确认 23 条用户行为实际落在哪个 store/category
  2. 检查详情页用户行为 tab 的过滤条件和渲染入口
  3. 修复为空的渲染路径，保证 stats 与 tab 内容口径一致
  4. 空态只在真实无数据时显示，不能吞掉已有数据
  5. 补 E2E：采集用户点击/滚动/输入后，详情页「用户行为」tab 可见对应明细
- **影响文件**：
  - `src/dashboard/dashboard.ts` — 详情页 tab 数据过滤/渲染
  - `src/dashboard/dashboard-pages.css` — 用户行为列表展示样式
  - `tests/e2e-detail-tabs.spec.ts` / `tests/e2e-capture-local.spec.ts` — 用户行为明细断言

### ✅ P0.24 详情页时间线和网络请求侧面板不可拖拽调整宽度
- **状态**：已修复 — 2026-06-12 时间线 rail 与网络详情分栏均支持拖拽并记忆宽度
- **现象**：采集记录详情的「时间线」和「网络请求」标签页左侧/侧面板宽度固定，用户无法拖拽调整宽度。
- **期望行为**：
  - 时间线侧面板可拖拽调整宽度
  - 网络请求列表侧面板可拖拽调整宽度
  - 拖拽时右侧详情区域自适应填满剩余空间
  - 宽度应有合理 min/max，避免拖到不可用
  - 如已支持本地设置，宽度可记忆；若没有，至少当前页面会话内有效
- **影响**：
  - 请求 URL、时间线摘要较长时无法阅读
  - 大屏空间不能充分利用
  - 右侧详情和左侧列表的布局关系不清晰
- **修复要点**：
  1. 抽出可复用 split-pane 布局或在两个 tab 内实现一致拖拽条
  2. 左侧 pane 设置 min/max width，右侧 `min-width: 0` 并占满剩余空间
  3. 拖拽期间禁用文本选择，结束后恢复
  4. 支持键盘/无障碍基础行为，至少保证不破坏现有点击选择
  5. 补 E2E：拖拽分隔条后，左 pane 宽度变化，右 pane 仍可见
- **影响文件**：
  - `src/dashboard/dashboard.ts` — split-pane 事件绑定/状态
  - `src/dashboard/dashboard-pages.css` — split-pane 布局和拖拽条
  - `tests/e2e-detail-tabs.spec.ts` — 拖拽宽度断言

### ✅ P0.25 网络请求详情布局错误：右侧为空，应左列表右详情并占满空间
- **状态**：已修复 — 2026-06-12 网络 tab 改为左列表右详情，默认选中首条请求
- **现象**：网络请求标签页当前侧面板显示请求列表，但中间/右侧请求详细信息区域为空或没有正确占满空间。用户期望右侧展示选中请求的完整详细记录。
- **期望行为**：
  - 网络请求 tab 使用明确左右分栏
  - 左侧：网络请求列表，显示全部请求，可滚动，可选中
  - 右侧：选中请求的详细记录，占满剩余空间
  - 默认选中第一条请求，避免右侧初始为空
  - 点击不同请求时，右侧详情同步更新
  - 详情应包含 method、url、status、resource_type、headers、request/response body、body_capture_status 等关键字段
- **影响**：
  - 用户看到请求列表但无法查看详情，网络采集价值大幅下降
  - 空白右侧浪费空间，像功能未完成
  - 与用户心理模型不一致：列表应该驱动详情面板
- **修复要点**：
  1. 检查网络请求 tab 当前 DOM 结构，明确左列表和右详情容器
  2. 默认选中第一条 network request 并渲染详情
  3. 点击列表项时更新 selected request 和右侧详情
  4. 右侧详情容器使用 `flex: 1; min-width: 0; overflow: auto` 填满剩余空间
  5. 与 P0.24 侧栏拖拽联动，拖拽只改变左列表宽度，右详情自动占满
  6. 补 E2E：网络 tab 有请求时右侧非空；点击第二条后详情内容变化
- **影响文件**：
  - `src/dashboard/dashboard.ts` — 网络请求选择态与详情渲染
  - `src/dashboard/dashboard-pages.css` — 网络分栏布局
  - `tests/e2e-detail-tabs.spec.ts` / `tests/e2e-network.spec.ts` — 网络详情交互断言

### ❌ P0.26 采集完成后的操作按钮应拆成「查看」和「导出」
- **状态**：未修复 — 2026-06-12 用户提出
- **现象**：采集完成后当前只有一个「查看详情」入口，查看与导出操作没有分开。
- **期望行为**：
  - 采集完成状态展示两个独立按钮：「查看」和「导出」
  - 「查看」打开采集详情页
  - 「导出」直接触发采集数据导出
  - 两个按钮文案简洁，避免把导出能力藏在详情页内
- **影响**：
  - 用户完成采集后不能直接导出，需要额外进入详情页
  - 查看与导出是不同意图，单按钮降低操作效率
- **修复要点**：
  1. 检查 popup 采集完成状态的按钮结构与事件绑定
  2. 将现有「查看详情」拆为「查看」和「导出」
  3. 保持「查看」行为不变
  4. 「导出」复用现有导出逻辑，默认导出用户当前配置格式或产品默认格式
  5. 补测试：采集完成态同时出现「查看」「导出」两个按钮，点击分别触发对应动作
- **影响文件**：
  - `src/popup/popup.ts` — 完成态按钮渲染与事件绑定
  - `src/popup/popup.html` / `src/popup/popup.css` — 如按钮布局需要调整
  - `tests/popup_layout.test.ts` 或 E2E popup 测试 — 完成态按钮断言

### ❌ P0.27 导出采集记录和运行日志应分别记住上次导出位置
- **状态**：未修复 — 2026-06-12 用户提出
- **现象**：导出采集记录和导出运行日志每次都重新选择位置，没有分别沿用上次导出目录。
- **期望行为**：
  - 采集记录导出记住上次使用的位置
  - 运行日志导出记住上次使用的位置
  - 两类导出位置分别记录，互不覆盖
  - 下次导出同类内容时默认使用对应上次位置
- **影响**：
  - 重复导出时操作成本高
  - 采集记录与运行日志用途不同，混用导出位置会干扰用户整理文件
- **修复要点**：
  1. 检查当前 `chrome.downloads.download` 的 filename/saveAs 逻辑
  2. 为采集记录和运行日志分别持久化最近导出目录或相对路径前缀
  3. 下次同类导出时复用对应位置
  4. 补测试：两类导出分别保存并读取各自上次位置，互不覆盖
- **影响文件**：
  - `src/shared/export_settings.ts` — 导出路径配置结构
  - `src/background/exporter.ts` / `src/dashboard/dashboard.ts` — 导出 filename 生成与保存
  - `tests/export_settings.test.ts` 或导出相关测试 — 位置记忆断言

### ✅ P0.29 停止采集 flush_all 时 IndexedDB 写入失败：key path 未 yield 值
- **状态**：已修复 — `48fab6e`
- **复现日志**：`data/capture_all_logs_2026-06-12_19-05-43.log` line 41
- **现象**：停止采集时 `flush_all` 调用 `store.put()` 抛出 `DataError`：
  ```
  Failed to execute 'put' on 'IDBObjectStore': Evaluating the object store's key path did not yield a value.
  ```
  Stack trace指向 `app_log_storage.ts` 的 flush 路径，发生在 `Promise.all` 批量写入期间。
- **影响**：flush 失败导致部分数据可能未持久化到 IndexedDB，日志/采集数据丢失风险。当前日志显示 stop 流程继续执行（Recording stopped），但 `data` 写入可能不完整。
- **初步判断**：`app_log_storage.ts` 的 flush buffer 中某条记录的 key path 字段为 `undefined` 或缺失，导致 `put` 操作失败。可能原因：
  1. 日志条目 `id` 字段未生成（keyPath: `id`）
  2. buffer 中存在空对象或结构不完整的记录
  3. 并发写入时某条记录被清空或覆盖
- **修复要点**：
  1. 定位 `app_log_storage.ts` flush 逻辑，在 `put` 前校验每条记录 key path 字段非空
  2. buffer 写入处增加 schema 校验，防止空记录进入 buffer
  3. flush 失败时逐条重试，跳过问题记录而非整批失败
  4. 补单测：flush 含空 id 的记录时不应整批失败
- **影响文件**：
  - `src/background/app_log_storage.ts` — flush buffer + put 校验
  - `tests/app_log_storage.test.ts` — 边界条件测试

### ✅ P0.30 控制台采集为零：console capture 已启动但无事件记录
- **状态**：已修复 — `48fab6e`
- **复现文件**：`data/capture_all_capture_1781262222966_2lkg3rn.json`
- **现象**：日志显示 console capture 正常启动（`Console capture started {"tab_id":1793063486,"already_attached":true}`），但导出 JSON 中 `console_events` 数组长度为 0。采集期间访问的是 opencode.ai（生产网站），应有控制台输出。
- **期望行为**：`console_events` 数组应包含采集期间页面产生的 console.log/warn/error 等记录。
- **初步判断**：
  1. CDP `Runtime.consoleAPICalled` 或 `Log.entryAdded` 事件可能未正确监听
  2. console handler 回调可能未正确关联（参考 P0.13 CDP 重试回调不匹配）
  3. `handle_console_log` 写入的 store 与导出查询的 store 可能不一致
  4. `capture_id` 未设置导致查询返回空（参考 P0.9 Bug A）
- **修复要点**：
  1. 检查 console_capture 的 CDP 事件监听是否与 `handle_console_log` 回调正确绑定
  2. 验证 console 事件写入时 `capture_id` 已设置
  3. 在已采集的 opencode.ai 页面上手动复现，确认 `Runtime.consoleAPICalled` 事件是否触发
  4. 补 E2E：验证 console_events 数组非空
- **影响文件**：
  - `src/background/console_capture.ts` — CDP 事件监听
  - `src/background/service_worker.ts` — handle_console_log + capture_id 设置
  - `tests/e2e-console-errors.spec.ts` / `tests/e2e-capture-local.spec.ts` — console_events 非空断言

### ✅ P0.31 网络请求 resource type 全部为 unknown
- **状态**：已修复 — `48fab6e`
- **复现文件**：`data/capture_all_capture_1781262222966_2lkg3rn.json`
- **现象**：导出 JSON 中 193 条 `network_requests` 的 `type` 字段全部为 `"unknown"`。实际请求包括 XHR/Fetch（API 调用）、Script（JS 文件）、Stylesheet（CSS 文件）、Font（字体）、Document（HTML 页面）等多种类型，但无一正确分类。
- **期望行为**：每条 network request 的 `type` 应反映实际资源类型，如 `xhr`、`fetch`、`script`、`stylesheet`、`font`、`document`、`image`、`media` 等，与 Chrome DevTools Network 面板一致。
- **影响**：
  - 网络请求列表无类型过滤/分组能力
  - 数据分析无法按资源类型聚合
  - Dashboard 网络 tab 的 type 列无意义
- **初步判断**：
  1. `build_network_event` 未从 webRequest `details` 提取 `type`（`details.type` 包含 `xmlhttprequest`/`script`/`stylesheet` 等）
  2. CDP 路径（`Network.requestWillBeSent`）有 `type` 但未传递到 `NetworkRequestData`
  3. `NetworkRequestData.type` 字段存在但从未被赋值
- **修复要点**：
  1. webRequest 路径：`build_network_event` 从 `details.type` 取值并映射到标准类型名
  2. CDP 路径：从 `Network.requestWillBeSent.params.type` 取值
  3. 统一类型名称映射表（webRequest 用 `xmlhttprequest`，CDP 用 `XHR`，统一为 `xhr`）
  4. 补单测：给定不同 `details.type`，验证输出 `type` 字段正确
- **影响文件**：
  - `src/background/network_capture.ts` — build_network_event + CDP meta
  - `src/shared/types.ts` — 可能需新增类型映射常量
  - `tests/network_capture.test.ts` — type 字段测试

### ✅ P0.32 采集记录元数据缺失 url 和 tab_title
- **状态**：已修复 — `48fab6e`
- **复现文件**：`data/capture_all_capture_1781262222966_2lkg3rn.json`
- **现象**：导出 JSON 顶层 `capture.url` 和 `capture.tab_title` 均为 `undefined`。日志显示采集期间有多次 `Tab URL changed` 事件（从 `localhost:20224` → `opencode.ai/` → `opencode.ai/zh/go` → `opencode.ai/workspace/...`），但最终的 capture 元数据没有记录初始 URL 和页面标题。
- **期望行为**：`capture.url` 应为采集开始时活动 tab 的 URL，`capture.tab_title` 应为对应页面的标题。
- **影响**：
  - 采集记录列表无法显示来源 URL
  - 导出数据丢失关键上下文信息
  - Dashboard 会话列表显示空白 URL
- **初步判断**：`current_capture` 创建时（`start_capture`）未从活动 tab 提取 `url`/`title` 写入元数据。`session_manager.create_capture()` 可能未接收或未设置这些字段。
- **修复要点**：
  1. `start_capture` 创建采集记录时查询活动 tab 的 url 和 title
  2. 写入 `current_capture.url` 和 `current_capture.tab_title`
  3. 补单测：创建 capture 后验证 url/title 非空
- **影响文件**：
  - `src/background/service_worker.ts` — start_capture
  - `src/background/session_manager.ts` — create_capture
  - `tests/session_manager.test.ts` — url/title 字段验证

### ✅ P0.33 导出采集记录 JSON 中时间字段容易误读为未跟随浏览器时区
- **状态**：已修复 — 3e73aaa
- **修复**：导出数据新增强 `start_time_label`/`end_time_label`/`absolute_time_label` 人读字段（含 `UTC±N` 时区标注），原始 UTC 字段（`started_at`/`ended_at`/`absolute_time`）保留为机器字段。新增 8 条 P0.33 断言验证 labels 不包含 `Z` 后缀。
- **复现文件**：`data/capture_all_capture_1781262222966_2lkg3rn.json`
- **现象**：导出 JSON 中 `started_at`、`ended_at`、`created_at`、`updated_at`、`absolute_time` 等字段仍是 UTC ISO 字符串（例如 `2026-06-12T11:03:42.967Z`），用户已设置「跟随浏览器」后仍容易认为导出时间没有按浏览器时区显示。
- **当前行为说明**：导出中已追加 `start_time_system_time`、`end_time_system_time`、`absolute_time_system_time` 等用户时区字段，内部机器字段仍保留 UTC。
- **期望行为**：
  - 导出采集记录里面向用户阅读的时间字段必须明显使用用户设置时区
  - UTC 机器字段如继续保留，命名/分组/文档必须明确标识为原始 UTC，避免用户误读
  - JSON 导出可增加统一的 `*_time_label` / `*_system_time` 字段，或调整结构把人读时间放在更显眼位置
  - 日志文本、HTML 导出、文件名继续使用用户设置时区
- **影响**：
  - 用户看到 `Z` 时间后会判断「跟随浏览器」未生效
  - 导出数据同一时间存在 UTC 与本地时间两套字段，缺少清晰语义
- **修复要点**：
  1. 明确导出 JSON 时间字段策略：机器字段 UTC、人读字段用户时区，或全部人读化
  2. 为 capture / event / network / console 统一补充用户时区 label 字段
  3. 如保留 UTC 字段，在字段名或文档中明确 `*_utc` / raw timestamp 语义
  4. 补测试：设置 `system_time_timezone: 'browser'` 或固定偏移后，导出 JSON 中人读字段符合设置且不出现误导性命名
- **影响文件**：
  - `src/shared/system_time.ts` — 时间字段转换与命名
  - `src/background/exporter.ts` — JSON/JSONL/HTML/log 导出时间输出
  - `src/shared/types.ts` — 如调整导出字段类型
  - `tests/system_time.test.ts` / `tests/export_settings.test.ts` — 导出时间字段断言

### ✅ P0.34 系统时区选项应使用固定 UTC 偏移而不是城市时区
- **状态**：已修复 — 3e73aaa
- **修复**：`SystemTimeTimezone` 扩展为 browser/UTC/UTC±1..±12。`format_system_time` 手动计算 UTC 偏移时间（`Intl.DateTimeFormat` 不支持 `UTC+8` 等 IANA timeZone）。设置页下拉替换为固定偏移选项，无城市名。新增 `parse_utc_offset` + `migrate_iana_timezone`（含完整 IANA→UTC 偏移映射表）。新增 24 条 P0.34 断言。
- **现象**：设置页「系统时区」当前选项类似 `跟随浏览器`、`UTC`、`Asia/Shanghai`，暴露 IANA 城市时区，不符合用户预期。
- **期望行为**：
  - 选项应为 `跟随浏览器`、`UTC`、`UTC+1`、`UTC+2` ... `UTC+12`、`UTC-1` ... `UTC-12`
  - `跟随浏览器` 使用当前浏览器/系统本地时区
  - `UTC±N` 使用固定 UTC 偏移，不绑定城市，不受夏令时影响
  - UI 文案不出现 `Asia/Shanghai` 等城市时区名
  - 导出文件名、HTML、日志、`*_system_time` 字段都按该设置格式化
- **影响**：
  - 城市时区不直观，用户想选固定偏移时无法表达
  - 固定偏移与 IANA 时区含义不同，夏令时地区可能产生非预期变化
- **修复要点**：
  1. 扩展 `SystemTimeTimezone` 类型，支持 `UTC+N` / `UTC-N` 固定偏移
  2. 设置页下拉框改为固定 UTC 偏移选项，不展示城市名
  3. `format_system_time()` 支持固定偏移计算，不能直接把 `UTC+8` 当 `Intl` IANA `timeZone`
  4. 迁移旧配置：`Asia/Shanghai` 可映射为 `UTC+8`，未知旧值回退 `browser`
  5. 补测试：`UTC+1`、`UTC+8`、`UTC-5` 格式化结果正确，且文件名使用对应偏移时间
- **影响文件**：
  - `src/shared/types.ts` — `SystemTimeTimezone` 类型
  - `src/shared/system_time.ts` — 固定 UTC 偏移格式化
  - `src/shared/user_config.ts` / `src/shared/constants.ts` — 默认值与旧配置迁移
  - `src/dashboard/dashboard.ts` / `src/shared/i18n.ts` — 设置页选项和文案
  - `tests/system_time.test.ts` / `tests/export_settings.test.ts` — 偏移时区断言

### ❌ P0.28 运行日志导出默认格式错误：现在默认是 `.txt`，应为 `.log`
- **状态**：未修复 — 2026-06-12 用户反馈
- **现象**：运行日志导出时，浏览器保存对话框里的默认文件类型/扩展名是 `.txt`，不是用户要求的 `.log`。
- **期望行为**：
  - 运行日志导出的默认文件名必须以 `.log` 结尾
  - 浏览器保存对话框默认也应体现 `.log`，不能让用户每次手动改扩展名
  - 导出内容保持人可读日志文本
  - 不再出现 `.txt`、`.json` 或 `.jsonl` 作为运行日志默认导出格式
- **测试遗漏原因**：
  - 现有测试没有模拟 `chrome.downloads.download` 并断言最终传入的 `filename`
  - 现有测试没有覆盖浏览器下载保存对话框中用户实际看到的默认扩展名
  - 旧 E2E 仍偏向旧的 JSON/JSONL 日志导出入口或内容校验，没有覆盖“运行日志默认扩展名必须是 `.log`”这个用户可见结果
- **我刚才误判的问题**：
  - 只看源码/构建产物里某个路径出现 `.log`，不能证明用户实际导出默认就是 `.log`
  - 不能把问题写成“可能已有 `.log` 只是测试缺口”；用户反馈的事实是“现在默认是 `.txt`”
  - 修复前必须以真实下载行为为准，而不是只用源码字符串搜索下结论
- **影响**：
  - 文件类型不符合用户预期
  - 用户需要每次手动改扩展名
  - 下游按 `.log` 识别和归档会失败
- **修复要点**：
  1. 复现运行日志导出，确认保存对话框默认文件名/扩展名为何是 `.txt`
  2. 查找所有运行日志导出入口，确认最终传给 `chrome.downloads.download` 或浏览器下载 API 的 filename
  3. 将运行日志导出默认 filename 统一为 `.log`
  4. 补测试：实际下载参数 filename 必须以 `.log` 结尾，且不得出现 `.txt`
  5. 如单元测试无法覆盖保存对话框默认扩展名，补 E2E/集成测试或文档说明验证方式
- **影响文件**：
  - `src/background/exporter.ts` — 运行日志内容和文件名
  - `src/dashboard/dashboard.ts` — 运行日志下载入口
  - `tests/export_settings.test.ts` / dashboard 导出测试 / E2E 下载测试 — filename 扩展名断言

---

## ✅ 用户加的bug记录（全部已修复）

以下 bug 都要找原因为什么测试没有发现，测试有问题就补测试，文档有问题就改文档，最后才是改代码解决 bug。我要的是这次错了修正后以后不再犯。

### ✅ Bug 1: 网络请求数量统计到了但时间序列显示为 0
- **状态**：已修复。`get_capture_data()` 的 `all_events` 此前不含 network_requests 和 console_events，stats 统计正确但 timeline/rail/trace 视图计数为 0
- **根因**：`service_worker.ts:170` — `all_events` 拼合时遗漏了 network_requests 和 console_events 两个专用数组
- **测试遗漏原因**：单元测试只验证 stats 计数器（`request_count++`），E2E 只验证概览面板 stats 数值。无测试验证 `get_capture_data().events` 包含 network/console 事件
- **修复**：将 network/console 事件映射为 CaptureEvent 结构合入 all_events

### ✅ Bug 2: 深色模式下多处文本为黑色
- **状态**：已修复。`body.dash` 缺少 `color: var(--ink)`，所有未显式设颜色的后代继承浏览器默认 `#000`
- **根因**：`dashboard.css:4` — `body.dash` 无 `color`；`.cap-stat-val` 无 `color`；`select#dtExportFmt` 内联样式无 `color`；`.pg-title h1` 无 `color`
- **测试遗漏原因**：`e2e-theme-i18n.spec.ts` 只验证 `data-theme` 属性和 `--canvas` 变量变化，不验证任何元素的 `getComputedStyle().color`
- **修复**：`body.dash`、`.cap-stat-val`、`.set-section > h2` 添加 `color: var(--ink)`；`select#dtExportFmt` 内联样式添加 `color:var(--ink)`

### ✅ Bug 3: 导出不弹保存对话框
- **状态**：已修复。Dashboard 3 处导出入口用 `<a>` + `click()` 触发下载，绕过 `chrome.downloads.download` 及其 `saveAs` 参数
- **根因**：`dashboard.ts` — `export_session()` 和两个日志导出 handler 全部使用 `<a>` download 模式
- **测试遗漏原因**：E2E 导出测试通过 `chrome.runtime.sendMessage` 直接在内存中校验内容，不触发实际下载路径
- **修复**：全部改用 `chrome.downloads.download({ url, filename, saveAs: user_config.export_save_as })`

### ✅ Bug 4: 主面板设置文本深色模式下黑色
- **状态**：同 Bug 2 修复。`.set-section > h2`（通用/采集默认值等标题）无 `color`，继承黑色
- **修复**：`.set-section > h2` 添加 `color: var(--ink)`

### ✅ Bug 5: 弹出窗口采集中文案溢出按钮
- **状态**：已修复。`.actbtn` 的 `white-space: nowrap` 阻止换行，停止按钮内容（glyph 32px + timer ~88px + hint ~46px + gaps ~20px）超出 flex 分配的 168px
- **根因**：`popup.css:69` — `white-space: nowrap` 阻止换行；按钮 3 个子元素横向排列总宽超出
- **测试遗漏原因**：`popup_layout.test.ts` 只验证宽度 = 300px，不检查 `scrollWidth > clientWidth`；E2E 停止测试只验证按钮可点击
- **修复**：`.act-stop` 改为 `flex-direction: column; white-space: normal`，HTML 改为第一行计时器 + 第二行图标+提示


---

## P1 · 命名统一（record/记录/录制 残留）

### ✅ 1.1 console.log 中的 Record All
- **状态**：已修复。全项目 console.log/warn/error 前缀已统一为 `Capture All:`，无需变更
- **文件**：`src/background/service_worker.ts`、`src/background/session_manager.ts`、`src/background/keepalive.ts`、`src/background/exporter.ts`、`src/content/content_script.ts`、`src/devtools/devtools.ts`、`src/devtools/devtools_panel.ts`

### ✅ 1.2 DevTools HTML 标题
- **状态**：已修复。`devtools.html` 标题已为 `Capture All DevTools`，`devtools_panel.html` 标题已为 `Capture All DevTools Panel`，h1 已为 `Capture All Panel`

### ✅ 1.3 导出报告 HTML 模板
- **状态**：已修复。exporter.ts HTML 模板 `Record All` → `Capture All`，HAR creator name `record_all` → `capture_all`

### ✅ 1.4 keepalive alarm 名称
- **状态**：已修复。`keepalive.ts` alarm 名称已为 `capture_all_keepalive`

### ✅ 1.5 Agent Bridge / MCP 名称
- **状态**：已修复。bridge 输出已为 `capture-all bridge`，MCP server name 已为 `capture-all`，环境变量 `RECORD_ALL_BRIDGE_URL/TOKEN` → `CAPTURE_ALL_BRIDGE_URL/TOKEN`

### ✅ 1.6 Content script 内部 SIGNAL 常量
- **状态**：已修复。`storage_capture.ts`、`network_hook.ts`、`xhr_fetch_capture.ts` 中所有 SIGNAL 常量已使用 `__capture_all_*__` 前缀

### ✅ 1.7 i18n 中文「记录」残留
- **状态**：已修复。`i18n.ts` zh 中 `noSessions: '暂无采集记录'` → `'暂无采集'`

### ✅ 1.8 Dashboard placeholder 文字
- **状态**：已修复。`dashboard.ts` placeholder 已为 `capture-all/exports`

---

## P2 · Popup 窗口问题

### 2.1 ✅ Popup 出现滑动条
- **状态**：已修复
- **根因**：mcard min-height 92px + action height 108px + body padding 16px + gap 15px 导致总高 ≈702px，超过 Chrome popup 600px 上限
- **修复**：phead 缩窄（padding 11/12）、mcard min-height 62px、action height 88px、body padding 12px/gap 10px、recent list 压缩。3 条 recent 时总高 ≈550px，远低于 600px 上限

### 2.2 ✅ Popup 窗口过大
- **状态**：已修复。宽度 400px → 300px。高度不写死，根据内容自适应

### 2.3 ✅ Recent 列表「查看全部」与「查看详情」纵向对齐
- **状态**：已修复。`.recent-hd` 添加 `padding: 0 4px`，与 `.recent-row` 的 right padding 一致，右边缘对齐

### 2.4 ✅ Header 元素纵向居中
- **状态**：已修复。`.phead` 使用 `display: flex; align-items: center`，所有子元素已纵向居中

### 2.5 ✅ 最近采集最多 3 条
- **状态**：已修复。`popup.ts` `recent_list()` 已使用 `slice(0, 3)` 限制最多 3 条

---

## P1.5 · 七标签一致性问题

### 1.5.1 ✅ 深色模式文字颜色
- **状态**：已修复。`detail.css` 添加 `[data-theme="dark"]` 覆盖规则：timeline badge 背景/文字颜色、console item 背景、console-level 文字、method-badge 颜色、filter 输入框。`popup.css` / `dashboard.css` 已使用 `design_tokens.css` 变量，无需额外修复

### 1.5.2 ✅ 七标签名称/顺序/数据三端不一致
- **状态**：已修复。三端统一为：用户行为、页面导航、网络请求、控制台、错误异常、Storage、Cookie
  - `popup.ts` CAPTURE 数组（已有正确顺序）
  - `detail.ts` render_overview 新增 navCount/errorCount/storageCount/cookieCount
  - `detail.html` 新增对应 span 元素
  - `dashboard.ts` detail_metrics 重写为 7 标签匹配 popup，移除 DOM 变化/导航（衍生数据）

### 1.5.3 ✅ Cookie 弹出面板统计错误
- **状态**：已修复。`service_worker.ts` handle_event 新增 `cookie_change_count` 递增（category === 'cookie' 时）
  - 同时修复：`error_count`（category === 'error'）、`storage_change_count`（category === 'storage'，之前错误地绑定在 input_event）

### 1.5.4 ✅ 采集详情数据与弹出面板不一致
- **状态**：已修复。`detail.ts` render_overview 现在展示全部 7 个 stats 字段，与 popup 口径一致

### 1.5.5 ✅ 时间线概览缺少七标签 + 配置
- **状态**：已修复。dashboard 概览 tab 新增「七标签概览」区块，列出全部 7 标签及计数。配置 tab（本次配置）已存在

### 1.5.6 ✅ 标签无动画变化
- **状态**：已修复。`popup.css` .mcard 添加 transition（opacity/filter/transform/border-color/box-shadow）+ hover 上移效果。`dashboard-pages.css` .dt-metric transition 扩展为完整属性列表

---
	

## P1.6 · UI 与数据新问题

> 记录于 2026-06-09。以下问题均为用户实测发现，待分析修复。

### ✅ 1.6.1 采集中「实时详情」按钮溢出弹窗边界
- **状态**：已修复 — `781711a`。`.stop-time` 22px→18px, `.stop-hint` 13px→11.5px, `.actbtn` 加 `min-width:0` + `padding` 压缩

### ✅ 1.6.2 实时详情页不自动刷新
- **状态**：已修复。`dashboard.ts` 轮询中增加 detail 页面判断，采集中自动 reload_detail()

### ✅ 1.6.3 深色模式部分文字仍为黑色（残留）
- **状态**：已修复 — `a52f196`。`design_tokens.css` 添加 `--indigo-ink`/`--cyan-ink`/`--yellow-ink`，dark 覆盖全部 9 色

### ✅ 1.6.4 Dashboard 时间线标签名与数据标签不对齐
- **状态**：已修复 — `e292823`。「网络」→「网络请求」，「导航」→「页面导航」

### ✅ 1.6.5 记录详情 — 网络请求列表点击无详情
- **状态**：已修复 — `290454d`。网络行加 `data-netidx` + 点击 handler + 右侧详情面板

### ✅ 1.6.6 记录详情「本次配置」只显示 5 个开关
- **状态**：已修复 — `cd6b722`。config_snapshot 保存全部 7 标签 toggle，配置页三区分离

### ✅ 1.6.7 扩展运行日志导出为空
- **状态**：已修复 — `46a0979`。app_log_storage 每次 write 都 schedule_flush + exporter 查询前 flush buffer

### ✅ 1.6.8 导出文件 capture.tags 为空数组
- **状态**：已修复 — `5fb5159`。popup.ts + service_worker.ts：从 toggle/config 构建中文标签写入 capture.tags

### ✅ 1.6.9 打包生成的扩展名字和介绍未更新
- **状态**：已修复。manifest.json `description` 更新，`name` 已为 "Capture All"

## P1.7 · E2E 采集数据验证测试

> 测试计划：`docs/E2E_GAP.md`
> 现状：25 个 E2E 测试文件全部只测 UI 渲染和按钮状态切换，零个验证采集数据字段完整性。

### ✅ P1.7.0 测试基础设施 — 本地测试页面 + 服务器
- **状态**：已完成
- **内容**：
  - `tests/fixtures/test-page.html`：确定性测试页面（console/fetch/cookie/localStorage/按钮/错误）
  - `tests/fixtures/server.ts`：Node.js HTTP 静态服务器，端口 17832，`GET /api/test` 返回固定 JSON
  - `package.json` 新增 `test:e2e:server` 脚本

### ✅ P1.7.1 e2e-capture-baidu — 百度全开采集字段结构验证
- **状态**：已完成
- **文件**：`tests/e2e-capture-baidu.spec.ts`

### ✅ P1.7.2 e2e-capture-local — 本地页面全开采集结构+内容验证
- **状态**：已完成
- **文件**：`tests/e2e-capture-local.spec.ts`

### ✅ P1.7.3 e2e-toggle-effects — 弹窗 8 开关功能验证
- **状态**：已完成
- **文件**：`tests/e2e-toggle-effects.spec.ts`

### ✅ P1.7.4 e2e-cdp-retry — CDP 重试验证
- **状态**：已完成
- **文件**：`tests/e2e-cdp-retry.spec.ts`

### ✅ P1.7.5 e2e-settings-effects — 设置子开关验证
- **状态**：已完成
- **文件**：`tests/e2e-settings-effects.spec.ts`

### ✅ P1.7.6 e2e-cycle-integrity — 多轮采集数据隔离
- **状态**：已完成
- **文件**：`tests/e2e-cycle-integrity.spec.ts`

### ✅ P1.7.7 e2e-export-content — 导出内容正确性
- **状态**：已完成
- **文件**：`tests/e2e-export-content.spec.ts`

---
## P3 · 已完成的 Demo 对齐项（仅供参考）

<details>
<summary>点击展开已完成的改动</summary>

- Popup: 删除 CaptureMode 类型、mode_badge 函数、最近采集模式徽章
- Popup CSS: panelbtn 背景改 surface，主色 purple→blue，删除 .badge/[data-density]
- Dashboard: 删除深度采集卡/当前采集中卡/模式列/模式筛选/详情 header mode chip/设置默认模式
- Dashboard: 删除 mode_kind 函数、.chip[data-mode] CSS
- i18n: 删除 8 个 mode key，录制→采集
- Detail: 标题改 Capture All，删除 mode 和 bodyCapture UI
- Constants: DB_NAME → capture_all_db，导出文件名模板同步

</details>

---

## P4 · E2E 测试（Playwright + 真实网站）

> 策略：每个网站独立 spec，4 worker 并发。全部使用 `launchPersistentContext` 加载 `artifacts/dist/` 真实扩展。
> 网站：`baidu.com` `toutiao.com` `qq.com` `sina.com`
> 目标：覆盖 PRD 全部 7 个用户故事，每个 P0 缺陷有至少一个 E2E 验证。

### ✅ P4.1 完整采集流程 — baidu.com
- **状态**：已完成 — `9ea03aa`
- **文件**：`tests/e2e-baidu.spec.ts`
- 启动扩展 → 打开 popup → 点击开始采集 → 打开 baidu.com 搜索 → 验证 7 标签计数 > 0 → 停止 → 验证完成状态 → 进入 dashboard 时间线有事件

### ✅ P4.2 完整采集流程 — toutiao.com
- **状态**：已完成 — `9ea03aa`

### ✅ P4.3 完整采集流程 — qq.com
- **状态**：已完成 — `9ea03aa`

### ✅ P4.4 完整采集流程 — sina.com
- **状态**：已完成 — `9ea03aa`

### ✅ P4.5 弹出窗口三状态切换
- **状态**：已完成 — `9ea03aa`

### ✅ P4.6 七标签实时计数（修复 P0.1）
- **状态**：已完成 — `9ea03aa`

### ✅ P4.7 停止采集按钮（修复 P0.2）
- **状态**：已完成 — `9ea03aa`

### ✅ P4.8 实时详情不为空（修复 P0.3）
- **文件**：`tests/e2e-realtime-detail.spec.ts`
- 采集中点「实时详情」→ dashboard 时间线有事件 → 网络 Tab 有请求 → 控制台 Tab 有日志

### ✅ P4.9 Popup/Dashboard 七标签一致性
- **文件**：`tests/e2e-consistency.spec.ts`
- 完成采集 → 记录 popup 7 标签名+计数 → dashboard 对比 → 名称/顺序/计数完全一致

### ✅ P4.10 主面板采集记录列表
- **文件**：`tests/e2e-dashboard-list.spec.ts`
- 完成 3 次采集 → dashboard 列表显示 3 条 → 无"模式"列 → 无模式筛选 → 无"当前采集中"卡片

### ✅ P4.11 主面板采集详情各 Tab
- **文件**：`tests/e2e-detail-tabs.spec.ts`
- 概览/时间线/网络/控制台/Storage/Cookie 各 Tab 切换 → 均有内容 → 面包屑可返回

### ✅ P4.12 导出四格式
- **状态**：已完成 — `9ea03aa`

### ✅ P4.13 UI 审计：旧概念残留
- **状态**：已完成 — `9ea03aa`

---

## P5 · E2E 增强测试

### ✅ P5.1 并发多 Tab 采集
- **文件**：`tests/e2e-concurrent.spec.ts`
- baidu + toutiao 同时采集 → 两 tab 事件分别有不同 `tab_id` → 时间线合并

### ✅ P5.2 网络请求完整字段 + 脱敏
- **文件**：`tests/e2e-network.spec.ts`
- toutiao.com 触发大量请求 → method/URL/status/duration/resource_type 完整 → Authorization/Cookie header → `[REDACTED]`

### ✅ P5.3 Console 与 Error 分离
- **文件**：`tests/e2e-console-errors.spec.ts`
- 注入 `console.error()` + `throw new Error()` → 前者在 console Tab → 后者在 error Tab → 分类正确

### ✅ P5.4 HTML XSS 深度测试
- **文件**：`tests/e2e-xss.spec.ts`
- 触发含 `<script>alert(1)</script>` 事件 → 导出 HTML → Playwright 打开无脚本执行

### ✅ P5.5 MCP Agent 全流程
- **文件**：`tests/e2e-mcp-full.spec.ts`
- Bridge 启动 → MCP start → 操作网站 → sources.list 7 源 → timeline.list 有数据 → records.list 分类查询 → export → 无效 token 401

### ✅ P5.6 主题 + i18n
- **文件**：`tests/e2e-theme-i18n.spec.ts`
- 浅色/深色/跟随系统 → `--canvas` 变化 → 中/英切换 → 按钮文字同步

---

## P6 · 单元测试补充

### ✅ P6.1 七标签计数计算
- **状态**：已完成 — `5a0c55a`

### ✅ P6.2 stop_capture 消息协议
- **状态**：已完成 — `5a0c55a`

### ✅ P6.3 实时数据查询
- **状态**：已完成 — `tests/live_data_queries.test.ts`
- 活跃采集 `list_events`/`list_network` 返回实时数据 → 完成后返回全量 → 模拟 get_capture_data 合并 7 category 行为

### ✅ P6.4 UI 字符串审计
- **状态**：已完成 — `5a0c55a`

### ✅ P6.5 Popup 布局计算
- **状态**：已完成 — `tests/popup_layout.test.ts`
- 三状态操作区 88px → 卡片总高 ≤ 590px → 三列网格 → 宽度 300px

---

## P7 · 日志系统

> 方案详见 `docs/specs/logging_system.md`

### ✅ P7.1 日志基础设施
- **状态**：已实施 — Logger 类 + MessageLogTransport + IndexedDBLogTransport + 类型/常量扩展
- **文件**：`src/shared/logger.ts`（新建）、`src/background/app_log_storage.ts`（新建）
- `Logger` 类：`debug/info/warn/error` 四级，级别门控，自动捕获 error stack
- `LogTransport` 接口：`IndexedDBLogTransport`（SW/dashboard/popup 直写 IndexedDB）+ `MessageLogTransport`（content script 经 SW 中继）
- `UserConfig` 扩展：`log_level`（默认 `warn`）+ `log_max_entries`（默认 10000）

### ✅ P7.2 DB 迁移 v2 → v3
- **状态**：已实施
- **文件**：`src/background/storage.ts`、`src/shared/constants.ts`
- 新增 `app_logs` store（keyPath: `id`，indexes: `timestamp`/`level`/`module`）
- `DB_VERSION` 2 → 3，`STORE_NAMES` 加 `APP_LOGS`

### ✅ P7.3 日志导出 API
- **状态**：已实施
- **文件**：`src/background/exporter.ts`、`src/background/service_worker.ts`
- `export_app_logs(options)` 支持 JSON/JSONL，按 level/module/时间范围筛选
- SW 新 action：`export_app_logs` / `clear_app_logs` / `app_log_batch` / `get_app_log_count` / `set_log_level`
- `clear_app_logs()` 清空 app_logs store

### ✅ P7.4 诊断日志设置页面
- **状态**：已实施
- **文件**：`src/dashboard/dashboard.ts`
- 设置导航加「诊断日志」section
- 日志级别 segmented control（debug/info/warn/error/silent）、最大条数 input、当前日志数展示
- 导出 JSON / 导出 JSONL / 清除所有日志按钮

### ✅ P7.5 console.* → Logger 迁移
- **状态**：已实施
- **涉及文件**：8 个文件约 30 处 `console.log/warn/error`
- `src/background/service_worker.ts`（18 处）→ `logger.info/warn/error`
- `src/background/session_manager.ts`（3 处）
- `src/background/keepalive.ts`（1 处）
- `src/content/content_script.ts`（4 处）→ `MessageLogTransport`，停止 `console.log` 防止污染采集数据
- `src/dashboard/dashboard.ts`、`src/popup/popup.ts`、`src/devtools/*.ts`

### ✅ P7.6 日志系统 E2E 测试
- **状态**：已完成 — `tests/e2e-logging.spec.ts`
- **文件**：`tests/e2e-logging.spec.ts`
- 级别切换 → silent 无日志增长 → debug 恢复 → 导出 JSON 含内部日志 → 导出采集数据不含扩展日志 → 超上限自动清理

---

## 执行策略

```
npm run test:e2e:p0     # P4.1-P4.13 并发 (workers=4)
npm run test:e2e:p1     # P5.1-P5.6
npm run test:e2e:all    # 全部
```

**并发**：4 个网站 spec 同时跑，总耗时 = max(单个)。P4.5-P4.13 在一个网站 spec 通过后并发。

**执行顺序**：P4.5（状态）→ P4.7（停止）→ P4.6（计数）→ P4.8（实时详情）→ P4.1-P4.4（四网站并发）→ P4.9-P4.13（一致性/导出/审计）→ P5 → P6
