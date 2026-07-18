---
id: I-20260712-07
title: Service Worker 通信采集缺失
source: docs/archive/CAPTURE_GAPS.md
spec:
severity: P3
tags: [feature, gap]
status: open
blocks_merge: false
created_at: 2026-07-12 04:08:27 UTC+8
---

CAPTURE_GAPS.md GAP-S01。

`navigator.serviceWorker` postMessage / onmessage 未采集。SPA 离线/推送场景依赖 SW 通信，当前 7 标签无 `sw_messaging` 标签覆盖。

src/shared/types.ts 无对应类型。优先级 P3，按需加。
