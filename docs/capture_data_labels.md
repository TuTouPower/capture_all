# Capture All 数据采集标签文档

版本：v1.0
适用范围：Capture All 浏览器扩展 / 主面板 / Popup / 采集详情 / 导出数据
关键词统一：

| 中文         | 英文             |
| ------------ | ---------------- |
| 采集         | Capture          |
| 采集中       | Capturing        |
| 采集记录     | Capture          |
| 采集记录列表 | Captures         |
| 采集详情     | Capture Details  |
| 标准采集     | Standard Capture |
| 深度采集     | Deep Capture     |

---

## 1. 设计原则

Capture All 的数据采集标签需要同时服务三个目标：

1. **用户理解**：用户在 Popup、主面板、采集详情里能快速知道采集了什么。
2. **问题复盘**：采集详情页可以还原用户操作、页面导航、网络请求、控制台、Storage、Cookie、DOM 等证据链。
3. **安全可控**：默认不采集敏感数据，所有可能包含敏感信息的数据都必须有采集状态、脱敏状态和大小限制。

本版本将采集标签分为以下九类：

| 分类 Key              | 中文名称     | 英文名称          | 是否用户可见 | 说明                                                            |
| --------------------- | ------------ | ----------------- | ------------ | --------------------------------------------------------------- |
| `user_action`       | 用户行为     | User Actions      | 是           | 鼠标、键盘、滚动、输入、表单交互                                |
| `navigation`        | 页面导航     | Navigation        | 是           | 页面跳转、SPA 路由、Tab 切换、页面加载                          |
| `network`           | 网络请求     | Network           | 是           | Fetch、XHR、Document、资源请求、请求体、响应体                  |
| `console`           | 控制台       | Console           | 是           | console.log / warn / error / debug 等                           |
| `error`             | 错误异常     | Errors            | 是           | 运行时异常、未处理 Promise、资源错误、失败请求                  |
| `storage`           | Storage      | Storage           | 是           | localStorage、sessionStorage，未来扩展 IndexedDB、Cache Storage |
| `cookie`            | Cookie       | Cookie            | 是           | Cookie 新增、修改、删除、过期、覆盖                             |
| `dom_data`          | DOM 数据     | DOM Data          | 是，未来增强 | DOM 结构变化、属性变化、文本变化、DOM 快照                      |
| `capture_lifecycle` | 采集生命周期 | Capture Lifecycle | 部分可见     | 采集开始、结束、配置变化、权限问题、采集失败等                  |

---

## 2. 数据模型总览

### 2.1 Capture Record / 采集记录

一次从开始采集到停止采集产生的数据包称为一个 Capture。

| 字段                | 类型             | 说明                                                        |
| ------------------- | ---------------- | ----------------------------------------------------------- |
| `capture_id`      | string           | 采集记录 ID                                                 |
| `name`            | string           | 采集记录名称，例如“今天 14:32 的采集”                     |
| `status`          | `capturing`    | `completed`                                               |
| `mode`            | `standard`     | `deep`                                                    |
| `started_at`      | string           | 开始时间，ISO 字符串                                        |
| `ended_at`        | string           | null                                                        |
| `duration_ms`     | number           | 采集时长                                                    |
| `start_url`       | string           | 开始采集时页面 URL                                          |
| `end_url`         | string           | null                                                        |
| `tab_id`          | number           | 浏览器 tab ID                                               |
| `window_id`       | number           | null                                                        |
| `config_snapshot` | object           | 本次采集开始时的配置快照                                    |
| `stats`           | object           | 事件数、请求数、错误数、Storage 变化数、Cookie 变化数等统计 |
| `export_status`   | `not_exported` | `exported`                                                |
| `tags`            | string[]         | 用户自定义标签                                              |
| `created_at`      | string           | 创建时间                                                    |
| `updated_at`      | string           | 更新时间                                                    |

兼容说明：如果历史代码中已有 `session_id`，可以继续内部兼容，但 UI、导出文档和新字段命名应统一使用 `capture_id`。

---

### 2.2 Capture Event / 采集事件公共字段

所有事件共享以下公共字段。

| 字段                  | 类型               | 说明                                                    |
| --------------------- | ------------------ | ------------------------------------------------------- |
| `event_id`          | string             | 事件 ID                                                 |
| `capture_id`        | string             | 所属采集记录 ID                                         |
| `category`          | string             | 一级分类，例如 `network`、`user_action`             |
| `type`              | string             | 具体事件类型，例如 `mouse_event`、`network_request` |
| `relative_time_ms`  | number             | 相对采集开始时间，单位毫秒                              |
| `absolute_time`     | string             | 绝对时间，ISO 字符串                                    |
| `tab_id`            | number             | 浏览器 tab ID                                           |
| `frame_id`          | number             | frame ID                                                |
| `url`               | string             | 当前页面 URL                                            |
| `top_frame_url`     | string             | null                                                    |
| `page_title`        | string             | null                                                    |
| `source`            | `content_script` | `background`                                          |
| `severity`          | `info`           | `warning`                                             |
| `related_event_ids` | string[]           | 相关事件 ID，用于串联问题证据链                         |
| `redaction_status`  | `none`           | `redacted`                                            |
| `raw_available`     | boolean            | 是否保留原始数据                                        |
| `created_at`        | string             | 事件创建时间                                            |

---

## 3. 采集模式

### 3.1 Standard Capture / 标准采集

标准采集目标：轻量、安全、适合常规 bug 复现。

默认开启：

| 能力     | 默认策略                                                              |
| -------- | --------------------------------------------------------------------- |
| 用户行为 | 采集点击、滚动、快捷键、输入事件摘要                                  |
| 页面导航 | 采集页面跳转、SPA 路由、Tab 切换、页面加载                            |
| 网络请求 | 采集 URL、method、status、duration、resource type、initiator          |
| 控制台   | 采集 warn、error，log/info 可配置                                     |
| 错误异常 | 采集运行时异常、未处理 Promise、资源错误                              |
| Storage  | 采集 localStorage/sessionStorage 的 key 和 value length，不采集 value |
| Cookie   | 采集 name、domain、path、cause、removed，不采集 value                 |
| 脱敏     | 默认开启                                                              |

默认关闭：

| 能力                      | 原因                                 |
| ------------------------- | ------------------------------------ |
| 请求体                    | 可能包含账号、表单、token 等敏感信息 |
| 响应体                    | 可能体积大，且可能包含用户数据       |
| 输入值明文                | 隐私风险高                           |
| 完整 DOM 快照             | 体积大，且可能包含敏感内容           |
| IndexedDB / Cache Storage | 复杂度高，第一版不默认采集           |

---

### 3.2 Deep Capture / 深度采集

深度采集目标：更完整地复盘复杂问题，但必须控制隐私和体积。

默认可开启：

| 能力     | 默认策略                                           |
| -------- | -------------------------------------------------- |
| 请求头   | 采集并脱敏敏感 header                              |
| 响应头   | 采集并脱敏敏感 header                              |
| 请求体   | 仅采集 text/json/form，默认脱敏，有大小限制        |
| 响应体   | 默认采集预览或同源 JSON/text，完整采集需要明确开启 |
| 输入值   | 默认脱敏后采集，不采集 password                    |
| DOM 数据 | 采集 DOM mutation 摘要，不默认采集完整 DOM         |
| Storage  | 仍然默认不采集 value，可在高级设置打开             |
| Cookie   | 仍然默认不采集 value，强烈不建议采集 value         |

---

### 3.3 Custom Capture / 自定义采集

当用户在标准采集或深度采集基础上手动调整开关时，本次采集模式显示为：

中文：`自定义采集`
英文：`Custom Capture`

---

## 5. 用户行为 / User Actions

分类 Key：`user_action`

用户行为用于回答：

> 用户在问题发生前做了什么？

包含鼠标、键盘、滚动、输入、表单交互。

---

### 5.1 `mouse_event` — 鼠标事件

| 字段                    | 类型      | 说明         |
| ----------------------- | --------- | ------------ |
| `action`              | `click` | `dblclick` |
| `x`                   | number    | clientX 坐标 |
| `y`                   | number    | clientY 坐标 |
| `button`              | number    | null         |
| `target_selector`     | string    | null         |
| `target_xpath`        | string    | null         |
| `target_tag`          | string    | null         |
| `target_text_preview` | string    | null         |
| `target_role`         | string    | null         |
| `target_label`        | string    | null         |
| `target_rect`         | object    | null         |
| `is_trusted`          | boolean   | null         |

采集策略：

| 模式       | 策略                                                         |
| ---------- | ------------------------------------------------------------ |
| 标准采集   | 采集 click、dblclick、contextmenu、wheel、dragstart、dragend |
| 深度采集   | 可采集 mousedown、mouseup                                    |
| 默认不建议 | 高频 mousemove，除非节流或采样                               |

---

### 5.2 `keyboard_event` — 键盘事件

| 字段                  | 类型                                                               | 说明       |
| --------------------- | ------------------------------------------------------------------ | ---------- |
| `action`            | `keydown`                                                        | `keyup`  |
| `key`               | string                                                             | null       |
| `code`              | string                                                             | null       |
| `key_status`        | `captured`                                                       | `masked` |
| `modifiers`         | `{ ctrl: boolean, shift: boolean, alt: boolean, meta: boolean }` | 修饰键状态 |
| `target_selector`   | string                                                             | null       |
| `target_xpath`      | string                                                             | null       |
| `target_tag`        | string                                                             | null       |
| `target_input_type` | string                                                             | null       |

采集策略：

| 情况                         | 策略                               |
| ---------------------------- | ---------------------------------- |
| 普通字符输入                 | 默认不记录具体字符                 |
| Enter / Escape / Tab / Arrow | 可记录                             |
| Ctrl / Cmd 快捷键            | 可记录组合键                       |
| password 输入框              | 不记录具体 key                     |
| 深度采集                     | 仍默认脱敏，不建议记录完整键入内容 |

---

### 5.3 `scroll_event` — 滚动事件

| 字段                   | 类型    | 说明             |
| ---------------------- | ------- | ---------------- |
| `scroll_x`           | number  | 水平滚动偏移     |
| `scroll_y`           | number  | 垂直滚动偏移     |
| `scroll_height`      | number  | 文档或容器总高度 |
| `scroll_width`       | number  | 文档或容器总宽度 |
| `viewport_height`    | number  | null             |
| `viewport_width`     | number  | null             |
| `target_selector`    | string  | null             |
| `target_xpath`       | string  | null             |
| `is_document_scroll` | boolean | 是否为页面级滚动 |

采集策略：

| 模式     | 策略               |
| -------- | ------------------ |
| 标准采集 | 节流采集           |
| 深度采集 | 可提高采样频率     |
| 导出报告 | 可只展示关键滚动点 |

---

### 5.4 `input_event` — 输入事件

原 `dom_change` 中的 `input/change/focus/blur` 不再称为 DOM 变更。它们属于用户输入或表单交互。

| 字段                  | 类型             | 说明         |
| --------------------- | ---------------- | ------------ |
| `action`            | `input`        | `change`   |
| `target_selector`   | string           | null         |
| `target_xpath`      | string           | null         |
| `target_tag`        | string           | null         |
| `target_input_type` | string           | null         |
| `field_name`        | string           | null         |
| `field_label`       | string           | null         |
| `value_status`      | `not_captured` | `captured` |
| `value_preview`     | string           | null         |
| `value_length`      | number           | null         |
| `checked`           | boolean          | null         |
| `selected_count`    | number           | null         |

采集策略：

| 数据                  | 标准采集     | 深度采集   |
| --------------------- | ------------ | ---------- |
| focus / blur          | 采集         | 采集       |
| input / change        | 采集摘要     | 采集摘要   |
| value                 | 不采集或脱敏 | 脱敏后采集 |
| password              | 不采集       | 不采集     |
| email / phone / token | 脱敏         | 脱敏       |

---

## 6. 页面导航 / Navigation

分类 Key：`navigation`

页面导航用于回答：

> 页面去了哪里？用户在哪个页面或路由上触发了问题？

---

### 6.1 `page_navigation` — 页面跳转

| 字段                | 类型     | 说明         |
| ------------------- | -------- | ------------ |
| `from_url`        | string   | null         |
| `to_url`          | string   | 跳转后 URL   |
| `navigation_type` | `link` | `reload`   |
| `transition_type` | string   | null         |
| `title`           | string   | null         |
| `referrer`        | string   | null         |
| `is_main_frame`   | boolean  | 是否主 frame |

---

### 6.2 `route_change` — SPA 路由变化

| 字段             | 类型           | 说明              |
| ---------------- | -------------- | ----------------- |
| `from_url`     | string         | 变化前 URL        |
| `to_url`       | string         | 变化后 URL        |
| `route_action` | `push_state` | `replace_state` |
| `from_path`    | string         | null              |
| `to_path`      | string         | null              |
| `title`        | string         | null              |
| `is_spa`       | boolean        | 是否 SPA 路由变化 |

---

### 6.3 `page_load` — 页面加载

| 字段                           | 类型   | 说明     |
| ------------------------------ | ------ | -------- |
| `url`                        | string | 页面 URL |
| `title`                      | string | null     |
| `load_event_time_ms`         | number | null     |
| `dom_content_loaded_time_ms` | number | null     |
| `navigation_start_time`      | string | null     |

---

### 6.4 `dom_ready` — DOM Ready

| 字段            | 类型        | 说明            |
| --------------- | ----------- | --------------- |
| `url`         | string      | 页面 URL        |
| `title`       | string      | null            |
| `ready_state` | `loading` | `interactive` |

---

### 6.5 `tab_switch` — Tab 切换

| 字段            | 类型   | 说明       |
| --------------- | ------ | ---------- |
| `from_tab_id` | number | null       |
| `to_tab_id`   | number | 切换后 tab |
| `from_url`    | string | null       |
| `to_url`      | string | null       |

---

### 6.6 `tab_created` — Tab 创建

| 字段              | 类型   | 说明      |
| ----------------- | ------ | --------- |
| `new_tab_id`    | number | 新 tab ID |
| `opener_tab_id` | number | null      |
| `url`           | string | null      |

---

### 6.7 `tab_url_change` — Tab URL 变化

| 字段              | 类型   | 说明       |
| ----------------- | ------ | ---------- |
| `from_url`      | string | null       |
| `to_url`        | string | 变化后 URL |
| `change_reason` | string | null       |

---

## 7. 网络请求 / Network

分类 Key：`network`

网络请求用于回答：

> 哪个接口失败了？请求和响应是什么？失败请求前后发生了什么？

产品层只暴露一个一级标签：`网络请求 / Network`。

不在 UI 一级标签中暴露：

| 不暴露为一级标签  | 原因           |
| ----------------- | -------------- |
| Fetch Request     | 实现细节       |
| XHR Request       | 实现细节       |
| network_body_hook | 实现细节       |
| CDP Bridge        | 实现细节       |
| Request Body      | 网络请求的细项 |
| Response Body     | 网络请求的细项 |

---

### 7.1 `network_request` — 网络请求

| 字段                     | 类型                   | 说明              |
| ------------------------ | ---------------------- | ----------------- |
| `request_id`           | string                 | 请求 ID           |
| `method`               | string                 | HTTP 方法         |
| `url`                  | string                 | 请求 URL          |
| `url_status`           | `captured`           | `redacted`      |
| `status_code`          | number                 | null              |
| `status_text`          | string                 | null              |
| `protocol`             | string                 | null              |
| `resource_type`        | `fetch`              | `xhr`           |
| `initiator`            | string                 | null              |
| `duration_ms`          | number                 | null              |
| `start_time_ms`        | number                 | null              |
| `end_time_ms`          | number                 | null              |
| `request_headers`      | Record<string, string> | null              |
| `response_headers`     | Record<string, string> | null              |
| `headers_status`       | `captured`           | `redacted`      |
| `request_body`         | string                 | null              |
| `request_body_status`  | `captured`           | `not_enabled`   |
| `response_body`        | string                 | null              |
| `response_preview`     | string                 | null              |
| `response_body_status` | `captured`           | `not_enabled`   |
| `mime_type`            | string                 | null              |
| `request_size_bytes`   | number                 | null              |
| `response_size_bytes`  | number                 | null              |
| `transfer_size_bytes`  | number                 | null              |
| `from_cache`           | boolean                | null              |
| `cache_status`         | `memory_cache`       | `disk_cache`    |
| `error_text`           | string                 | null              |
| `capture_method`       | `web_request`        | `extension_cdp` |
| `body_capture_mode`    | `none`               | `extension_cdp` |

---

### 7.2 Body 采集状态说明

| 状态            | 中文说明                         |
| --------------- | -------------------------------- |
| `captured`    | 已采集                           |
| `not_enabled` | 当前配置未开启                   |
| `failed`      | 尝试采集但失败                   |
| `too_large`   | 超过大小限制                     |
| `unsupported` | 类型不支持，例如二进制、流式响应 |
| `redacted`    | 已采集但经过脱敏                 |
| `partial`     | 只采集了部分内容或预览           |

---

### 7.3 网络请求详情页 UI 分组

选中某个网络请求时，右侧详情面板建议分为：

| Tab          | 中文     | 内容                                                  |
| ------------ | -------- | ----------------------------------------------------- |
| `overview` | 概要     | method、URL、status、duration、type、size             |
| `headers`  | Headers  | Request Headers、Response Headers                     |
| `payload`  | 请求体   | Query、Form Data、JSON Payload                        |
| `preview`  | 响应预览 | 格式化 JSON/text 预览                                 |
| `response` | 响应体   | 完整响应体或截断说明                                  |
| `timing`   | 时间     | DNS、connect、request、response 等                    |
| `related`  | 相关事件 | 失败请求附近的用户操作、Console、DOM、Storage、Cookie |

---

## 8. 控制台 / Console

分类 Key：`console`

控制台用于回答：

> 页面打印了什么日志？有没有 console error 或 warning？

---

### 8.1 `console_event` — 控制台事件

| 字段                           | 类型         | 说明                 |
| ------------------------------ | ------------ | -------------------- |
| `level`                      | `log`      | `info`             |
| `args_preview`               | string[]     | 参数预览，截断并脱敏 |
| `args_status`                | `captured` | `redacted`         |
| `stack_trace`                | string       | null                 |
| `source_url`                 | string       | null                 |
| `line`                       | number       | null                 |
| `column`                     | number       | null                 |
| `repeat_count`               | number       | null                 |
| `related_network_request_id` | string       | null                 |

采集策略：

| 模式     | 策略                                       |
| -------- | ------------------------------------------ |
| 标准采集 | 默认采集 warn/error，log/info/debug 可配置 |
| 深度采集 | 可采集全部 console                         |
| 导出     | 默认截断长参数                             |

---

## 9. 错误异常 / Errors

分类 Key：`error`

错误异常用于回答：

> 这次采集里真正出错的地方在哪里？

错误异常是独立分类，不应完全混在 Console 里。`console.error()` 和运行时异常不同，UI 上必须区分。

---

### 9.1 `runtime_exception` — 运行时异常

| 字段                  | 类型      | 说明      |
| --------------------- | --------- | --------- |
| `message`           | string    | 异常消息  |
| `error_name`        | string    | null      |
| `stack_trace`       | string    | null      |
| `source_url`        | string    | null      |
| `line`              | number    | null      |
| `column`            | number    | null      |
| `exception_id`      | string    | null      |
| `severity`          | `error` | `fatal` |
| `related_event_ids` | string[]  | 相关事件  |

捕获范围：

| 类型                        | 是否捕获         |
| --------------------------- | ---------------- |
| 未捕获 TypeError            | 是               |
| 未捕获 ReferenceError       | 是               |
| 未捕获 RangeError           | 是               |
| setTimeout 回调内未捕获异常 | 是               |
| Promise 内部抛错            | 部分取决于浏览器 |
| 已被 try/catch 捕获的异常   | 否               |

---

### 9.2 `unhandled_rejection` — 未处理 Promise Rejection

| 字段               | 类型        | 说明           |
| ------------------ | ----------- | -------------- |
| `message`        | string      | rejection 原因 |
| `reason_preview` | string      | null           |
| `stack_trace`    | string      | null           |
| `source_url`     | string      | null           |
| `line`           | number      | null           |
| `column`         | number      | null           |
| `severity`       | `warning` | `error`      |

---

### 9.3 `resource_error` — 资源加载错误

| 字段                 | 类型       | 说明           |
| -------------------- | ---------- | -------------- |
| `resource_url`     | string     | 资源 URL       |
| `resource_type`    | `script` | `stylesheet` |
| `message`          | string     | null           |
| `element_selector` | string     | null           |
| `status_code`      | number     | null           |

---

### 9.4 `network_failed` — 失败请求

失败请求也会有对应的 `network_request`。这里的 `network_failed` 可以作为错误索引事件，用于 Overview 和 Timeline 快速定位。

| 字段             | 类型           | 说明              |
| ---------------- | -------------- | ----------------- |
| `request_id`   | string         | 关联网络请求 ID   |
| `method`       | string         | HTTP 方法         |
| `url`          | string         | 请求 URL          |
| `status_code`  | number         | null              |
| `error_text`   | string         | null              |
| `duration_ms`  | number         | null              |
| `failure_type` | `http_error` | `network_error` |

---

### 9.5 `capture_error` — 采集器自身错误

采集器自身错误属于内部诊断事件，可在高级模式或导出中展示。

| 字段              | 类型    | 说明                                     |
| ----------------- | ------- | ---------------------------------------- |
| `module`        | string  | 出错模块，例如 network、console、storage |
| `message`       | string  | 错误信息                                 |
| `reason`        | string  | null                                     |
| `recoverable`   | boolean | 是否可恢复                               |
| `fallback_used` | boolean | 是否启用降级方案                         |

---

## 10. Storage

分类 Key：`storage`

Storage 必须在 UI 中独立可见，不应完全隐藏在“页面状态”里。

第一版支持：

| 类型           | 优先级 |
| -------------- | ------ |
| localStorage   | P0     |
| sessionStorage | P0     |

未来支持：

| 类型                      | 优先级 | 说明                               |
| ------------------------- | ------ | ---------------------------------- |
| IndexedDB                 | P1     | 复杂 Web App、本地数据库、离线数据 |
| Cache Storage             | P1     | Service Worker / PWA 缓存          |
| OPFS / File System Access | P2     | 高级本地文件能力                   |
| WebSQL                    | P3     | 已废弃，不建议优先支持             |

---

### 10.1 `storage_change` — localStorage / sessionStorage 变化

| 字段                 | 类型             | 说明               |
| -------------------- | ---------------- | ------------------ |
| `storage_type`     | `localStorage` | `sessionStorage` |
| `action`           | `set`          | `remove`         |
| `key`              | string           | null               |
| `old_value_length` | number           | null               |
| `new_value_length` | number           | null               |
| `value_status`     | `not_captured` | `captured`       |
| `value_preview`    | string           | null               |
| `origin`           | string           | origin             |
| `source_stack`     | string           | null               |

默认策略：

| 数据          | 默认是否采集 |
| ------------- | ------------ |
| key           | 是           |
| value length  | 是           |
| value preview | 否           |
| full value    | 否           |
| source stack  | 深度采集可选 |

---

### 10.2 `indexeddb_change` — IndexedDB 变化，未来能力

IndexedDB 是浏览器本地数据库，常用于复杂 Web App、PWA、离线队列、草稿、本地文档状态等。

| 字段                  | 类型             | 说明              |
| --------------------- | ---------------- | ----------------- |
| `database_name`     | string           | 数据库名称        |
| `object_store_name` | string           | object store 名称 |
| `action`            | `add`          | `put`           |
| `key`               | string           | number            |
| `value_status`      | `not_captured` | `captured`      |
| `value_size_bytes`  | number           | null              |
| `source_stack`      | string           | null              |

建议策略：

| 模式     | 策略                                     |
| -------- | ---------------------------------------- |
| 标准采集 | 不采集                                   |
| 深度采集 | 实验性开关                               |
| 默认     | 只记录数据库、store、key、大小，不记录值 |

---

### 10.3 `cache_storage_change` — Cache Storage 变化，未来能力

Cache Storage 通常由 Service Worker / PWA 使用，用于缓存页面、资源或接口响应。

| 字段                    | 类型             | 说明         |
| ----------------------- | ---------------- | ------------ |
| `cache_name`          | string           | Cache 名称   |
| `action`              | `put`          | `delete`   |
| `request_url`         | string           | null         |
| `response_status`     | number           | null         |
| `response_type`       | string           | null         |
| `response_size_bytes` | number           | null         |
| `body_status`         | `not_captured` | `captured` |

建议策略：

| 模式     | 策略                              |
| -------- | --------------------------------- |
| 标准采集 | 不采集                            |
| 深度采集 | 实验性开关                        |
| 默认     | 只记录缓存条目元信息，不记录 body |

---

## 11. Cookie

分类 Key：`cookie`

Cookie 必须作为 UI 一级可见标签。很多登录态、权限、灰度、AB 实验、session 丢失问题都依赖 Cookie 排查。

---

### 11.1 `cookie_change` — Cookie 变化

| 字段                | 类型               | 说明         |
| ------------------- | ------------------ | ------------ |
| `name`            | string             | Cookie 名称  |
| `domain`          | string             | 域名         |
| `path`            | string             | 路径         |
| `cause`           | `explicit`       | `expired`  |
| `removed`         | boolean            | 是否被删除   |
| `secure`          | boolean            | null         |
| `http_only`       | boolean            | null         |
| `same_site`       | `no_restriction` | `lax`      |
| `expiration_date` | number             | null         |
| `store_id`        | string             | null         |
| `value_status`    | `not_captured`   | `captured` |
| `value_length`    | number             | null         |
| `value_preview`   | string             | null         |

默认策略：

| 数据                         | 默认是否采集           |
| ---------------------------- | ---------------------- |
| name                         | 是                     |
| domain                       | 是                     |
| path                         | 是                     |
| cause                        | 是                     |
| removed                      | 是                     |
| secure / httpOnly / sameSite | 建议采集               |
| expiration_date              | 建议采集               |
| value length                 | 可选                   |
| value preview                | 否                     |
| full value                   | 否，强烈不建议默认采集 |

---

## 12. DOM 数据 / DOM Data(以后做)

分类 Key：`dom_data`

DOM 数据用于回答：

> 页面结构发生了什么变化？错误提示是不是出现了？某个按钮、表单、弹窗是不是被插入或删除了？

注意：输入事件不是 DOM 数据。`input/change/focus/blur` 属于 `input_event`，不应叫 `dom_change`。

---

### 12.1 `dom_mutation` — DOM 结构变化

未来新增能力。

| 字段                    | 类型             | 说明                 |
| ----------------------- | ---------------- | -------------------- |
| `action`              | `child_added`  | `child_removed`    |
| `target_selector`     | string           | null                 |
| `target_xpath`        | string           | null                 |
| `target_tag`          | string           | null                 |
| `attribute_name`      | string           | null                 |
| `old_value_status`    | `not_captured` | `captured`         |
| `new_value_status`    | `not_captured` | `captured`         |
| `old_value_preview`   | string           | null                 |
| `new_value_preview`   | string           | null                 |
| `added_nodes_count`   | number           | null                 |
| `removed_nodes_count` | number           | null                 |
| `mutation_count`      | number           | 聚合后的 mutation 数 |
| `subtree_size`        | number           | null                 |
| `is_aggregated`       | boolean          | 是否为聚合事件       |

采集策略：

| 模式     | 策略                     |
| -------- | ------------------------ |
| 标准采集 | 默认不采或只采关键摘要   |
| 深度采集 | 采集 mutation 摘要       |
| 极深采集 | 可采集更多属性和文本预览 |
| 默认禁止 | 完整 HTML 长文本         |

---

### 12.2 `dom_snapshot` — DOM 快照

未来深度能力。用于在问题发生点保存某个节点或页面片段。

| 字段                 | 类型             | 说明         |
| -------------------- | ---------------- | ------------ |
| `snapshot_type`    | `full`         | `subtree`  |
| `root_selector`    | string           | null         |
| `root_xpath`       | string           | null         |
| `html_status`      | `not_captured` | `captured` |
| `html_preview`     | string           | null         |
| `html_size_bytes`  | number           | null         |
| `truncated`        | boolean          | 是否截断     |
| `redaction_status` | `none`         | `redacted` |

建议策略：

| 类型              | 默认策略           |
| ----------------- | ------------------ |
| full DOM snapshot | 默认关闭           |
| subtree snapshot  | 深度采集可选       |
| nearby snapshot   | 问题附近可自动采集 |
| html preview      | 必须截断和脱敏     |

---

### 12.3 `element_state` — 元素状态，未来可选

用于记录关键元素在某一时刻的状态。

| 字段                | 类型    | 说明       |
| ------------------- | ------- | ---------- |
| `target_selector` | string  | 元素选择器 |
| `target_xpath`    | string  | null       |
| `target_tag`      | string  | null       |
| `visible`         | boolean | null       |
| `disabled`        | boolean | null       |
| `checked`         | boolean | null       |
| `text_preview`    | string  | null       |
| `bounding_rect`   | object  | null       |

---

## 13. 采集生命周期 / Capture Lifecycle

分类 Key：`capture_lifecycle`

采集生命周期用于回答：

> 采集工具本身在什么时候开始、结束、切换配置、降级或失败？

这类事件可以出现在 Timeline 里，但不一定作为 Popup 采集标签展示。

---

### 13.1 `capture_started` — 采集开始

| 字段                | 类型         | 说明           |
| ------------------- | ------------ | -------------- |
| `capture_id`      | string       | 采集 ID        |
| `mode`            | `standard` | `deep`       |
| `config_snapshot` | object       | 配置快照       |
| `start_url`       | string       | 开始 URL       |
| `trigger`         | `popup`    | `main_panel` |

---

### 13.2 `capture_stopped` — 采集结束

| 字段            | 类型          | 说明             |
| --------------- | ------------- | ---------------- |
| `capture_id`  | string        | 采集 ID          |
| `reason`      | `user_stop` | `max_duration` |
| `duration_ms` | number        | 总时长           |
| `stats`       | object        | 统计信息         |

---

### 13.3 `capture_config_changed` — 本次采集配置变化

| 字段           | 类型     | 说明         |
| -------------- | -------- | ------------ |
| `changed_by` | `user` | `system`   |
| `field`      | string   | 修改的配置项 |
| `old_value`  | any      | 旧值         |
| `new_value`  | any      | 新值         |

---

### 13.4 `permission_missing` — 权限缺失

| 字段            | 类型    | 说明             |
| --------------- | ------- | ---------------- |
| `permission`  | string  | 缺失权限         |
| `module`      | string  | 受影响模块       |
| `impact`      | string  | 对采集结果的影响 |
| `recoverable` | boolean | 是否可恢复       |

---

### 13.5 `debugger_attach_status` — Debugger / CDP 状态

| 字段                 | 类型         | 说明         |
| -------------------- | ------------ | ------------ |
| `status`           | `attached` | `detached` |
| `reason`           | string       | null         |
| `fallback_used`    | boolean      | 是否启用降级 |
| `affected_modules` | string[]     | 影响模块     |

---

### 13.6 `body_capture_status_changed` — Body 采集状态变化

| 字段                  | 类型        | 说明              |
| --------------------- | ----------- | ----------------- |
| `body_capture_mode` | `none`    | `extension_cdp` |
| `status`            | `enabled` | `disabled`      |
| `reason`            | string      | null              |

---

## 14. 脱敏与敏感数据策略

所有可能包含敏感数据的字段，都必须有状态字段。

### 14.1 通用状态字段

| 字段                 | 类型             | 说明         |
| -------------------- | ---------------- | ------------ |
| `value_status`     | `not_captured` | `captured` |
| `redaction_status` | `none`         | `redacted` |
| `truncated`        | boolean          | 是否截断     |
| `size_bytes`       | number           | null         |

---

### 14.2 默认敏感字段

默认应脱敏以下字段：

| 类型    | 字段                                                                                                     |
| ------- | -------------------------------------------------------------------------------------------------------- |
| Header  | `authorization`, `cookie`, `set-cookie`, `x-api-key`, `x-auth-token`                           |
| Query   | `token`, `access_token`, `refresh_token`, `password`, `secret`, `key`, `code`              |
| Body    | `password`, `token`, `accessToken`, `refreshToken`, `secret`, `phone`, `email`, `idCard` |
| Storage | 包含 `token`, `password`, `secret`, `auth`, `session` 的 key                                   |
| Cookie  | 默认不采集 value                                                                                         |
| Input   | password 永不采集，email/phone 默认脱敏                                                                  |

---

## 15. UI 与数据标签映射

### 15.1 Popup 采集开关

| UI 标签  | 对应 category/type | 默认                |
| -------- | ------------------ | ------------------- |
| 用户行为 | `user_action`    | 开                  |
| 页面导航 | `navigation`     | 开                  |
| 网络请求 | `network`        | 开                  |
| 控制台   | `console`        | 开                  |
| 错误异常 | `errors`         | 开                  |
| Storage  | `storage`        | 开                  |
| Cookie   | `cookie`         | 开                  |
| DOM 数据 | `dom_data`       | 标准关 / 深度开摘要 |
| 脱敏     | 全局安全策略       | 开                  |

---

### 15.2 采集中统计

采集中状态建议展示：

| UI 指标  | 数据来源                                           |
| -------- | -------------------------------------------------- |
| 用户行为 | `category = user_action`                         |
| 页面导航 | `category = navigation`                          |
| 网络请求 | `category = network`                             |
| Console  | `category = console`                             |
| Storage  | `category = storage`                             |
| Cookie   | `category = cookie`                              |
| DOM 数据 | `category = dom_data`                            |
| 错误     | `category = error` 或 network/status_code >= 400 |

---

### 15.3 采集详情页 Tabs

建议主面板里的单次采集详情使用以下 Tabs：

| Tab          | 中文     | 内容                                        |
| ------------ | -------- | ------------------------------------------- |
| `overview` | 概览     | 本次采集摘要、问题摘要、关键时间线          |
| `timeline` | 时间线   | 所有事件按时间排序                          |
| `network`  | 网络     | 请求列表、请求详情、body 状态               |
| `console`  | Console  | console 输出和过滤                          |
| `evidence` | 证据     | 用户行为、导航、Storage、Cookie、DOM 等证据 |
| `storage`  | Storage  | localStorage/sessionStorage 变化            |
| `cookie`   | Cookie   | Cookie 变化                                 |
| `dom`      | DOM 数据 | DOM mutation / snapshot，未来能力           |
| `config`   | 本次配置 | 本次采集模式、开启模块、脱敏策略            |

不建议把单次详情里的 `config` 叫 Settings，避免和全局设置混淆。

---

## 16. 导出建议

导出数据应包含：

| 模块                    | 是否默认导出     |
| ----------------------- | ---------------- |
| Capture Record 元信息   | 是               |
| Capture Events          | 是               |
| Network Requests        | 是               |
| Console Events          | 是               |
| Errors                  | 是               |
| Storage Changes         | 是               |
| Cookie Changes          | 是               |
| DOM Data                | 如果已采集则导出 |
| Redaction Report        | 是               |
| Capture Config Snapshot | 是               |

导出格式建议：

| 格式            | 说明                 |
| --------------- | -------------------- |
| JSON            | 完整原始结构         |
| JSONL           |                      |
| HAR             | 网络请求兼容格式     |
| ZIP             | JSON + HAR + 附件    |
| Markdown Report | 问题摘要报告         |
| HTML Report     | 可视化报告，未来可选 |

---

## 17. 命名规范

### 17.1 UI 命名

| 不建议                                  | 建议                                   |
| --------------------------------------- | -------------------------------------- |
| Session                                 | Capture                                |
| Session Analysis                        | Capture Details / Capture Analysis     |
| Capture Detail                          | Capture Details                        |
| DOM Change 表示 input/change/focus/blur | Input Event / Form Event               |
| 页面状态                                | Storage / Cookie，或 Storage & Cookies |
| Network Body Hook                       | 不暴露，作为 capture_method            |

---

### 17.2 数据字段命名

数据字段统一使用 snake_case：

| 类型     | 示例                                         |
| -------- | -------------------------------------------- |
| category | `network`                                  |
| type     | `network_request`                          |
| status   | `response_body_status`                     |
| time     | `relative_time_ms`                         |
| id       | `capture_id`, `event_id`, `request_id` |

---

## 18. 第一版优先级

### P0：第一版必须支持

| 能力                                   | 状态               |
| -------------------------------------- | ------------------ |
| 用户行为                               | 必须               |
| 页面导航                               | 必须               |
| 网络请求基础信息                       | 必须               |
| Console                                | 必须               |
| 运行时异常                             | 必须               |
| Storage: localStorage / sessionStorage | 必须               |
| Cookie                                 | 必须               |
| 脱敏                                   | 必须               |
| 采集生命周期                           | 必须，至少内部记录 |

---

### P1：深度采集或下一版支持

| 能力                    | 状态       |
| ----------------------- | ---------- |
| 请求体                  | 深度采集   |
| 响应体预览              | 深度采集   |
| 响应体完整采集          | 高风险开关 |
| DOM mutation            | 下一版重点 |
| IndexedDB               | 实验性     |
| Cache Storage           | 实验性     |
| Source stack            | 深度采集   |
| Related Events 自动关联 | 建议支持   |

---

### P2：未来高级能力

| 能力                        | 状态       |
| --------------------------- | ---------- |
| DOM snapshot                | 高级能力   |
| OPFS / File System Access   | 高级能力   |
| Service Worker 状态         | 高级能力   |
| Redux / Zustand / Vuex 状态 | 插件化能力 |
| Replay / 回放               | 未来能力   |

---

## 19. 最终产品心智

Capture All 的采集标签应该帮助用户回答以下问题：

| 问题                       | 对应标签     |
| -------------------------- | ------------ |
| 用户做了什么？             | 用户行为     |
| 页面去了哪里？             | 页面导航     |
| 接口发生了什么？           | 网络请求     |
| 页面打印了什么？           | Console      |
| 哪里真的出错了？           | 错误异常     |
| 本地状态怎么变了？         | Storage      |
| 登录态或 Cookie 怎么变了？ | Cookie       |
| 页面结构怎么变了？         | DOM 数据     |
| 采集工具本身有没有问题？   | 采集生命周期 |

最终 UI 一级标签建议定为：

用户行为、页面导航、网络请求、Console、错误异常、Storage、Cookie、DOM 数据。
