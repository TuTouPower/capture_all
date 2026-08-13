# p034 CDP body 预算生产记账链路集成测试

- 来源：t140 遗留（test_f003 minor）
- 内容：body 预算的测试目前直调 `_enforce_body_budget_for_test` 单函数，未覆盖生产记账链路（`cdp_handler.ts` getResponseBody 回写处 `body_bytes += Math.min(bytes.length, max_body_bytes)` 累加 + `push_bounded` 淘汰扣减）。集成测试需经真实 MockWebSocket 事件注入 + getResponseBody 命令响应回写，验证 body_bytes 记账与超限淘汰闭环。当前实现逻辑正确且 enforce_body_budget 单测覆盖核心淘汰，记账是简单累加，风险低，故登记而非阻断。
- 处理：t199
