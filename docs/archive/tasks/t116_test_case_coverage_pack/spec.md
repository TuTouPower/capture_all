# Task spec

## 背景

历史评审与收尾遗留 14 条测试补强项（均 minor，多为「加 case」级覆盖缺口），分散于 user_config / exception sink / external poll / auto export format / nonce / 网络门控 / SW 串行 / 详情搜索 / 存储限额 / ws absolute_time 接线守卫。核实于 2026-08-11：14 条仍在（p016 的 run_exclusive 串行原语已被 capture_state.test.ts:24 覆盖，本 task 仅补 cleanup↔start in-flight 变体）。

## 契约区

### 范围

- 补 14 条测试缺口，全部落在 `tests/unit/`，不动生产逻辑。

### 非范围

- 不修改生产代码行为；`src/` 仅允许必要的测试钩子导出（如 handle_network_request 直连断言、generate_nonce 导出），改动以测试可达为限。

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

- [ ] AC-001：user_config poll 区间校验测试显式覆盖 `NaN`、`Infinity`、精确下边界 250（p002）。
- [ ] AC-002：exception sink AC-002 断言改为「emit exception 后 console store 无任何事件」（`logs.length === 0`），实现若误写 exception 到 console 即触发失败（p003）。
- [ ] AC-003：exception sink 测试不再访问未声明字段 `errors[0].type`，收敛到已声明字段（p004）。
- [ ] AC-004：exception sink 测试套件 `beforeEach` 调用 `mock_chrome_debugger.reset()`（p005）。
- [ ] AC-005：external poll 补「首轮 poll 已 in-flight 时重入」变体测试，断言旧闭包 resolve 不写、新 poll 单路（p008）。
- [ ] AC-006：auto export format 测试补 `har` 合法 format、17 字符非法 format、大写归一样例（p009）。
- [ ] AC-007：nonce 测试补真实 `crypto.randomUUID()` 两次 start 生成不同 nonce 的用例（p012）。
- [ ] AC-008：nonce 测试直接驱动 `update_page_nonce` 生产写路径，验证 start 后页面 window 变量被写入（p013）。
- [ ] AC-009：nonce HTTP 负向测试的注释与断言证据对齐，或补正向断言证明 fallback nonce 非空（p014）。
- [ ] AC-010：网络门控静态测试断言 `start_network_hook` 在 `start_capture` 内恰好出现一次（p015）。
- [ ] AC-011：cleanup 与 start 的 `run_exclusive` 串行时序补直接测试（挂起 cleanup 的 storage.get → start 排队 → resolve 后键保留）（p016）。
- [ ] AC-012：详情搜索过滤语义补直接测试（输入后可见列表仅含匹配项）（p022）。
- [ ] AC-013：存储限额测试补三条分句断言：delete 被拒后 capture 记录仍在存储；cleanup_stale 终态化 `ended_at` 非空；限额停止 `capture_stopped.reason === 'storage_limit'`（p024）。
- [ ] AC-014：ws `absolute_time` 接线守卫表达式加直连断言锁定（`handle_network_request` 未导出时经内部回调或导出后断言）（p025）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试（vitest + mock_chrome_debugger + fake timers）。

## 上下文区

- 来源：p002/p003/p004/p005/p008/p009/p012/p013/p014/p015/p016/p022/p024/p025（2026-08-11 三路子代理只读核实，均仍在；p016 原语已测，仅补 cleanup↔start 变体）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- 按项目默认：vitest；CDP 路径用 `mock_chrome_debugger`（beforeEach reset，覆盖 sendCommand 后恢复原型方法）；时间依赖用 fake timers。
- nonce 真实 randomUUID 用例：jsdom 需 stub `crypto.randomUUID` 且规避 DOM 内部调用污染（p012 已知约束）。
- AC-013 若需导出 `handle_network_request`，导出须带 `_for_test` 命名约定。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 无。

### 风险与回退

- 风险：断言收紧可能暴露既有误写路径（如 AC-002 若实现真把 exception 写 console，测试红）——此为预期，属补强价值。
- 回退：逐条回退对应用例即可，不影响生产。

### 依赖与约束

- 依赖 t092/t093/t094/t095/t097/t098/t099/t108/t110/t111 的实现已落地（均 done）。

### Finalization 时更新的 blueprint

- 无。
