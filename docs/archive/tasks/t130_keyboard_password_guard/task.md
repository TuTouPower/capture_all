# Task spec

## 背景

type=password input 永不采集是项目绝对约束（domain.md），dom_capture 已有守卫，keyboard_capture 遗漏。redact_data=false + keyboard_capture_mode=all 时焦点在密码框的每次击键明文入库。

## 契约区

### 范围

- 修复 review finding：review H-4 (B3-H1): keyboard_capture 无 password 守卫，redact_data=false 时明文密码击键入库

### 非范围

- 不在本 task 处理的相关联问题（若有，见上下文区来源）

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001: keyboard_capture 在焦点位于 type=password 输入框内时不采集 event.key/event.code，key_status 置 'masked' 或不发事件
- [ ] AC-002: keyboard_capture_mode=all 且 redact_data=false 的组合下，密码框击键仍不产生明文 key（不受脱敏开关影响）
- [ ] AC-003: 非密码框（text/tel/email 等）击键行为与修前一致，不受守卫影响

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001/002: 单测新增用例（all 模式 + password input + redact_data=false → 不采集 key）
- AC-003: 既有 keyboard_capture 测试保持通过

## 上下文区

- 来源：intensive-review review_20260812_1249（review H-4 (B3-H1): keyboard_capture 无 password 守卫，redact_data=false 时明文密码击键入库）

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

- docs/blueprint/domain.md：password 不变量已存在，无需新增
