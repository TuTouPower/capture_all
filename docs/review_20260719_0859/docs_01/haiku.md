# docs_01 全量文档审阅 — haiku

## 模型依据

- 审阅模型：haiku（显式声明，底层不可观测）
- 审阅模式：只读全量审阅，不修改任何文件
- 审阅批次：`docs/review_20260719_0859/MANIFEST.md` docs_01（20 文件，1883 行）

## 范围

| # | 文件 | 行数 |
|---|------|------|
| 1 | `docs/blueprint/architecture.md` | 248 |
| 2 | `docs/blueprint/conventions.md` | 106 |
| 3 | `docs/blueprint/decisions.md` | 72 |
| 4 | `docs/blueprint/domain.md` | 130 |
| 5 | `docs/guides/contributing_dev.md` | 237 |
| 6 | `docs/guides/deployment.md` | 93 |
| 7 | `docs/guides/mcp_usage.md` | 144 |
| 8 | `docs/guides/store_publish_list.md` | 231 |
| 9 | `docs/guides/test.md` | 233 |
| 10 | `docs/guides/troubleshooting.md` | 138 |
| 11 | `docs/handoff.md` | 50 |
| 12 | `docs/reviews/.gitkeep` | 0 |
| 13 | `docs/tasks/T008_label_routing/plan.md` | 39 |
| 14 | `docs/tasks/T008_label_routing/spec.md` | 62 |
| 15 | `docs/tasks/index.md` | 20 |
| 16 | `docs/templates/review/adoption.md` | 7 |
| 17 | `docs/templates/review/review.md` | 25 |
| 18 | `docs/templates/spike/report.md` | 27 |
| 19 | `docs/templates/task/log.md` | 7 |
| 20 | `docs/templates/task/plan.md` | 14 |

---

## 高优先级

### H01 — `docs/guides/mcp_usage.md` 整个快速开始章节残留 `browser_no`（CRITICAL）

- **位置**: `docs/guides/mcp_usage.md:8, 11, 13`
- **现象**: 第 8 行"为每个浏览器实例分配唯一编号（`browser_no`，如 1、2、3）"、第 11 行"批准 `browser_no`"、第 13 行"通过 `browser_no` 参数指定目标"。T008 已将 `browser_no` 替换为 `browser_label` + `instance_id`，代码中 `grep -rn "browser_no" src/ tests/` 已无残留。该指南是把 `browser_no` 概念直接暴露给用户的唯一入口，会造成用户实际操作与文档严重不符。
- **影响**: 用户按指南操作会寻找已不存在的 `browser_no` 配置入口；MCP 工具调用使用 `browser_no` 参数将被拒绝。
- **建议**: 整节重写为 `browser_label` + `instance_id` 路由流程；更新步骤 2/5/7 对应字段名和参数名。
- **置信度**: 高。已通过 `grep -rn "browser_no" src/ tests/` 验证代码无残留，T008 spec.md 验收标准第一条明确要求"`grep -rn "browser_no" src/ tests/` 无残留"。
- **严重度**: CRITICAL

### H02 — `docs/guides/troubleshooting.md` 残留 `browser_no`（CRITICAL）

- **位置**: `docs/guides/troubleshooting.md:55`
- **现象**: "检查扩展设置中的 `browser_no` 配置"。该字段已被移除。
- **影响**: 排查指引指向不存在的配置项，用户无法按步骤操作。
- **建议**: 替换为 `browser_label` 配置检查。
- **置信度**: 高。
- **严重度**: CRITICAL

### H03 — `docs/blueprint/architecture.md` 多处引用不存在的 `docs/specs/` 文件（CRITICAL）

- **位置**: `docs/blueprint/architecture.md:159, 172, 176, 180, 184, 231`
- **现象**: 6 处引用 `specs/capture_core.md`、`specs/content_events.md`、`specs/popup_3states.md`、`specs/dashboard.md`、`specs/devtools.md`、`specs/agent_mcp.md`、`specs/network_body_capture.md`。经检查 `docs/specs/` 目录不存在。这些 spec 文件实际在 `docs/archive/omni_powers/op_blueprint/specs/`（已归档）。
- **影响**: 文档中的权威引用全部断裂，开发者无法跟踪到实际的详细规格。
- **建议**: 将引用更新为实际归档路径（如 `docs/archive/omni_powers/op_blueprint/specs/...`），或复述关键要点使 `architecture.md` 自包含。
- **置信度**: 高。`ls docs/specs/` 确认目录不存在。
- **严重度**: CRITICAL

### H04 — `docs/guides/test.md` 多处理论与实际不符（CRITICAL，含 4 子项）

- **位置**: `docs/guides/test.md:21, 87, 91-94`
- **现象**:
  - (a) 第 21 行：Vitest 版本写"Vitest 2.x"，实际 `package.json` 依赖为 `^4.1.10`。`architecture.md` 已正确写"Vitest 4.x"。
  - (b) 第 87 行：`npm run build` 命令描述为 `tsc && vite build && npm run build:bridge && npm run build:mcp`，漏了中间步骤 `npm run copy:locales` 和结尾 `npm run build:zip`。实际 `package.json` 命令为 `tsc && vite build && npm run copy:locales && npm run build:bridge && npm run build:mcp && npm run build:zip`。
  - (c) 第 91-92 行：`build:bridge` 和 `build:mcp` 入口路径写的是旧的 `src/agent/bridge/main.ts` 和 `src/agent/mcp/main.ts`。重构后实际路径为 `src/bridge/main.ts` 和 `src/mcp/main.ts`（已验证 `package.json`）。
  - (d) 第 93-94 行：`npm run bridge` / `npm run mcp` 同样使用旧路径 `src/agent/bridge/main.ts` / `src/agent/mcp/main.ts`。
- **影响**: 开发者按文档执行命令会失败；Vitest 版本错误导致技术栈认知偏差。
- **建议**: (a) 第 21 行改为"Vitest 4.x"；(b) 第 87 行补全为完整 build 命令；(c-d) 第 91-94 行入口路径改为 `src/bridge/main.ts` / `src/mcp/main.ts`。
- **置信度**: 高。已通过 `package.json` 和 `ls src/bridge/main.ts` 验证。
- **严重度**: CRITICAL

### H05 — `docs/guides/contributing_dev.md` 项目结构图过时（HIGH）

- **位置**: `docs/guides/contributing_dev.md:53-75`
- **现象**: 第 55-65 行展示的目录结构为旧布局：`src/agent/{bridge,mcp,shared}`、`src/background/`、`src/content/`、`src/dashboard/`、`src/devtools/`、`src/popup/`。第 77 行虽有注释"即将按重构计划重构"，但紧接原文说"本页描述现状"——而"现状"三产品重构（T001-T007）早已完成，`src/agent/` 不再存在（T004 记录 `src/agent/` 已删）。
- **影响**: 新人按此结构找文件会找不到入口；贡献者可能错误地在旧路径创建模块。
- **建议**: 更新为当前实际结构 `src/{extension,bridge,mcp,shared}`，与 `architecture.md` §3 对齐。第 97 行 `bridge/server.ts` 的描述"WebSocket 桥接服务器"也为误导，应为"HTTP 桥接服务器"。
- **置信度**: 高。
- **严重度**: HIGH

### H06 — `docs/tasks/index.md` T010 状态与 commit 不一致（HIGH）

- **位置**: `docs/tasks/index.md:20`
- **现象**: T010 状态标记为 `done`，但备注写"commit pending；21+73 测试全绿；0 skip"。按 `CLAUDE.md` task 生命周期规则，`done` 状态 task 应已完成所有 commit 并归档。`commit pending` 意味着最后一个 commit 尚未创建。
- **影响**: 状态语义混淆——究竟是 `active` 待最终 commit，还是 `done` 但 index 未更新？后续 reader 无法确定 task 真实状态。
- **建议**: 若 commit 已产生，补写 SHA；若尚未 commit，状态应暂为 `active`，commit 后改 `done`。
- **置信度**: 高。
- **严重度**: HIGH

---

## 中低优先级

### M01 — `docs/blueprint/conventions.md` design_tokens.css 路径过时（MEDIUM）

- **位置**: `docs/blueprint/conventions.md:31`
- **现象**: 引用的 CSS 令牌路径为 `src/shared/design_tokens.css`，但 T006 已将此文件下沉到 `src/extension/shared/design_tokens.css`（handoff.md 确认"10 个扩展专用 shared 下沉"）。
- **影响**: 开发者按文档路径找不到令牌文件。
- **建议**: 更新为 `src/extension/shared/design_tokens.css`。
- **置信度**: 中。需确认当前实际路径；若 design_tokens.css 已被复制而非移动，可能两个位置都有效。
- **严重度**: MEDIUM

### M02 — `docs/guides/test.md` §0 omni_powers 流程残留与权威性模糊（MEDIUM）

- **位置**: `docs/guides/test.md:5-16`
- **现象**: §0 标记为"omni_powers 实践强制"，列出 7 条流程纪律，引用 `docs/archive/WORKFLOW_POSTMORTEM.md`。这些纪律虽与当前 CLAUDE.md task 工作流理念重叠，但归属关系不清晰：§0 声称"违反则 task 不得标 done"，而 CLAUDE.md 定义的是另一套开发循环规则。
- **影响**: reader 面对两套流程规则（omni legacy §0 + CLAUDE.md 主工作流），不清楚以哪个为准。
- **建议**: 提取与当前工作流一致的纪律融入 CLAUDE.md 或 test.md 主体；标注历史来源为引用参考而非强制执行。
- **置信度**: 中。
- **严重度**: MEDIUM

### M03 — `docs/guides/deployment.md` 提及 pnpm 但项目未使用 pnpm（LOW）

- **位置**: `docs/guides/deployment.md:11`
- **现象**: "npm 或 pnpm"，但仓库中无 `pnpm-lock.yaml`，CLAUDE.md 和 `package.json` 仅引用 npm。
- **影响**: 轻微误导，不影响实际操作（npm ci 仍可用）。
- **建议**: 删除"或 pnpm"或验证 pnpm 支持后保留。
- **置信度**: 高。
- **严重度**: LOW

### M04 — `docs/guides/troubleshooting.md` 端口号不一致（LOW）

- **位置**: `docs/guides/troubleshooting.md:36`
- **现象**: `lsof -i :3000` 检查端口，但 `deployment.md:39` 和 `mcp_usage.md:9` 等均默认端口 `17831`。第 49 行 `curl http://127.0.0.1:3000/health` 同理。
- **影响**: 用户用此命令检查会漏判。
- **建议**: 统一为 `17831` 或写为占位符 `{port}`。
- **置信度**: 高。
- **严重度**: LOW

### M05 — `docs/blueprint/domain.md` 存储/大小限制表用旧常量名（LOW）

- **位置**: `docs/blueprint/domain.md:104-105`
- **现象**: `MAX_SESSION_SIZE_BYTES` 和 `MAX_SESSION_DURATION_MS` 使用了 `SESSION` 这个词，而 `domain.md` §4 明确"session 作为产品术语"被禁用（应使用 `capture`）。但这可能是常量实际名称的如实引用——需确认 `src/shared/constants.ts` 中常量是否已重命名。
- **影响**: 若常量未重命名，文档如实反映代码状态则无问题；若已重命名则为文档滞后。
- **建议**: 核实 `src/shared/constants.ts` 中常量实际名称后决定是否更新。
- **置信度**: 低。
- **严重度**: LOW

### M06 — `docs/tasks/index.md` T008 备注 ID 复用解释不清（LOW）

- **位置**: `docs/tasks/index.md:18`
- **现象**: T008 备注写"T008 ID 复用，旧 T008_phase5_finalize 已在 archive"。按 `CLAUDE.md` task 生命周期规则"恢复需求：新建新 ID"，不应复用 ID。这破坏了 ID 全局递增的唯一性语义，也给历史追溯造成混淆（两个不同的 T008 存在）。
- **影响**: 引用 T008 时需要额外查询上下文以确定指导哪个 T008。
- **建议**: 恢复需求应分配新 ID，在备注中互相引用。
- **置信度**: 高。
- **严重度**: LOW

### M07 — `docs/handoff.md` 分支状态可能过时（LOW）

- **位置**: `docs/handoff.md:23-49`
- **现象**: handoff 记录的 branch 为 `task_t002_shared_protocol_relocate`，记录于 2026-07-19 07:50。随后工作均在 main 分支进行（T008-T010 commits 在 main）。此 handoff 描述的是合并前的状态快照，标题写"repo layout refactor 完成"但与当前 main 分支状态不一致（main 已并入了所有变更）。
- **影响**: 作为历史快照仍有价值，但非当前状态描述。标题"完成"可能让人误判。
- **建议**: 追加新 handoff 段落描述 main 当前状态，或注明此条已合并。
- **置信度**: 高。
- **严重度**: LOW

### M08 — `docs/blueprint/architecture.md` 第 246 行 "12 个 MCP 工具" 计数说明不足（LOW）

- **位置**: `docs/blueprint/architecture.md:246`
- **现象**: "12 个 MCP 工具"。`domain.md` §2 列出 12 个工具名称，其中 4 个（`list_sessions` / `get_session` / `get_all_session_data` / `export_session`）是兼容别名。实际独立工具数为 12（含 4 别名），或 10 如果只算功能唯一工具。数字本身正确（12 个名称），但宜注明含兼容别名。
- **影响**: 无功能影响，纯文档精确度问题。
- **建议**: 可加上"含 4 兼容别名"的说明。
- **置信度**: 高。
- **严重度**: LOW

---

## 建议

1. **统一版本信息来源**: `package.json` 中的 vitest 已是 4.x，但 test.md 写 2.x。建议所有文档版本号不硬编码具体大版本，改为引用 `package.json`（如"见 package.json devDependencies"）。

2. **建立文档交叉引用校验**: `architecture.md` 引用的 `docs/specs/` 不存在、`mcp_usage.md` 的 `browser_no` 已过时、`test.md` 的旧 `src/agent/` 路径无人在重构后同步更新——反映出文档间缺乏自动断链检测。建议在 CI 中加入 markdown 链接检查（如 `markdown-link-check`）。

3. **`contributing_dev.md` 简化**: 当前文件大量重复 `architecture.md` 和 `conventions.md` 的内容（技术栈、目录结构、命名规范）。建议缩为"入门步骤 + 指向 blueprint 的链接"，避免维护多份副本。

4. **test.md 流程纪律归属**: §0 的 omni_powers 纪律要么融入 CLAUDE.md 主工作流，要么降级为历史参考。当前"强制执行"的口气与 CLAUDE.md 并列造成两套规则竞争。

---

## 不确定项

1. `docs/blueprint/domain.md:104-105` 中 `MAX_SESSION_SIZE_BYTES` / `MAX_SESSION_DURATION_MS` 是否已在 `src/shared/constants.ts` 中更名为 `MAX_CAPTURE_*`？若未改，则文档无误；若已改，需同步更新。本次审阅未追溯常量定义文件。

2. `docs/guides/test.md:154` 已有 "NEEDS CLARIFICATION" 标注关于 CLAUDE.md 与 playwright.config.ts 项目名不一致的问题。该标注本身说明此矛盾已知但未解决。建议在 plan.md 或 task 中正式跟踪。

3. `docs/blueprint/conventions.md:31` 的 `design_tokens.css` 路径问题取决于实际文件位置。若文件因构建需要保留两份副本则不构成错误。建议核实后决策。
