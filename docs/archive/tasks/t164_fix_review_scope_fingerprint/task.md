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

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：在任务目录新增一个未 `git add -N` 的未跟踪源码文件后，`current_scope_fingerprint` 的值发生变化。
- [ ] AC-002：`repository_fingerprint` 与 `current_scope_fingerprint` 对同一工作树（含未跟踪文件）产生口径一致的结果或显式共享同一构成函数。
- [ ] AC-003：review 后 agent 继续添加未跟踪文件，checker 重算指纹能检测到变化（PASS 判定失效或指纹不匹配）。
- [ ] AC-004：新增真实 git 行为测试通过（非 monkeypatch `current_scope_fingerprint`）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试：用临时 git 仓库 + 真实 untracked 文件驱动。

## 上下文区

- 来源：RT-002（2026-08-13 核实，`ea0ff5c` 引入，`monitoring.repository_fingerprint` 同 commit 已含 untracked 但未统一）。

### 有意不测

- 无。

### 测试策略

- 用真实临时 git 仓库（`git init` + 文件操作）而非 monkeypatch；断言指纹前后差异。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：`git ls-files --others` 与 `git diff` 的 excludes 对齐有差异导致漏检。
- 回退：共享单一 excludes 构造函数，测试覆盖排除项与未跟踪项。

### 依赖与约束

- 复用 `monitoring.repository_fingerprint` 的实现，避免第二份口径。

### Finalization 时更新的 blueprint

- 无。
