# src_extension_06 审阅报告

- **审阅人**: sonnet
- **批次**: src_extension_06
- **文件数**: 8，共 1824 行
- **范围**: WebSocket 采集、Dashboard 整体（shell/列表/详情/集成小页）、CSS

---

## 发现汇总

| ID | 文件 | 级别 | 类别 | 简述 |
|----|------|------|------|------|
| 06-S01 | websocket_capture.ts:82 | 严重 | Bug | 隐式全局变量 `orig_handler` |
| 06-S02 | websocket_capture.ts:85 | 严重 | Bug | `onmessage` setter 引用未声明的 `orig_addEventListener` |
| 06-S03 | websocket_capture.ts:77-89 | 中 | Bug/状态同步 | `onmessage` 被多次赋值时叠加监听，无旧 listener 清理 |
| 06-S04 | websocket_capture.ts:92-107 | 中 | Bug/状态同步 | `removeEventListener` 未 monkey-patch，wrapper 无法正确移除 |
| 06-S05 | dashboard_detail.ts:356 | 严重 | XSS | `cache_status` 未转义直接注入 HTML |
| 06-S06 | dashboard_detail.ts:163 | 中 | 性能 | 事件列表每行调用 `indexOf`，O(n^2) |
| 06-S07 | dashboard.ts:35-58 | 中 | 性能/状态同步 | 每次路由切换重建整个 shell DOM |
| 06-S08 | dashboard_detail.ts:717-721 | 中 | 性能 | Zoom slider 每次 input 全量查询 DOM |
| 06-S09 | dashboard.html:5 | 低 | 可访问性 | 缺少 `lang` 声明准确性（zh 应对应页面实际内容语言） |
| 06-S10 | dashboard_detail.ts:99-102 | 低 | 可访问性 | `render_simple_events` 表格列数与 headers 不一致 |
| 06-S11 | dashboard.css | 低 | 可访问性 | 自定义 `switch` 控件无 ARIA role/keyboard |
| 06-S12 | websocket_capture.ts:143-168 | 低 | 状态同步 | `is_capturing=false` 后页面脚本仍可注入伪造消息 |

---

## 详细发现

### 06-S01 — 隐式全局变量 `orig_handler`

- **位置**: `src/extension/content/websocket_capture.ts:82`
- **现象**: `orig_handler = function(ev) {...}` 未声明 `var`/`let`/`const`，成为隐式全局变量。在 V8 非严格模式下可运行但污染全局作用域；若内容脚本运行在严格模式（模块化加载时）将抛出 `ReferenceError`。
- **影响**: 功能性 bug，严格模式下 WebSocket 消息拦截完全失效。
- **建议**: 添加 `let orig_handler` 到 `PatchedWS` 构造函数顶部，或改为闭包内局部变量。
- **置信度**: 高（代码直接可验证）
- **级别**: 严重

### 06-S02 — `onmessage` setter 引用未声明的 `orig_addEventListener`

- **位置**: `src/extension/content/websocket_capture.ts:85-86` vs `:91`
- **现象**: `Object.defineProperty(ws, 'onmessage', { set: function(handler) { ... orig_addEventListener.call(ws, 'message', orig_handler); } })` 中 `orig_addEventListener` 在第 91 行才声明。在 JavaScript 函数作用域下，`var` 声明会被提升（值为 `undefined`），因此 `set` 被调用时如果第 91 行还未执行，`orig_addEventListener` 为 `undefined`，`.call()` 抛出 `TypeError`。
- **触发条件**: 外部代码在 `new PatchedWS()` 返回后、执行第 91 行之前（不可能，因为是同步顺序），实际上这两行在同一个函数体中按顺序执行。严格分析：`Object.defineProperty` 注册了 setter，但 setter 不会立即调用；`orig_addEventListener` 的赋值在第 91 行，同在构造函数体内同步执行完成。因此在正常流程中不会触发问题——`orig_addEventListener` 在 setter 首次被调用前已被赋值。
- **降级为**: 实际无 bug，但代码可读性差，依赖执行顺序的隐式保证。建议重构声明顺序提升可维护性。
- **影响**: 无（正常流程）；可读性/维护性问题。
- **建议**: 将 `orig_addEventListener` 声明移至 `onmessage` setter 之前。
- **置信度**: 高（经详细执行顺序分析）
- **级别**: 低（原评估降级）

### 06-S03 — `onmessage` 被多次赋值时叠加监听

- **位置**: `src/extension/content/websocket_capture.ts:77-89`
- **现象**: 每次 `ws.onmessage = handler` 都会调用 `orig_addEventListener.call(ws, 'message', orig_handler)` 追加一个新的 `message` 事件监听器，但不移除上一次 setter 添加的监听器。如果页面代码多次赋值 `onmessage`，会导致同一消息被多次捕获上报。
- **影响**: WebSocket 采集数据重复，事件数膨胀。常见于框架（如 Socket.IO）内部重连或 handler 更新场景。
- **建议**: 在 setter 中先保存上一个 wrapper 引用，赋新值前调用 `orig_removeEventListener` 移除旧 wrapper；或使用 `addEventListener` 单次注册并始终调用最新 handler。
- **置信度**: 高
- **级别**: 中

### 06-S04 — `removeEventListener` 未 monkey-patch

- **位置**: `src/extension/content/websocket_capture.ts:92-107`
- **现象**: `ws.addEventListener` 被重写以包装 `message` 事件监听器，但 `ws.removeEventListener` 未被重写。当页面代码通过 `removeEventListener` 移除原始 listener 时，wrapper 函数不会被移除（wrapper 引用未知于外部）。
- **影响**: 内存不会泄漏（EventTarget 内部用弱引用），但 wrapper 持续触发捕获，可能产生超出预期的事件。
- **建议**: monkey-patch `removeEventListener`，在 `message_wrappers` 中查找匹配的 `original` 并移除对应的 `wrapper`。
- **置信度**: 高
- **级别**: 中

### 06-S05 — `cache_status` 未转义

- **位置**: `src/extension/dashboard/dashboard_detail.ts:356`
- **现象**: 行 `<span class="v mono">${req.from_cache ? 'from ' + (req.cache_status || 'cache') : 'no cache'}</span>` 中 `req.cache_status` 未经 `esc()` 转义直接插入 HTML。
- **影响**: 若网络响应的缓存控制头部含特殊字符（极端情况下含脚本），可导致存储型 XSS。实际攻击面有限（需中间人修改缓存头），但违反了项目"所有动态内容必须转义"的编码规范。
- **建议**: `from ${esc(req.cache_status || 'cache')}`。
- **置信度**: 高
- **级别**: 严重（规范违反 + 潜在 XSS）

### 06-S06 — 事件列表渲染 O(n^2)

- **位置**: `src/extension/dashboard/dashboard_detail.ts:163`
- **现象**: `render_dt_list()` 中每行都调用 `detail_events.indexOf(e)` 获取事件索引，`indexOf` 是 O(n) 操作，整体复杂度 O(n^2)。
- **影响**: 大采集（>5000 事件）时渲染明显变慢。浏览器任务阻塞。
- **建议**: 在 map 前构建 `WeakMap<CaptureEvent, number>` 索引映射，或改用 `list.map((e, i) => ...)` + 预计算 `detail_events` 到 `list` 的映射。
- **置信度**: 高
- **级别**: 中

### 06-S07 — Shell 全量重建

- **位置**: `src/extension/dashboard/dashboard.ts:35-58`
- **现象**: `render_shell()` 通过 `root.innerHTML = ...` 每次路由切换都销毁并重建整个 shell（sidebar + titlebar + content）。这包括侧边栏宽度状态、滚动位置等全部丢失。
- **影响**: 路由切换时视觉闪烁；sidebar resize handle 的 pointer capture 丢失；如果将来 sidebar 有展开/折叠状态也会丢失。
- **建议**: 将 shell 渲染拆分为一次性初始化 + 仅更新 content 区域。`render_shell` 首次调用构建 shell，后续路由切换调用 `render_content` 更新 `#content`。
- **置信度**: 高
- **级别**: 中

### 06-S08 — Zoom slider 高频全量 DOM 查询

- **位置**: `src/extension/dashboard/dashboard_detail.ts:717-721`
- **现象**: `zoom.addEventListener('input', ...)` 每次滑块移动触发 `apply_zoom_filter()`，该函数 `querySelectorAll('.tl-lane-track')` 后遍历所有 track 下所有 marker（`.tl-tick, .tl-dot, .tl-diamond`），对每个 marker 读取 `style.left` 并计算可见性。
- **影响**: 事件数 >1000 时滑块拖动卡顿，尤其低端设备。
- **建议**: 使用 `requestAnimationFrame` 节流；或缓存 marker 的 `left` 百分比到数组，避免逐个 `parseFloat(style.left)`。
- **置信度**: 高（`parseFloat` 和 `classList` 操作在热路径中）
- **级别**: 中

### 06-S09 — HTML `lang` 属性与内容不完全匹配

- **位置**: `src/extension/dashboard/dashboard.html:3`
- **现象**: `<html lang="zh">` 声明中文，但 dashboard 内混用中英文（如 "Capture All"、"HAR"、"JSONL" 等），且 `lang="zh"` 应为 `lang="zh-CN"` 以区分简繁。
- **影响**: 屏幕阅读器可能错误选择发音引擎。
- **建议**: 改为 `lang="zh-CN"`，对纯英文区块使用 `<span lang="en">` 包裹。
- **置信度**: 中（视产品定位）
- **级别**: 低

### 06-S10 — `render_simple_events` 列数不匹配

- **位置**: `src/extension/dashboard/dashboard_detail.ts:99-102`
- **现象**: `render_simple_events` 的 `headers` 数组长度不一致：`navigation` tab 传入 6 列 headers `['时间', '类型', '事件', 'URL / 来源', '详情', '来源']`，但行模板固定 5 列（`tpl` 为 `'110px 110px 1fr 1fr 90px'`）。第 6 列 header 无对应数据列，且"URL/来源"和"详情"列均未渲染 URL 信息。
- **影响**: 表头与数据列不对齐，用户困惑。
- **建议**: 统一 headers 数量与行模板列数；或动态生成 `tpl` 基于 `headers.length`。
- **置信度**: 高
- **级别**: 低

### 06-S11 — 自定义 switch 无 ARIA

- **位置**: `src/extension/dashboard/dashboard.css:99-102`，使用处如 `dashboard_detail.ts:444`
- **现象**: `.switch` 是纯 `<span>` + CSS 实现的开关控件，无 `role="switch"`、`aria-checked`、`tabindex`，键盘无法操作。
- **影响**: 键盘用户和辅助技术无法使用开关。在"本次配置"页展示的均为只读开关，影响较小；但在设置页（`dashboard_settings.ts`）中同类控件如果是可交互的，问题更严重。
- **建议**: 只读展示场景可加 `aria-disabled="true"` 和 `role="img"`；可交互场景必须使用 `<button role="switch">`。
- **置信度**: 高
- **级别**: 低（本批次仅涉及只读展示）

### 06-S12 — content script 未注入停止页面脚本

- **位置**: `src/extension/content/websocket_capture.ts:119-128`
- **现象**: `inject_page_script()` 将 `PAGE_SCRIPT` 注入页面 DOM 后立即 `s.remove()`，但脚本已执行且 monkey-patch 为永久性。`stop_websocket_capture()` 只移除了 content script 的 `message` 监听器，未移除页面中的 WebSocket monkey-patch。
- **影响**: 采集停止后，页面的 WebSocket `send`/`onmessage` wrapper 仍在运行并 `postMessage`，但因 content script 监听器已移除，这些消息仅浪费页面资源。此外，若其他扩展或脚本监听 `__capture_all_ws__` 信号消息，可能获取残留数据。
- **建议**: 注入时注入带 cleanup 机制的脚本（`stop` 时再注入一个 `__capture_all_ws_stop__` 消息通知页面脚本解除 patch），或在页面脚本中注册 `beforeunload`/stop 事件。优先级低，因扩展上下文安全隔离已限制影响范围。
- **置信度**: 中
- **级别**: 低

---

## 安全专项

### XSS 分析

项目使用 `escape_html`（`src/shared/escape.ts`）对 `& < > " '` 五字符转义，覆盖所有 HTML 注入面。

**已正确转义的位置**:
- `dashboard_captures.ts`: 所有 capture_name/capture_id/URL/统计数据均经 `esc()` 处理
- `dashboard_detail.ts:163-168`: event_title/event_detail/source 均经 `esc()`
- `dashboard_detail.ts:338-339`: request/response headers 均经 `esc()`
- `dashboard_detail.ts:341`: response_body 经 `esc()` 并截断至 8000 字符
- `dashboard_integrations.ts`: 所有动态内容经 `esc()`

**未转义位置**:
- `dashboard_detail.ts:356`: `req.cache_status` — **需修复**

**结论**: XSS 防护整体良好，仅 1 处遗漏。

### WebSocket 信号注入分析

页面脚本通过 `window.postMessage` 发送含 `source: '__capture_all_ws__'` 的消息。content script 在 L145-148 验证 `e.origin === window.location.origin && e.source === window`。同源页面可伪造信号消息，但该场景下攻击者已有同等权限，风险可接受。

### 数据截断

- WebSocket `post()` 函数：data > 200 bytes 时设为 `too_large`，不传预览 — 合理
- response_body 截断至 8000 chars — 合理
- `capture_dur` 对无效日期无保护，`new Date(undefined)` 返回 `NaN`，`dur_ms(NaN)` 返回 `NaN:NaN:NaN` — 低影响 UI 显示异常

---

## 性能专项

| 场景 | 瓶颈 | 影响规模 | 建议 |
|------|------|----------|------|
| Shell 路由切换 | `innerHTML` 全量重写 | 每次导航 | 拆分 shell/content |
| 事件列表渲染 | `indexOf` O(n^2) | >5000 事件 | 预构建索引 |
| Timeline zoom 拖动 | 全量 DOM 查询 | 每次 input 事件 | rAF 节流 + 缓存 |
| Detail page 轮询 | 2s 间隔 `load_detail` + 全量 render | 活跃采集期间 | 仅 diff 更新或增量追加 |
| `render_detail` 字符串拼接 | 大量模板字面量 + join | 每次状态变更 | 考虑虚拟滚动 |

---

## 可访问性专项

| 元素 | 问题 | WCAG | 建议 |
|------|------|------|------|
| `.switch` | 无 role/aria-checked/tabindex | 4.1.2 | `role="switch"` + `aria-checked` |
| `.dt-metric` button | 无 `aria-label`，内容仅为数字 | 1.1.1 | 添加 `aria-label` |
| `.dt-rail-handle` | 拖拽区域无 aria-valuemin/max/now | 4.1.2 | 补充 slider ARIA 属性 |
| `tr[data-ev]` | 点击行选中但无法键盘操作 | 2.1.1 | 添加 `tabindex="0"` + Enter handler |
| Tab 列表 `dt-tabs` | 未使用 `role="tablist"`/`role="tab"` | 4.1.2 | 补充 ARIA tab pattern |
| `<kbd>Cmd+K</kbd>` | 实际快捷键未实现 | - | 实现或移除误导性提示 |
| 面包屑分隔符 `<span class="sep">` | 屏幕阅读器会朗读 "/" | 1.3.1 | `aria-hidden="true"` |
