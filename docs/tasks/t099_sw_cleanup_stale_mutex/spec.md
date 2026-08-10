# Task spec

## 背景

SW 启动 `setTimeout(0)` 跑 `cleanup_stale_capture_state`，与 `start_capture` 无互斥。start 写完 `active_capture_*` 后 cleanup 可能清掉新键。P1-1 likely。

## 契约区

### 范围

- cleanup_stale 与 start/stop 串行或等价互斥，保证 start 成功写入的 active 键不被并发 cleanup 清除。
- cleanup 仅清理真正陈旧（无 live capturing 状态）的键。
- 单测或可控时序测证明。

### 非范围

- 不重做整套 SW 状态机（t029+ 已有）。
- 不实现跨浏览器进程分布式锁。

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

- [ ] AC-001：在 cleanup 异步执行过程中完成的 `start_capture` 成功后，`active_capture_id`（或等价持久键）仍指向新 capture，不被 cleanup 置 null。
- [ ] AC-002：SW 冷启动且无 live capturing、仅有陈旧 active 键时，cleanup 仍将该陈旧 capture 终态化并清除 active 键（回归）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试（控制 cleanup/start 时序 mock storage）。

## 上下文区

- 来源：docs/reviews/review_20260811_0111/evaluation.md P1-1；src_ext_bg_sw_storage/review.md f001

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 真实 SW 被 Chrome 杀死的全部恢复矩阵：有意不测，只测互斥与陈旧清理。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- 抽取或注入 cleanup/start 竞态；假 storage。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无

### 风险与回退

- 风险：互斥过宽导致 start 延迟。
- 回退：恢复独立 setTimeout cleanup。

### 依赖与约束

- 与 t110 同改 service_worker/storage 时建议串行。

### Finalization 时更新的 blueprint

- 无
