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
只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。
<!-- /规范 -->

- [ ] AC-001：chrome.storage 中预置非默认 `browser_label` 与 `agent_bridge_poll_interval_ms` 后，`load_user_config()` 返回值与预置一致（通过合法校验）。
- [ ] AC-002：在 storage 已有非默认 label/poll 时，仅 `save_user_config({ theme })`（或其它不含上述字段的 partial）后，再 load 仍保留原 label/poll。
- [ ] AC-003：非法 `agent_bridge_poll_interval_ms`（非有限整数或越出与 agent_bridge_config 一致的合法区间）load 时回退默认值；非法 `browser_label` 类型非 string 时回退默认空串或等价默认。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试。

## 上下文区

- 来源：docs/reviews/review_20260811_0111/evaluation.md P0-1；src_shared/review.md f001（2026-08-11 源码复核 verified）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- mock `chrome.storage.local`；断言 load/save 前后字段值。不 mock sanitize 本体。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无

### 风险与回退

- 风险：历史 storage 已有损坏 poll 值时 load 回退默认，用户感知轮询变快/变慢。
- 回退：还原 sanitize 白名单前行为并回退测试。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
