# Haiku 审阅报告 — project_01

## 当前模型判断依据

`~/.claude/settings.json` 顶层 `model` 为 `default_model`，`env.ANTHROPIC_MODEL` 也为 `default_model`；主会话可见模型标识同为 `default_model`。Haiku/Sonnet/Opus 默认别名分别配置为 `default_haiku[1m]`、`default_sonnet[1m]`、`default_opus[1m]`。只能确认当前路显式请求 haiku，无法从可观测配置确认别名底层具体模型版本。

## 审阅范围

`docs/review_20260719_0859/MANIFEST.md` 中 `project_01` 批次全部 20 个文件，逐文件全量审阅。附加只读参考了 `docs/blueprint/` 约束文件以验证一致性，不将其计入已审阅范围。

## 高优先级问题（CRITICAL / HIGH）

### 1. 扩展结果回传上限数值矛盾：SECURITY.md 64 MiB vs README 32 MiB

- **位置**：`SECURITY.md:40` vs `README.md:217` vs `README.en.md:217`
- **现象**：
  - `SECURITY.md` 第 40 行："Extension result bodies are limited to **64 MiB**."
  - `README.md` 第 217 行："扩展结果回传上限为 **32 MiB**。"
  - `README.en.md` 第 217 行："extension result reply limit is **32 MiB**."
- **影响**：用户和开发者根据文档理解 Bridge 容量边界时会产生错误预期。若实际代码实现为 64 MiB 而用户按 README 的 32 MiB 设计查询策略，会不必要地采用分页/导出；若实际为 32 MiB 而安全审计者按 64 MiB 评估，会低估 DoS 面。
- **建议**：确认 `src/bridge/server.ts` 或 `src/shared/constants.ts` 中的实际限制值，统一三份文档为正确数值。
- **置信度**：高
- **优先级**：HIGH

### 2. MCP 工具命名在 CLAUDE.md 与 README 之间矛盾

- **位置**：`CLAUDE.md:143` vs `README.md:157` vs `README.en.md:157`
- **现象**：
  - `CLAUDE.md` 第 143 行硬约束区声明 MCP 命令为 `capture.start` / `captures.list` / `data.list` 等。
  - `README.md` 第 157 行展示的 MCP 工作流为：
    ```
    get_status → start_recording → 复现问题 → stop_recording
               → list_captures → get_timeline / list_records / export_capture
    ```
  - `README.en.md` 第 157 行同样使用 `start_recording` / `stop_recording` / `list_captures` 等。
- **影响**：CLAUDE.md 是 agent 行为入口，硬约束区如果与实际 MCP 工具名不匹配，agent 在调用 MCP 时会按照错误的工具名构造请求，导致调用失败。同时使用者在两份文档间看到不同名称会造成混淆。
- **建议**：以 `src/mcp/tools.ts` 中的实际注册名为准，统一 CLAUDE.md 硬约束区和 README 中的示例。
- **置信度**：高
- **优先级**：HIGH

## 中低优先级问题（MEDIUM / LOW）

### 3. AGENTS.md 与 CLAUDE.md 完全重复（逐字节一致）

- **位置**：`AGENTS.md:1-149`、`CLAUDE.md:1-149`
- **现象**：两个文件内容完全相同，均 149 行。AGENTS.md 是 OpenCode 约定入口，CLAUDE.md 是 Claude Code 约定入口。
- **影响**：两份文件独立维护，未来任何一方的更新若未同步到另一方，将导致 OpenCode 和 Claude Code 环境下的 agent 行为不一致。
- **建议**：二者择一作为权威来源，另一份改为简短引用（如 "See CLAUDE.md for project instructions"）。若必须保留两份，在文件头部加入互相同步的提醒注释。
- **置信度**：高
- **优先级**：MEDIUM

### 4. CLAUDE.md 引用的 `docs/refactor_plan.md` 不存在

- **位置**：`CLAUDE.md:20`
- **现象**：CLAUDE.md 第 20 行按需阅读表明确指示："修改 `src/` 目录结构或 import 路径前必读 `docs/refactor_plan.md`"。经文件系统验证，该路径不存在。
- **影响**：agent 在需要了解重构状态时按 CLAUDE.md 导航到不存在的文件，会浪费往返或做出错误假设。
- **建议**：创建该文件或从 CLAUDE.md（及 AGENTS.md）中移除该引用。
- **置信度**：高
- **优先级**：MEDIUM

### 5. CHANGELOG.md Unreleased 区块缺少目标版本号

- **位置**：`CHANGELOG.md:7`
- **现象**：`## [Unreleased]` 下已积累了 3 个类别（Added / Changed / Fixed）的变更记录，但未标注这些条目计划随哪个版本发布。
- **影响**：次要。当项目发布下一个版本时，需在发布前手动判断哪些条目属于该版本。
- **建议**：在 Unreleased 标题后添加预计发布版本号，如 `## [Unreleased] - planned for 0.2.0`。
- **置信度**：中
- **优先级**：LOW

### 6. `.claude/settings.json` SessionStart hook 端口硬编码

- **位置**：`.claude/settings.json:9`
- **现象**：Bridge 自动启动 hook 中 `curl` 健康检查和 `nohup node` 启动命令均硬编码端口 `17831`。如果用户修改了 `.mcp.json` 中的 `CAPTURE_ALL_BRIDGE_URL` 端口，hook 将启动 Bridge 到错误端口。
- **影响**：低。端口 17831 是项目默认值，且 CLI 启动 Bridge 时也默认此端口。当前实际场景中不太可能引发问题。
- **建议**：可考虑从 `CAPTURE_ALL_BRIDGE_URL` 环境变量中解析端口，或添加注释说明修改端口时需同步修改 hook。
- **置信度**：中
- **优先级**：LOW

### 7. CI `npm audit` 未设置 `--audit-level` 阈值

- **位置**：`.github/workflows/ci.yml:28-29`
- **现象**：`npm audit --omit=dev` 和 `npm audit` 均未指定 `--audit-level`。默认行为是发现 high 或 critical 级别漏洞时以非零退出码失败。当前策略合理且明确，但缺少显式阈值降低了可读性。
- **影响**：当 npm 调整默认审计级别行为时，CI 行为可能意外改变。
- **建议**：显式添加 `--audit-level=high` 以明确意图。
- **置信度**：低
- **优先级**：LOW

## 改进建议

1. **文档数值一致性检查**：建议在 CI 中加入对 `.md` 文件中关键数值（MiB 限制、超时等）的一致性 lint 检查，防止 SECURITY/README/PRIVACY 之间再次出现数值漂移。
2. **AGENTS.md 去重**：当前 CLAUDE.md 已是完善的 agent 行为入口，AGENTS.md 的完全重复是不必要的维护负担。建议精简为引用。
3. **CHANGELOG 规范化**：为 Unreleased 区块标注目标版本号，0.1.0 版本补充发布日期。
4. **LICENSE 附录**：Apache-2.0 附录中的 `[yyyy] [name of copyright owner]` 占位符为模板说明文本（无需填充），但如果仓库根目录缺少 `NOTICE` 文件，可考虑添加以符合 Apache-2.0 第 4(d) 条的最佳实践。

## 不确定项 / 可能误报

1. **MCP 工具名到底哪个为准**：未读取 `src/mcp/tools.ts`（不在本批次），无法确认实际 MCP 工具注册名是 `start_recording` 还是 `capture.start`。如果实际注册名恰好是 README 中所示的 `start_recording` 系列，则 CLAUDE.md 硬约束区的 `capture.start` 声明是过期/错误的。
2. **PRIVACY.md 第 37 行**声明的 "A capture is limited to 500 MB and 24 hours" 和 "An individual request or response body is limited to 100 MB" 未在其他文档交叉验证。这两个数值在 README 中一致，但与 SECURITY.md 中的 Bridge/extension 限制是不同维度的指标，不存在矛盾。
3. **`node_modules/` 中的二进制文件安全性**：CI 运行 `npm audit` 检查已知漏洞，但 `npm audit` 不会扫描 native addon 或 postinstall 脚本。当前依赖审计策略可接受，但非完整供应链安全方案。
