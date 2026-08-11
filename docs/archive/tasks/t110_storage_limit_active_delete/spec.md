# Task spec

## 背景

`bytes_written` 限额检查无生产调用；活跃采集可被 delete_capture；SW 重启 cleanup 终态化可能不写 capture_stopped 类生命周期事件。P1-13/P1-14。

## 契约区

### 范围

- 采集过程中持久化/检查存储用量，超限时停止写入或 stop capture 并给出可观察失败/状态。
- 禁止删除状态为 active/recording 的 capture（API 返回错误）；或删除前强制 stop 且可测。
- SW 重启终态化陈旧 capture 时写入生命周期停止类事件或等价可观察终态字段。
- 单测覆盖。

### 非范围

- 不实现云端配额。
- 不改 DB 主版本除非必需（尽量不升版本）。

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

- [ ] AC-001：模拟 bytes 超限后，不再接受新事件写入或 capture 进入 stopped/failed 且 status 可查询。
- [ ] AC-002：对 active capture 调用 delete 返回失败（success===false 或抛约定错误），且数据仍在。
- [ ] AC-003：模拟 SW 重启 cleanup 陈旧 active 后，该 capture status 为 completed/stopped 等非 active，并存在 stop 生命周期事件或 ended_at 非空。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试。

## 上下文区

- 来源：docs/reviews/review_20260811_0111/evaluation.md P1-13 P1-14；src_ext_bg_sw_storage/review.md f004 f007 f008

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 真实 IndexedDB 配额耗尽 OS 级：有意不测，测应用层限额。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- mock bytes_written；直接调 delete_capture 与 cleanup。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无

### 风险与回退

- 风险：超限策略（硬停 vs 丢事件）需选一种并测；推荐硬停+状态。
- 回退：恢复无检查/可删 active。

### 依赖与约束

- 与 t099 串行优先。

### Finalization 时更新的 blueprint

- 无
