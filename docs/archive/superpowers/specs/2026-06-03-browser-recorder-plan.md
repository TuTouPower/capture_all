# Record All — 实施计划

基于 spec: `docs/superpowers/specs/2026-06-03-browser-recorder-design.md`

## 构建顺序依赖

```
Sprint 1 (骨架+存储+脱敏+测试框架)
  ├── Sprint 2 (Content Script 采集)  ─┐
  └── Sprint 3 (Background 采集)      ─┤ 可并行
                                        │
Sprint 4 (Session Manager 骨架) ← 提前到 Sprint 1.5
                                        │
Sprint 5 (Popup UI) ← 依赖 Sprint 1.5 + 2 + 3
  │
Sprint 6 (详情页) ← 依赖 Sprint 1
  │
Sprint 7 (导出) ← 依赖 Sprint 6
  │
Sprint 8 (收尾+边界) ← 依赖全部
```

---

## Sprint 1: 项目骨架 + 存储 + 脱敏 + 测试框架

**步骤 1.1** — 初始化项目
- `npm init`, 安装 vite + typescript + vitest
- 安装 `@crxjs/vite-plugin`（主方案），验证 MV3 SW + content script + devtools panel 打包
- 备选：手动 Vite 多入口配置（crxjs 不兼容时切换）
- 配置 `tsconfig.json`, `vite.config.ts`
- `manifest.json`：
  ```json
  {
    "permissions": ["storage", "webRequest", "debugger", "scripting", "tabs", "activeTab", "alarms", "downloads"],
    "host_permissions": ["<all_urls>"],
    "version": "0.1.0"
  }
  ```
- 创建目录结构
- **验证**：`npm run build` 产出可加载的空扩展，`npm test` vitest 就绪

**步骤 1.2** — 类型定义 + 常量
- `shared/types.ts`：Session, RecordConfig(含 keyboard_capture_mode, redact_url_query), RecordEvent (+ PageLoadData, TabSwitchData), NetworkRequest (含 BodyCaptureStatus), ConsoleLog, ErrorLog
- `shared/constants.ts`：DB 名、store 名（含 error_log）、默认安全配置、存储上限、截断长度
- **验证**：tsc 通过

**步骤 1.3** — 脱敏模块
- `shared/redaction.ts`：
  - `redact_headers(headers)`：过滤 authorization/cookie/set-cookie/x-api-key/x-csrf-token/proxy-authorization/www-authenticate 及含 token/key/secret/bearer 的 header
  - `redact_url(url, redact_query)`：当 redact_url_query=true 时，URL query 中 token/key/secret/password/auth 参数值 → `[REDACTED]`
  - `truncate(str, max_bytes)`：截断函数
  - `redact_password(value, input_type)`：password 始终 `[REDACTED]`
- `shared/capture_modes.ts`：
  - `get_basic_config()`：方案 A 默认配置
  - `get_advanced_config()`：方案 B 默认配置
- `shared/escape.ts`：
  - `escape_for_html_embed(json_str)`：`</script>` → `<\/script>`，`<` `>` `&` 转义
- **测试**：`redaction.test.ts` + `capture_modes.test.ts` + `escape.test.ts`

**步骤 1.4** — IndexedDB 存储层
- `background/storage.ts`：
  - `init_db()`：创建数据库，5 个 stores（sessions, events, network_requests, console_logs, error_log）+ indexes
  - Session CRUD：create/update/get/list/delete
  - 事件写入：`write_events(batch)` / `write_requests(batch)` / `write_logs(batch)` — 攒 100 条或 1s flush
  - 查询：`get_events(session_id, offset, limit)` 等，支持分页
  - `get_session_size(session_id)`：返回 `bytes_written` 计数器值
  - `check_storage_limit(session_id)`：超 500MB 返回 true
- **测试**：`storage.test.ts` 覆盖 CRUD + 批量写入 + 上限检查

---

## Sprint 2: 页面内采集（Content Script）

**步骤 2.1** — Content Script 入口 + 按需激活
- `content/content_script.ts`：
  - `manifest.json` 中声明 `"matches": ["<all_urls>"]`, `"run_at": "document_start"`, `"all_frames": true`
  - 启动后只注册 `chrome.runtime.onMessage` 监听
  - 收到 `{action: 'start', config}` → 初始化各 capture 模块
  - 收到 `{action: 'stop'}` → 停止采集，移除事件监听
  - 采集数据通过 `chrome.runtime.sendMessage` 发到 Background
  - 记录 `frame_id`（通过 `window !== window.top` 判断）
- **验证**：加载扩展，发消息确认收发正常

**步骤 2.2** — 鼠标采集
- `content/mouse_capture.ts`：
  - `clicks`：click/dblclick/contextmenu
  - `clicks_scroll_drag`：加上 wheel/dragstart/dragend
  - `full_trajectory`：mousemove 用 rAF 节流，按 `config.sample_rate_ms` 采样
  - 每事件：relative_time, x/y, target_selector, target_tag, target_text(截断100)
- **测试**：录制 30s，验证 IndexedDB 事件数量

**步骤 2.3** — 键盘采集
- `content/keyboard_capture.ts`：
  - `keyboard_capture_mode: 'all'` → 完整 keydown/keyup 记录
  - `keyboard_capture_mode: 'shortcuts'` → 只记录修饰键组合（ctrl/alt/meta + key）
  - `keyboard_capture_mode: 'none'` → 不注册键盘监听
  - 记录：key, code, modifiers, target_selector
- **测试**：三种模式分别验证

**步骤 2.4** — 滚动采集
- `content/scroll_capture.ts`：
  - scroll 事件，200ms 节流
  - 记录：scroll_x, scroll_y, scroll_height, scroll_width
- **测试**：滚动页面验证

**步骤 2.5** — DOM 变化采集
- `content/dom_capture.ts`：
  - input/textarea 的 input 事件 + select 的 change 事件
  - focusin/focusout
  - `capture_input_values: false` → value 存 `'[DISABLED]'`
  - password 始终 `'[REDACTED]'`
- **测试**：表单输入验证脱敏

**步骤 2.6** — 页面加载 + Tab 切换
- `content/content_script.ts` 补充：
  - `page_load` 事件：`load` 事件中记录 `load_time_ms`, `dom_content_loaded_ms`
  - visibilitychange → `tab_switch` 事件
- Background 监听 `chrome.tabs.onActivated` → 记录 tab 切换
- **测试**：切换 tab、刷新页面验证

---

## Sprint 3: 后台采集（Background）

**步骤 3.1** — SW 保活机制
- `background/keepalive.ts`：
  - `chrome.alarms.create('keepalive', { periodInMinutes: 0.5 })`（30s，Chrome alarm 最小支持值）
  - 录制开始时创建 alarm，停止时清除
- **验证**：录制 5 分钟，SW 不被终止

**步骤 3.2** — 网络请求采集
- `background/network_capture.ts`：
  - `chrome.webRequest.onBeforeRequest` → method, url(脱敏), request_body(截断10KB, 可选), timestamp, tab_id, resource_type
  - `chrome.webRequest.onCompleted` / `onErrorOccurred` → status_code, response_headers(脱敏), duration_ms
  - response_body：basic 模式 `not_enabled`；advanced 模式通过 debugger 获取
  - request_body_status / response_body_status 用 `BodyCaptureStatus` 枚举
- **测试**：录制期间访问网页，验证 network_requests store 数据

**步骤 3.3** — Console Log 采集（方案 B1：debugger 路径）
- `background/console_capture.ts`：
  - `chrome.debugger.attach(target, "1.3")`（无需 F12，但触发黄色警告条）
  - `Runtime.enable` → 监听 `Runtime.consoleAPICalled`
  - args 截断 1KB，提取 stack trace
  - **降级**：attach 失败（用户已开 F12）→ 通知 popup "请打开 F12 使用 DevTools 模式(B2)，或关闭 F12 重试"
  - 停止时 `chrome.debugger.detach`
- **验证**：测试页面 console.log/warn/error，检查记录；开 F12 时验证降级提示

**步骤 3.4** — Response Body 采集（方案 B）
- 在 console_capture.ts 中扩展：
  - `Network.enable` + `Network.getResponseBody`
  - 失败时记录 `response_body_status: 'failed' | 'too_large' | 'unsupported'`
  - 跨域/stream/二进制/大响应/过期 requestId → `unsupported` / `failed`
- **验证**：方案 B 录制，检查 response_body 和 status

**步骤 3.5** — DevTools 面板（方案 B2 路径）
- `devtools/devtools.html`：注册 DevTools 面板
- `devtools/devtools_panel.html`：
  - 通过 `chrome.devtools.inspectedWindow` 获取 console（不触发黄色警告条）
  - `chrome.runtime.sendMessage` 与 Background 通信
  - 用户关闭 DevTools → 降级为方案 A，popup 提示
- **验证**：F12 打开 DevTools → 方案 B 录制 → 验证额外数据，无黄色警告

**步骤 3.6** — Background 主入口
- `background/service_worker.ts`：
  - `init_db()`
  - 注册消息监听，路由到各模块
  - 注册 `chrome.alarms.onAlarm` 保活
  - `chrome.tabs.onActivated` → tab_switch 事件
- **验证**：加载无报错，消息路由正确

---

## Sprint 4: Session Manager（提前）

**步骤 4.1** — Session 生命周期
- `background/session_manager.ts`：
  - `start_session(config)`：创建 Session，计算 `relative_time` 基准，通知所有 content scripts + 采集模块
  - `stop_session()`：标记 end_time，计算 stats，停止采集，清除 alarm
  - `list_sessions()`：按 start_time 倒序
  - `delete_session(id)`：逐条删除 IndexedDB 数据
  - `get_session_size(id)`：返回 bytes_written
  - 存储上限检查：每次 flush 检查，超限自动 stop + 通知
- **测试**：`session_manager.test.ts`，覆盖生命周期、多 tab、自动停止

---

## Sprint 5: Popup UI

**步骤 5.1** — Popup 结构
- `popup/popup.html` + `popup.css`：
  - 状态区：录制指示灯 + 开始/停止
  - **首屏**：方案 A 按钮 + 方案 B 按钮（含警告提示）
  - 展开配置：鼠标精度、隐私开关（键盘/表单值/body 采集，每个带风险提示）
  - 历史：最近 20 条 session
- **验证**：popup 打开布局正确

**步骤 5.2** — Popup 交互
- `popup/popup.ts`：
  - config 存 `chrome.storage.local`
  - 开始/停止 → 调用 session_manager
  - 方案选择 → 生成对应 config
  - 历史列表渲染
  - 点击 session → `chrome.tabs.create` 打开详情页
  - 导出按钮 → 调用 exporter
  - 录制中：badge 显示 "REC"，图标变红
- **验证**：完整 UI 流程

---

## Sprint 6: 详情页

**步骤 6.1** — 框架 + 时间线
- `detail/detail.html` + `detail.css` + `detail.ts`：
  - URL 参数取 session_id
  - Session 概览：时间、时长、模式标签、统计
  - Tab 切换：时间线/网络/Console/事件
- `detail/timeline.ts`：
  - 混合事件流按 relative_time 排序
  - 类型过滤
  - IntersectionObserver 分页加载（按需渲染可视区域，分批从 IndexedDB 读取，每批 200 条）
- **验证**：5 分钟录制后查看详情页

**步骤 6.2** — 网络面板
- `detail/network_panel.ts`：
  - 表格：method, url, status, type, duration
  - 点击展开：headers(脱敏后), body_status, body(如有)
  - 搜索 + resource_type 过滤
- **验证**：查看 API 请求

**步骤 6.3** — Console 面板
- `detail/console_panel.ts`：
  - 日志列表：时间、level 图标、内容
  - level 过滤、搜索、stack trace 展开
- **验证**：查看 console 输出

**步骤 6.4** — 事件面板
- `detail/event_panel.ts`：
  - 鼠标/键盘/滚动/DOM/tab_switch/page_load 列表
  - 关键信息展示
  - 过滤 + 搜索
- **验证**：查看操作事件流

---

## Sprint 7: 导出

**步骤 7.1** — JSON 导出
- `background/exporter.ts`：
  - `export_json(session_id)`：读取全部数据，序列化
  - `chrome.downloads.download` 保存
- **测试**：`exporter.test.ts`，验证数据完整性 + 大数据量

**步骤 7.2** — HTML 报告导出
- `export_templates/report.html`：独立 HTML，内嵌数据
- `shared/escape.ts` 的 `escape_for_html_embed()` 嵌入前转义
- 默认嵌入摘要，大 session (>20MB) 提示"建议 JSON 导出"
- **验证**：导出 HTML，浏览器打开，检查无 XSS（注入 `</script>` 到数据中测试）

---

## Sprint 8: 收尾 + 边界

**步骤 8.1** — 图标
- SVG 源文件 → 构建脚本生成 16/48/128 PNG
- manifest 引用

**步骤 8.2** — 边界处理
- 录制中关闭 tab → 标记 tab 数据，session 继续
- 录制中切换 tab → 继续录制新 tab
- debugger attach 失败 → 降级 + UI 显示原因
- 存储满 → 自动停止 + 通知
- IndexedDB 写入失败 → popup 通知
- SW 运行时错误 → 写入 error_log store

**步骤 8.3** — 手测验收
- 完整流程：加载 → 方案 A → 录制 → 操作 → 停止 → 查看 → 导出
- 完整流程：方案 B → 开 F12 → 录制 → 操作 → 停止 → 查看 → 导出
- 安全验收：密码框、Authorization header、Cookie、URL query 脱敏
- 性能验收：full_trajectory 录制 10 分钟，详情页流畅
