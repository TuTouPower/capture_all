# Task spec

## 背景

stop 未取消 deferred/orphan 等 timer，跨采集可能串写。P1-6。

## 契约区

### 范围

- 网络采集 stop 时清理所有 deferred/orphan/相关 timer 与可取消的延迟任务。
- stop 后迟到 timer 回调不写入任何 capture。
- 单测证明。

### 非范围

- 不改 deferred 关联算法本身（t069）。
- 不改 webRequest 注册权限。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：start→制造 pending deferred/orphan timer→stop 后推进时钟，无网络事件写入（mock writer 调用次数为 0）。
- [ ] AC-002：stop 后再 start 新 capture_id，旧 timer 不得写入新 capture_id。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试。

## 上下文区

- 来源：docs/reviews/review_20260811_0111/evaluation.md P1-6；src_ext_bg_cdp_net/review.md f004

### 有意不测

- 无

### 测试策略

- 假时钟；mock 事件写入。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：清理遗漏某个 Map 中的 timer 句柄。
- 回退：恢复不清理。

### 依赖与约束

- 建议 t094 后实施以免键空间不一致。

### Finalization 时更新的 blueprint

- 无
