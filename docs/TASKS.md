# Capture All — TASKS.md

> 基准：`docs/design/caputue-all/project/record-all/` (commit `f7fe756`)

---

## P0 · 功能缺陷


## P0 · 功能缺陷（待修复）

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


### ❌ P0.44 Body 大小限制改为可配置（1MB 默认 + 设置 UI）
- **状态**：未修复 — 2026-06-13
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

### ❌ T0.2 数据管道测试

- **目的**：验证「写入 → flush → 读取」闭环一致性，stats 计数与 event 数组长度匹配
- **文件**：`tests/pipeline_consistency.test.ts`

### ❌ T0.3 导出闭环测试

- **目的**：导入真实导出 JSON，验证字段完备（时区、resource_type、capture_method、body_status 分布）
- **文件**：`tests/export_integrity.test.ts`

### ❌ T0.4 渲染数据一致性测试

- **目的**：stats 数字 vs UI 渲染行数，确保每个 tab 都有数据行
- **文件**：`tests/detail_render_consistency.test.ts`

### ❌ T0.5 入口去重审计测试

- **目的**：扩展 P0.40 修复的 import 检查模式到所有共享函数（redaction、build_export_filename 等）
- **文件**：`tests/entry_unification.test.ts`

### ❌ T0.6 E2E 断言收紧

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

