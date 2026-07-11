---
id: I-20260712-03
title: agent_mcp_client.test.ts 残留 mode:'standard' 透传
source: docs/archive/TASKS.md
spec: docs/omni_powers/op_blueprint/specs/agent_mcp.md
severity: P3
tags: [tech-debt, cleanup]
status: open
blocks_merge: false
created_at: 2026-07-12 04:08:27 UTC+8
---

BUG-001 连带问题（TASKS.md §BUG-001 剩余风险）。

agent_mcp_client.test.ts 仍传 `mode: 'standard'` 作为 MCP start_recording 参数（测透传语义）。service_worker 已不消费该字段，无功能影响，但违反 CLAUDE.md「已删除概念：模式切换/标准采集」术语约定，污染 MCP 接口层。

清理：MCP 工具 Zod schema 与测试移除 mode 字段。
