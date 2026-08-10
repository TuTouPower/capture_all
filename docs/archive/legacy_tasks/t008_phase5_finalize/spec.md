# Task spec — T008 phase5_finalize

## 背景

`docs/refactor_plan.md` Phase 5（收口）：活动文档 / CI / scanner 只引用新路径；blueprint 与 decisions.md 与代码一致；omni_powers 活动引用清理。

Phase 4（测试树重组）与 §4.3 表剩余扩展专用 shared 下沉（T006）不阻塞核心目标，留作后续 task。

## 范围

- 归档 T003 / T004 / T005 task 目录到 `docs/archive/tasks/`。
- 更新 `docs/blueprint/architecture.md` §3 目录结构：反映 `src/{extension,bridge,mcp,shared}` 三产品 + 扁平 shared；附依赖方向图。
- `scripts/scan_tracked_tree.mjs`：移除 `docs/archive/` from `forbidden_paths`（D5 决策允许 archive 入库）。
- `.claude/settings.json`：保留 SessionStart 自动拉起 Bridge；移除 omni heavy 工作流 hooks（PreToolUse / PostToolUse / SubagentStop / Stop 的 `$OP_HOME/hooks/run-hook.cmd`）与 omni env（OP_DOCS_DIR / OP_*_MODEL）。

## 非范围

- T006 剩余扩展专用 shared 下沉（10 文件，留 backlog）。
- T007 Phase 4 测试树重组（留 backlog）。

## 验收标准

- [x] T003/T004/T005 task 目录在 `docs/archive/tasks/`；`docs/tasks/` 仅留 index.md + backlog task
- [x] `docs/blueprint/architecture.md` §3 反映三产品结构
- [x] `npm run scan:tracked-tree` 不再因 `docs/archive/` 报 forbidden-path
- [x] `.claude/settings.json` 仅含 SessionStart hook，JSON 有效
- [x] `npm test` 全绿
- [x] `npm run build` 全绿
