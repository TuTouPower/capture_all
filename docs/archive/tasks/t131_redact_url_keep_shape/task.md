# Task spec

## 背景

脱敏行为三处不一致：redact_url 对绝对 URL 无条件 new URL().toString() 改写原文（破坏回放匹配）；content 侧 websocket_capture 与 network_hook fallback 路径未套 redact_url（?token= 直落 IndexedDB）；logger.sanitize_value 仅脱 URL 子串，credential 形字段明文入 app_logs。同一配置三种行为。

## 契约区

### 范围

- 修复 review finding：intensive-review 合并：H-3 redact_url 无条件规范化 + H-5 content ws/fallback 未脱敏 + H-19 logger credential 明文

### 非范围

- 不在本 task 处理的相关联问题（若有，见上下文区来源）

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001: redact_url('http://example.com', true) 无敏感参数时返回原串（不追加尾斜杠、不降 host），url_status='captured'
- [ ] AC-002: 含敏感 query 参数时按既有规则脱敏为 [REDACTED]，url_status='redacted'，其余参数与形态保留
- [ ] AC-003: 相对 URL 路径行为不变（无 query 原样返回）
- [ ] AC-004: 嵌套 query 递归脱敏（t114 语义）不受影响
- [ ] AC-005: websocket_capture 接收侧 ws_url 按 redact_data && redact_url_query 脱敏，url_status 反映结果
- [ ] AC-006: ws 消息 data_preview 在 redact_data=true 时不落明文（置 '[REDACTED]' 或等价），消息长度/方向等元数据保留
- [ ] AC-007: network_hook fallback 路径 URL 按同一规则脱敏，url_status 不再恒 'captured'
- [ ] AC-008: redact_data=false 时 ws/fallback 行为与修前一致（不脱敏）
- [ ] AC-009: logger 对字段名匹配 authorization/cookie/set-cookie/x-api-key/token/secret/password 的值置 '[REDACTED]'（对象与字符串形态）
- [ ] AC-010: 正常日志内容不受影响（无敏感字段名时不脱敏）
- [ ] AC-011: 既有 redaction/logger/network_hook/websocket 测试语义不回退

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001/002: redaction.test.ts 新增绝对 URL 无敏感参数断言
- AC-005/007: content 单测断言含 ?token= URL 落库为脱敏形态
- AC-006: ws 消息明文 redact 开启不落库
- AC-009: logger 测试新增 credential 字段用例
- AC-003/004/008/010/011: 既有测试保持通过

## 上下文区

- 来源：intensive-review review_20260812_1249（intensive-review 合并：H-3 redact_url 无条件规范化 + H-5 content ws/fallback 未脱敏 + H-19 logger credential 明文）

### 有意不测

- 无

### 测试策略

- 按项目默认（tests/unit mock Chrome API；fixture 用构造数据）

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：行为变更影响既有路径
- 回退：本 task 为独立 commit，可整体 revert

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- docs/blueprint/domain.md：脱敏与截断条目按统一规则更新
