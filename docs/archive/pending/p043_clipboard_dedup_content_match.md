# p043 clipboard 去重窗口加内容匹配

- 来源：t155 遗留
- 内容：clipboard_capture.ts 去重以纯时间窗 `Date.now() - last_emit_ts[action] < 50ms` 判定，同 action 两次真实独立操作落在 50ms 内时第二条被静默丢弃（如同一 tick 两次 writeText 或极快连续复制）。去重条件应叠加事件内容匹配（method/type 相同才视为同一操作），而非仅时间窗。
- 处理：t195
