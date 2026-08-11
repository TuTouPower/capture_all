# d003 vitest 测试间隔离的三个坑

- 来源：t116
- 结论：vitest 单测文件内三个状态隔离陷阱——(1) `vi.resetModules()` 不重置 `fake-indexeddb/auto` 的全局 DB，同文件测试复用相同 `capture_id` 写 IndexedDB 会主键冲突（ConstraintError，错误表现为 `reject(null)` 的 tx abort）；(2) `vi.spyOn` 未 `restore` 时再次对同一目标 `spyOn` 返回同一 spy，`mock.calls` 跨测试累积，导致后续测试捕获到前序调用；(3) jsdom 内部调用会消耗 stub 的 `crypto.randomUUID`（stub 需用真实 UUID 或经写路径捕获值，见 p012）。
- 证据：t116 实施中 `cleanup_start_mutex.test.ts` AC-003 在全量跑失败（单跑通过），根因是 AC-001 已写 `new_cap` 主键冲突；`content_postmessage_nonce.test.ts` AC-005 捕获到前序测试的脚本内容，根因是 appendChild spy 未 restore；AC-004 stub randomUUID 被 jsdom 内部消费导致 UUID 序列错位。
- 影响：新增 vitest 测试时遵守——同文件内 IndexedDB 用例用唯一 capture_id 或 `beforeEach` 清库；`afterEach` 统一 `vi.restoreAllMocks()`；需要确定性 nonce 时走真实 `randomUUID` + 捕获注入脚本，不 stub 调用计数。
- 现状：有效
