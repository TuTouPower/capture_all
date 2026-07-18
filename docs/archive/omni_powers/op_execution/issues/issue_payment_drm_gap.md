---
id: I-20260712-08
title: Payment / DRM 安全审计事件缺失
source: docs/archive/CAPTURE_GAPS.md
spec:
severity: P3
tags: [feature, gap, security]
status: open
blocks_merge: false
created_at: 2026-07-12 04:08:27 UTC+8
---

CAPTURE_GAPS.md GAP-S02。

PaymentRequest、MediaKeySystemAccess 未采集。极低频，安全审计用途，建议归 `security_event` 标签。

src/shared/types.ts 无 security_event / payment_request 类型。优先级 P4，按需加。
