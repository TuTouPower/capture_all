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
只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。
<!-- /规范 -->

- [ ] AC-001：全仓库仅保留一份 front matter parser 实现，其余调用方导入 canonical。
- [ ] AC-002：副本间的转义语义差异消除，测试覆盖相同输入得到相同解析结果。
- [ ] AC-003：既有 tooling 测试（task/pending/findings/spikes 相关）通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试：pytest 覆盖 parser 统一与等价性。

## 上下文区

- 来源：ARCH-006（2026-08-13 核实）。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- 断言统一 parser 对既有 fixture 输出与 canonical 一致，删除副本后调用方测试通过。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无。

### 风险与回退

- 风险：统一 parser 改变某副本依赖的特殊转义行为。
- 回退：以 canonical 为准，差异用测试锁定，必要时显式兼容。

### 依赖与约束

- 无。

### Finalization 时更新的 blueprint

- 无。
