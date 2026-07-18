# Capture All 类型系统全量对齐 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Record All 扩展的类型系统、采集层、存储层全量对齐 `docs/capture_data_labels.md` 产品规格。

**Architecture:** session_id → capture_id 改名；扁平 RecordEvent.type → category + type 两级分类；每个采集模块输出新格式；IndexedDB store 按分类拆分。4 阶段顺序执行，每阶段独立可测。

**Tech Stack:** TypeScript, Chrome Extension MV3, IndexedDB, Vite

**Spec:** `docs/superpowers/specs/2026-06-08-type-system-alignment-design.md`
**参考标准:** `docs/capture_data_labels.md`

---

## 文件结构总览

### 新建文件
- `src/shared/event_utils.ts` — event_id 生成、公共字段填充工具

### 重写文件
- `src/shared/types.ts` — 全部类型定义重写

### 修改文件
- `src/shared/constants.ts` — DB version、store names、默认配置
- `src/shared/redaction.ts` — 新字段脱敏
- `src/extension/content/mouse_capture.ts`
- `src/extension/content/keyboard_capture.ts`
- `src/extension/content/scroll_capture.ts`
- `src/extension/content/dom_capture.ts`
- `src/extension/content/storage_capture.ts`
- `src/extension/content/xhr_fetch_capture.ts`
- `src/extension/content/network_hook.ts`
- `src/extension/content/content_script.ts`
- `src/extension/background/network_capture.ts`
- `src/extension/background/console_capture.ts`
- `src/extension/background/exception_capture.ts`
- `src/extension/background/cookie_capture.ts`
- `src/extension/background/service_worker.ts`
- `src/extension/background/storage.ts`
- `src/extension/background/exporter.ts`
- `src/extension/background/agent_data_queries.ts`
- `src/extension/background/agent_command_dispatcher.ts`
- `src/agent/mcp/tools.ts`
- `src/extension/popup/popup.ts`
- `src/detail/detail.ts`

---

## 阶段 1：类型系统 + 公共基础设施

### Task 1: 重写 types.ts — 新类型定义

**Files:**
- Modify: `src/shared/types.ts`（全量重写）

- [ ] **Step 1: 备份旧类型，写入新类型定义**

将现有 `types.ts` 全量替换为以下内容。保留 `RecordConfig`、`UserConfig`、主题/时区等配置类型（它们不参与此次重命名），删除旧 `RecordEvent`、`Session`、`ConsoleLog`、`NetworkRequest`、各 `*EventData` 接口。

```typescript
// shared/types.ts

// ============================================================
// 采集记录 (Capture Record) — 替代原 Session
// ============================================================

export interface CaptureRecord {
    capture_id: string;
    name: string;
    status: 'capturing' | 'completed';
    mode: 'standard' | 'deep' | 'custom';
    started_at: string;           // ISO string
    ended_at: string | null;
    duration_ms: number;
    start_url: string;
    end_url: string | null;
    tab_id: number;
    window_id: number | null;
    config_snapshot: object;
    stats: CaptureStats;
    export_status: 'not_exported' | 'exported';
    tags: string[];
    created_at: string;
    updated_at: string;

    // 向后兼容：保留旧的 body_capture 字段
    body_capture_mode?: BodyCaptureMode;
    body_capture_status?: BodyCaptureRuntimeStatus;
    body_capture_failure_reason?: BodyCaptureFailureReason;
    body_capture_message?: string;
}

export interface CaptureStats {
    event_count: number;
    request_count: number;
    log_count: number;
    error_count: number;
    storage_change_count: number;
    cookie_change_count: number;
}

// ============================================================
// 公共事件基类 — 替代原 RecordEvent
// ============================================================

export interface CaptureEvent {
    event_id: string;
    capture_id: string;
    category: CategoryKey;
    type: EventType;
    relative_time_ms: number;
    absolute_time: string;         // ISO string
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

// ============================================================
// 分类与类型
// ============================================================

export type CategoryKey =
    | 'user_action'
    | 'navigation'
    | 'network'
    | 'console'
    | 'error'
    | 'storage'
    | 'cookie'
    | 'dom_data'
    | 'capture_lifecycle';

export type EventType =
    // user_action
    | 'mouse_event'
    | 'keyboard_event'
    | 'scroll_event'
    | 'input_event'
    // navigation
    | 'page_navigation'
    | 'route_change'
    | 'page_load'
    | 'tab_switch'
    | 'tab_created'
    | 'tab_url_change'
    | 'dom_ready'
    // network
    | 'network_request'
    // console
    | 'console_event'
    // error
    | 'runtime_exception'
    | 'unhandled_rejection'
    | 'resource_error'
    | 'network_failed'
    | 'capture_error'
    // storage
    | 'storage_change'
    // cookie
    | 'cookie_change'
    // dom_data
    | 'dom_mutation'
    // capture_lifecycle
    | 'capture_started'
    | 'capture_stopped'
    | 'capture_config_changed'
    | 'permission_missing'
    | 'debugger_attach_status'
    | 'body_capture_status_changed';

export type EventSource = 'content_script' | 'background';
export type Severity = 'info' | 'warning' | 'error' | 'fatal';
export type RedactionStatus = 'none' | 'redacted';

// ============================================================
// user_action 事件数据
// ============================================================

export interface MouseEventData {
    action: 'click' | 'dblclick' | 'contextmenu' | 'mousemove' | 'mousedown' | 'mouseup' | 'wheel' | 'dragstart' | 'dragend';
    x: number;
    y: number;
    button: number | null;
    target_selector: string | null;
    target_xpath: string | null;
    target_tag: string | null;
    target_text_preview: string | null;
    target_role: string | null;
    target_label: string | null;
    target_rect: { x: number; y: number; width: number; height: number } | null;
    is_trusted: boolean | null;
}

export interface KeyboardEventData {
    action: 'keydown' | 'keyup';
    key: string | null;
    code: string | null;
    key_status: 'captured' | 'masked';
    modifiers: { ctrl: boolean; shift: boolean; alt: boolean; meta: boolean };
    target_selector: string | null;
    target_xpath: string | null;
    target_tag: string | null;
    target_input_type: string | null;
}

export interface ScrollEventData {
    scroll_x: number;
    scroll_y: number;
    scroll_height: number;
    scroll_width: number;
    viewport_height: number | null;
    viewport_width: number | null;
    target_selector: string | null;
    target_xpath: string | null;
    is_document_scroll: boolean;
}

export interface InputEventData {
    action: 'input' | 'change' | 'focus' | 'blur';
    target_selector: string | null;
    target_xpath: string | null;
    target_tag: string | null;
    target_input_type: string | null;
    field_name: string | null;
    field_label: string | null;
    value_status: 'not_captured' | 'captured' | 'redacted';
    value_preview: string | null;
    value_length: number | null;
    checked: boolean | null;
    selected_count: number | null;
}

// ============================================================
// navigation 事件数据
// ============================================================

export interface PageNavigationData {
    from_url: string | null;
    to_url: string;
    navigation_type: 'link' | 'typed' | 'form_submit' | 'script' | 'meta' | 'other';
    transition_type: string | null;
    title: string | null;
    referrer: string | null;
    is_main_frame: boolean;
}

export interface RouteChangeData {
    from_url: string;
    to_url: string;
    route_action: 'push_state' | 'replace_state' | 'hash_change';
    from_path: string | null;
    to_path: string | null;
    title: string | null;
    is_spa: boolean;
}

export interface PageLoadData {
    url: string;
    title: string | null;
    load_event_time_ms: number | null;
    dom_content_loaded_time_ms: number | null;
    navigation_start_time: string | null;
}

export interface DomReadyData {
    url: string;
    title: string | null;
    ready_state: 'loading' | 'interactive' | 'complete';
}

export interface TabSwitchData {
    from_tab_id: number | null;
    to_tab_id: number;
    from_url: string | null;
    to_url: string | null;
}

export interface TabCreatedData {
    new_tab_id: number;
    opener_tab_id: number | null;
    url: string | null;
}

export interface TabUrlChangeData {
    from_url: string | null;
    to_url: string;
    change_reason: string | null;
}

// ============================================================
// network 事件数据
// ============================================================

export interface NetworkRequestData {
    request_id: string;
    method: string;
    url: string;
    url_status: 'captured' | 'redacted';
    status_code: number | null;
    status_text: string | null;
    protocol: string | null;
    resource_type: 'fetch' | 'xhr' | 'document' | 'script' | 'stylesheet' | 'image' | 'font' | 'media' | 'websocket' | 'other';
    initiator: string | null;
    duration_ms: number | null;
    start_time_ms: number | null;
    end_time_ms: number | null;
    request_headers: Record<string, string> | null;
    response_headers: Record<string, string> | null;
    headers_status: 'captured' | 'redacted';
    request_body: string | null;
    request_body_status: BodyCaptureStatus;
    response_body: string | null;
    response_preview: string | null;
    response_body_status: BodyCaptureStatus;
    mime_type: string | null;
    request_size_bytes: number | null;
    response_size_bytes: number | null;
    transfer_size_bytes: number | null;
    from_cache: boolean | null;
    cache_status: 'memory_cache' | 'disk_cache' | 'none' | null;
    error_text: string | null;
    capture_method: 'web_request' | 'extension_cdp' | 'external_cdp_bridge' | 'fallback_hook';
    body_capture_mode: BodyCaptureMode;
}

// ============================================================
// console 事件数据
// ============================================================

export interface ConsoleEventData {
    level: 'log' | 'warn' | 'info' | 'debug' | 'error';
    args_preview: string[];
    args_status: 'captured' | 'redacted';
    stack_trace: string | null;
    source_url: string | null;
    line: number | null;
    column: number | null;
    repeat_count: number | null;
    related_network_request_id: string | null;
}

// ============================================================
// error 事件数据
// ============================================================

export interface RuntimeExceptionData {
    message: string;
    error_name: string | null;
    stack_trace: string | null;
    source_url: string | null;
    line: number | null;
    column: number | null;
    exception_id: string | null;
    severity: 'error' | 'fatal';
    related_event_ids: string[];
}

export interface UnhandledRejectionData {
    message: string;
    reason_preview: string | null;
    stack_trace: string | null;
    source_url: string | null;
    line: number | null;
    column: number | null;
    severity: 'warning' | 'error';
}

export interface ResourceErrorData {
    resource_url: string;
    resource_type: 'script' | 'stylesheet' | 'image' | 'font' | 'media' | 'other';
    message: string | null;
    element_selector: string | null;
    status_code: number | null;
}

export interface NetworkFailedData {
    request_id: string;
    method: string;
    url: string;
    status_code: number | null;
    error_text: string | null;
    duration_ms: number | null;
    failure_type: 'http_error' | 'network_error';
}

export interface CaptureErrorData {
    module: string;
    message: string;
    reason: string | null;
    recoverable: boolean;
    fallback_used: boolean;
}

// ============================================================
// storage 事件数据
// ============================================================

export interface StorageChangeData {
    storage_type: 'local' | 'session';
    action: 'set' | 'remove' | 'clear';
    key: string | null;
    old_value_length: number | null;
    new_value_length: number | null;
    value_status: 'not_captured' | 'captured';
    value_preview: string | null;
    origin: string | null;
    source_stack: string | null;
}

// ============================================================
// cookie 事件数据
// ============================================================

export interface CookieChangeData {
    name: string;
    domain: string;
    path: string;
    cause: 'explicit' | 'expired' | 'evicted' | 'expired_overwrite' | 'overwrite' | 'unknown';
    removed: boolean;
    secure: boolean | null;
    http_only: boolean | null;
    same_site: 'unspecified' | 'no_restriction' | 'lax' | 'strict' | null;
    expiration_date: number | null;
    store_id: string | null;
    value_status: 'not_captured' | 'captured';
    value_length: number | null;
    value_preview: string | null;
}

// ============================================================
// capture_lifecycle 事件数据
// ============================================================

export interface CaptureStartedData {
    capture_id: string;
    mode: 'standard' | 'deep' | 'custom';
    config_snapshot: object;
    start_url: string;
    trigger: 'popup' | 'main_panel' | 'shortcut';
}

export interface CaptureStoppedData {
    capture_id: string;
    reason: 'user_stop' | 'max_duration' | 'error';
    duration_ms: number;
    stats: object;
}

export interface CaptureConfigChangedData {
    changed_by: 'user' | 'system';
    field: string;
    old_value: unknown;
    new_value: unknown;
}

export interface PermissionMissingData {
    permission: string;
    module: string;
    impact: string;
    recoverable: boolean;
}

export interface DebuggerAttachStatusData {
    status: 'attached' | 'detached';
    reason: string | null;
    fallback_used: boolean;
    affected_modules: string[];
}

export interface BodyCaptureStatusChangedData {
    body_capture_mode: BodyCaptureMode;
    status: 'enabled' | 'disabled';
    reason: string | null;
}

// ============================================================
// Body 采集相关类型（保留，微调）
// ============================================================

export type BodyCaptureStatus =
    | 'not_enabled'
    | 'captured'
    | 'failed'
    | 'too_large'
    | 'unsupported'
    | 'unsupported_binary'
    | 'opaque_response'
    | 'cdp_failed'
    | 'fallback_unavailable'
    | 'target_not_matched'
    | 'permission_denied'
    | 'partial'
    | 'redacted';

export type BodyCaptureMode = 'none' | 'extension_cdp' | 'external_cdp_bridge' | 'fallback_hook';

export type BodyCaptureRuntimeStatus = 'not_enabled' | 'active' | 'partial' | 'failed';

export type BodyCaptureFailureReason =
    | 'another_debugger_attached'
    | 'bridge_unavailable'
    | 'cdp_port_not_found'
    | 'cdp_target_not_found'
    | 'cdp_attach_failed'
    | 'cdp_body_failed'
    | 'permission_denied'
    | 'restricted_url'
    | 'unknown';

export type NetworkCorrelationStatus = 'matched' | 'ambiguous' | 'cdp_only' | 'web_request_only' | 'fallback_hook';

export interface BodyCaptureStartResult {
    mode: BodyCaptureMode;
    status: BodyCaptureRuntimeStatus;
    failure_reason?: BodyCaptureFailureReason;
    message?: string;
}

// ============================================================
// 配置类型（保留，不参与此次改名）
// ============================================================

export interface RecordConfig {
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
    redact_data: boolean;
    sample_rate_ms: number;
}

export type ThemeMode = 'follow-system' | 'light' | 'dark';
export type SystemTimeTimezone = 'browser' | 'UTC' | 'Asia/Shanghai';
export type DetailTimeDisplayMode = 'relative' | 'system';

export interface UserConfig {
    selected_mode: 'basic' | 'advanced';
    mouse_precision: 'clicks' | 'clicks_scroll_drag' | 'full_trajectory';
    keyboard_capture_mode: 'none' | 'shortcuts' | 'all';
    capture_input_values: boolean;
    capture_request_body: boolean;
    capture_response_body: boolean;
    redact_data: boolean;
    theme: ThemeMode;
    locale: string;
    system_time_timezone: SystemTimeTimezone;
    detail_time_display_mode: DetailTimeDisplayMode;
    export_directory: string;
    export_filename_template: string;
    export_save_as: boolean;
    agent_bridge_enabled: boolean;
    agent_bridge_url: string;
    agent_bridge_token: string;
    agent_bridge_poll_interval_ms: number;
}

// ============================================================
// 向后兼容别名（临时，阶段 2 完成后删除）
// ============================================================

/** @deprecated 使用 CaptureRecord */
export type Session = CaptureRecord;
/** @deprecated 使用 CaptureEvent */
export type RecordEvent = CaptureEvent;
/** @deprecated 使用 ConsoleEventData */
export type ConsoleLog = ConsoleEventData;
/** @deprecated 使用 NetworkRequestData */
export type NetworkRequest = NetworkRequestData;
/** @deprecated 使用 RuntimeExceptionData */
export type ErrorLog = RuntimeExceptionData;
```

- [ ] **Step 2: 运行 build 验证类型编译**

Run: `cd /home/karon/karson_ubuntu/record_all && npm run build 2>&1 | head -40`

预期：大量类型错误（因为其他文件还在引用旧类型）。这是预期的——后续 task 逐个修复。

- [ ] **Step 3: 提交类型定义**

```bash
git add src/shared/types.ts
git commit -m "refactor: rewrite types.ts — new category/type system, CaptureRecord, CaptureEvent"
```

---

### Task 2: 新建 event_utils.ts — event_id 生成 + 公共字段填充

**Files:**
- Create: `src/shared/event_utils.ts`

- [ ] **Step 1: 编写 event_utils.ts**

```typescript
// shared/event_utils.ts
import type { CaptureEvent, CategoryKey, EventType, EventSource, Severity } from './types';

let event_counter = 0;

export function generate_event_id(): string {
    event_counter++;
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `evt_${ts}_${rand}_${event_counter}`;
}

export function reset_event_counter(): void {
    event_counter = 0;
}

export function get_relative_time(capture_start_epoch_ms: number): number {
    return Date.now() - capture_start_epoch_ms;
}

export function create_base_event(params: {
    capture_id: string;
    category: CategoryKey;
    type: EventType;
    relative_time_ms: number;
    tab_id: number;
    frame_id?: number;
    url?: string;
    source: EventSource;
    severity?: Severity;
}): CaptureEvent {
    return {
        event_id: generate_event_id(),
        capture_id: params.capture_id,
        category: params.category,
        type: params.type,
        relative_time_ms: params.relative_time_ms,
        absolute_time: new Date().toISOString(),
        tab_id: params.tab_id,
        frame_id: params.frame_id ?? 0,
        url: params.url ?? '',
        top_frame_url: null,
        page_title: null,
        source: params.source,
        severity: params.severity ?? 'info',
        related_event_ids: [],
        redaction_status: 'none',
        raw_available: true,
        created_at: new Date().toISOString(),
    };
}
```

- [ ] **Step 2: 提交**

```bash
git add src/shared/event_utils.ts
git commit -m "feat: add event_utils — event_id generation and base event creation"
```

---

### Task 3: 更新 constants.ts — DB version + store names

**Files:**
- Modify: `src/shared/constants.ts`

- [ ] **Step 1: 更新 DB_VERSION 和 STORE_NAMES**

在 `constants.ts` 中：

- `DB_VERSION` 从 `1` 改为 `2`
- `STORE_NAMES` 改为：

```typescript
export const STORE_NAMES = {
    CAPTURES: 'captures',
    USER_ACTION_EVENTS: 'user_action_events',
    NAVIGATION_EVENTS: 'navigation_events',
    NETWORK_REQUESTS: 'network_requests',
    CONSOLE_EVENTS: 'console_events',
    ERROR_EVENTS: 'error_events',
    STORAGE_CHANGES: 'storage_changes',
    COOKIE_CHANGES: 'cookie_changes',
    CAPTURE_LIFECYCLE_EVENTS: 'capture_lifecycle_events',
} as const;
```

- `DEFAULT_CONFIG.capture_mode` 保持 `'basic'` 不变（UI/设置层值域不变，映射关系在 service_worker.ts 中处理：`'basic'` → `CaptureRecord.mode = 'standard'`，`'advanced'` → `'deep'`）
- `DEFAULT_USER_CONFIG.selected_mode` 保持 `'basic'` 不变
- `export_filename_template` 中 `{session_id}` 改为 `{capture_id}`

- [ ] **Step 2: 提交**

```bash
git add src/shared/constants.ts
git commit -m "refactor: update DB version, store names, capture mode naming"
```

---

## 阶段 2：存储层改造

### Task 4: 重写 storage.ts — 新 store 结构 + DB migration

**Files:**
- Modify: `src/extension/background/storage.ts`

- [ ] **Step 1: 更新 import**

将 `Session, RecordEvent, NetworkRequest, ConsoleLog, ErrorLog` 改为 `CaptureRecord, CaptureEvent, NetworkRequestData, ConsoleEventData, RuntimeExceptionData`。

- [ ] **Step 2: 重写 init_db 的 onupgradeneeded**

创建 9 个新 store：
- `captures` — keyPath: `capture_id`，index: `started_at`
- `user_action_events` — keyPath: `event_id`，index: `capture_id`, `type`, `relative_time_ms`
- `navigation_events` — keyPath: `event_id`，index: `capture_id`, `relative_time_ms`
- `network_requests` — keyPath: `event_id`，index: `capture_id`, `url`, `relative_time_ms`
- `console_events` — keyPath: `event_id`，index: `capture_id`, `level`, `relative_time_ms`
- `error_events` — keyPath: `event_id`，index: `capture_id`, `relative_time_ms`
- `storage_changes` — keyPath: `event_id`，index: `capture_id`, `relative_time_ms`
- `cookie_changes` — keyPath: `event_id`，index: `capture_id`, `relative_time_ms`
- `capture_lifecycle_events` — keyPath: `event_id`，index: `capture_id`, `relative_time_ms`

所有事件 store 统一用 `event_id`（全局唯一）作 keyPath，避免复合主键 `[capture_id, relative_time_ms]` 在高频场景下的碰撞覆盖。`capture_id` 作为索引支持按录制查询。

对于 DB_VERSION 从 1 升到 2 的迁移：保留旧 store 不删（只增不减），新 store 只在新版本创建。

- [ ] **Step 3: 重写 CRUD 函数**

所有函数 `session_id` → `capture_id`：
- `create_session` → `create_capture`
- `get_session` → `get_capture`
- `list_sessions` → `list_captures`
- `update_session` → `update_capture`
- `delete_session` → `delete_capture`（遍历所有新 store 删除）
- `write_events` → 按 `category` 分流写入对应 store
- `write_requests` → `write_network_requests`（写入 `network_requests` store）
- `write_logs` → `write_console_events`（写入 `console_events` store）
- `write_errors` → `write_error_events`（写入 `error_events` store）

新增：
- `write_storage_changes`
- `write_cookie_changes`
- `write_lifecycle_events`

查询函数同理：
- `get_events` → `get_events_by_category(capture_id, category, offset, limit)`
- `get_network_requests` → 保持
- `get_console_logs` → `get_console_events`
- `get_error_logs` → `get_error_events`

新增：
- `get_storage_changes`
- `get_cookie_changes`
- `get_lifecycle_events`

所有内部 `bytes_written` map 的 key 从 `session_id` 改为 `capture_id`。

- [ ] **Step 4: 更新 flush 函数**

9 个 store 各一个 flush 函数：`flush_user_action`, `flush_navigation`, `flush_network`, `flush_console`, `flush_errors`, `flush_storage`, `flush_cookie`, `flush_lifecycle`。

`flush_all` 合并调用全部。

- [ ] **Step 5: 提交**

```bash
git add src/extension/background/storage.ts
git commit -m "refactor: rewrite storage.ts — new stores, capture_id, category-based routing"
```

---

## 阶段 3：采集层改造（每个模块独立）

每个采集模块的改造遵循相同模式：
1. import 新类型
2. 用 `create_base_event` 构造公共字段
3. 填充事件特定数据（新字段先填 null）
4. 输出类型从旧的 `RecordEvent`/`ConsoleLog`/`NetworkRequest` 改为新的 `CaptureEvent` + 对应 `*Data`
5. `session_id` → `capture_id`

### Task 5: mouse_capture.ts → mouse_event

**Files:**
- Modify: `src/extension/content/mouse_capture.ts`

- [ ] **Step 1: 更新 import 和类型**

将 `import type { RecordConfig, MouseEventData }` 改为 `import type { RecordConfig, MouseEventData as MouseEventData }`（类型名不变，字段扩展）。

所有 `send_event('mouse', data)` 改为发送完整 `CaptureEvent`，category 固定 `'user_action'`，type 固定 `'mouse_event'`。

新增字段填充：`target_role`, `target_label`, `target_rect`, `is_trusted` 先填 `null`。

- [ ] **Step 2: 提交**

```bash
git add src/extension/content/mouse_capture.ts
git commit -m "refactor: mouse_capture → category/type system, extended fields"
```

### Task 6: keyboard_capture.ts → keyboard_event

**Files:**
- Modify: `src/extension/content/keyboard_capture.ts`

- [ ] **Step 1: 同上模式改造**

category: `'user_action'`，type: `'keyboard_event'`。
新增字段：`key_status`（根据 redact_data 决定 `'captured'` 或 `'masked'`），`target_input_type` 先填 `null`。

- [ ] **Step 2: 提交**

```bash
git add src/extension/content/keyboard_capture.ts
git commit -m "refactor: keyboard_capture → category/type system, key_status field"
```

### Task 7: scroll_capture.ts → scroll_event

**Files:**
- Modify: `src/extension/content/scroll_capture.ts`

- [ ] **Step 1: 改造**

category: `'user_action'`，type: `'scroll_event'`。
新增字段：`viewport_height`（`window.innerHeight`），`viewport_width`（`window.innerWidth`），`target_selector`/`target_xpath` 先填 `null`，`is_document_scroll` 设为 `true`。

- [ ] **Step 2: 提交**

```bash
git add src/extension/content/scroll_capture.ts
git commit -m "refactor: scroll_capture → category/type system, viewport fields"
```

### Task 8: dom_capture.ts → input_event

**Files:**
- Modify: `src/extension/content/dom_capture.ts`

- [ ] **Step 1: 改造**

这是重命名最大的模块：`dom_change` → `input_event`。
category: `'user_action'`，type: `'input_event'`。
数据类型从 `DomChangeData` 改为 `InputEventData`。

字段映射：
- `value` → `value_preview` + `value_status`
- 新增 `field_name`（从 `target.name` 取），`field_label`（从关联 label 取），`target_input_type`（从 `target.type` 取），`checked`，`selected_count`

password 永远 `value_status: 'not_captured'`，`value_preview: null`。
非 password 且 `capture_input_values=true` 时 `value_status: 'captured'`。
`redact_data=true` 时 `value_status: 'redacted'`。

- [ ] **Step 2: 提交**

```bash
git add src/extension/content/dom_capture.ts
git commit -m "refactor: dom_capture → input_event, InputEventData with value_status"
```

### Task 9: storage_capture.ts → storage_change

**Files:**
- Modify: `src/extension/content/storage_capture.ts`

- [ ] **Step 1: 改造**

category: `'storage'`，type: `'storage_change'`。
新增字段：`old_value_length`（先填 `null`），`new_value_length`（原 `value_length`），`value_status: 'not_captured'`，`value_preview: null`，`origin`（`window.location.origin`），`source_stack: null`。

- [ ] **Step 2: 提交**

```bash
git add src/extension/content/storage_capture.ts
git commit -m "refactor: storage_capture → extended StorageChangeData fields"
```

### Task 10: cookie_capture.ts → cookie_change

**Files:**
- Modify: `src/extension/background/cookie_capture.ts`

- [ ] **Step 1: 改造**

category: `'cookie'`，type: `'cookie_change'`。
新增字段：`secure`（`info.cookie.secure`），`http_only`（`info.cookie.httpOnly`），`same_site`（`info.cookie.sameSite`），`expiration_date`（`info.cookie.expirationDate`），`store_id`（`info.cookie.storeId`），`value_status: 'not_captured'`，`value_length: null`，`value_preview: null`。

- [ ] **Step 2: 提交**

```bash
git add src/extension/background/cookie_capture.ts
git commit -m "refactor: cookie_capture → extended CookieChangeData fields"
```

### Task 11: console_capture.ts → console_event（与异常分离）

**Files:**
- Modify: `src/extension/background/console_capture.ts`

- [ ] **Step 1: 改造**

category: `'console'`，type: `'console_event'`。
只监听 `Runtime.consoleAPICalled`，不再处理异常。
`console.error()` 输出（CDP type=`error`）仍归入 `console_event`，level 保留 `'error'`。与 `Runtime.exceptionThrown`（运行时异常）彻底分离。
输出类型从 `ConsoleLog` 改为 `CaptureEvent` + `ConsoleEventData`。

字段映射：
- `args` → `args_preview` + `args_status: 'captured'`
- `url` → `source_url`
- 新增 `repeat_count: null`，`related_network_request_id: null`

回调签名从 `send_to_background: (log: ConsoleLog) => void` 改为 `send_to_background: (event: CaptureEvent) => void`。

- [ ] **Step 2: 提交**

```bash
git add src/extension/background/console_capture.ts
git commit -m "refactor: console_capture → ConsoleEvent, separated from exceptions"
```

### Task 12: exception_capture.ts → runtime_exception（独立 error 分类）

**Files:**
- Modify: `src/extension/background/exception_capture.ts`

- [ ] **Step 1: 改造**

category: `'error'`，type: `'runtime_exception'`。
输出类型从 `ConsoleLog` 改为 `CaptureEvent` + `RuntimeExceptionData`。
不再走 `handle_console_log`，使用独立回调。

字段映射：
- `message` → 从 `exception.description` 或 `details.text` 取
- 新增 `error_name`（`exception.className` 或从 message 提取）
- 新增 `exception_id`（`params.exception?.objectId`）
- `severity: 'error'`
- `related_event_ids: []`

回调签名改为 `send_to_background: (event: CaptureEvent) => void`。

- [ ] **Step 2: 提交**

```bash
git add src/extension/background/exception_capture.ts
git commit -m "refactor: exception_capture → RuntimeExceptionData, independent error category"
```

### Task 13: network_capture.ts + xhr_fetch_capture.ts + network_hook.ts → 统一 network_request

**Files:**
- Modify: `src/extension/background/network_capture.ts`
- Modify: `src/extension/content/xhr_fetch_capture.ts`
- Modify: `src/extension/content/network_hook.ts`

- [ ] **Step 1: network_capture.ts 改造**

输出类型从 `NetworkRequest` 改为 `CaptureEvent` + `NetworkRequestData`。
新增字段填充（先填 null）：`request_id`, `url_status`, `status_text`, `protocol`, `initiator`, `start_time_ms`, `end_time_ms`, `headers_status`, `response_preview`, `mime_type`, `request_size_bytes`, `response_size_bytes`, `transfer_size_bytes`, `from_cache`, `cache_status`, `error_text`, `capture_method`。

`session_id` → `capture_id`。
`relative_time` → `relative_time_ms`。
`absolute_time` 从 epoch ms 改为 ISO string。

- [ ] **Step 2: xhr_fetch_capture.ts 改造**

输出改为发送 `CaptureEvent`，category: `'network'`，type: `'network_request'`。
从 `send_event('fetch_request', ...)` / `send_event('xhr_request', ...)` 统一为 `send_event('network_request', ...)`。
数据用 `NetworkRequestData` 的子集填充（很多字段先 null）。

- [ ] **Step 3: network_hook.ts 改造**

同理，`send_event('network_body_hook', ...)` 改为 `send_event('network_request', ...)`。
`capture_method` 固定 `'fallback_hook'`。

- [ ] **Step 4: 提交**

```bash
git add src/extension/background/network_capture.ts src/extension/content/xhr_fetch_capture.ts src/extension/content/network_hook.ts
git commit -m "refactor: unify network capture → single network_request type"
```

### Task 14: content_script.ts + service_worker.ts — session_id → capture_id + route_change + lifecycle

**Files:**
- Modify: `src/extension/content/content_script.ts`
- Modify: `src/extension/background/service_worker.ts`

- [ ] **Step 1: content_script.ts 改造**

- 所有 `send_event` 输出改为 `CaptureEvent`
- 新增 `route_change` 事件监听（`popstate` + `hashchange`）
- `dom_ready` 事件输出 `DomReadyData`（含 `ready_state`）

- [ ] **Step 2: service_worker.ts 改造**

- `session_id` → `capture_id` 全局替换
- `Session` → `CaptureRecord`
- 创建 `CaptureRecord` 时，`mode` 从 `RecordConfig.capture_mode` 映射：`'basic'` → `'standard'`，`'advanced'` → `'deep'`
- 启动录制时写入 `capture_lifecycle.capture_started` 事件
- 停止录制时写入 `capture_lifecycle.capture_stopped` 事件
- body capture 状态变化时写入 `capture_lifecycle.body_capture_status_changed` 事件
- `tab_switch` 事件：新增模块级变量 `last_active_tab: Map<windowId, {tab_id, url}>` 跟踪上一个活跃 tab，以填充 `TabSwitchData.from_tab_id` 和 `from_url`
- 导航事件（`page_navigation`, `page_load`, `tab_switch`, `tab_created`, `tab_url_change`）使用新的数据类型
- storage/cookie 事件写入新 store
- console/error 事件分别写入 `console_events` 和 `error_events`

- [ ] **Step 3: 提交**

```bash
git add src/extension/content/content_script.ts src/extension/background/service_worker.ts
git commit -m "refactor: service_worker + content_script — capture_id, route_change, lifecycle events"
```

---

## 阶段 4：导出层 + Agent 层 + UI 层

### Task 15: exporter.ts — 适配新类型

**Files:**
- Modify: `src/extension/background/exporter.ts`

- [ ] **Step 1: 更新所有类型引用和字段名**

- `Session` → `CaptureRecord`
- `session_id` → `capture_id`
- `RecordEvent` → `CaptureEvent`
- `ConsoleLog` → `ConsoleEventData`
- `NetworkRequest` → `NetworkRequestData`
- 导出格式中 `session` key 改为 `capture`
- JSON/JSONL/HAR 中 `session_id` 改为 `capture_id`
- HTML 报告模板更新标签

- [ ] **Step 2: 提交**

```bash
git add src/extension/background/exporter.ts
git commit -m "refactor: exporter — capture_id, new type references"
```

### Task 16: agent_data_queries.ts + agent_command_dispatcher.ts — 适配新类型

**Files:**
- Modify: `src/extension/background/agent_data_queries.ts`
- Modify: `src/extension/background/agent_command_dispatcher.ts`

- [ ] **Step 1: agent_data_queries.ts 改造**

- `list_data_sources` 返回新的 source 名（`user_action_events`, `navigation_events`, `network_requests`, `console_events`, `error_events`, `storage_changes`, `cookie_changes`）
- 所有查询函数 `session_id` → `capture_id`
- 使用 storage.ts 的新 API

- [ ] **Step 2: agent_command_dispatcher.ts 改造**

- 命令处理中 `session_id` → `capture_id`
- 调用 storage.ts 的新 API

- [ ] **Step 3: 提交**

```bash
git add src/extension/background/agent_data_queries.ts src/extension/background/agent_command_dispatcher.ts
git commit -m "refactor: agent queries + dispatcher — capture_id, new sources"
```

### Task 17: MCP tools.ts — 适配新类型

**Files:**
- Modify: `src/agent/mcp/tools.ts`

- [ ] **Step 1: 更新工具描述和返回格式**

- `list_sessions` → `list_captures`（工具名不变，描述更新）
- 返回数据中 `session_id` → `capture_id`
- `list_data_sources` 返回新 source 名

- [ ] **Step 2: 提交**

```bash
git add src/agent/mcp/tools.ts
git commit -m "refactor: MCP tools — capture_id, new source names"
```

### Task 18: popup.ts + detail.ts — UI 适配

**Files:**
- Modify: `src/extension/popup/popup.ts`
- Modify: `src/detail/detail.ts`

- [ ] **Step 1: popup.ts 改造**

- 所有 `session_id` → `capture_id`
- `Session` → `CaptureRecord`
- 统计显示中新增 `error_count`, `storage_change_count`, `cookie_change_count`
- 采集模式标签：`basic` → `标准采集`，`advanced` → `深度采集`

- [ ] **Step 2: detail.ts 改造**

- 所有 `session_id` → `capture_id`
- 详情页 tabs 更新为新的分类（`用户行为`, `导航`, `网络`, `Console`, `错误`, `Storage`, `Cookie`）
- 事件列表按 `category` 分组显示
- `dom_change` → `input_event` 显示标签
- `Console` 和 `错误` 分开显示

- [ ] **Step 3: 提交**

```bash
git add src/extension/popup/popup.ts src/detail/detail.ts
git commit -m "refactor: popup + detail UI — capture_id, new category tabs"
```

### Task 19: redaction.ts — 新字段脱敏

**Files:**
- Modify: `src/shared/redaction.ts`

- [ ] **Step 1: 更新脱敏函数**

- 新增 `redact_url` 返回 `url_status: 'redacted'`
- 新增 `redact_headers` 返回 `headers_status: 'redacted'`
- `truncate_response_body` 新增 `response_preview` 生成（前 200 字符）
- 保留所有现有脱敏逻辑

- [ ] **Step 2: 提交**

```bash
git add src/shared/redaction.ts
git commit -m "refactor: redaction — url_status, headers_status, response_preview"
```

---

## 最终验证

### Task 20: 全量 build + 功能验证

- [ ] **Step 1: 运行 build**

Run: `cd /home/karon/karson_ubuntu/record_all && npm run build`

预期：build 成功，无类型错误。

- [ ] **Step 2: 运行单元测试**

Run: `cd /home/karon/karson_ubuntu/record_all && npm test`

需要检查和修复的测试文件（引用了旧类型 `Session`, `RecordEvent`, `ConsoleLog`, `NetworkRequest`, `session_id` 等）：
- `tests/storage.test.ts` — 存储层测试，引用 `Session`, `session_id`, 旧 store 名
- `tests/network_capture.test.ts` — 引用 `NetworkRequest`, `session_id`
- `tests/redaction.test.ts` — 引用 `ConsoleLog` 等
- `tests/export_settings.test.ts` — 可能引用 `session_id`
- `tests/agent_bridge_client.test.ts` — 可能引用 `session_id`
- `tests/agent_protocol.test.ts` — 可能引用旧类型
- `tests/agent_mcp_client.test.ts` — 可能引用旧类型
- `tests/network_correlator.test.ts` — 引用 `NetworkRequest` 等
- `tests/agent_bridge_queue.test.ts` — 可能引用 `session_id`
- `tests/external_cdp_bridge_client.test.ts` — 可能引用旧类型
- `tests/popup_detail_url.test.ts` — 可能引用 `session_id`
- `tests/popup_config_sync.test.ts` — 可能引用 `session_id`
- `tests/system_time.test.ts` — 可能引用时间字段
- E2E 测试（`tests/e2e*.spec.ts`）— 可能引用 `session_id`，按需修复

修复所有因类型变更导致的测试失败。

- [ ] **Step 3: 手动功能验证**

在 Chrome 中加载扩展，进行一次完整采集，验证：
- popup 显示 `capture_id`
- 详情页新分类 tabs 正常
- 事件列表按 category 分组
- console 和 error 分开显示
- 导出 JSON 中使用 `capture_id` 和新类型

- [ ] **Step 4: 删除 types.ts 中的向后兼容别名**

删除 `Session`, `RecordEvent`, `ConsoleLog`, `NetworkRequest`, `ErrorLog` 的 `@deprecated` 类型别名。

- [ ] **Step 5: 最终提交**

```bash
git add -A
git commit -m "refactor: remove deprecated type aliases, final alignment"
```

- [ ] **Step 6: 更新 artifacts/data_capture_labels.md**

同步更新文档，标注所有已实现的字段。

- [ ] **Step 7: 更新 TASKS.md**

将已完成的任务标记完成，移入 archive。
