# Task spec

## 背景

CDP/网络集成测试三条遗留（pending 总账）：CDP body 预算生产记账链路无集成测试（p034，现直调 `_enforce_body_budget_for_test` 单函数）；`handle_cdp_body_event` 的 fire-and-forget `.catch` 位点无直接测试（p038）；`handle_network_request` 落库前 body 脱敏接入无集成测试（p048，算法已由 body_redaction.test.ts 覆盖，接入点无分支胶水）。

## 契约区

### 范围

- 补 CDP body 预算生产记账链路集成测试（MockWebSocket 事件注入 + getResponseBody 命令响应回写，验证 body_bytes 累加与超限淘汰闭环）。
- 补 `handle_cdp_body_event` `.catch` 位点测试（CDP body 事件流触发）。
- 补 `handle_network_request` 落库前 body 脱敏集成测试（redact_data 时带敏感 body 的请求落库为脱敏值）。

### 非范围

- 不改变 body 预算/脱敏/事件处理实现（纯测试补全）。
- 不重复 `_enforce_body_budget_for_test` 既有单测。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：经真实 MockWebSocket 事件 + getResponseBody 回写，body_bytes 累加与超限淘汰闭环正确（body 预算淘汰直接 splice 删除，无 evicted 终态；evicted 终态属事件数淘汰路径，由 t157 事件数淘汰用例覆盖）。
- [ ] AC-002：`handle_cdp_body_event` `.catch` 分支被测试触达（错误路径不抛未捕获异常）。
- [ ] AC-003：redact_data=true 时带敏感 body 的请求经 handle_network_request 落库后存储为脱敏值。
- [ ] AC-004：新增测试全绿，既有 CDP/网络测试无回归。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试：MockWebSocket + storage mock（network_cdp.test.ts 模式）。

## 上下文区

- 来源：p034（t140 遗留 test_f003）、p038（t150 遗留 AC-007 残余）、p048（t171 遗留）。2026-08-14 核实：enforce_body_budget 单测覆盖核心淘汰但记账链路无集成；handle_cdp_body_event catch 无测试；redaction 接入点 12 行无集成用例。
- 2026-08-14 review 标注 spec 过时（t199_code_f001）：AC-001 原措辞「含 evicted 终态」与实现不符——body 预算淘汰（enforce_body_budget）对 victim 直接 splice 删除（cdp_handler.ts:142），无 evicted 终态可断言；evicted 状态仅存在于事件数淘汰路径（push_bounded，既有 t157 事件数淘汰用例覆盖）。已改 AC-001 措辞并注明。

### 有意不测

- 无。

### 测试策略

- 复用 network_cdp.test.ts / cdp_body_budget_accounting.test.ts 夹具，补生产链路用例。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：集成测试依赖 CDP 事件时序。
- 回退：mock 命令响应确定性结算（既有模式）。

### 依赖与约束

- 复用 `mock_chrome_debugger` 与既有 CDP 测试夹具。

### Finalization 时更新的 blueprint

- 无。
