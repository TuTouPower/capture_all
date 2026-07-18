# Task plan — T001 align_repo_layout

## 步骤与验证

1. 建目录骨架与复制 templates → 验证：`docs/templates/{task,review,spike}/*` 存在
2. 拷 `op_blueprint/{architecture,domain,conventions}.md` 到 `docs/blueprint/`；写 `decisions.md` → 验证：`docs/blueprint/` 含 4 文件
3. 写 `docs/tasks/index.md`、`docs/handoff.md`、`docs/{reviews,spikes}/.gitkeep` → 验证：文件存在
4. `git mv` 4 个根 `docs/*.md` + `docs/stora/store_publish_list.md` 到 `docs/guides/`；`cp op_blueprint/test.md docs/guides/test.md` → 验证：`docs/guides/` 含 6 文件
5. `git mv docs/specs/network_capture_split.md docs/archive/`；`rmdir docs/specs`
6. `git mv docs/omni_powers docs/archive/omni_powers`；写 `_ARCHIVED.md`；`rmdir docs/stora` → 验证：`docs/` 顶层无 `specs/`、`stora/`、`omni_powers/`
7. 重写 `AGENTS.md`；`rm CLAUDE.md` + `ln -s AGENTS.md CLAUDE.md` → 验证：`head -3 CLAUDE.md` 通过软链可读
8. 修 `README.md` / `README.en.md` / `docs/guides/contributing_dev.md` / `tests/export_large_fix.test.ts` 中失效链接 → 验证：`grep -rE 'docs/(mcp_usage|troubleshooting|deployment|contributing_dev|stora|specs/|omni_powers)' README* PRIVACY.md SECURITY.md CONTRIBUTING.md` 无输出
9. 跑 `npm test` 与 `npm run build` → 验证：两者均全绿
10. 建 `task_t001_align_repo_layout` 分支；commit `docs: align agent docs layout with repo_template`

## 风险与回退

- 风险：`npm test` 中 `public_docs.test.ts` 校验 README/PRIVACY/SECURITY 的本地链接，迁移后链接失效会红。
- 缓解：步骤 8 显式扫描所有根文档与代码，逐个改链接；测试失败即停。
- 风险：`CLAUDE.md` 软链在 Windows 宿主打开失败。
- 缓解：`ln -s` 在 WSL 下生效，git 识别为 symlink mode；读 `head -3 CLAUDE.md` 已验证可读。
- 风险：`.claude/settings.json` omni hooks 归档后失效（`$OP_HOME/hooks/run-hook.cmd` 找不到）。
- 缓解：Phase 0 不动 settings.json；hooks 失败不致命；Phase 5 收口时清理。
- 回退：`git reset --hard main` 后删 `task_t001_align_repo_layout` 分支。

## Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：已记 D1-D8 决策（重构方向、shared 扁平、源码同 commit、_locales 位置、token、DB v3）。
- `docs/blueprint/architecture.md`：暂保留现状描述；Phase 3 源码搬家后更新为三产品结构。
