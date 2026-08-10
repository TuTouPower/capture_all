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
只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。
<!-- /规范 -->

- [ ] AC-001：页面脚本仅使用公开 SIGNAL、不带正确 nonce 的 postMessage 不会产生对应 network/ws/storage 采集入库（或 content→SW 不转发）。
- [ ] AC-002：带正确 nonce 的合法 hook 事件仍能入库（回归）。
- [ ] AC-003：每次 content 启动采集（或每次注入）nonce 与上一次不同（可观测：旧 nonce 失效）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- AC-001/AC-002：可自动测试（jsdom 或 vitest 模拟 message 事件）。
- AC-003：可自动测试（两次 start 对比 nonce 或旧消息拒绝）。

## 上下文区

- 来源：docs/reviews/review_20260811_0111/evaluation.md P0-6；src_ext_content/review.md B2；t071 残留

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 对抗高级页面 hook 覆盖 postMessage 本身：超出本 task。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- 直接测 content 模块 message handler；必要时导出测试钩子仅测试环境。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无

### 风险与回退

- 风险：注入字符串拼接 nonce 需防破坏；错误实现可能采集全无。
- 回退：恢复 SIGNAL-only 校验。

### 依赖与约束

- 建议与 t098 同波或先后，避免双重改 content start。

### Finalization 时更新的 blueprint

- 无
