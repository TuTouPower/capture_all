# Task spec

## 背景

stop_capture 不还原注入脚本改写的页面 API，network_hook 在 stop 后仍对每次 fetch 全量 clone().text()，开销与页面行为污染持续到导航。

## 契约区

### 范围

- 修复 review finding：review H-13 (B3-H4): stop 仅删 message_listener，fetch/XHR/localStorage/WebSocket 永久改写且持续读 body

### 非范围

- 不在本 task 处理的相关联问题（若有，见上下文区来源）

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001: stop 后页面 window.fetch/XHR/localStorage/WebSocket 还原为原始实现（或行为等效：不再有捕获侧读 body/post 消息开销）
- [ ] AC-002: 采集进行中 hook 行为不变
- [ ] AC-003: 还原失败（页面已变化）时静默降级不报错

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001: 注入脚本测试新增 stop→hook 空转断言（fetch 不再 clone/读 body）
- AC-002: 既有 websocket/storage/network_hook 测试保持通过

## 上下文区

- 来源：intensive-review review_20260812_1249（review H-13 (B3-H4): stop 仅删 message_listener，fetch/XHR/localStorage/WebSocket 永久改写且持续读 body）

### 有意不测

- 无

### 测试策略

- 按项目默认（tests/unit mock Chrome API；fixture 用构造数据）

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：行为变更影响既有路径
- 回退：本 task 为独立 commit，可整体 revert

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
