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
| T006 | refactor: sink remaining extension-only shared into src/extension/shared/ | done | — | task_t002_shared_protocol_relocate | commit `410d1a4`；§4.3 表全闭合 |
| T007 | test: reorganize tests into unit/integration/e2e (Phase 4) | done | — | task_t002_shared_protocol_relocate | commit `3416dd6` + `70dde67`；三层 tests/{unit,e2e,support}/ |
| T008 | refactor: replace browser_no with browser_label + instance_id routing | done | — | main | commit `a408f24` + `89a88d4`；代码+文档；测试重写拆 T009/T010（注：T008 ID 复用，旧 T008_phase5_finalize 已在 archive） |
| T009 | test: rewrite browser_label config/UI tests (partial) | done | — | main | commit `e97d451`；config_ui + settings_ui 重写 |
| T010 | test: rewrite agent_bridge_client/server tests for label routing | backlog | — | — | ~1700 行测试重写；保留 describe.skip |
