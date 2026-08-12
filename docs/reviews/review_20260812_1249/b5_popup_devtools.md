# B5 审阅报告 — popup + DevTools（只读全量）

审阅文件：`src/extension/popup/popup.ts`（496 行）、`src/extension/devtools/devtools.ts`（13 行）、`src/extension/devtools/devtools_panel.ts`（7 行）。跨模块：constants/types/i18n/theme/poll_capture_status/agent_bridge_config、SW 消息处理、8 个相关测试。

## Critical（0）
无。

## High（1）
### H1 · popup 停止后「采集完成」态被 storage.onChanged 监听竞态覆盖（新增，2aaeec9）
- **confidence 70** · `popup.ts:484-494`（监听）+ `popup.ts:408`（stop 自写）+ SW `service_worker.ts:715-720`（SW stop 也写 is_capturing:false）
- 证据：2aaeec9 为「MCP 触发 start/stop 时同步 popup」新增 `chrome.storage.onChanged` 监听，对所有 is_capturing/current_capture 变更无条件 `load_state() → render()`。监听无法区分 popup 自写与外部写入：一次正常 popup stop 产生两次 is_capturing:false 写入（SW stop 一次、popup L408 一次），每次 onChanged 都 load_state 读到 false → state='ready' 渲染就绪态。与 stop_capture 末尾 `state='saved'; render()`（L410-411）竞争：时序 (a) 监听先于 saved 赋值 → 最终 saved 但中途闪 ready；(b) 监听后于 saved → 完成态被 ready 覆盖，导出/查看入口消失。结果不确定，全仓无测试覆盖「popup 自停 → saved 可见」。
- 修复：SW 写入带来源标记（changes 加 from:'sw'）popup 仅对带标记变更 re-sync；或 popup 自写前置 self_transition guard 让监听跳过自身写入。

## Medium（3）
### M1 · 消息契约漂移（P3，预存）
- **confidence 85** · `popup.ts:357,390,436,455` + `service_worker.ts:204-227` + `conventions.md:67`
- 证据：约定「请求 {action, payload?}，响应 {success, data?, error?}」。实际：popup start 用扁平字段 `{action, capture_id, config}` 而非 payload 包装；get_status/list_captures 返回裸对象/裸数组；get_capture_data 返回 `{success, capture}`（capture 不在 data 下）。popup 与 SW 实现自洽（`recent_captures = await ... || []` 依赖裸数组），但全部依赖 sendMessage 的 any 返回、无类型共享；SW 一旦按文档改包装，popup/dashboard 立即崩。系统级，跨 B2-B5。
- 修复：统一走文档契约或改文档并引入请求/响应类型定义供 SW 与 UI 共享。
### M2 · devtools_panel 表面是死代码（预存）
- **confidence 90** · `devtools_panel.ts:1-7`、`devtools_panel.html`、`devtools.ts:8-12`
- 证据：manifest `devtools_page=devtools.html`；vite 仅 devtools.html 为 entry（vite.config.ts:23）；devtools.ts 的 `panels.create` 用 `dashboard.html` 作面板页。devtools_panel.html/devtools_panel.ts 无任何入口引用（全仓 rg devtools_panel 无外部引用），devtools_panel.ts 只执行一次 logger.info 永不加载。两个 devtools 页面并存：一个被 dashboard.html 顶替、一个孤儿。
- 修复：删 devtools_panel 孤儿面，或让 panels.create 指向 devtools_panel.html（轻量入口意图）。
### M3 · popup 测试「只测表面」（P7，预存）
- **confidence 85** · `popup_start_timing.test.ts`、`popup_immediate_refresh.test.ts`、`popup_layout.test.ts`（542 行）、`popup_export.test.ts`、`popup_main_panel_url.test.ts`
- 证据：多为 `readFileSync` 源码字符串断言（indexOf/正则）与自洽数学。
  - popup_start_timing 测试 1：import popup.ts 后从未触发 start_capture（不 dispatch DOMContentLoaded），storage_set_mock 零调用 → 断言恒过（vacuous）；测试 2/3 纯源码顺序断言互相重复。
  - popup_immediate_refresh 测试 1 用本地自造 simulate_start_timer（非真实代码）断言 mock 被调一次，未触达 popup 实现。
  - popup_layout 542 行全为常量自证 + CSS 正则提取（CSS 解析有回归价值，无渲染行为覆盖）。
  - 行为真覆盖仅 devtools_panel.test 与 status_poll_sender_tab（SW 侧）。无测试覆盖 stop→saved 状态、onChanged 外部同步（H1 的坑）、导出失败路径、SW 不可达降级。
- 修复：popup.ts 导出内部函数/依赖注入 DOM，用 jsdom 真实点击触发 start/stop 断言 storage 写入与渲染状态。

## Low（7）
- **L1** 静默失败与陈旧状态（P2/P6，预存）· `popup.ts:447-449,456-458,461-469`。refresh_counts/load_history 空 catch 吞错；refresh_counts 忽略 `status.is_capturing`——SW 已自动结束但 storage 仍 is_capturing:true，重开 popup 显示采集中且 live 计数恒 0。修复：poll 以 status.is_capturing 校正本地状态。
- **L2** 轮询无单飞保护（P4，预存）· `popup.ts:420-427`。1s setInterval 无 poll_in_flight（dashboard 有）。MV3 本地快，风险低。修复：复用 dashboard 单飞模式。
- **L3** 三套轮询实现未复用共享模块（P5，预存）· `popup.ts:433-450` vs `dashboard.ts:113-138` vs `shared/poll_capture_status.ts`。共享模块未被 popup/dashboard 复用，get_status 逻辑三处漂移（L1 即一例）。修复：抽 start_status_poll 通用化。
- **L4** capture_toggles 写后无人消费（预存）· `popup.ts:377`。`chrome.storage.local.set({…, capture_toggles: toggles})` 全仓无读取。popup 关闭重开 toggles 复位全开，与启动配置不一致。修复：load_state 读回恢复。
- **L5** get_capture_config 硬编码 + redact_data 来源不一致（预存）· `popup.ts:322-349`。sample_rate_ms:50、redact_sensitive_headers:true、redact_url_query:true 硬编码不读 DEFAULT_CONFIG/user_config；redact_data 用 popup mask toggle 覆盖 user_config。修复：缺省值引 DEFAULT_CONFIG，redact_data 以 user_config 为底叠加 toggle。
- **L6** 国际化/本地化杂项（预存）· `popup.ts:103-105,364`、`popup.html:9-11`。fmt_num 硬编码 'en-US'；capture name 用 toLocaleString()；popup.html title 在 init_locale 完成前闪现中文。
- **L7** 错误提示粗糙 + stop 失败静默（预存）· `popup.ts:299,382,413,391-392`。`alert('${t('error')}: ${e}')` 对非 Error 显示 [object Object]；stop 返回 success=false 仅 logger.warn 并强制转 saved。修复：失败时 alert 具体原因不静默转态。

## Info（2）
- **I1** list_captures 全量传输（P4，预存）· `popup.ts:452-459`。每次打开/stop 后拉全量列表（数千条大消息）仅渲染 3 条。修复：SW 加 limit 参数。
- **I2** P1 安全面确认（正面，预存）· `popup.ts:238-242,145-146,121-135`。open_dashboard URL 仅由应用生成的 capture_id 拼接，chrome.tabs.create 只开扩展内部 dashboard URL，无外部 URL/注入面。innerHTML 渲染全部经 t()/escape_html/数字格式化，无用户可控 HTML。P1 无 finding。

## Summary
- 行数：popup.ts 496 + devtools.ts 13 + devtools_panel.ts 7 = 516（不含跨模块）。
- Critical 0 / High 1 / Medium 3 / Low 7 / Info 2。
- Top3 风险：
  1. **H1** popup 停止后完成态被 onChanged 同步监听竞态覆盖（时序相关，可能丢「采集完成/导出」入口）——由 2aaeec9 引入，无测试。
  2. **M1** 消息契约与文档约定长期漂移、依赖 any，未来任何一方改动即破坏 UI。
  3. **M3** 测试面多为源码字符串/自洽断言，状态机关键路径（start/stop/onChanged/导出失败）无行为覆盖。
- 预存判定：H1 为新增（2aaeec9）；其余预存问题均早于本次审阅。
