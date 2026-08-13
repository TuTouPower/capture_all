# Task spec

## 背景

单 task `cmd_integrate` 全程无持久事务标记。崩溃窗口（merge 成功但 `append_integrated` 未执行，或 `_commit_index` 与 append 之间）重入时，`_resolve_integrate_branch` 走「已合并」分支，`merge_sha = _get_head()` 把任意当前 HEAD 当作 merge_sha 写入 ledger。现有测试 `test_integrate_skip_merge_also_appends_integrated` 固化了良性场景，未覆盖 HEAD 已被无关 commit 推进的崩溃窗口。

## 契约区

### 范围

- 仿 chain 加最小持久标记：merge 前写 `.git/repo-task/integrate-{tid}.json`（含 base_head、branch sha、merge 前 HEAD），收尾后删除。
- skip-merge 分支解析真实 merge commit（如 `git rev-list --merges --max-count=1 --grep "merge({tid}):"` 或校验 HEAD 与 branch merge 的双亲关系）。
- 解析不到或 HEAD 与分支 merge 无对应关系时拒绝并要求人工确认，不无条件 `_get_head()`。

### 非范围

- 不改变 chain integrate 事务机制（见 t166）。
- 不改变 integrate 的 merge 策略（`--no-ff`）。

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

- [ ] AC-001：正常 integrate 完成后，事务标记文件被删除。
- [ ] AC-002：模拟 `_commit_index` 后中断、HEAD 被无关 commit 推进后重入，`merge_sha` 仍为真实 merge commit 或 integrate 被拒绝（不得写入任意 HEAD）。
- [ ] AC-003：skip-merge 分支解析不到与 tid 匹配的 merge commit 时，integrate 拒绝并提示人工确认。
- [ ] AC-004：新增崩溃窗口测试（真实 git 操作，非 monkeypatch）通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试：临时 git 仓库 + 故障注入（在 index commit 后中断、HEAD 前进后重入）。

## 上下文区

- 来源：RT-003（2026-08-13 核实，`ea0ff5c` 引入，测试同 commit 固化现状）。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- 真实临时 git 仓库驱动崩溃窗口；断言 ledger `merge_sha` 与事务标记生命周期。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无。

### 风险与回退

- 风险：事务标记与既有 chain 事务路径冲突。
- 回退：标记文件命名隔离（`integrate-{tid}.json`），失败时人工删除后重跑。

### 依赖与约束

- 与 t166 共享事务/锁基础设施设计。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture_repo_template.md`：记录单 task integrate 事务标记契约。
