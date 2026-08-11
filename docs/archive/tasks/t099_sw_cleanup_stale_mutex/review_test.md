# Task review t099（reviewer_focus: 测试）

- task：`t099_sw_cleanup_stale_mutex`
- spec：`docs/tasks/t099_sw_cleanup_stale_mutex/spec.md`
- diff_anchor：`2ed15462623d02006637d97f88bcd8caeeb94e1f`
- target：`git diff 2ed15462623d02006637d97f88bcd8caeeb94e1f`
- round：1
- reviewed_at：2026-08-11 04:55 UTC+8

reviewed_scope: c802cb0bb8def46e

## Findings

### t099_test_f001 - AC-001 测试未构造并发竞态，仅验证顺序写入；回退实现测试仍通过

- 严重度：critical
- 锚点：AC-001（在 cleanup 异步执行过程中完成的 start 成功后，active_capture_id 仍指向新 capture，不被 cleanup 置 null）
- 位置：`tests/unit/cleanup_start_mutex.test.ts:107-127`（AC-001 test）
- 问题：
  - `cleanup_stale_capture_state` 非导出，唯一触发点是模块加载时的 `setTimeout(0)`（`src/extension/background/service_worker.ts:183-187`），测试内 `load_service_worker()` 只调用一次（L108）。第二次 `await wait(20)`（L123）不会调度任何 cleanup——L120-121 注释「再次触发 cleanup」不成立。测试全程只有一次 cleanup，且在 start 之前已运行完毕。
  - 断言 `has_new_cap`（L125-126）用 `storage_set.mock.calls.some(c => c[0].active_capture_id === 'new_cap')` 检查的是**历史调用**：即使第二次 cleanup 真的运行并把 active_capture_id 置 null，该断言仍为 true，无法检测「键被清」这一 AC-001 核心场景。
  - 测试实际只证明「start_capture 顺序执行成功后写过 active_capture_id」，即顺序完成行为。把实现回退为原 bug（cleanup 不包 `run_exclusive`，`src/extension/background/service_worker.ts:128-181` 恢复旧逻辑）本测试依旧通过——测试不区分修复前后，`run_exclusive` 互斥队列从未被两个并发操作同时触达，AC-001 的互斥保护未验证。
- 建议：构造真实竞态（符合 spec 测试策略「抽取或注入 cleanup/start 竞态；假 storage」）：
  - 方案 A（注入延迟，最小侵入）：mock `chrome.storage.local.get` 返回受测试控制的 pending Promise，令 cleanup 卡在读取 storage 之后、`storage.set` 之前；此时并发触发 `start`（写入 new_cap 并完成 commit），再 resolve 让 cleanup 继续走到 `storage.set`；断言**最终** storage 状态（最后一次 `storage_set` 调用）的 `active_capture_id` 仍为 `'new_cap'`。
  - 方案 B：导出 `cleanup_stale_capture_state`，测试中直接并发 `Promise.all([cleanup(), start()])`，断言最终 active_capture_id 保留。
  - 断言目标须改为「最后一次 storage_set / 等价最终状态」，不能用历史 `.some()`。

## 结论

- 前轮 finding 复核：无（Round 1）
- 改测方向复核：无。本轮 diff 未修改既有测试（`tests/unit/service_worker_stale_cleanup.test.ts` 未动），仅新增 `cleanup_start_mutex.test.ts` 与改 `service_worker.ts`、`task.md`。
- 本轮新发现：1 条（t099_test_f001）
- 未进表的提示：
  - AC-001 测试用真实 timers + 固定 `wait(20)` 让模块级 `setTimeout(0)` 落定（L111、L123），慢速 CI 下偏脆弱；非阻断，属 minor 观察。
  - mock 边界总体合理：`storage` 模块经 `import_original` 展开保留真实实现（fake-indexeddb），仅 `update_capture` 在 DB 写入边界 mock，与既有 `service_worker_stale_cleanup.test.ts` 一致；`start_capture_inner_impl` 的 `create_capture` 等真实逻辑可达。
- 总体判断：AC-001 的并发互斥保护未被真实验证（critical 未解决），AC-002 回归真实可达；不可 PASS。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：re_verified（独立阅读生产代码与测试并运行测试。证据：`cleanup_stale_capture_state` 仅模块加载调度一次且非导出；AC-001 测试第二次 wait 无 cleanup 触发，断言用历史 `.some()` 无法检测清键；`npx vitest run` 两文件 7 passed，但通过即说明该测试不验证竞态——回退实现仍通过）。
- AC-002：re_verified（独立阅读测试与生产代码并运行测试。证据：测试以 stale 键冷启动，cleanup 经 `run_exclusive` 走 `phase==='idle'` 分支，断言 `update_capture` 以 `completed` 终态化 `old_cap` 且 `storage_set` 清 `active_capture_id`，断言针对存储效果，真实可达）。

coverage = 2 / 2

verdict: FAIL

## Round 2 (2026-08-11 04:52 UTC+8)

reviewed_scope: fe984c6122337bc3

## Findings

### t099_test_f002 - AC-001 测试仅覆盖 phase 检查，未覆盖 run_exclusive 串行维度

- 严重度：minor
- 锚点：覆盖扩展；AC-001 可观察行为在「start 先完成」时序下已真实验证，未达 blocking 硬阈值（AC 非完全无测试、非假行为测试）
- 位置：`tests/unit/cleanup_start_mutex.test.ts:107-131`（AC-001 test）
- 问题：测试驱动「start 完成后 → 直接调用 cleanup」的顺序时序，覆盖的是 `service_worker.ts:132` 的 `phase!=='idle'` 提前 return 守卫。cleanup 在 start 进行中执行、由 `run_exclusive` 保证读改写原子性的串行 interleave 未驱动。独立突变复验：在 `.scratch` 副本仅移除 `service_worker.ts:130` 的 `run_exclusive` 包裹（保留 phase 检查），AC-001 测试仍通过——测试无法区分「cleanup 有锁」与「cleanup 无锁」两种实现。
- 建议：如需完整覆盖锁维度，补方案 A 时序测：mock `chrome.storage.local.get` 返回受控 pending promise 挂起 cleanup（其已通过 phase 检查、读到 idle 态），并发完成 `send_start()`，再 resolve 使 cleanup 走到 `storage.set`，断言最终 `active_capture_id` 仍为 `new_cap`。非阻断，可纳入 task.md 处置表。

## 结论

- 前轮 finding 复核：
  - t099_test_f001（critical）已消除。测试重写为方案 B：`tests/unit/cleanup_start_mutex.test.ts:126` 直接调用导出的 `cleanup_stale_capture_state()`，L129-130 以「不存在 `active_capture_id===null` 的 set」断言最终存储效果。判别力独立复验：在 `.scratch` 副本移除 phase 检查后重跑，AC-001 测试失败。「回退实现测试仍通过」的原始指控不再成立——原始无守卫实现（既无 run_exclusive 也无 phase 检查）现会被 null-set 断言捕获。
- 改测方向复核：无迁就实现。AC-001 断言从 Round 1 的历史 `.some()`（测 start 自身写入）改为「cleanup 后无 null-set」的最终状态断言，判别力增强，非把预期改成当前实现输出。
- 本轮新发现：1 条（t099_test_f002，minor）。
- 未进表的提示：AC-002 用真实 timers + 固定 `wait(20)`（L140）落定模块级 `setTimeout(0)`，慢速 CI 下偏脆弱，Round 1 已记录，仍为非阻断 minor 观察。
- 总体判断：前轮 critical 已解决；AC-001 可观察行为已真实验证且具判别力，AC-002 回归保留；新增 f002 仅覆盖扩展，非阻断。
- AC 复验方式：
  - AC-001：`re_verified`。独立重跑 `npx vitest run tests/unit/cleanup_start_mutex.test.ts`（2 passed，全量 1195 passed）；突变复验 phase 检查判别力（移除 → AC-001 失败）；并探明 run_exclusive 维度未被测试直接覆盖（仅移除锁 → 仍通过，见 f002）。
  - AC-002：`re_verified`。测试以陈旧键冷启动，断言 `update_capture` 终态化 `old_cap` 且 `storage_set` 清 `active_capture_id`，断言针对存储效果，真实可达。
  - coverage = 2 / 2
- 系统性 follow-up：无。

verdict: PASS
