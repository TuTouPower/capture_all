# Task review t100（reviewer_focus: 测试）

- task：`t100_privacy_logger_stack_redact_url`
- spec：`docs/tasks/t100_privacy_logger_stack_redact_url/spec.md`
- diff_anchor：`e47d501b5e19cce4e486003830950beff707bebc`
- target：`git diff e47d501b5e19cce4e486003830950beff707bebc`
- round：1
- reviewed_at：2026-08-11 05:05 UTC+8
- reviewed_scope: 228782fa72edd4ee

## Findings

无（0 finding）。

危险模式扫描逐条复核：无恒真断言、无删/反转/注释 expect、无弱化断言（`not.toContain` / `toContain('[REDACTED]')` / `decodeURIComponent(...).toContain('[REDACTED]')` 均按安全语义使用）、无 `.skip`/`.only`、无 eslint-disable/ts-ignore、无 mock（直接调生产函数 `sanitize_log_value` / `redact_url`）、无阈值掩盖、无条件跳过、无存在即通过。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：不适用（本轮为 Round 1）。
- 改测方向复核：无。diff 仅新增 `tests/unit/logger_stack_redact.test.ts`，未改动任何既有测试。
- 本轮新发现：0 条。
- 未进表的提示（范围外观察，不阻断）：
  1. logger 侧 `URL_SUBSTRING_PATTERN` 新增的相对 URL / 纯 query 路由分支（第二、三分支）未被自动测试直接触达——AC-002 按测试策略「直接调 redact_url」覆盖，属批准路径。实测 `sanitize_log_value('user hit path?api_key=abc123 and /rel?token=xyz456 and ?pure=sec999')` 输出 `path?api_key=[REDACTED]`、`/rel?token=[REDACTED]`，路由行为正确；可选补一个 logger 层相对 URL 的 message 用例。
  2. AC-001b 只断言负向（不含明文），未断言 `[REDACTED]` 占位存在；因 AC-001 主用例已含正向断言，此为可选加强，不阻断。
  3. AC-002c 额外覆盖绝对 URL query 且验证非敏感参数 `id=5` 保留，是对「fail-closed 过严」风险的回归护栏，值得保留。
- 总体判断：测试真实触达生产逻辑，6/6 通过；三条 AC 均有对应测试且断言有牙齿（负向防泄露 + 正向占位，且正确区分绝对 URL 的 `[REDACTED]` 被 percent-encode 需 `decodeURIComponent`、相对 URL 分支原样拼接不需解码）；无 blocking finding，PASS。
- AC 复验方式：
  - AC-001：`re_verified` — 重跑 `npx vitest run tests/unit/logger_stack_redact.test.ts`（6 passed）；断言 `decodeURIComponent(sanitized.stack)).toContain('[REDACTED]')` 正确覆盖 URL 编码占位，负向 `not.toContain('secret123')` 防泄露。生产链路 `sanitize_log_value` → Error 分支 `sanitize_string(value.stack)` 已由测试直接触达。
  - AC-002：`re_verified` — 重跑通过；`redact_url('path?api_key=abc123&ok=1')` 与 `redact_url('?token=xyz123')` 断言 `toContain('[REDACTED]')` 为字面占位，证明走的是 catch 相对 URL 分支（try 分支会 percent-encode 为 `%5B`/`%5D`，不会字面命中），即新 fail-closed 代码真实被覆盖，非假绿。
  - AC-003：`re_verified` — 重跑通过；断言 host `example.test` 与 path `/foo/bar` 保留、`url_status='captured'`，验证无 query 普通绝对 URL 不被整串抹掉。
  - coverage = 3 / 3（re_verified）
- 系统性 follow-up：无（未发现跨 task 的测试基础设施/公共代码/工具链缺口）。

verdict: PASS

## Round 2 (2026-08-11 05:12 UTC+8)

reviewed_scope: a63d65d6d0e07aa8

### 前轮 finding 复核

Round 1 无 finding，`verdict: PASS`。本轮聚焦 Round 1 f001/f002/f004 修复新增的三条回归用例（AC-002d / AC-002e / AC-002f），核对其真实触达修复后生产逻辑且有断言牙齿。

- AC-002d（`tests/unit/logger_stack_redact.test.ts:52-56`）：调用 `redact_url('?next=https://app.example.com/login?token=abc123', true)`，断言 `not.toContain('abc123')`（防泄露）+ `decodeURIComponent(result.url).toContain('[REDACTED]')`（正向占位，正确识别 try 分支 percent-encode 需解码）。修复后手动路径递归脱敏被真实覆盖，非假绿。
- AC-002e（`:58-66`）：经 logger 层 `sanitize_log_value` 断言 `user?.token 读取失败` 与 `cond?token:x` 原样保留（`toContain` 原文 + s1 额外 `not.toContain('[REDACTED]')`）。因 `cond?token=[REDACTED]` 不含 `cond?token:x`，s2 的 `toContain` 亦有牙齿，能抓住 f002 复现形态。覆盖的是 logger 正则收紧（f002 修复位点）。
- AC-002f（`:68-71`）：断言 `redact_url('?%74oken=secret', true)` 输出 `not.toContain('secret')`，直接命中 f004 的 decode-key 修复位点。

### 危险模式扫描

逐条复核：无恒真断言、无删/反转/注释 expect、无弱化断言（`not.toContain` / `toContain('[REDACTED]')` / `decodeURIComponent(...).toContain('[REDACTED]')` 均按安全语义使用）、无 `.skip`/`.only`、无 eslint-disable/ts-ignore、无 mock（直接调生产函数 `sanitize_log_value` / `redact_url`）、无阈值掩盖、无条件跳过、无存在即通过。

### 结论

- 前轮 finding 复核：Round 1 无 finding，保持 PASS；本轮新增回归用例均有效。
- 改测方向复核：无。diff 仅新增 `tests/unit/logger_stack_redact.test.ts`（Round 1 后追加 AC-002d/e/f 三个用例），未改动任何既有测试，无「迁就实现」式改测。
- 本轮新发现：0 条。
- 未进表的提示（范围外观察，不阻断）：
  1. AC-002e 内 `await_import_logger()` 动态导入冗余——`sanitize_log_value` 已在上方静态导入（`:5`），可简化为直接用静态引用。
  2. AC-002f 仅断言负向（`not.toContain('secret')`），未断言 `[REDACTED]` 占位存在；因防泄露是安全属性核心，负向已够，正向可作可选加强。
  3. logger 层相对 URL 路由分支（`URL_SUBSTRING_PATTERN` 第二分支 `/path?k=v`）仍无直接单测，但按测试策略「直接调 redact_url」属批准路径，且 AC-002/002d 已覆盖相对形态；不阻断。
- 总体判断：三条 AC 均有对应测试，新增回归用例真实触达修复位点且断言有牙齿，9/9 通过；无 blocking finding，PASS。
- AC 复验方式：
  - AC-001：`re_verified` — 重跑测试 9/9 通过；AC-001/001b 断言 stack 无明文 + decode 后含 `[REDACTED]`，生产链路 `sanitize_log_value` → Error 分支 `sanitize_string(value.stack)` 已直接触达。
  - AC-002：`re_verified` — AC-002/002b/002d/002e/002f 覆盖相对 URL、纯 query、嵌套绝对 URL、可选链/三元排除、编码 key；负向防泄露 + 正向占位双断言，且区分 try 分支（percent-encode）与手动路径（字面占位）两种编码形态。
  - AC-003：`re_verified` — AC-003 断言 host/path 保留、status `captured`，验证无 query 绝对 URL 不被整串抹掉。
  - coverage = 3 / 3（re_verified）
- 系统性 follow-up：无。

verdict: PASS

## Round 3 (2026-08-11 05:08 UTC+8)

reviewed_scope: a5307a49a496754c

### 前轮 finding 复核

- 测试侧本无代码改动（f005 为代码层修复，由 code reviewer 验证）。

### 本轮新发现

无。

### 结论

- AC-001/002/003 复验不变；9/9 测试通过，全量 1204 通过。

verdict: PASS
