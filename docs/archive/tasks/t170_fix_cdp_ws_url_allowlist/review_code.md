# Task review t170（reviewer_focus: 代码）

- task：`t170_fix_cdp_ws_url_allowlist`
- spec：`docs/tasks/t170_fix_cdp_ws_url_allowlist/spec.md`
- diff_anchor：`053eb1d8a9f9755b2f1fef827c3857ca2c9e4cf3`
- target：`git diff 053eb1d8a9f9755b2f1fef827c3857ca2c9e4cf3`
- round：1
- reviewed_at：2026-08-13 18:45 UTC+8

## Findings

### t170_code_f001 - 空/默认端口（ws 默认 80）跳过端口一致性校验

- 严重度：minor
- 锚点：规格「范围」要求「端口必须等于请求的 `port`」；AC 未覆盖此分支，无安全影响，不阻断
- 位置：`src/bridge/cdp_handler.ts:639`
- 问题：端口校验为 `u.port !== '' && Number(u.port) !== port`，空端口（含 ws 默认端口 80）直接放行。node 实测（复验证据）：`new URL('ws://127.0.0.1:80/x').port === ''`、`new URL('ws://127.0.0.1/x').port === ''`——WHATWG URL 对 ws scheme 的默认端口 80 归一化为空串。因此 discovery 返回 `ws://127.0.0.1/devtools/page/x`（无端口）或 `ws://127.0.0.1:80/...` 时，请求端口为 9222 也通过校验。与规格「端口必须等于请求的 port」字面不符。
- 建议：两种处置二选一：(a) 严格化——空端口也拒绝（`Number(u.port) !== port`，空串 Number 为 0 ≠ 请求端口）；(b) 若「仅作一致性参考」是刻意决策，在 spec 上下文区或代码注释声明空端口放行的依据。安全性无差异：连接 URL 恒为自行构造的 `ws://127.0.0.1:{请求端口}/...`，authority 不取自 discovery。

## 结论

- 前轮 finding 复核：Round 1 无前轮
- 本轮新发现：1 条（t170_code_f001，minor）
- 未进表的提示：
  - 文件过大：`src/bridge/cdp_handler.ts` 646 行（minor 阈值 400，本 task 净增 41 行），未超 800，且无因体量产生的行为缺陷，按降级规则仅提示；`tests/unit/cdp_ws_url_allowlist.test.ts` 160 行，远低阈值。
  - 复杂度：`safe_cdp_ws_url` 手算 McCabe ≈ 10（4 个 `||` 短路 + 6 个 if/catch 分支），达结论段提示阈值，但函数仅 15 行、单职责、无嵌套分叉，不建议拆分。
  - 死条件：`src/bridge/cdp_handler.ts:637` 的 `host === '::1'` 永不命中——WHATWG URL 的 `hostname` 对 IPv6 恒带方括号（node 实测 `new URL('ws://[::1]:9222/x').hostname === '[::1]'`），可删除；无行为影响。
  - 测试层观察（属 test reviewer 范围，仅提示）：AC-001 测试的 discovery URL 与构造 URL 相同、AC-001b（localhost）只断言实例数，「校验后替换 authority」与旧「直接信任 discovery」行为差异未被单测区分。
  - 范围外核实：`webSocketDebuggerUrl` 全仓唯一消费点为 `handle_cdp_start` 的 `new WebSocket`（grep 证实），无其他未防护的直连路径。
- 总体判断：实现完整覆盖 AC-001~004，校验边界经 node 实测全部安全——protocol 大小写（`WS://` 归一 `ws:`）、hostname 归一（`LOCALHOST`→`localhost`、IPv6 全形式→`[::1]`、尾点 `127.0.0.1.`→`127.0.0.1`）、userinfo、fragment、畸形 URL（`ws://host:abc`、`ws://host:9222.5` 抛异常入拒路径）均正确；最终连接 URL 恒为 `ws://127.0.0.1:{请求 port}/devtools/page/{encodeURIComponent(id)}`，无任何输入可逃逸到非 loopback authority；校验失败路径（400）不建 session、不建 WebSocket、无孤儿 timer，与 t158 terminal 语义无冲突；正常 loopback CDP 建立无回归（测试全绿）。唯一偏差为 f001 的规格字面问题（minor）。

### AC 复验方式

- AC-001：`re_verified`——重跑 `npx vitest run tests/unit/cdp_ws_url_allowlist.test.ts`（7/7 pass），AC-001 断言构造 URL `ws://127.0.0.1:9222/devtools/page/target-1` 且实例数 1。
- AC-002：`re_verified`——测试断言 400 + `cdp_invalid_ws_url` + WebSocket 实例数 0；代码路径 `cdp_handler.ts:637` loopback 白名单拒绝远端 host。
- AC-003：`re_verified`——AC-003a/b/c 三用例（不同端口 9999、`wss:`、userinfo）全过，均断言不建 WebSocket。
- AC-004：`re_verified`——测试文件含全部 4 类负向用例（远端 host、不同端口、userinfo、非 ws scheme）加畸形 URL/空 id 组合用例。

coverage = 4 / 4

- 系统性 follow-up：无

reviewed_scope: 52d8cf3500c3dc8d

verdict: PASS

## Round 2 (2026-08-13 18:50 UTC+8)

### 前轮 finding 复核

- **t170_code_f001（minor：空/默认端口跳过端口校验）— 已修**。以 diff 与测试核实，不采信处置表自述：
  - 代码：`src/bridge/cdp_handler.ts:639` 现为 `if (u.port === '' || Number(u.port) !== port) return null;`。WHATWG URL 将 ws 默认端口 80（显式 `:80` 或无端口）统一归一为空串，现一律拒绝——与规格「端口必须等于请求 port」严格一致。Round 1 指出的 `ws://127.0.0.1/...`（请求 9222）放行路径已闭合。
  - 回归测试：新增 AC-003e（`cdp_ws_url_allowlist.test.ts:154`，无端口 discovery → 400 + 不建 WebSocket）锁定该语义。重跑 6 个相关测试文件 31/31 pass、全量 174 文件 1676/1676 pass、`npx tsc --noEmit` 通过。

### 本轮新发现

0 条。

### 修复过程扫描（fixture 更新副作用核查）

- 5 个既有测试文件（bridge_cdp_events / cdp_body_budget_accounting / cdp_handler_redaction / cdp_session_idle_bounds / cdp_ws_close_terminal）的 discovery fixture 均为纯补 `:9222`，路径与其他字段未动；全仓 grep 确认无其他遗漏的无端口 fixture（唯一存留的 `ws://127.0.0.1/` 即 AC-003e 负向用例本身）。这些测试关注 events 轮询/body 预算/redaction/idle TTL/close terminal，不依赖 URL 路径，补端口后语义不变，全量测试证实无回归。
- AC-001b 强化为判别「构造 vs 信任 discovery」：localhost host + 非标准路径 `/custom/path/ignored` → 断言构造 URL 为 `ws://127.0.0.1:9222/devtools/page/target-1`，解决 Round 1 结论段观察。新增 AC-003d fragment 负向用例补齐此前无测试覆盖的分支。

### 未进表提示

- AC-003d 测试名标注「（f002）」，但 Round 1 finding 表无 f002，编号疑似误标，无行为影响。
- Round 1 结论段的 `'::1'` 死条件（`cdp_handler.ts:637`）未处理，仍为纯冗余（WHATWG 对 IPv6 hostname 恒带方括号），非 finding、不阻断。

### AC 复验方式

- AC-001~004：`re_verified`——重跑 `npx vitest run`（全量 1676/1676 pass）与 `npx tsc --noEmit`（exit 0）；f001 修复后 AC-001（含 localhost 构造断言）、AC-002、AC-003a/b/c/d/e、AC-004 用例全部通过。

coverage = 4 / 4

reviewed_scope: ebc58439e7b907ad

verdict: PASS
