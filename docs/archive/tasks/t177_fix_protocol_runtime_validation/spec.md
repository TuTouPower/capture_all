# Task spec

## 背景

Bridge 对 `/extension/result` 仅 `as AgentCommandResult` 后查 owner/queue，未运行时校验 `command_id` 类型、`ok` boolean、`error.code`、成功/失败字段组合。取得合法 pending `command_id` 后可 POST 畸形成功结果，MCP client 对 2xx 直接 cast，调用方收到违反公开 schema 的响应。另一处：协议声明 `NO_ACTIVE_CAPTURE` 错误码，但 dispatcher 只在 handler 返回 `success:false` 时映射；真实 SW 空闲态返回成功 + `capture_id:null`，该错误码在真实调用链不可达。

## 契约区

### 范围

- `/extension/result` 增加共享运行时 schema 校验：plain object、非空 `command_id`、boolean `ok`、合法 `AgentErrorCode`、`ok:true` 不带 error、`ok:false` 必须带 error；失败返回 400/`INVALID_QUERY`，不 resolve/delete pending command。
- 明确 stop 语义：若非幂等，dispatcher 发现 `active_capture_id===null` 直接返回 `NO_ACTIVE_CAPTURE`；若幂等，删除/降级该错误码契约并把成功 data 定义为 `capture_id: string | null`，同步文档与测试。

### 非范围

- 不改变 result 路由的 owner 检查与 body 大小限制。
- 不改变 Agent 生产方的类型化 dispatcher 实现。

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

- [ ] AC-001：owner 合法但 body 畸形（非 boolean `ok`、未知 error code、`ok:true` 带 error、`ok:false` 缺 error）时，`/extension/result` 返回 400/`INVALID_QUERY` 且 pending command 不被 resolve/delete。
- [ ] AC-002：合法 result 仍正常投递，MCP 收到结构符合公开 schema 的响应。
- [ ] AC-003：空闲态 `stop_recording` 返回成功且 `data.capture_id` 为 `null`；`NO_ACTIVE_CAPTURE` 错误码从协议与文档中删除。
- [ ] AC-004：新增畸形 `ok`、未知 error code、缺失 error、owner 合法但 body 非法测试通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试：mock `/extension/result` 请求与 dispatcher 状态。

## 上下文区

- 来源：BC-003、BC-004（2026-08-13 核实，result 路由初始实现以 cast 代替校验，dispatcher 失败映射自 2026-06 存在）。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- mock HTTP result 请求 + queue；断言校验拒绝与合法投递。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- stop 语义已确认（2026-08-13 用户决策）：幂等；空闲态返回成功且 `capture_id` 允许 `null`，删除 `NO_ACTIVE_CAPTURE` 错误码契约，成功 data 明确定义为 `capture_id: string | null`。

### 风险与回退

- 风险：运行时校验过严误拒合法 result。
- 回退：按共享 `protocol.ts` 类型定义精确校验，与生产 dispatcher 输出一致。

### 依赖与约束

- 与 t175/t179 共享 `AgentErrorCode` 与 schema 常量。

### Finalization 时更新的 blueprint

- `docs/blueprint/domain.md`：同步 stop 语义与 `NO_ACTIVE_CAPTURE` 契约。
