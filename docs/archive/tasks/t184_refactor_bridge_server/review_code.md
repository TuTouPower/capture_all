# Task review t184（reviewer_focus: 代码）

- task：`t184_refactor_bridge_server`
- spec：`docs/tasks/t184_refactor_bridge_server/spec.md`
- diff_anchor：`0375202077e2b59ad857ab5b287a8240ce5db84f`
- target：`git diff 0375202077e2b59ad857ab5b287a8240ce5db84f`
- round：1
- reviewed_at：2026-08-14 06:53 UTC+8

## Findings

### t184_code_f001 - 路由分发 URL 匹配语义变化：错误 method / query 变体的状态码与认证语义偏离旧行为

- 严重度：minor
- 锚点：AC-004（无 endpoint 行为变化，对外状态码/body/认证语义不变）
- 位置：`src/bridge/server.ts:469-500`（分发逻辑）、`src/bridge/server.ts:82-118`（handle_pair_route）
- 问题：旧实现用 `request.url === '/xxx'` 严格相等匹配路由，未命中任何路由的请求落入顶层 `is_authorized` 兜底（未认证→401，已认证→404）。新实现统一改为 query 剥离后的 `path` 匹配（`server.ts:470`），且 pair 路由不再经过顶层认证兜底（`path.startsWith('/pair')` 直接进 handler）。经实证探测（新代码实测 vs 旧代码逐行路径核对）产生以下可观测差异：
  - `GET /pair/open` 无认证：旧 401 → 新 404（两版均拒绝，状态码不同）。
  - `GET /pair?x=1` 无认证：旧 401 → 新 200（返回 pair HTML 页面）。
  - `GET /pair/status?x=1` 无认证：旧 401 → 新 200（返回 pairing code JSON；该数据在精确 `/pair/status` 本就无认证公开，非新增泄露）。
  - `GET /mcp/status?x=1` 带 token：旧 404 → 新 200；`POST /extension/heartbeat?x=1` 带有效扩展 token：旧 404 → 新执行 heartbeat。
  - 未发现任何「先前拒绝→现在放行到需鉴权 handler」的路径：`/extension/*` 数据路径与 `/mcp/*`、`/cdp/*` 仍先鉴权（`server.ts:214`、`332`、`395`），enroll 内部 secret 门槛不变，无安全越权。
- 影响评估：真实客户端（扩展、MCP 客户端）均发送精确 URL，不涉及错误 method 或 query 变体；既有测试（agent_bridge_server 87 条 + t137）全部通过，无测试覆盖这些输入。差异方向为「放宽 URL 变体匹配 + 错误 method 由 401 变 404」，对正常客户端路径行为等价。
- 建议：二选一。(1) 严格保持 AC-004：分发处对未精确命中的 pair/extension/mcp/cdp 前缀路径恢复旧语义——错误 method 请求回退到认证兜底（未认证 401），或 (2) 接受该差异（query string 不改变资源身份属常规 API 语义，错误 method 401→404 均为拒绝），在 spec/task 中把 AC-004 语义收敛为「正常客户端请求路径的状态码/body/认证语义不变」，避免后续依赖旧边界行为的调用方困惑。

### t184_code_f002 - registry.ts 死代码：`AgentCommandType` 的类型 re-export 与 import 无人消费

- 严重度：minor
- 锚点：代码质量（死代码）
- 位置：`src/bridge/registry.ts:8`（`import type { AgentCommandType, AgentStatus }`）、`src/bridge/registry.ts:243`（`export type { AgentCommandType }`）
- 问题：`export type { AgentCommandType }` 注释称「供类型引用（route handler 层对命令类型的判别）」，但全仓 grep 确认无任何模块从 `bridge/registry` 导入 `AgentCommandType`（唯一消费者 `src/bridge/server.ts` 直接 `import ... from '../shared/protocol'`，测试文件导入 `BridgeRegistry/generate_instance_id/ExtensionInstance`）。连带 registry.ts:8 的 `AgentCommandType` import 仅服务于该死 re-export。
- 建议：删除 registry.ts:243 的 re-export 与 registry.ts:8 import 中的 `AgentCommandType`（保留 `AgentStatus`，build_status 使用）。

### t184_code_f003 - BRIDGE_VERSION 常量双份维护（server.ts 与 registry.ts 各一份）

- 严重度：minor
- 锚点：代码质量（DRY，重复已引入分叉风险）
- 位置：`src/bridge/server.ts:44` 与 `src/bridge/registry.ts:24`（均 `const BRIDGE_VERSION = '0.1.0'`）
- 问题：版本常量在重构前仅存在于 server.ts（`/health` 使用）；本 task 新建 registry.ts 后 `build_status` 需要它，于是复制了一份。当前两份值一致，无分叉；但后续版本升级需同时改两处，漏改会导致 `/health` 与 `/mcp/status` 上报不同 `bridge_version`（可观测不一致）。
- 建议：单一来源导出（如由 registry.ts 导出 `BRIDGE_VERSION`，server.ts 导入复用；或移入 `src/bridge/config.ts` / shared 常量）。

## 结论

- 本轮新发现：3 条（均为 minor）
- 未进表的提示：
  - 文件过大：`src/bridge/server.ts` 977 行，已达 important 阈值（≥800），但本 task 净减 180 行（旧 1157 → 新 977）并拆分出 `src/bridge/registry.ts`（243 行），不满足「本 task 仍净增」条件，按降级规则不进 finding 表。`tests/unit/bridge_registry_refactor.test.ts` 97 行、`registry.ts` 243 行均未超阈值。
  - 复杂度：`handle_extension_route`（server.ts:121-328）手算 McCabe ≈ 20+（enroll/heartbeat/command/result 四端点聚合分发，含 try/catch 与三元），新建即超 15 阈值。该聚合形状由 spec 范围「拆出 4 个 route handler」规定（extension 一组承载 4 个端点），顶层 request handler 复杂度已大幅下降（旧全内联 ≈ 30+ 分支）；拆分更细不属本 task 范围，故仅提示。其余 handler：pair ≈ 9、mcp ≈ 9、cdp ≈ 6，均低于阈值。
  - 范围外观察：`server.ts:473` `const handlers = route_handlers;` 为冗余别名（无行为影响）；`/health`、`/extension/discover` 保留在顶层分发而非 handler 内，与 AC-003「4 个 route handler」描述一致（两路由本就无业务状态，不构成违反）。
- 总体判断：行为等价重构主体成立（AC-001/002/003 满足，AC-004 正常客户端路径等价、边界输入有 f001 偏差），3 条 minor 不阻断。
- 系统性 follow-up：无。

### AC 复验披露

- AC-001（全部既有 agent_bridge_server 与 t137_bridge_security 测试通过）：`re_verified` — 运行 `npx vitest run` 全量 189 文件 / 1804 测试全过（含 agent_bridge_server.test.ts 87 条、t137_bridge_security.test.ts）；`npx tsc --noEmit` 0 错误。
- AC-002（enroll/heartbeat 顶替清理收敛到单一 replace_instance_by_label/remove_instance，无重复实现）：`re_verified` — 代码查证：enroll 与 heartbeat 分别仅经 `server.ts:178`、`server.ts:244` 调用 `registry.replace_instance_by_label`；`replace_instance_by_label` 与 `sweep_expired` 均经唯一删除路径 `remove_instance`（registry.ts:125 / 93）；server.ts 内已无任何内联实例/queue 删除循环（grep `.delete(|cancel_all|instances.|queues.` 仅剩 `command_owners.delete` 的命令生命周期清理与 `registry.cancel_all()` close 路径）；新测试 bridge_registry_refactor.test.ts 断言收敛点数量与路径。
- AC-003（各 route handler 返回统一 {status, body}，server 层只做 CORS/异常映射/发送）：`re_verified` — 代码查证：`RouteResult`（server.ts:56-60）、4 个 handler 均返回 RouteResult（server.ts:69-424）；server 层保留 CORS/OPTIONS/异常映射/发送（server.ts:446-521），发送统一走 `send_json(response, result.status, result.body)`（server.ts:507）；新测试断言 handler 内无 `send_json(response`。
- AC-004（无 endpoint 行为变化）：`re_verified`（含偏差发现）— 逐端点 diff 对照 + 实证探测（.scratch/t184_review/probe_route.mjs 启动新 server 实测 9 组边界请求，与旧代码路径核对）：正常 method + 精确 URL 全部等价；错误 method / query 变体存在 f001 差异（见 finding）。
- coverage = 4 / 4（re_verified）

verdict: PASS

reviewed_scope: 3837b29bdbb72e04

## Round 2 (2026-08-14 06:58 UTC+8)

复核方式：`git diff 0375202077e2b59ad857ab5b287a8240ce5db84f` 对照处置后代码 + `npx vitest run`（11 个 bridge/server 相关测试文件，175 条全过）+ `npx tsc --noEmit`（0 错）+ 边界输入实证探测（`.scratch/t184_review/probe_round2.mjs`，15 组请求，旧行为按 anchor 版本逐行路径核对）。

### 前轮 finding 复核

- **t184_code_f001：修不彻底（部分修复）**。query 变体与严格 URL 分发已恢复旧语义（实证 OK）：`GET /pair?x=1` 无认证 401、`GET /pair/status?x=1` 无认证 401、`GET /mcp/status?x=1` 带 token 404、`GET /extension/command?instance_id=foo` 无认证 401、`GET /extension/enroll?x=1` 无认证 401、`GET /pairXYZ` 无认证 401；正常路径 `GET /pair`、`GET /pair/status` 200。**残留差异（实证 DIFF，旧 401 → 新 404）**：精确 URL + 错误 method + 未认证的 5 组——`GET /pair/open`、`POST /pair`、`POST /pair/status`、`GET /pair/close`、`GET /extension/enroll`。根因：分发层 `url === '/pair/open'` 等条件（server.ts:487-489）不分 method，错误 method 请求进入 handler 后 method 检查失败走 404 fallthrough（server.ts:117 / :210），该 fallthrough 无认证兜底；旧代码顶层 `else if (!is_authorized)`（分类阶段）兜底了所有未命中「method+URL 联合检查」的请求。已认证 + 错误 method 两版均 404，一致。残留仍为 minor：无真实客户端发送错误 method 请求、两版均拒绝、无安全回归（extension data / mcp / cdp 路径仍先鉴权）。task.md 处置表自述「边界输入状态码/认证行为与重构前一致」与实证不符。最小修复方向：分发层改 method+URL 联合精确匹配（未命中落入 else 认证兜底），或 pair/enroll handler 404 fallthrough 前补 `is_authorized` 检查；若不修，建议将 AC-004 语义收敛为「正常客户端请求路径不变」。
- **t184_code_f002：已消除**。`registry.ts:8` import 仅剩 `AgentStatus`（`AgentCommandType` 已删），文件尾 `export type { AgentCommandType }` re-export 已删（文件 243→240 行）；grep 确认全仓无 `AgentCommandType` 从 `bridge/registry` 导入。
- **t184_code_f003：已消除**。`config.ts:182` 新增 `export const BRIDGE_VERSION = '0.1.0'` 为单一来源；`server.ts:13` 与 `registry.ts:9` 均 `import { BRIDGE_VERSION } from './config'`，两文件本地常量已删；grep 确认无第二处版本字面量。

### 本轮新发现

- 0 条。

### AC 复验披露（Round 2）

- AC-001：`re_verified` — `npx vitest run`（agent_bridge_server / t137 / lifecycle / registry_refactor / mcp_schema_boundaries / output_path_contract / result_runtime_validation / agent_mcp_client / bridge_label / bridge_cdp_events / bridge_config_health）175 条全过；`npx tsc --noEmit` 0 错。
- AC-002：`re_verified` — 同 Round 1（enroll/heartbeat 均经 `replace_instance_by_label`，sweep/顶替均经 `remove_instance`，server.ts 无内联删除循环），本轮代码无相关改动。
- AC-003：`re_verified` — 同 Round 1（RouteResult 统一 `{status, body}`，server 层只做 CORS/异常映射/发送），本轮仅分发匹配条件调整，不影响该结构。
- AC-004：`re_verified`（含残留偏差）— 正常客户端路径（精确 method+URL）逐端点等价；query 变体已恢复旧语义；**错误 method 认证语义仍残留偏差（f001 未修透，见上）**。
- coverage = 4 / 4（re_verified）

### 总体判断

f002/f003 修复完整；f001 修复过半但未覆盖「错误 method + 未认证」的 pair/enroll 请求（5 端点 401→404），残留为 minor（无 blocker）。无未解决 critical/important → PASS；若 implementer 坚持 AC-004 字面等价（错误 method 也须 401），应补上述最小修复或收敛 AC 语义。

- 系统性 follow-up：无。

verdict: PASS

reviewed_scope: 59f0864650ccd3ba

## Round 3 (2026-08-14 07:00 UTC+8)

复核方式：`git diff 0375202077e2b59ad857ab5b287a8240ce5db84f` 对照 f001 修复代码 + 边界实证探测（`.scratch/t184_review/probe_round3.mjs` 16 组 + `probe_round3b.mjs` 3 组）+ `npx vitest run`（11 个 bridge/server 相关测试文件 175 条全过）+ `npx tsc --noEmit`（0 错）。

### 前轮 finding 复核

- **t184_code_f001：已消除（残留修复完整）**。分发层改为 method+URL 联合匹配（`server.ts:487-501`）：pair 4 端点（GET /pair、GET /pair/status、POST /pair/open、POST /pair/close）与 extension 4 端点（POST enroll/heartbeat/result、GET command[?]）均带 method，错误 method 请求不再进入 handler，落入 else 认证兜底（`server.ts:506-513`，未认证 401 / 已认证 404），与重构前顶层分类兜底语义一致。实证（未认证均恢复 401）：`GET /pair/open`、`POST /pair`、`POST /pair/status`、`GET /pair/close`、`GET /extension/enroll` — 5 组全 OK；已认证 + 错误 method 均 404（`GET /pair/open`、`GET /extension/enroll`、`GET /extension/heartbeat` 带 token）与旧一致；正常路径 `GET /pair`、`GET /pair/status`、`POST /pair/open`（带 token）、`GET /health` 均 200；query 变体回归保持（`GET /pair?x=1` 401、`GET /mcp/status?x=1` 带 token 404、`GET /extension/command?instance_id=foo` 401）。
- 附带核对：探测中 `POST /extension/enroll` 空 body → 400 INVALID_QUERY（'JSON body is required'）为两版一致既有行为（read_json 空 body 抛 BridgeHttpError），非回归；带合法 body 无认证 → 401（t169 secret 门槛）、带 MCP token → 200，复测确认。
- t184_code_f002 / t184_code_f003：Round 2 已确认消除，本轮分发层改动未触碰 registry.ts 与 config.ts 版本常量，维持消除状态。

### 本轮新发现

- 0 条。

### AC 复验披露（Round 3）

- AC-001：`re_verified` — `npx vitest run`（agent_bridge_server / t137 / lifecycle / registry_refactor / mcp_schema_boundaries / output_path_contract / result_runtime_validation / agent_mcp_client / bridge_label / bridge_cdp_events / bridge_config_health）175 条全过；`npx tsc --noEmit` 0 错。
- AC-002 / AC-003：`re_verified` — 代码结构未变（同 Round 2 结论），本轮仅分发匹配条件调整。
- AC-004：`re_verified` — 正常客户端路径（精确 method+URL）与边界输入（错误 method / query 变体）实证全部与重构前一致；f001 全部 5 组残留已恢复 401。
- coverage = 4 / 4（re_verified）

### 总体判断

f001 残留（Round 2 的 5 组错误 method + 未认证 401→404）已修复并实证恢复旧语义；f002/f003 维持消除；全部 AC 满足。无未解决 critical/important，无 minor 残留。

- 系统性 follow-up：无。

verdict: PASS

reviewed_scope: bede19493194f36d
