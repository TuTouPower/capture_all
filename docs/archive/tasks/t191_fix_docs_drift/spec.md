# Task spec

## 背景

多份文档与实际实现漂移：`contributing_dev.md` 展示旧的 `src/agent`/`src/background` 结构且示例命令/端口/token 已失效；`docs/guides/test.md` 描述归档时代目录、构建链与 MCP 注册方式；`docs/blueprint/domain.md` 宣称已删除类型/字段存在、`capture_mode` 仍属契约、禁用术语「完全移除」与现状冲突；`docs/specs/content_postmessage_nonce.md` 与 t121 HMAC 不符（见 t174）；英文 README/PRIVACY 保留过时的共享 user-token 模型（见 TD-007）；Privacy 文档链接到不存在的 README fragment。

## 契约区

### 范围

- 从当前目录树、`package.json`、`src/shared` API、`.mcp.json.example`、`src/mcp/tools.ts` 重写 `contributing_dev.md`、`docs/guides/test.md`。
- 修正 `docs/blueprint/domain.md` 的过期陈述，精确描述已删除类型/字段、`capture_mode` 与 MCP alias 现状。
- 英文 README/PRIVACY 改为 two-token 零配置模型，与 `SECURITY.md` 一致。
- 修复 Privacy 文档无效 fragment 链接。

### 非范围

- 不改动 `docs/specs/content_postmessage_nonce.md`（见 t174）。
- 不改变实现代码（仅文档）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->
只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。
<!-- /规范 -->

- [ ] AC-001：`contributing_dev.md` 的目录树、命令、端口、token、测试路径与当前仓库一致，示例可运行。
- [ ] AC-002：`docs/guides/test.md` 的 vitest/playwright 配置、目录结构、构建命令、MCP 注册与工具名与当前一致。
- [ ] AC-003：`docs/blueprint/domain.md` 不再宣称已删除的 `Session`/`RecordEvent` alias、`capture_mode` 字段存在，「完全移除」表述精确列出例外。
- [ ] AC-004：英文 README/PRIVACY 与 `SECURITY.md` 的 two-token 零配置模型一致，无共享 user-token 过时表述。
- [ ] AC-005：Privacy 文档链接指向存在的 README fragment，且文档测试覆盖该链接。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试：文档与源码/配置的一致性静态检查 + 既有 `public_docs.test.ts`。

## 上下文区

- 来源：DD-002、DD-003、DD-004、TD-007、TD-008、TD-009、TD-012（2026-08-13 核实）。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- 以 `package.json`/`vitest.config.ts`/`playwright.config.ts`/`.mcp.json.example`/`src/mcp/tools.ts` 为唯一来源；断言文档路径与命令可解析。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无。

### 风险与回退

- 风险：重写过程中引入新的文档漂移。
- 回退：由源码/配置生成或加一致性检查，避免手工计数。

### 依赖与约束

- 与 t174 的 spec 更新协同，避免冲突。

### Finalization 时更新的 blueprint

- `docs/blueprint/domain.md`：修正过期陈述（本 task 直接产出）。
