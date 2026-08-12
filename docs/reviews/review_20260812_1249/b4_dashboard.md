# B4 仪表盘 UI 层全量 Review

**范围**：`src/extension/dashboard/` 8 个 `.ts`（1817 行）+ 跨模块（types/user_config/theme/i18n/archive_builder/capture_data_reader/export_settings/export_utils/event_category/capture_stats/constants/agent_bridge_config/SW handler）+ `tests/unit/` 相关 12 个测试。

统计口径已核对：popup 与 dashboard 均直接读 `CaptureRecord.stats.*`，两处一致。SW 契约消费除删除外均正确。

## Critical（0）
无。

## High（3）
### H1. 国际化体系性违反：dashboard 全量硬编码中文，零 data-i18n
- **confidence** 95 · 全部 dashboard 文件（`dashboard.ts:21-26,38,51-52`、`dashboard_captures.ts:39-42,65,71-75`、`dashboard_detail.ts:20-24,118-127,172`、`dashboard_settings.ts:26-30,33`、`dashboard_integrations.ts:11,15,18` 等），仅 `dashboard_settings.ts:99-108` 用 `t()`，`i18n.ts` 的 `data-i18n`/`apply_translations` 在 dashboard 无任何消费
- 证据：`rg data-i18n src/extension/dashboard/` 空；每文件 10-93 行中文字符串（dashboard_detail.ts 93 行）。约束「国际化 data-i18n + t()，禁止组件里硬编码中/英文字符串」明确违反。`ui_strings.test.ts` 只查 5 个废弃术语，不查 i18n 覆盖。切 locale=en 主面板仍全中文。
- 修复：UI 文案收敛到 `i18n.ts` 的 `I18nStrings`，模板走 `t(key)` 或 `data-i18n`；`ui_strings.test.ts` 增加「渲染产物不含未国际化硬编码中文」断言。
- 预存：ac8fefe9（2026-06-22）起。
### H2. 时间线 network/console/dom 三轨恒空，快速筛选计数恒 0
- **confidence** 88 · `dashboard_shared.ts:220-227`（load_detail）+ `dashboard_detail.ts:248-259`（render_trace lanes）+ `dashboard_detail.ts:117-127`（rail quick 筛选）
- 证据：`load_detail` 只把 `user_events/nav_events/error_events/storage_changes/cookie_changes` 合并进 `detail_events`（`snapshot.network_requests`、`console_events` 未并入）。`render_trace` 7 lane 与 rail 快速筛选全部对 `detail_events` 按 event_kind 过滤 → network/console/dom 恒空。即使采集有上千网络请求，时间线网络轨道永远空白，快速筛选计数恒 0。
- 修复：`load_detail` 把 network_request/console 事件并入 `detail_events`，或删除 rail/lane 中三项并调整计数。
- 预存：ac8fefe9。
### H3. 采集进行中详情页每 2s 全量快照重载 + 重渲染，交互竞态与监听泄漏
- **confidence** 75 · `dashboard.ts:114-137`
- 证据：轮询 2s 一次；`get_page()==='detail'` 且 capturing 时无条件 `load_detail()`（`read_capture_snapshot` 对 5 分类各读 0..100000 条再全量排序）+ `render_content()` 整页重渲染。①大采集每 2s 全量读 DB + 重建 DOM 冻结 UI；②拖拽 playhead/minimap 中途重渲染替换 DOM，旧 window pointermove 监听泄漏（dashboard_detail.ts:659-694 仅 pointerup 移除）；③重载后 `_dt_sel` 指向旧事件。代码已留 TODO(M4) 承认待替换。
- 修复：chrome.runtime.onMessage 推送增量；无变化不 render_content()；拖拽期间跳过重渲染。
- 预存：轮询核心 d7dafa5d（2026-06-09），单飞优化 1c1d82de（2026-07-19）新增未解决。

## Medium（14）
- **M1** 网络表时间列恒显示 "+00.000s" — `dashboard_detail.ts:324`。`(r as any).timestamp || rel_time(0)`，NetworkRequestData 无 timestamp（有 absolute_time/relative_time）。修复：`rel_time(r.relative_time)`。confidence 90，预存。
- **M2** 控制台表时间列恒空白 — `dashboard_detail.ts:380`。`(l as any).timestamp || ''`，ConsoleEventData 无 timestamp/absolute_time 声明。修复：存记录带 absolute_time。confidence 85，预存。
- **M3** event_kind 映射与 category_for_event_type 不一致，多类事件错标「生命周期」 — `dashboard_shared.ts:143-157` vs `event_category.ts:3-18`。ws_message/ws_frame/clipboard/form/focus/resize/fullscreen/print/visibility 无 case → default 'capture'。修复：对齐 category_for_event_type 或直接复用。confidence 85，预存。
- **M4** 采集列表搜索输入双转义：输入含 `"` 显示为 `&quot;` — `dashboard_captures.ts:66`+`:73`。`.replace(/"/g,'&quot;')` 后再套 `esc()` → `&amp;quot;`。修复：删 :66 replace。confidence 85，预存（968ba85b T039）。
- **M5** locale 持久化失效：'zh' 被 sanitize 拒绝，设置页语言选择回退英文 — `shared/user_config.ts:401` + `dashboard_settings.ts:45,195`。白名单 `['en','zh_CN']` 而 i18n 是 `'en'|'zh'`。修复：白名单改 `['en','zh']` 或统一单一来源。confidence 80，预存。
- **M6** 状态徽章 status 未转义直接插值 — `dashboard_detail.ts:162`。`${status}`（e.data 事件数据），若 status_code 非数值原样注入 DOM。触发面小（network_request 实际不进 detail_events 见 H2），但作为纵深缺口应修：`esc(String(status))` + Number 校验。confidence 55，预存。
- **M7** 删除采集忽略 SW 响应，活跃采集删除静默失败 — `dashboard_captures.ts:170-174,177-182`。不检查 `r.success`；SW 对活跃采集返回 `{success:false,error:'Cannot delete an active capture'}`（T110），UI 无提示，且 capturing 行仍渲染删除按钮。修复：检查响应 + 活跃行禁用删除。confidence 85，预存。
- **M8** 时间线渲染 O(n²)，无分页/虚拟滚动 — `dashboard_detail.ts:164,252` + `capture_data_reader.ts:27-33`。`detail_events.indexOf(e)` 双循环线性扫描；快照 100000 上限，一次渲染拼 10 万行 HTML。修复：过滤预建 idx 映射表；列表分页/懒渲染。confidence 80，预存。
- **M9** 事件数据渲染的 XSS 转义无任何测试覆盖 — detail_* 系列测试只查 stat-key 对齐与源码字符串包含。新增参数化转义测试覆盖 render_dt_list/render_net_inspector/render_con_table/render_simple_events/render_dt_inspector。confidence 85，预存。
- **M10** detail_render_consistency 测试空洞（自证自） — `detail_render_consistency.test.ts:6-41`。tab_expectations 是测试内部手写数组，断言它与 VISIBLE_CAPTURE_STAT_KEYS 相等（等价测自己）；第三个用例对本地构造 stats 断言 >0 恒真，未触达 dashboard 渲染代码。修复：调 render_detail/render_dt_list 断言实际 HTML。confidence 90，预存。
- **M11** detail_layout_source / settings_ui 部分用例为源码字符串断言 — `toContain('dt-network-body')`、`src.match(/function .../)`。源码重命名即脆断不验证行为。修复：改行为测试，源码结构断言标注「结构契约」。confidence 80，预存。
- **M12** i18n 覆盖无测试守卫 — `ui_strings.test.ts` 仅拦废弃术语不拦硬编码 UI 文案（见 H1）。confidence 90，预存。
- **M13** dashboard_detail.ts 769 行单文件混合渲染/状态/拖拽 — 单文件承担 10 tab HTML 模板、14+ 模块级 state、三套独立拖拽、zoom 过滤；t129 只拆 4 个超长函数，文件仍是 769 行单体。与 sidebar_resize.ts 两套重复 resize 实现。修复：tab 渲染拆独立文件；resize 收敛 sidebar_resize。confidence 75，预存。
- **M14** open_detail 每次打开重置 tab/视图 — `dashboard_detail.ts:765-769`。每次强制回 timeline 列表视图。修复：按 capture_id 记忆上次 tab/view。confidence 70，预存。

## Low（9）
- **L1** 网络检查器 cache_status 未转义 — `dashboard_detail.ts:357`。内部 union 字符串风险低，建议统一 esc()。
- **L2** chrome.tabs.create 打开 start_url 未做 scheme 校验 — `dashboard_detail.ts:486`。start_url 来自采集数据，应校验 http:/https:。
- **L3** load_captures 信任消息响应形状 — `dashboard_shared.ts:207-208`。非数组响应 `set_captures` 存对象后续 .filter 崩溃。
- **L4** 非扩展上下文初始化崩溃 — `dashboard.ts:94-100` + `dashboard_shared.ts:108-110`。脱离扩展直接打开时 get_user_config() undefined，format_system_time 抛 TypeError。
- **L5** go() 死映射 — `dashboard.ts:74`。`if (p==='integrations') p='captures'`，NAV 无 integrations 键永不可达。
- **L6** 设置轮询间隔分支死代码 — `dashboard_settings.ts:196-198`。`name.startsWith('agent_bridge')` 先命中，:198 分支不可达。
- **L7** resize 拖拽缺 pointercancel/mouseleave 处理 — `sidebar_resize.ts:26-58`、`dashboard_detail.ts:523-583`。mouseup 在窗口外释放时 dragging 卡死。
- **L8** DOM 轨道/快速筛选与「dom_data 不在 UI 展示」约束相悖 — `dashboard_detail.ts:126`（DOM 筛选项）、:236（DOM lane）。约束冲突需澄清。
- **L9** capture_dur 负值边界 — `dashboard_shared.ts:104-107`。ended_at<started_at 时负时长，clamp 0。

## Info（3）
- **I1** 内联 style 遍布，设计令牌仅部分落地 — dashboard_detail/dashboard_settings 大量 style 硬编码，深色适配有遗漏面。
- **I2** 错误反馈用原生 alert/confirm — 与「UI 友好提示」约束为弱实现。
- **I3** 正面项：XSS 主链路（事件标题/详情/网络头/请求响应体/console 消息/URL）均正确 `esc()`；导出防重入 `export_in_flight` guard 三路径覆盖；detail_timeline_marker/detail_zoom_control/detail_search_preserve_input/sidebar_resize/dashboard_export_flush_saveas 为行为级测试；HTML 导出转义在 exporter.ts 正确实现。

## Summary
- 8 文件 / 1817 行（dashboard）+ 13 跨模块文件 + 12 测试文件。
- Critical 0 / High 3 / Medium 14 / Low 9 / Info 3。全部预存（几乎全源自 ac8fefe9 首版）。
- 核心风险 Top5：
  1. 国际化失效（H1）：主面板 0 处 data-i18n，全量硬编码中文；ui_strings 测试不守卫。
  2. 时间线核心视图半残（H2 + M1/M2/M3）：network/console/dom 三轨恒空、快速筛选计数恒 0、网络/控制台时间列恒错、多类事件错标「生命周期」。
  3. 大采集性能与交互竞态（H3 + M8）：详情页每 2s 全量快照重载 + O(n²) 渲染，10 万级冻结 UI，拖拽中途重渲染监听泄漏。
  4. 无提示的静默失败（M7）：活跃采集删除被 SW 拒绝但 UI 无反馈。
  5. 测试护城河缺失（M9/M10/M12）：XSS 转义、i18n 覆盖无测试；detail_render_consistency 自证自。
- 特别提醒：XSS 主链路防护良好，M6 属纵深缺口而非现役漏洞；HTML 导出转义在 exporter 侧已验证正确。
