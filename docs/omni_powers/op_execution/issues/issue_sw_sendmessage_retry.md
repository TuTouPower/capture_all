---
id: I-20260712-04
title: SW chrome.tabs.sendMessage 失败未重试
source: docs/archive/TASKS.md
spec: docs/omni_powers/op_blueprint/specs/content_events.md
severity: P2
tags: [bug, robustness, messaging]
status: open
blocks_merge: false
created_at: 2026-07-12 04:08:27 UTC+8
---

BUG-004 连带问题（TASKS.md §BUG-004 代码根因 + 防复发）。

service_worker.ts 在 `chrome.tabs.sendMessage(tab.id, {action:'start'})` 失败（"Receiving end does not exist"）时只 warn 不重试（service_worker.ts:395-397、474-477）。

当前靠 content_script 轮询（poll_capture_status）兜底，但轮询有 2 秒间隔，首次同步可能延迟。建议 SW 端加 2-3 次短延迟重试，与轮询形成双保险。

原文明示「独立立项」「建议主代理评估」。
