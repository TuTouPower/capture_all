# 端到端测试缺口分析

日期：2026-06-11

## 现状

25 个 E2E 测试文件，全部只测 UI 渲染和按钮状态切换。**零个测试验证采集数据的字段完整性。**

---

## 测试站点

| 站点 | 用途 | 原因 |
|------|------|------|
| `https://www.baidu.com` | 结构验证 | 真实复杂页面，网络请求/console/user action 丰富 |
| `http://localhost:17832/test-page.html` | 结构 + 内容验证 | 本地可控，输出内容确定，可精确断言 |

本地页面由 `tests/fixtures/test-page.html` + `tests/fixtures/server.ts`（Node.js 静态服务器，端口 17832，`/api/test` 返回固定 JSON）提供。`npm run test:e2e` 前自动启动。

---

## P0.1 — 百度全开采集：字段结构验证

**文件：`tests/e2e-capture-baidu.spec.ts`**

前置：弹窗 8 开关全 ON，设置子开关全 ON。

流程：开始采集 → 打开百度 → 等待 3s → 点搜索框 → 输入文字 → 停止 → 导出 JSON → 逐字段验证。

### 验证项

**NetworkRequest（每个请求对象结构正确）：**
- `url` 非空字符串
- `method` 非空字符串
- `status_code` 数字
- `request_headers` 是对象
- `response_headers` 是对象
- `duration_ms` 数字 > 0
- `resource_type` 非空字符串
- `response_body_status` 存在（captured / not_enabled / 等）
- `request_body_status` 存在
- `response_body` 存在（可能为 null）
- `tab_id` > 0
- `capture_id` 匹配当前 session_id

**ConsoleEvent（控制台日志结构正确）：**
- 至少一条
- 每条有 `level`（log/warn/error 之一）
- 每条有 `args_preview`（数组）
- 每条有 `source_url`（字符串）

**CaptureEvent（用户行为/导航/错误事件结构正确）：**
- 至少一条 event
- 每条有 `category` 非空字符串
- 每条有 `type` 非空字符串
- 每条有 `data` 对象
- 每条有 `timestamp` 数字 > 0
- 每条有 `tab_id` 数字
- 每条有 `url` 字符串

**CaptureRecord（采集记录结构正确）：**
- `capture_id` = session_id
- `status` = 'completed'
- `mode` = 'standard'
- `tags` 数组长度 >= 1
- `started_at` ISO 8601 格式字符串
- `ended_at` ISO 8601 格式字符串
- `duration_ms` > 0
- `config_snapshot` 是对象，不含 `capture_mode` 字段
- `body_capture_mode` 存在且非空

**导出 JSON 顶层：**
- `capture_id` 存在
- `events` 是数组
- `network_requests` 是数组
- `console_events` 是数组
- `system_time` 对象存在

---

## P0.2 — 本地页面全开采集：字段结构 + 内容精确验证

**文件：`tests/e2e-capture-local.spec.ts`**

前置：弹窗 8 开关全 ON，设置子开关全 ON。

流程：开始采集 → 打开 `http://localhost:17832/test-page.html` → 等待 3s → 点按钮 → 输入文字 → 停止 → 导出 JSON → 精确验证。

### 本地测试页面内容

```html
<!DOCTYPE html>
<title>E2E Test</title>
<button id="btn-click">Click Me</button>
<button id="btn-error">Trigger Error</button>
<input id="input-text" placeholder="type here">
<script>
console.log('E2E_LOG_MARKER');
console.warn('E2E_WARN_MARKER');
document.cookie = 'e2e_test_cookie=hello';
localStorage.setItem('e2e_test_key', 'e2e_test_value');
fetch('/api/test');

document.getElementById('btn-error').onclick = () => {
  throw new Error('E2E_ERROR_MARKER');
};
</script>
```

### 本地服务器 API

`GET /api/test` → `{"status":"ok","message":"E2E_API_MARKER"}`

### 结构验证（同 P0.1，确认本地页面也符合结构）

同 P0.1 所有检查项。

### 内容精确验证（比 P0.1 多出来的，因为输出可控）

**NetworkRequest 内容：**
- 存在 `url` 包含 `/api/test` 的请求
- 该请求 `method` = 'GET'
- 该请求 `status_code` = 200
- 该请求 `response_body` 包含 `"E2E_API_MARKER"`（CDP 正常时）
- 该请求 `response_body_status` = 'captured'（CDP 正常时）

**ConsoleEvent 内容：**
- 存在 `level='log'` 且 `args_preview` 包含 `'E2E_LOG_MARKER'` 的条目
- 存在 `level='warn'` 且 `args_preview` 包含 `'E2E_WARN_MARKER'` 的条目

**UserAction 内容：**
- 存在 `type='click'` 且 `target_text` 包含 `'Click Me'` 的事件

**Error 内容：**
- 存在 `message` 包含 `'E2E_ERROR_MARKER'` 的 error 事件
- 该事件 `error_name` = 'Error'
- 该事件 `stack_trace` 非空字符串

**CookieChange 内容：**
- 存在 `name='e2e_test_cookie'` 的 cookie 事件

**StorageChange 内容：**
- 存在 `key='e2e_test_key'` 的 storage 事件
- `storage_type` = 'local'
- `action` = 'set'

**CaptureRecord 内容：**
- `tags` 数组精确包含 7 项：`['用户行为', '页面导航', '网络请求', '控制台', '错误异常', 'Storage', 'Cookie']`
- `config_snapshot.capture_network` = true
- `config_snapshot.capture_console` = true
- `config_snapshot.capture_response_body` = true
- `config_snapshot.capture_request_body` = true
- `config_snapshot.capture_input_values` = true
- `config_snapshot.redact_data` = true
- `config_snapshot` 不包含 `capture_mode` 字段

---

## P0.3 — 弹窗开关功能验证

**文件：`tests/e2e-toggle-effects.spec.ts`**

每个场景：关一个开关 → 采集本地页面 → 验证对应数据消失，其他仍在。

| # | 关掉的开关 | popup data-key | 预期 |
|---|-----------|---------------|------|
| 1 | 用户行为 | event_count | events 中无 category='user_action' |
| 2 | 页面导航 | nav_count | events 中无 category='navigation' |
| 3 | 网络请求 | request_count | network_requests 为空 |
| 4 | 控制台 | log_count | console_events 为空 |
| 5 | 错误异常 | error_count | events 中无 category='error' |
| 6 | Storage | storage_change_count | events 中无 category='storage' |
| 7 | Cookie | cookie_change_count | events 中无 category='cookie' |
| 8 | 脱敏 | mask | response_body 中的敏感信息未被脱敏替换 |

每个场景额外验证：
- `config_snapshot` 中对应字段 = false
- `tags` 不包含被关开关对应的标签
- 其他未关的数据照常采集

---

## P0.4 — CDP 重试验证

**文件：`tests/e2e-cdp-retry.spec.ts`**

### 场景 A：标签切换后 CDP 恢复
1. 打开 `chrome://extensions` 页面
2. 开始采集（CDP attach 失败）
3. 新标签页打开 `http://localhost:17832/test-page.html`
4. 等待标签切换事件触发 onActivated 重试
5. `console_events.length > 0`（CDP console 恢复）
6. 存在 `response_body_status = 'captured'` 的请求（CDP body 恢复）

### 场景 B：同标签 URL 跳转后 CDP 恢复
1. 在 `chrome://extensions` 页开始采集
2. 同一个标签页导航到 `http://localhost:17832/test-page.html`
3. 等待 onUpdated 重试
4. console_events 有数据
5. response_body 有数据

### 场景 C：重试日志确认
1. 同上操作后导出运行日志
2. 日志包含 'Console capture retry succeeded'
3. 日志包含 'Body capture retry succeeded'

---

## P1 — 设置页子开关功能验证

**文件：`tests/e2e-settings-effects.spec.ts`**

前置：弹窗开关全 ON。

| # | 设置项 | 设为 | 预期 |
|---|--------|------|------|
| 1 | capture_response_body | false | 全部 response_body_status = 'not_enabled' |
| 2 | capture_request_body | false | 全部 request_body_status = 'not_enabled' |
| 3 | capture_input_values | false | user_action 的 input_value 为 null 或 not_captured |
| 4 | redact_data | false | response_body 中原始数据未被脱敏 |

---

## P1 — 多轮采集数据隔离

**文件：`tests/e2e-cycle-integrity.spec.ts`**

| # | 场景 | 验证 |
|---|------|------|
| 1 | 连续 3 次 开始-停止 | 3 个 session，capture_id 各不相同 |
| 2 | 同上 | session 1 的数据不出现在 session 2 导出中 |
| 3 | 立刻停止（0 事件） | status=completed，无 crash |

---

## P1 — 导出内容正确性

**文件：`tests/e2e-export-content.spec.ts`**

| # | 格式 | 验证项 |
|---|------|--------|
| 1 | JSON | `capture_id` 匹配，`events[0]` 有 category/type/data/timestamp |
| 2 | HAR | `log.entries[0].request.url` 非空，`response.content.text` 非空 |
| 3 | HTML | 不含 "Mode"、"basic"、"advanced"，无 XSS 模式 |

---

## 测试基础设施

### `tests/fixtures/test-page.html`
确定性的测试页面，包含控制台输出、fetch 请求、cookie、localStorage、按钮、输入框、错误抛出。

### `tests/fixtures/server.ts`
Node.js HTTP 服务器，端口 17832。静态文件服务 + `GET /api/test` 返回固定 JSON。
`npm run test:e2e` 脚本负责先启动服务器，测试完后关闭。

---

## 优先级汇总

| 优先级 | 文件 | 场景数 | 说明 |
|--------|------|--------|------|
| **P0** | e2e-capture-baidu | 1 | 百度结构验证 |
| **P0** | e2e-capture-local | 1 | 本地结构+内容验证 |
| **P0** | e2e-toggle-effects | 8 | 弹窗开关逐个验证 |
| **P0** | e2e-cdp-retry | 3 | CDP 重试验证 |
| P1 | e2e-settings-effects | 4 | 设置子开关验证 |
| P1 | e2e-cycle-integrity | 3 | 多轮采集隔离 |
| P1 | e2e-export-content | 3 | 导出内容正确性 |
