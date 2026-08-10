# Task spec

## 背景

`exception_capture` 将 `RuntimeExceptionData` 展开到 CaptureEvent 顶层，不设 `event.data`；`service_worker.handle_console_log` 要求 `event.data` 非空否则 return，且写入 `write_console_events`。结果 runtime 异常静默全丢，不进 ERROR_EVENTS。P0-2 verified。

## 契约区

### 范围

- runtime exception 以正确结构进入 error 事件存储（`write_error_events` / ERROR_EVENTS）。
- 不再经 console sink 丢弃。
- 补/改单元测试证明异常可查询。

### 非范围

- 不改 console 日志采集本身。
- 不改 CDP Runtime.enable 附着策略。

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

- [ ] AC-001：模拟 `Runtime.exceptionThrown` 后，ERROR_EVENTS（或等价 error 查询 API）出现对应 `runtime_exception` 记录，字段含 message（或等价错误文案）与 capture_id。
- [ ] AC-002：同一异常路径下 CONSOLE 事件存储不因该 exception 被错误当作 console 写入；console sink 在 `event.data` 缺失时不得再作为 exception 唯一出口。
- [ ] AC-003：停止采集后迟到的 exception 回调不写入当前/新 capture（若现有 generation 守卫适用则沿用）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试（mock chrome.debugger + storage 或现有 capture 测试夹具）。

## 上下文区

- 来源：docs/reviews/review_20260811_0111/evaluation.md P0-2；src_ext_bg_cdp_net/review.md f003

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 真实 Chrome 子 frame exception 附着差异：有意不测，仅测主路径事件形状与 sink。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- mock debugger onEvent；断言 storage write 调用目标 store 与 payload 形状。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无

### 风险与回退

- 风险：改变事件形状可能影响已依赖扁平字段的导出/UI；需与 types 中 RuntimeExceptionData 对齐。
- 回退：恢复 exception→console 路径（不推荐，仅紧急回退）。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 若 event 形状契约变化：`docs/blueprint/domain.md` 错误事件条目
