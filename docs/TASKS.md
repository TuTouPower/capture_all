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
- **现象**：导出 JSON 中 `events`、`network_requests`、`console_events` 三个数组全部为 `[]`，但 `stats` 显示有 260 events + 1000 requests。元数据正常，实际采集数据全部丢失。复现文件：`<USER_HOME>\Downloads\capture_all_session_1780969915280_vczrqep.json`
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

---

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
