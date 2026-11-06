# Task spec

## 背景

Agent 命令已执行后若 lifecycle/generation 失效，客户端丢弃 result 不投递，调用方超时，副作用命令状态歧义。P1-5。

## 契约区

### 范围

- 命令一旦开始执行并产生结果，须向 Bridge 投递成功或失败 result（含明确错误码），不因后续 lifecycle 检查静默丢弃。
- 副作用命令（start/stop 等）在已生效时不得对调用方表现为无结果超时（除非 Bridge 本身不可达且走既有重试耗尽语义）。
- 单测覆盖「执行后 generation 变化仍投递」。

### 非范围

- 不重做整套结果重试队列（t046）；在现有投递机制上堵静默丢弃洞。
- 不改 MCP schema。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：dispatch 已返回 result 对象后，即使 capture generation/lifecycle 已失效，仍调用结果投递 API 一次（成功或带错误码的失败）。
- [ ] AC-002：投递路径在 lifecycle 失效场景不抛未捕获异常导致轮询循环中断。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试。

## 上下文区

- 来源：docs/reviews/review_20260811_0111/evaluation.md P1-5；src_ext_bg_agent/review.md f003

### 有意不测

- Bridge 进程被杀导致投递最终失败：沿用既有重试耗尽，有意不测新语义。

### 测试策略

- mock enroll/fetch result；强制 generation 失效。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：向已超时命令补投递可能被 Bridge 拒绝——应幂等或忽略已关闭 command_id。
- 回退：恢复丢弃逻辑。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
