# src_extension_06 独立审阅报告（current）

## 当前模型判断依据

继承主会话 `default_model`；未设置显式模型覆盖。底层实际模型不可观测，不作额外推断。

## 审阅范围

仅审阅 `docs/review_20260719_0859/MANIFEST.md` 中 `src_extension_06` 清单：

- `src/extension/content/websocket_capture.ts`
- `src/extension/dashboard/dashboard-pages.css`
- `src/extension/dashboard/dashboard.css`
- `src/extension/dashboard/dashboard.html`
- `src/extension/dashboard/dashboard.ts`
- `src/extension/dashboard/dashboard_captures.ts`
- `src/extension/dashboard/dashboard_detail.ts`
- `src/extension/dashboard/dashboard_integrations.ts`

重点：WebSocket、dashboard UI、详情渲染、XSS、状态同步、性能、可访问性。只读静态审阅，未运行构建或测试，未读取其他审阅报告。

## 高优先级问题（CRITICAL / HIGH）

### 1. WebSocket 接收事件按监听器数量重复采集

- 位置：`src/extension/content/websocket_capture.ts:76-107`
- 现象：`onmessage` setter 和每次 `addEventListener('message', ...)` 包装器都各自调用 `post()`。同一 WebSocket 消息若页面注册多个 message listener，会被采集多次；同时使用 `onmessage` 与 `addEventListener` 时同样重复。
- 影响：采集数据不再代表网络帧，而代表 listener 调用次数。事件数、时间线、导出、统计均被放大，可能误导排障和自动分析。
- 建议：每个 WebSocket 实例只注册一个内部原始 `message` 监听器负责采集；页面 listener 保持原生调用链，不在每个业务 listener 包装器内重复 `post()`。
- 置信度：高
- 级别：HIGH

### 2. `removeEventListener` 语义被破坏，造成 listener 泄漏和页面行为异常

- 位置：`src/extension/content/websocket_capture.ts:91-107`
- 现象：`addEventListener('message', original)` 实际注册 `wrapper`，但未覆盖 `removeEventListener` 将 `original` 映射回 `wrapper`。页面调用原生 `removeEventListener('message', original)` 无法移除实际 listener；`message_wrappers` 仅写入，从未读取或清理。
- 影响：被监听页面产生内存泄漏、重复回调、组件卸载后继续处理消息。采集功能改变宿主页面 WebSocket 行为，违反透明注入预期。
- 建议：首选取消 listener 包装，仅用单一内部监听器采集；若必须包装，同时代理 `removeEventListener`，按 listener、capture、options 精确匹配并清理映射。
- 置信度：高
- 级别：HIGH

### 3. 页面脚本可伪造 WebSocket 采集事件

- 位置：`src/extension/content/websocket_capture.ts:11-16,49-56,143-167`
- 现象：content script 只校验 `origin`、`source === window` 和固定公开字符串 `__capture_all_ws__`。页面任意脚本可自行 `window.postMessage()`，构造任意 `ws_url`、方向、预览、大小和状态；字段仅做极弱类型归一化。
- 影响：恶意或被攻陷页面可污染本地采集、伪造敏感 payload、制造大量事件造成存储和 UI 压力。属于数据完整性边界缺失，不是 dashboard DOM XSS，但会污染后续 AI/人工分析输入。
- 建议：注入时生成不可预测、每页面实例独立 nonce，并通过独立 `MessageChannel` 或带 nonce 协议传递；严格校验字段类型、枚举、长度和 URL；在 content script 侧增加速率与数量限制。nonce 不应写入可枚举全局属性。
- 置信度：高
- 级别：HIGH

### 4. 采集列表搜索、筛选、重置控件无功能

- 位置：`src/extension/dashboard/dashboard_captures.ts:52-54,67-71,102-132`
- 现象：页面渲染 `capSearch`、状态筛选按钮和 `capReset`，但 `wire_captures()` 未注册搜索输入、筛选或重置逻辑。输入文字不会改变列表。
- 影响：核心管理页面宣称可搜索和筛选，但实际不可用；采集较多时只能人工滚动查找。
- 建议：将搜索词和筛选条件放入持久 UI state，渲染前过滤 captures；为输入、筛选和重置注册事件，并保留输入值、焦点及可访问状态。
- 置信度：高
- 级别：HIGH

### 5. 导出任务页导出按钮无功能

- 位置：`src/extension/dashboard/dashboard.ts:82-83`；`src/extension/dashboard/dashboard_integrations.ts:29-39`
- 现象：`render_exports()` 生成 `data-export` 按钮，但 exports 路由只设置 `innerHTML`，未调用任何 wiring 函数；该模块也未提供导出按钮事件绑定。
- 影响：用户进入“导出任务”页后无法执行页面唯一主要操作，形成明确功能中断。
- 建议：新增并调用 `wire_exports()`，复用既有 `export_capture()`；处理进行中、成功和失败状态，防止重复点击。
- 置信度：高
- 级别：HIGH

## 中低优先级问题（MEDIUM / LOW）

### 6. 当前采集页统计在采集过程中不刷新

- 位置：`src/extension/dashboard/dashboard.ts:113-127`；`src/extension/dashboard/dashboard_integrations.ts:8-20`
- 现象：轮询只比较 `${capture_id}:${status}`。采集仍为 `capturing` 时，事件数、请求数等 stats 变化不会触发 `render_content()`；当前采集页显示的计数保持旧值，直到状态或清单变化。
- 影响：“实时查看事件流”页面展示陈旧统计，状态同步与文案不一致。
- 建议：比较包含必要 stats/version/updated_at 的轻量签名；更优方案是由 service worker 推送增量变化。当前页至少在存在活跃采集时按节流周期刷新。
- 置信度：高
- 级别：MEDIUM

### 7. 详情轮询每 2 秒全量加载并重建 DOM，破坏交互状态

- 位置：`src/extension/dashboard/dashboard.ts:113-132`；`src/extension/dashboard/dashboard_detail.ts:470-496`
- 现象：活跃详情每轮 `load_detail()` 后直接 `render_content()`，整块详情 DOM 被替换并重新绑定事件。滚动位置、搜索输入、焦点、文本选择和拖拽上下文均可能丢失。
- 影响：长列表查看、键盘操作、检查响应体时页面周期性跳动；数据量增加后产生明显 CPU、GC 和 IndexedDB 读取压力。
- 建议：采用事件推送或增量 diff；把搜索、滚动和选中状态置于显式 state；只有数据版本变化时更新，优先局部更新计数和新增行。
- 置信度：高
- 级别：MEDIUM

### 8. 轮询允许异步任务重叠

- 位置：`src/extension/dashboard/dashboard.ts:113-132`
- 现象：`setInterval(async () => ...)` 不等待上一轮结束。`load_captures()` 或 `load_detail()` 超过 2 秒时，新一轮仍会启动。
- 影响：重复 IndexedDB/消息请求、乱序完成、旧数据覆盖新数据、重复渲染，重负载下进一步恶化性能和状态一致性。
- 建议：使用带 `poll_in_flight` 的互斥保护，或在每轮完成后 `setTimeout()` 调度下一轮；页面隐藏时暂停或降低频率。
- 置信度：高
- 级别：MEDIUM

### 9. 时间线列表和轨道渲染存在 O(n²) 查找

- 位置：`src/extension/dashboard/dashboard_detail.ts:155-169,246-258`
- 现象：遍历事件时反复调用 `detail_events.indexOf(e)`；列表每行调用两次，轨道按类别过滤后再次逐项 `indexOf()`。事件规模增大时扫描次数平方增长。
- 影响：长采集详情渲染卡顿，2 秒全量重渲染会放大问题，可能阻塞主线程并降低可访问性。
- 建议：一次遍历生成 `{ event, index, kind }`；按 kind 建立桶，后续直接使用保存的 index。大数据列表增加分页或虚拟滚动。
- 置信度：高
- 级别：MEDIUM

### 10. 时间线搜索输入在首次过滤后立即丢失

- 位置：`src/extension/dashboard/dashboard_detail.ts:140-147,480`
- 现象：搜索词只存在 DOM input。debounce 回调触发 `render_content()` 后 input 被替换，新 input value 为空；当前一次渲染可能使用旧值完成过滤，但界面不再显示查询词，下一次任意重渲染恢复全量数据。
- 影响：筛选状态不可见、不稳定；轮询、切换视图或选择事件会清除筛选。
- 建议：将查询词保存到 dashboard state，渲染 input 时回填；过滤函数读取 state，不读取即将被销毁的 DOM。
- 置信度：高
- 级别：MEDIUM

### 11. 页面导航详情表头与数据列数不一致

- 位置：`src/extension/dashboard/dashboard_detail.ts:99,388-402`
- 现象：navigation tab 传入 6 个表头，但 `render_simple_events()` 固定 5 列 grid，并且每行只输出 5 个单元格。第六表头进入隐式 grid 列，表头和数据错位。
- 影响：URL/来源/详情语义混淆，页面导航数据难以正确对应列标题；窄屏下布局进一步溢出。
- 建议：为各事件类型定义明确列 schema 和取值函数；navigation 输出与 6 个表头一致的 6 个字段，或删除多余表头并修正文案。
- 置信度：高
- 级别：MEDIUM

### 12. WebSocket `onmessage` 重设不会移除旧 handler

- 位置：`src/extension/content/websocket_capture.ts:76-89`
- 现象：每次赋值非空 `ws.onmessage` 都新增一个原生 listener；设置为 `null` 只修改 `_onmessage`，不移除此前注册的 `orig_handler`。`orig_handler` 还是未声明变量，在非严格脚本中泄漏到全局。
- 影响：旧 handler 继续执行，页面语义偏离原生 WebSocket；多个实例共享全局 `orig_handler` 名称，增加冲突和调试困难。
- 建议：不要重实现 `onmessage`；若保留代理，使用闭包局部变量保存当前 wrapper，setter 前先移除旧 wrapper，`null` 时只移除不新增。
- 置信度：高
- 级别：MEDIUM

### 13. WebSocket 页面注入在 CSP 或 opaque origin 下静默失效

- 位置：`src/extension/content/websocket_capture.ts:13-17,49-57,119-127`
- 现象：通过内联 `<script>.textContent` 注入，可能受页面 CSP 阻止；`window.location.origin` 为 `"null"` 的 opaque origin 页面也可能使 `postMessage` targetOrigin 无效。所有异常均被空 catch 吞掉，无可观测状态。
- 影响：部分页面完全没有 WebSocket 数据，但 UI/采集状态无错误提示，形成静默数据缺口。
- 建议：采用 MV3 支持的 MAIN world 脚本注入机制；为 opaque origin 使用安全兼容通道并继续校验来源；至少上报一次结构化诊断事件，避免逐消息刷日志。
- 置信度：中
- 级别：MEDIUM

### 14. 关键交互依赖鼠标，缺少键盘和辅助技术语义

- 位置：`src/extension/dashboard/dashboard_captures.ts:28-45,106-111`；`src/extension/dashboard/dashboard_integrations.ts:11-15,24-27`；`src/extension/dashboard/dashboard-pages.css:69-75`；`src/extension/dashboard/dashboard_detail.ts:498-583`
- 现象：采集行和当前采集卡片通过 `<tr>`/`<div>` click 打开，无 `tabindex`、键盘处理或链接语义；左右 resize handle 仅监听 mouse，无 `role="separator"`、`aria-orientation`、`aria-valuenow` 或方向键支持。
- 影响：键盘用户无法打开详情或调整面板；屏幕阅读器无法识别交互目的和当前尺寸。
- 建议：将主操作改为真实 `<a>`/`<button>`；resize handle 增加可聚焦 separator 语义和方向键步进，拖拽统一 Pointer Events。
- 置信度：高
- 级别：MEDIUM

### 15. tabs、筛选、选中态缺少 ARIA 状态

- 位置：`src/extension/dashboard/dashboard_detail.ts:78-80,127-137,172-184`；`src/extension/dashboard/dashboard.ts:43-47`
- 现象：视觉状态仅由 `data-on` 表示。详情 tabs 无 `role="tablist"`、`role="tab"`、`aria-selected` 和关联 panel；sidebar 无 `aria-current`；快速筛选无 `aria-pressed`。
- 影响：屏幕阅读器无法获知当前页面、当前 tab 或筛选状态，键盘 tab 交互也不符合常见模式。
- 建议：补充标准 ARIA tab/navigation/toggle 模式，并实现左右方向键切 tab、焦点管理和 panel 关联。
- 置信度：高
- 级别：MEDIUM

### 16. 焦点可见性不足，部分输入显式移除 outline

- 位置：`src/extension/dashboard/dashboard.css:61-73,109-130`；`src/extension/dashboard/dashboard-pages.css:55-62,76-81,84-94,248-265`
- 现象：大量按钮只有 `:hover` 状态，没有 `:focus-visible`；搜索 input 使用 `outline: 0`，容器也无 `:focus-within` 可见反馈。
- 影响：键盘用户难以判断当前焦点，可能不满足 WCAG 2.4.7/2.4.11 相关要求。
- 建议：为所有 button、input、select、链接和自定义控件提供统一高对比 `:focus-visible`；搜索容器用 `:focus-within` 显示边框/外环，不应无替代地移除 outline。
- 置信度：高
- 级别：MEDIUM

### 17. 持续动画未适配 `prefers-reduced-motion`

- 位置：`src/extension/dashboard/dashboard.css:156,200,253`；`src/extension/dashboard/dashboard-pages.css:307`
- 现象：采集中圆点使用无限 pulse 动画，未提供 reduced-motion 覆盖。
- 影响：前庭敏感用户可能不适；同时多个活跃指示器造成持续绘制。
- 建议：增加 `@media (prefers-reduced-motion: reduce)`，关闭或改为静态状态指示；状态不能只依赖动画传达。
- 置信度：高
- 级别：LOW

### 18. 字符串消息大小不是实际字节数

- 位置：`src/extension/content/websocket_capture.ts:21-29,39-47`
- 现象：字符串使用 `.length` 计算 `data_bytes`，得到 UTF-16 code unit 数，不是 UTF-8 传输字节数；200 阈值也按字符单元执行。
- 影响：中文、emoji 等消息大小和截断状态不准确，统计与“bytes”字段语义不符。
- 建议：使用 `TextEncoder().encode(data).byteLength`；明确阈值按 UTF-8 bytes 还是字符数定义。
- 置信度：高
- 级别：LOW

### 19. 大数据详情缺少虚拟化和渲染上限

- 位置：`src/extension/dashboard/dashboard_detail.ts:150-184,228-281,313-385,388-403`
- 现象：事件、网络、控制台列表和轨道 marker 均一次性生成全部 HTML；每次筛选、选择、轮询都整体替换。
- 影响：数万条采集会产生大量字符串、DOM 节点和事件绑定，导致长任务、内存增长、滚动卡顿。
- 建议：列表使用虚拟滚动或分页；轨道按像素聚合 marker；响应体和 headers 按需展开；为可见窗口做增量更新。
- 置信度：高
- 级别：MEDIUM

## XSS 与详情渲染专项结论

本清单内未发现可确认的 dashboard DOM XSS。采集名称、URL、事件标题/详情、headers、请求体、响应体、控制台内容等主要动态值均经过 `esc()` 后进入 `innerHTML`；响应体还限制到 8000 字符显示。此结论仅覆盖当前 8 个文件：`esc()` 实现和图标字典 `I` 位于清单外，未读取，无法验证其具体转义集合及可信来源。

需注意：第 3 项属于跨 world 消息伪造和数据污染，不等同于 DOM XSS；若未来新增未转义渲染、富文本、链接 `href/src` 或动态 style，应分别使用上下文对应编码与 URL scheme 白名单，不能只依赖通用 HTML 转义。

## 改进建议

1. 优先修复 WebSocket 透明性：单内部 listener、保留原生 listener 语义、可信消息通道、严格 schema。
2. 补齐 captures 搜索/筛选和 exports 导出 wiring，加入行为测试，不使用仅检查源码字符串的测试替代真实点击验证。
3. 将 dashboard 数据同步改为推送或带版本的单飞轮询；详情改增量更新，避免周期性销毁 DOM。
4. 统一 dashboard UI state：搜索词、筛选、选中、scroll/focus 独立于 DOM，渲染只消费 state。
5. 为长列表和时间线引入索引预计算、虚拟化/聚合，消除 O(n²) 查找。
6. 建立统一可访问组件约定：真实语义元素、ARIA 状态、键盘操作、`:focus-visible`、reduced motion。

## 不确定项 / 可能误报

- `esc()`、`I`、数据加载函数和状态容器位于本次清单外；XSS 结论基于调用点，无法确认实现细节。
- inline page script 是否在全部目标站点受 CSP 阻止，取决于扩展注入方式、Chrome 版本和页面策略；静默失败风险成立，具体覆盖率需浏览器黑盒测试确认。
- `chrome.tabs.create()` 对特殊 URL scheme 的最终限制未在本清单内验证；当前未将其列为确认漏洞。
