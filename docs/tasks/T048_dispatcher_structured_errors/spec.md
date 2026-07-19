# Task spec + log - T048 dispatcher_structured_errors

## 背景

`agent_command_dispatcher.ts` switch 无 default；任一失败一律抛 RECORDING_ALREADY_RUNNING；offset/limit 接受负数小数。

## 范围

- execute_agent_command switch 加 default：未知 type 抛 INVALID_QUERY。
- start_capture 失败时按 error 文本区分 RECORDING_ALREADY_RUNNING vs STORAGE_READ_FAILED。
- 新增 get_optional_non_negative_int，offset/limit 用此（含 max=100000 上限）。

## 验收

- [x] 未知命令返回 INVALID_QUERY。
- [x] offset/limit 负数/小数返回 INVALID_QUERY。
- [x] start_capture 存储/其他失败返回 STORAGE_READ_FAILED。
- [x] npm test 全绿。

## 进展

- 2026-07-19：实施。测试用 'Already recording' 触发 RECORDING_ALREADY_RUNNING 通过。
