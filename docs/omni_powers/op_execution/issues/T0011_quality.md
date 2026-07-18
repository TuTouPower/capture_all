---
id: I-20260718-01
title: T0011 第二轮 review 仍存在 scanner 绕过与 IndexedDB schema 证据缺口
source: review 两轮到顶残留（T0011）
spec: T0011
severity: P1
triaged: P1
tags: [quality, blocker, security, test-gap]
status: open
blocks_merge: false
created_at: 2026-07-18 14:05:54 UTC+8
---

## 未解决的问题

1. `scripts/scan_tracked_tree.mjs` 仍有真实 secret 绕过：
   - 任意 source 行包含 `line_pattern: /` 时关闭 credential assignment 检测。
   - slash 前后启发式可能把普通 assignment 当 regex。
   - 含 `${...}` 的模板字符串全部判安全，硬编码 secret 前缀可逃逸。
   - 部分 finding exemption 未完整锚定，scanner 自测 exemption 可豁免任意匹配前缀的真实 credential。
2. IndexedDB v1/v2/v3 fixture 已验证升级与 records 保留，但未逐 store 比对升级后 `keyPath` 与 `indexNames`，未完整满足 AC-2 schema 矩阵。

## 已尝试轮数

2 轮，达到 review 上限。

## 影响

- T0011 标记 `blocked_by=quality`，不得进入 evaluator、merge gate 或 squash merge。
- T0012 依赖 T0011，当前不可执行。
- task 分支 `op/task/T0011` 保留，commit `9bc0a35` 未合入 main。

## 恢复条件

需用户显式授权突破两轮 review 上限，追加第 3 轮 implementer/reviewer；或批准修改流程/规格。建议继续追加修复轮，不降低 AC-2/AC-5。
