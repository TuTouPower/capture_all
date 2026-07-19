# 决策记录（ADR）

只记录已经确认、影响后续工作的非显然决策。追加新条目，不重写历史；决策被替代时，新条目通过"替代"字段引用旧编号。

条目格式：

```markdown
## NNN 标题（YYYY-MM-DD）

- 背景：为什么需要决策
- 选项：考虑过什么
- 结论：选了什么，为什么
- 替代：旧决策编号；无则写"无"
```

---

## 001 文档与工作流对齐 repo_template（2026-07-19）

- 背景：原使用 omni_powers heavy 工作流（merge gate / authorize / leader_checkpoint），活动入口分散在 `docs/omni_powers/**`，对齐 `repo_template` 后 agent 入口统一为 `AGENTS.md` + 四态 task 生命周期。
- 选项：A）保留 omni heavy 作为活动流程；B）切换为 template 四态 task 流程。
- 结论：选 B。omni_powers 整树归档到 `docs/archive/omni_powers/`；活动流程仅 `backlog` / `active` / `done` / `dropped` 四态。
- 替代：无

## 002 源码按三产品划分（2026-07-19）

- 背景：当前 `src/{background,content,popup,dashboard,devtools}` + `src/agent/{bridge,mcp,shared}` + `src/shared` 扁平堆叠，产品边界模糊。
- 选项：A）保留现状；B）按 monorepo `apps/*` + `packages/*`；C）在 `src/` 下按 `extension` / `bridge` / `mcp` 三产品划分 + 扁平 `src/shared`。
- 结论：选 C。明确扩展 / Bridge / MCP 三产品边界；跨产品共用放扁平 `src/shared/`（不强制再拆 `kernel/protocol/domain` 子层）；仅扩展专用进 `src/extension/shared/`。详见 `docs/refactor_plan.md`。
- 替代：无

## 003 shared 扁平化（2026-07-19）

- 背景：早期草案将 `src/shared` 拆为 `kernel/protocol/domain` 三个子包，且把现有 `src/shared/*` 笼统迁到 `src/extension/shared/`，过重且与实际依赖关系不符。
- 选项：A）三分 `kernel/protocol/domain`；B）扁平 `src/shared/` 仅按"是否扩展专用"做二分。
- 结论：选 B。规则：无 Chrome 扩展 surface 专属依赖、可被 bridge/mcp 或纯逻辑复用 → `src/shared/`；仅扩展会用 → `src/extension/shared/`。文件归属表见 `docs/refactor_plan.md` §4.3。
- 替代：无

## 004 源码搬家与测试 import 同 commit（2026-07-19）

- 背景：Phase 3 源码搬家若先迁源码、留下测试大面积红等 Phase 4 再修，中间窗口期无法验证。
- 选项：A）源码搬家与测试重组分离两 Phase；B）每个子 commit 内路径变更与受影响 `tests/**` 的 import 一起改完。
- 结论：选 B。Phase 3 各子 commit 必须 `npm test` 绿；Phase 4 只做测试目录分层。
- 替代：无

## 005 `_locales` 与 manifest 源码入 `src/extension/`（2026-07-19）

- 背景：MV3 打包时 `_locales/` 与 `manifest.json` 必须在扩展根。源码放仓库根还是 `src/extension/` 决定 vite/crx 配置形态。
- 选项：A）源码留根目录；B）源码迁 `src/extension/_locales/` 与 `src/extension/manifest.json`，构建时复制到 `artifacts/dist/`。
- 结论：选 B。避免"源码在 extension、清单却在根"双真相；构建产物路径不变（`artifacts/dist/_locales/`、`artifacts/dist/manifest.json`）。
- 替代：无

## 006 Bridge 仅绑定 127.0.0.1，token 优先级 CLI > env > persisted > generated（2026-07-19）

- 背景：本地 Agent 基础设施安全模型。
- 选项：A）允许配置外部地址；B）强制 `127.0.0.1`，token 多源降级。
- 结论：选 B。Bridge 仅绑定 `127.0.0.1`；token 优先级 `CLI > env > persisted file > generated`；生成文件 mode `0600`。instance_token 不得访问 MCP / CDP。详见 `op_blueprint/specs/agent_mcp.md`（已归档至 `docs/archive/omni_powers/op_blueprint/specs/agent_mcp.md`）。
- 替代：无

## 007 IndexedDB `capture_all_db` v3（2026-07-19）

- 背景：采集数据持久化 schema。
- 选项：A）schema 可自由变更；B）版本化升级，保留历史数据兼容。
- 结论：选 B。`DB_VERSION = 3`，10 stores；升级路径不得丢 records。详见 `op_blueprint/specs/storage_indexeddb.md`（已归档）。
- 替代：无

## 008 多实例路由：browser_label + instance_id（2026-07-19）

- 背景：原 `browser_no`（1-99 数字）路由让人填编号、不直观；机器 ID（instance_id）已存在但只作次要路由键。
- 选项：A）保留 browser_no；B）取消 browser_no，改用 browser_label（人填备注）+ instance_id（机器生成）双键路由。
- 结论：选 B。条件强制 label：单实例零配置（默认路由）；多实例时若存在匿名实例，Bridge 在响应里加 warning，AI 调用未 specify target 时返回 `TARGET_AMBIGUOUS`。同 label enroll 顶替旧实例（防堆积，扩展重启路径）。MCP 工具参数 `target_instance_id` + `target_label`；二者都给时 `target_instance_id` 优先。详见 T008。
- 替代：无
