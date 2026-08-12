# p037 keepalive 测试用例隔离脆弱

- 来源：t150 遗留（test_f003 minor）
- 内容：keepalive.test.ts 用例依赖模块级 `listener_registered` 幂等注册——重置 on_alarm_listener 会破坏 setup 幂等（后续 setup 不重注册）。当前顺序通过但隔离脆弱（重排/插用例会红）。修法：用 vi.resetModules 重载模块每用例新实例，或暴露测试钩子重置幂等标志。非阻断。
- 处理：未开
