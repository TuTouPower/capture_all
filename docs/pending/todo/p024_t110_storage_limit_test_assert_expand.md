# p024 t110 存储限额断言覆盖扩展

- 来源：t110 遗留（t110_test_f001 / f002 / f003，均 minor）
- 内容：存储限额/删除/终态化测试缺三条分句断言：① AC-002「数据仍在」——delete 被拒后 capture 记录仍在存储未断言（现仅 `del.success===false`）；② AC-003「ended_at 非空 / stop 事件」——cleanup_stale 终态化仅断言 `update_capture` 调用与 status，未断言 `ended_at`；③ 限额停止的 network/console 入口接线与 `capture_stopped.reason==='storage_limit'` 未断言（onActivated 写路径已被 AC-001c/001d 覆盖）。三者均属「加 case」级，不阻断；现由 `check_limit_and_stop` 共享 helper 端到端验证兜底。
- 处理：未开
