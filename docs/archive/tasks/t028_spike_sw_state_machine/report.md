# Spike report - S001 SW capture state machine design

## 问题

`src/extension/background/service_worker.ts` 用模块内存变量管理采集状态：
- `is_capturing`/`current_capture`/`current_capture_id`/`start_time`/`current_config`。
- 无串行化（多个 start/stop 可并发通过入口检查）。
- SW 重启丢内存状态，`chrome.storage.local` 持久化键未被 start/stop 写入。
- 异步 listener 入口检查一次后 await，await 返回后不校验 generation。
- stop 先翻 is_capturing=false 再停生产者，回调看到 false 直接返回。
- start 中途失败无回滚。

CRITICAL-1/2 + HIGH-3~7 共 6 处缺陷都依赖状态机重构（T029-T033）。

需要验证：状态机接口、状态迁移、持久化策略、generation token、与现有消息处理关系。

## 成功判据

- 输出 CaptureState 类型 + capture_state 模块 API。
- 状态机图覆盖 idle/starting/capturing/stopping 与合法迁移。
- 持久化键设计（哪些字段入 chrome.storage.local）。
- generation token 规则（生产者/监听器如何捕获与校验）。
- 并发约束（start/stop/listener 如何串行化）。
- 回滚清单（start 失败时清理什么）。

## 尝试

- 读 `service_worker.ts:84-558` 现有状态机（隐式）。
- 读 `cleanup_stale_capture_state`、`start_capture`、`stop_capture`、tab listener。
- 读 IndexedDB `captures` store（CaptureRecord schema）。
- 设计状态机与迁移规则（无代码）。

## 证据

现有缺陷：
- `start_capture:267-327` 入口检查 `is_capturing` 后多次 await（query tabs、create_capture），并发 start 可同时通过。
- `stop_capture:479-558` 立即翻 `is_capturing=false`，回调入口看到 false 直接 return。
- `cleanup_stale_capture_state` 读 `chrome.storage.local` 的 `is_capturing`/`current_capture`，但 `start_capture`/`stop_capture` 不写这两个键。
- tab listener `745-929` 入口检查一次 is_capturing 后 await chrome.tabs.get/消息重试/CDP 启动；await 返回后不校验 generation。

## 结论

### 状态机

```
idle ──start()──> starting ──ok──> capturing ──stop()──> stopping ──done──> idle
                    │                                          ▲
                    └──fail──> rolling_back ───────────────────┘
                    
starting/stopping/capturing 收到 start: 拒绝（返回 CAPTURE_ALREADY_RUNNING）
capturing 收到 stop: 进入 stopping
stopping 收到 stop: 幂等（已 stopping）
任何状态收到 reset: 强制 stopping -> idle
```

### CaptureState 类型

```typescript
type CapturePhase = 'idle' | 'starting' | 'capturing' | 'stopping' | 'rolling_back';

interface CaptureRuntimeState {
    phase: CapturePhase;
    capture_id: string | null;
    start_time: number | null;
    config: CaptureConfig | null;
    generation: number; // 单调递增，每次 start +1；异步回调捕获并校验
    pending_promise: Promise<void> | null; // start/stop 串行化锚
}
```

### capture_state 模块 API

```typescript
// 单例模块，所有 start/stop/tab listener 通过模块函数访问状态
export function get_state(): CaptureRuntimeState;
export function begin_start(capture_id, config): { generation: number; commit: () => void; rollback: () => void };
export function begin_stop(): { generation: number; commit: () => void };
export async function run_exclusive<T>(fn: (state) => Promise<T>): Promise<T>;
export function current_generation(): number;
export function is_active_generation(gen: number): boolean;
```

### 持久化键

`chrome.storage.local` 写入：
- `active_capture_id`: 当前 capture_id（capturing/stopping 阶段）。
- `active_capture_start_ms`: 启动时间。
- `active_capture_config`: 完整 config 序列化。
- `active_capture_generation`: generation 数字。

start 进入 `capturing` 时写入；stop commit 时清空。SW 启动 `cleanup_stale_capture_state` 读这些键决定恢复/终止。

### generation token

- 每次 `begin_start` 递增 `generation`。
- 所有 listener 入口捕获 `const gen = current_generation()`。
- 每个 await 后调 `is_active_generation(gen)`，false 则 return。
- 生产者回调同样捕获并校验。
- CDP/IndexedDB 写入前再校验一次。

### 并发约束

- `run_exclusive` 用 `pending_promise` 串行化：start/stop 必须等前一次完成。
- listener 不进 run_exclusive，但用 generation 校验。
- IndexedDB 写入：在 storage layer 加 `if (!is_active_generation(gen)) return`。

### 回滚清单（start 失败时逆序清理）

1. body_capture_coordinator.stop() + drain。
2. network_capture.stop()（detach 自己创建的 debugger）。
3. console_capture.stop() / exception_capture.stop() / cookie_capture.stop()。
4. flush_all() 已产生事件。
5. storage.update_capture(capture_id, { status: 'failed', ended_at })。
6. clear generation + 持久化键。

### stop drain 顺序

1. 进入 stopping（拒绝新 start）。
2. 停止生产者：network/body/cookie/console/exception。
3. 等待 deferred/orphan timer 与 in-flight 事件 drain（用 generation 校验）。
4. flush_all 剩余事件。
5. 写 stopped lifecycle event + CaptureRecord completed + 最终 stats。
6. clear generation + 持久化键 + 切回 idle。

## 是否采纳

- 决定：是
- 理由：状态机重构是 CRITICAL 缺陷的根因修复，spike 输出可直接驱动 T029-T033 实施。
- 后续 task：T029（状态机 + 串行化）、T030（持久化 + SW 重启恢复）、T031（stop drain 顺序）、T032（start 回滚）、T033（listener generation 校验）。
