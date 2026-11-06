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

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：全仓无 `cdp_primary_emitted` 引用残留（production、context、测试 fixture 均删除），现有测试全绿。
- [ ] AC-002：`generate_nonce` 收敛为单一共享实现，三通道均复用；现有 nonce 相关测试全绿且语义不变（crypto.randomUUID + fallback）。
- [ ] AC-003：`render_dt_rail` 的 value 转义改用统一 `esc` helper，XSS 测试向量（含 `>`、`'`）输出与统一 helper 一致，现有 detail 测试全绿。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试：AC-001 靠 grep 无残留 + 现有测试回归；AC-002 靠现有 nonce 测试回归 + import 静态检查；AC-003 靠转义断言/现有渲染测试。

## 上下文区

- 来源：p006/p011/p023（2026-08-11 核实仍在；p006 已确认全仓无 `has` 或其他读取需求）

### 有意不测

- 无。

### 测试策略

- 按项目默认；AC-001/002 以现有测试回归为主，删除残留用 `grep` 静态验证。
- AC-003 若现无 detail 转义直测，补 `esc` 输出与 `render_dt_rail` 一致的断言（或复用既有渲染测试）。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：抽 helper 后三通道若改动行为（如 nonce 格式漂移）测试会红——已由现有 nonce 测试锁定。
- 回退：逐文件回退 git 即可，纯机械清理。

### 依赖与约束

- 依赖 t097（nonce 设计）、t108（detail 渲染）实现落地。

### Finalization 时更新的 blueprint

- 无。
