# Task spec

## 背景

p054：t202 引入 `wire_bridge_status` 时每次 `wire_settings` 都 `chrome.storage.onChanged.addListener`，无 remove/单例守卫。设置页多次导航后监听器累积，重复 `set_user_config` 与 DOM 更新。

## 契约区

### 范围

- `wire_bridge_status`（或等价路径）对 `chrome.storage.onChanged` 采用模块级单例注册：多次进入设置页监听器数量不增加。
- 监听器仍在 `user_config` 变化时更新内存快照与「备注名」输入框（保持 t202 AC-001 语义）。
- 补测试：多次 `wire_settings` 后 `addListener` 调用次数 = 1；仍可响应 onChanged 更新输入框。

### 非范围

- 不改 bridge 状态查询语义（t202 AC-002/003）。
- 不扫/改 dashboard 其他页面的监听器（本条目聚焦 settings）。

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

- [ ] AC-001:多次进入设置页（多次 `wire_settings` / `wire_bridge_status`）后，`chrome.storage.onChanged.addListener` 仅注册一次。
- [ ] AC-002:单例监听器在外部 `user_config.browser_label` 变更时仍更新「备注名」输入框（不回归 t202 回填）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试。

## 上下文区

- 来源:p054（t202 Round 1 `t202_code_f001` 遗留；2026-08-16 核实：t202 分支 `wire_bridge_status` 仍每次 addListener）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 复用 `tests/unit/settings_ui.test.ts` 的 chrome.storage.onChanged mock；断言多次 wire 后 `addListener` mock 调用次数为 1，并保留 onChanged 更新输入框用例。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：单例监听器闭包持有旧 content 根节点。回退：查询 `#content [data-cfg="browser_label"]` 现用 DOM，不捕获 wire 时的节点引用。

### 依赖与约束

- 依赖 t202 已落地的 `wire_bridge_status` + storage 同步语义；链式 base 为 t203 分支 tip。

### Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：无新增决策
- `docs/specs/`：无新增
