# p016 cleanup 与 start 串行时序直接测试

- 来源：t099 遗留（t099_test_f002，minor）
- 内容：AC-001 测试仅覆盖 phase-check 路径，`run_exclusive` 串行维度未被直接测试（仅移除锁、保留 phase 检查时测试仍通过）。可补方案 A 时序测：挂起 cleanup 的 storage.get → start 排队等锁 → resolve 后 cleanup 读到 start 写的键但锁串行保证时序，断言键保留。或直接 mock run_exclusive 验证 cleanup 走锁。
- 处理：t116
