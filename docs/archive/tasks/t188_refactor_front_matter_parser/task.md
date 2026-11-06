# Task spec

## 背景

仓库存在三份 front matter parser（canonical `scripts/repo_template/repo_task/documents.py` 与 `scripts/repo_template/` 下的副本），形成重复真相源且转义语义已漂移。修改任何一处需同步多处，易产生不一致。

## 契约区

### 范围

- 统一为单一 front matter parser，其余调用方同向依赖。
- 消除副本间转义语义漂移。
- 删除多余副本，保留一处 canonical 实现。

### 非范围

- 不改变 front matter 的 YAML 解析语义（保持与 canonical 一致）。
- 不改变 task/pending/findings/spikes 的 front matter 字段集合。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：全仓库仅保留一份 front matter parser 实现，其余调用方导入 canonical。
- [ ] AC-002：副本间的转义语义差异消除，测试覆盖相同输入得到相同解析结果。
- [ ] AC-003：既有 tooling 测试（task/pending/findings/spikes 相关）通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试：pytest 覆盖 parser 统一与等价性。

## 上下文区

- 来源：ARCH-006（2026-08-13 核实）。

### 有意不测

- 无。

### 测试策略

- 断言统一 parser 对既有 fixture 输出与 canonical 一致，删除副本后调用方测试通过。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：统一 parser 改变某副本依赖的特殊转义行为。
- 回退：以 canonical 为准，差异用测试锁定，必要时显式兼容。

### 依赖与约束

- 无。

### Finalization 时更新的 blueprint

- 无。
