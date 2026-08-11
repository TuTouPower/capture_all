# Task spec

## 背景

Logger 对任意文本中的 URL 子串扫描只用 `?key=value` 判断 URL，导致 `cond?token=x:y` 这类 JavaScript 三元表达式被误当敏感 query，正文被改写成 `cond?token=[REDACTED]`。该误判降低排障日志可信度；同时简单收紧字符集又会漏掉合法冒号 query 与 data URL/base64 query。用户已确认采用边界启发式：只对具备明确 URL 上下文的片段启用任意文本扫描。

## 契约区

### 范围

- 调整 `src/shared/logger.ts` 任意文本 URL 子串扫描的边界判定及其 `sanitize_string` 消费点。
- 按边界启发式修复三元文本误脱敏，并保持明确 URL、合法冒号 query、data URL/base64 query 的脱敏能力。
- 补 Logger 表驱动回归测试。

### 非范围

- 不修复 p018 的嵌套 query 漏脱敏；二者机制与修复面不同，由独立 task 处理。
- 不改变 network、form、Bridge 等已知 URL 字段的 `redact_url` 调用契约。
- 不引入完整 JavaScript parser 作为创建期既定方案。

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

- [ ] AC-001：Logger 净化 `branch result: cond?token=x:y` 时逐字保留原文；message、嵌套 details 与 Error 文本中的同类三元形态均不被 `[REDACTED]` 改写。
- [ ] AC-002：Logger 仍对具备明确 URL 边界的绝对 URL、独立 `?query` 与 `/path?...` 片段脱敏，敏感值消失且保留 `[REDACTED]` 占位。
- [ ] AC-003：合法冒号 query、data URL/base64 query 与普通 `=` padding query 继续按敏感参数脱敏；修复不引入静默 false negative。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- AC-001：全部 AC 可自动测试。

## 上下文区

- 来源：p017（2026-08-11 重新完整分析；确认产品缺陷与已确认机制位点 `URL_SUBSTRING_PATTERN`/`sanitize_string`；用户确认边界启发式契约；复现线索 `.scratch/p017_redact_url_ternary_remainder_repro.ts`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- 直接触达生产 `sanitize_log_value`/`Logger.write`，采用表驱动回归。
- 负例断言三元文本逐字保留；正例同时守住绝对 URL、独立 `/path?...`、独立 `?query`、合法冒号 query、data URL/base64 query 与普通 padding query，断言敏感值消失且 `[REDACTED]` 存在。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 边界启发式的最终判定规则：已核实（s001 spike，2026-08-11）。候选规则为 bare-query 与 path-query 分支加 lookbehind `(?<=^|[=\s([,<"'])`，绝对 URL 分支不变；13/13 用例验证三元（紧邻）/可选链/无斜杠相对路径保留原文，绝对 URL/独立 `?query`/`/path?...`/合法冒号 query/data URL/base64 query 均脱敏。已确认收缩面：
  - 无斜杠相对路径（`file?token=x`）退出任意文本扫描（用户确认的边界启发式语义）。
  - 带空格三元（`cond ?token=x:y`）与独立 `?query` 同享 `\s` URL 边界语义，会被当作 query 脱敏；这是 `\s`=URL 边界判定的已知权衡，非静默 false negative。
  - 紧邻三元（`cond?token=x:y`）与可选链（`user?.token`）不受影响。
  实现与测试按此规则固化。

### 风险与回退

- 风险：边界启发式过紧会漏脱敏合法相对 URL，过松仍误改三元文本。
- 回退：恢复现有扫描规则；保留 p017 的完整分析矩阵作为对照。

### 依赖与约束

- 遵循安全编码约定：敏感 URL query 必须脱敏；同时不得无依据改写非 URL 诊断文本。

### Finalization 时更新的 blueprint

- `docs/specs/privacy_logger_stack_redact_url.md`：更新任意文本 URL 扫描的边界启发式与隐私覆盖边界。
