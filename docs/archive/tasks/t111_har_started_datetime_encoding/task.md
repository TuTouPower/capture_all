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

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：给定网络事件 timestamp/started 为已知非零时刻，导出 HAR 对应 entry.startedDateTime 解析后与该时刻误差在 1s 内（或字符串精确匹配实现所选格式）。
- [ ] AC-002：响应 body 按 base64 写入 HAR 时，entry.response.content.encoding === 'base64'。
- [ ] AC-003：UTF-8 文本 body 不错误标记为 base64 encoding（回归）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试。

## 上下文区

- 来源：docs/reviews/review_20260811_0111/evaluation.md P1-16；src_ext_bg_cdp_net/review.md f007 f008

### 有意不测

- 无

### 测试策略

- 构造 NetworkRequest 数据调 exporter。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：时区格式与 HAR 工具兼容性——用 ISO8601 带 Z 或偏移。
- 回退：恢复旧时间与无 encoding。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
