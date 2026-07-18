# ARCHIVED — omni_powers heavy 工作流

- 原路径：`docs/omni_powers/`
- 归档时间：2026-07-19
- 归档原因：项目切换到 `repo_template` 的四态 task 工作流（见 `AGENTS.md` 与 `docs/blueprint/decisions.md` §001）。omni_powers heavy 工作流（merge gate / authorize / leader_checkpoint / `/opintake` / `/oprun` / `/opstatus` / `/optriage`）不再作为活动流程。

## 内容处置

| 子树 | 处置 |
|------|------|
| `op_blueprint/architecture.md` `domain.md` `conventions.md` | 已复制到 `docs/blueprint/`（架构 / 领域 / 约定的稳定部分成为当前 blueprint 真相源） |
| `op_blueprint/decisions.md`（无） | 当前项目决策已写入 `docs/blueprint/decisions.md` |
| `op_blueprint/prd.md` `test.md` `spec_index.md` `specs/*` `baselines/*` | 仅作历史参考；按需提炼到 `docs/guides/` 或 `docs/blueprint/`，但**不**恢复为活动入口 |
| `op_execution/**` `op_record/**` | 历史执行记录与归档；活动索引改由 `docs/tasks/index.md` + `docs/handoff.md` |

## 不变量保留

归档不削弱以下约束（继续在 `docs/blueprint/decisions.md` 与 `domain.md` 中生效）：

- Bridge 仅绑定 `127.0.0.1`，token 优先级 `CLI > env > persisted file > generated`
- instance_token 不得访问 MCP / CDP
- `capture_all_db` v3 schema 与历史数据兼容
- 禁用 `taskkill /F /IM chrome.exe` 等破坏性操作

## 活动引用清理

- 项目 `AGENTS.md`：不再引用 `docs/omni_powers/**`
- `CLAUDE.md`：改为指向 `AGENTS.md` 的软链
- `.claude/settings.json`：含 omni hooks（`$OP_HOME/hooks/run-hook.cmd`）与 `env.OP_DOCS_DIR` 等遗留配置；按重构计划 Phase 5 收口时清理。归档后 omni hooks 会失败但不致命。
