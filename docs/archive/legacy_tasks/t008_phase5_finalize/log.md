# Task log — T008 phase5_finalize

## 记录

### 2026-07-19 Phase 5 部分收口

- 归档 T003/T004/T005 到 `docs/archive/tasks/`。
- `docs/blueprint/architecture.md` §3 目录结构重写：
  - `src/extension/{background,content,popup,dashboard,devtools,shared}/` + `manifest.json` + `_locales/`
  - `src/bridge/`、`src/mcp/`、扁平 `src/shared/`
  - 标注 §4.3 表里 10 个待 T006 下沉的扩展专用文件
  - 附依赖方向图（`extension/bridge/mcp ──► src/shared`，相互 ✗）
- `scripts/scan_tracked_tree.mjs`：从 `forbidden_paths` 移除 `'docs/archive/'`；加注释引用 D5 决策。
- `.claude/settings.json`：保留 SessionStart bridge 拉起；移除 omni hooks（PreToolUse / PostToolUse / SubagentStop / Stop）与 omni env（OP_DOCS_DIR / OP_*_MODEL）；更新 `_comment`。

### 中途决策

- **`.claude/` 仍保留在 scanner `forbidden_paths`**：`.claude/settings.json` 是项目级配置已入库（pre-existing），scanner 仍报该 finding；不阻塞，因 scanner 不是 commit hook。修复需把规则精确到 `.claude/settings.local.json` 等用户级文件，不在本 task 范围。
- **scanner 其他 pre-existing finding 不动**：`docs/refactor_plan.md` 的 `/home/karon/...`、文档示例 token、测试 mock token、`src/bridge/server.ts:301` 等都是 pre-existing，非本次回归。
- **T006 与 T007 留 backlog**：T006（剩余 10 个扩展专用 shared 下沉）需要精确区分 `../../shared/X` 中 X 是否属于扩展专用，工作量大但不阻塞功能。T007（Phase 4 测试树重组）是质量优化。两者标 backlog，不在本 session 完成。

### 关键验证

- `node -e JSON.parse`：settings.json 有效 JSON。
- `npm test`：90 文件 / 1079 测试全绿。
- `npm run build`：bridge.mjs + mcp.mjs + dist 含 `_locales/`。
- `npm run scan:tracked-tree`：archive forbidden-path 全部消除；剩余 finding 为 pre-existing。

### 完结

- 范围内全部完成。
- 重构核心目标（源码三产品 + 入口对齐 + 文档 template 化 + 工作流切换）已达成。
- 剩余 backlog：T006（剩余 shared 下沉）、T007（测试树重组）。
