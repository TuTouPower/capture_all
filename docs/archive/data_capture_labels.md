# Record All 数据采集标签一览

所有事件共享公共字段：`session_id`, `relative_time`, `absolute_time`, `tab_id`, `frame_id`, `url`。

共七大类：用户操作、网络请求、页面导航、Storage、Cookie、控制台日志、运行时异常

---

## 一、用户操作

### mouse — 鼠标（content/mouse_capture.ts）

| 字段 | 类型 | 说明 |
|------|------|------|
| `action` | `click` \| `dblclick` \| `contextmenu` \| `mousemove` \| `mousedown` \| `mouseup` \| `wheel` \| `dragstart` \| `dragend` | 鼠标动作 |
| `x` | number | clientX 坐标 |
| `y` | number | clientY 坐标 |
| `button` | number | 鼠标按键编号 |
| `target_selector` | string | CSS 选择器 |
| `target_xpath` | string | XPath |
| `target_tag` | string | HTML 标签名 |
| `target_text` | string | 元素文本（截断 100 字符，可脱敏） |

### keyboard — 键盘（content/keyboard_capture.ts）

| 字段 | 类型 | 说明 |
|------|------|------|
| `action` | `keydown` \| `keyup` | 键盘动作 |
| `key` | string | 按键值 |
| `code` | string | 物理按键码 |
| `target_selector` | string | CSS 选择器 |
| `target_xpath` | string | XPath |
| `modifiers` | `{ ctrl, shift, alt, meta }` | 修饰键状态 |

### scroll — 滚动（content/scroll_capture.ts）

| 字段 | 类型 | 说明 |
|------|------|------|
| `scroll_x` | number | 水平滚动偏移 |
| `scroll_y` | number | 垂直滚动偏移 |
| `scroll_height` | number | 文档总高度 |
| `scroll_width` | number | 文档总宽度 |

### dom_change — DOM 变更（content/dom_capture.ts）

| 字段 | 类型 | 说明 |
|------|------|------|
| `action` | `input` \| `change` \| `focus` \| `blur` | DOM 事件类型 |
| `target_selector` | string | CSS 选择器 |
| `target_xpath` | string | XPath |
| `target_tag` | string | HTML 标签名 |
| `value` | string | 输入值（password 脱敏，可配置关闭采集） |

---

## 二、网络请求

### fetch_request — Fetch 请求（content/xhr_fetch_capture.ts）

| 字段 | 类型 | 说明 |
|------|------|------|
| `method` | string | HTTP 方法 |
| `url` | string | 请求 URL |
| `status` | number | HTTP 状态码 |
| `duration_ms` | number | 耗时（毫秒） |

### xhr_request — XHR 请求（content/xhr_fetch_capture.ts）

| 字段 | 类型 | 说明 |
|------|------|------|
| `method` | string | HTTP 方法 |
| `url` | string | 请求 URL |
| `status` | number | HTTP 状态码 |
| `duration_ms` | number | 耗时（毫秒） |

### network_body_hook — 降级响应体捕获（content/network_hook.ts）

CDP 和外部 bridge 均不可用时的兜底方案，通过 content script hook fetch/XHR 获取响应体。

| 字段 | 类型 | 说明 |
|------|------|------|
| `method` | string | HTTP 方法 |
| `url` | string | 请求 URL |
| `status` | number | HTTP 状态码 |
| `duration_ms` | number | 耗时（毫秒） |
| `response_body` | string \| null | 响应体文本（截断） |
| `response_body_status` | `captured` \| `too_large` \| `failed` \| `unsupported` | 捕获状态 |
| `request_body` | null | 降级模式不采集 |
| `request_body_status` | `not_enabled` | 固定值 |

### NetworkRequest — 完整网络请求（background/network_capture.ts）

独立存储，非 RecordEvent。通过 webRequest API 采集完整请求信息。

| 字段 | 类型 | 说明 |
|------|------|------|
| `method` | string | HTTP 方法 |
| `url` | string | 请求 URL（可脱敏 query 参数） |
| `status_code` | number | HTTP 状态码 |
| `request_headers` | Record\<string, string\> | 请求头（可脱敏敏感头） |
| `response_headers` | Record\<string, string\> | 响应头（可脱敏敏感头） |
| `request_body` | string \| null | 请求体 |
| `request_body_status` | `captured` \| `not_enabled` \| `failed` \| `too_large` | 请求体捕获状态 |
| `response_body` | string \| null | 响应体 |
| `response_body_status` | `captured` \| `not_enabled` \| `failed` \| `too_large` \| `unsupported` | 响应体捕获状态 |
| `resource_type` | string | 资源类型 |
| `duration_ms` | number | 耗时 |

Body 采集模式（BodyCaptureMode）：
- `none` — 不采集
- `extension_cdp` — 扩展自带 CDP（chrome.debugger）
- `external_cdp_bridge` — 外部 CDP bridge
- `fallback_hook` — content script fetch/XHR hook 降级

---

## 三、页面导航

### navigation — 页面导航（background/service_worker.ts）

### page_load — 页面加载（background/service_worker.ts）

### tab_switch — Tab 切换（background/service_worker.ts）

### tab_created — Tab 创建（background/service_worker.ts）

### tab_url_change — Tab URL 变化（background/service_worker.ts）

### dom_ready — DOM Ready（content/content_script.ts）

以上类型由 background/service_worker.ts 和 content/content_script.ts 生成，携带对应导航数据（URL、tab 信息等）。

---

## 四、Storage

### storage_change — localStorage/sessionStorage 变更（content/storage_capture.ts）

通过注入页面脚本 hook `setItem`/`removeItem`/`clear`，记录存储变更。不记录具体值，只记录 key 和值长度。

| 字段 | 类型 | 说明 |
|------|------|------|
| `storage_type` | `local` \| `session` | localStorage 或 sessionStorage |
| `action` | `set` \| `remove` \| `clear` | 操作类型 |
| `key` | string \| null | 键名（clear 时为 null） |
| `value_length` | number | 值长度（不记录值本身） |

---

## 五、Cookie

### cookie_change — Cookie 变更（background/cookie_capture.ts）

通过 `chrome.cookies.onChanged` 监听浏览器 Cookie 变更。不记录 cookie value，只记录元信息。

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | Cookie 名称 |
| `domain` | string | 域名 |
| `path` | string | 路径 |
| `cause` | `explicit` \| `expired` \| `evicted` \| `overwrite` \| `unknown` | 变更原因 |
| `removed` | boolean | 是否被删除 |

---

## 六、控制台日志

### ConsoleLog — console 输出（background/console_capture.ts）

独立存储，非 RecordEvent。通过 `chrome.debugger` attach → `Runtime.enable` → 监听 `Runtime.consoleAPICalled` 采集页面 `console.log`/`warn`/`info`/`debug` 等输出。

| 字段 | 类型 | 说明 |
|------|------|------|
| `level` | string | `log` / `warn` / `info` / `debug` 等，对应 console 方法名 |
| `args` | string[] | 参数列表（截断） |
| `stack_trace` | string \| null | 调用堆栈描述 |
| `url` | string | 来源文件 URL |
| `line` | number | 行号 |
| `column` | number | 列号 |

---

## 七、运行时异常

### ConsoleLog — JS 未捕获异常（background/exception_capture.ts）

独立存储，非 RecordEvent。通过 `chrome.debugger` attach → `Runtime.enable` → 监听 `Runtime.exceptionThrown` 采集页面 JavaScript 运行时未捕获的异常。

与控制台日志共用 `ConsoleLog` 类型存储，`level` 固定为 `error`。

**捕获范围：**
- 未被 `try/catch` 捕获的 `throw` 抛出的错误
- TypeError（如 `undefined is not a function`、`Cannot read property of null`）
- ReferenceError（引用未定义变量）
- RangeError（如栈溢出）
- SyntaxError（动态 eval/Function 中的语法错误）
- 异步代码中未处理的错误（Promise 内部抛出、setTimeout 回调异常等）

**不捕获：**
- 已被 `try/catch` 捕获的异常（不会触发 `Runtime.exceptionThrown`）
- `Promise.reject` 未处理（部分情况，取决于浏览器实现）

| 字段 | 类型 | 说明 |
|------|------|------|
| `level` | string | 固定 `error` |
| `args` | string[] | 异常消息（取自 `exception.description` 或 `exceptionDetails.text`） |
| `stack_trace` | string \| null | 完整异常堆栈 |
| `url` | string | 异常发生的源文件 URL |
| `line` | number | 行号 |
| `column` | number | 列号 |
