# Capture All 重构计划

对照模板：`/home/karon/karson_ubuntu/repo_template`  
状态：已确认方向，待按阶段执行  
更新：2026-07-19（修订：docs 遗留路径；扁平 shared；Phase3/4 与测试 import；`_locales` 位置）

## 1. 目标

把本仓对齐 `repo_template` 的 **agent 入口、文档工作流、顶层目录与测试分层**；源码在模板的 `src/` 边界内按 **三产品** 划分，并明确 **跨产品共享** 边界。

**做完后应具备：**

1. 唯一 agent 入口 `AGENTS.md`（`CLAUDE.md` 为其软链）。
2. 文档树为 template 形态：`blueprint` / `guides` / `templates` / `tasks` / `reviews` / `spikes` / `handoff` / `archive`。
3. 源码为 `src/{extension,bridge,mcp}` + 扁平 `src/shared`；仅扩展专用再进 `src/extension/shared`。
4. 测试为 `tests/{unit,integration,e2e}`（及必要 support）。
5. 行为不变量保留：产物路径、IndexedDB 兼容、Bridge/MCP 安全约定。

**明确不做：**

- 不为「像 monorepo」先上 `apps/*` / `packages/*` workspace。
- 不为 shared 强行再拆 `kernel/protocol/domain` 子包目录（需要时再加，不是本轮默认）。
- 不改采集语义、DB schema、token 安全模型。
- 不把 omni_powers heavy 工作流继续当作活动入口。
- 不批量改写历史 acceptance 正文（只搬家/加注）。

## 2. 已确认决策

| # | 决策 |
|---|------|
| D1 | 文档与工作流对齐 `repo_template`。 |
| D2 | 源码产品划分：`src/extension/`、`src/bridge/`、`src/mcp/`。 |
| D3 | **默认用扁平 `src/shared/`** 放跨产品与无 Chrome UI 依赖的共用代码；**仅**扩展专用模块进 `src/extension/shared/`。 |
| D4 | 先不抽 npm workspace packages；用目录 + import 规则 +（可选）路径别名。 |
| D5 | `docs/archive` 入库（ignore 已取消）。 |
| D6 | 测试按 template 分为 unit / integration / e2e。 |
| D7 | **源码搬家与对应测试 import 同 Phase、同子 commit 更新**；Phase 4 只做测试目录分层，不再修因搬家产生的断 import。 |
| D8 | **`_locales/` 与 `manifest.json` 源码均放 `src/extension/`**；构建仍输出到 `artifacts/dist/_locales/`（扩展根）。 |

## 3. 目标目录

```text
capture_all/
├── AGENTS.md
├── CLAUDE.md -> AGENTS.md
├── README.md
├── README.en.md
├── PRIVACY.md / SECURITY.md / …   # 对外合规，保留根目录
├── package.json
├── docs/
│   ├── blueprint/                 # architecture domain conventions decisions
│   ├── guides/                    # 人读指南（部署 / MCP / 排障 / 商店发布 / 贡献 …）
│   ├── templates/                 # 从 repo_template 复制
│   ├── tasks/
│   │   ├── index.md
│   │   └── TNNN_slug/             # spec.md plan.md log.md [reviews/]
│   ├── reviews/
│   ├── spikes/
│   ├── handoff.md
│   └── archive/
│       ├── tasks/
│       ├── reviews/
│       └── spikes/
├── src/
│   ├── extension/
│   │   ├── manifest.json          # 扩展清单源（自根目录迁入）
│   │   ├── _locales/              # i18n 源（自根 _locales/ 迁入）
│   │   ├── background/
│   │   ├── content/
│   │   ├── popup/
│   │   ├── dashboard/
│   │   ├── devtools/
│   │   └── shared/                # 仅扩展专用（见 §4.2）
│   ├── bridge/
│   ├── mcp/
│   └── shared/                    # 扁平：跨产品 + 无产品依赖的共用模块
│       ├── protocol.ts            # 自 agent/shared 迁入
│       ├── constants.ts
│       ├── types.ts
│       ├── redaction.ts
│       ├── logger.ts
│       └── …                      # 见 §4.3 文件表
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── support/                   # fixtures / mocks / helpers
├── scripts/
├── assets/
├── artifacts/                     # 不入库
├── data/                          # 不入库
└── .scratch/                      # 不入库
```

活动文档 **不再** 依赖 `docs/omni_powers/**` 作为入口；该树迁入 `docs/archive/` 后可删活动引用。

活动树 **不保留** 顶层 `docs/specs/`、`docs/stora/`（处置见 §5.3）。

## 4. 源码边界

### 4.1 依赖方向

```text
extension ──► src/shared
bridge    ──► src/shared
mcp       ──► src/shared

extension ──✗── bridge / mcp
bridge    ──✗── extension / mcp
mcp       ──✗── extension / bridge（实现层；运行时只走 HTTP）
src/shared ──✗── 任何产品目录（含 extension/shared）
```

- Bridge / MCP 禁止 import `src/extension/**`。
- MCP 不直接依赖 Bridge 源码，只依赖 `src/shared` 中的协议/类型 + HTTP。
- `src/shared` 允许被三端 import；**不要求** 每个文件都被三端使用——只要它无产品依赖、且不是「仅扩展 UI/Chrome API 拼装」，即可留在 `src/shared`。

### 4.2 为什么直接用 `src/shared`（不默认再拆子层）

先前草案写了 `shared/{kernel,protocol,domain}`，又把大量现有 `src/shared/*` 笼统说成塞进 `extension/shared`——**过重且不准**。

**更简单的规则：**

1. **默认留在 / 放进扁平 `src/shared/`**  
   无 Chrome 扩展 surface 专属依赖、可被 bridge/mcp 或纯逻辑复用的模块。  
   包括：线协议、常量、类型、脱敏纯函数、logger、时间、id/hash/escape 等。

2. **仅当「只有 extension 会用」时** 才进 `src/extension/shared/`  
   例如 i18n/theme/CSS tokens、chrome 类型增强、export/archive 拼装、读库/轮询 UI 辅助、DOM xpath 等。

3. **不按「是否已被 bridge import」一刀切**  
   某文件目前只有 extension 引用，但本质是领域纯逻辑（如 `types.ts`），仍放 `src/shared`，避免以后 bridge 要用时再搬家。

4. **不做强制子目录**  
   `protocol.ts` 就是 `src/shared/protocol.ts`；除非文件暴增，再考虑分子夹。

**现状实测（bridge/mcp 对 shared 的引用）：**

| 调用方 | 模块 |
|--------|------|
| bridge / mcp | `src/agent/shared/protocol`（迁入后 `src/shared/protocol.ts`） |
| bridge `cdp_handler` | `src/shared/constants`、`src/shared/redaction` |
| mcp | 目前不直接 import `src/shared/*`，只走 protocol |

因此 **绝不能** 把 `constants` / `redaction` / protocol 放进 `extension/shared`。

### 4.3 现有 `src/shared/*` 文件处置（初表）

按 §4.2 规则划分；迁移时若某文件实际依赖 `chrome.*` / DOM，再下调到 `extension/shared`。

| 文件 | 目标 | 说明 |
|------|------|------|
| （自 `agent/shared`）`protocol.ts` | `src/shared/protocol.ts` | 三端线协议 |
| `constants.ts` | `src/shared/` | bridge 已用 `MAX_BODY_CAPTURE_BYTES` |
| `redaction.ts` | `src/shared/` | bridge CDP 已用 |
| `types.ts` | `src/shared/` | 领域类型，跨端契约基础 |
| `logger.ts` | `src/shared/` | 通用日志 |
| `system_time.ts` | `src/shared/` | 纯时间格式 |
| `escape.ts` / `hash.ts` / `id.ts` | `src/shared/` | 纯工具 |
| `event_category.ts` / `event_utils.ts` | `src/shared/` | 事件元数据纯逻辑（无 surface 绑定） |
| `body_routing.ts` | `src/shared/` | 路由规则纯逻辑（若无 chrome 依赖） |
| `user_config.ts` | `src/shared/` 或 `extension/shared` | **迁移时判定**：若只封装 `chrome.storage` 则 extension；若配置 shape + 默认可共享则 shared |
| `agent_bridge_config.ts` | `src/shared/` 或 `extension/shared` | **迁移时判定**：纯 normalize/类型 → shared；强绑扩展 UI → extension |
| `i18n.ts` / `theme.ts` / `design_tokens.css` | `src/extension/shared/` | 扩展 UI 专用 |
| `chrome.d.ts` | `src/extension/shared/` 或 extension 根类型入口 | Chrome API 增强 |
| `export_utils.ts` / `export_settings.ts` | `src/extension/shared/` | 导出下载/文件名，扩展侧 |
| `archive_builder.ts` | `src/extension/shared/` | 归档拼装 |
| `capture_data_reader.ts` / `capture_stats.ts` | `src/extension/shared/` | 读采集快照/统计，扩展侧 |
| `poll_capture_status.ts` | `src/extension/shared/` | 扩展轮询状态 |
| `dom_utils.ts` | `src/extension/shared/` | DOM/xpath，content 用 |

### 4.4 产品路径映射

| 现状 | 目标 |
|------|------|
| `src/agent/shared/protocol.ts` | `src/shared/protocol.ts` |
| `src/shared/*` | 按 §4.3：多数留 `src/shared/`，扩展专用迁 `src/extension/shared/` |
| `src/{background,content,popup,dashboard,devtools}` | `src/extension/...` |
| `src/agent/bridge/*` | `src/bridge/` |
| `src/agent/mcp/*` | `src/mcp/` |
| 根 `manifest.json` | `src/extension/manifest.json` |
| 根 `_locales/` | `src/extension/_locales/` |

### 4.5 `_locales/` 与 manifest（已定）

| 项 | 决定 |
|----|------|
| 源码位置 | `src/extension/_locales/`、`src/extension/manifest.json` |
| 产物位置 | 不变：`artifacts/dist/_locales/`、`artifacts/dist/manifest.json`（MV3 扩展根） |
| 构建 | `vite.config` 的 `@crxjs/vite-plugin` 改为 `import manifest from './src/extension/manifest.json'`（或等价路径）；manifest 内脚本/HTML 路径改为 `src/extension/...` |
| 为何不放在仓库根 | 三产品下扩展打包输入与 `src/extension` 同树，避免「源码在 extension、清单却在根」双真相；根目录只保留编排用 `package.json` / 配置 |
| 迁移注意 | 一次性改：manifest 路径、vite input、任何文档/测试里写死的 `manifest.json` / `_locales` 根路径；build 后检查 dist 含 `_locales/en`、`_locales/zh_CN` |

### 4.6 构建与别名

- Extension：继续 Vite / `@crxjs`；manifest 与入口路径按 §4.5 一次改齐。
- Bridge / MCP：继续 esbuild → `artifacts/bridge/bridge.mjs`、`artifacts/mcp/mcp.mjs`。
- 可选 tsconfig paths：`@shared/*`、`@extension/*`。
- 边界检查：禁止 bridge/mcp → `src/extension/**`；禁止 `src/shared` → 产品目录。

## 5. 文档与工作流

### 5.1 入口

| 文件 | 动作 |
|------|------|
| `AGENTS.md` | 按 template 重写：按需阅读表、目录写入规则、task 生命周期、review / handoff / spike、项目硬约束 |
| `CLAUDE.md` | 改为指向 `AGENTS.md` 的软链，删除双源正文 |
| `docs/templates/` | 从 `repo_template` 复制 task / review / spike 模板 |
| `docs/tasks/index.md` | 新建；状态仅 `backlog` / `active` / `done` / `dropped` |
| `docs/handoff.md` | 新建；项目级交接，只追加 |

### 5.2 blueprint / guides

| 现状（参考） | 目标 |
|--------------|------|
| `docs/omni_powers/op_blueprint/architecture.md` | `docs/blueprint/architecture.md`（目录改为三产品 + shared） |
| `…/domain.md` | `docs/blueprint/domain.md` |
| `…/conventions.md` | 与 template conventions **合并** 为 `docs/blueprint/conventions.md` |
| （无独立 decisions） | `docs/blueprint/decisions.md`（记 shared 扁平策略、token、DB v3 等） |
| `docs/deployment.md`、`mcp_usage.md`、`troubleshooting.md`、`contributing_dev.md` 等 | `docs/guides/` |
| `op_blueprint/prd.md`、`op_blueprint/specs/*`、`test.md` | 人读 → `docs/guides/`；长期约束 → blueprint / decisions |

### 5.3 现有遗留目录处置（显式）

| 现状路径 | 内容 | 处置 | 目标路径 |
|----------|------|------|----------|
| `docs/specs/network_capture_split.md` | 历史「拆 network_capture」实施计划（已完成类） | **归档** | `docs/archive/specs/network_capture_split.md`（或 `archive/tasks/` 下附注） |
| `docs/specs/`（空目录） | — | **删除** | — |
| `docs/stora/store_publish_list.md` | Edge 商店发布清单（人读操作指南） | **并入 guides** | `docs/guides/store_publish_list.md`（目录名 typo `stora` 一并消灭） |
| `docs/stora/`（空目录） | — | **删除** | — |
| `docs/omni_powers/**` | 旧工作流与 blueprint/execution/record | **归档后断活动引用** | `docs/archive/omni_powers/…` 或拆入 archive/tasks|… |
| 根下人读 `docs/*.md`（deployment 等） | 见 §5.2 | **→ guides** | `docs/guides/` |

Phase 0 验收：活动 `docs/` 下 **不再存在** 未说明的 `specs/`、`stora/` 顶层目录。

### 5.4 omni_powers 与 archive

| 内容 | 处置 |
|------|------|
| `op_record/**`、历史 task / acceptance | 镜像进 `docs/archive/tasks/`（或 `archive/omni_powers/…`），加原路径备注 |
| `op_execution/specs/**` | 有用条目改写成新 `docs/tasks/TNNN_*/spec.md` 后执行；原文归档 |
| `op_execution/tasks/**`、checkpoint 类 | 归档；活动索引改由 `docs/tasks/index.md` + `handoff.md` |
| 活动 CLAUDE/AGENTS 中的 omni 必读 | 删除 |

### 5.5 工作流（template）

- specs driven：`spec.md` + `plan.md` 先行，用户审核（明确跳过则除外）。
- 开发循环：红 → 绿 → 黑盒验证 → 文档同步 → 双 subagent review → `log.md` → commit。
- 完结：adoption 落地、更新 blueprint、目录移入 `docs/archive/tasks/`、index 标 `done`。
- 状态机：仅四态；不保留 omni heavy 的 merge gate / authorize 轮次作为活动流程。

## 6. 测试

### 6.1 目标分层

| 层 | 含义 | 示例 |
|----|------|------|
| `tests/unit/` | 无浏览器/无真服务的纯逻辑 | protocol、redaction、escape |
| `tests/integration/` | 模块协作：fake IDB、Bridge 进程内、MCP schema 等 | storage 升级、bridge server、export 管道 |
| `tests/e2e/` | Playwright / 扩展真机路径 | 现有 `tests/e2e-*.spec.ts`、`e2e/T*/*` |
| `tests/support/` | fixtures、mocks、helpers | 现 `tests/fixtures`、`__mocks__`、`helpers` |

### 6.2 规则

- 按**验证对象与通道**分类，不按旧文件名机械切分。
- 迁移测试只改路径与 import，不削弱断言、不靠 skip 掩盖。
- runner 显式 `testDir` / `testMatch`；某层发现数为 0 视为失败（配置落地后）。
- 历史 TID 行为 E2E 可保留子目录名（如 `tests/e2e/T0001/`）便于追溯。

## 7. 不变量

全程必须守住：

1. `artifacts/dist` 扩展产物布局可用；zip / Bridge / MCP 构建脚本有明确入口。
2. `capture_all_db` v3 与历史数据升级兼容（不丢 records）。
3. Bridge 仅绑定 `127.0.0.1`；token 优先级 `CLI > env > persisted file > generated`；生成文件 mode `0600`。
4. instance_token 不得访问 MCP / CDP。
5. MCP 对 Extension 数据路由的 bootstrap 兼容若保留，须在 blueprint/decisions 写明；安全边界不削弱。
6. 密钥 / token 由用户提供，禁止硬编码进库。
7. 不夹带用户本地 `.claude/settings.json` 等私货进任务 diff。

## 8. 阶段与任务切片

每阶段可对应一个或多个 `docs/tasks/TNNN_*`（template 格式）。建议顺序如下。

### Phase 0 — 文档骨架与入口（无业务搬家）

- 引入 `docs/templates/`、`docs/tasks/index.md`、`docs/handoff.md`、空 `reviews/` `spikes/`。
- 重写 `AGENTS.md`；`CLAUDE.md` → 软链。
- 建 `docs/blueprint/` 初稿（可先从 op_blueprint 拷贝再改路径描述）。
- 人读文档迁入 `docs/guides/`。
- **按 §5.3** 处置 `docs/specs/`、`docs/stora/`。
- omni_powers 活动引用改为 archive 或删除必读。

**验证：** 导航可走通；无残留活动 `docs/specs`、`docs/stora`；`npm test` / `npm run build` 不因文档改动而红。

### Phase 1 — 行为护栏（可选但推荐）

- 在搬路径前固定：manifest/构建产物 smoke、关键 IDB 契约、scanner 可用。
- 若现有单测已覆盖，可只补缺口，不重复造轮子。

**验证：** `npm test`、`npm run build`、`npm run scan:tracked-tree` 全绿。

### Phase 2 — protocol 归位 + shared 边界清理

- `src/agent/shared/protocol.ts` → `src/shared/protocol.ts`。
- **同一批**更新所有引用该文件的生产代码 **与** `tests/**` import；跑通 `npm test`。
- 按 §4.3 把**明确扩展专用**文件迁到 `src/extension/shared/` 时同样 **源码 + 测试 import 同 commit**（若与 Phase 3 合并，遵守 Phase 3 规则）。
- **不**新建 `kernel/` `domain/` 子树。

**验证：** 全量单测 + build；bridge 仍能 import `constants` / `redaction` / `protocol`。

### Phase 3 — 产品目录搬家（源码 + 测试 import 同步）

**原则（D7）：** 每个子 commit 内，路径变更与所有受影响的 `tests/**`（及 e2e helper）import **一起改完**，保证该 commit 上 `npm test` / `npm run build` 为绿。  
**禁止：** 先搬完所有 `src/`、留下测试大面积红、等 Phase 4 再修 import。

建议子 commit（每步独立可验证）：

1. **bridge**  
   - `src/agent/bridge` → `src/bridge`  
   - 更新 package scripts / esbuild 入口  
   - 同步改 bridge 相关测试 import  
   - 验证：`npm test` + build bridge 入口

2. **mcp**  
   - `src/agent/mcp` → `src/mcp`  
   - 同步 mcp 相关测试 import  
   - 验证：同上

3. **extension surfaces + 打包输入**  
   - `background|content|popup|dashboard|devtools` → `src/extension/...`  
   - 扩展专用 shared → `src/extension/shared`（若未在 Phase 2 完成）  
   - 根 `manifest.json` → `src/extension/manifest.json`  
   - 根 `_locales/` → `src/extension/_locales/`（§4.5）  
   - 更新 vite / crx / 活动文档路径  
   - **同步**所有引用旧 `src/background` 等路径的 `tests/*.test.ts`、`tests/e2e-*.spec.ts`、fixtures  
   - 验证：`npm test` + `npm run build`；dist 含 `_locales`；基础 E2E 绿

4. **收尾**  
   - 删除空旧目录（含空的 `src/agent`）  
   - 再跑全量单测 + build

中间窗口期不允许「源码已迁、测试 import 未改」。

### Phase 4 — 测试树重组（只分类，不修搬家 import）

前置：Phase 3 结束后，测试在**旧扁平路径**下已全绿（import 已指向新 `src/**`）。

本 Phase **只做**：

- 文件迁入 `tests/{unit,integration,e2e,support}`（按验证层分类）
- 调整 vitest / playwright 的 `testDir` / `testMatch` 与 npm scripts
- 合并根 `e2e/T*` 与 `tests/e2e-*` 到统一 e2e 树
- 修正因**测试文件自身搬家**产生的相对路径（fixture/helper 互引），**不是**再去补 Phase 3 漏改的 `src` import

**验证：** 分层可独立跑；发现数非零；全量不减少、不无故 skip。

### Phase 5 — 收口

- 活动文档 / CI / scanner 只引用新路径。
- 确认无残留必用旧 `src/background` 等活动入口。
- blueprint 与 `decisions.md` 与代码一致。
- 本计划执行完毕后可归档或在 decisions 引用终态。

**验证：** 路径扫描 + 全矩阵（unit / integration / build / e2e 按项目约定）。

## 9. 风险与回退

| 风险 | 缓解 |
|------|------|
| 一次搬家 diff 过大 | Phase 3 分子 commit；每步可回退 |
| 源码迁完测试全红 | D7：测试 import 与源码同 commit；禁止拖到 Phase 4 |
| import 漏改 | 每子步 tsc + 全量 vitest；失败即停 |
| 误把 bridge 依赖塞进 extension/shared | §4.3 表 + bridge 已引用文件回归 |
| manifest/_locales 路径错 | §4.5；build 后检查 `artifacts/dist/manifest.json` 与 `_locales/*` |
| E2E 发现旧路径 | Phase 3 extension 子步即改 e2e import；Phase 4 只分层 |
| 文档双源 | Phase 0 起只认 `AGENTS.md` + `docs/blueprint` |

回退：任意 Phase 在合并前用 git 回退该 Phase 的 commit 即可；不在半迁移状态开行为向重构。

## 10. 建议 commit 粒度

- Phase 0：`docs: align agent docs layout with repo_template`
- Phase 2：`refactor: move agent protocol into src/shared`（含测试 import）
- Phase 3a/b：`refactor: move bridge|mcp; update tests imports`
- Phase 3c：`refactor: move extension sources, manifest, _locales; update tests imports`
- Phase 4：`test: reorganize tests into unit integration e2e`（仅目录分类）
- Phase 5：`chore: finalize paths and archive legacy docs trees`

一个 task 内可多 commit；每个 commit 保持可验证。

## 11. 参考

- 模板：`/home/karon/karson_ubuntu/repo_template`（`AGENTS.md`、`README.md`、`docs/**`）
- 现产品架构叙述：`docs/omni_powers/op_blueprint/architecture.md`（迁移后以 `docs/blueprint/architecture.md` 为准）
- 历史 monorepo 批次规格：`docs/omni_powers/op_execution/specs/T0012*.md` 等——**仅作可选参考**，本计划不采用 `apps/` + `packages/` 作为默认目标

## 12. 执行前检查清单

- [ ] 用户确认本修订版可执行（或指出修改）
- [ ] Phase 0 起使用 template task 文件格式
- [ ] 每 Phase 定义可运行的验证命令并实际跑通
- [ ] 不在迁移 PR 中夹带功能改动
