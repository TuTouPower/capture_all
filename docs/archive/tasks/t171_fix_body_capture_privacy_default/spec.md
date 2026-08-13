# Task spec

## 背景

`DEFAULT_CONFIG` 与 `DEFAULT_USER_CONFIG` 默认 `capture_request_body=true`、`capture_response_body=true`，单条上限 100MB。CDP request `postData` 与 response body 原样采集，`redact_data` 的 body helper 只做字节截断和 preview，无 MIME/key/value 脱敏。用户开始采集后，登录表单、OAuth/token、API key、PII 可明文进入 IndexedDB、导出与 Agent 上下文。`redact_data=true` 易让用户误以为 body 已统一脱敏。

## 契约区

### 范围

- body 采集默认值隐私化（默认关闭或显式 opt-in）。
- 保留 body 时按 MIME 脱敏：`application/x-www-form-urlencoded`、JSON、multipart 字段按敏感 key 脱敏，password/file 内容默认跳过；无法安全解析时提供 hash/长度/preview 而非完整内容。
- 导出选项能同时剥离 request body、response body、preview，并清晰显示脱敏覆盖边界。
- 同步公开文档中的 body 默认行为说明。

### 非范围

- 不改动 URL/header/input/keyboard/cookie 等既有脱敏规则。
- 不改变已落库历史数据的存储格式（仅影响新采集与导出边界）。

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

- [ ] AC-001：默认配置下，新采集的 request/response body 不被原始存储（默认关闭，UI/MCP 显式 opt-in 开启）。
- [ ] AC-002：开启 body 采集后，含 `password`/`token`/`api_key` 等敏感 key 的 form-urlencoded 或 JSON body 按敏感 key 脱敏。
- [ ] AC-003：无法安全解析的 body 以 hash/长度/preview 存储，不落盘完整原始内容。
- [ ] AC-004：导出提供独立剥离 request body、response body、preview 的选项，且默认行为与文档一致。
- [ ] AC-005：公开文档（README/PRIVACY）的 body 默认与脱敏边界描述与实现一致。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试：用多 MIME fixture 断言采集/脱敏/导出结果。

## 上下文区

- 来源：SEC-003（2026-08-13 核实，`63fcc01` body 默认全开，现行 archive specs 明确默认完整捕获）。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- fixture 覆盖 form-urlencoded、JSON、multipart、不可解析二进制；断言敏感 key 脱敏与 fallback 摘要。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- body 采集默认值已确认（2026-08-13 用户决策）：默认关闭，UI/MCP 显式 opt-in；开启后按 MIME 敏感 key 脱敏，无法安全解析时提供 hash/长度/preview。

### 风险与回退

- 风险：body 默认关闭影响诊断能力。
- 回退：UI/MCP 显式 opt-in 开关，advanced 用户可开启。

### 依赖与约束

- 与 `docs/archive/specs/privacy_redaction.md` 的现有脱敏范围保持一致并扩展 body 策略。

### Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：记录 body 采集默认值决策与 MIME 脱敏策略。
