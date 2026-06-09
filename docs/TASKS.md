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

### 1.6.1 采集中「实时详情」按钮溢出弹窗边界
- **状态**：待修复
- **现象**：采集状态下，右侧「实时详情」按钮超出弹出窗口边界，只能看到一半
- **根因疑问**：弹窗 body/popup 已设 overflow: hidden 和固定宽度，为什么按钮还能溢出？需排查 flex 布局或按钮定位

### 1.6.2 实时详情页不自动刷新
- **状态**：待修复
- **现象**：采集中点「实时详情」进入详情页，数据不随用户操作实时更新。只有手动点刷新按钮刷新整个页面，数据才会更新
- **期望**：实时详情页应自动轮询或推送更新，无需手动刷新

### 1.6.3 深色模式部分文字仍为黑色（残留）
- **状态**：待修复
- **现象**：深色模式下仍有部分文字为黑色，之前已修过一轮（1.5.1）但未完全覆盖
- **影响范围**：popup、dashboard 详情、设置等页面

### 1.6.4 Dashboard 时间线标签名与数据标签不对齐
- **状态**：待修复
- **现象**：
  - 时间线 tab 中显示「网络」，应为「网络请求」（对齐七标签）
  - 时间线 tab 中显示「导航」，应为「页面导航」（对齐七标签）
- **期望**：三端标签名完全统一 — 用户行为 / 页面导航 / 网络请求 / 控制台 / 错误异常 / Storage / Cookie

### 1.6.5 记录详情 — 网络请求列表点击无详情
- **状态**：待修复
- **现象**：采集详情 → 网络 tab 能看到请求列表，但点击单个请求后看不到请求体、返回体、地址、状态码等具体内容
- **期望**：点击请求展开详情面板，显示 method/URL/status/headers/body/response 等完整字段

### 1.6.6 记录详情「本次配置」只显示 5 个开关
- **状态**：待修复
- **现象**：采集详情下方「本次配置」区域，原本应有 7 个采集开关，实际只显示了 5 个
- **期望**：显示全部 7 个标签对应的采集开关状态（用户行为/页面导航/网络请求/控制台/错误异常/Storage/Cookie）

### 1.6.7 扩展运行日志导出为空
- **状态**：待修复
- **现象**：Dashboard → 诊断日志 → 导出日志 JSON，文件内容为空（无日志条目）
- **复现文件**：C:\\Users\\Karson\\Downloads\\capture_all_logs_2026-06-09T04-55-33-402Z.json
- **参考**：同时导出的采集记录文件数据正常
- **根因推测**：app_log_storage.ts 的 get_entries() 查询逻辑或 export_app_logs() 未正确读取 IndexedDB app_logs store

### 1.6.8 导出文件 capture.tags 为空数组
- **状态**：待修复
- **现象**：全部 7 个采集开关都开启的情况下导出 JSON，`capture.tags` 为 `[]`，预期应为 `["用户行为", "页面导航", "网络请求", "控制台", "错误异常", "Storage", "Cookie"]`
- **复现文件**：C:\\Users\\Karson\\Downloads\\capture_all_session_1780980428315_reb5bg2.json
- **影响**：导出文件无法反映用户本次采集开启了哪些数据标签

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

### P4.1 完整采集流程 — baidu.com
- **文件**：`tests/e2e-baidu.spec.ts`
- 启动扩展 → 打开 popup → 点击开始采集 → 打开 baidu.com 搜索 → 验证 7 标签计数 > 0 → 停止 → 验证完成状态 → 进入 dashboard 时间线有事件

### P4.2 完整采集流程 — toutiao.com
- **文件**：`tests/e2e-toutiao.spec.ts`
- 开始采集 → toutiao.com 滚动+点击 → 验证「用户行为」「网络请求」计数增长 → 停止 → dashboard 网络 Tab 非空

### P4.3 完整采集流程 — qq.com
- **文件**：`tests/e2e-qq.spec.ts`
- 开始采集 → qq.com 多次导航 → 「页面导航」计数 > 0 → dashboard 无"模式"列/筛选/卡片

### P4.4 完整采集流程 — sina.com
- **文件**：`tests/e2e-sina.spec.ts`
- 开始采集 → sina.com 操作 → 导出 JSON 验证 `capture_id` 非 `session_id` → 导出 HTML 验证 XSS 转义

### P4.5 弹出窗口三状态切换
- **文件**：`tests/e2e-states.spec.ts`
- 状态 1（开始）蓝按钮 7 标签无数字 → 状态 2（采集中）红计时+计数 → 状态 3（完成）绿时长+勾选 → 三种状态格子等高 108px → 无滚动条 → 无 mode badge

### P4.6 七标签实时计数（修复 P0.1）
- **文件**：`tests/e2e-labels.spec.ts`
- 开始采集 → baidu.com 点击 5 次 → 轮询 popup → 「用户行为」≥ 5 → 「网络请求」> 0 → 验证不是全 0

### P4.7 停止采集按钮（修复 P0.2）
- **文件**：`tests/e2e-stop.spec.ts`
- 点击红色停止 → 进入完成状态 → `{ action: 'stop' }` 返回 `{ success: true }` → 连续 3 次开始-停止无残留

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

### P4.12 导出四格式
- **文件**：`tests/e2e-export.spec.ts`
- JSON 含 `capture_id`+`category`+`type` → JSONL 逐行合法 → HAR 标准格式 → HTML 自包含无 XSS

### P4.13 UI 审计：旧概念残留
- **文件**：`tests/e2e-ui-audit.spec.ts`
- popup/dashboard HTML 不含 `深度采集` `标准采集` `就绪` `mode` `density` `录制` `记录` → 主色 `#3b82f6` → 设置无默认模式选项

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

### P6.1 七标签计数计算
- **文件**：`tests/label_counts.test.ts`
- `category → label` 映射 → `label_counts` 从 events 计算 → 空列表全 0 → `dom_data`/`capture_lifecycle` 不计入

### P6.2 stop_capture 消息协议
- **文件**：`tests/stop_capture.test.ts`
- `{ action: 'stop' }` 响应格式 → 未采集中调用返回错误 → flush 后 stats 正确

### ✅ P6.3 实时数据查询
- **状态**：已完成 — `tests/live_data_queries.test.ts`
- 活跃采集 `list_events`/`list_network` 返回实时数据 → 完成后返回全量 → 模拟 get_capture_data 合并 7 category 行为

### P6.4 UI 字符串审计
- **文件**：`tests/ui_strings.test.ts`
- 扫描全项目 `.ts` `.html` → 不含 `Record All` `record_all` `深度采集` `标准采集` `录制`

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
