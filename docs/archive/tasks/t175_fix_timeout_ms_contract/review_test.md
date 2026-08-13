# Task review t175（reviewer_focus: 测试）

- task：`t175_fix_timeout_ms_contract`
- spec：`docs/tasks/t175_fix_timeout_ms_contract/spec.md`
- diff_anchor：`b2e8a14495abd15835a10ac7b6917d63ac71ffe9`
- target：`git diff b2e8a14495abd15835a10ac7b6917d63ac71ffe9`
- round：1
- reviewed_at：2026-08-13 20:08 UTC+8

## Findings

### t175_test_f001 - AC-002a 冗余 spyOn 整个 AbortSignal 构造器，恢复不放 finally

- 严重度：minor
- 锚点：AC-002（测试可信 · mock 边界）
- 位置：`tests/unit/timeout_ms_contract.test.ts:20,36`
- 问题：AC-002a 首行 `vi.spyOn(globalThis, 'AbortSignal')` 把整个 AbortSignal 构造器替换为 mock，但断言用的是 `Object.defineProperty` 注入的 `timeout_fn`，`timeout_spy` 从未被断言（死代码）。实测（vitest 4.1.10，Node 24）该 spy 保留原静态属性、`AbortSignal.timeout` 调用正常，测试真实有效；但正确性依赖 vitest 对构造器 spy 的属性保留行为，升级环境有变红风险。另：AC-002a/b/c 三处 `Object.defineProperty` 恢复均不在 finally 中，断言失败时 `AbortSignal.timeout` 残留 `timeout_fn`，同文件后续测试受污染（顺序依赖）。
- 建议：删除 AC-002a 的 `timeout_spy`（与 AC-002b/002c 统一用 defineProperty 模式），并把 AbortSignal.timeout 恢复移入 `try/finally`。

### t175_test_f002 - AC-003 源码文本断言脆弱，docs 端一致性无自动断言

- 严重度：minor
- 锚点：AC-003
- 位置：`tests/unit/timeout_ms_contract.test.ts:69-77`
- 问题：AC-003 测试用 `readFileSync('src/mcp/client.ts')` + `toContain('GET_STATUS_TIMEOUT_MS = 30 * 1000')` / `not.toContain('> 300000)')` 断言源码文本而非行为：常量改名/换行即红（过度约束实现），`not.toContain('> 300000)')` 是弱代理断言（等价错误写法如 `>= 300000` 或 `> 300001` 漏网）。且仅覆盖 client/Bridge 源码，未覆盖 AC-003 字面包含的 blueprint/指南文档值。关键运行时行为（client 缺省 30s → `AbortSignal.timeout(30000)`）已由 `tests/unit/agent_mcp_client.test.ts:104-112` 真实行为测试覆盖，Bridge 侧上限由既有 `validate_command_request` 逻辑（`server.ts:988`）保证，故不阻断。
- 建议：client 默认值以行为测试为准；bridge 常量复用可保留静态断言但改用对常量值/校验边界的精确断言（如读常量或直接断言 300001 被 Bridge 拒绝），docs 端如要覆盖可断言 domain.md/mcp_usage.md 超时值表文本（同为静态断言，按需取舍）。

## 结论

- 前轮 finding 复核（Round 1）：无
- 改测方向复核：`agent_mcp_client.test.ts` 仅改 2 处既有断言预期（`10 * 1000` → `30 * 1000`、`10000ms` → `30000ms`，diff_anchor 起 6 行）与测试标题。spec 契约区要求统一默认超时值（client 缺省 30s），旧测试「固定 10s」语义随 spec 失效，新预期对应新实现，属合法改测，非迁就实现。无其他既有测试改动。其余 diff 为新增测试文件与生产实现。
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
  - AC-004 无独立测试条目，由 AC-002b/002c 承担（`execute_mcp_tool` 入口即 MCP server 接线 `src/mcp/main.ts:39` parse 后路径，parse 不转换 `timeout_ms`，等效覆盖 schema→tool→client），判定满足。
  - AC-001 断言 300001 拒绝 + 300000 通过 + `MAX_COMMAND_TIMEOUT_MS === 300000` 三连，覆盖闭合；Bridge 端上限为「非范围」既有行为，未新增测试合理。
- 总体判断：AC-001~004 全覆盖闭合，断言均触达真实生产逻辑（真实 `schema.parse`、真实 `client.get_status` + `AbortSignal.timeout` 参数 spy、真实 bridge server + 30s 默认），代入基线实现（无 max / 固定 10s / tool 不读 timeout_ms）推理全部红灯成立；2 条 minor 不阻断。
- 系统性 follow-up：无
- AC 复验方式：
  - AC-001：`re_verified`——`npx vitest run tests/unit/timeout_ms_contract.test.ts` 5/5 绿；基线 `b2e8a14:src/mcp/schemas.ts` 无 `.max`，300001 通过 → `toThrow` 红灯成立。
  - AC-002：`re_verified`——AC-002b/002c 走真实 `execute_mcp_tool` → `client.get_status(1)` → `AbortSignal.timeout(1)` spy 精确断言；探针实测 AC-002a 的 `spyOn(globalThis,'AbortSignal')` 保留静态属性、spy 有效；基线 `tools.ts` 不读 `timeout_ms` → `toHaveBeenCalledWith(1)` 红灯成立。
  - AC-003：`re_verified`——`agent_mcp_client.test.ts` 真实 server + `get_status()` 无参 → `AbortSignal.timeout(30*1000)` 绿；`server.ts:988` 校验用 `MAX_COMMAND_TIMEOUT_MS`；`domain.md`/`mcp_usage.md` diff 与 client 30s 一致。
  - AC-004：`re_verified`——AC-002b/002c 自 `execute_mcp_tool` 入口验证参数生效（`src/mcp/main.ts:39` 接线为 parse 后直传，无参数丢失环节）。
  - coverage = 4 / 4

reviewed_scope: 94f5c09b3efb51cf

verdict: PASS
