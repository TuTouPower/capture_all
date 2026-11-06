# Task spec

## 背景

`try_external_cdp_bridge` 用闭包 `poll_stopped` + 递归 setTimeout，但 `stop_body_capture*` 只 clear 初始 `state.poll_timer` 且不调 `stop()`，不置 `poll_stopped`。后续 timer 与 in-flight finally 可继续 poll 并 `on_network_request` 脏写。P0-4 verified。

## 契约区

### 范围

- stop/stop_with_cleanup 后 external 轮询不再调度下一次、in-flight 返回后不再写网络事件。
- start 重入不会叠加多路 poll。
- 单测证明 stop 后无后续 on_network_request。

### 非范围

- 不改 external bridge HTTP API 形状。
- 不改 extension 内置 CDP body 路径。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：`start_body_capture` 进入 external 模式后调用 `stop_body_capture` 或 `stop_body_capture_with_cleanup`，之后即使有 in-flight poll resolve，也不得再调用 `on_network_request`。
- [ ] AC-002：stop 之后 1s 内（或测试时钟推进等价间隔）无新的 poll timer 回调触发网络写入。
- [ ] AC-003：在 external 已 active 时再次 `start_body_capture`（或等价重入），同时最多一路 poll 在跑（无双 timer 双写）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试（假时钟 + mock poll_external_cdp_events）。

## 上下文区

- 来源：docs/reviews/review_20260811_0111/evaluation.md P0-4；src_ext_bg_agent/review.md f001-f002

### 有意不测

- 真实外部 CDP 端口探测失败路径：沿用现有 best-effort，不测。

### 测试策略

- mock external_cdp_bridge_client；控制 setTimeout；断言 deps.on_network_request 调用次数。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：stop 过猛可能截断最后一批 body 事件（可接受，优先不脏写）。
- 回退：恢复仅 clearInterval 的 stop。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
