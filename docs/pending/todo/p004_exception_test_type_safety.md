# p004 异常 sink 测试类型安全

- 来源：t093 遗留（t093_code_f002，minor）
- 内容：`service_worker_exception_sink.test.ts` 中 `get_error_events` 返回 `RuntimeExceptionData`，测试访问 `errors[0].type` 属未声明字段访问；`message` 与 `capture_id` 已在类型中声明。运行时 `type` 存在（storage 存整条 CaptureEvent），但该断言类型不安全，且 tests 被 tsconfig 排除所以编译不报错。可删除 `type` 断言、转 `as any`，或收敛到已声明字段。核实于 2026-08-11：问题仍在，仅影响测试类型可靠性。
- 处理：未开
