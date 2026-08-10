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
只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。
<!-- /规范 -->

- [ ] AC-001：start→制造 pending deferred/orphan timer→stop 后推进时钟，无网络事件写入（mock writer 调用次数为 0）。
- [ ] AC-002：stop 后再 start 新 capture_id，旧 timer 不得写入新 capture_id。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试。

## 上下文区

- 来源：docs/reviews/review_20260811_0111/evaluation.md P1-6；src_ext_bg_cdp_net/review.md f004

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- 假时钟；mock 事件写入。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无

### 风险与回退

- 风险：清理遗漏某个 Map 中的 timer 句柄。
- 回退：恢复不清理。

### 依赖与约束

- 建议 t094 后实施以免键空间不一致。

### Finalization 时更新的 blueprint

- 无
