---
id: I-20260713-02
title: AC-1 侧边栏验收为源码字符串匹配而非 Playwright E2E
source: reviewer 暂存（T0003）
spec: docs/omni_powers/op_execution/specs/T0003_remove-integrations-sidebar.md
severity: P3
tags: [tech-debt, test-gap, e2e]
status: closed
triaged: closed
blocks_merge: false
created_at: 2026-07-13 04:00:00 UTC+8
---

AC-1 单元测试使用正则匹配源码字符串（`readFileSync` + 正则计数 `{ key: '...' }` 模式）验证 NAV 数组只有 4 项且不含 `integrations` key，而非 spec 可测性契约要求的 Playwright E2E 验证侧边栏 DOM 文本。

T0003 属于 heavy profile。implementer 按 heavy 职责只写结构层测试，E2E 归 evaluator 所有。T0003 验收阶段 evaluator 已通过 CDP Playwright 脚本补充 AC-1/AC-2 的 E2E 验证并 PASS，实际行为正确。

关闭证据：正式测试 `e2e/T0003/nav-settings.spec.ts` 已落盘，通过 Playwright project `e2e-t0003` 执行 AC-1/AC-2，结果 `2 passed`。当前源码级断言保留为结构层测试。
