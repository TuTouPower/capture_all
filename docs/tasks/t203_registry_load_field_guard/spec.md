# Task spec

## 背景

p053:`load_persisted()` 对 `JSON.parse` 后数组元素无逐字段校验。实例文件若含合法 JSON 但畸形结构的条目(缺 instance_id / token_hash 等字段),原样装载产生 token_hash 为 undefined 的垃圾实例,心跳恒 401,占槽位至 35s sweep。实例文件可能被部分损坏/手工编辑/旧版本结构差异影响。

## 契约区

### 范围

- `load_persisted()` 对每个载入条目做字段校验:instance_id 非空字符串、token_hash 为 string 或 null、browser_label 为 string 或 null、seen_at 为数字、origin_extension_id 为 string 或 null、extension_version 为 string、active_capture_id 为 string 或 null。
- 畸形条目跳过(不装载),不影响其余合法条目与 bridge 启动。

### 非范围

- 不改 persist 写入侧(写盘结构固定,由程序生成)。
- 不做文件 schema 版本号/迁移(超出本 task)。
- 不拒绝整个文件(部分损坏仍恢复合法条目)。

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

- [ ] AC-001:实例文件含畸形条目(缺 token_hash / instance_id 空)时,`load_persisted()` 跳过该条目,不产生垃圾实例。
- [ ] AC-002:同文件含合法条目时,合法条目正常恢复,畸形条目被跳过(部分损坏恢复)。
- [ ] AC-003:全畸形文件不抛错,registry 从空开始,bridge 正常启动。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试。

## 上下文区

- 来源:p053(2026-08-16 核实;t201 Round 2 code review 发现,pre-existing)

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 在 `tests/unit/bridge_registry_refactor.test.ts` 的 t201 describe 后追加 t203 用例,复用其临时目录 + 文件写入模式。
- 构造畸形条目数组写入文件,load 后断言跳过/保留。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险:字段校验过严可能拒绝合法旧版本文件条目。回退:校验只要求字段类型非空,不要求精确 schema 版本;旧结构缺字段的条目跳过而非崩溃。

### 依赖与约束

- `src/bridge/registry.ts` `load_persisted()` 为唯一改动点(t201 已落地 seen_at 重置)。

### Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：无新增决策
- `docs/specs/bridge_instance_persistence.md`：补字段校验语义
