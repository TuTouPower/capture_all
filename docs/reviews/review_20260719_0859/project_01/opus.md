# project_01 批次审阅报告（opus 视角）

## 当前模型判断依据

- `~/.claude/settings.json` 顶层 `model` 与 `env.ANTHROPIC_MODEL` 均为 `default_model`；主会话可见模型标识同此。
- Haiku/Sonnet/Opus 别名分别映射 `default_haiku[1m]` / `default_sonnet[1m]` / `default_opus[1m]`。
- 本路被显式请求 opus 视角；可观测配置无法确认别名底层具体版本号。
- 仅依据本路显式请求判断，不与其他路相互校对。

## 审阅范围

按 `docs/review_20260719_0859/MANIFEST.md` 中 `project_01` 区块全量审阅 20 个文件：

- `.claude/settings.json`
- `.github/ISSUE_TEMPLATE/bug_report.yml`
- `.github/ISSUE_TEMPLATE/config.yml`
- `.github/ISSUE_TEMPLATE/feature_request.yml`
- `.github/dependabot.yml`
- `.github/pull_request_template.md`
- `.github/workflows/ci.yml`
- `.gitignore`
- `.mcp.json.example`
- `.nvmrc`
- `AGENTS.md`
- `CHANGELOG.md`
- `CLAUDE.md`
- `CODE_OF_CONDUCT.md`
- `CONTRIBUTING.md`
- `LICENSE`
- `PRIVACY.md`
- `README.en.md`
- `README.md`
- `SECURITY.md`

并交叉核对 `src/bridge/`、`src/mcp/schemas.ts`、`src/mcp/tools.ts`、`src/extension/manifest.json`、`docs/guides/` 等本批外文件，仅用于判定本批内文档真实性，未计入"已全量审阅"范围。

## 高优先级问题（CRITICAL / HIGH）

### H1. README 与源码/SECURITY/guide 在 Bridge 结果回传上限上不一致（HIGH）

- 位置：`README.md:217`、`README.en.md:216` vs `SECURITY.md:40`、`docs/guides/mcp_usage.md:94`、`docs/guides/troubleshooting.md:63,128`、`docs/archive/omni_powers/op_blueprint/specs/agent_mcp.md:102`（历史规格也写 32，但现网代码与当前 guide 已升至 64）。
- 现象：两份 README "已知限制" 段写 "扩展结果回传上限为 32 MiB / extension result reply limit is 32 MiB"；其余权威文档与 `MAX_EXTENSION_RESULT_BODY_BYTES` 实际配置均为 64 MiB。
- 影响：用户据 README 估算 MCP 全量返回或导出大小时偏低，可能在 32–64 MiB 之间数据上误判能/不能一次返回；与 `PAYLOAD_TOO_LARGE` 错误码注释（troubleshooting 中 64MiB）产生认知冲突，损害文档可信度。
- 建议：把两份 README 的 32 MiB 改为 64 MiB，并在 CHANGELOG `[Unreleased] > Changed` 追加一行说明上限从 32 提升到 64（如历史上确实改过）。
- 置信度：高（多源印证）。
- 优先级：HIGH。

### H2. README 与 `.mcp.json.example` 的 token 占位符不一致（HIGH）

- 位置：`README.md:147`、`README.en.md:146` vs `.mcp.json.example:11`。
- 现象：README 指引用户 "将本地 `.mcp.json` 中的 `<YOUR_BRIDGE_TOKEN>` 替换为同一 Token"，但 `.mcp.json.example` 中实际占位符是 `<AUTO_GENERATED_BY_BRIDGE>`。用户按 README 搜索 `<YOUR_BRIDGE_TOKEN>` 将找不到目标字符串。
- 影响：首次接入 MCP 客户端的用户复制示例后不知该替换哪个占位符；可能误以为示例损坏或自己生成错误。
- 建议：统一占位符。推荐把 `.mcp.json.example` 改为 `<YOUR_BRIDGE_TOKEN>` 并与 README 一致；或修改 README 引用真实占位符 `<AUTO_GENERATED_BY_BRIDGE>`。
- 置信度：高。
- 优先级：HIGH。

### H3. `.mcp.json.example` 占位符命名与硬约束 "token 由用户提供" 矛盾（HIGH）

- 位置：`.mcp.json.example:11`；对照 `CLAUDE.md:141` "token 由用户提供，禁止硬编码、默认值或示例值"，`SECURITY.md:36–38` "use a random value supplied by the user"。
- 现象：占位符名为 `<AUTO_GENERATED_BY_BRIDGE>`，字面暗示 token 由 Bridge 自动生成并写回，但 README 与 SECURITY 明确要求用户自行生成随机 token 后填入；Bridge 实际确有 fallback 生成路径（`src/bridge/config.ts:77 generate_bridge_token`），优先级是 `CLI > env > persisted file > generated`，生成仅在所有来源缺失时兜底。
- 影响：示例文件直接弱化安全要求，引导用户依赖自动生成；与项目把"用户提供 token"作为安全前提的整体设计冲突。
- 建议：占位符改为 `<YOUR_BRIDGE_TOKEN>`，并在 example 顶部加注释明确"由用户自行生成的随机值，禁止使用示例值"；如果项目实际允许 bridge 自动生成并写回（fallback 模式），应在 README/SECURITY 显式说明生成条件与风险，再让 example 命名与此一致。
- 置信度：中—高。
- 优先级：HIGH。

## 中低优先级问题（MEDIUM / LOW）

### M1. LICENSE 缺少顶部版权声明（MEDIUM）

- 位置：`LICENSE:190` 模板段 `Copyright [yyyy] [name of copyright owner]`。
- 现象：Apache-2.0 附录要求附上 `Copyright <year> <owner>` 实际值，本仓库 LICENSE 只保留了模板占位符，未填写年份与版权人；`package.json` 也只有 `"license": "Apache-2.0"` 字段。
- 影响：分发或被 fork 时法律上的版权声明不完整；社区合规检查（如 license-scan）通常会标记。
- 建议：在 LICENSE 顶部追加 `Copyright 2026 Capture All Contributors`（或项目认定的版权人），与 README/SECURITY 引用风格一致。
- 置信度：高。
- 优先级：MEDIUM。

### M2. README "Chrome ≥ 88" 与 manifest 不对应（MEDIUM）

- 位置：`README.md:92`、`README.en.md:91` vs `src/extension/manifest.json`（未声明 `minimum_chrome_version`）。
- 现象：README 浏览器支持表声明 "Chrome ≥ 88"，但 manifest.json 未设 `minimum_chrome_version` 字段强制该最低版本；项目实际依赖 MV3 service_worker、`chrome.action`、`chrome.debugger` 等较新 API。
- 影响：用户在 Chrome 88–100 之间安装可能在某些 API 上失败但 README 给了"完全支持"承诺；与 SECURITY/PRIVACY 反复强调的"无兼容性保证"基调也略冲突。
- 建议：要么在 manifest.json 显式声明 `"minimum_chrome_version": "88"`（或经实际测试的真实最低版本），要么把 README 措辞改成"建议 Chrome 最新稳定版"，避免与 manifest 不一致的具体版本号。
- 置信度：中。
- 优先级：MEDIUM。

### M3. `.gitignore` 未忽略 `*.mjs` 之外的本地构建产物，且 `e2e/**/dist/` 与现有 e2e 结构可能错配（MEDIUM）

- 位置：`.gitignore:18–21`。
- 现象：
  1. 注释写 "E2E 构建产物与浏览器 profile（只固化 *.spec.ts / 小 runner）"，但实际忽略项是 `e2e/**/artifacts/`、`e2e/**/dist/`、`**/e2e-data-*/`。当前仓库 e2e 目录结构以 `tests/e2e/` 为根（见 manifest 与 tests/e2e/* 测试），并没有顶层 `e2e/` 目录；`e2e/**/` glob 实际匹配不到任何路径。
  2. `artifacts/` 已在 line 4 忽略，`e2e/**/artifacts/` 重复。
- 影响：注释承诺的"只固化 *.spec.ts"未被规则兑现；如果将来 e2e 产物放在 `tests/e2e/<T>/artifacts/` 或 `dist/` 下，会被误入库。
- 建议：将 `e2e/**/` 改为 `tests/e2e/**/{artifacts,dist}/`，或与实际目录结构对齐；删除冗余规则并相应更新注释。
- 置信度：中。
- 优先级：MEDIUM。

### M4. CI 未对 lockfile/PR 同源做校验，`npm audit` 双跑含义模糊（MEDIUM）

- 位置：`.github/workflows/ci.yml:28–29`。
- 现象：quality job 连跑 `npm audit --omit=dev` 与 `npm audit`。前者只审生产依赖，后者审全部（含 dev）。但 `audit` 默认非阻塞（exit 0 除非 `--audit-level` 触发），且未配置 `--audit-level` / `--omit=dev` 阈值，CI 不会因漏洞失败。
- 影响：声明上 CI 跑了 audit，实际上即使有 high/critical 漏洞 CI 也会绿；与 `CONTRIBUTING.md:44` 中"提交前应跑 `npm audit --omit=dev`"暗示的安全期望不符。
- 建议：明确审计策略，例如 `npm audit --omit=dev --audit-level=high`，或在 CI 注释中说明这是"信息收集步骤，非门禁"，避免误导。
- 置信度：中。
- 优先级：MEDIUM。

### M5. CI pin 的 actions 版本标签与 SHA 不匹配（MEDIUM）

- 位置：`.github/workflows/ci.yml:19,20,35,36`。
- 现象：注释分别为 `# v7.0.0`（actions/checkout）与 `# v6.4.0`（actions/setup-node），但截至本审阅时点，actions/checkout 最新主版本为 v4，actions/setup-node 为 v4；v7.0.0 / v6.4.0 标签在 upstream 不存在，注释与 SHA 实际指向的版本号无法核对。
- 影响：将来 Dependabot（`.github/dependabot.yml` 已配 `github-actions` ecosystem）更新这些 action 时，将基于错误基线生成 PR；review 者难以从注释判断实际版本。
- 建议：核对 SHA 实际指向的 upstream release tag，把注释更正为真实版本号；或使用 `@v4`、`@v5` 等可读 tag 配合 SHA pin。
- 置信度：中（基于已知上游 release 历史；如本仓库使用私有 fork 或标签映射，需以仓库实际为准）。
- 优先级：MEDIUM。

### M6. `CODE_OF_CONDUCT.md` 与 `SECURITY.md` 报告渠道声明不完整但表述不一致（LOW）

- 位置：`CODE_OF_CONDUCT.md:64–69`、`SECURITY.md:11`。
- 现象：CODE_OF_CONDUCT 写 "No verified private conduct-reporting channel is currently published"，建议"先不要在公开 issue 提敏感细节"；SECURITY 写 "GitHub Private Vulnerability Reporting is enabled"。两者并无矛盾（一个是行为准则、一个是漏洞报告），但 CODE_OF_CONDUCT 未指向 SECURITY.md 的 GitHub Private Reporting 作为可选私下联系通道，社区成员可能找不到任何"私下联系维护者"的入口。
- 影响：行为准则事件难以及时私下送达维护者；用户体验上不友好。
- 建议：CODE_OF_CONDUCT "Enforcement" 段加一句 "For security or vulnerability matters, see SECURITY.md; for other conduct reports, …"，让两个文档互相链接。
- 置信度：中。
- 优先级：LOW。

### M7. `.github/ISSUE_TEMPLATE/config.yml` 链接 URL 在仓库改名/搬迁后会失效（LOW）

- 位置：`.github/ISSUE_TEMPLATE/config.yml:4`。
- 现象：硬编码 `https://github.com/TuTouPower/capture_all/blob/main/SECURITY.md`。README、CONTRIBUTING 等多数文件使用相对路径，唯独此处与 README badge 使用绝对 URL。
- 影响：仓库名变更或镜像发布时链接需手动维护。
- 建议：保留绝对 URL，但在变更检查清单中加入"同步 issue template link"项；或接受现状。
- 置信度：高。
- 优先级：LOW。

### M8. `SECURITY.md` 描述 CSP 时措辞略有夸大（LOW）

- 位置：`SECURITY.md:30`。
- 现象：声明 "Content Security Policy … blocks plugin objects"；实际 `src/extension/manifest.json` CSP 为 `script-src 'self'; object-src 'self'`，`object-src 'self'` 允许扩展自身 object/embed，并非完全"blocks plugin objects"。
- 影响：误导读者认为 object/embed 被完全阻断；属轻微文档失真。
- 建议：改为 "restricts plugin objects to the extension itself"。
- 置信度：高。
- 优先级：LOW。

### M9. `CHANGELOG.md` 中 `[Unreleased] > Added` 把 Apache-2.0 与社区政策列为"新增"，与历史归档叙事错位（LOW）

- 位置：`CHANGELOG.md:10–14`。
- 现象：`[Unreleased]` 列入 "Apache-2.0 license and bilingual public project entry points" 等开源治理项；但 `[0.1.0]` 已声明 "Initial source version"。读起来像许可证与文档在 0.1.0 之后才补加，这与 `package.json.license=Apache-2.0` 已是 0.1.0 的事实不符。
- 影响：版本-变更顺序语义不清晰；下游打包或法务追溯时可能困惑。
- 建议：在 `[0.1.0]` 段补一句 "Apache-2.0 license" 已存在，或把 `[Unreleased] > Added` 中"Apache-2.0 license"改为 "Public license and governance documentation"。
- 置信度：中。
- 优先级：LOW。

### M10. `CONTRIBUTING.md` 命名规范与现有 TypeScript 公共 API 命名不完全一致（LOW）

- 位置：`CONTRIBUTING.md:53`。
- 现象：规定 "Use `snake_case` for variables, functions, files, and directories unless an established platform convention requires another form. Existing TypeScript components and public types keep their established names." 同时豁免"已有公共类型"。这是合理的豁免，但项目内大量源码（`src/extension/background/agent_bridge_client.ts`、`src/extension/dashboard/dashboard_detail.ts` 等）以及 React 风格的类组件、TypeScript 类型都采用 camelCase/PascalCase，新贡献者读到第一句容易误以为应当批量重命名。
- 影响：风格条款措辞可能误导新贡献者。
- 建议：把豁免语序前置——"TypeScript / TSX 模块沿用 camelCase / PascalCase；只在新建独立于框架的纯逻辑模块时使用 snake_case"，与 `docs/blueprint/conventions.md` 保持一致。
- 置信度：中。
- 优先级：LOW。

## 改进建议

1. **统一 body 上限与 token 占位符**：H1 / H2 / H3 是同主题的三个面（文档-代码一致性 + 安全约束一致性），建议一并处理：选定权威上限值（64 MiB）、选定占位符（`<YOUR_BRIDGE_TOKEN>`）、选定 token 来源叙事（用户提供为主，bridge 自动生成仅在兜底且需在文档中明示），随后同步 README、README.en、SECURITY、.mcp.json.example、CHANGELOG。
2. **CI audit 策略显式化**：明确 `npm audit` 是否作为门禁，避免"看起来安全但实际不阻塞"的虚假保护。
3. **LICENSE 补版权行**：开源治理基础项，低成本高合规收益。
4. **`.gitignore` 与 e2e 真实目录结构对齐**：避免将来误入库。
5. **Actions SHA 注释更正**：Dependabot 启动前的清理项。

## 不确定项 / 可能误报

- **M5 actions 版本注释**：本审阅基于公开 actions/checkout 与 actions/setup-node 的 release 历史（截至 2026/07 最大主版本分别为 v4、v4）。若本仓库采用了私有 fork 或 marketplace 重标签，注释 v7.0.0 / v6.4.0 可能确实对应私有 tag，此时该项为误报。建议核对仓库 Dependabot 实际是否能解析这些 SHA。
- **M3 `.gitignore` e2e glob**：基于本批可见文件清单推断 e2e 根目录在 `tests/e2e/`。若历史上曾有顶层 `e2e/` 目录已被清理，则 `e2e/**/artifacts/` 规则属于"防御性保留"，可接受。
- **AGENTS.md 与 CLAUDE.md 完全相同**：本批中 `AGENTS.md` 与 `CLAUDE.md` 内容逐字一致（149 行）。若项目策略是"同一份 agent 行为入口，两个文件名兼容不同 agent CLI"，这是合理冗余；若不是策略性同步，则属重复维护风险。本审阅不判定方向，仅提示。
- **CHANGELOG 与 SECURITY 对 0.1.0 的描述**：是否真存在过"先发布 0.1.0、后补 Apache-2.0"的历史，需要查 git history 才能定论，本审阅未深入。
- **`SECURITY.md:36` "timing-safe hash comparison"**：本批无法验证 Bridge 是否真用 timing-safe 比较，需查 `src/bridge/server.ts`。若实现与声明不符将升为 HIGH，但需更多上下文，不在本批范围。
