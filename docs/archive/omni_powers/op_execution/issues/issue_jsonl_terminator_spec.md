---
id: I-20260712-05
title: jsonl 行终止符规范未写入 data_model spec
source: docs/archive/TASKS.md
spec: docs/omni_powers/op_blueprint/specs/storage_indexeddb.md
severity: P3
tags: [docs, spec-gap]
status: open
blocks_merge: false
created_at: 2026-07-12 04:08:27 UTC+8
---

BUG-002 文档遗留（TASKS.md §BUG-002 文档分析 + 防复发）。

archive_builder 已修复 jsonl 末尾换行符（POSIX 规范，每行含 \n），但 docs/specs/data_model.md 未显式约定 jsonl 行终止符规范。

建议补充：「jsonl 每行以 \n 结尾，含最后一行」，避免下游消费者用 `wc -l` / `grep -c` 时 off-by-one。
