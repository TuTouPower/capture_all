# Spec — Bridge CDP session idle TTL 与有界

Bridge 的 CDP 会话生命周期与内存边界约定。

## 会话生命周期

- CDP session 用 idle TTL（默认 5 分钟）而非固定墙钟销毁：任意 CDP 事件（`onmessage`）刷新 `last_activity` 并重排定时器；持续活动时永不因固定窗口误杀。
- 无活动超过 TTL 后 session 销毁（`destroy_session`：close ws + 清 idle_timer）。
- `handle_cdp_stop` 亦走 `destroy_session`，清 idle_timer 防泄漏。

## 建立超时

- `/json/list` fetch（detect/start）与 CDP WebSocket 建立均有 `CDP_DETECT_TIMEOUT_MS`（3s）超时。
- WS 建立为 onopen/超时/onerror/onclose 竞速；超时分支 close ws 防迟到 onopen 孤儿连接；失败返回区分 timeout / connect failed（带 `connect_error`）。

## 有界

- `session.events` 有上限 `MAX_SESSION_EVENTS`（5000），`push_bounded` 超限丢最旧并递增 `_eviction_count` 指标。
- 测试经 `_set_max_session_events_for_test(cap)` 注入小 cap 验证淘汰。

## 相关实现

- `src/bridge/cdp_handler.ts`
- `tests/unit/cdp_session_idle_bounds.test.ts`：idle TTL / events 上限 / 超时测试
