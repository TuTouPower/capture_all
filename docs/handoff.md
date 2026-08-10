# 项目交接记录

项目级交接放这里，不设 task 内交接。

本文件只保留**最新一节**（当前有效状态）；过时段落迁 `docs/archive/handoff.md`（只追加，不改写）。接手者先读本文件最新节，再按需下钻 task 或 archive。

每段交接使用以下格式：

```markdown
## YYYY-MM-DD HH:MM UTC+8 from_owner → to_owner

- 当前焦点：{task ID 或议题}
- branch：`{branch；无则写"无"}`
- head_commit：`{已存在的 commit SHA；无则写"无"}`
- 已完成：{列点}
- 未完成：{列点}
- 陷阱：{已知坑或反直觉处}
- 下一步：{接手者首要行动}
```

---

## 2026-08-10 23:40 UTC+8 — 仓库工作流对齐 repo_template（已提交）

- branch：`main`
- head_commit：`ea0ff5c`（`chore: align repo with repo_template (toolchain + workflow + docs)`，374 文件）
- 已完成：
  - 工具链：`scripts/repo_template/`（task.py + repo_task/ + pending/findings/spikes/repo_state）、`tests/repo_template/`（356 用例全绿；新增目录级 `package.json {"type":"commonjs"}` 适配 ESM 项目）、`docs/tasks/task_template/`、`docs/reviews/prompts/`、`docs/spikes/report_template.md`、`docs/blueprint/architecture_repo_template.md`、`.claude/hooks/merge_guard.py`
  - skills：`.agents/skills/` 13 个 + `.claude/skills/` 软链；`repo-template-sync/sync_state.json` 已 init（源 `/home/karon/karson_ubuntu/repo_template`，基线 21fa990a）
  - 工作流文档：AGENTS.md 按模板重写（保留项目硬约束）；CLAUDE.md 改软链；`.claude/settings.json` 合并 PreToolUse merge_guard + 保留 SessionStart Bridge hook；`.gitignore` 合并
  - docs 迁移：`tasks_index.md` → `docs/archive/tasks_index_legacy.md`；`tasks_index.json` 由 task.py 派生；9 个 done spec 归档 `docs/archive/specs/`；`docs/templates/` 删除；92 个旧归档任务目录小写化（TNNN→tNNN）并补 task.md（编号复用孤儿 `t008_phase5_finalize` 移 `docs/archive/legacy_tasks/`）；`docs/pending/`、`docs/findings/`、`docs/archive/{pending,reviews,handoff.md,tasks_audit.log}` 骨架就位；`schemas/`、`config/` 空目录
  - blueprint：conventions.md 按模板补齐编号/AC/schema 约定；testing.md 新建（doctor/test/blackbox）；decisions.md 追加 ADR 019
- 未完成：无（迁移、审阅修复、AGENTS 对齐均已提交）
- 陷阱：
  - `tests/repo_template/package.json` 是消费定制（ESM 项目需要 CJS 作用域），repo-template-sync 硬同步会视为多余文件，同步时须 keep_consumer
  - `.agents/skills/repo-template-sync/sync_state.json` 必须入库（模板 gitignore 的忽略规则不适用消费项目，已在 .gitignore 注明）
  - 旧任务体系编号 TNNN 曾复用（t008 两次），新体系 tid 全局唯一
- 下一步：用户审阅迁移 diff；确认后单次 commit（`chore: align repo with repo_template`）；后续需求走 `/task-create` → `/task-schedule` → `/task-run`
