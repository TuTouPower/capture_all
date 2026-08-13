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

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。

<!-- /规范 -->

- [ ] AC-001：keepalive.test.ts 用例独立运行（单用例/重排/插用例）均绿，不依赖模块级幂等残留。
- [ ] AC-002：dispatcher stop success:false 分支可达性结论明确——保留（注释说明防御语义）或移除（清理死分支），决策落定。
- [ ] AC-003：新增/调整测试全绿，既有相关测试无回归。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：测试隔离用 vitest 重载；分支可达性用源码/行为核实。

## 上下文区

- 来源：p037（t150 遗留 test_f003）、p049（t177 遗留）。2026-08-14 核实：keepalive.test.ts 幂等注册依赖仍在；dispatcher stop 分支需按当前代码（t177 幂等重构后）核实。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- vitest 隔离（resetModules）+ 分支可达性行为核实。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：stop 分支移除改变幂等契约。
- 回退：保留分支 + 防御注释（最小改动）。

### 依赖与约束

- 与 t177（stop 幂等）同域。

### Finalization 时更新的 blueprint

- 无。
