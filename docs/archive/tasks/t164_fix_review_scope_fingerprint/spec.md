# Task spec

## 背景

review scope 指纹用 `git diff --binary <anchor> -- . <excludes>` 的 SHA-1 前 16 位计算，`git diff <commit>` 对未跟踪文件完全不可见。新文件必须手工 `git add -N` 才进入被审 scope，该动作只存在于 `task-work/SKILL.md` 操作指引，无机械强制。同仓库 `monitoring.py:63-66` 的 `repository_fingerprint` 已用 `git ls-files --others --exclude-standard` 纳入未跟踪文件，两种口径并存。

## 契约区

### 范围

- `current_scope_fingerprint` 改为 `git diff <anchor>` 与 `git ls-files --others --exclude-standard`（按相同 excludes）内容拼接后哈希，复用 `monitoring.repository_fingerprint` 构成方式统一口径。
- 或 checker 先检测任务目录/排除清单外是否存在未 `add -N` 的 untracked 文件，存在则返回 `None`（保守不可验证）并提示。
- 补真实 git 行为测试：未跟踪文件加入后指纹必须变化。

### 非范围

- 不改变 `task-work` 的 `git add -N` 操作指引。
- 不改变排除清单 `SCOPE_EXCLUDES` 的语义。

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

- [ ] AC-001：在任务目录新增一个未 `git add -N` 的未跟踪源码文件后，`current_scope_fingerprint` 的值发生变化。
- [ ] AC-002：`repository_fingerprint` 与 `current_scope_fingerprint` 对同一工作树（含未跟踪文件）产生口径一致的结果或显式共享同一构成函数。
- [ ] AC-003：review 后 agent 继续添加未跟踪文件，checker 重算指纹能检测到变化（PASS 判定失效或指纹不匹配）。
- [ ] AC-004：新增真实 git 行为测试通过（非 monkeypatch `current_scope_fingerprint`）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试：用临时 git 仓库 + 真实 untracked 文件驱动。

## 上下文区

- 来源：RT-002（2026-08-13 核实，`ea0ff5c` 引入，`monitoring.repository_fingerprint` 同 commit 已含 untracked 但未统一）。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- 用真实临时 git 仓库（`git init` + 文件操作）而非 monkeypatch；断言指纹前后差异。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无。

### 风险与回退

- 风险：`git ls-files --others` 与 `git diff` 的 excludes 对齐有差异导致漏检。
- 回退：共享单一 excludes 构造函数，测试覆盖排除项与未跟踪项。

### 依赖与约束

- 复用 `monitoring.repository_fingerprint` 的实现，避免第二份口径。

### Finalization 时更新的 blueprint

- 无。
