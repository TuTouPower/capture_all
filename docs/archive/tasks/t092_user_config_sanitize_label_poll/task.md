# Task spec

## 背景

`sanitize_user_config` 白名单未拷贝 `browser_label` / `agent_bridge_poll_interval_ms`。`load_user_config` 每次回落默认；`save_user_config` partial 写回会抹掉 storage 中已设 label/轮询间隔。多实例 `target_label` 路由依赖 label 持久化。全量审阅 2026-08-11 P0-1 verified。

## 契约区

### 范围

- 使 `sanitize_user_config` / `load_user_config` 保留并校验 `browser_label` 与 `agent_bridge_poll_interval_ms`。
- 任意 `save_user_config` partial patch 不抹掉未出现在 patch 中的上述字段。
- 补单元测试覆盖 load 保留与 partial save 不抹字段。

### 非范围

- 不改 Bridge enroll/heartbeat 协议（label 同步已由既有路径负责）。
- 不改 Dashboard UI 布局。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：chrome.storage 中预置非默认 `browser_label` 与 `agent_bridge_poll_interval_ms` 后，`load_user_config()` 返回值与预置一致（通过合法校验）。
- [ ] AC-002：在 storage 已有非默认 label/poll 时，仅 `save_user_config({ theme })`（或其它不含上述字段的 partial）后，再 load 仍保留原 label/poll。
- [ ] AC-003：非法 `agent_bridge_poll_interval_ms`（非有限整数或越出与 agent_bridge_config 一致的合法区间）load 时回退默认值；非法 `browser_label` 类型非 string 时回退默认空串或等价默认。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试。

## 上下文区

- 来源：docs/reviews/review_20260811_0111/evaluation.md P0-1；src_shared/review.md f001（2026-08-11 源码复核 verified）

### 有意不测

- 无

### 测试策略

- mock `chrome.storage.local`；断言 load/save 前后字段值。不 mock sanitize 本体。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：历史 storage 已有损坏 poll 值时 load 回退默认，用户感知轮询变快/变慢。
- 回退：还原 sanitize 白名单前行为并回退测试。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
