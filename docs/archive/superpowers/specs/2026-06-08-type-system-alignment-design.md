# Capture All 类型系统全量对齐设计

日期：2026-06-08
状态：已批准
参考规格：`docs/capture_data_labels.md` v1.0

## 目标

将现有 Record All 扩展的类型系统、采集层、存储层、导出层全量对齐 `docs/capture_data_labels.md` 的产品规格。

## 决策记录

- session_id → capture_id：直接改名，不做兼容层
- RecordEvent.type 扁平分类 → category + type 两级分类：完全重构
- 全量对齐所有字段，包括当前为 null 的扩展字段
- `RecordConfig.capture_mode`（用户配置）值域 `'basic' | 'advanced'` 保持不变（UI/设置层不变）。`CaptureRecord.mode`（记录元数据）值域 `'standard' | 'deep' | 'custom'`，在录制启动时由 `capture_mode` 映射：`'basic'` → `'standard'`，`'advanced'` → `'deep'`，`'custom'` 为未来预留
- `console.error()` 调用通过 CDP `Runtime.consoleAPICalled` 采集时，`level=error` 的归入 `console_event`（保留 error 级别）。运行时异常（`Runtime.exceptionThrown`）独立走 `error/runtime_exception`
- IndexedDB 各事件 store 使用 `event_id` 作为 keyPath（唯一 ID），`capture_id` 作为索引。避免复合主键 `[capture_id, relative_time_ms]` 的高频碰撞风险

## 一、类型系统

### 1.1 公共事件基类 CaptureEvent

替代现有 `RecordEvent`。对齐 spec 2.2 节。

```typescript
interface CaptureEvent {
    event_id: string;
    capture_id: string;
    category: string;
    type: string;
    relative_time_ms: number;
    absolute_time: string;
    tab_id: number;
    frame_id: number;
    url: string;
    top_frame_url: string | null;
    page_title: string | null;
    source: 'content_script' | 'background';
    severity: 'info' | 'warning' | 'error' | 'fatal';
    related_event_ids: string[];
    redaction_status: 'none' | 'redacted';
    raw_available: boolean;
    created_at: string;
}
```

### 1.2 分类体系映射

| category | type | 替代现有 |
|----------|------|---------|
| `user_action` | `mouse_event` | `mouse` |
| `user_action` | `keyboard_event` | `keyboard` |
| `user_action` | `scroll_event` | `scroll` |
| `user_action` | `input_event` | `dom_change` |
| `navigation` | `page_navigation` | `navigation` |
| `navigation` | `route_change` | 新增 |
| `navigation` | `page_load` | `page_load` |
| `navigation` | `tab_switch` | `tab_switch` |
| `navigation` | `tab_created` | `tab_created` |
| `navigation` | `tab_url_change` | `tab_url_change` |
| `navigation` | `dom_ready` | `dom_ready` |
| `network` | `network_request` | fetch_request / xhr_request / network_body_hook / NetworkRequest 合并 |
| `console` | `console_event` | ConsoleLog（仅 console 输出） |
| `error` | `runtime_exception` | ConsoleLog（异常部分）分离 |
| `error` | `unhandled_rejection` | 新增 |
| `error` | `resource_error` | 新增 |
| `error` | `network_failed` | 新增 |
| `error` | `capture_error` | 新增 |
| `storage` | `storage_change` | storage_change |
| `cookie` | `cookie_change` | cookie_change |
| `dom_data` | `dom_mutation` | 新增（P1） |
| `capture_lifecycle` | `capture_started` | 新增 |
| `capture_lifecycle` | `capture_stopped` | 新增 |
| `capture_lifecycle` | `capture_config_changed` | 新增 |
| `capture_lifecycle` | `permission_missing` | 新增 |
| `capture_lifecycle` | `debugger_attach_status` | 新增 |
| `capture_lifecycle` | `body_capture_status_changed` | 新增 |

### 1.3 采集记录 CaptureRecord

替代现有 Session。对齐 spec 2.1 节。

```typescript
interface CaptureRecord {
    capture_id: string;
    name: string;
    status: 'capturing' | 'completed';
    mode: 'standard' | 'deep' | 'custom';
    started_at: string;
    ended_at: string | null;
    duration_ms: number;
    start_url: string;
    end_url: string | null;
    tab_id: number;
    window_id: number | null;
    config_snapshot: object;
    stats: object;
    export_status: 'not_exported' | 'exported';
    tags: string[];
    created_at: string;
    updated_at: string;
}
```

## 二、各类型字段定义

### 2.1 user_action

#### mouse_event

| 字段 | 类型 | 变更 |
|------|------|------|
| action | click/dblclick/contextmenu/mousemove/mousedown/mouseup/wheel/dragstart/dragend | 保留 |
| x | number | 保留 |
| y | number | 保留 |
| button | number | 保留 |
| target_selector | string | 保留 |
| target_xpath | string | 保留 |
| target_tag | string | 保留 |
| target_text_preview | string | 原 target_text 改名 |
| target_role | string \| null | 新增 |
| target_label | string \| null | 新增 |
| target_rect | object \| null | 新增 |
| is_trusted | boolean \| null | 新增 |

#### keyboard_event

| 字段 | 类型 | 变更 |
|------|------|------|
| action | keydown/keyup | 保留 |
| key | string | 保留 |
| code | string | 保留 |
| key_status | captured/masked | 新增 |
| modifiers | { ctrl, shift, alt, meta } | 保留 |
| target_selector | string | 保留 |
| target_xpath | string | 保留 |
| target_tag | string | 保留 |
| target_input_type | string \| null | 新增 |

#### scroll_event

| 字段 | 类型 | 变更 |
|------|------|------|
| scroll_x | number | 保留 |
| scroll_y | number | 保留 |
| scroll_height | number | 保留 |
| scroll_width | number | 保留 |
| viewport_height | number \| null | 新增 |
| viewport_width | number \| null | 新增 |
| target_selector | string \| null | 新增 |
| target_xpath | string \| null | 新增 |
| is_document_scroll | boolean | 新增 |

#### input_event（原 dom_change）

| 字段 | 类型 | 变更 |
|------|------|------|
| action | input/change/focus/blur | 保留 |
| target_selector | string | 保留 |
| target_xpath | string | 保留 |
| target_tag | string | 保留 |
| target_input_type | string \| null | 新增 |
| field_name | string \| null | 新增 |
| field_label | string \| null | 新增 |
| value_status | not_captured/captured/redacted | 新增，替代原 value 的隐式逻辑 |
| value_preview | string \| null | 新增 |
| value_length | number \| null | 新增 |
| checked | boolean \| null | 新增 |
| selected_count | number \| null | 新增 |

### 2.2 navigation

#### page_navigation

| 字段 | 类型 | 变更 |
|------|------|------|
| from_url | string \| null | 新增 |
| to_url | string | 原 url |
| navigation_type | link/typed/form_submit/script/meta/other | 新增 |
| transition_type | string \| null | 新增 |
| title | string \| null | 新增 |
| referrer | string \| null | 新增 |
| is_main_frame | boolean | 新增 |

#### route_change（新）

| 字段 | 类型 |
|------|------|
| from_url | string |
| to_url | string |
| route_action | push_state/replace_state/hash_change |
| from_path | string \| null |
| to_path | string \| null |
| title | string \| null |
| is_spa | boolean |

#### page_load

| 字段 | 类型 | 变更 |
|------|------|------|
| url | string | 保留 |
| title | string \| null | 新增 |
| load_event_time_ms | number \| null | 新增 |
| dom_content_loaded_time_ms | number \| null | 新增 |
| navigation_start_time | string \| null | 新增 |

#### dom_ready

| 字段 | 类型 | 变更 |
|------|------|------|
| url | string | 保留 |
| title | string \| null | 新增 |
| ready_state | loading/interactive/complete | 新增 |

#### tab_switch

| 字段 | 类型 | 变更 |
|------|------|------|
| from_tab_id | number \| null | 新增 |
| to_tab_id | number | 新增 |
| from_url | string \| null | 新增 |
| to_url | string \| null | 新增 |

#### tab_created

| 字段 | 类型 | 变更 |
|------|------|------|
| new_tab_id | number | 新增 |
| opener_tab_id | number \| null | 新增 |
| url | string \| null | 新增 |

#### tab_url_change

| 字段 | 类型 | 变更 |
|------|------|------|
| from_url | string \| null | 新增 |
| to_url | string | 保留 |
| change_reason | string \| null | 新增 |

### 2.3 network

#### network_request

合并现有 fetch_request、xhr_request、network_body_hook、NetworkRequest。

| 字段 | 类型 | 变更 |
|------|------|------|
| request_id | string | 新增 |
| method | string | 保留 |
| url | string | 保留 |
| url_status | captured/redacted | 新增 |
| status_code | number | 保留 |
| status_text | string \| null | 新增 |
| protocol | string \| null | 新增 |
| resource_type | fetch/xhr/document/script/stylesheet/image/font/other | 扩展 |
| initiator | string \| null | 新增 |
| duration_ms | number | 保留 |
| start_time_ms | number \| null | 新增 |
| end_time_ms | number \| null | 新增 |
| request_headers | Record<string, string> \| null | 保留 |
| response_headers | Record<string, string> \| null | 保留 |
| headers_status | captured/redacted | 新增 |
| request_body | string \| null | 保留 |
| request_body_status | captured/not_enabled/failed/too_large | 保留 |
| response_body | string \| null | 保留 |
| response_preview | string \| null | 新增 |
| response_body_status | captured/not_enabled/failed/too_large/unsupported/partial | 扩展 |
| mime_type | string \| null | 新增 |
| request_size_bytes | number \| null | 新增 |
| response_size_bytes | number \| null | 新增 |
| transfer_size_bytes | number \| null | 新增 |
| from_cache | boolean \| null | 新增 |
| cache_status | memory_cache/disk_cache/none | 新增 |
| error_text | string \| null | 新增 |
| capture_method | web_request/extension_cdp/external_cdp_bridge/fallback_hook | 新增 |
| body_capture_mode | none/extension_cdp/external_cdp_bridge/fallback_hook | 保留 |

### 2.4 console

#### console_event

与 error 分离。仅采集 console API 输出。

| 字段 | 类型 | 变更 |
|------|------|------|
| level | log/warn/info/debug/error | 保留 |
| args_preview | string[] | 原 args 改名 |
| args_status | captured/redacted | 新增 |
| stack_trace | string \| null | 保留 |
| source_url | string | 原 url 改名 |
| line | number | 保留 |
| column | number | 保留 |
| repeat_count | number \| null | 新增 |
| related_network_request_id | string \| null | 新增 |

### 2.5 error

#### runtime_exception

从 ConsoleLog 分离。独立类型。

| 字段 | 类型 |
|------|------|
| message | string |
| error_name | string \| null |
| stack_trace | string \| null |
| source_url | string \| null |
| line | number \| null |
| column | number \| null |
| exception_id | string \| null |
| severity | error/fatal |
| related_event_ids | string[] |

捕获范围：未捕获 TypeError/ReferenceError/RangeError/SyntaxError、setTimeout 回调异常、Promise 内部抛错（部分）。不捕获已被 try/catch 捕获的。

#### unhandled_rejection（新）

| 字段 | 类型 |
|------|------|
| message | string |
| reason_preview | string \| null |
| stack_trace | string \| null |
| source_url | string \| null |
| line | number \| null |
| column | number \| null |
| severity | warning/error |

#### resource_error（新）

| 字段 | 类型 |
|------|------|
| resource_url | string |
| resource_type | script/stylesheet/image/font/media/other |
| message | string \| null |
| element_selector | string \| null |
| status_code | number \| null |

#### network_failed（新）

| 字段 | 类型 |
|------|------|
| request_id | string |
| method | string |
| url | string |
| status_code | number \| null |
| error_text | string \| null |
| duration_ms | number \| null |
| failure_type | http_error/network_error |

#### capture_error（新）

| 字段 | 类型 |
|------|------|
| module | string |
| message | string |
| reason | string \| null |
| recoverable | boolean |
| fallback_used | boolean |

### 2.6 storage

#### storage_change

| 字段 | 类型 | 变更 |
|------|------|------|
| storage_type | local/session | 保留 |
| action | set/remove/clear | 保留 |
| key | string \| null | 保留 |
| old_value_length | number \| null | 新增 |
| new_value_length | number \| null | 原 value_length 改名 |
| value_status | not_captured/captured | 新增 |
| value_preview | string \| null | 新增 |
| origin | string | 新增 |
| source_stack | string \| null | 新增 |

### 2.7 cookie

#### cookie_change

| 字段 | 类型 | 变更 |
|------|------|------|
| name | string | 保留 |
| domain | string | 保留 |
| path | string | 保留 |
| cause | explicit/expired/evicted/expired_overwrite/overwrite/unknown | 保留，对齐 Chrome cookies.onChanged API |
| removed | boolean | 保留 |
| secure | boolean \| null | 新增 |
| http_only | boolean \| null | 新增 |
| same_site | unspecified/no_restriction/lax/strict | 新增，对齐 Chrome Cookie.sameSite 枚举 |
| expiration_date | number \| null | 新增，epoch seconds |
| store_id | string \| null | 新增 |
| value_status | not_captured/captured | 新增 |
| value_length | number \| null | 新增 |
| value_preview | string \| null | 新增 |

### 2.8 dom_data（P1 未来）

#### dom_mutation

对齐 spec 12.1。实现时再细化。

### 2.9 capture_lifecycle（新增）

#### capture_started

| 字段 | 类型 |
|------|------|
| capture_id | string |
| mode | standard/deep/custom |
| config_snapshot | object |
| start_url | string |
| trigger | popup/main_panel/shortcut |

#### capture_stopped

| 字段 | 类型 |
|------|------|
| capture_id | string |
| reason | user_stop/max_duration/error |
| duration_ms | number |
| stats | object |

#### capture_config_changed

| 字段 | 类型 |
|------|------|
| changed_by | user/system |
| field | string |
| old_value | any |
| new_value | any |

#### permission_missing

| 字段 | 类型 |
|------|------|
| permission | string |
| module | string |
| impact | string |
| recoverable | boolean |

#### debugger_attach_status

| 字段 | 类型 |
|------|------|
| status | attached/detached |
| reason | string \| null |
| fallback_used | boolean |
| affected_modules | string[] |

#### body_capture_status_changed

| 字段 | 类型 |
|------|------|
| body_capture_mode | none/extension_cdp/external_cdp_bridge/fallback_hook |
| status | enabled/disabled |
| reason | string \| null |

## 三、IndexedDB 存储改造

现有 3 个 store（sessions, record_events, network_requests, console_logs）→ 按分类拆为：

- `captures`（原 sessions）— keyPath: `capture_id`
- `user_action_events` — keyPath: `event_id`，index: `capture_id`, `type`, `relative_time_ms`
- `navigation_events` — keyPath: `event_id`，index: `capture_id`, `relative_time_ms`
- `network_requests` — keyPath: `event_id`，index: `capture_id`, `url`, `relative_time_ms`
- `console_events` — keyPath: `event_id`，index: `capture_id`, `level`, `relative_time_ms`
- `error_events` — keyPath: `event_id`，index: `capture_id`, `relative_time_ms`
- `storage_changes` — keyPath: `event_id`，index: `capture_id`, `relative_time_ms`
- `cookie_changes` — keyPath: `event_id`，index: `capture_id`, `relative_time_ms`
- `capture_lifecycle_events` — keyPath: `event_id`，index: `capture_id`, `relative_time_ms`

所有事件 store 统一用 `event_id`（UUID）作 keyPath，避免复合主键 `[capture_id, relative_time_ms]` 在高频场景下的碰撞覆盖。`capture_id` 作为索引支持按录制查询。

console_logs 和 error_logs 彻底分开。

DB version 升级（1→2），写 migration 处理旧数据。旧 store 保留不删，新 store 在 version 2 创建。

## 四、受影响文件清单

### 类型层
- `src/shared/types.ts` — 重写全部类型定义

### 采集层
- `src/extension/content/mouse_capture.ts`
- `src/extension/content/keyboard_capture.ts`
- `src/extension/content/scroll_capture.ts`
- `src/extension/content/dom_capture.ts` — 重命名为 input_event
- `src/extension/content/content_script.ts`
- `src/extension/content/storage_capture.ts`
- `src/extension/content/xhr_fetch_capture.ts` — 合并到 network
- `src/extension/content/network_hook.ts` — 合并到 network
- `src/extension/background/network_capture.ts`
- `src/extension/background/console_capture.ts` — 只采集 console
- `src/extension/background/exception_capture.ts` — 独立为 error
- `src/extension/background/cookie_capture.ts`
- `src/extension/background/service_worker.ts`

### 存储层
- `src/extension/background/storage.ts`

### 导出层
- `src/extension/background/exporter.ts`

### Agent 层
- `src/extension/background/agent_data_queries.ts`
- `src/extension/background/agent_command_dispatcher.ts`
- `src/agent/mcp/tools.ts`

### UI 层
- `src/extension/popup/popup.ts`
- `src/detail/detail.ts`

### 配置
- `src/shared/constants.ts`
- `src/shared/redaction.ts`

## 五、实施阶段

### 阶段 1：类型系统 + 公共字段

- 重写 types.ts
- 新增 event_id 生成工具
- 新增公共字段填充工具函数
- 确保 build 通过

### 阶段 2：采集层改造

每个模块独立改造，逐个迁移：

- mouse_capture → mouse_event
- keyboard_capture → keyboard_event
- scroll_capture → scroll_event
- dom_capture → input_event
- network_capture → 统一 network_request
- console_capture → console_event
- exception_capture → runtime_exception + error 分类
- cookie_capture → cookie_change 扩展
- storage_capture → storage_change 扩展
- content_script → route_change 新增
- service_worker → capture_lifecycle 新增

### 阶段 3：存储层 + 导出层

- storage.ts — store 拆分，DB migration
- exporter.ts — 适配新类型

### 阶段 4：Agent + UI 层

- MCP tools 适配
- popup / detail UI 适配
