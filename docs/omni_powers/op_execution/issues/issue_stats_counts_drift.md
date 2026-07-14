---
id: I-20260712-02
title: stats 与 counts 两套计数口径偏差
source: docs/archive/TASKS.md
spec: docs/omni_powers/op_blueprint/specs/storage_indexeddb.md
severity: P2
tags: [bug, tech-debt, data-consistency]
status: closed
triaged: closed
blocks_merge: false
created_at: 2026-07-12 04:08:27 UTC+8
---

BUG-002 连带问题（TASKS.md §BUG-002 代码根因 + 剩余风险）。

实测偏差：`stats.request_count`(452) vs `counts.network`(476) 差 24（counts 含 capture_method=unknown）；`stats.event_count`(481) vs `counts.events`(459) 差 22。

根因：stats 是 service_worker 实时计数器，counts 是归档数组长度，两套独立口径未统一。下游消费者用不同口径会得到不一致结论。

建议统一口径或在 manifest 明确二者语义差异。

## 关闭说明

2026-07-14: 非实现 bug——在 capture_stats.ts 文档化 stats vs 归档 counts 双口径；不混用。
