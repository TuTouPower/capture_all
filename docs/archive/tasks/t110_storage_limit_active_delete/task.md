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

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：模拟 bytes 超限后，不再接受新事件写入或 capture 进入 stopped/failed 且 status 可查询。
- [ ] AC-002：对 active capture 调用 delete 返回失败（success===false 或抛约定错误），且数据仍在。
- [ ] AC-003：模拟 SW 重启 cleanup 陈旧 active 后，该 capture status 为 completed/stopped 等非 active，并存在 stop 生命周期事件或 ended_at 非空。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试。

## 上下文区

- 来源：docs/reviews/review_20260811_0111/evaluation.md P1-13 P1-14；src_ext_bg_sw_storage/review.md f004 f007 f008

### 有意不测

- 真实 IndexedDB 配额耗尽 OS 级：有意不测，测应用层限额。

### 测试策略

- mock bytes_written；直接调 delete_capture 与 cleanup。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：超限策略（硬停 vs 丢事件）需选一种并测；推荐硬停+状态。
- 回退：恢复无检查/可删 active。

### 依赖与约束

- 与 t099 串行优先。

### Finalization 时更新的 blueprint

- 无
