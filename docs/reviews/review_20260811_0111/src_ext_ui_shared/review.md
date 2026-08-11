# src_ext_ui_shared 全量审阅报告

- 审阅类型：当前状态全量（只读当前文件，未用 git diff/log）
- 范围：`docs/reviews/review_20260811_0111/src_ext_ui_shared/file_list.txt`（34 文件）
  - `dashboard/*`、`popup/*`、`devtools/*`、`extension/shared/*`、`manifest.json`、`_locales/*`
- 焦点：XSS / UI 接线 / 配置同步 / 导出归档 / manifest / i18n·theme / `poll_capture_status`
- 日期：2026-08-11

---

## Findings

### F001 — Popup 分类开关多数不控制采集，仅写 tag

- **位置**：`src/extension/popup/popup.ts` `get_capture_config`（约 322–348）、`toggles` + `metric_grid`（约 31–135）；对照 `service_worker.ts` 仅用 `event_count_enabled` 等拼 tags（约 366–372）
- **现象**：ready 态 8 张卡片均可切换。实际进 `CaptureConfig` 并影响采集的只有：
  - `request_count` → `capture_network`
  - `log_count` → `capture_console`
  - `mask` → `redact_data`
  - 用户行为 / 页面导航 / 错误 / Storage / Cookie 五类只变成 `*_enabled` 与 `tags`，content/background 无对应门控
- **影响**：关闭「用户行为」等后仍全量采集；UI 提供假控制面。可观测：关开关 → 开采 → 详情仍有对应事件。
- **建议**：要么在 content/SW 按 flag 停模块，要么 UI 改为不可关（或标明「仅标签」）。
- **级别**：important（blocking）
- **置信度**：高

---

### F002 — Dashboard ZIP 导出未先 flush，活跃/刚缓冲数据可丢

- **位置**：`dashboard_shared.ts` `export_capture` archive 分支（约 237–265）；`capture_data_reader.ts` 头注释要求先 `flush`
- **现象**：archive 路径直接 `read_capture_snapshot(id)`，无 `get_capture_data` / `flush`。`get_capture_data`（SW）会 `flush_all()`，但本路径不调用。popup 导出先 `get_capture_data` 再 snapshot，行为不一致。
- **影响**：采集中或 stop 后缓冲未落盘时导出 ZIP，事件/网络条数少于详情 stats。可观测：live 详情有计数、立刻导出 ZIP 条数偏少。
- **建议**：export 前统一 `sendMessage({ action: 'get_capture_data' | 'flush' })` 再 `read_capture_snapshot`。
- **级别**：important（blocking）
- **置信度**：高

---

### F003 — 详情时间线搜索框每次 debounce 后被清空

- **位置**：`dashboard_detail.ts` `render_dt_rail` `#dtSearch`（约 128）；`filtered_events`（约 145–147）；`wire_detail`（约 480）
- **现象**：`#dtSearch` 无状态回写。`input` debounce → `render_content()` 整页重绘 → 输入框 value 空。过滤读旧 DOM 的 value，首轮过滤短暂生效，重绘后查询丢失、列表回全量。
- **影响**：时间线搜索基本不可用。对比 `dashboard_captures.ts` 已用 `_cap_search` 持久化并恢复焦点。
- **建议**：模块状态 `_dt_search`，render 写 `value`，wire 时 focus/光标恢复（同列表页）。
- **级别**：important（blocking）
- **置信度**：高

---

### F004 — 设置项写入后「不生效」：locale / browser_label / poll_interval 与 sanitize 不对齐

- **位置（本批 UI）**：`dashboard_settings.ts` locale `value="zh"|"en"`（约 45）、`browser_label` / `agent_bridge_poll_interval_ms`（约 99–100）；`i18n.ts` `Locale = 'en'|'zh'`、`set_locale` 写顶层 `locale`
- **位置（加载路径，跨模块）**：`src/shared/user_config.ts` `sanitize_user_config`：locale 仅接受 `en|zh_CN`；`str_keys` 无 `browser_label`；`num_keys` 无 `agent_bridge_poll_interval_ms`
- **现象**：
  1. 选中文 → `persist({ locale: 'zh' })` → sanitize 丢弃 → `user_config.locale` 仍 `en`；设置页重开下拉回 English。i18n 另写顶层 `locale`，与 user_config 双源。
  2. Bridge 备注名 / 轮询间隔写入 storage 后，下次 `load_user_config` 回退默认值，UI 显示空/1000。
- **影响**：设置页「更改即时保存」对上述字段名存实亡。
- **建议**：统一 locale 枚举（`zh` 或 `zh_CN` 全链路）；sanitize 补齐 `browser_label`、`agent_bridge_poll_interval_ms`；locale/theme 单一权威存储。
- **级别**：important（blocking）
- **置信度**：高

---

### F005 — 「每次询问保存位置」开关已接线存储，但导出路径从不读取

- **位置**：`dashboard_settings.ts` `export_save_as` switch（约 79）；`export_utils.ts` `download_blob`（约 64–100）
- **现象**：`export_save_as` 经 `persist` 写入 user_config。`download_blob` 逻辑：无子目录则 `showSaveFilePicker`，有目录则 `chrome.downloads` 且 `saveAs: !has_dir`。全程不读 `export_save_as`。
- **影响**：关闭开关仍弹 picker（无导出目录时）；有目录时永远静默下载。设置误导。
- **建议**：`download_blob` 接收 config，尊重 `export_save_as`；或移除该开关。
- **级别**：important（blocking）
- **置信度**：高

---

### F006 — 归档 body 路径去重改文件名，未回写 JSONL 中的 `*_body_ref`

- **位置**：`archive_builder.ts` 路径冲突解决（约 276–294）vs `process_single_request` 写入的 ref（约 108–154）
- **现象**：`used_paths` 冲突时物理路径改为 `base_2.ext`，但 `network_lines` 已 JSON.stringify 原 path。`safe_request_id` 支持 `used` Set，此处未用。
- **影响**：重复 `request_id` 或碰撞时，解压后 JSONL 指向不存在文件。正常唯一 id 不触发。
- **建议**：先全局分配 safe id（`used` Set），或冲突时同步改 line 内 ref。
- **级别**：important（数据完整性；碰撞可观测）
- **置信度**：中高

---

### F007 — `detail_time_display_mode` 可保存，详情时间列不消费

- **位置**：`dashboard_settings.ts` 段控（约 48）；`dashboard_detail.ts` 列表/轨道一律 `rel_time(...)`（约 164、396 等）
- **现象**：设为「系统时间」后，时间线/分类表仍只显示 `+ss.mmms`。Inspector 同时有相对与绝对，与设置无关。
- **影响**：设置无效。
- **建议**：列表列按 mode 切换 `rel_time` / `format_system_time`。
- **级别**：medium
- **置信度**：高

---

### F008 — 侧栏拖拽第二次位移以首次 wire 宽度为基准

- **位置**：`sidebar_resize.ts`（约 32–41）：`const start_w = initial`，`initial` 仅 wire 时计算
- **现象**：同一 handle 第二次 mousedown 仍用首次宽度作起点，CSS 当前宽度与指针脱节，侧栏跳变。mouseup 写 localStorage 后若整页 `render_shell` 重 wire 则恢复。
- **影响**：主侧栏 / 设置子导航拖宽体验损坏。
- **建议**：`start_w = parseFloat(getPropertyValue(css_var)) || default_px`。
- **级别**：medium
- **置信度**：高

---

### F009 — Bridge 状态区写死「未连接」，无轮询/订阅

- **位置**：`dashboard_settings.ts` `#bridgeStatus`（约 101）；`wire_settings` 无 status 更新
- **现象**：启用 bridge 后状态文案不变。i18n 有 Enrolling/Enrolled 等 key 未用。
- **影响**：无法从设置页判断 bridge 是否连通。
- **建议**：向 SW 查 bridge 状态或 storage 订阅，刷新 `#bridgeStatus`。
- **级别**：medium
- **置信度**：高

---

### F010 — 列表「全选」作用于全部 captures，忽略当前筛选

- **位置**：`dashboard_captures.ts` `wire_captures` `#capAll`（约 140–144）用 `get_captures()` 而非 `filter_captures(...)`
- **现象**：筛选后勾全选，选中含不可见行；批量删/导扩大范围。
- **级别**：medium
- **置信度**：高

---

### F011 — `poll_capture_status`：stop 不取消 in-flight；interval 可重叠

- **位置**：`poll_capture_status.ts`（约 38–82）
- **现象**：
  1. `stop` 设 `stopped` 并 clear interval，已发出的 `get_status` resolve 后仍可 `on_active`（首检 then 仅拦启动 interval，不拦已调用的 `on_active`）。
  2. interval 回调不 await、无 in-flight 门闩，慢于 2s 的 `get_status` 可重叠。
- **缓解**：content `on_active` / `start_capture` 有 `is_capturing` 守卫；stop 后调 `stop_status_poll()`。重叠主要多耗消息，双启风险低。
- **建议**：generation token 或 `stopped` 在 `on_active` 前再判；单飞 in-flight。
- **级别**：medium（泄漏有 MAX_ATTEMPTS；竞态有消费方缓解）
- **置信度**：中

---

### F012 — theme 双存储；dashboard 文案硬编码中文

- **位置**：`theme.ts` 顶层 key `theme`；`persist({ theme })` 写 `user_config`；`dashboard.ts` / `dashboard_*` 中文硬编码；`_locales` 仅 name/description
- **现象**：`init_theme` 只读顶层 `theme`；设置同时写两处，路径不一致时漂移。Dashboard 几乎不走 `t()`，locale 切换主面板文案不变（popup 相对完整）。
- **级别**：medium（i18n 缺口）/ minor（theme 双写在 UI 同事务下暂一致）
- **置信度**：高

---

### F013 — devtools_panel 死页面

- **位置**：`devtools.ts` 创建 panel 指向 `dashboard.html`；`devtools_panel.html` / `devtools_panel.ts` 仅日志，无引用
- **级别**：minor
- **置信度**：高

---

### F014 — XSS 面：本批 UI 转义整体到位

- **位置**：`dashboard_*` 捕获数据经 `esc`；`popup.ts` `escape_html`；CSP `script-src 'self'`
- **现象**：`innerHTML` 用于整页模板，用户/捕获字段（name、url、body、headers、console、event title/detail）普遍 escape。未发现可利用的未转义捕获数据注入。
- **残留**：`response_body_status` 未 esc（扩展自产枚举，风险低）；静态 SVG/`I[]` 可信。
- **级别**：无 finding（正面结论）
- **置信度**：高

---

### F015 — manifest 权限与产品能力匹配，面偏大但合理

- **位置**：`manifest.json`
- **现象**：`debugger` + `webRequest` + `cookies` + `tabs` + `downloads` + `host_permissions: <all_urls>` + 全帧 content_script。符合全量采集目标。CSP 限制 extension_pages。无 `web_accessible_resources`。
- **说明**：权限面大属产品选型，非本批实现错误。若收紧需产品级「按需授权」设计，不单改 UI。
- **级别**：info
- **置信度**：高

---

## 结论

### XSS

扩展页 `innerHTML` 模板对捕获数据系统使用 `escape_html`/`esc`，popup 同。CSP 收紧 script。本批 **无 XSS important+ finding**。

### UI 接线

| 区域 | 状态 |
|------|------|
| 采集列表搜索/状态筛选/导出/删除/批量 | 已绑；全选忽略筛选（F010） |
| 详情 tab/筛选/导出/打开原页/网络 inspector/轨道缩放 | 已绑；时间线搜索损坏（F003） |
| 设置各控件 | 多数 `persist`；多项实际不生效（F004/F005/F007/F009） |
| popup 启停/导出/历史/面板 | 已绑；分类开关假门控（F001） |
| 当前采集/导出任务页 | 已绑 |

### 配置同步

- 写入：`save_user_config(patch)` 路径正确。
- 生效缺口：sanitize 丢 `browser_label` / `agent_bridge_poll_interval_ms` / `locale=zh`；`export_save_as` 与 `detail_time_display_mode` 无消费者；theme/locale 双 key。

### 导出/归档

- `export_utils`：File System Access + downloads 兜底、目录规范化合理。
- `archive_builder`：jsonl 末换行、mode 剥离、body plan 清晰；路径去重与 ref 不同步（F006）；dashboard ZIP 缺 flush（F002）。

### poll_capture_status

有上限防泄漏；stop + content 守卫可用。in-flight / 重叠仍可改进（F011）。

### 文件体量（结论提示，不进 finding 表）

- `dashboard_detail.ts` ~732 行：渲染+交互耦合，后续宜拆 tab/trace/net inspector。
- `dashboard_settings.ts` ~258、`popup.ts` ~495：可接受。

---

## 计数

| 级别 | 数量 |
|------|------|
| important（blocking） | 6（F001–F006） |
| medium | 5（F007–F011） |
| minor / info | 3（F012 部分、F013、F015） |
| XSS important+ | 0 |

---

## verdict

**verdict: FAIL**

依据：6 条 important 可观测缺陷（假开关、导出缺 flush、搜索自清空、配置项不粘滞、export_save_as 死开关、归档 ref 碰撞）。无 XSS blocking。修复 F001–F005 后可复评 PASS；F006 建议一并修。
