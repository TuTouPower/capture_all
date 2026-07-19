## 模型依据

继承 default_model，底层不可观测。不得据此推断具体模型。

## 范围

依据 `docs/review_20260719_0859/MANIFEST.md` 的 `project_01` 范围，逐文件逐段完整审阅以下 20 个文件；未运行构建或测试。按需只读交叉核对 `package.json`、扩展 manifest、Bridge/MCP 实现、导出实现、公开文档测试、自动化测试及相关 blueprint。

| 文件 | 结果 |
|---|---|
| `.claude/settings.json` | 已审阅；发现高优先级安全问题 |
| `.github/ISSUE_TEMPLATE/bug_report.yml` | 已审阅；未发现可操作问题 |
| `.github/ISSUE_TEMPLATE/config.yml` | 已审阅；未发现可操作问题 |
| `.github/ISSUE_TEMPLATE/feature_request.yml` | 已审阅；未发现可操作问题 |
| `.github/dependabot.yml` | 已审阅；未发现可操作问题 |
| `.github/pull_request_template.md` | 已审阅；发现中低优先级治理问题 |
| `.github/workflows/ci.yml` | 已审阅；未发现可操作问题 |
| `.gitignore` | 已审阅；未发现可操作问题 |
| `.mcp.json.example` | 已审阅；发现高优先级配置问题 |
| `.nvmrc` | 已审阅；未发现可操作问题 |
| `AGENTS.md` | 已审阅；发现中低优先级文档问题 |
| `CHANGELOG.md` | 已审阅；未发现独立可操作问题 |
| `CLAUDE.md` | 已审阅；发现中低优先级文档问题 |
| `CODE_OF_CONDUCT.md` | 已审阅；未发现可操作问题 |
| `CONTRIBUTING.md` | 已审阅；未发现可操作问题 |
| `LICENSE` | 已审阅；未发现可操作问题 |
| `PRIVACY.md` | 已审阅；未发现可操作问题 |
| `README.en.md` | 已审阅；发现高优先级配置问题和中低优先级事实错误 |
| `README.md` | 已审阅；发现高优先级配置问题和中低优先级事实错误 |
| `SECURITY.md` | 已审阅；发现中低优先级事实不一致；另有外部状态不确定项 |

## 高优先级

### 1. SessionStart 将 Bridge token 放入进程参数

- 位置：`.claude/settings.json:9`
- 现象：hook 从 `CAPTURE_ALL_BRIDGE_TOKEN` 读取 token，随后以 `--token "$token"` 启动 Bridge。仓库自身 `SECURITY.md:38` 和 MCP 指南均要求 token 视为秘密，并指出 CLI 参数可暴露在本机进程参数列表。Bridge 已支持直接读取环境变量，无需转成 CLI 参数。
- 影响：同机、具备进程查看能力的其他用户或进程可能从命令行参数读取 Bridge token，进而调用本地 Bridge/MCP/CDP 路由。该实现违背公开安全建议，扩大本地秘密暴露面。
- 建议：启动命令删除 `--token "$token"`，让子进程继承 `CAPTURE_ALL_BRIDGE_TOKEN`；如需显式传递，使用进程环境而非 argv。同步增加只检查命令结构、不打印 token 的自动化测试。
- 置信度：高
- 优先级：HIGH

### 2. MCP 示例与 README 的 token 占位符和启动流程互相矛盾，复制后无法连接

- 位置：`.mcp.json.example:11`；`README.md:137-151`；`README.en.md:136-151`
- 现象：`.mcp.json.example` 使用字面值 `<AUTO_GENERATED_BY_BRIDGE>`，但 MCP 进程只会把该字面值作为 `CAPTURE_ALL_BRIDGE_TOKEN` 发送，不会读取 Bridge 持久化 token 文件或自动替换。中英文 README 则要求替换 `<YOUR_BRIDGE_TOKEN>`，该字符串并不存在于示例文件；README 同时要求使用用户生成 token，而示例名称暗示 Bridge 自动生成即可直接使用。
- 影响：用户按 README 复制配置后找不到待替换占位符，或误以为示例能自动取得生成 token；MCP 随后使用错误 token，所有受保护 Bridge 请求返回鉴权失败。核心集成快速开始不可可靠执行。
- 建议：选择并统一一种明确流程。最小修复：将示例值改为 README 使用的同一占位符（如 `<YOUR_BRIDGE_TOKEN>`），明确必须替换；若支持自动生成流程，则新增受控方式读取持久化 token，并在示例和 README 中写明实际路径、权限和生命周期，不能仅用暗示性占位符。
- 置信度：高
- 优先级：HIGH

## 中低优先级

### 1. README 将扩展结果回传上限写成 32 MiB，当前实现和安全策略为 64 MiB

- 位置：`README.md:217`；`README.en.md:216`
- 现象：两份 README 声明扩展结果回传上限为 32 MiB。当前 `src/bridge/server.ts:42` 定义 `MAX_EXTENSION_RESULT_BODY_BYTES = 64 * 1024 * 1024`，`SECURITY.md:40` 也声明 64 MiB。
- 影响：用户会按错误阈值规划分页、导出和故障排查；公开文档、测试断言与运行时行为不一致。`tests/unit/public_docs.test.ts:81` 目前反而固定了错误的 `32 MiB` 文本。
- 建议：将中英文 README 更新为 64 MiB，并同步修改公开文档测试，使测试从实现常量或单一规范来源校验，避免继续固化过期数字。
- 置信度：高
- 优先级：MEDIUM

### 2. Agent 入口引用不存在的活动重构计划

- 位置：`AGENTS.md:20`；`CLAUDE.md:20`
- 现象：两份入口文件要求修改 `src/` 目录结构或 import 路径前必读 `docs/refactor_plan.md`，但仓库当前不存在该文件。两文件内容完全相同，因此问题同步存在。
- 影响：Agent 无法完成强制前置阅读，可能中断任务、依赖不存在的约束，或自行猜测历史重构要求。
- 建议：若重构已完成，删除该导航项并把仍有效约束归入 blueprint；若仍活动，恢复该文件并确保内容反映当前 `src/{extension,bridge,mcp,shared}` 状态。
- 置信度：高
- 优先级：MEDIUM

### 3. Agent 硬约束称 token 必须由用户提供，与当前自动生成决策和实现冲突

- 位置：`AGENTS.md:141`；`CLAUDE.md:141`
- 现象：两文件先声明 token 优先级包含 `persisted file > generated`，随后又写“token 由用户提供”。当前 `src/bridge/config.ts:103-123` 会在 CLI、env、持久化文件均无 token 时随机生成并以 mode `0600` 持久化；`docs/blueprint/decisions.md:53-59` 也确认该行为。
- 影响：Agent 可能错误移除或拒绝合法自动生成路径，导致维护决策不一致；安全审阅也难以判断“用户提供”究竟指秘密值来源还是禁止硬编码。
- 建议：改为“禁止硬编码或设置固定默认 token；允许 Bridge 随机生成并以 mode `0600` 持久化；用户也可通过 CLI/env 显式提供”，与决策和实现保持一致。
- 置信度：高
- 优先级：MEDIUM

### 4. SECURITY 对 token 来源的描述已过时

- 位置：`SECURITY.md:36-38`
- 现象：文档称 Bridge 在所有非 health 数据端点要求“user-provided Bearer token”，并要求使用“random value supplied by the user”。当前 Bridge 支持自动生成并持久化 MCP token，扩展自动登记后还使用独立 `instance_token` 访问扩展数据端点；并非所有合法 token 都由用户提供，也并非所有数据端点都只使用同一种 Bearer token。
- 影响：安全边界说明与当前双 token 模型不一致，用户可能误配扩展为共享 MCP token，维护者也可能误判 instance token 权限边界。
- 建议：按当前模型分别说明 MCP token 与 `instance_token`：来源、存储、允许路由、明文/哈希处理和轮换方式；将“user-provided”改为“随机且非固定，来自显式配置或 Bridge 安全生成”。
- 置信度：高
- 优先级：MEDIUM

### 5. PR 模板禁止所有 `.claude/` 文件，与仓库治理规则冲突

- 位置：`.github/pull_request_template.md:17`
- 现象：检查项要求 PR 不包含任何 `.claude/` 文件，但仓库有意跟踪 `.claude/settings.json`。`scripts/scan_tracked_tree.mjs:23-24` 明确允许项目级 `.claude/settings.json`，只禁止本地 override、skills 和 worktrees。
- 影响：合法 hook 配置修复无法如实勾选 PR 模板，贡献者可能误删受版本控制的项目配置，或忽略检查项。
- 建议：把笼统的 `.claude/` 改为实际禁止路径：`.claude/settings.local.json`、`.claude/skills/`、`.claude/worktrees/`；明确 `.claude/settings.json` 可在必要时提交。
- 置信度：高
- 优先级：LOW

## 建议

1. 先修复 token 暴露和不可用示例：移除 SessionStart argv token，统一 `.mcp.json.example` 与 README 流程。
2. 再建立单一事实来源：Bridge 限额、token 模型、允许路由由 blueprint 或共享常量定义，公开文档测试从该事实校验，避免文本测试固化旧值。
3. 最后清理治理入口：移除不存在的 `docs/refactor_plan.md` 导航，细化 PR 模板的 `.claude/` 禁止范围。

## 不确定项

### 1. GitHub Private Vulnerability Reporting 是否仍实际启用

- 位置：`SECURITY.md:11-12`；`.github/ISSUE_TEMPLATE/config.yml:3-5`
- 现象：SECURITY 明确声称 GitHub Private Vulnerability Reporting 已启用，Issue 配置也将用户导向该策略；该状态属于仓库托管平台设置，无法仅从当前工作树确认。
- 影响：若平台设置未启用或后来被关闭，安全报告者会找不到承诺的私密入口，而文档又没有备用安全邮箱，只能暂存报告。
- 建议：仓库管理员在 GitHub Security 设置中核实 Private Vulnerability Reporting 当前状态；若未启用，立即启用或发布经过验证的私密备用渠道，并更新 SECURITY。
- 置信度：中
- 优先级：HIGH
