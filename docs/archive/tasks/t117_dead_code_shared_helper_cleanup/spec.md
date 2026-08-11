# Task spec

## 背景

三处代码质量遗留（均 minor，pre-existing）：`network_capture.ts` 模块级 `cdp_primary_emitted` Set 只 add/clear 从不读取（死代码，`network_context.ts` 与两个 CDP 测试 fixture 残留同名属性）；`generate_nonce()` 在 network_hook / websocket_capture / storage_capture 三通道各有一份 verbatim 实现；dashboard_detail `render_dt_rail` 的 value 转义用内联 replace 链，未复用统一 `esc`/`escape_html` helper（少转 `>` 与 `'`）。核实于 2026-08-11：三处均仍在。

## 契约区

### 范围

- 删除 `cdp_primary_emitted` 死 Set 及其 context/测试 fixture 残留；抽取 `generate_nonce` 共享 helper 并让三通道复用；detail 渲染转义统一到项目 `esc` helper。

### 非范围

- 不改变任何采集行为、nonce 生成语义、渲染输出语义（仅实现位置与写法收敛）。

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

- [ ] AC-001：全仓无 `cdp_primary_emitted` 引用残留（production、context、测试 fixture 均删除），现有测试全绿。
- [ ] AC-002：`generate_nonce` 收敛为单一共享实现，三通道均复用；现有 nonce 相关测试全绿且语义不变（crypto.randomUUID + fallback）。
- [ ] AC-003：`render_dt_rail` 的 value 转义改用统一 `esc` helper，XSS 测试向量（含 `>`、`'`）输出与统一 helper 一致，现有 detail 测试全绿。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试：AC-001 靠 grep 无残留 + 现有测试回归；AC-002 靠现有 nonce 测试回归 + import 静态检查；AC-003 靠转义断言/现有渲染测试。

## 上下文区

- 来源：p006/p011/p023（2026-08-11 核实仍在；p006 已确认全仓无 `has` 或其他读取需求）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- 按项目默认；AC-001/002 以现有测试回归为主，删除残留用 `grep` 静态验证。
- AC-003 若现无 detail 转义直测，补 `esc` 输出与 `render_dt_rail` 一致的断言（或复用既有渲染测试）。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无。

### 风险与回退

- 风险：抽 helper 后三通道若改动行为（如 nonce 格式漂移）测试会红——已由现有 nonce 测试锁定。
- 回退：逐文件回退 git 即可，纯机械清理。

### 依赖与约束

- 依赖 t097（nonce 设计）、t108（detail 渲染）实现落地。

### Finalization 时更新的 blueprint

- 无。
