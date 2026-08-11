# p003 exception AC-002 断言增强

- 来源：t093 遗留（t093_code_f001，minor）
- 内容：`tests/unit/service_worker_exception_sink.test.ts` AC-002 断言 `logs.some(l => l.type === 'runtime_exception')` 在修复前后恒成立（console store 本就不含 runtime_exception 事件），判别力弱。可改为断言 emit exception 后 CONSOLE_EVENTS 为空数组 `expect(logs.length).toBe(0)`，使实现若误把 exception 写入 console 时触发失败。
- 处理：未开
