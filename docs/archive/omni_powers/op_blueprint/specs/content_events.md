# 页面事件捕获

Content Scripts 注入页面，捕获用户交互 / DOM / Storage / WebSocket 等事件。CDP 相关（console / exception / network body）见 `network_body_capture.md`。

## 1. 注入策略

`manifest.json`：

```json
{
    "content_scripts": [{
        "matches": ["<all_urls>"],
        "js": ["src/extension/content/content_script.ts"],
        "run_at": "document_start",
        "all_frames": true
    }]
}
```

启动后仅注册消息监听，收到 start 消息（来自 service worker）后才激活各 capture 模块。停止消息反向 teardown。

## 2. 模块清单

| 模块 | EventType | category | 采集方式 |
|---|---|---|---|
| mouse_capture | `mouse_event` | user_action | DOM 事件（click/dblclick/contextmenu/mousemove/wheel/drag） |
| keyboard_capture | `keyboard_event` | user_action | DOM keydown/keyup（按 keyboard_capture_mode 过滤） |
| scroll_capture | `scroll_event` | user_action | DOM scroll，rAF 节流 |
| dom_capture | `input_event` / `dom_mutation` | user_action / dom_data | input/change/DOM mutation |
| clipboard_capture | `clipboard_write` / `clipboard_read` | user_action | navigator.clipboard API |
| focus_capture | `focus_event` | user_action | focus/blur |
| form_submit_capture | `form_submit` | user_action | submit 事件 |
| fullscreen_capture | `fullscreen_change` | user_action | fullscreenchange |
| print_capture | `print_event` | user_action | beforeprint |
| resize_capture | `resize_event` | user_action | window resize（节流） |
| visibility_capture | `visibility_change` | navigation | visibilitychange（统一入口，已替代旧 handle_visibility_change） |
| storage_capture | `storage_change` | storage | localStorage / sessionStorage API 拦截 |
| websocket_capture | `ws_frame` / `ws_message` | network | WebSocket hook（页面级消息） |
| network_hook | `network_request`（fallback） | network | fetch response clone（body fallback 路径） |

路由事件（`popstate` + `hashchange`）由 `content_script.ts` 直接产生 `route_change`。

## 3. 事件结构

每模块产出 `CaptureEvent`（公共字段见 `capture_core.md` §4）+ 特定 data 载荷。data 类型在 `src/shared/types.ts` 中以 discriminated union 定义（`CaptureEventDataMap`）。

示例（mouse）：

```typescript
interface MouseEventData {
    action: 'click' | 'dblclick' | 'contextmenu' | 'mousemove' | 'mousedown' | 'mouseup' | 'wheel' | 'dragstart' | 'dragend';
    x: number; y: number;
    button: number | null;
    target_selector: string | null;
    target_xpath: string | null;
    target_tag: string | null;
    target_text_preview: string | null;  // 截断 100 字符
    target_role: string | null;
    target_label: string | null;
    target_rect: { x: number; y: number; width: number; height: number } | null;
    is_trusted: boolean | null;
}
```

keyboard 按 `keyboard_capture_mode`：`'none'` 不记录、`'shortcuts'` 只记修饰键组合、`'all'` 完整记录；input value 按 `capture_input_values` 开关，`type=password` 永远 `not_captured`。

## 4. 公共工具

- `src/extension/content/content_event_utils.ts` — content 侧事件公共字段填充（page_title / top_frame_url 等）。
- `src/shared/dom_utils.ts` — selector / xpath / rect 提取。
- `src/shared/id.ts` — event_id 生成。

## 5. 激活序列

`content_script.ts` 收到 start 消息后按序调用各 `start_xxx_capture()`，记录 attached 状态；收到 stop 消息反向 `stop_xxx_capture()`。`tests/content_script_uses_poll.test.ts` 验证轮询激活机制。

## 6. WebSocket 页面级捕获

`websocket_capture.ts` hook 页面内 WebSocket 实例，捕获 frameSent / frameReceived 作为 `ws_frame`（逐帧独立 event）。CDP 层 WebSocket（Network.webSocket*）见 `network_body_capture.md` §3.2，两者不重复（CDP 覆盖主 target + 子 target，页面 hook 覆盖 content script 可见范围）。

## 7. 关键文件

- `src/extension/content/content_script.ts` — 入口。
- `src/extension/content/*_capture.ts` — 各 capture 模块（13 个）。
- `src/extension/content/network_hook.ts` — body fallback。
- `src/extension/content/content_event_utils.ts` — 公共字段。
