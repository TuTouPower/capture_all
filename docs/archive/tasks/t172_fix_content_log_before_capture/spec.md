# Task spec

## 背景

content script 在 `<all_urls>`、`document_start` 注入，模块加载时、任何 capture 状态检查之前执行 `logger.info('Content script loaded', { url: window.location.href })`。Logger 默认 level 为 `debug`，info 条目进入 MessageLogTransport buffer，累计 20 条或 stop flush 时发送到 Service Worker 并持久化。用户未开始 capture 时，访问 URL（含 iframe、hash、fragment credential）仍可进入扩展诊断日志。

## 契约区

### 范围

- 删除模块加载时的 URL 日志，或仅在 active capture 后记录并使用 capture 的隐私配置。
- 将 content 的 log level 从 SW/user config 明确下发，在 Logger 创建前应用。
- 默认日志级别改为 `info`/`warn`（不再默认 `debug`）。

### 非范围

- 不改变 active capture 期间的正常日志行为。

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

- [ ] AC-001：未开始 capture 时访问页面，不产生含该页面 URL 的 app log 条目。
- [ ] AC-002：用户将 log level 设为 silent/warn 后，content 世界不写 info 级日志。
- [ ] AC-003：active capture 期间日志行为与既有采集隐私配置一致。
- [ ] AC-004：新增「未采集访问页面不产生 URL app log」与「silent 后 content 不写日志」测试通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试：mock content 加载 + logger transport 断言。

## 上下文区

- 来源：SEC-004（2026-08-13 核实，`6a7b094` 引入 URL 加载日志）。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- mock content logger 与消息下发；断言无 capture 时无 URL 日志、silent 时无写入。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无。

### 风险与回退

- 风险：降低日志粒度影响诊断。
- 回退：active capture 内保留详细日志，仅默认 level 提升。

### 依赖与约束

- 与 `src/shared/logger.ts` level 同步机制协同。

### Finalization 时更新的 blueprint

- 无。
