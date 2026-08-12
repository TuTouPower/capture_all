# Task spec

## 背景

SW 生命周期持久化两缺口：cleanup_stale_capture_state 只标 completed 不重建子系统（决策 009 恢复分支缺失，重启后活跃采集被静默截断）；bytes_written 纯内存 Map 重启清零，500MB 限额失效持续膨胀。

## 契约区

### 范围

- 修复 review finding：intensive-review 合并：H-8 限额重启失效 + H-9 重启只终态不恢复

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

- [ ] AC-001: SW 重启检测到 active_capture_* 持久化键时，恢复 is_capturing/current_capture/子系统状态（或按决策明示终止语义并保证已落库数据不丢）
- [ ] AC-002: 恢复后新事件写入原 capture_id，generation token 防旧回调串写
- [ ] AC-003: 恢复失败路径（如 storage 损坏）回退到终止语义，不产生半活跃状态
- [ ] AC-004: 既有 stale_cleanup 终态化测试语义不回归（终止分支仍可用）
- [ ] AC-005: 单采集写入字节数持久化（随 CaptureRecord 或独立键），SW 重启后限额检查可重建
- [ ] AC-006: 重启后继续写入仍触发 MAX_SESSION_SIZE_BYTES 停止并写 storage_limit lifecycle 事件
- [ ] AC-007: 既有 stop_capture/storage 测试语义不回退

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- AC-001: service_worker_stale_cleanup.test.ts 新增恢复分支用例
- AC-005/006: 模拟重启后超限触发用例
- AC-004/007: 既有测试保持通过

## 上下文区

- 来源：intensive-review review_20260812_1249（intensive-review 合并：H-8 限额重启失效 + H-9 重启只终态不恢复）

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

- UNVERIFIED-SPIKE: SW 重启后 chrome.webRequest/chrome.debugger listener 与 content script 激活态是否自动恢复（MV3 行为）——task-work Step 1 实验核实

### 风险与回退

- 风险：行为变更影响既有路径
- 回退：本 task 为独立 commit，可整体 revert

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- docs/blueprint/architecture.md §4.1 + domain.md 存储限制条目：恢复/终止语义与限额持久化按实现结论更新
