---
id: I-20260718-01
title: T0011 第六轮 review 仍存在括号包裹拼接与 logical assignment 绕过
source: review 六轮到顶残留（T0011）
spec: T0011
severity: P1
triaged: P1
tags: [quality, blocker, security, test-gap]
status: open
blocks_merge: false
created_at: 2026-07-18 14:05:54 UTC+8
---

## 未解决的问题

第 6 轮独立 review FAIL：

1. 括号/嵌套括号包裹的字符串拼接绕过合并判定：
   - `const PASSWORD = ("super" + "secret");` exit 0
   - `const TOKEN = (("super") + (("secret")));` exit 0
   - `concatenate_string_literals` 要求 RHS 以引号字符开头，外层括号使其返回 null；fallback 走逐字面量循环，每个子串 < 8 字符不被识别为 secret-like。
2. logical assignment `||=`、`&&=`、`??=` 完全不解析：
   - `API_KEY ||= "real_secret";` exit 0
   - `API_KEY ??= "real_secret";` exit 0
   - `extract_assignments` 仅识别 ident 后跟 `:` 或 `=`。

第 6 轮已关闭 Round 5 三 blocker 中第 1（短纯字母白名单）和第 2（数组字面量递归）；第 3（字符串拼接）部分关闭。

## 已尝试轮数

6 轮；第 3、4、5、6 轮均由用户额外授权。当前授权轮次已用尽。

## 影响

- T0011 标记 `blocked_by=quality`，不得进入 evaluator、merge gate 或 squash merge。
- T0012 依赖 T0011，当前不可执行。
- task 分支 `op/task/T0011` 保留，commit `04687c2` 未合入 main。

## 再次恢复条件

需要用户再次明确授权后，才可启动第 7 轮 implementer/reviewer。修复不得降低 AC-5「真 secret 仍失败」：

- `rhs_contains_hardcoded_secret` 或 `concatenate_string_literals` 剥离首尾匹配的 `()` 后再合并判定。
- `extract_assignments` 增加 `||=`、`&&=`、`??=` 识别。
- 新增括号包裹拼接与 logical assignment 反例的真实 CLI 否证。
- 方法调用形式拼接（如 `["a","b"].join("")`）暂存为后续 issue，不阻断本任务。
