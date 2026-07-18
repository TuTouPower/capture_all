# 任务总清单

- ID 在此分配，全局递增；取 `docs/tasks/` 与 `docs/archive/tasks/` 中最大 ID 加一，无历史时从 T001 开始。
- 状态只使用：`backlog`、`active`、`done`、`dropped`。
- `backlog` 不建目录；`active` 必须有 `TNNN_slug/` 目录。
- `done` 及曾 active 的 `dropped` 任务目录必须移入 `docs/archive/tasks/`。
- owner 和 branch 表示当前归属；工作分支推荐 `task_tnnn_slug`。

| ID | 标题 | 状态 | owner | branch | 备注 |
|----|------|------|-------|--------|------|
| T001 | refactor: align agent docs layout with repo_template (Phase 0) | done | — | task_t001_align_repo_layout | commit `3a34685`；Phase 0 文档骨架 + 入口对齐；后续 Phase 1-5 待开新 task |
| T002 | refactor: move agent protocol into src/shared (Phase 2) | active | — | task_t002_shared_protocol_relocate | protocol 归位扁平 src/shared/；§4.3 扩展专用下沉合并到 Phase 3 |
