# 数据流与关键流程

## 1. 采集流程

```mermaid
sequenceDiagram
    participant User
    participant Popup
    participant SW as Service Worker
    participant CS as Content Script
    participant CDP as Chrome Debugger
    participant IDB as IndexedDB

    User->>Popup: 点击 "开始采集"
    Popup->>SW: sendMessage({ action: 'start', config })
    SW->>SW: 创建 CaptureRecord
    SW->>IDB: 写入 capture & lifecycle 事件
    SW->>CS: 通知所有 tab 激活采集
    SW->>CDP: 按需 attach (console/exception)
    SW-->>Popup: 返回 { capture_id, status }
    Popup->>Popup: 切换到 "采集中" 状态
    Popup->>SW: 每秒轮询 get_status

    CS->>CS: 开始监听鼠标/键盘/滚动/DOM
    CS->>CS: 开始拦截 XHR/fetch/storage
    CS->>SW: sendMessage 发送事件
    SW->>SW: 规范化事件, 生成 event_id
    SW->>IDB: 按 category 分 store 写入

    User->>Popup: 点击 "点击结束"
    Popup->>SW: sendMessage({ action: 'stop' })
    SW->>CS: 通知停止采集
    SW->>CDP: detach debugger
    SW->>IDB: flush 所有缓存数据
    SW->>SW: 更新 CaptureRecord status
    SW->>IDB: 写入 lifecycle 停止事件
    SW-->>Popup: 返回统计
    Popup->>Popup: 切换到 "采集完成" 状态
```

## 2. Agent 数据读取流程

```mermaid
sequenceDiagram
    participant Agent as AI Agent
    participant MCP as MCP Server
    participant Bridge as HTTP Bridge
    participant Client as Bridge Client
    participant Query as Data Queries
    participant IDB as IndexedDB

    Agent->>MCP: list_captures()
    MCP->>Bridge: POST /mcp/command { type: "captures.list" }
    Bridge->>Bridge: 写入命令队列

    Client->>Bridge: GET /extension/command (轮询)
    Bridge-->>Client: 返回 captures.list 命令
    Client->>Query: list_captures()
    Query->>IDB: 查询 captures store
    IDB-->>Query: 返回列表
    Query-->>Client: CaptureRecord[]
    Client->>Bridge: POST /extension/result { data: [...] }
    Bridge-->>MCP: 返回结果
    MCP-->>Agent: capture 列表
```

## 3. 响应体捕获流程

```mermaid
sequenceDiagram
    participant User
    participant SW as Service Worker
    participant Coord as BodyCaptureCoordinator
    participant CDP as Extension CDP
    participant Bridge as External CDP Bridge
    participant Hook as Fallback Hook
    participant IDB as IndexedDB

    User->>SW: start capture (response_body=true)
    SW->>Coord: start()
    Coord->>CDP: try attach (chrome.debugger)

    alt attach 成功
        CDP-->>Coord: success
        Coord->>CDP: Network.enable
        Note over Coord,CDP: CDP-first: 请求由 CDP 直接采集
        Note over CDP: Network.requestWillBeSent → 记录 url/headers/body
        Note over CDP: Network.responseReceived → 记录 status/response headers
        Note over CDP: Network.loadingFinished → getResponseBody
        CDP-->>Coord: 完整 NetworkRequestData (capture_method=cdp_primary)
        Coord->>IDB: 写入 network_request (含响应体)
    else attach 失败 (chrome:// 等受限 URL)
        CDP-->>Coord: "Cannot access a chrome:// URL"
        Coord->>Coord: 降级为 fallback_hook
        Note over Coord: 等待 onActivated / onUpdated 触发 retry...
        User->>SW: 切换到普通 tab 或导航到 http(s):// URL
        SW->>Coord: retry start_body_capture (新 tab_id)
        Coord->>CDP: chrome.debugger.attach (新 tab_id)
        alt retry 成功
            CDP-->>Coord: success
            Coord->>CDP: Network.enable
            Note over Coord,CDP: 此后新请求可捕获 body
        else retry 仍失败
            Note over Coord: 保持 fallback_hook
        end
    else another debugger attached
        CDP-->>Coord: attach 失败
        Coord->>Bridge: try external CDP
        alt bridge 可用
            Bridge-->>Coord: CDP body via external port
            Coord->>IDB: 写入 (capture_method=external_cdp_bridge)
        else bridge 不可用
            Bridge-->>Coord: 不可用
            Coord->>Hook: activate fallback
            Hook-->>Coord: fetch clone / XHR body (partial)
            Coord->>IDB: 写入 (capture_method=fallback_hook, status=partial)
        end
    end
```

### 3.1 SSE / 流式 HTTP 捕获

```
responseReceived(mime=event-stream)
  → streamResourceContent(requestId)         // 首块
  → dataReceived × N (reportResourceContent) // 累积
  → [stream_buffer 节流] flush 增量写 response_body (streaming)
  → loadingFinished | capture stop
  → 强制 flush, status=captured
```

降级：`streamResourceContent` 不支持 → `dataReceived` 累积可见部分，status=partial。

### 3.2 WebSocket 帧捕获

```
webSocketCreated            → emit network_request(connecting, resource_type=websocket)
willSendHandshakeRequest    → 补 request headers
handshakeResponseReceived   → 补 response headers, status=open
frameSent/Received × N      → emit ws_frame（逐帧独立 event）
webSocketClosed             → update record(closed), 清理连接
```

帧 payload 受 `max_body_capture_bytes` 截断，超限标 `too_large`。

### 3.3 子 target（worker / iframe / OOPIF）

```
Target.setAutoAttach(flatten, waitForDebuggerOnStart)
  → attachedToTarget(sessionId)
  → register_session + Network.enable(sessionId) + runIfWaitingForDebugger
  → 该 session 的 Network/webSocket 事件复用 §3/§3.1/§3.2 逻辑
  → detachedFromTarget → unregister_session, 清理
```

M3 安全阀：stop 时先对所有 attached sessions 发 `runIfWaitingForDebugger`，防止子 target 冻结。

## 4. 数据存储流程

所有事件通过 `storage.ts` 统一写入 IndexedDB：

- **实时写入**：Content Script 发送事件 -> SW 规范化 -> 按 `category` 路由到对应 store -> 写入 IndexedDB
- **批量刷新**：flush 间隔 1000ms，批次大小 100 条
- **停止时强制刷新**：stopCapture 时 flush 所有未写入数据

事件按 store 隔离存储，查询时通过 `capture_id` 索引聚合。
