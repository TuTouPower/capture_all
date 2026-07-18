# 项目交接记录

项目级交接放这里，不设 task 内交接。

追加式记录：交接者只新增段落，不删除或改写历史。接手者先读本文件，再按需下钻 task。

每段交接使用以下格式（以下为格式模板，不是真实记录）：

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

## 2026-07-19 07:30 UTC+8 — repo layout refactor 进度交接

- 当前焦点：仓库布局按 `docs/refactor_plan.md` 对齐 `repo_template`（三产品 src + 文档 template 化）
- branch：`task_t002_shared_protocol_relocate`（基于 `task_t001_align_repo_layout`，链式）
- head_commit：`0cfc760 chore: finalize repo layout refactor (Phase 5 partial)`
- 已完成：
  - **Phase 0 (T001)** `3a34685`：`AGENTS.md` 重写 + `CLAUDE.md` 软链 + `docs/{templates,tasks,reviews,spikes,blueprint,guides,handoff}.md` 骨架；omni_powers 整树归档；`docs/specs/` `docs/stora/` 删除
  - **Phase 2 (T002)** `5c21a50`：`src/agent/shared/protocol.ts` → `src/shared/protocol.ts`；10 处 import 同步
  - **Phase 3a (T003)** `e2a7f86`：`src/agent/bridge/` → `src/bridge/`
  - **Phase 3b (T004)** `0be0262`：`src/agent/mcp/` → `src/mcp/`；`src/agent/` 已删
  - **Phase 3c (T005)** `cc399a4`：5 个 surfaces + `manifest.json` + `_locales/` 搬到 `src/extension/`；`capture_data_reader` 紧急下沉到 `src/extension/shared/`；新增 `scripts/copy_locales.mjs` + `npm run copy:locales`（crxjs 不自动从 `src/extension/_locales/` 复制到 dist）
  - **Phase 5 部分 (T008)** `0cfc760`：blueprint/architecture 更新三产品结构；scanner 移除 `docs/archive/` from forbidden_paths；`.claude/settings.json` 清理 omni hooks 与 env（保留 SessionStart 拉 bridge）
- 未完成：
  - **T006 backlog**：§4.3 表剩余 10 个扩展专用 shared 文件下沉到 `src/extension/shared/`（i18n / theme / design_tokens.css / chrome.d.ts / export_utils / export_settings / archive_builder / capture_stats / poll_capture_status / dom_utils）。需精确区分 `../../shared/X` 中 X 是否属于扩展专用。不阻塞功能。
  - **T007 backlog (Phase 4)**：测试树重组到 `tests/{unit,integration,e2e,support}`。质量优化，不影响功能。
  - **合并 main**：`task_t001_align_repo_layout` + `task_t002_shared_protocol_relocate` 两分支链式，待整体 merge main。
- 陷阱：
  - **scanner 仍报 `.claude/settings.json` forbidden-path**：`.claude/` 在 scanner `forbidden_paths`，但项目级 settings.json 已入库是合理的；精确规则（如改报 `.claude/settings.local.json`）不在 T008 范围。
  - **scanner 其他 pre-existing finding**：`docs/refactor_plan.md` 的 `/home/karon/...` 引用、文档示例 token、测试 mock token、`src/bridge/server.ts:301` 等都是 pre-existing，非本次回归。
  - **`docs/tasks/T005_extension_relocate/plan.md` 与 `spec.md` 被 sed 字面污染**：批量 sed 替换 `src/{surface}/` 时把 plan/spec 里命令示例的字面字符串也替换了。实际执行以 commit diff 与 log 为准。
  - **测试硬编码路径**：`tests/manifest_permissions.test.ts` / `tests/public_docs.test.ts` / `tests/content_script_uses_poll.test.ts` / `tests/entry_unification.test.ts` 已在 T005 修复；后续移动源码路径时要再扫一遍这四个文件的硬编码。
- 下一步：
  1. 决定是否 merge `task_t001_align_repo_layout` 与 `task_t002_shared_protocol_relocate` 到 main（建议先 merge task_t001 到 main，再 rebase task_t002 到 main，最后 merge task_t002）。
  2. T006 / T007 作为独立 task 接力，不必阻塞 main merge。
  3. 后续若有新 task，按 `AGENTS.md` 四态流程；活动 task 在 `docs/tasks/`，完结归档到 `docs/archive/tasks/`。
