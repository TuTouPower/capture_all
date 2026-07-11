---
id: I-20260712-06
title: Web Vitals / Long Task / 资源加载性能标签缺失
source: docs/archive/CAPTURE_GAPS.md
spec:
severity: P2
tags: [feature, gap, performance]
status: open
blocks_merge: false
created_at: 2026-07-12 04:08:27 UTC+8
---

CAPTURE_GAPS.md GAP-P01/P02/P03。

当前 7 数据标签无 `performance` 标签。三缺口：

| ID | 缺口 | 触发 | 数据 | 优先级 | 复杂度 |
|----|------|------|------|--------|--------|
| GAP-P01 | Web Vitals (LCP/FID/CLS/INP) | PerformanceObserver | 低频数值，一页 1-4 条 | P2 | 中 |
| GAP-P02 | Long Task (>50ms) | PerformanceObserver | 中频，阻塞主线程任务 | P3 | 中 |
| GAP-P03 | 资源加载性能 | PerformanceObserver | 中频，慢资源 TTFB/duration | P3 | 中 |

src/shared/types.ts 与 event_category.ts 无对应类型。Core Web Vitals 是 Web 性能基本盘，建议至少落地 GAP-P01。
