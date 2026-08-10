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
只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。
<!-- /规范 -->

- [ ] AC-001：`get_status` 返回的 tab_id 与 content 所在 tab 不同时，content 启动采集使用的 tab_id 仍为本 tab（通过 chrome.runtime/tab 查询或 SW 按 sender.tab.id 权威）。
- [ ] AC-002：由此产生的 capture 事件 `tab_id` 等于 content 所在 tab id。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试（mock sender.tab / get_status）。

## 上下文区

- 来源：docs/reviews/review_20260811_0111/evaluation.md P1-8；src_ext_content/review.md B3

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- mock runtime.sendMessage 与 tab id 来源。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无

### 风险与回退

- 风险：改 get_status 语义可能影响 popup；优先 content 侧用 sender 权威。
- 回退：恢复使用 get_status.tab_id。

### 依赖与约束

- 可与 t097/t098 同文件冲突，串行。

### Finalization 时更新的 blueprint

- 无
