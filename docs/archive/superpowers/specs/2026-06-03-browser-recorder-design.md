# Record All — 浏览器操作录制扩展设计

## 目标

Chrome 扩展（Manifest V3），记录用户在浏览器中的全部操作：网络请求、console 日志、鼠标/键盘/滚动、DOM 输入变化。用于个人开发调试，支持回放分析和导出。

## 模式

用户在 popup 中选择，首屏即展示：

| | 方案 A：基础录制 | 方案 B1：深度录制（debugger） | 方案 B2：深度录制（DevTools） |
|---|---|---|---|
| 鼠标/键盘/滚动/DOM | ✅ | ✅ | ✅ |
| 网络请求元数据 | ✅ | ✅ | ✅ |
| Console log | ❌ | ✅（chrome.debugger） | ✅（DevTools 面板） |
| Response body | ❌ | ✅（尽力采集） | ✅（尽力采集） |
| JS 异常 | ❌ | ✅ | ✅ |
| 需要 F12 | ❌ | ❌ | ✅ 需要 |
| 黄色警告条 | ❌ | ✅ 会触发 | ❌ 不触发 |
| debugger 互斥 | N/A | F12 打开时 attach 失败 | 不走 debugger，不冲突 |

Popup 中方案 B 按钮：优先尝试 B1（debugger），attach 失败时提示"请打开 F12 使用 B2 模式"或降级为方案 A。

```typescript
capture_mode: 'basic' | 'advanced'
```

方案 B 不承诺"拿到所有数据"，只承诺"尽最大可能采集更多调试数据"。B1/B2 是实现细节，用户只需选 A 或 B，扩展自动选择可用路径。

## 架构

```
Popup (UI 控制中心)
  ├── 录制开始/停止（方案 A / 方案 B 按钮）
  ├── 录制精度配置（鼠标：点击/点击+滚动+拖拽/完整轨迹）
  ├── 隐私选项（键盘/表单值/body 采集开关）
  ├── 录制列表
  └── 查看/导出（HTML、JSON）

Content Script (manifest 声明，按需激活)
  ├── 启动后仅注册消息监听，不采集
  ├── 收到 start 消息后激活采集
  ├── 鼠标事件采集（可配置精度）
  ├── 键盘事件采集（默认关闭）
  ├── 滚动/拖拽采集
  ├── DOM 变化采集（默认不采集 value）
  └── → chrome.runtime.sendMessage → Background

Background Service Worker
  ├── chrome.alarms 每 25s 保活
  ├── chrome.webRequest → 网络请求元数据采集
  ├── chrome.debugger（B1 路径，无需 F12）→ console + response body
  ├── DevTools 面板（B2 路径，需 F12）→ console + response body
  ├── B1 attach 失败时自动提示切换 B2 或降级为 A
  ├── 数据汇总 + IndexedDB 存储（await 确保写入完成）
  ├── 录制 session 管理
  └── 导出生成（HTML 报告含 XSS 转义、JSON 数据）
```

## 隐私与脱敏

### 默认安全配置

```typescript
const DEFAULT_CONFIG: RecordConfig = {
    capture_mode: 'basic',
    mouse_precision: 'clicks_scroll_drag',
    capture_console: false,
    capture_network: true,
    keyboard_capture_mode: 'shortcuts',  // 'none' | 'shortcuts' | 'all'
    capture_input_values: false,    // 默认关闭
    capture_request_body: false,    // 默认关闭
    capture_response_body: false,   // 默认关闭
    redact_sensitive_headers: true, // 默认开启
    redact_url_query: true,         // 默认开启 URL query 脱敏
    sample_rate_ms: 50,
};
```

### 脱敏规则（`shared/redaction.ts`）

1. **Headers 过滤**：`authorization`、`cookie`、`set-cookie`、`x-api-key`、`x-csrf-token`、`proxy-authorization`、`www-authenticate` 及包含 `token`、`key`、`secret`、`bearer` 的 header 值替换为 `[REDACTED]`
2. **表单值**：`type=password` 始终 `[REDACTED]`；其他 input 只在 `capture_input_values: true` 时采集
3. **键盘**：`keyboard_capture_mode: 'none'` 不记录键盘；`'shortcuts'` 只记录修饰键组合（ctrl/alt/meta + key）；`'all'` 完整记录
4. **Body 截断**：request_body 10KB、response_body 50KB、console args 1KB、target_text 100 字符
5. **URL query**：`redact_url_query` 开启时，URL 中 `token`/`key`/`secret`/`password`/`auth` 参数值替换为 `[REDACTED]`。与 `redact_sensitive_headers` 独立控制。
6. **导出**：HTML 导出时 JSON 数据经 Unicode 转义（`</script>` → `<\/script>`），所有 HTML 特殊字符转义

### UI 提示

- 录制中 popup 图标变红 + badge 显示 "REC"
- 方案 B 按钮旁提示："可能触发 Chrome 调试警告条；打开 F12 可使用无警告模式"
- 开启键盘/body 采集时显示："将记录敏感数据，请确保安全环境"
- 导出前显示："数据可能包含敏感信息"

## 能力边界

### chrome.debugger 限制（B1 路径）

- 同一 tab 只能被一个 debugger attach，用户已开 F12 时 attach 失败
- **降级策略**：attach 失败 → 弹出提示"请打开 F12 使用 DevTools 模式(B2)，或关闭 F12 重试"
- 黄色警告条：B1 路径必然触发，UI 提前说明

### DevTools 面板限制（B2 路径）

- 需要用户手动打开 F12，否则无法注册 DevTools 面板
- 用户关闭 DevTools → 降级为方案 A，popup 提示
- 不走 `chrome.debugger`，所以不触发黄色警告条，不与用户 F12 冲突

### 共通限制
- `Network.getResponseBody` 不保证成功：跨域、缓存、stream、二进制、大响应、过期 requestId 均可能失败
- response body 用枚举状态标记，区分"没开/失败/太大/不支持/成功"

### Service Worker 保活

- MV3 SW 30s 无事件休眠，5min 终止
- 录制期间 `chrome.alarms.create` 每 30s 触发（periodInMinutes: 0.5，Chrome 最小支持值），保持 SW 活跃
- IndexedDB 写入使用 `await`，确保数据落盘后才响应

## 数据模型

### Session

```typescript
interface Session {
    id: string;
    start_time: number;           // epoch ms，session 开始的绝对时间
    end_time: number | null;
    config: RecordConfig;         // capture_mode 在 config 中
    stats: {
        event_count: number;
        request_count: number;
        log_count: number;
        dom_changes: number;
    };
}
```

### RecordConfig

```typescript
interface RecordConfig {
    capture_mode: 'basic' | 'advanced';
    mouse_precision: 'clicks' | 'clicks_scroll_drag' | 'full_trajectory';
    capture_console: boolean;
    capture_network: boolean;
    keyboard_capture_mode: 'none' | 'shortcuts' | 'all';
    capture_input_values: boolean;
    capture_request_body: boolean;
    capture_response_body: boolean;
    redact_sensitive_headers: boolean;
    redact_url_query: boolean;
    sample_rate_ms: number;
}
```

### RecordEvent

```typescript
interface RecordEvent {
    session_id: string;
    relative_time: number;       // 相对 session start 的偏移 ms，用于回放排序
    absolute_time: number;       // epoch ms，用于跨 session 查询和导出
    type: 'mouse' | 'keyboard' | 'scroll' | 'dom_change' | 'navigation' | 'page_load' | 'tab_switch';
    data: EventData;
    tab_id: number;
    frame_id: number;            // 0 = 主 frame，>0 = iframe
    url: string;
}

// 鼠标
interface MouseEventData {
    action: 'click' | 'dblclick' | 'contextmenu' | 'mousemove' | 'mousedown' | 'mouseup' | 'wheel' | 'dragstart' | 'dragend';
    x: number; y: number;
    button: number;
    target_selector: string;
    target_tag: string;
    target_text: string;          // 截断 100 字符
}

// 键盘（keyboard_capture_mode='all' 时完整记录；'shortcuts' 只记录修饰键组合；'none' 不记录）
interface KeyboardEventData {
    action: 'keydown' | 'keyup';
    key: string;
    code: string;
    target_selector: string;
    modifiers: { ctrl: boolean; shift: boolean; alt: boolean; meta: boolean };
}

// 滚动
interface ScrollEventData {
    scroll_x: number; scroll_y: number;
    scroll_height: number; scroll_width: number;
}

// DOM 变化
interface DomChangeData {
    action: 'input' | 'change' | 'focus' | 'blur';
    target_selector: string;
    target_tag: string;
    value: string;               // capture_input_values=false 时为 '[DISABLED]'，password 始终 '[REDACTED]'
}

// 页面导航
interface NavigationData {
    from: string;
    to: string;
}

// 页面加载
interface PageLoadData {
    load_time_ms: number;        // 页面加载耗时
    dom_content_loaded_ms: number;
}

// Tab 切换
interface TabSwitchData {
    action: 'activate' | 'deactivate';
    tab_title: string;
}
```

### NetworkRequest

```typescript
type BodyCaptureStatus = 'not_enabled' | 'captured' | 'failed' | 'too_large' | 'unsupported';

interface NetworkRequest {
    session_id: string;
    relative_time: number;
    absolute_time: number;
    tab_id: number;
    method: string;
    url: string;                   // 经脱敏处理
    status_code: number;
    request_headers: Record<string, string>;   // 敏感 header 已脱敏
    response_headers: Record<string, string>;  // 敏感 header 已脱敏
    request_body: string | null;               // 截断 10KB
    request_body_status: BodyCaptureStatus;
    response_body: string | null;              // 截断 50KB
    response_body_status: BodyCaptureStatus;
    duration_ms: number;
    resource_type: string;
}
```

### ConsoleLog

```typescript
interface ConsoleLog {
    session_id: string;
    relative_time: number;
    absolute_time: number;
    tab_id: number;
    level: 'log' | 'warn' | 'error' | 'info' | 'debug';
    args: string[];               // 每个截断 1KB
    stack_trace: string | null;
    url: string;
    line: number;
    column: number;
}
```

## 存储：IndexedDB

数据库名：`record_all_db`

| Store | Key | Index |
|-------|-----|-------|
| sessions | id | start_time |
| events | [session_id, relative_time] | session_id, type, relative_time |
| network_requests | [session_id, relative_time] | session_id, url, relative_time |
| console_logs | [session_id, relative_time] | session_id, level, relative_time |
| error_log | [session_id, relative_time] | session_id, relative_time |

### 存储限制

| 限制 | 值 |
|------|---|
| 单 session 大小 | 500MB |
| 单 session 时长 | 24 小时 |
| 单条 request_body | 10KB |
| 单条 response_body | 50KB |
| 单条 console arg | 1KB |
| target_text | 100 字符 |

先到先停。超出时自动停止录制，popup 通知用户。

### 存储管理

- 内存中维护 `bytes_written` 计数器，每次写入累加
- `navigator.storage.estimate()` 做定期校验
- 删除 session 时逐条删除（避免大事务锁）
- Popup 提供存储管理：显示总占用、单 session 占用、一键清理

## UI 设计

### Popup（控制面板）

紧凑单列：

1. **录制状态区**：指示灯 + 大按钮"开始录制"
2. **模式选择**（首屏核心）：
   - 方案 A 按钮："基础录制" + 副标题说明能力
   - 方案 B 按钮："深度录制" + 副标题 + 警告提示
3. **配置区**（展开式）：
   - 鼠标精度（三选一）
   - 隐私开关：键盘/表单值/请求体/响应体（每个带风险提示）
4. **录制历史**：最近 20 条，时间+时长+事件数+采集模式标签
5. **操作**：查看详情 / 导出

### 详情页（全页面 tab）

`chrome.tabs.create` 打开：

1. **Session 概览**：时间、时长、模式、统计、采集能力标签
2. **Tab 切换**：时间线 / 网络 / Console / 事件
3. **时间线**：混合事件流，类型过滤，虚拟滚动
4. **网络面板**：类似 DevTools Network，搜索/过滤，点击展开详情
5. **Console 面板**：level 过滤、搜索、stack trace 展开
6. **事件面板**：鼠标/键盘/滚动/DOM 列表

### 导出

- **JSON**：完整原始数据，文件名含 session 时间
- **HTML 报告**：内嵌数据，XSS 安全转义，独立可打开
  - 默认嵌入摘要 + 可展开完整数据
  - 大 session（>20MB）提示"建议使用 JSON 导出"

## 关键技术点

1. **Content Script 注入**：manifest.json 声明 `content_scripts`（`"matches": ["<all_urls>"]`, `"run_at": "document_start"`），启动后只注册消息监听。录制开始时发消息激活采集，停止时通知停止。新 tab 自动注入。
2. **方案 B 双路径**：B1 用 `chrome.debugger`（无需 F12，有黄色警告，F12 打开时冲突）；B2 用 DevTools 面板（需 F12，不冲突）。扩展自动选择可用路径，attach 失败时提示用户。
3. **response_body**：方案 B 通过 `chrome.debugger` 的 `Network.getResponseBody` 尽力获取，失败时记录 `BodyCaptureStatus` 原因。
4. **SW 保活**：`chrome.alarms` 每 30s 唤醒（periodInMinutes: 0.5），IndexedDB 写入用 `await` 确保。
5. **iframe**：`all_frames: true`，`RecordEvent` 含 `frame_id` 区分主 frame/iframe。
6. **性能**：鼠标完整轨迹用 `requestAnimationFrame` 节流；详情页大数据用 IntersectionObserver 分页加载（按需渲染可视区域，实现简单，无外部依赖）。
7. **HTML 导出安全**：`JSON.stringify()` 后替换 `</script>` 为 `<\/script>`，`<` `>` `&` 转义。

## 文件结构

```
record_all/
├── manifest.json
├── background/
│   ├── service_worker.ts      # 主入口
│   ├── network_capture.ts     # webRequest 网络采集
│   ├── console_capture.ts     # debugger console 采集
│   ├── storage.ts             # IndexedDB 封装
│   ├── session_manager.ts     # session 生命周期管理
│   ├── exporter.ts            # HTML/JSON 导出
│   └── keepalive.ts           # SW 保活（chrome.alarms）
├── content/
│   ├── content_script.ts      # 主入口（消息监听 + 按需激活）
│   ├── mouse_capture.ts       # 鼠标事件
│   ├── keyboard_capture.ts    # 键盘事件
│   ├── scroll_capture.ts      # 滚动事件
│   └── dom_capture.ts         # DOM 变化
├── popup/
│   ├── popup.html
│   ├── popup.ts
│   └── popup.css
├── detail/
│   ├── detail.html
│   ├── detail.ts
│   ├── detail.css
│   ├── timeline.ts
│   ├── network_panel.ts
│   ├── console_panel.ts
│   └── event_panel.ts
├── devtools/
│   ├── devtools.html
│   └── devtools_panel.html
├── shared/
│   ├── types.ts               # 类型定义
│   ├── constants.ts           # 常量
│   ├── redaction.ts           # 脱敏规则
│   ├── capture_modes.ts       # 方案 A/B 默认配置
│   └── escape.ts              # HTML/JS 安全转义
├── export_templates/
│   └── report.html
├── icons/
│   ├── icon.svg               # SVG 源文件
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── tests/
│   ├── storage.test.ts
│   ├── redaction.test.ts
│   ├── session_manager.test.ts
│   └── exporter.test.ts
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## 构建工具

- TypeScript + Vite
- 主方案：`@crxjs/vite-plugin`（MV3 支持）
- 备选：手动配置 Vite 多入口打包（background/content/popup/detail/devtools 各入口），crxjs 不兼容时切换

## 权限需求

```json
{
  "permissions": [
    "storage",
    "webRequest",
    "debugger",
    "scripting",
    "tabs",
    "activeTab",
    "alarms",
    "downloads"
  ],
  "host_permissions": ["<all_urls>"]
}
```

- `<all_urls>`：MVP 阶段使用，后续支持域名 allowlist
- `tabs`：读取 tab url/title，打开详情页
- `alarms`：SW 保活
- `downloads`：导出文件保存

## 测试策略

### 框架

Vitest（与 Vite 配套）

### 单元测试（每个 Sprint）

- `storage.test.ts`：CRUD、批量 flush、存储上限、bytes_written 计数
- `redaction.test.ts`：header 过滤、URL 脱敏、body 截断、password 脱敏
- `capture_modes.test.ts`：方案 A/B 默认配置生成
- `escape.test.ts`：HTML 转义、`</script>` 处理
- `session_manager.test.ts`：生命周期、多 tab 场景、自动停止

### 集成测试

- Mock Chrome API，验证 start → 采集 → stop → IndexedDB 写入完整流程

### 手测脚本

- 加载扩展 → 选方案 A → 开始 → 操作测试页面 → 停止 → 导出 JSON → 检查数据
- 安全验证：密码框、Authorization header、Cookie、URL query 参数脱敏检查

## 不做的事

- 不做视频录制
- 不做跨设备同步/云存储
- 不做自动化脚本生成（后续迭代）
- 不做域名 allowlist（后续迭代）
