---
id: I-20260718-01
title: T0011 第五轮 review 仍存在 scanner 放宽规则与 AC-5 冲突
source: review 五轮到顶残留（T0011）
spec: T0011
severity: P1
triaged: P1
tags: [quality, blocker, security, test-gap]
status: open
blocks_merge: false
created_at: 2026-07-18 14:05:54 UTC+8
---

## 未解决的问题

第 5 轮独立 review FAIL（条件性）：

1. `scripts/scan_tracked_tree.mjs` `is_safe_literal_value` 引入 `/^[A-Za-z]+$/ && value.length < 12` 规则，放过短纯字母硬编码 secret：
   - `const PASSWORD = "supersecret";` PASS
   - `const TOKEN = "tokensecret";` PASS
   - `const API_KEY = "abcdefghijk";` PASS
2. `is_safe_literal_value` 中 `/^\[[^\]]*\]$/` 整体豁免数组字面量，未递归检查元素：
   - `const TOKENS = ["hunter2xx", "realsecret_abcd"];` PASS
3. 字符串拼接未合并求值：
   - `const PASSWORD = "super" + "secret";` PASS

第 5 轮已关闭 Round 4 全部恢复条件：跨行 assignment、placeholder 标点后缀、shell `${VAR:-default}`、bracket env、ternary fallback、template 表达式内部 assignment 均有真实 CLI 否证；AC-1 可执行 Vitest/Playwright discovery gate；`contract_matrix.json` 静态 1124 已删。

## 已尝试轮数

5 轮；第 3、4、5 轮均由用户额外授权。当前授权轮次已用尽。

## 影响

- T0011 标记 `blocked_by=quality`，不得进入 evaluator、merge gate 或 squash merge。
- T0012 依赖 T0011，当前不可执行。
- task 分支 `op/task/T0011` 保留，commit `43ae893` 未合入 main。

## 再次恢复条件

用户于 2026-07-18 明确授权第 6 轮 implementer/reviewer。修复不得降低 AC-5「真 secret 仍失败」：

- 删除 `is_safe_literal_value` 短纯字母规则，或显著收紧（如限制到 ≤4 字符、仅非 credential_key 场景）。
- 数组字面量递归检查每个元素。
- 字符串拼接的纯字面量子串合并后判定，或拼接两侧均满足 safe 才放过。
- 新增上述反例的真实 CLI 否证。
