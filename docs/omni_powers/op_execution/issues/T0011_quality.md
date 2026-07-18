---
id: I-20260718-01
title: T0011 第四轮 review 仍存在 scanner 绕过与 Playwright discovery 证据缺口
source: review 四轮到顶残留（T0011）
spec: T0011
severity: P1
triaged: P1
tags: [quality, blocker, security, test-gap]
status: open
blocks_merge: false
created_at: 2026-07-18 14:05:54 UTC+8
---

## 未解决的问题

第 4 轮独立 review 仍 FAIL：

1. `scripts/scan_tracked_tree.mjs` 仍可放过直接硬编码静态 secret：
   - 跨行赋值、跨行 default。
   - `${RUNTIME_ID}/hunter2`、`${RUNTIME_ID}.hunter2` 等标点后缀。
   - ternary fallback、`process.env["API_KEY"] || "hunter2"`。
   - 模板表达式内部 assignment。
2. AC-1 未冻结基础 Playwright 非零发现：
   - 删除唯一 `tests/e2e.spec.ts` 后，baseline smoke 仍 PASS。
   - `contract_matrix.json` 仅静态记录发现数，且 `1124 tests` 已与本轮真实 1105 tests 不一致。

第 4 轮已关闭 DB v4、legacy 空库 schema 与陈旧 artifact 三类假绿：独立 v3/14-store 契约和 fresh build smoke 已通过 mutation review。

## 已尝试轮数

4 轮；第 3、4 轮均由用户额外授权。当前授权轮次已用尽。

## 影响

- T0011 标记 `blocked_by=quality`，不得进入 evaluator、merge gate 或 squash merge。
- T0012 依赖 T0011，当前不可执行。
- task 分支 `op/task/T0011` 保留，commit `137236f` 未合入 main。

## 再次恢复条件

用户于 2026-07-18 明确授权第 5 轮 implementer/reviewer。修复不得降低 AC-1/AC-5：

- scanner 必须按完整 assignment 值或可靠语法范围判断，拒绝跨行、标点后缀、fallback、模板表达式内硬编码 secret；不得新增宽泛文件/目录 exemption。
- 新增 reviewer 全部反例为真实 CLI 否证。
- baseline 必须执行 Playwright discovery 并断言基础 project 至少发现 1 个测试；删除或改名唯一基础 E2E 必须失败。
- 清理或机器化 `contract_matrix.json` 中陈旧测试数量，禁止静态数字充当 runner 证据。
