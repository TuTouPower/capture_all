# p005 mock_chrome_debugger 用例间复位

- 来源：t093 遗留（t093_test_f001，minor）
- 内容：`service_worker_exception_sink.test.ts` 依赖模块级 `mock_chrome_debugger` 单例，未在 `beforeEach` 调用 `reset()`，跨用例 send_command_calls / 已登记 session 状态可能泄漏。建议在测试套件加 `beforeEach(() => mock_chrome_debugger.reset())`。
- 处理：t116
