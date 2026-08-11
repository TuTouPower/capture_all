# Task spec

## 背景

启用 `redact_data` 与 `redact_url_query` 时，`redact_url` 只检查顶层 query key；非敏感参数值内嵌的 absolute/base-resolved、path-relative、root-relative、query-relative、protocol-relative 或编码 query 均不会递归脱敏。敏感值可进入本地采集记录、应用日志、导出及 MCP 查询结果，属于隐私脱敏机制不完整。

## 契约区

### 范围

- 修复 `src/shared/redaction.ts` 对非敏感外层参数值内嵌 query 的递归脱敏，覆盖 plain 与 percent-encoded 值。
- 覆盖 absolute/base-resolved、path-relative、root-relative、query-relative、protocol-relative 等外层与内层组合。
- 为 p018 列出的运行入口补接线级回归，防止 helper 修好后调用链仍泄露。

### 非范围

- 不处理 p017 的三元表达式误脱敏；Logger 任意文本扫描边界由独立 task 处理。
- 不删除或重新接线当前 dormant/unreachable 的 8 个 handler 入口；只确保共享 helper 修复后这些路径若未来启用不继承缺陷。
- 不改变敏感参数清单与 `[REDACTED]` 占位符语义。

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

- [ ] AC-001：`redact_url` 对 absolute/base-resolved 外层中非敏感参数值内嵌的 query 递归脱敏，内层敏感值消失并保留 `[REDACTED]`，非敏感结构不被破坏。
- [ ] AC-002：`redact_url` 对 path-relative、root-relative、query-relative、protocol-relative 外层中内嵌 query 递归脱敏；plain 与 `%3F`/`%3D` 编码值均被覆盖。
- [ ] AC-003：form、extension network/CDP/WebSocket、Logger 与 external CDP Bridge 的运行入口在嵌套 query 输入下，最终存储/输出对象不含内层敏感值明文。
- [ ] AC-004：顶层敏感 key 与既有内嵌 absolute URL 场景的脱敏行为不回退；`url_status` 与实际改写结果一致。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- AC-001：全部 AC 可自动测试。

## 上下文区

- 来源：p018（2026-08-11 重新完整分析；确认隐私脱敏产品缺陷，10 种 outer/inner 组合复现泄露，运行入口 10 处与 dormant 入口 8 处已清点；复现线索 `.scratch/reproduce_p018.ts`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- helper 层表驱动交叉覆盖 absolute/base-resolved、path/root/query/protocol-relative、plain/encoded 与嵌套形态；断言 secret 消失、占位存在、非敏感结构保留、`url_status` 与改写一致。
- 接线层按运行入口族补回归：form base-resolved action、extension network/CDP/WebSocket、Logger、external CDP Bridge request/response；最终存储/输出对象不得含明文。dormant handler 补直调或与删除决策同步处理。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 编码嵌套 query 的逐层解码深度与终止条件：已核实（s002 spike，2026-08-11）。单层 `decodeURIComponent` 识别 `%3F`/`%3D` 编码值并脱敏；双编码（`%253F`）单层解码后仍是 `%3F` 不触发递归，避免重复解码误判；`MAX_DEPTH=5` 终止深层嵌套链（`?next=?next=?next=?token=x` 正常终止且敏感值仍脱敏）。plain 值原位替换嵌套子串，encoded 值解码重组后 `encodeURIComponent` 写回保持 URL 编码合法性。实现与测试按此规则固化。

### 风险与回退

- 风险：递归解析可能误改非敏感嵌套结构、引入重复解码或递归深度问题；覆盖面扩大可能影响所有 URL 调用入口。
- 回退：恢复 `redact_url` 现有实现；保留 p018 复现矩阵核对回退后行为。

### 依赖与约束

- 遵循安全编码约定：启用 `redact_data` 与 `redact_url_query` 时敏感 query 不得明文进入本地记录、日志、导出或 MCP 结果；保留 URL 非敏感结构可用性。

### Finalization 时更新的 blueprint

- `docs/specs/privacy_logger_stack_redact_url.md`：更新嵌套 query 递归脱敏覆盖范围。
