# Task spec — T001 align_repo_layout

## 背景

仓库需要对齐 `/home/karon/karson_ubuntu/repo_template` 的 agent 入口与文档工作流；当前活动入口分散在 `docs/omni_powers/**`（heavy 工作流），与 template 的四态 task 生命周期不一致。完整重构计划见 `docs/refactor_plan.md`。

本 task 是该计划的 Phase 0：仅做文档骨架与 agent 入口对齐，不动源码与测试。

## 范围

- 新建 `docs/{templates,tasks,reviews,spikes,blueprint,guides}` 目录骨架与 `.gitkeep` 占位。
- 从 `repo_template/docs/templates/` 复制 task / review / spike 模板。
- 新建 `docs/tasks/index.md`（含 T001 登记）、`docs/handoff.md`。
- 新建 `docs/blueprint/{architecture,domain,conventions,decisions}.md`；前三者从 `op_blueprint/` 复制，decisions 记录已确认决策（含 src 三产品重构、shared 扁平化、token、DB v3 等）。
- 迁移人读文档到 `docs/guides/`：`deployment.md`、`mcp_usage.md`、`troubleshooting.md`、`contributing_dev.md`、`store_publish_list.md`（自 `docs/stora/`）、`test.md`（自 `op_blueprint/`）。
- 归档：`docs/omni_powers/` 整树 → `docs/archive/omni_powers/`（加 `_ARCHIVED.md`）；`docs/specs/network_capture_split.md` → `docs/archive/`；删除空目录 `docs/specs/`、`docs/stora/`。
- 重写 `AGENTS.md` 按 template 格式 + capture_all 实情。
- `CLAUDE.md` 改为指向 `AGENTS.md` 的软链。
- 修 `README.md` / `README.en.md` / `docs/guides/contributing_dev.md` / `tests/export_large_fix.test.ts` 中指向被迁移路径的链接。

## 非范围

- Phase 1 行为护栏（manifest/构建产物 smoke、scanner 全绿）。
- Phase 2-3 源码搬家（`src/agent/{bridge,mcp,shared}` 与 `src/{background,content,...}` 重构）。
- Phase 4 测试树重组。
- Phase 5 收口（`.claude/settings.json` omni hooks 清理、scanner forbidden_paths 调整）。

## 验收标准

- [x] `AGENTS.md` 重写完成；`CLAUDE.md` 为软链。
- [x] `docs/` 顶层为 `archive/ blueprint/ guides/ tasks/ templates/ reviews/ spikes/ handoff.md`（及活动 `refactor_plan.md`），无残留 `specs/`、`stora/`、`omni_powers/`。
- [x] `docs/tasks/T001_align_repo_layout/` 含 `spec.md`、`plan.md`、`log.md`。
- [x] `npm test` 全绿（90 文件 / 1079 测试）。
- [x] `npm run build` 全绿（dist + bridge.mjs + mcp.mjs + extension.zip）。
- [ ] `npm run scan:tracked-tree`（Phase 1 前不强制；归档入库会触发 forbidden-path，待 Phase 5 处理）。

## 依赖与约束

- 不可破坏：`artifacts/dist` 产物布局、`capture_all_db` v3 schema、Bridge 127.0.0.1 绑定、token 模型。
- 不夹带用户本地 `.claude/settings.json`（用户级）入 diff；项目级 `.claude/settings.json` 的 omni hooks 留 Phase 5 处理。
