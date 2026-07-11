---
id: I-20260712-01
title: exception_capture 子目标 Runtime.enable 缺口
source: docs/archive/TASKS.md
spec: docs/omni_powers/op_blueprint/specs/network_body_capture.md
severity: P2
tags: [bug, gap, cdp]
status: open
blocks_merge: false
created_at: 2026-07-12 04:08:27 UTC+8
---

BUG-003 连带问题（TASKS.md §BUG-003 剩余风险）。

exception_capture.ts 只对主 tab 发 `Runtime.enable`，无 `Target.attachedToTarget` 分支。worker/iframe/OOPIF 子目标的 `Runtime.exceptionThrown` 事件不会触发，重 SPA 站点子目标异常采集缺失。

参照 console_capture.ts 修复模式：接入 cdp_event_router 的 register/unregister，子目标 attach 时发 `Runtime.enable`，detach 时清理。

原文明示「独立立项」「超出 BUG-003 范围」。
