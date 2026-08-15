# Task spec

## 背景

p052 两个独立 UI 缺陷:
1. **dashboard 内存快照不刷新**:`get_user_config` 返回 `dashboard_state.ts:85` 的 `_state.user_config`,仅页面加载时(`dashboard.ts:111`)读一次 storage。bridge 心跳回填 `browser_label` 写入 storage 后,已打开的设置页不重新加载就不显示。
2. **「未连接」死文本**:`dashboard_settings.ts:105` 固定渲染 `agentBridgeNotConnected`,无动态更新,不代表真实 bridge 连接态(实测在线也显示「未连接」)。

## 契约区

### 范围

- SW 新增 bridge 连接状态查询 message handler,返回 bridge client 的 enrolled/running 状态。
- dashboard 设置页监听 `chrome.storage.onChanged`,storage 中 `user_config` 变化时更新内存快照并重渲染输入框(含 browser_label 回填即时显示)。
- dashboard 设置页启动时查询 SW bridge 状态,「状态」字段显示真实连接态(已连接/未连接),不再静态死文本。
- 补测试:storage.onChanged 触发快照更新、bridge 状态查询 handler、状态显示断言。

### 非范围

- 不改 bridge 侧状态语义(仍由心跳驱动 enrolled/running)。
- 不做轮询刷新(监听 storage.onChanged + 启动时查询一次即可,回填/配置变更经 storage 事件即时反映)。
- 不处理「设置页打开期间 bridge 中途断开」的实时检测(超出本 task;连接态在页面加载时快照)。

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

- [ ] AC-001:设置页打开时,SW 回填 `browser_label` 到 storage 后,已打开设置页的「备注名」输入框**不重载页面**即更新为回填值。[deploy]
- [ ] AC-002:设置页「状态」字段显示 SW 报告的 bridge 连接态:bridge 在线时显示已连接,离线时显示未连接,不再固定死文本。
- [ ] AC-003:SW 暴露 bridge 连接状态查询 message(bridge client running/enrolled),dashboard 可经此获取连接态。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- AC-001:部分可测——storage.onChanged 触发快照更新可单测(dashboard_state);「不重载页面即更新」的真实浏览器行为标 `[deploy]`。
- AC-002:可自动测试——dashboard_settings 渲染逻辑单测断言状态文本随连接态变化。
- AC-003:可自动测试——SW message handler 返回 enrolled/running。

## 上下文区

- 来源:p052(2026-08-16 核实;dashboard 快照不刷新 + 未连接死文本)

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 真实浏览器中「不重载页面即更新」的端到端行为:需人工验证(AC-001 标 [deploy])。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- SW handler:复用现有 onMessage 测试模式,mock bridge client 状态。
- dashboard_state:mock chrome.storage.onChanged 触发,断言快照更新。
- dashboard_settings 状态文本:渲染函数入参连接态,断言输出文本。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险:storage.onChanged 监听在多个 dashboard 页面同时打开时重复触发重渲染。回退:监听器在页面卸载时移除;重渲染幂等。
- 风险:bridge 状态查询返回的 enrolled 与真实连接可能有毫秒级滞后。回退:状态为页面加载时快照,可接受。

### 依赖与约束

- `agent_bridge_client.ts` 已有 `enrolled`/`running` 状态与 `is_bridge_client_running()`。
- `dashboard_state.ts` `set_user_config` 可更新快照。
- SW `onMessage` 已有 `get_status` case,新增 bridge 状态 case 对齐现有模式。

### Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：无新增决策(方案已定)
- `docs/specs/`：无新增(沿用既有 dashboard/settings 约定)
