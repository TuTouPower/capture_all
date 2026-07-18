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

第 3 轮 review（用户额外授权）仍 FAIL：

1. `scripts/scan_tracked_tree.mjs` 仍有真实 secret 绕过：
   - 静态片段不超过 8 字符的模板可被判为安全，如 ``API_KEY = `hunter2${runtime_id}```、``AKIA${suffix}``。
   - placeholder 仅按值前缀匹配，`${RUNTIME_ID}hunter2`、`${RUNTIME_ID:-hunter2}`、`process.env.API_KEY || "hunter2"` 可逃逸。
2. IndexedDB 冻结仍不完整：
   - 测试 expected 直接引用生产 `DB_VERSION`；生产版本改为 v4 时不会失败。
   - `sessions`、`events`、`console_logs`、`error_log` 由 fixture 预建后与 fixture 自比，生产空库建库 schema 漂移可逃逸。
3. Artifact smoke 依赖 ignored `artifacts/` 残留，不证明当前源码完成新鲜 build；陈旧产物可掩盖 Bridge 源码/build script 损坏。

第 3 轮已关闭原始 `line_pattern`/slash/宽泛 exemption 样例，并增加逐 store schema 比对，但上述反例证明 AC-1/AC-2/AC-5 仍未满足。

## 已尝试轮数

3 轮；第 3 轮由用户额外授权，仍达到当前授权上限。

## 影响

- T0011 标记 `blocked_by=quality`，不得进入 evaluator、merge gate 或 squash merge。
- T0012 依赖 T0011，当前不可执行。
- task 分支 `op/task/T0011` 保留，commit `9bc0a35` 未合入 main。

## 恢复条件

需用户再次明确授权额外 implementer/reviewer 轮。修复不得降低 AC-1/AC-2/AC-5：

- scanner 必须拒绝任何含硬编码静态 secret 的模板、placeholder 拼接或默认值，仅放行完整纯动态表达式。
- 使用独立冻结 v3 契约验证 DB version 与空库生产建库的全部 14 store schema；升级 fixture 继续验证 sentinel records。
- artifact smoke 必须绑定当前源码的新鲜 build，不读取残留产物自证。
