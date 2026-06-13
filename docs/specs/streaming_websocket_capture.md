# 流式 / WebSocket / 子 target 全捕获 — 技术规格

状态：设计稿
日期：2026-06-13
关联缺陷：`docs/capture_2026_06_13_18_43_analysis.md`

---

## 1. 问题与根因

现状 `src/background/network_capture.ts` 网络 body 采集只有**一种机制**：

```
Network.loadingFinished → Network.getResponseBody（一次性事后取 body）
```

该机制对三类流量天然失效：

1. **SSE / 流式 HTTP**：`getResponseBody` 在 `loadingFinished` 后才取 body。长连接很久才 finish 或永不 finish；取到时 Chrome 响应缓冲区可能已被驱逐 → 空 body。现状代码主动 skip（`text/event-stream`）。
2. **WebSocket**：`getResponseBody` 对 WS 无效（WS 是帧事件流，不是响应体）。现状零监听 → 完全丢失。
3. **worker / iframe / OOPIF 流量**：CDP 只 attach 主 tab，`handle_cdp_event` 用 `source.tabId !== dbg_tab_id` 过滤，子执行上下文的请求全部在采集范围外。

根因：用"事后整体取 body"的工具去抓"持续到达的流"与"独立帧流"，并且只 attach 单一执行上下文。

---

## 2. 设计原则

- **三机制并行**，共用同一 CDP client：普通请求保留 `getResponseBody`，流式走 `streamResourceContent`，WebSocket 走 `webSocket*` 事件。
- **范围扩展**：`Target.setAutoAttach` flatten 模式自动 attach 子 target，每个子 target 各自 `Network.enable` 并复用同一套 handler。
- **不阻塞页面**：所有机制均为旁路监听/tee，禁止用 `Fetch.requestPaused` 拦截流式响应（会挂死永不结束的 SSE）。
- **默认全开**：随 CDP body capture 启用，无新配置项（符合"全采"定位）。
- **无遗漏 + 抗丢失**：流式数据节流落盘，采集停止/连接结束时强制 flush。

---

## 3. 三机制详解

### 3.1 普通请求（加固现有）

- `Network.enable` 传 buffer size，减少大 body 驱逐导致的 `cdp_failed`，并统一开 `reportResourceContent`（流式累积前置，见 §3.2 M1）：
  ```
  Network.enable {
    maxResourceBufferSize: 100 * 1024 * 1024,
    maxTotalBufferSize:    500 * 1024 * 1024,
    reportResourceContent: true
  }
  ```
- 其余逻辑不变。

### 3.2 流式 HTTP（SSE / fetch 流式 / chunked）

机制：`Network.streamResourceContent`（CDP 2024+，需版本探测）。

流程：
1. `Network.responseReceived`：判定流式（mime = `text/event-stream`，或 `transfer-encoding: chunked` 且无 `content-length`，或 `content-type` 含 `stream`）。
2. 流式 → 立即 `Network.streamResourceContent({ requestId })`，返回已缓冲数据（base64），作为首块。
3. 后续 chunk 通过 `Network.dataReceived` 的 `data` 字段持续推送 → 旁路累积。
   - **前置条件（M1）**：`dataReceived.data` 仅在 `Network.enable({ reportResourceContent: true })` 时携带。本设计在 §3.1 / §3.4 所有 `Network.enable` 统一传 `reportResourceContent: true`，否则 `data` 字段缺失、流式累积静默失效。
   - `streamResourceContent` 成功后，Chrome 才对该 requestId 在 `dataReceived` 中投递 `data`；两者配合：首块来自 `streamResourceContent` 返回值，增量来自带 `data` 的 `dataReceived`。
4. 节流落盘：in-memory 累积，每 **~1s** 或累计 **~16KB** 触发一次 flush（增量更新该 record 的 `response_body`），`response_body_status` 标 `streaming`。flush 不直接写 IndexedDB，而是入队到现有事件批写队列统一调度（见 M2）。
5. `loadingFinished` / 采集停止 → 强制 flush，`response_body_status` 改为 `captured`（或 `too_large`）。

降级（P2）：目标 Chrome 不支持 `streamResourceContent` → 仅靠 `Network.dataReceived` 累积可见部分（`response_body_status: 'partial'`），并记一条 `capture_error`（recoverable=true, fallback_used=true）。降级路径同样依赖 `reportResourceContent: true`，启用前需独立探测 `dataReceived.data` 是否可用；不可用则进一步降级为"仅元数据无 body"，不静默丢失。

### 3.3 WebSocket

机制：监听 7 个 `Network.webSocket*` 事件，帧内容直接在 params（`payloadData`，二进制为 base64），**不需 `getResponseBody`**。

| CDP 事件 | 用途 | 产出 |
|---|---|---|
| `webSocketCreated` | 建连 | 建 connection meta（记 url、`requestId` 作 ws_connection_id），发 `network_request`（resource_type=websocket，status=connecting） |
| `webSocketWillSendHandshakeRequest` | 握手请求头 | 补 request_headers |
| `webSocketHandshakeResponseReceived` | 握手响应 | 补 response_headers、status_code |
| `webSocketFrameSent` | 发出帧 | 发 `ws_frame` event（direction=sent） |
| `webSocketFrameReceived` | 收到帧 | 发 `ws_frame` event（direction=received） |
| `webSocketFrameError` | 帧错误 | 发 `ws_frame` event（direction=error，含 errorMessage） |
| `webSocketClosed` | 关闭 | 更新 connection record（status=closed，end_time） |

**每帧独立 event**（决策）：每个 `webSocketFrame*` → 一条独立 `CaptureEvent`（type=`ws_frame`），通过 `ws_connection_id` 关联到连接 record。WS 帧是独立逻辑消息，拆 event 符合现有 append 模型且无遗漏。

### 3.4 子 target（worker / iframe / OOPIF）

机制：`Target.setAutoAttach`。

```
Target.setAutoAttach {
  autoAttach: true,
  waitForDebuggerOnStart: true,
  flatten: true
}
```

- flatten 模式下，子 target 事件携带 `sessionId`，经同一 `chrome.dbg.onEvent` 投递。
- `Target.attachedToTarget` → 对新 session 发 `Network.enable`（带 buffer size）+（流式判定逻辑复用）+ `Runtime.runIfWaitingForDebugger`。
- **改 handler 过滤逻辑**：`handle_cdp_event` 不再用 `source.tabId === dbg_tab_id` 单一判定，改为维护 `attached_sessions: Set<sessionId>`，按 `(tabId, sessionId)` 路由。主 target sessionId 为空。
- `Target.detachedFromTarget` → 清理该 session 累积态。

---

## 4. 数据模型扩展（`src/shared/types.ts`）

### 4.1 新增 EventType + CategoryKey

```ts
// network category 新增
| 'ws_frame'        // WebSocket 帧
```

`ws_frame` 归入现有 `network` category。

### 4.2 扩展 NetworkRequestData

```ts
// 新增字段（均可选，向后兼容）
ws_connection_id?: string;          // WS 连接标识（= CDP requestId）
ws_status?: 'connecting' | 'open' | 'closed' | 'error';
stream_mode?: 'none' | 'sse' | 'chunked';   // 流式类型
```

`response_body_status` 扩展枚举（`BodyCaptureStatus`）新增：
```ts
| 'streaming'   // 流式进行中，body 持续追加
| 'partial'     // 降级：仅累积到可见部分
```

`capture_method` 新增：
```ts
| 'cdp_websocket'
| 'cdp_stream'
```

### 4.3 新增 WsFrameData

```ts
export interface WsFrameData {
    ws_connection_id: string;       // 关联连接 record
    direction: 'sent' | 'received' | 'error';
    opcode: number | null;          // 1=text 2=binary 8=close 9=ping 10=pong
    payload: string | null;         // text 直存，binary base64
    payload_encoding: 'utf8' | 'base64' | null;
    payload_bytes: number | null;
    payload_status: BodyCaptureStatus;   // too_large 时截断
    mask: boolean | null;
    error_message: string | null;   // direction=error 时
    url: string;
    tab_id?: number;
    session_id?: string | null;     // 子 target 时非空
}
```

帧 payload 同样受 `max_body_capture_bytes` 限制，超限标 `too_large` 并截断。

---

## 5. 数据流时序

### 5.1 SSE
```
responseReceived(mime=event-stream)
  → streamResourceContent(reqId)            // 首块
  → dataReceived × N                        // 累积
  → [节流] flush 增量写 response_body (streaming)
  → loadingFinished | capture stop
  → 强制 flush，status=captured
```

### 5.2 WebSocket
```
webSocketCreated            → emit network_request(connecting)
willSendHandshakeRequest    → 补 req headers
handshakeResponseReceived   → 补 resp headers, status=open
frameSent/Received × N      → emit ws_frame（逐帧）
webSocketClosed             → update record(closed)
```

### 5.3 子 target
```
Target.setAutoAttach(flatten)
  → attachedToTarget(sessionId)
  → Network.enable(sessionId) + runIfWaitingForDebugger
  → 该 session 的所有 Network/webSocket 事件复用 §3 逻辑
  → detachedFromTarget → 清理
```

---

## 6. 错误处理与降级

| 场景 | 处理 |
|---|---|
| `streamResourceContent` 不支持 | 降级到 `dataReceived` 累积，status=partial，记 capture_error(recoverable) |
| 用户开 DevTools（debugger 独占冲突）| 现有 detach 重连逻辑覆盖；**detach 前必须先对所有 `attached_sessions` 发 `Runtime.runIfWaitingForDebugger`**，再清理 session，否则 `waitForDebuggerOnStart` 暂停的子 target（worker/iframe）会永久冻结、页面卡死（M3）。|
| 大 payload/body | 受 `max_body_capture_bytes` 截断，status=too_large |
| WS 帧风暴（高频）| 每帧独立 event 走现有 append 批量写；必要时背压由 IndexedDB 批写吸收 |
| 子 target attach 失败 | 记 capture_error，不影响主 target 采集 |

不引入新的全局错误类型，复用 `CaptureErrorData`。

---

## 7. 测试

### 单元（vitest）
- WS 7 事件 → 正确产出 connection record + 逐帧 ws_frame event。
- 流式判定函数：event-stream / chunked-no-content-length / 普通请求 分类正确。
- 节流 flush：模拟 dataReceived 多块，验证按时间/字节阈值触发 + 终态强制 flush。
- 降级路径：streamResourceContent 抛错 → partial + capture_error。
- 子 target 路由：带 sessionId 事件正确归属。

### E2E（Playwright，CDP）
- SSE 测试页：验证完整 body 重组无丢失。
- WebSocket echo：验证 sent/received 帧全捕获、payload 正确。
- worker fetch：验证子 target 请求被采集。
- 覆盖率维持 ≥ 80%。

---

## 8. 落地顺序

| 优先级 | 项 | 机制 |
|---|---|---|
| P0 | WebSocket 帧 | 7 个 webSocket* 监听 + ws_frame event |
| P0 | SSE/流式 body | streamResourceContent + dataReceived 节流累积 |
| P1 | 大 body 驱逐 | Network.enable 传 buffer size |
| P1 | worker/iframe 范围 | Target.setAutoAttach flatten + session 路由 |
| P2 | 降级策略 | streamResourceContent 不支持时 dataReceived 兜底 |

---

## 9. 约束

- 不用 `Fetch` 域拦截流式（挂死页面）；仅在需改写请求时才用。
- WS/流式不经过 `webRequest`，CDP attach 是硬依赖。
- 术语遵循 CLAUDE.md：`capture` / "采集"，类型 `CaptureRecord`/`CaptureEvent`/`CaptureConfig`。
- snake_case，4 空格，TypeScript strict。
