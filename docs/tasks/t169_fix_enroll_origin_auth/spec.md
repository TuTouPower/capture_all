# Task spec

## 背景

`/extension/enroll` 首次登记时，只要 HTTP `Origin` 形如 `chrome-extension://[a-p]{32}` 即放行并签发 `ext_*` instance token。`Origin` 是客户端可构造 header，本地进程可伪造，不证明请求来自真实扩展。t137 只防不同 extension ID 顶替既有绑定，未建立首次登记身份。

## 契约区

### 范围

- 首次 enroll 使用真正 secret：一次性 pairing code、MCP Bearer token，或安装时固定/安全分发的 extension credential。
- `Origin` 仅作附加一致性校验，不再作主凭据。
- 无 pairing/token 的伪造合法形状 Origin 请求必须 401/403。

### 非范围

- 不改变已绑定实例的后续请求认证（instance token 机制保留）。
- 不改变零配置自动连接的正常用户体验目标（用安全分发方式承接）。

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

- [ ] AC-001：无 pairing/token、仅携带合法形状 `chrome-extension://[a-p]{32}` Origin 的 enroll 请求返回 401/403，不签发 instance token。
- [ ] AC-002：携带有效一次性 pairing code 或 MCP Bearer token 的首次 enroll 成功，且后续请求认证不受影响。
- [ ] AC-003：真实扩展自动连接仍可无人工手填 token 完成 enroll（用安全分发 credential 或等价机制）。
- [ ] AC-004：新增「伪造合法形状 Origin + 无 pairing/token 必须 401/403」测试通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试：mock HTTP Origin header 与 pairing/token 状态。

## 上下文区

- 来源：SEC-001（2026-08-13 核实，`d8970e7` 移除 pairing 强制，`7daf059` t137 防顶替但保留首次零配置放行）。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- mock Origin header 与 credential 状态；断言 enroll 放行/拒绝与 token 签发。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- 首次 enroll 认证模型已确认（2026-08-13 用户决策）：零配置 + 一次性 pairing code 或 MCP Bearer token 参与首次登记，`Origin` 仅作附加一致性校验，不再作主凭据。

### 风险与回退

- 风险：破坏零配置自动连接的易用性。
- 回退：保留安全默认，advanced 场景显式 pairing/token。

### 依赖与约束

- 与 `src/shared/constants.ts` 默认扩展配置、`docs/guides/mcp_usage.md` 的零配置说明保持一致。

### Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：记录首次 enroll 认证模型决策（ADR）。
