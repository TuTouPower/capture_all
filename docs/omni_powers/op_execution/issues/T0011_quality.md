---
id: I-20260718-01
title: T0011 第七轮 review 仍存在 POSIX shell default、TS as const 拼接与字面 ${...} 字符串绕过
source: review 七轮到顶残留（T0011）
spec: T0011
severity: P1
triaged: P1
tags: [quality, blocker, security, test-gap]
status: open
blocks_merge: false
created_at: 2026-07-18 14:05:54 UTC+8
---

## 未解决的问题

第 7 轮独立 review FAIL：

1. POSIX shell 双字符 default 操作符漏报：
   - `` const TOKEN = `${ENV:-realsecret}`; `` exit 0
   - `` const TOKEN = `${ENV:=realsecret}`; `` exit 0
   - `` const TOKEN = `${ENV:?realsecret}`; `` exit 0
   - `rhs_contains_hardcoded_secret` shell default 正则仅匹配 `${VAR:default}` 或 `${VAR?default}`，不识别 POSIX `${VAR:-}`/`${VAR:=}`/`${VAR:?}` 双字符操作符。
2. TS 类型断言拼接漏报：
   - `const PASSWORD = ("super" as string) + ("secret" as const);` exit 0
   - `concatenate_string_literals` piece 内非引号字符（`as string)`）返回 null；fallback 走逐字面量，每个子串 < 8 字符不被识别。
3. 字面 `${...}` 字符串 secret 漏报：
   - `const API_KEY = process.env.TOKEN ?? "${LEGIT}";` exit 0
   - 字面字符串 `"${LEGIT}"`（含字面 `${...}` 字符，非 shell 替换）应被抓，实际 miss。

第 7 轮已关闭 Round 6 两个 blocker（括号包裹拼接、`||=`/`&&=`/`??=`）。

## 已尝试轮数

7 轮；第 3、4、5、6、7 轮均由用户额外授权。当前授权轮次已用尽。

## 影响

- T0011 标记 `blocked_by=quality`，不得进入 evaluator、merge gate 或 squash merge。
- T0012 依赖 T0011，当前不可执行。
- task 分支 `op/task/T0011` 保留，commit `b1c5132` 未合入 main。

## 再次恢复条件

需要用户再次明确授权后，才可启动第 8 轮 implementer/reviewer。修复不得降低 AC-5「真 secret 仍失败」：

- `rhs_contains_hardcoded_secret` shell default 正则扩展为 `(?::[-?=]+|[-?])`，识别 `${VAR:-}`/`${VAR:=}`/`${VAR:?}`/`${VAR:default}`/`${VAR?default}`/`${VAR-default}` 等 POSIX 形式；新增反例否证。
- `concatenate_string_literals` piece 解析跳过 `as <type>` 子句；或 fallback 路径对 `allow_source_expressions=true` 时拼接两侧均判 secret-like。
- 调查 `??` 链 RHS 截断路径；字面字符串含 `${...}` 字符应被 `is_secret_like_value` 抓住。
- method 调用形式拼接（`.join`/`.concat`）仍暂存为后续 issue（要求 AST）。
