# Task spec

## 背景

network_hook / websocket_capture / storage_capture 页→content 仅校验静态 SIGNAL 字符串，页面脚本可 postMessage 伪造采集事件。t071 曾评估 WS nonce，当前代码仍为固定 SIGNAL。P0-6 verified。

## 契约区

### 范围

- 对 page 注入通道（network / websocket / storage）引入 per-page（或 per-injection）nonce：content 生成、注入脚本持有、接收端校验。
- 错误/缺失 nonce 的消息丢弃且不入库。
- 单测或注入级测试证明伪造 SIGNAL 被拒。

### 非范围

- 不改非 postMessage 的 DOM 事件采集（mouse/keyboard 等）。
- 不改为 MAIN world 全面代理（除非为 nonce 传递所必需的最小改动）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：页面脚本仅使用公开 SIGNAL、不带正确 nonce 的 postMessage 不会产生对应 network/ws/storage 采集入库（或 content→SW 不转发）。
- [ ] AC-002：带正确 nonce 的合法 hook 事件仍能入库（回归）。
- [ ] AC-003：每次 content 启动采集（或每次注入）nonce 与上一次不同（可观测：旧 nonce 失效）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001/AC-002：可自动测试（jsdom 或 vitest 模拟 message 事件）。
- AC-003：可自动测试（两次 start 对比 nonce 或旧消息拒绝）。

## 上下文区

- 来源：docs/reviews/review_20260811_0111/evaluation.md P0-6；src_ext_content/review.md B2；t071 残留

### 有意不测

- 对抗高级页面 hook 覆盖 postMessage 本身：超出本 task。

### 测试策略

- 直接测 content 模块 message handler；必要时导出测试钩子仅测试环境。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：注入字符串拼接 nonce 需防破坏；错误实现可能采集全无。
- 回退：恢复 SIGNAL-only 校验。

### 依赖与约束

- 建议与 t098 同波或先后，避免双重改 content start。

### Finalization 时更新的 blueprint

- 无
