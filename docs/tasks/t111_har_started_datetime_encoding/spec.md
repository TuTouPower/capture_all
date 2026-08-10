# Task spec

## 背景

HAR 导出在 CDP-primary 路径 `startedDateTime` 退化为 1970；base64 响应未设 `content.encoding`。P1-16。

## 契约区

### 范围

- HAR 条目 startedDateTime 使用真实请求开始时间（ISO 8601），非 epoch 零点（除非真实时间就是该值）。
- body 以 base64 写出时 `content.encoding` 为 `base64`。
- 单测覆盖。

### 非范围

- 不改 HAR 其它字段语义（status/headers 等）除非为时间戳必需。
- 不改 JSON/JSONL 导出。

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

- [ ] AC-001：给定网络事件 timestamp/started 为已知非零时刻，导出 HAR 对应 entry.startedDateTime 解析后与该时刻误差在 1s 内（或字符串精确匹配实现所选格式）。
- [ ] AC-002：响应 body 按 base64 写入 HAR 时，entry.response.content.encoding === 'base64'。
- [ ] AC-003：UTF-8 文本 body 不错误标记为 base64 encoding（回归）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试。

## 上下文区

- 来源：docs/reviews/review_20260811_0111/evaluation.md P1-16；src_ext_bg_cdp_net/review.md f007 f008

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- 构造 NetworkRequest 数据调 exporter。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无

### 风险与回退

- 风险：时区格式与 HAR 工具兼容性——用 ISO8601 带 Z 或偏移。
- 回退：恢复旧时间与无 encoding。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
