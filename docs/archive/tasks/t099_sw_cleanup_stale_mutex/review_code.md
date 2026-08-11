# Task review t099（reviewer_focus: 代码）

- task：`t099_sw_cleanup_stale_mutex`
- spec：`docs/tasks/t099_sw_cleanup_stale_mutex/spec.md`
- diff_anchor：`2ed15462623d02006637d97f88bcd8caeeb94e1f`
- target：`git diff 2ed15462623d02006637d97f88bcd8caeeb94e1f`
- round：1
- reviewed_at：2026-08-11 04:50 UTC+8

reviewed_scope: c802cb0bb8def46e

## Findings

### t099_code_f001 - AC-001 互斥时序未被测试真正驱动

- 严重度：important
- 锚点：违反 AC-001；spec 可测试性声明「全部 AC 可自动测试」未兑现
- 位置：`tests/unit/cleanup_start_mutex.test.ts:107-127`（test「AC-001: start 成功后 active_capture_id 指向新 capture，后续 cleanup 不覆盖」）
- 问题：`cleanup_stale_capture_state` 仅在模块加载时由顶层 `setTimeout(0)` 触发一次（`service_worker.ts:183-187`）。测试 1 中 `load_service_worker()` 触发该次 cleanup，`wait(20)` 让它执行完（此时 storage 为空、`legacy_active` 为 falsy，cleanup 空跑）。随后 `send_start()` 成功写入 `active_capture_id='new_cap'`，`phase` 变为 `capturing`。第 122-123 行 `storage_get.mockResolvedValue({})` + `wait(20)` 不会触发任何新的 cleanup 调用——测试内没有二次 import、没有导出函数调用，也没有把 cleanup 的 `storage.get` 挂起以构造「cleanup 在 start 进行中执行」的时序。第 125-126 行断言 `storage_set.mock.calls` 中存在 `active_capture_id==='new_cap'`，该断言只依赖 start 自身的写入，即使移除全部互斥逻辑（去掉 run_exclusive 包裹与 `phase !== 'idle'` 检查）也恒真。注释「模拟第二次 cleanup 时机」与实际行为不符。因此 AC-001 的核心——cleanup 异步执行过程中完成的 start 成功后 active 键不被 cleanup 置 null——没有任何测试驱动，互斥保护只存在于代码层、未被证明。
- 建议：构造真实串行/竞态时序再断言。方案 A（cleanup 阻塞在 start 前）：用受控的 `storage_get` promise 挂起 cleanup，使其拿到锁但停在 `storage.get`；此时完成 `send_start()`（排队等待锁）；resolve `storage_get` 让 cleanup 读到已写入的 `active_capture_id='new_cap'`；断言该键未被置 null。方案 B（cleanup 在 start 后执行）：start 完成后、`phase==='capturing'` 下再次触发 cleanup（重新 `vi.resetModules()` + import，或导出函数直调），断言 storage 中 `active_capture_id` 仍为 `new_cap` 且无 `active_capture_id===null` 的 set。

### t099_code_f002 - cleanup 函数缩进未随 run_exclusive 包裹重新对齐

- 严重度：minor
- 锚点：无 AC 违反，代码可读性
- 位置：`src/extension/background/service_worker.ts:128-181`
- 问题：run_exclusive 包裹后，仅第 129-134 行缩进到 8 空格，其后块体仍保留原 4 空格缩进：第 135-136 行数组项 8 空格、第 137 行 `]);` 4 空格、第 138 行起 `stale_capture_id`/`if (legacy_active)` 等 4 空格、第 179 行 `if` 闭合 `}` 8 空格（与 `if` 本身 4 空格不匹配）。大括号配平、功能正确，但函数内缩进层级错乱，可读性差，且第 179 行 `}` 与第 180 行 `});` 的层次不易辨认。
- 建议：对整个函数体统一缩进 8 空格（run_exclusive 回调内），跑一次格式化。

## 结论

- 前轮 finding 复核：Round 1，无。
- 本轮新发现：2 条（1 important，1 minor）。
- 未进表的提示：
  - 文件过大：`src/extension/background/service_worker.ts` 1133 行（实现源码 important 阈值 800），本 task 净增 5 行，命中「已达阈值 + 本 task 仍净增」。无直接可观测缺陷，按降级规则仅在此列出，不进 finding 表。
  - 复杂度：`cleanup_stale_capture_state` 近似 McCabe ≈ 6（if×3 + else-if + try/catch），低于 10，无提示。
  - 范围外观察：diff 仅触及 `service_worker.ts` 与新增测试，未改 `capture_state.ts`、未越 spec 范围，符合「不重做整套 SW 状态机」。
- 总体判断：代码层互斥实现正确——`cleanup_stale_capture_state` 经 `run_exclusive` 与 start/stop 串行，锁内 `phase !== 'idle'` 检查在 start commit（`phase='capturing'`）后跳过清理，`phase='idle'` 时仅清真正陈旧的键；AC-002 既有终态化/清键行为完整保留。但 AC-001 的互斥时序未被测试证明（f001），存在未解决 important，判定 FAIL。
- AC 复验方式：
  - AC-001：`re_verified`。代码层独立复验：`service_worker.ts:128-131` 将 cleanup 包入 `run_exclusive`，锁内 `phase !== 'idle'` 提前 return；`capture_state.ts:41-52` 的 `run_exclusive` 链保证 cleanup/start/stop 串行；start commit 后 phase='capturing'（`capture_state.ts:70`），cleanup 排队执行时必然跳过。实现正确；但测试未覆盖时序（见 f001）。
  - AC-002：`re_verified`。重跑 `npx vitest run tests/unit/cleanup_start_mutex.test.ts`（2 passed）；测试真实驱动冷启动 cleanup 读取陈旧键、断言 `update_capture` 收到 `status:'completed'` 且 storage set 含 `active_capture_id===null`，覆盖终态化与清键路径。
  - coverage = 2 / 2
- 系统性 follow-up：无。

verdict: FAIL

## Round 2 (2026-08-11 04:52 UTC+8)

reviewed_scope: fe984c6122337bc3

## Findings

本轮 0 条新 finding。

## 结论

- 前轮 finding 复核：
  - t099_code_f001（important）已消除。AC-001 测试重写为方案 B：`tests/unit/cleanup_start_mutex.test.ts:107-131` 在 `send_start()` 完成后（`start_handle.commit()` 使 phase=capturing，`capture_state.ts:70`）直接调用导出的 `cleanup_stale_capture_state()`（`service_worker.ts:129`），断言 `storage_set.mock.calls` 中不存在 `active_capture_id===null` 的 set（L129-130）。判别力独立复验：在 `.scratch` 副本移除 `service_worker.ts:132` 的 phase 检查后重跑，AC-001 测试失败（null-set 断言捕获 cleanup 清键）——「移除 phase 检查该测试失败」属实。
  - t099_code_f002（minor）已消除。`service_worker.ts:130-181` 函数体统一 8 空格缩进，闭合 `    });`（L181）与 `run_exclusive` 调用层次一致，缩进不再错乱。
- 本轮新发现：0 条。
- 未进表的提示：
  - 文件过大：`src/extension/background/service_worker.ts` 1134 行（实现源码 important 阈值 800），本 task 净增 7 行（+52/-45），命中「已达阈值 + 本 task 仍净增」；无直接可观测缺陷，按降级规则仅在此列出，不进 finding 表。
  - 复杂度：`cleanup_stale_capture_state` 近似 McCabe ≈ 6，低于阈值，无提示。
  - 互斥覆盖边界（跨层提示，交 test reviewer 定级）：AC-001 测试驱动的是「start 先完成 → cleanup 后执行」的 phase-check 路径；`run_exclusive` 串行维度未被测试直接覆盖。独立突变复验：在 `.scratch` 副本仅移除 cleanup 的 `run_exclusive` 包裹（保留 phase 检查），AC-001 测试仍通过。代码层锁集成正确（`service_worker.ts:130` 包裹；`capture_state.ts:41-52` promise 链串行），此提示不构成代码层 blocking。
  - cleanup 导出（`service_worker.ts:129` `export`）合理：仅提升函数可访问性供测试直调，运行期 `setTimeout(0)` 调用点（L184-188）未变，无行为副作用。
- 总体判断：代码层互斥实现正确，前轮 2 条 finding 均已按 diff 核实修复；无未解决 critical / important。
- AC 复验方式：
  - AC-001：`re_verified`。代码层确认 `service_worker.ts:130` run_exclusive + L132 phase 检查；测试判别力经突变复验（移除 phase 检查 → AC-001 测试失败）。
  - AC-002：`re_verified`。`tests/unit/cleanup_start_mutex.test.ts:133-148` 以陈旧键冷启动，断言 `update_capture` 收到 `status:'completed'` 且存在 `active_capture_id===null` 的 set，覆盖终态化与清键回归；全量单测 1195 passed。
  - coverage = 2 / 2
- 系统性 follow-up：无。

verdict: PASS
