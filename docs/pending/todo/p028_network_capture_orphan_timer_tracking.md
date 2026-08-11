# p028 network_capture orphan timer 未跟踪清理

- 来源：t112 审阅范围外观察（t112 code review Round 2 结论段；pre-existing）
- 内容：`src/extension/background/network_capture.ts` 的 orphan timer 未在 stop 时跟踪/清理（T103 注释 `:132` 声称清理 orphan，实际只清 deferred entry timer）。stop→restart 后迟到的 orphan timer 可能向新 capture 发射陈旧事件。`cdp_handler.ts` 已用 `orphan_timers` Map 跟踪并在 stop 时 `clear_orphan_timers`，生产路径 `network_capture` 未对齐。触发窗口极窄（stop 后 3s 内迟到回调），影响可忽略，属低优先级技术债；可对齐 `cdp_handler` 的 orphan_timers 跟踪。
- 处理：未开
