# Task spec

## 背景

测试隔离与契约确认两条遗留（pending 总账）：keepalive.test.ts 用例依赖模块级 `listener_registered` 幂等注册，重置 on_alarm_listener 破坏 setup 幂等，顺序通过但隔离脆弱（p037）；dispatcher stop success:false 分支（`agent_command_dispatcher.ts`）真实不可达——service_worker stop_capture_inner 恒返回 success:true，失败走 rethrow → STORAGE_READ_FAILED，该分支保留为防御需确认或移除（p049）。

## 契约区

### 范围

- keepalive.test.ts 隔离加固：vi.resetModules 每用例新实例或暴露测试钩子重置幂等标志。
- p049 确认：核实 stop success:false 分支当前可达性，明确保留（防御注释）或移除；保留则补语义说明。

### 非范围

- 不改变 keepalive/service_worker 生产逻辑（仅测试与注释/决策）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：keepalive.test.ts 用例独立运行（单用例/重排/插用例）均绿，不依赖模块级幂等残留。
- [ ] AC-002：dispatcher stop success:false 分支可达性结论明确——保留（注释说明防御语义）或移除（清理死分支），决策落定。
- [ ] AC-003：新增/调整测试全绿，既有相关测试无回归。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试：测试隔离用 vitest 重载；分支可达性用源码/行为核实。

## 上下文区

- 来源：p037（t150 遗留 test_f003）、p049（t177 遗留）。2026-08-14 核实：keepalive.test.ts 幂等注册依赖仍在；dispatcher stop 分支需按当前代码（t177 幂等重构后）核实。

### 有意不测

- 无。

### 测试策略

- vitest 隔离（resetModules）+ 分支可达性行为核实。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：stop 分支移除改变幂等契约。
- 回退：保留分支 + 防御注释（最小改动）。

### 依赖与约束

- 与 t177（stop 幂等）同域。

### Finalization 时更新的 blueprint

- 无。
