# Task review t191（reviewer_focus: 通用）

- task：`t191_fix_docs_drift`
- spec：`docs/tasks/t191_fix_docs_drift/spec.md`
- diff_anchor：`3e73f159fb531884166c49f6f3ea38abcf7f9de3`
- target：`git diff 3e73f159fb531884166c49f6f3ea38abcf7f9de3`
- round：1
- reviewed_at：2026-08-14 01:05 UTC+8

## Findings

### t191_gen_f001 - tests/unit 测试文件计数「约 194 个」与实际 195 个不符

- 严重度：minor
- 锚点：AC-001（contributing_dev.md 测试路径与当前仓库一致）、AC-002（test.md 目录结构与当前一致）
- 位置：`docs/guides/contributing_dev.md:44`、`docs/guides/contributing_dev.md:77`、`docs/guides/test.md:61`
- 问题：两篇文档均写「约 194 个」测试文件，实际为 195。复验：`find tests/unit -name '*.test.ts' | wc -l` = 195；`npx vitest list` 按唯一文件去重也是 195（vitest exclude 已排除 tests/e2e、tests/support 与 `**/*.spec.ts`，口径一致）。文档本 task 的目标即消除漂移、以源码/配置为唯一来源，此计数与实际差 1，属轻微计数漂移。带「约」字缓释，不影响任何可运行命令，不构成行为缺陷。
- 建议：将三处「约 194 个」改为「约 195 个」，或在测试中断言实际计数（如按 `tests/unit/*.test.ts` glob 数出文件数）防止再漂。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无（本轮为 Round 1）
- 本轮新发现：1 条（t191_gen_f001，minor）
- 未进表的提示：
  - `docs/guides/test.md:114`「构建产物 … 为 esbuild 单文件 bundle，不依赖 tsx 和 node_modules」：与命令表 `--external:ws` 并存（test.md:106-107 与 package.json 一致）。复验 `src/bridge/`、`src/mcp/` 无 `from 'ws'` import，且 `node_modules/ws` 未安装（ws 为 @modelcontextprotocol/sdk 可选依赖），故单文件产物大概率确实不依赖 node_modules；但 worktree 未构建 `artifacts/{bridge,mcp}`，无法以产物实证。该段为既有文本（不在本 diff 修改范围），建议后续构建后顺带核验。
  - `README.en.md:159` pin 场景「reuse the same value in extension settings」：two-token 模型下扩展设置为 Bridge enroll 生成的 instance_token（`src/bridge/server.ts` enroll 首次需 MCP token 或 pairing code、instance_token 由 Bridge 返回，见 `src/extension/background/agent_bridge_client.ts`），此处描述「复用同一值」与模型略有张力；该行为可选 pin 路径且为既有文本（不在本 diff），未判漂移，供后续参考。
  - `docs/guides/contributing_dev.md:119`「非 0600 拒绝读取」：实现为 `src/node_shared/bridge_token_file.ts:30-37` 先尝试 `chmod 0600` 收紧、收紧失败才拒绝。文档措辞为结果导向简化，效果成立，不改亦可。
- 总体判断：5 条 AC 全部实现且经独立复验，无未解决 critical / important，仅 1 条 minor 计数漂移。
- 系统性 follow-up：无
- AC 复验方式：
  - `AC-001`（contributing_dev.md 与仓库一致）：`re_verified`。目录树逐项对照磁盘（src/extension/{background,content,popup,dashboard,devtools,shared,_locales}、src/bridge、src/mcp、src/shared、src/node_shared、tests 四层、scripts 四个 mjs）；14 个捕获模块与 `src/extension/content/` 文件一一对应；build 链与 `package.json:24` 一致；端口 17831 与 `src/shared/constants.ts:69` 一致；token 解析优先级与 `src/bridge/config.ts:109-124` 一致；logger 示例的 `get_app_log_transport` 存在于 `src/extension/background/app_log_storage.ts:257`；`mcp token saved to` 打印存在于 `src/bridge/main.ts:61`；`/health` 免 token 存在于 `src/bridge/server.ts:478`。仅计数「约 194」差 1（见 f001）。
  - `AC-002`（test.md 与当前测试/构建一致）：`re_verified`。vitest.config.ts 的 exclude/coverage 逐行一致；playwright.config.ts 的 testDir/outputDir/trace/超时/NO_PROXY/webServer 逐项一致；project 表 9 个项目逐一比对 testMatch/workers/fullyParallel 全部吻合（含 e2e-ext 匹配 `e2e-T0001-ac3-verify/zoom`、e2e-cdp-retry.spec.ts 无 project 匹配）；`.mcp.json.example` 与 test.md:129-144 完全一致；17 个工具数由 `src/mcp/tools.ts:27-31`（TOOL_COMMANDS 15 + get_status + list_browsers）验证；`tests/support/fixtures/server.ts` 路径与 package.json:36 一致。
  - `AC-003`（domain.md 不再宣称已删结构）：`re_verified`。`grep '\bSession\b' src/` 仅命中注释文字（`cdp_event_router.ts:2`、`storage.ts:184`），无类型符号；`\bRecordEvent\b` 全仓仅本测试文件字符串；`\bcapture_mode\b` 无独立字段（仅 body_capture_mode/keyboard_capture_mode，文档已列例外）。「完全移除」表述精确。
  - `AC-004`（英文 README/PRIVACY two-token）：`re_verified`。SECURITY.md:38-40 的 two-token 定义与 README.en.md:67、PRIVACY.md:41 一致；全文 grep 无「must use the same token」「user-supplied token」「user-provided Bearer token」残留。
  - `AC-005`（Privacy fragment 链接）：`re_verified`。README.en.md:189 `## Permissions, privacy, and security` 按 GitHub 锚点规则派生 `permissions-privacy-and-security`，与 PRIVACY.md:63 链接一致；`npx vitest run tests/unit/docs_drift_consistency.test.ts` 11 用例全绿（fragment 用例真实解析 heading 后断言包含锚点，非恒真）。
  - coverage = 5 / 5

verdict: PASS

## Round 2 (2026-08-14 01:10 UTC+8)

### 前轮 finding 复核

- `t191_gen_f001`（minor，测试文件计数 194 vs 195）：**已消除**。以 diff 为准复验：
  - 三处计数统一改为「约 190+ 个」：`docs/guides/contributing_dev.md:44`（「tests/unit 下约 190+ 个用例文件」）、`docs/guides/contributing_dev.md:77`（「*.test.ts，约 190+ 个」）、`docs/guides/test.md:61`（「约 190+ 个 *.test.ts」）。措辞从精确数改为区间式，随新增测试不再漂移。
  - 无断言破坏：`docs_drift_consistency.test.ts` 的计数否定断言为 `not.toMatch(/约 80 个文件|80 个文件/)`（AC-002 用例），新表述「约 190+ 个」不含「80 个」字样，断言不受影响。
  - `npx vitest run` 全量通过：195 文件 / 1858 用例全绿（含 docs_drift_consistency.test.ts 11 用例），处置未引入回归。

### 本轮新发现

- 0 条。处置改动仅替换计数措辞，未触碰其余文档内容与测试。

### 未进表的提示

- 无新增。

### 总体判断

- 前轮唯一 minor finding 已落实且验证通过，无未解决 critical / important。

reviewed_scope: adae8a3032c34df5

verdict: PASS
