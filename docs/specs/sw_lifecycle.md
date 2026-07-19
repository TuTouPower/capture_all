# Spec — sw_lifecycle

Service Worker 采集生命周期状态机。

## 状态机

```
idle ──start()──> starting ──ok──> capturing ──stop()──> stopping ──done──> idle
                    │                                          ▲
                    └──fail──> rollback ──────────────────────┘
```

## capture_state 模块（`src/extension/background/capture_state.ts`）

模块单例，所有 start/stop/tab listener 通过模块函数访问状态。

```typescript
interface CaptureRuntimeState {
    phase: 'idle' | 'starting' | 'capturing' | 'stopping' | 'rolling_back';
    capture_id: string | null;
    start_time: number | null;
    config: CaptureConfig | null;
    generation: number;
}
```

API：
- `get_state()` / `current_generation()` / `is_active_generation(gen)`
- `run_exclusive(fn)`：start/stop 串行化（pending_promise 链）。
- `begin_start(capture_id, config)` → `{ generation, commit, rollback }`
- `begin_stop()` → `{ generation, commit }`

## 串行化（T029）

start_capture / stop_capture 入口用 `run_exclusive` 包裹。并发 start/stop 排队执行，不可能同时通过入口检查。

## generation token（T033）

每次 begin_start 递增 generation。tab listener 入口捕获 `const gen = current_generation()` + `cap_id`/`cap_start`/`cap_config` 局部拷贝。关键 await 后调 `is_active_generation(gen)` 校验，false 则 return。事件构造用局部拷贝。

## 持久化与 SW 重启恢复（T030）

### 写入

start_capture_inner 成功后写 chrome.storage.local：
- `active_capture_id`
- `active_capture_start_ms`
- `active_capture_config`
- `active_capture_generation`

### 清空

stop_capture_inner 清理前清空这 4 个键。

### 重启

SW 启动 `cleanup_stale_capture_state` 读持久化键。残留则：
1. 尝试按 active_capture_id 加载 CaptureRecord。
2. 标 completed + ended_at + duration。
3. 清空所有键。

## stop drain 顺序（T031）

进入 stopping 后**不立即翻 is_capturing=false**（让 in-flight 回调继续 drain）：

1. 先停生产者（keepalive/network/body/cookie/console/exception + notify content scripts）。
2. drain：stop_periodic_flush + flush_all。
3. 翻 is_capturing=false。
4. 写 stopped event + update_capture（含 drain 后最终 stats）+ flush。
5. 清空持久化键 + current_capture_id/start_time/config。
6. capture_state.commit() → idle。

## start 回滚（T032）

start_capture_inner_impl 抛错时：
1. catch 中调 stop_capture_inner() 逆序清理已启动的子系统。
2. start_handle.rollback() 将 capture_state 回 idle。
3. 返回 `{ success: false, error }`。

## context clear（T034）

stop 后清空全部上下文字段（current_capture/current_capture_id/start_time/current_config）。get_status 仅在 is_capturing 时返回 active_capture_id。
