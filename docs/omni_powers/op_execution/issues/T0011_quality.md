---
id: I-20260718-01
title: T0011 第八轮 review PASS，嵌套 shell default 误报留作 P2
source: review 八轮通过残留（T0011）
spec: T0011
severity: P2
triaged: P2
tags: [quality, non-blocker, scanner-improvement]
status: closed
blocks_merge: false
created_at: 2026-07-18 14:05:54 UTC+8
closed_at: 2026-07-19 00:50:00 UTC+8
---

## 状态

第 8 轮独立 review PASS。Round 7 三个 blocker 全部关闭，AC-1/2/3/4 基线全过，1128 测试无回归，scanner 当前仓库 409 文件 PASS。

## 已尝试轮数

8 轮；第 3-8 轮均由用户额外授权。

## 留作 P2 改进项

`${VAR:-${OTHER}}` 嵌套 shell default 误报：正则 `[^}]*?` 非贪婪匹配到第一个 `}` 即止，捕获 `${OTHER`（缺右括号），触发误报。当前仓库 baseline 不含该模式，不阻塞 T0011。建议后续独立 issue 处理。

## 影响

- T0011 进入 evaluator 真机验收与 merge gate。
- T0012 解除阻塞，可启动。
