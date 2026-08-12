# Task spec

## 背景

stop_capture 不还原注入脚本改写的页面 API，network_hook 在 stop 后仍对每次 fetch 全量 clone().text()，开销与页面行为污染持续到导航。

## 契约区

### 范围

- 修复 review finding：review H-13 (B3-H4): stop 仅删 message_listener，fetch/XHR/localStorage/WebSocket 永久改写且持续读 body

### 非范围

- 不在本 task 处理的相关联问题（若有，见上下文区来源）

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

- [ ] AC-001: stop 后页面 window.fetch/XHR/localStorage/WebSocket 还原为原始实现（或行为等效：不再有捕获侧读 body/post 消息开销）
- [ ] AC-002: 采集进行中 hook 行为不变
- [ ] AC-003: 还原失败（页面已变化）时静默降级不报错

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- AC-001: 注入脚本测试新增 stop→hook 空转断言（fetch 不再 clone/读 body）
- AC-002: 既有 websocket/storage/network_hook 测试保持通过

## 上下文区

- 来源：intensive-review review_20260812_1249（review H-13 (B3-H4): stop 仅删 message_listener，fetch/XHR/localStorage/WebSocket 永久改写且持续读 body）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- 按项目默认（tests/unit mock Chrome API；fixture 用构造数据）

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无

### 风险与回退

- 风险：行为变更影响既有路径
- 回退：本 task 为独立 commit，可整体 revert

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
