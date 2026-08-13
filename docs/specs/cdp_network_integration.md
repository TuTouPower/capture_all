# spec: cdp_network_integration

## 背景

CDP/网络集成测试三条遗留（pending 总账）：CDP body 预算生产记账链路无集成测试（p034，原直调 `_enforce_body_budget_for_test` 单函数）；`handle_cdp_body_event` 的 fire-and-forget `.catch` 位点无直接测试（p038）；`handle_network_request` 落库前 body 脱敏接入无集成测试（p048，算法已由 body_redaction.test.ts 覆盖，接入点无分支胶水）。

## 验收标准

- AC-001：经真实 MockWebSocket 事件 + getResponseBody 回写，body_bytes 累加与超限淘汰闭环正确（body 预算淘汰直接 splice 删除，无 evicted 终态；evicted 终态属事件数淘汰路径，由 t157 事件数淘汰用例覆盖）。
- AC-002：`handle_cdp_body_event` `.catch` 分支被测试触达（错误路径不抛未捕获异常，错误日志经 transport 写出）。
- AC-003：redact_data=true 时带敏感 body 的请求经 handle_network_request 落库后存储为脱敏值（非敏感键保留）；redact_data=false 时原样落库。
- AC-004：新增测试全绿，既有 CDP/网络测试无回归。

## 可测试性

全部 AC 可自动测试：AC-001 MockWebSocket 生产链路；AC-002/003 SW 集成测试（fake-indexeddb + chrome mock + `_for_test` 导出钩子）。

## 实现约定

- `handle_cdp_body_event` 导出为 `_handle_cdp_body_event_for_test`（按 `_for_test` 命名约定），供 .catch 位点测试直接触发。
- AC-002 错误路径用 `check_storage_limit` reject 触发 production `.catch`（拒绝路径真实可达）。

## 测试钩子约定

`src/` 测试钩子导出须带 `_for_test` 命名约定。
