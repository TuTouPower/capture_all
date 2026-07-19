# project_01 审阅报告 (sonnet)

## 当前模型判断依据

`~/.claude/settings.json` 顶层 `model` 为 `default_model`，`env.ANTHROPIC_MODEL` 也为 `default_model`；主会话可见模型标识同为 `default_model`。Haiku/Sonnet/Opus 默认别名分别为 `default_haiku[1m]`、`default_sonnet[1m]`、`default_opus[1m]`。本路被指派为 sonnet 视角。

## 审阅范围

20 文件，1672 行，逐文件逐行审阅：

- `.claude/settings.json` (15)
- `.github/ISSUE_TEMPLATE/bug_report.yml` (103)
- `.github/ISSUE_TEMPLATE/config.yml` (5)
- `.github/ISSUE_TEMPLATE/feature_request.yml` (70)
- `.github/dependabot.yml` (19)
- `.github/pull_request_template.md` (24)
- `.github/workflows/ci.yml` (42)
- `.gitignore` (21)
- `.mcp.json.example` (15)
- `.nvmrc` (1)
- `AGENTS.md` (149)
- `CHANGELOG.md` (31)
- `CLAUDE.md` (149)
- `CODE_OF_CONDUCT.md` (137)
- `CONTRIBUTING.md` (92)
- `LICENSE` (202)
- `PRIVACY.md` (67)
- `README.en.md` (227)
- `README.md` (228)
- `SECURITY.md` (75)

## 高优先级问题（CRITICAL / HIGH）

### H-1. README.md / README.en.md 扩展结果回传上限与源码不一致

- **位置**: `README.md:217`, `README.en.md:216`
- **现象**: 两份 README 均写 "extension result reply limit is 32 MiB"；`SECURITY.md:40` 写 64 MiB。源码 `src/bridge/server.ts:42` 定义 `MAX_EXTENSION_RESULT_BODY_BYTES = 64 * 1024 * 1024`。
- **影响**: README 是主要公开入口，用户和贡献者依据错误上限做容量规划，可能导致误判请求能否通过 Bridge。
- **建议**: 将 README.md 和 README.en.md 中 32 MiB 改为 64 MiB，与 SECURITY.md 和源码对齐。
- **置信度**: 高（源码 + SECURITY.md 二对一）
- **优先级**: HIGH

### H-2. AGENTS.md 与 CLAUDE.md 完全重复

- **位置**: `AGENTS.md` 全文, `CLAUDE.md` 全文
- **现象**: `diff` 确认两文件 149 行完全一致（逐字节相同）。
- **影响**: 两份维护同一内容，更新一份时极易遗漏另一份导致漂移。`AGENTS.md` 供 Codex/Gemini 等非 Claude agent 阅读，`CLAUDE.md` 供 Claude Code 阅读；当前内容 100% 重复意味着可以只维护一份并让另一份引用，或拆分为共享规则 + 平台特定前缀。
- **建议**: 方案一：`AGENTS.md` 引用 `CLAUDE.md`（`See CLAUDE.md for full project instructions.`）；方案二：提取公共部分到 `_INSTRUCTIONS.md`，两文件各引用并附加平台特定段落。
- **置信度**: 高（diff 验证）
- **优先级**: HIGH

## 中低优先级问题（MEDIUM / LOW）

### M-1. .mcp.json.example 与 README 占位符命名不一致

- **位置**: `.mcp.json.example:11`, `README.md:147`, `README.en.md:146`
- **现象**: `.mcp.json.example` 中 token 占位符为 `<AUTO_GENERATED_BY_BRIDGE>`；README 指引用户将 `<YOUR_BRIDGE_TOKEN>` 替换为实际 token。两个占位符名不同，用户可能困惑哪个是正确的。
- **影响**: 配置混淆，轻微。实际上两个都是占位符，不会导致功能错误，但不一致增加认知负担。
- **建议**: 统一占位符名称，推荐使用 `<YOUR_BRIDGE_TOKEN>` 以匹配 README 说明。
- **置信度**: 高
- **优先级**: MEDIUM

### M-2. CODE_OF_CONDUCT.md Enforcement 段落承认无可用举报渠道

- **位置**: `CODE_OF_CONDUCT.md:65-69`
- **现象**: "No verified private conduct-reporting channel is currently published."
- **影响**: 社区行为准则声称有 enforcement 机制但无实际可用渠道，对潜在受害者而言是空头承诺。符合项目早期阶段现状，但应在成熟后优先补齐。
- **建议**: 短期保留现状并注明时间线；中期建立专用邮箱或 GitHub 私有举报通道。
- **置信度**: 高（文件原文自述）
- **优先级**: MEDIUM

### M-3. SECURITY.md "Extension result bodies" 与 README "reply limit" 措辞差异

- **位置**: `SECURITY.md:40` vs `README.md:217` / `README.en.md:216`
- **现象**: SECURITY.md 用 "Extension result bodies"，README 用 "extension result reply limit"。虽然 H-1 已覆盖数值不一致，但措辞本身也有差异：前者指"扩展回传的 result body 大小"，后者指"Bridge 向扩展发送的 reply 大小"。方向可能相反。
- **影响**: 如指代的是同一限制则仅是措辞问题；如指代不同限制则需要更深入核实。
- **建议**: 核实 `MAX_EXTENSION_RESULT_BODY_BYTES` 的语义方向（扩展发送给 Bridge 还是 Bridge 返回给扩展），统一文档措辞。源码上下文显示该常量用于限制扩展回传给 Bridge 的大小，因此 README "reply limit" 有方向误导之嫌。
- **置信度**: 中
- **优先级**: MEDIUM

### L-1. LICENSE 附录模板未填写版权信息

- **位置**: `LICENSE:190`
- **现象**: `Copyright [yyyy] [name of copyright owner]` 仍为模板占位符。
- **影响**: 法律上不影响 Apache-2.0 正文条款生效，但附录是指导性内容，未填写可能给使用者带来困惑。
- **建议**: 填入实际年份和版权持有者名称，或删除附录段落（非必需）。
- **置信度**: 高
- **优先级**: LOW

### L-2. .gitignore 未排除 `docs/review_*/` 新建审阅目录

- **位置**: `.gitignore`
- **现象**: `.gitignore` 排除了 `docs/archive/`、`artifacts/`、`data/`、`.scratch/`，但未显式排除 `docs/review_*/` 审阅产物目录。
- **影响**: 审阅报告可能被意外 commit 进版本库。取决于项目是否打算入库审阅报告——如 CLAUDE.md 所述 `docs/reviews/RNN_slug/` 是入库的，但 `docs/review_20260719_0859/` 是新命名模式，与既有 review 路径不同。
- **建议**: 确认 `docs/review_*` 目录的生命周期。如为临时产物，加入 `.gitignore`；如应入库则无需处理。
- **置信度**: 中
- **优先级**: LOW

## 改进建议

1. **README 数值维护流程**: 建立"源码常量变更 -> 同步 README + SECURITY.md"的 checklist 或自动化扫描（如 `scan_tracked_tree.mjs` 增加硬编码数值比对）。
2. **AGENTS.md / CLAUDE.md 去重**: 上文 H-2 已述。
3. **模板占位符统一**: `.mcp.json.example`、README 中的 token 占位符统一命名；同时考虑在 SessionStart hook 的 `_comment` 中也用同一名称。

## 不确定项 / 可能误报

1. **ci.yml Actions SHA**: `actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0` 标注 v7.0.0，`actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e` 标注 v6.4.0。这些版本号在 2026-07 看来合理，但未逐一校验 SHA 与 tag 的对应关系。置信度：中，需要 `gh api` 或手动校验。
2. **M-3 措辞方向**: SECURITY.md 和 README 对"extension result body"的方向描述可能相反（扩展发出 vs 接收）。需阅读 `server.ts` 上下文才能确定，仅凭文档无法完全判定。置信度：中。
