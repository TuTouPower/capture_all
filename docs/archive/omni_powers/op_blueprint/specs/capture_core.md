# 采集核心

Service Worker（`src/extension/background/service_worker.ts`）协调采集生命周期、消息路由、CDP attach、数据持久化。命名见 `../conventions.md`，术语见 `../domain.md`。

## 1. 接口

Popup / Dashboard 通过 `chrome.runtime.sendMessage` 调用：

```typescript
// 请求
{ action: string, payload?: Record<string, unknown> }
// 响应
{ success: boolean, data?: unknown, error?: string }
```

主要 action：`start` / `stop` / `get_status` / `list_captures` / `get_capture` / `delete_capture` / 导出类。

## 2. 生命周期

### 2.1 start

```
startCapture(tab_id, config)
  → 同一时刻只允许一次活跃采集；否则 CAPTURE_ALREADY_RUNNING
  → 创建 CaptureRecord（mode 由 capture_mode 映射，UI 不暴露）
  → 写入 capture_lifecycle.capture_started 事件
  → 通知所有 content script 激活采集（按 tab）
  → 按需 attach CDP：
      - console_capture（Runtime.consoleAPICalled）
      - exception_capture（Runtime.exceptionThrown）
      - body_capture_coordinator（Network.*）
  → 初始化 body capture coordinator（三层降级，见 network_body_capture.md）
  → 启动 agent bridge 轮询（agent_bridge_client.ts）
  → 启动 keepalive（chrome.alarms，防 MV3 30s 超时）
  → 返回 { capture_id, status: 'capturing' }
```

### 2.2 stop

```
stopCapture(capture_id)
  → 停止所有 content capture 模块
  → detach CDP（若 dbg_tab_id 非空且非外部 attached）
  → 停止 agent bridge 轮询
  → 强制 flush 所有未写入数据（批次 100，间隔 1000ms 的剩余）
  → 更新 CaptureRecord status='completed', ended_at, duration_ms, stats
  → 写入 capture_lifecycle.capture_stopped 事件
  → 返回最终统计
```

### 2.3 get_status

返回当前活跃采集的 `capture_id`、status、duration、7 标签实时计数（来自 `capture_stats.ts`，非固定 0）。

## 3. CDP attach 状态机

模块级状态（`network_capture.ts`）：

- `dbg_tab_id: number | null` — debugger 当前 attach 的 tab id，null 表示未 attach。
- `dbg_attached_externally: boolean` — true 表示 debugger 由外部（console / exception capture）attach，stop 时不 detach。

约束：`dbg_tab_id` 只持一个值，代表 debugger 只 attach 一个 tab。

### 3.1 自动重试

采集启动时若当前 tab 为受限 URL（`chrome://` / `chrome-extension://` / `about:`），CDP attach 必然失败。两处自动重试：

| 触发 | 监听器 | 重试范围 |
|---|---|---|
| 切换到其他 tab | `chrome.tabs.onActivated` | console / exception / body capture |
| 同 tab 从受限 URL 跳转到普通 URL | `chrome.tabs.onUpdated` | console / exception / body capture |

多 tab 场景 retry 按 `tabs.onActivated` 触发顺序竞争：先成功的 tab 锁定 `dbg_tab_id`，后续 tab 的 retry 被 guard 短路。

### 3.2 子 target（worker / iframe / OOPIF）

```
Target.setAutoAttach(flatten, waitForDebuggerOnStart)
  → attachedToTarget(sessionId)
  → register_session + Network.enable(sessionId) + runIfWaitingForDebugger
  → 该 session 的 Network / webSocket 事件复用主逻辑
  → detachedFromTarget → unregister_session
```

stop 时先对所有 attached sessions 发 `runIfWaitingForDebugger`，防止子 target 冻结。

## 4. 事件规范化

Content Script / Background 各 capture 模块产出原始事件 → `service_worker.ts` / `event_utils.ts` 规范化：

- 生成 `event_id`（UUID）。
- 填充公共字段：`capture_id` / `category` / `type` / `relative_time_ms` / `absolute_time` / `tab_id` / `frame_id` / `url` / `top_frame_url` / `page_title` / `source` / `severity` / `related_event_ids` / `redaction_status` / `raw_available` / `created_at`。
- `data` 为事件特定载荷（discriminated union，见 types.ts `CaptureEventDataMap`）。
- 按 `category` 路由到对应 IndexedDB store（见 storage_indexeddb.md）。

## 5. 消息契约测试

`tests/sw_action_contract.test.ts` 验证所有 action 的请求 / 响应形状。`tests/stop_capture.test.ts` 验证 stop 完整路径。

## 6. 关键文件

- `src/extension/background/service_worker.ts` — 入口，消息路由，生命周期。
- `src/extension/background/keepalive.ts` — chrome.alarms 保活。
- `src/shared/event_utils.ts` — event_id 生成 + 公共字段。
- `src/shared/event_category.ts` — type → category 映射。
- `src/shared/capture_stats.ts` — 7 标签实时计数。
- `src/shared/poll_capture_status.ts` — 状态轮询（popup 用）。
