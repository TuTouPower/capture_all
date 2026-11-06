# Task spec

## 背景

content status poll 的 `on_active` 使用 `get_status` 返回的 `tab_id`（常为启动时 active tab），多 tab 时串台。P1-8。

## 契约区

### 范围

- content 脚本在 poll 恢复/启动采集时使用「本 frame 所在 tab」的 id，而非全局 active tab id。
- 多 tab 同时 poll 时事件 tab_id 与发送 tab 一致。
- 单测或消息契约测。

### 非范围

- 不改 popup 显示的 active tab 逻辑。
- 不改 frame_id 全量修复（可另 task）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：`get_status` 返回的 tab_id 与 content 所在 tab 不同时，content 启动采集使用的 tab_id 仍为本 tab（通过 chrome.runtime/tab 查询或 SW 按 sender.tab.id 权威）。
- [ ] AC-002：由此产生的 capture 事件 `tab_id` 等于 content 所在 tab id。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试（mock sender.tab / get_status）。

## 上下文区

- 来源：docs/reviews/review_20260811_0111/evaluation.md P1-8；src_ext_content/review.md B3

### 有意不测

- 无

### 测试策略

- mock runtime.sendMessage 与 tab id 来源。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：改 get_status 语义可能影响 popup；优先 content 侧用 sender 权威。
- 回退：恢复使用 get_status.tab_id。

### 依赖与约束

- 可与 t097/t098 同文件冲突，串行。

### Finalization 时更新的 blueprint

- 无
