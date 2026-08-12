# Task spec

## 背景

intensive-review 错误处理面 9 缺口：CDP detach/enable/stream 等空 catch 静默、to_agent_error/attach 错误内部细节外泄、mcp client fetch 无超时、sanitize_value getter 抛错无 catch、strict-CSP 注入失败无诊断、keepalive 空操作、content flush 自旋、两处未处理 async rejection、bridge 无结构化日志。

## 契约区

### 范围

- 修复 review finding：intensive-review 聚合：B2-M14 空 catch、B2-M15 内部错误外泄、B1-M3 mcp 超时、B1-M7 sanitize getter、B3-M3 CSP 诊断、B2-M16 keepalive、B2-M20 flush 自旋、B2-M3/M4 未处理 rejection、B1-M13 bridge 日志

### 非范围

- 不在本 task 处理的相关联问题（若有，见上下文区来源）

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

- [ ] AC-001: 空 catch 位点补日志/错误上报（CDP 失败至少 warn 级，注入失败发 capture_error recoverable=false 并计入 stats）
- [ ] AC-002: 回传用户/agent 的错误不再含内部路径/库错误串（结构化错误码 + 脱敏 message）
- [ ] AC-003: mcp client fetch 带超时（AbortSignal），bridge 挂起不无限阻塞
- [ ] AC-004: sanitize_value 对 getter 抛错的对象返回 '[Unserializable]' 不抛异常
- [ ] AC-005: keepalive handler 执行真实工作（如 flush 检查），非纯 debug 日志
- [ ] AC-006: content flush 循环有轮次上限，不无限自旋
- [ ] AC-007: 未处理 rejection 位点补 .catch/日志
- [ ] AC-008: bridge 关键路径（认证失败/超时/淘汰）有结构化日志输出

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- AC-002: 错误信息无内部细节断言
- AC-003: 超时触发用例（mock fetch 挂起）
- AC-004: getter 抛错用例
- 其余: 按既有模块测试补对应断言

## 上下文区

- 来源：intensive-review review_20260812_1249（intensive-review 聚合：B2-M14 空 catch、B2-M15 内部错误外泄、B1-M3 mcp 超时、B1-M7 sanitize getter、B3-M3 CSP 诊断、B2-M16 keepalive、B2-M20 flush 自旋、B2-M3/M4 未处理 rejection、B1-M13 bridge 日志）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- 按项目默认（tests/unit mock Chrome API；fixture 用构造数据）

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无

### 风险与回退

- 风险：行为变更影响既有路径
- 回退：本 task 为独立 commit，可整体 revert

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
