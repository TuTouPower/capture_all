# Task spec

## 背景

Dashboard UI 三处遗留（pending 总账）：timeline 空白区（非 marker）点击拖拽 playhead 未置 `_tl_dragging` 且 pointerdown 内调 `render_content()` 使 seek 读 detached overlay 失效，2s 轮询重渲染打断拖拽（p035）；captures 批量删除中途失败时已成功项仍残留 selected 集合，用户重点删除会重复触发（p040）；dashboard_detail `wire_rail_resize`/`wire_network_resize` 的 pointercancel/mouseleave 清理（t154 新增）无直接测试（p041）。

## 契约区

### 范围

- timeline 空白区拖拽：置 `_tl_dragging`，pointerdown 不再直接调 `render_content()`（seek 前移或延迟），轮询不打断。
- 批量删除失败时清空/移除已删项的 selected 残留。
- 补 `wire_rail_resize`/`wire_network_resize` 拖拽清理行为测试（pointercancel/mouseleave）。

### 非范围

- 不改变删除幂等语义（SW 层幂等已有）。
- 不重复 t189 已覆盖的 marker 拖拽清理。

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

- [ ] AC-001：timeline 空白区拖拽期间 `_tl_dragging` 为 true，拖拽结束（pointerup/cancel）清理；2s 轮询不打断拖拽（无中间 render_content 干扰 seek）。
- [ ] AC-002：批量删除中途失败后，selected 集合不再含已删除成功的 capture。
- [ ] AC-003：`wire_rail_resize`/`wire_network_resize` pointercancel/mouseleave 清理拖拽状态（jsdom 行为测试）。
- [ ] AC-004：新增测试全绿，既有 dashboard 测试无回归。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：jsdom 拖拽事件模拟 + 既有 dashboard 测试夹具。

## 上下文区

- 来源：p035（t144 遗留 gen_f007）、p040（t154 遗留 gen_f003）、p041（t154 遗留 gen_f002）。2026-08-14 核实：dashboard_detail.ts normal-lane 拖拽分支（wire_lane_pointerdown）无 `_tl_dragging` 设置；batchDel 失败路径未清 selected；resize 清理实现存在但无测试。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- jsdom 派发 pointer 事件序列断言拖拽标记与清理；batchDel mock 部分失败断言 selected。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：空白区拖拽改动影响 seek 几何。
- 回退：seek 保持 overlay 几何读取，仅调整 render 时机。

### 依赖与约束

- 与 t189 timeline 拖拽清理同域（marker 已覆盖，本 task 仅空白区）。

### Finalization 时更新的 blueprint

- 无。
