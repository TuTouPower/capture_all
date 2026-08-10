# Spec — runtime exception 采集

CDP `Runtime.exceptionThrown` 事件经 `src/extension/background/exception_capture.ts` 转换为 `runtime_exception` 事件并进入错误事件存储。

## 事件形状

`RuntimeExceptionData` 字段展开到 `CaptureEvent` 顶层（不设 `event.data`），经 `handle_event` 按 `category: 'error'` 路由写入 `ERROR_EVENTS` store。

## 路由

- `start_exception_capture` 的 sender 为 `handle_event`（统一事件入口），异常事件落 `ERROR_EVENTS`，不进入 `CONSOLE_EVENTS`。
- `is_capturing` / generation 守卫拦截 stop 后迟到的 exception 回调，不写入当前或新 capture。

## 相关实现

- `src/extension/background/exception_capture.ts`：CDP 事件转换
- `src/extension/background/service_worker.ts`：`handle_event` / `start_exception_capture` 接线
- `src/extension/background/storage.ts`：`write_events` / `get_error_events`
- `tests/unit/service_worker_exception_sink.test.ts`：异常→错误事件存储集成测试
