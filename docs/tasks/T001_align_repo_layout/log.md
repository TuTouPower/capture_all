# Task log — T001 align_repo_layout

只记录有追溯价值的进展、踩坑、中途决策、偏离 plan 原因和关键验证结果；不写命令流水账。

## 记录

### 2026-07-19 Phase 0 执行

- 文档骨架与模板复制完成；`docs/{templates,tasks,reviews,spikes,blueprint,guides}` 建好。
- blueprint：`architecture` / `domain` / `conventions` 直接从 `op_blueprint` 拷贝（保留现状描述），`decisions` 新建记 D1-D8。
- guides 迁入：`deployment` / `mcp_usage` / `troubleshooting` / `contributing_dev` / `store_publish_list`（自 `docs/stora/`）；`op_blueprint/test.md` 拷一份到 `docs/guides/test.md`（保留人读测试指南，README 链接指向此处）。
- 归档：`docs/omni_powers` 整树 → `docs/archive/omni_powers/`（含 `_ARCHIVED.md` 注明原路径与归档原因）；`docs/specs/network_capture_split.md` → `docs/archive/`。空目录 `docs/specs/` 与 `docs/stora/` 删除。
- `AGENTS.md` 按 template 格式 + capture_all 实情重写；`CLAUDE.md` 改为软链（git 识别 T 类型）。

### 中途决策

- **blueprint/architecture 写现状，不写目标**：template "实施和 review 期间不把未稳定状态写成长期真相"。目标结构（`src/{extension,bridge,mcp,shared}` 三产品）记在 `decisions.md §002`；Phase 3 源码搬家后 finalization 再改 architecture.md。
- **`.claude/settings.json` omni hooks 不动**：高风险配置；归档 omni_powers 后 hooks 会失败但不致命。Phase 5 收口时清理 `OP_HOME` 相关 hooks 与 `env`。
- **`docs/guides/test.md` 拷贝（非移动）**：归档保留原版完整性；guides 提供活动人读版；Phase 5 决定是否清理重复。
- **scanner 红归 Phase 1 处理**：D5 决策 `docs/archive` 入库，与 scanner `forbidden_paths` 冲突；Phase 1 / 5 时考虑调整 scanner 规则。

### 关键验证

- `npm test`：90 文件 / 1079 测试全绿。中途 `public_docs.test.ts` 曾因 README 链接失效失败一次，修链接后绿。
- `npm run build`：tsc + vite + bridge + mcp + zip 全绿。
- `npm run scan:tracked-tree`：251 finding，主要是 `docs/archive/**` forbidden-path（D5 已接受入库与 scanner 默认规则的冲突，待后续 Phase 调整）。
- `git status`：153 文件（131 rename + 16 add + 5 modify + 1 type-change）；rename 检测正常。
