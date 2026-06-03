# Record All — 待完成任务

## 一、网络请求补全

### 1.1 Request Headers 捕获
- 当前 `request_headers: {}` 空的
- 需要：`chrome.webRequest.onBeforeSendHeaders` 监听
- 脱敏：authorization、cookie、set-cookie、x-api-key 等替换为 `[REDACTED]`

### 1.2 Response Headers 捕获
- 当前 `response_headers: {}` 空的
- 需要：`chrome.webRequest.onHeadersReceived` 监听
- 脱敏：set-cookie、www-authenticate 等

### 1.3 Request Body 捕获
- 当前没抓
- 需要：`onBeforeRequest` 的 `requestBody` 字段
- 截断 10KB
- Content-Type 判断（form-data / json / raw）

### 1.4 Response Body 捕获（方案 B）
- 当前没抓
- 需要：`chrome.debugger` 的 `Network.getResponseBody`
- 失败时记录 status：`not_enabled` / `failed` / `too_large` / `unsupported`
- 截断 50KB

### 1.5 Cookie 变化记录
- 当前没做
- 需要：`chrome.cookies.onChanged` 监听
- 记录：name、domain、path、cause（explicit / expired / overwrite）
- 不记录 cookie 值（隐私），只记录元数据变化

### 1.6 fetch/XHR 元数据拦截
- 当前没做
- 需要：content script 中注入 `fetch` + `XMLHttpRequest` wrapper
- 记录：method、url、status、duration
- 配合 `webRequest` 补充 body 数据

## 二、Tab 事件补全

### 2.1 Tab 打开
- 当前没做
- 需要：`chrome.tabs.onCreated` 监听
- 记录：tabId、url、openerTabId、windowId

### 2.2 Tab URL 变化
- 当前没做
- 需要：`chrome.tabs.onUpdated` 监听（filter: `status: 'loading'`）
- 记录：tabId、url、title

## 三、页面事件补全

### 3.1 popstate / hashchange
- 当前没做
- 需要：content script 中监听
- SPA 路由切换不会触发 navigation 事件，需要这两个补上

### 3.2 DOMContentLoaded
- 当前没做
- 需要：content script 中记录 `DOMContentLoaded` 时间点

## 四、DOM 定位增强

### 4.1 完整 CSS 路径
- 当前只返回 `#id` 或 `.className` 或 `tagName`
- 需要：生成完整路径如 `div.container > ul.list > li:nth-child(3) > button.submit`
- 优先用 id，其次用 class + nth-child

### 4.2 XPath（可选）
- 作为 CSS 路径的补充
- 用于复杂 DOM 结构定位

## 五、Console / 异常

### 5.1 JS 异常捕获
- 当前没做
- 需要：`Runtime.exceptionThrown` 监听（方案 B debugger 路径）
- 记录：message、source、line、column、stack

## 六、Storage 变化

### 6.1 localStorage 变化
- 当前没做
- 需要：content script 中拦截 `localStorage.setItem/removeItem/clear`
- 记录：key、action（set/remove/clear）、value 长度（不记录值）

### 6.2 sessionStorage 变化
- 同上，拦截 `sessionStorage` 方法

## 七、导出格式

### 7.1 HAR 导出
- 当前没做
- HAR = HTTP Archive，Chrome DevTools 原生格式
- 可以导入回 DevTools / Fiddler / Charles 重放
- 结构：`{ log: { version, entries: [{request, response, timings}] } }`
- **优先级高** — 用户可以直接在 DevTools 里打开

### 7.2 JSONL 导出
- 优先级低，可跳过

## 八、测试补全

### 8.1 网络捕获测试
- 验证 headers 脱敏
- 验证 body 截断
- 验证 cookie 元数据记录

### 8.2 View 按钮 E2E 测试
- ✅ 已有（CSP 修复后）

### 8.3 Tab 事件 E2E 测试
- 打开/关闭/切换/URL 变化

## 九、已知 Bug

### 9.1 HTML 导出统计数字始终为 0
- HTML 报告显示 Events: 0、Network Requests: 0、Console Logs: 0
- 详情页 overview 同样显示 0
- 原因 1：Session 创建时 `stats` 全设为 0，之后从未更新
- 原因 2：`handle_event` / `handle_network_request` / `handle_console_log` 只写数据，不更新 session.stats
- 原因 3：exporter 和 detail page 用的是 `session.stats.*_count` 而非实际数据长度
- 修复：要么在每个 handle 函数中更新 session.stats 并 update_session，要么 exporter/detail 改用 `events.length` / `network_requests.length` / `console_logs.length`

---

## 优先级排序

| 优先级 | 任务 | 原因 |
|--------|------|------|
| P0 | 1.1-1.4 Headers + Body | 核心功能，用户明确要求 |
| P0 | 4.1 完整 CSS 路径 | 用户明确要求 |
| P1 | 2.1-2.2 Tab 打开/URL 变化 | 用户明确要求 |
| P1 | 1.5 Cookie 变化 | 用户明确要求 |
| P1 | 7.1 HAR 导出 | 实用价值高 |
| P2 | 3.1 popstate/hashchange | SPA 必需 |
| P2 | 1.6 fetch/XHR 拦截 | 补充 webRequest |
| P2 | 5.1 JS 异常 | 方案 B 有价值 |
| P3 | 6.1-6.2 Storage 变化 | 锦上添花 |
| P3 | 4.2 XPath | 可选 |
| P3 | 7.2 JSONL | 可跳过 |
