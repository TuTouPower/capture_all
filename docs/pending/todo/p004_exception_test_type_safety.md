# p004 异常 sink 测试类型安全

- 来源：t093 遗留（t093_code_f002，minor）
- 内容：`service_worker_exception_sink.test.ts` 中 `get_error_events` 返回 `RuntimeExceptionData`（无 `type` 字段），测试访问 `errors[0].type` / `message` 属未声明字段访问。运行时存在（storage 存整条 CaptureEvent），但类型不安全。tsconfig exclude tests/ 不报错。可改为断言转 `as any` 或收敛到已声明字段。
- 处理：未开
