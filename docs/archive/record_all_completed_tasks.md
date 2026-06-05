# Record All — 已完成任务归档

归档时间：2026-06-05

## 一、网络请求补全

### 1.1 Request Headers 捕获 — ✅ 已完成
- 完成提交：`2cbda34 feat: capture request/response headers and body, fix stats bug`
- 实现：`chrome.webRequest.onBeforeSendHeaders` 监听
- 脱敏：authorization、cookie、set-cookie、x-api-key 等替换为 `[REDACTED]`
- **Cookie 来源**：请求带的 cookie 在 `cookie` header 中，记录 cookie 名（脱敏值）

### 1.2 Response Headers 捕获 — ✅ 已完成
- 完成提交：`2cbda34 feat: capture request/response headers and body, fix stats bug`
- 实现：`chrome.webRequest.onHeadersReceived` 监听
- 脱敏：set-cookie、www-authenticate 等
- **Cookie 来源**：服务器设置的 cookie 在 `set-cookie` header 中，记录 cookie 名（脱敏值）

### 1.3 Request Body 捕获 — ✅ 已完成
- 完成提交：`2cbda34 feat: capture request/response headers and body, fix stats bug`
- 实现：`onBeforeRequest` 的 `requestBody` 字段
- 截断 10KB
- Content-Type 判断（form-data / json / raw）

### 1.4 Response Body 捕获（方案 B）— ✅ 已完成
- 完成提交：`2cbda34 feat: capture request/response headers and body, fix stats bug`
- 实现：`chrome.debugger` 的 `Network.getResponseBody`
- 失败时记录 status：`not_enabled` / `failed` / `too_large` / `unsupported`
- 截断 50KB

### 1.5 Cookie 变化记录 — ✅ 已完成
- 完成提交：`33d1304 feat: cookie change tracking and fetch/XHR interception`
- 实现：`chrome.cookies.onChanged` 监听
- 记录：name、domain、path、cause（explicit / expired / overwrite）
- 不记录 cookie 值（隐私），只记录元数据变化

### 1.6 fetch/XHR 元数据拦截 — ✅ 已完成
- 完成提交：`33d1304 feat: cookie change tracking and fetch/XHR interception`
- 实现：content script 中注入 `fetch` + `XMLHttpRequest` wrapper
- 记录：method、url、status、duration
- 配合 `webRequest` 补充 body 数据

## 二、Tab 事件补全

### 2.1 Tab 打开 — ✅ 已完成
- 完成提交：`82d9c4d feat: tab events, page navigation, CSS path, JS exception, storage tracking`
- 实现：`chrome.tabs.onCreated` 监听
- 记录：tabId、url、openerTabId、windowId

### 2.2 Tab URL 变化 — ✅ 已完成
- 完成提交：`82d9c4d feat: tab events, page navigation, CSS path, JS exception, storage tracking`
- 实现：`chrome.tabs.onUpdated` 监听
- 记录：tabId、url、title

## 三、页面事件补全

### 3.1 popstate / hashchange — ✅ 已完成
- 完成提交：`82d9c4d feat: tab events, page navigation, CSS path, JS exception, storage tracking`
- 实现：content script 中监听
- 用于补上 SPA 路由切换

### 3.2 DOMContentLoaded — ✅ 已完成
- 完成提交：`82d9c4d feat: tab events, page navigation, CSS path, JS exception, storage tracking`
- 实现：content script 中记录 `DOMContentLoaded` 时间点

## 四、DOM 定位增强

### 4.1 完整 CSS 路径 — ✅ 已完成
- 完成提交：`82d9c4d feat: tab events, page navigation, CSS path, JS exception, storage tracking`
- 实现：生成完整路径如 `div.container > ul.list > li:nth-child(3) > button.submit`
- 优先用 id，其次用 class + nth-child

### 4.2 XPath — ✅ 已完成
- 完成提交：`ef78b6f feat: XPath support for DOM event targeting`
- 作为 CSS 路径的补充
- 用于复杂 DOM 结构定位

## 五、Console / 异常

### 5.1 JS 异常捕获 — ✅ 已完成
- 完成提交：`82d9c4d feat: tab events, page navigation, CSS path, JS exception, storage tracking`
- 实现：`Runtime.exceptionThrown` 监听（方案 B debugger 路径）
- 记录：message、source、line、column、stack

## 六、Storage 变化

### 6.1 localStorage 变化 — ✅ 已完成
- 完成提交：`82d9c4d feat: tab events, page navigation, CSS path, JS exception, storage tracking`
- 实现：content script 中拦截 `localStorage.setItem/removeItem/clear`
- 记录：key、action（set/remove/clear）、value 长度（不记录值）

### 6.2 sessionStorage 变化 — ✅ 已完成
- 完成提交：`82d9c4d feat: tab events, page navigation, CSS path, JS exception, storage tracking`
- 实现：content script 中拦截 `sessionStorage` 方法

## 七、导出格式

### 7.1 HAR 导出 — ✅ 已完成
- 完成提交：`c693509 feat: HAR export for network recordings`
- 修正提交：`e7a052d fix: add exportHar to I18nStrings type`
- HAR = HTTP Archive，Chrome DevTools 原生格式
- 可以导入回 DevTools / Fiddler / Charles 重放
- 结构：`{ log: { version, entries: [{request, response, timings}] } }`

### 7.2 JSONL 导出 — ✅ 已完成
- 完成提交：`778ac21 feat: JSONL export (newline-delimited JSON)`

## 八、测试补全

### 8.1 网络捕获测试 — ✅ 已完成
- 完成提交：`7619840 test: network capture and tab event unit tests`
- 验证 headers 脱敏
- 验证 body 截断
- 验证 cookie 元数据记录

### 8.2 View 按钮 E2E 测试 — ✅ 已完成
- 完成提交：`bff931e fix: CSP-safe history buttons + View button test`

### 8.3 Tab 事件 E2E 测试 — ✅ 已完成
- 完成提交：`7619840 test: network capture and tab event unit tests`
- 覆盖打开/关闭/切换/URL 变化相关逻辑

## 九、已知 Bug

### 9.1 HTML 导出统计数字始终为 0 — ✅ 已修复
- 修复提交：`2cbda34 feat: capture request/response headers and body, fix stats bug`
- 原问题：HTML 报告显示 Events: 0、Network Requests: 0、Console Logs: 0
- 原问题：详情页 overview 同样显示 0

## 十、设置完善

### 10.1 脱敏开关 — ✅ 已完成
- 完成提交：`d14138d feat: settings persistence, redaction toggle, theme support`
- `RecordConfig` 新增 `redact_data: boolean`，默认 `true`
- 所有脱敏调用处检查此字段，`false` 时不脱敏不截断
- 设置面板加开关控制默认值
- 录制开始前读用户设置填入 config

### 10.2 主题模式 — ✅ 已完成
- 完成提交：`d14138d feat: settings persistence, redaction toggle, theme support`
- 设置面板新增“主题”下拉：跟随系统 / 浅色 / 深色
- 默认“跟随系统”（`matchMedia('prefers-color-scheme: dark')`）
- 影响：popup.css、detail.css 双主题
- 设置值存 `chrome.storage.local`

### 10.3 持久化所有用户设置 — ✅ 已完成
- 完成提交：`d14138d feat: settings persistence, redaction toggle, theme support`
- 打开 popup 时从 `chrome.storage.local` 恢复所有设置
- 覆盖范围：
  - 录制模式（basic/advanced）
  - 鼠标精度
  - 键盘捕获模式
  - 输入值捕获开关
  - 请求体捕获开关
  - 响应体捕获开关
  - 脱敏开关
  - 主题模式
  - 语言选择
- 存储结构存 `chrome.storage.local.user_config`
