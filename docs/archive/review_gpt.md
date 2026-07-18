# 浏览器录制扩展方案审阅报告

审阅对象：
- `docs/superpowers/specs/2026-06-03-browser-recorder-design.md`
- `docs/superpowers/specs/2026-06-03-browser-recorder-plan.md`

## 总体判断

方案可做。方向正确：用浏览器扩展采集页面事件、网络请求、Console、导出报告。

但当前方案还不能直接开工。主要缺口在 4 类：

1. 方案 A / B 的用户选择没有落到数据模型和实施步骤。
2. 隐私与脱敏不足，风险高。
3. `chrome.debugger` / DevTools / `webRequest` 的能力边界需要写清。
4. 测试验证偏手工，缺少最小自动化验收。

## 关键问题

### 1. 方案 A / B 选择未闭环

用户要求“给个按钮，让用户自己选方案 A 还是方案 B”。

当前设计里有“轻量/完整模式”，但没有明确映射：

- 方案 A 是什么能力集
- 方案 B 是什么能力集
- Popup 上按钮如何展示
- Session 里如何记录用户选的是 A 还是 B
- 导出报告里如何标明采集能力限制

建议改成明确字段：

```ts
capture_mode: 'basic' | 'advanced'
```

并在 UI 写成：

- 方案 A：基础录制
  - 鼠标、键盘、滚动、表单变化
  - webRequest 请求元数据
  - 不采集 response body
  - 不强制 DevTools
- 方案 B：深度录制
  - 包含方案 A
  - 尝试采集 Console
  - 尝试采集 response body
  - 需要 debugger / DevTools，可能显示浏览器警告

### 2. 隐私风险过高

当前会采集：

- 键盘事件
- input value
- target_text
- request_body
- response_body
- headers
- URL

这会包含密码、token、cookie、手机号、邮箱、地址、身份证、银行卡、会话凭证等敏感数据。

当前只写了 `type=password` 脱敏，不够。

建议必须补：

- 默认不采集键盘字符，只采集按键类型或快捷键。
- 默认不采集 input value，除非用户显式开启。
- 默认不采集 request_body / response_body。
- headers 至少过滤：`authorization`、`cookie`、`set-cookie`、`x-api-key`、`bearer` 类字段。
- URL query 需要可选脱敏。
- HTML 导出不能默认内嵌未脱敏原始数据。
- UI 必须显示“正在录制”的明显状态。

最低安全默认值：

```ts
capture_keyboard: false
capture_input_values: false
capture_request_body: false
capture_response_body: false
redact_sensitive_headers: true
redact_url_query: true
```

### 3. `chrome.debugger` 能力边界需要更硬

文档说完整模式通过 debugger / DevTools 获取 Console 和 response body。这个方向对，但边界要写清：

- `chrome.debugger.attach` 会触发 Chrome 黄色警告条。
- 一个 tab 同时只能被一个 debugger attach。
- DevTools 面板方案需要用户打开 DevTools，不能静默覆盖所有页面。
- `Network.getResponseBody` 不保证所有请求都能拿到 body。
- 跨域、缓存、stream、二进制、大响应、已过期 requestId 都可能失败。
- Service Worker 休眠会影响长时监听，需要分模块持久化状态。

建议：方案 B 不承诺“拿到所有数据”，只承诺“尽最大可能采集更多调试数据”。

### 4. Manifest 权限过宽，需分层说明

当前权限：

```json
"host_permissions": ["<all_urls>"]
```

这是高风险权限。对本地开发可接受，但产品化必须解释。

建议：

- MVP 可以先 `<all_urls>`。
- UI 必须让用户知道录制范围。
- 后续应支持 allowlist：只录指定域名 / 当前 tab。
- 权限说明写进设计文档。

### 5. 数据模型缺少脱敏与来源字段

建议 `Session` 增加：

```ts
capture_mode: 'basic' | 'advanced'
redaction_policy: RedactionPolicy
browser_warning_acknowledged: boolean
```

建议 `NetworkRequest` 增加：

```ts
body_capture_status: 'not_enabled' | 'captured' | 'failed' | 'too_large' | 'unsupported'
body_capture_error?: string
```

不要只用 `response_body: null`。null 分不清是没开、失败、太大、还是无 body。

### 6. 存储上限策略不完整

现在写“超 500MB 自动停止”。还需要：

- 每个 session 最大事件数
- 单条 body 最大长度
- 单条 log 最大长度
- 导出前估算大小
- 自动清理策略或用户手动删除
- IndexedDB 写入失败时的 UI 通知

建议先设硬限制：

- request_body / response_body 默认 10KB 截断
- console args 默认 1KB 截断
- target_text 默认 100 字符
- 单 session 默认 500MB 或 24 小时，先到即停

### 7. 测试计划不足

当前验证多是“手动检查 IndexedDB”。不够稳定。

建议最小测试：

- 单元测试：存储 CRUD、批量 flush、脱敏函数、截断函数。
- 集成测试：mock Chrome API，验证 start/stop/session 写入。
- E2E 手测脚本：加载扩展 → 开始录制 → 操作测试页面 → 停止 → 导出 JSON。
- 安全测试：密码框、Authorization header、Cookie、URL query 是否脱敏。

## 建议修改设计文档

### 必改

1. 明确方案 A / B 映射。
2. Popup 增加 A/B 选择按钮。
3. `RecordConfig` 增加 `capture_mode` 和脱敏策略。
4. 加“隐私与脱敏”章节。
5. 加“能力边界”章节，尤其 response body 和 console。
6. 加“默认安全配置”。

### 可后置

1. 域名 allowlist。
2. 数据压缩。
3. 回放功能。
4. 自动生成 Playwright 脚本。
5. 云同步。

## 建议修改实施计划

### Sprint 1 增加

- `shared/redaction.ts`：脱敏规则。
- `shared/capture_modes.ts`：方案 A / B 默认配置。
- 测试：模式配置和脱敏函数。

### Sprint 2 调整

- 键盘采集默认关闭。
- input value 默认关闭。
- 只在用户显式开启后采集表单值。

### Sprint 3 调整

- network 默认不采 body。
- headers 先脱敏再存储。
- response body 状态用枚举，不只用 null。

### Sprint 4 调整

- Popup 首屏先选：方案 A / 方案 B。
- 方案 B 按钮旁提示：需要 debugger / DevTools，可能显示 Chrome 警告。
- 开始录制前显示采集范围摘要。

### Sprint 6 调整

- JSON / HTML 导出前显示数据敏感提示。
- HTML 导出必须安全转义 JSON，避免导出文件 XSS。

## 推荐成功标准

MVP 完成标准：

- 用户可在 Popup 选择方案 A 或方案 B。
- 方案 A 可稳定记录点击、滚动、导航、请求元数据。
- 方案 B 可在可用条件下额外记录 Console / response body，并清楚标记失败原因。
- 密码、Cookie、Authorization、常见 token 默认不落盘。
- 可导出 JSON 和 HTML。
- 录制状态明显，用户可一键停止。

## 最终建议

先做方案 A，保证稳定、安全、可导出。

方案 B 作为增强能力，不要承诺“所有数据都能拿到”。它应是“用户主动开启的深度调试模式”，并带明确提示和失败状态记录。
