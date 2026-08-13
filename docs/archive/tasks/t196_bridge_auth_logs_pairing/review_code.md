# Task review t196（reviewer_focus: 代码）

- task：`t196_bridge_auth_logs_pairing`
- spec：`docs/tasks/t196_bridge_auth_logs_pairing/spec.md`
- diff_anchor：`67fa474fbd8ef0f89066cf4d3da5a760693dcac1`
- target：`git diff 67fa474fbd8ef0f89066cf4d3da5a760693dcac1`
- round：1
- reviewed_at：2026-08-14 04:25 UTC+8

## Findings

### t196_code_f001 - `handle_cdp_start({} as never, ...)` 类型强转绕过签名检查

- 严重度：minor
- 锚点：代码质量 · 类型契约（非行为 AC）
- 位置：`tests/unit/bridge_auth_logs_pairing.test.ts:42`
- 问题：`handle_cdp_start` 首参声明为 `http.IncomingMessage`（`src/bridge/cdp_handler.ts:249` 的 `_req`），测试以 `{} as never` 强转传入。`never` 可赋值给任意类型，使类型系统对该参数完全失守：若未来 handler 开始读取 `_req`，此处调用静默通过编译、运行时拿到空对象才暴露。属测试便捷性规避，非行为缺陷，当前 `_req` 未被使用故无运行期影响。
- 建议：改为 `{} as http.IncomingMessage`（或 `null as unknown as http.IncomingMessage`），保留签名约束，避免 `never` 级联逃逸。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：Round 1，无。
- 本轮新发现：1 条（均为 minor，无 blocking）。
- 未进表的提示：
  - 文件过大：本 task 新建 `tests/unit/bridge_auth_logs_pairing.test.ts` 196 行，远低于测试源码 600 行阈值；未触及任何实现源码/配置脚本。无命中。
  - 圈复杂度：4 个 `it` 均为线性脚本式流程，无函数 CC ≥ 15。无命中。
  - 范围外观察：
    - 纯测试 + 决策记录任务，无生产代码改动（diff 仅 3 文件：测试、decisions.md、task.md），符合 task 定义，无越界。
    - `MockWebSocket.instance` 静态字段与 cdp_handler 模块级 `sessions` map 未跨测试清理（`tests/unit/bridge_auth_logs_pairing.test.ts:29,52`）：vitest 同文件串行执行、session_key 唯一，无实际可观测影响。
    - AC-001 依赖真实 50ms 计时器（`vi.useRealTimers()`，`tests/unit/bridge_auth_logs_pairing.test.ts:71`）：spec 风险区已声明「日志路径测试依赖计时脆弱」，测试已采用「缩短超时窗口」回退，且超时从 enqueue 起算、与 enroll/heartbeat 网络延迟无关，判定稳定，不重复出 finding。
    - `decisions.md` ADR-026 前存在双空行（diff 显示 2 个 `+` 空行），纯排版，未单列 finding。
  - 决策记录一致性：ADR-026 编号 025→026 连续；内容（保持不自动续期、`/pair/open` 手动续窗、替代方案 A/B）与代码事实核对一致（`server.ts:88-105, 440-444`、`build_pairing_status` 过期返回 code null、`is_enroll_allowed` 过期拒绝）。
- 总体判断：AC-001~005 全部落地且有真实断言；无未解决 critical / important；1 条 minor 建议处置，不阻断。
- 系统性 follow-up：无。

### AC 复验方式

- AC-001：`re_verified`。重跑 `npx vitest run tests/unit/bridge_auth_logs_pairing.test.ts` 全绿；断言（`level/command_id/type/timeout_ms`）对应 `src/bridge/server.ts:361-368` 实际日志路径，命令真实 50ms 超时走 `command_queue.ts:32-43` COMMAND_TIMEOUT，未 mock 被测逻辑（仅 spy `console.warn` 捕获输出）。
- AC-002：`re_verified`。测试注入 3 事件 + cap=2，核对 `src/bridge/cdp_handler.ts:101-120` `push_bounded` 淘汰分支（shift 最旧 pending 事件 → `event_count_cap` 日志），断言 `hit.reason === 'event_count_cap'`；CDP `/json/list` fetch 与 WebSocket 为外部依赖 mock，事件处理走真实 `onmessage` 逻辑。
- AC-003：`re_verified`。真实 HTTP 流程：`/pair/open`（MCP token）→ enroll（无 token，pairing code + `chrome-extension://a×32` origin，匹配 `server.ts:569` 的 `[a-p]{32}` 校验）→ 返回 `instance_token` → heartbeat 经 `resolve_extension_auth` instance token 路径（`server.ts:614-641` timingSafeEqual 哈希比较）返回 200。
- AC-004：`re_verified`。`docs/blueprint/decisions.md` 存在 ADR-026「pairing 窗口过期不自动续期」，内容与 spec 批准选项一致；测试断言文档段落存在（`tests/unit/bridge_auth_logs_pairing.test.ts:188-196`）。
- AC-005：`re_verified`。重跑全量 `npx vitest run tests/unit`：200 文件、1901 测试全通过；单独回归 bridge/cdp 相关 10 文件 170 测试通过。

coverage = 5 / 5

reviewed_scope: 1a6637ef348711a1

verdict: PASS

## Round 2 复核（2026-08-14 04:28 UTC+8）

### 前轮 finding 复核

- **t196_code_f001（minor，`{} as never` 强转）**：已消除。`tests/unit/bridge_auth_logs_pairing.test.ts:42` 改为 `handle_cdp_start({} as http.IncomingMessage, ...)`，文件头新增 `import http from 'node:http'`（`tests/unit/bridge_auth_logs_pairing.test.ts:6`）。处置按建议最小修复执行，无引入新问题。`as http.IncomingMessage` 为单次具名类型断言，`tsc` 全量通过，类型契约恢复，`never` 级联逃逸消除。

### 本轮新发现

- 0 条。修复未触碰测试逻辑本身（仅 import 与一处类型断言），无新增行为面。

### 验证证据

- `npx vitest run tests/unit/bridge_auth_logs_pairing.test.ts`：4 用例全绿（91ms→95ms）。
- `npx tsc --noEmit`：exit 0，无类型错误。

### 未进表提示

- 无新增（f001 修复后 `as http.IncomingMessage` 与 `_req` 未用参数语义一致，无运行时访问）。

reviewed_scope: fd5b4b111c83a1d7

verdict: PASS
