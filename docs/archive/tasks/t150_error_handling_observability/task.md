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

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

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

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-002: 错误信息无内部细节断言
- AC-003: 超时触发用例（mock fetch 挂起）
- AC-004: getter 抛错用例
- 其余: 按既有模块测试补对应断言

## 上下文区

- 来源：intensive-review review_20260812_1249（intensive-review 聚合：B2-M14 空 catch、B2-M15 内部错误外泄、B1-M3 mcp 超时、B1-M7 sanitize getter、B3-M3 CSP 诊断、B2-M16 keepalive、B2-M20 flush 自旋、B2-M3/M4 未处理 rejection、B1-M13 bridge 日志）

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

- 无
