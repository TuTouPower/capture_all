# Task spec

## 背景

`MAX_SESSION_DURATION_MS` 常量在源码与测试中零引用，`CaptureStoppedData.reason` 仍公开 `'max_duration'`，但 `start_capture` 未注册任何 deadline/alarm/timer，`stop_capture` 也无生产路径传入 `'max_duration'`。README 与当前生效 blueprint 承诺「500 MB、24 小时」单采集上限，但该生命周期约束从未执行，`max_duration` reason 是不可达协议分支。

## 契约区

### 范围

- 采集成功后持久化截止时间，并注册可取消的 `chrome.alarms`（MV3 优先于仅内存 `setTimeout`）。
- alarm 到期调用 `stop_capture('max_duration')`。
- Service Worker 重启时根据持久化截止时间立即终态化或重建 alarm；stop/失败清理 alarm。

### 非范围

- 不改变 500 MB 大小上限逻辑。
- 不改变 24 小时数值本身（除非用户要求调整）。

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

- [ ] AC-001：正常到期场景下，采集持续 24 小时后自动停止，停止 reason 为 `'max_duration'`。
- [ ] AC-002：手动提前停止采集后，对应的到期 alarm 被取消，不会在后续触发。
- [ ] AC-003：Service Worker 重启且截止时间已过，采集被立即终态化（reason 为 `'max_duration'`）或等价恢复到正确状态。
- [ ] AC-004：Service Worker 重启且截止时间未过，alarm 被重建，剩余时间内仍能到期停止。
- [ ] AC-005：`MAX_SESSION_DURATION_MS` 被生产路径引用，`'max_duration'` reason 变为可达。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试：用 fake `chrome.alarms` 与 fake clock 单测，覆盖正常到期、手动提前停止、SW 重启已过期/未过期四条路径。

## 上下文区

- 来源：DD-001（2026-08-13 核实，常量由 `2f95a68c` 引入，当前仍零引用）。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- mock `chrome.alarms` 与 `chrome.storage`；断言 alarm 注册/取消、reason 值、SW 重启恢复行为。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无。

### 风险与回退

- 风险：MV3 alarm 最小时延/精度与 SW 被终止后的恢复时序需实验确认。
- 回退：若 `chrome.alarms` 精度不满足，退回基于持久化截止时间 + 事件驱动的过期检查。

### 依赖与约束

- 遵循 MV3 Service Worker 生命周期约束。

### Finalization 时更新的 blueprint

- `docs/blueprint/domain.md`：如补记 24 小时上限执行机制，同步 README 承诺与实现一致性。
