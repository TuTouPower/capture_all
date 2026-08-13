# Task spec

## 背景

`_chain_locked` 只装饰 `cmd_integrate_chain`，`cmd_integrate` 与 `_commit_index` 不获取锁。另一会话的 single integrate 可在 chain 事务窗口内推进主干，使 `base_head` 快照失效；崩溃恢复时 `_record_prepared_merge` 要求 `HEAD^1 == base_head && HEAD^2 == tail_sha`，第一父被顶掉后恢复被永久拒绝。此外 chain index 恢复只检查 `HEAD^1 == merge_sha` 即认领 index 维护 commit，不校验 subject/path 归属，可把无关紧邻 commit 误认为 index commit。

## 契约区

### 范围

- `cmd_integrate`（及 `_commit_index` 调用方）在 merge/commit 前获取与 chain 相同的排他锁，或抽出统一主干写锁。
- chain merge 前重读 HEAD 与 `base_head` 比对，漂移则拒绝并提示用户处理并发 integrate。
- index 恢复认领分支增加归属校验：`git show -s --format=%s HEAD` 等于 `chore(task): rebuild task indexes`，且 `git diff-tree --no-commit-id --name-only -r HEAD` 路径集合 ⊆ 两个 index JSON；不匹配则拒绝。

### 非范围

- 不改变 chain 事务的正常 phase 推进语义。
- 不改动 `_record_integrated_phase` / finalize 的既有 fail-closed 检查。

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

- [ ] AC-001：single integrate 与 chain integrate 在同一锁域内互斥，不并发写主干。
- [ ] AC-002：chain merge 前检测到 `base_head` 与当前 HEAD 漂移时拒绝并提示，不执行 merge。
- [ ] AC-003：index 恢复遇到 subject 或路径集合不匹配的相邻 commit 时拒绝，不误认领为 index commit。
- [ ] AC-004：新增故障注入测试（index commit 后中断、无关 commit 推进 HEAD、恢复拒绝）通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试：临时 git 仓库 + 并发/中断故障注入。

## 上下文区

- 来源：RT-004、RT-005（2026-08-13 核实，`ea0ff5c` 引入 chain 锁与事务）。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- 真实临时 git 仓库；断言锁互斥、base_head 漂移拒绝、index 归属校验。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无。

### 风险与回退

- 风险：加锁引入死锁或阻塞多会话正常并发。
- 回退：锁仅覆盖 merge/commit 临界区，短持有；死锁时人工释放锁文件。

### 依赖与约束

- 与 t165 共享锁基础设施。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture_repo_template.md`：记录统一主干写锁与 index 归属校验契约。
