# Capture All 重构计划

对照模板：`/home/karon/karson_ubuntu/repo_template`  
状态：已确认方向，待按阶段执行  
更新：2026-07-19

## 1. 目标

把本仓对齐 `repo_template` 的 **agent 入口、文档工作流、顶层目录与测试分层**；源码在模板的 `src/` 边界内按 **三产品** 划分，并明确 **跨产品共享** 边界。

**做完后应具备：**

1. 唯一 agent 入口 `AGENTS.md`（`CLAUDE.md` 为其软链）。
2. 文档树为 template 形态：`blueprint` / `guides` / `templates` / `tasks` / `reviews` / `spikes` / `handoff` / `archive`。
3. 源码为 `src/{extension,bridge,mcp}` + `src/shared` + `src/extension/shared`。
4. 测试为 `tests/{unit,integration,e2e}`（及必要 support）。
5. 行为不变量保留：产物路径、IndexedDB 兼容、Bridge/MCP 安全约定。

**明确不做：**

- 不为「像 monorepo」先上 `apps/*` / `packages/*` workspace。
- 不改采集语义、DB schema、token 安全模型。
- 不把 omni_powers heavy 工作流继续当作活动入口。
- 不批量改写历史 acceptance 正文（只搬家/加注）。

## 2. 已确认决策

| # | 决策 |
|---|------|
| D1 | 文档与工作流对齐 `repo_template`。 |
| D2 | 源码产品划分：`src/extension/`、`src/bridge/`、`src/mcp/`。 |
| D3 | 跨产品共享：`src/shared/{kernel,protocol,domain}`；扩展内共享：`src/extension/shared/`。 |
| D4 | 先不抽 npm workspace packages；用目录 + import 规则 +（可选）路径别名。 |
| D5 | `docs/archive` 入库（ignore 已取消）。 |
| D6 | 测试按 template 分为 unit / integration / e2e。 |

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
│   ├── guides/                    # 人读指南（部署 / MCP / 排障 / 贡献 …）
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
│   │   ├── background/
│   │   ├── content/
│   │   ├── popup/
│   │   ├── dashboard/
│   │   ├── devtools/
│   │   └── shared/                # 仅扩展内：IDB、export 拼装、UI 工具等
│   ├── bridge/
│   ├── mcp/
│   └── shared/                    # 跨产品；禁止依赖任一产品
│       ├── kernel/                # 纯函数：id / hash / escape …
│       ├── protocol/              # Agent 线协议
│       └── domain/                # 无 Chrome 的领域类型与纯规则
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── support/                   # fixtures / mocks / helpers（可选顶层）
├── scripts/
├── assets/
├── artifacts/                     # 不入库
├── data/                          # 不入库
└── .scratch/                      # 不入库
```

活动文档 **不再** 依赖 `docs/omni_powers/**` 作为入口；该树迁入 `docs/archive/` 后可删活动引用。

## 4. 源码边界

### 4.1 依赖方向

```text
extension ──► shared
bridge    ──► shared
mcp       ──► shared

extension ──✗── bridge / mcp
bridge    ──✗── extension / mcp
mcp       ──✗── extension / bridge（实现层；运行时只走 HTTP）
shared    ──✗── 任何产品目录
```

- `src/shared/**` 禁止 `chrome.*`、DOM、扩展入口、Node 服务框架细节。
- Bridge / MCP 禁止 import `src/extension/**`。
- MCP 不直接依赖 Bridge 源码，只依赖 `shared/protocol` + HTTP。

### 4.2 放置规则

| 放 `src/shared` | 放 `src/extension/shared` | 留在对应产品内 |
|-----------------|---------------------------|----------------|
| protocol（命令/结果/状态） | IndexedDB / storage | bridge server / queue / config |
| kernel：id、hash、escape | export 拼装、读库侧逻辑 | mcp tools / schemas / client |
| 无 Chrome 的 domain 类型与常量 | i18n/theme/UI 共用（仅扩展） | extension 各 surface 私有逻辑 |
| 可在三端复用的纯校验/规则 | redaction 落库与扩展侧编排 | content hooks 等 |

### 4.3 现状 → 目标映射

| 现状 | 目标 |
|------|------|
| `src/agent/shared/protocol.ts` | `src/shared/protocol/` |
| `src/shared/{id,hash,escape}.ts` 等纯工具 | `src/shared/kernel/` |
| `src/shared` 中无 Chrome 的类型/常量/纯规则 | `src/shared/domain/`（可第二批下沉） |
| 其余 `src/shared/*`（配置、读库、export 拼装等） | `src/extension/shared/` |
| `src/{background,content,popup,dashboard,devtools}` | `src/extension/...` |
| `src/agent/bridge/*` | `src/bridge/` |
| `src/agent/mcp/*` | `src/mcp/` |
| 根 `manifest.json`、`_locales/` | 随 extension 构建约定放置（见阶段 C；优先贴近 extension 入口，构建配置一次改全） |

### 4.4 构建与别名

- Extension：继续 Vite / `@crxjs`；入口与 manifest 路径一次改齐。
- Bridge / MCP：继续 esbuild → `artifacts/bridge/bridge.mjs`、`artifacts/mcp/mcp.mjs`。
- 可选 tsconfig paths：`@shared/*`、`@extension/*`（避免过深相对路径）。
- 边界可用现有 `scripts/scan_tracked_tree.mjs` 或补充简单规则：禁止跨产品错误 import、禁止 `shared` 引用产品路径。

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
| （无独立 decisions） | `docs/blueprint/decisions.md`（记 monorepo 否决、shared 分层、token、DB v3 等） |
| `docs/deployment.md`、`mcp_usage.md`、`troubleshooting.md`、`contributing_dev.md` 等 | `docs/guides/` |
| `op_blueprint/prd.md`、`specs/*`、`test.md` | 人读 → `docs/guides/`；仍属长期约束的 → blueprint / decisions |

### 5.3 omni_powers 与 archive

| 内容 | 处置 |
|------|------|
| `op_record/**`、历史 task / acceptance | 镜像进 `docs/archive/tasks/`（或 `archive/omni_powers/…`），加原路径备注 |
| `op_execution/specs/**` | 有用条目改写成新 `docs/tasks/TNNN_*/spec.md` 后执行；原文归档 |
| `op_execution/tasks/**`、checkpoint 类 | 归档；活动索引改由 `docs/tasks/index.md` + `handoff.md` |
| 活动 CLAUDE/AGENTS 中的 omni 必读 | 删除 |

### 5.4 工作流（template）

- specs driven：`spec.md` + `plan.md` 先行，用户审核（明确跳过则除外）。
- 开发循环：红 → 绿 → 黑盒验证 → 文档同步 → 双 subagent review → `log.md` → commit。
- 完结：adoption 落地、更新 blueprint、目录移入 `docs/archive/tasks/`、index 标 `done`。
- 状态机：仅四态；不保留 omni heavy 的 merge gate / authorize 轮次作为活动流程。

## 6. 测试

### 6.1 目标分层

| 层 | 含义 | 示例 |
|----|------|------|
| `tests/unit/` | 无浏览器/无真服务的纯逻辑 | kernel、protocol 映射、纯 redaction |
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
- omni_powers 活动引用改为 archive 或删除必读。

**验证：** 导航可走通；`npm test` / `npm run build` 无因文档改动而红。

### Phase 1 — 行为护栏（可选但推荐）

- 在搬路径前固定：manifest/构建产物 smoke、关键 IDB 契约、scanner 可用。
- 若现有单测已覆盖，可只补缺口，不重复造轮子。

**验证：** `npm test`、`npm run build`、`npm run scan:tracked-tree` 全绿。

### Phase 2 — shared 下沉（kernel + protocol 优先）

- 建 `src/shared/{kernel,protocol,domain}`。
- 先迁 protocol 与 kernel；全仓改 import。
- domain 中已确认无 Chrome 的类型可同批或下一批。

**验证：** 全量单测 + build；Bridge/MCP 入口仍可用。

### Phase 3 — 产品目录搬家（纯路径，不改行为）

1. `src/agent/bridge` → `src/bridge`；更新 package scripts / esbuild 入口。
2. `src/agent/mcp` → `src/mcp`；同上。
3. extension surfaces → `src/extension/*`；原扩展向 shared → `src/extension/shared`。
4. 更新 Vite/manifest/`_locales`/文档中的活动路径。
5. 删除空旧目录。

**验证：** 每步后 `npm test` + `npm run build`；关键 E2E（至少基础 project）绿。

### Phase 4 — 测试树重组

- 迁入 `tests/{unit,integration,e2e,support}`。
- 调整 vitest / playwright 配置与 npm scripts。
- 合并根 `e2e/T*` 与 `tests/e2e-*` 到统一 e2e 树。

**验证：** 分层可独立跑；发现数非零；全量不减少、不无故 skip。

### Phase 5 — 收口

- 活动文档 / CI / scanner 只引用新路径。
- 确认无残留必用旧 `src/background` 等活动入口。
- blueprint 与 `decisions.md` 与代码一致。
- 本计划若已执行完毕，可归档到 `docs/archive/` 或在 decisions 中引用终态。

**验证：** 路径扫描 + 全矩阵（unit / integration / build / e2e 按项目约定）。

## 9. 风险与回退

| 风险 | 缓解 |
|------|------|
| 一次搬家 diff 过大 | 按 Phase 2→3 分 commit；每步可回退 |
| import 漏改 | tsc + 全量 vitest；失败即停 |
| 扩展加载路径错 | build 后检查 `artifacts/dist/manifest.json` 与关键入口文件 |
| E2E 发现旧路径 | Phase 4 集中改 runner；Phase 3 至少保基础 e2e |
| shared 误塞 Chrome 代码 | 边界规则 + review 对照 §4 |
| 文档双源 | Phase 0 起只认 `AGENTS.md` + `docs/blueprint` |

回退：任意 Phase 在合并前用 git 回退该 Phase 的 commit 即可；不在半迁移状态开行为向重构。

## 10. 建议 commit 粒度

- Phase 0：`docs: align agent docs layout with repo_template`
- Phase 2：`refactor: extract src/shared kernel and protocol`
- Phase 3a/b/c：`refactor: move bridge|mcp|extension under src products`
- Phase 4：`test: reorganize tests into unit integration e2e`
- Phase 5：`chore: finalize paths and archive legacy omni_powers docs`

一个 task 内可多 commit；每个 commit 保持可验证。

## 11. 参考

- 模板：`/home/karon/karson_ubuntu/repo_template`（`AGENTS.md`、`README.md`、`docs/**`）
- 现产品架构叙述：`docs/omni_powers/op_blueprint/architecture.md`（迁移后以 `docs/blueprint/architecture.md` 为准）
- 历史 monorepo 批次规格：`docs/omni_powers/op_execution/specs/T0012*.md` 等——**仅作可选参考**，本计划不采用 `apps/` + `packages/` 作为默认目标

## 12. 执行前检查清单

- [ ] 用户确认本计划可执行（或指出修改）
- [ ] Phase 0 起使用 template task 文件格式
- [ ] 每 Phase 定义可运行的验证命令并实际跑通
- [ ] 不在迁移 PR 中夹带功能改动
