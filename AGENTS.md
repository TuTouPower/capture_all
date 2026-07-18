# Capture All 全采

Chrome MV3 扩展，采集浏览器内的用户行为、页面导航、网络请求、控制台、错误异常、Storage、Cookie 7 类数据，并通过本地 Bridge + MCP 服务端供 AI Agent 调用。所有数据本地 IndexedDB，不入云。

本文件是 agent 行为入口，包含工作流规则与按需导航。只读取当前任务需要的文档，禁止无目的全量加载。

## 按需阅读

| 文档 | 内容 | 何时读 |
| ---- | ---- | ---- |
| `docs/tasks/index.md` | task ID、状态、owner、branch | 接到新需求或流转状态时 |
| `docs/tasks/TNNN_slug/spec.md` `plan.md` | 范围与验收标准；步骤、风险、blueprint 更新清单 | 执行或审阅 task 时 |
| `docs/tasks/TNNN_slug/log.md` | 进展、偏离、决策和关键验证 | 接手或排查 task 时按需读 |
| `docs/tasks/TNNN_slug/reviews/` | task review 报告和 adoption | review 环节 |
| `docs/handoff.md` | 项目级交接 | 接手工作时第一个读 |
| `docs/blueprint/architecture.md` | 当前模块划分、目录结构、数据流、Chrome 权限、构建产物 | 修改跨模块行为前 |
| `docs/blueprint/domain.md` | 领域术语、MCP 工具命名、禁用术语、业务不变量、存储限制、错误码 | 接触业务概念、对齐术语时 |
| `docs/blueprint/conventions.md` | 命名、缩进、UI 编码、扩展 API 规范、安全编码、日志、新增模块步骤 | 写代码前对齐风格 |
| `docs/blueprint/decisions.md` | 已确认的非显然决策（含 src 三产品重构、shared 扁平化、token 模型、DB v3 等） | 需要理解历史取舍时 |
| `docs/refactor_plan.md` | 当前活动重构计划：源码按 `src/{extension,bridge,mcp,shared}` 重构、文档对齐 `repo_template` | 修改 `src/` 目录结构或 import 路径前必读 |
| `docs/reviews/RNN_slug/` | 当前独立 review | 评审非 task 对象时 |
| `docs/spikes/SNN_slug/report.md` | 实验问题、证据和结论 | 技术选型或未知风险验证时 |
| `docs/templates/` | task / review / spike 模板 | 创建对应工作项时复制 |
| `docs/guides/` | 给人看的使用指南（部署、MCP、排障、开发者入门、商店发布） | 按需 |
| `docs/archive/` | 完结或终止的历史记录（含已归档的 omni_powers heavy 工作流） | 追溯历史时 |

## 目录与写入规则

| 路径 | 用途 | 写入规则 |
| ---- | ---- | ---- |
| `docs/blueprint/` | 当前长期真相：架构、领域、约定、决策 | finalization 阶段更新；实施和 review 期间不写入未稳定结论 |
| `docs/tasks/index.md` | task ID、状态、owner、branch | 新需求和状态流转时更新 |
| `docs/tasks/TNNN_slug/` | active task 工作区 | owner 写 task 文档；reviewer 只写自己的 review 报告 |
| `docs/reviews/RNN_slug/` | 非 task 对象的独立评审 | 作者管理 adoption；reviewer 只写自己的报告 |
| `docs/spikes/SNN_slug/` | 当前 spike | `report.md` 必需；有实验代码时再建 `code/` |
| `docs/templates/` | task、review、spike 模板 | 复制使用，不代表 active 数据 |
| `docs/guides/` | 给人看的使用指南 | 不承载 agent 行为规则 |
| `docs/handoff.md` | 项目级交接 | 只追加，不删改历史 |
| `docs/archive/` | 完结或终止的 task、review、spike、历史工作流 | 镜像原路径，只进不出 |
| `src/` `tests/` `e2e/` `scripts/` `assets/` | 源码、测试、E2E、脚本、静态源 | 正常开发 |
| `artifacts/` `data/` `.scratch/` | 产物、运行数据、一次性草稿 | 不入库；临时日志放 `.scratch/` |

## 开发原则

- specs driven：spec 和 plan 先行，一起写完交用户一次性审核；用户明确不审则跳过。
- TDD：开发循环内可测试部分先写失败测试（红），再实现到通过（绿）。

## task 生命周期

状态只使用：`backlog`、`active`、`done`、`dropped`。

### 新需求

1. 读 `docs/tasks/index.md`，按 tasks 与 archive 中最大 ID 加一分配 TNNN。
2. 暂不开始：登记为 `backlog`，不建目录。
3. 开始执行：登记为 `active`，填写 owner 和 branch，创建 `docs/tasks/TNNN_slug/`。
4. 从 `docs/templates/task/` 创建 `spec.md`、`plan.md`、`log.md`。
5. spec 和 plan 按开发原则审核通过后，进入开发循环。

一个 task 对应一个独立、可验证的结果和一个工作分支，分支推荐 `task_tnnn_slug`。多个互不依赖的验收结果应拆成多个 task。

### 开发循环

一个 task 内部可分为多个 commit，每个循环产出一个独立 commit：

1. 可测试部分先写红。
2. 实现变绿。
3. agent-verify 黑盒验证：运行项目黑盒测试命令（`npm test`、`npm run build`、必要时的 `npm run test:e2e` 等）。
4. 更新受影响文档：spec、plan、blueprint 候选条目、guides 等所有因本轮改动而需要同步的文档；不含 task 进度记录。
5. review：派两个 sub agent 并行评审当前未提交改动，均须对照 task spec 判断代码、文档、测试是否仍满足最初需求：
   - 文档+代码 agent：核对实现与 spec 是否一致、文档是否真实反映代码状态。
   - 测试 agent：核对测试覆盖与端到端行为是否对应 spec 验收标准。
6. review 发现问题必须修复。修复若触及代码或测试，回到步骤 3 重新黑盒验证；仅改文档则直接继续。
7. 更新 task 文档：`log.md` 追加本轮进展、决策与关键验证，勾选验收标准。
8. 独立 commit：本循环的代码与文档更新作为一个内聚 commit。

实施时任务量不大由自己完成，任务量大可派 sub agent；review 一律派 sub agent 执行。不考虑多 agent 并行协作，只有自己按需派 sub agent 一种情况。

### 完结

所有开发循环完成、adoption 决策落地后，用一个收尾 commit 原子完成剩余文档更新：

1. 将 adoption 中已落地项从 `pending` 更新为此前存在的 `commit:<sha>`。
2. 更新受影响的 blueprint。
3. 非显然决策追加到 `docs/blueprint/decisions.md`。
4. 将任务目录移入 `docs/archive/tasks/`。
5. 将 index 状态改为 `done`。

### dropped

- backlog 被放弃：index 改为 `dropped`，备注原因；无目录可归档。
- active 被放弃：在 `log.md` 记录终止原因，确保半成品不留在目标分支，将目录移入 `docs/archive/tasks/`，index 改为 `dropped`。
- 恢复需求：新建新 ID，并在新旧任务备注中互相引用。

## review

- review 在开发循环内、commit 前进行，派 sub agent 评审当前未提交改动；每个循环创建新一轮报告，不改写旧报告。
- task review：在 task 下创建 `reviews/`，从 `docs/templates/review/` 复制模板。
- 独立 review：创建 `docs/reviews/RNN_slug/`，使用同一模板；RNN 取 `docs/reviews/` 与 `docs/archive/reviews/` 中最大 ID 加一。
- reviewer 对评审对象只读，只能创建自己的 review 报告；不得修改被评审对象、`adoption.md`、他人报告或历史记录。
- 作者填写 `adoption.md`：先记录 decision、rationale 和 `pending`，经用户审阅后再落地采纳项。
- 落地 commit 已存在后，finalization 阶段补写 `commit:<sha>`。禁止让 adoption 引用包含自身修改的 commit。
- 独立 review 完成后移入 `docs/archive/reviews/`；task review 随 task 归档。

## handoff

- 只有项目级交接，追加到 `docs/handoff.md`；不设 task 内交接。
- 交接者只追加新段落，不删改历史；接手者先读 `docs/handoff.md`。
- 交接记录必须包含 branch 和交出时已存在的 head_commit。

## spike

- spike 非必需，仅在技术选型或未知风险需要实验验证时创建。
- 创建 `docs/spikes/SNN_slug/`，从 `docs/templates/spike/` 复制 `report.md`；SNN 取 `docs/spikes/` 与 `docs/archive/spikes/` 中最大 ID 加一。
- 有实验代码时再创建 `docs/spikes/SNN_slug/code/`；代码可入库保留，仅作为验证材料。
- 得出结论并决定是否采纳后，将 spike 移入 `docs/archive/spikes/`。

## 命令

构建与开发：

- `npm run dev` — Vite 开发
- `npm run build` — `tsc && vite build && build:bridge && build:mcp && build:zip`，输出到 `artifacts/dist/`、`artifacts/bridge/`、`artifacts/mcp/`
- `npm run bridge` — 启动 Bridge（`tsx src/agent/bridge/main.ts`）
- `npm run mcp` — 启动 MCP 服务端（`tsx src/agent/mcp/main.ts`）

测试：

- `npm test` — vitest 全量单测
- `npm run test:watch` — vitest watch
- `npm run test:e2e` — 基础 E2E（`playwright test --project=e2e`，headless）
- `npm run test:e2e:all` — 全部 E2E 项目（含 ext/real/cdp/mcp/p1/streaming）
- `npm run serve:e2e` — 构建 + 预览（127.0.0.1:4174，E2E webServer）

E2E 项目（`playwright.config.ts` 定义，按需 `--project=<name>` 指定）：`e2e`、`e2e-ext`、`e2e-real`、`e2e-cdp-capture`、`e2e-mcp`、`e2e-p1`、`e2e-streaming`。并发策略与历史纪律可参考 `docs/archive/omni_powers/op_blueprint/test.md`。

## 硬约束

项目特有约束（详情见 `docs/blueprint/` 对应文件）：

- **Bridge 仅绑定 `127.0.0.1`**，禁止绑 `0.0.0.0` 或公网接口。token 优先级 `CLI > env > persisted file > generated`；生成文件 mode `0600`。token 由用户提供，禁止硬编码、默认值或示例值。
- **instance_token 不得访问 MCP / CDP**：MCP 路由仅接受 MCP token；扩展数据端点接受 MCP token 或 instance_token。
- **术语**：英文 `capture`，中文"采集"；禁用 `session`/`record`/`录制`/`记录` 作产品术语。类型 `CaptureRecord`/`CaptureEvent`/`CaptureConfig`，标识 `capture_id`，MCP 命令 `capture.start`/`captures.list`/`data.list` 等。详见 `docs/blueprint/domain.md`。
- **IndexedDB `capture_all_db` v3**，10 stores；升级路径不得丢 records。
- **HTML 导出必须转义动态内容**；`type=password` 永远不采集；脱敏与截断分离。
- **禁止** `taskkill /F /IM chrome.exe` 类破坏性操作（历史事故）。
- **生成物放 `artifacts/`**，不入版本库；本地密钥（如 `CAPTURE_ALL_BRIDGE_TOKEN`）禁止入库。
- **同一时间只允许一次活跃采集**：start 时若已有活跃采集，返回 `CAPTURE_ALREADY_RUNNING`。
- **MCP 不自动脱敏、不自动摘要、不自动过滤、不提供删除/清空**。
