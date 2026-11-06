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

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：timeline 空白区拖拽期间 `_tl_dragging` 为 true，拖拽结束（pointerup/cancel）清理；2s 轮询不打断拖拽（无中间 render_content 干扰 seek）。
- [ ] AC-002：批量删除中途失败后，selected 集合不再含已删除成功的 capture。
- [ ] AC-003：`wire_rail_resize`/`wire_network_resize` pointercancel/mouseleave 清理拖拽状态（jsdom 行为测试）。
- [ ] AC-004：新增测试全绿，既有 dashboard 测试无回归。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试：jsdom 拖拽事件模拟 + 既有 dashboard 测试夹具。

## 上下文区

- 来源：p035（t144 遗留 gen_f007）、p040（t154 遗留 gen_f003）、p041（t154 遗留 gen_f002）。2026-08-14 核实：dashboard_detail.ts normal-lane 拖拽分支（wire_lane_pointerdown）无 `_tl_dragging` 设置；batchDel 失败路径未清 selected；resize 清理实现存在但无测试。

### 有意不测

- 无。

### 测试策略

- jsdom 派发 pointer 事件序列断言拖拽标记与清理；batchDel mock 部分失败断言 selected。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：空白区拖拽改动影响 seek 几何。
- 回退：seek 保持 overlay 几何读取，仅调整 render 时机。

### 依赖与约束

- 与 t189 timeline 拖拽清理同域（marker 已覆盖，本 task 仅空白区）。

### Finalization 时更新的 blueprint

- 无。
