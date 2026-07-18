# 任务总清单

- ID 在此分配，全局递增；取 `docs/tasks/` 与 `docs/archive/tasks/` 中最大 ID 加一，无历史时从 T001 开始。
- 状态只使用：`backlog`、`active`、`done`、`dropped`。
- `backlog` 不建目录；`active` 必须有 `TNNN_slug/` 目录。
- `done` 及曾 active 的 `dropped` 任务目录必须移入 `docs/archive/tasks/`。
- owner 和 branch 表示当前归属；工作分支推荐 `task_tnnn_slug`。

| ID | 标题 | 状态 | owner | branch | 备注 |
|----|------|------|-------|--------|------|
| T001 | refactor: align agent docs layout with repo_template (Phase 0) | done | — | task_t001_align_repo_layout | commit `3a34685`；Phase 0 文档骨架 + 入口对齐 |
| T002 | refactor: move agent protocol into src/shared (Phase 2) | done | — | task_t002_shared_protocol_relocate | commit `5c21a50`；扁平 src/shared；extension/shared 下沉留 Phase 3 |
| T003 | refactor: move bridge sources to src/bridge (Phase 3a) | done | — | task_t002_shared_protocol_relocate | commit `e2a7f86` |
| T004 | refactor: move mcp sources to src/mcp (Phase 3b) | done | — | task_t002_shared_protocol_relocate | commit `0be0262`；src/agent/ 已删 |
| T005 | refactor: move extension surfaces + manifest + _locales (Phase 3c) | done | — | task_t002_shared_protocol_relocate | commit `cc399a4` |
| T006 | refactor: sink remaining extension-only shared into src/extension/shared/ | backlog | — | — | §4.3 表剩余 10 个文件；不阻塞 |
| T007 | test: reorganize tests into unit/integration/e2e (Phase 4) | backlog | — | — | 测试树重组；质量优化 |
| T008 | chore: finalize repo layout refactor (Phase 5 partial) | done | — | task_t002_shared_protocol_relocate | commit pending；blueprint + scanner + settings.json 收口；T006/T007 留 backlog |
