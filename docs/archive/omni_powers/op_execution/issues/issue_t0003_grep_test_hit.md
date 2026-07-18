---
id: I-20260713-01
title: AC-4 grep spec 措辞未考虑测试文件自身引用被测符号名
source: reviewer 暂存（T0003）
spec: docs/omni_powers/op_execution/specs/T0003_remove-integrations-sidebar.md
severity: P2
tags: [tech-debt, spec-措辞]
status: open
triaged: P2
blocks_merge: false
created_at: 2026-07-13 04:00:00 UTC+8
---

spec AC-4 字面要求 `grep -r 'render_integrations\|wire_integrations' src/ tests/` 无结果。测试文件自身包含这些字符串作为验证清理完成的断言（`.not.toContain('render_integrations')`、`.not.toHaveProperty('render_integrations')` 等），属测试正确行为，非死代码残留。

`src/` 单独 grep 返回空，实际死代码已清干净。

spec 措辞边界问题：未考虑"测试自身引用被测符号名以验证其不存在"的情况。非实现缺陷，不阻塞合并。建议后续 spec 编写中对此类清理型验收标准限定 grep 范围为 `src/`，或明确标注"测试文件中的验证性引用除外"。
