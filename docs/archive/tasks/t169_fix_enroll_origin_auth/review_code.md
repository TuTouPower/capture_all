# Task review t169（reviewer_focus: 代码）

- task：`t169_fix_enroll_origin_auth`
- spec：`docs/tasks/t169_fix_enroll_origin_auth/spec.md`
- diff_anchor：`a631e0030d4ba8225a161f25ef1665b1af77a154`
- target：`git diff a631e0030d4ba8225a161f25ef1665b1af77a154`
- round：1
- reviewed_at：2026-08-13 18:12 UTC+8

## Findings

### t169_code_f001 - AC-003 零配置自动连接断链：无任何运行时组件自动打开 pairing，真实扩展默认部署下首次 enroll 永 401

- 严重度：important
- 锚点：AC-003（真实扩展自动连接仍可无人工手填 token 完成 enroll）；spec 非范围「不改变零配置自动连接的正常用户体验目标（用安全分发方式承接）」
- 位置：`src/bridge/server.ts:277`、`src/extension/background/agent_bridge_client.ts:251-280`、`src/mcp/tools.ts:9-31`、`src/bridge/main.ts:4-34`
- 问题：
  1. 新 enroll 逻辑（`server.ts:277`）：`if (!has_mcp && !pairing_valid)` → 401。无 MCP token 的首次 enroll 必须携带有效 pairing code。
  2. pairing 唯一开启入口 `POST /pair/open` 需 MCP token（`server.ts:206`），但全仓库运行时代码（排除测试）**无任何调用方**：MCP 工具集无 pair 工具（`src/mcp/tools.ts` 的 `TOOL_COMMANDS` / `MCP_TOOL_NAMES` 只有 get_status/list_browsers/命令类）；bridge 启动不自动 open（`src/bridge/main.ts` 只 listen）；扩展只读 `/pair/status` 不 open（`agent_bridge_client.ts:271-280`）。grep `/pair/open` 命中仅测试与文档/ADR 描述。
  3. 默认配置 `agent_bridge_enabled: true` + `agent_bridge_token: ''`（`src/shared/constants.ts:63-65`）。真实部署装扩展后：resolve_pairing_code 返回 undefined → enroll 401 → 1s 轮询重试死循环（`agent_bridge_client.ts:211-218` + `resolve_token` null 分支）。唯一出路是人工 curl `/pair/open`，且需先读 0600 token 文件——普通用户不可行，违背 T091 零配置目标。
  4. 回归破坏（非范围「不改变零配置自动连接的正常用户体验」被违反）：Bridge server 重启（SessionStart hook 每次会话拉起的场景）→ instances Map 清空 → 扩展已存 session instance_token 心跳 401 → `handle_401` 用 runtime_instance_id 重 enroll → server 端 `existing` 不存在 → 走 !existing 分支需 pairing code → 401 死循环。T091 时代 origin 直通自动恢复，现需 pairing 窗口。
  5. ADR 023（`docs/blueprint/decisions.md:189`）声称「MCP 客户端（读 0600 token 文件）调 /pair/open → 扩展从 /pair/status 自动取 pairing code enroll」——该「MCP 客户端调 /pair/open」在代码中不存在，ADR 描述的零配置承接机制未落地。
- 建议：本 task 补齐 MCP 侧 open pairing 机制（MCP 工具 `open_pairing`，或 MCP server 启动/SessionStart hook 自动 `/pair/open`），使 AC-003 闭环；或经用户确认将 AC-003 判定为依赖后续 task，同步修改 spec 上下文区与 ADR 023 描述。

### t169_code_f002 - 指南/README/配置注释未同步，仍宣称 origin 直通零配置，用户按文档操作必然 401

- 严重度：minor
- 锚点：spec「依赖与约束」——「与 `src/shared/constants.ts` 默认扩展配置、`docs/guides/mcp_usage.md` 的零配置说明保持一致」
- 位置：`docs/guides/mcp_usage.md:8,18,146`、`README.md:161`、`README.en.md:160`、`src/shared/agent_bridge_config.ts:27`
- 问题：上述文档/注释仍写「首次连接凭 chrome-extension origin 直通 enroll，**无需 Token / 配对码**」「loopback 默认不要求 pairing」。实际实现（`server.ts:277`）无 token 首次 enroll 必须有效 pairing code；无 code 即 401。用户按快速开始装扩展后等待自动连接，实际 enroll 无限失败，且文档未提及任何 pairing 步骤。
- 建议：同步文档为「首次 enroll 需 MCP token 或有效 pairing code；零配置路径需先 `/pair/open`（经 MCP 工具或手动）」，同步更新 `agent_bridge_config.ts:27` 过时注释。

### t169_code_f003 - pairing code 未消费，「一次性 pairing code」未实现，窗口期内可无限复用

- 严重度：minor
- 锚点：spec 范围区「首次 enroll 使用真正 secret：**一次性** pairing code、MCP Bearer token…」
- 位置：`src/bridge/server.ts:721-730`（`is_enroll_allowed`）
- 问题：`is_enroll_allowed` 是纯检查，不标记 code 已使用、不改 `pairing_state`。窗口期内同一 code 可被任意多次 enroll 复用（多个伪造 Origin 可各自绑定新实例）。与 spec「一次性 pairing code」字面不符。与既有「`/pair/status` 无鉴权返回 code」（已批准设计）叠加后，窗口期内 code 对任意本地进程可见且可重复使用，弱于「一次性 + 短窗口」承诺的 secret 语义。无对应 AC，未按 blocking 处理。
- 建议：实现消费语义（enroll 成功消费 code 后使其失效 / 关闭窗口），或按「spec 过时」处置改 spec 措辞为「窗口期内有效」，由 implementer 决定。

## 结论

- 前轮 finding 复核：Round 1，无
- 本轮新发现：3 条（1 important + 2 minor）
- 未进表的提示：
  - 文件过大：`src/bridge/server.ts` 985 行（≥800 阈值），本 task 净增约 12 行，历史遗留未继续堆大；`tests/unit/agent_bridge_server.test.ts` 2074 行（≥1200 测试阈值），本 task 改 44 行。均只列路径与行数，不进 finding 表。
  - 复杂度：enroll 分支块手算 CC≈8（`existing`/两层嵌套/`!has_mcp&&!pairing_valid`），未达 10/15 阈值。
  - 范围外观察：扩展侧 `resolve_pairing_code` 无单测触达——`tests/unit/agent_bridge_client.test.ts` 的 enroll mock（`mock_idle_bridge` 直接返回 200 成功）不经过 `/pair/status` 解析逻辑，真实取 code 分支由测试未覆盖；提示 test reviewer，不进本表。
  - 重 enroll 无需 secret、MCP token 亦因 origin 不匹配 403，均为 t137 既存语义，spec 非范围明确保留，未出 finding。
- 总体判断：AC-001/002/004 实现与测试齐备且全绿；AC-003 的零配置链路断链（f001 important，MCP 侧 open pairing 机制未交付），且文档未同步（f002）；存在未解决 important，FAIL。
- 系统性 follow-up：无等价 task（`task.py list` 无活跃配对相关项；`docs/pending/todo/` 无 pairing 条目）。建议标题 `mcp pairing open 机制承接零配置首次 enroll`，slug `mcp_pair_open_auto_enroll`，阻断性：blocking（承接 AC-003 闭环）。

### AC 复验方式

- AC-001：`re_verified`——`tests/unit/t137_bridge_security.test.ts`「t169 AC-001: 伪造合法形状 Origin 无 pairing/token 的首次 enroll 401 不签发 token」+ `server.ts:274-284` 拒绝分支；vitest 全绿。
- AC-002：`re_verified`——「t169 AC-002: 携带 MCP Bearer token 首次 enroll 成功且后续请求认证正常」（token + heartbeat 200）、「AC-006 (t169): 有效 pairing code 首次 enroll 成功」、`agent_bridge_server.test.ts` 改造后 pairing/token 用例；99 tests passed。
- AC-003：`re_verified`（不达标）——独立核查 `agent_bridge_client.ts:251-280` 取 code 链路与 1s 轮询重试正确；但「谁 open pairing」全仓库无运行时实现（f001），判定未闭环。
- AC-004：`re_verified`——新增测试存在且通过（`npx vitest run tests/unit/t137_bridge_security.test.ts tests/unit/agent_bridge_server.test.ts` → 99 passed）。

coverage = 4 / 4

verdict: FAIL

## Round 2 (2026-08-13 18:30 UTC+8)

### 前轮 finding 复核（以 diff 为准）

- **t169_code_f001（important）— 已消除（主体）**：`pairing_auto_open` 启动自动 open（`server.ts:96-99`，默认 `undefined !== false` 生效），生产入口 `main.ts` 不设该字段即自动开窗；扩展 `resolve_pairing_code` 链路不变。bridge 重启断连由 auto_open 兜底：重启后重新开窗，扩展 re-enroll 自动成功（无需 instances_file 也可自愈）。AC-003a 测试验证 open→enroll→消费关闭。残留断链路径见本轮 f005。
- **t169_code_f002（minor）— 修不彻底**：`docs/guides/mcp_usage.md:8`、`README.md:65,146` 已同步 t169 语义（首次需凭据、自动配对码、伪造 401）；但 `src/shared/agent_bridge_config.ts:27` 注释仍写「扩展可凭 chrome-extension origin 在 loopback 内直通 enroll，无需手填 token」，未同步。见本轮 f006。
- **t169_code_f003（minor）— 已消除**：enroll 成功且 `!has_mcp && pairing_valid` 时关闭 pairing（`server.ts:374-378`）；`is_enroll_allowed` 保持纯检查、消费在 enroll 层完成，语义等价；AC-003a 断言消费后 `open=false`。窗口期内同 code 复用问题已消除。

### 本轮新发现

### t169_code_f004 - instances_file 未接线生产入口：ADR 023「重启恢复」与处置声明生产不可达

- 严重度：important
- 锚点：处置声明「已绑定实例持久化（instances_file，token hash + 元数据，启动加载/变更写盘）→ bridge 重启后 heartbeat/重 enroll 不中断」；`docs/blueprint/decisions.md:191`（ADR 023「重启恢复」）
- 位置：`src/bridge/server.ts:63-93`（persist/load 实现）、`src/bridge/config.ts:24-40`（parse_bridge_config 不返回 instances_file）、`src/bridge/main.ts:4-34`（不设默认路径）
- 问题：持久化能力只响应 `config.instances_file`，但生产入口从未提供该配置：`parse_bridge_config` 返回对象不含该字段、`parse_bridge_cli_args` 无对应 CLI 参数、无 env、README/指南未说明如何启用（protocol.ts 注释「默认缺省不持久化」）。即生产 bridge 永远不持久化实例，ADR 023「bridge 重启后 heartbeat/重 enroll 不中断（instance token 机制保留）」在生产不可达；处置声明与实现不一致。测试 `AC-003b` 直配 `instances_file` 只证明 server 层能力可用，未覆盖生产接线。
- 建议：main.ts 提供默认路径（如与 token 文件同目录 `$XDG_RUNTIME_DIR/capture-all/instances.json`，`mkdir` + mode 0600），或暴露 `--instances-file`/env 并写入文档；否则按「能力未交付」修订 ADR/处置声明。

### t169_code_f005 - auto-open 一次性窗口无续期：错过初始窗口的首次 enroll 永久断连，多实例仅首个零配置

- 严重度：minor
- 锚点：AC-003（零配置自动连接）；spec 风险区「破坏零配置自动连接的易用性」
- 位置：`src/bridge/server.ts:96-99`（auto_open 仅启动一次）、`src/bridge/server.ts:374-378`（首次消费即关窗）
- 问题：窗口 5 分钟（`PAIRING_DEFAULT_DURATION_MS`）、过期不续期。典型时序「先起 AI 会话（SessionStart hook 拉 bridge）→ 5 分钟后才打开 Chrome/加载扩展」→ `/pair/status` 返回 `open=false` → 扩展 enroll 401 死循环（无人为干预无出路，T091 时代无此窗口）。多实例同理：一次性 code 仅够第一个浏览器 enroll，后续新浏览器零配置断连（需重启 bridge 或人工 `/pair/open`）。属已登记风险（零配置易用性破坏）内的实现选择，非阻断，但存在无安全代价的缓解。
- 建议：窗口未被消费前过期自动续期（保持 auto_open 语义直到首次 enroll），或 README 明示「错过初始窗口需重启 Bridge / `/pair/open`」；多实例场景配合后续 MCP open 工具（见系统性 follow-up）。

### t169_code_f006 - agent_bridge_config.ts 过时注释未同步（f002 残留）

- 严重度：minor
- 锚点：spec「依赖与约束」；f002 复核
- 位置：`src/shared/agent_bridge_config.ts:27`
- 问题：注释「扩展可凭 chrome-extension origin 在 loopback 内直通 enroll，无需手填 token」描述 T091 旧行为，与新首次登记门槛（`server.ts:277` 无 token 需 pairing code）矛盾。
- 建议：同步为「无 token 时扩展自动读取 pairing code enroll」。

### 结论

- 前轮 finding 复核：f001 已消除（主体，残留见 f005）；f002 修不彻底（残留 f006）；f003 已消除
- 本轮新发现：3 条（1 important + 2 minor）
- 未进表的提示：
  - 文件过大：`src/bridge/server.ts` 1033 行（≥800 阈值），本 task 累计净增约 50 行，历史遗留持续堆大，未给拆分约束；按降级规则仅结论段提示，不进 finding 表。
  - 测试隔离：t137/agent_bridge_server 的 `start_server` 默认 `pairing_auto_open: false`（生产默认 true），仅 AC-003a 覆盖 true 路径——测试与生产默认不一致，未掩盖旧用例，可接受；提示 test reviewer。
  - `persist_instances` 为 fire-and-forget 写盘：enroll 成功响应与磁盘写入存在竞态（响应后立即崩溃可能丢最后一条），best-effort 语义可接受，不另出 finding。
  - 抢占消费（恶意进程抢在真实扩展前消费 auto-open code 致扩展 401）属 ADR 023 已批准威胁模型（同用户进程已妥协），不新增暴露面，未出 finding。
- 总体判断：f003 完整修复；f001 主体修复（auto_open 使默认部署可自动 enroll、重启可自愈）；但 f004（instances_file 生产未接线，ADR/处置声明不实）未解决 → FAIL。f005/f006 为 minor 不阻断。
- 系统性 follow-up：无等价 task（`task.py list` 无匹配、pending 无条目）。建议标题 `mcp pairing open 工具承接多实例零配置首次 enroll`，slug `mcp_pair_open_multi_instance`，阻断性：不阻断（f005 缓解）；instances_file 接线可并入本 task 修复（f004）。

### AC 复验方式（Round 2）

- AC-001：`re_verified`——「t169 AC-001」测试 + `server.ts:294-304` 拒绝分支；125 tests 全绿。
- AC-002：`re_verified`——「t169 AC-002」「AC-006 (t169)」+ heartbeat 断言；125 tests 全绿。
- AC-003：`re_verified`（不完整）——auto_open（AC-003a）与持久化（AC-003b）测试全绿；但实例持久化生产未接线（f004）、错过窗口/多实例断链（f005）。
- AC-004：`re_verified`——`npx vitest run tests/unit/t137_bridge_security.test.ts tests/unit/agent_bridge_server.test.ts tests/unit/agent_bridge_client.test.ts` → 125 passed；`npx tsc --noEmit` → 0。

coverage = 4 / 4

reviewed_scope: f8d491668635b7fc

verdict: FAIL

## Round 3 (2026-08-13 18:35 UTC+8)

### 前轮 finding 复核（以 diff 为准）

- **t169_code_f004（important）— 已修**：`parse_bridge_config` 输出 `pairing_auto_open: raw.pairing_auto_open ?? true`（默认 true）与 `instances_file: raw.instances_file`（`src/bridge/config.ts:39-40`）；`parse_bridge_cli_args` 从 `CAPTURE_ALL_INSTANCES_FILE`、`CAPTURE_ALL_PAIRING_AUTO_OPEN`（`'0'`/`'false'` → false，其余 → 默认 true）读取（`config.ts:48-50,63-64`）。`tests/unit/agent_bridge_config.test.ts` 断言默认 `pairing_auto_open: true`。生产接线完整：`main.ts → parse_bridge_cli_args → parse_bridge_config` 链路可达。
- **t169_code_f005（minor）— 接受处置，不阻断**：处置为「已登记风险 + 保持安全默认不做自动续期」。论证复核：窗口过期 → 扩展 `resolve_pairing_code` 返回 undefined → enroll 401 → `resolve_token` catch → null → 1s 轮询重试（不死循环崩溃）；「MCP 客户端可再次 `/pair/open` 续窗」在生产当前无自动调用者（Round 1 已核实），实为人工 curl / 后续 MCP 工具路径——处置定位与 spec「风险与回退」区一致（风险已登记、回退为 advanced 显式 pairing/token），作为接受处置成立。小瑕疵（不影响结论）：enroll 401 实际走 `resolve_token` 的 catch 而非 `handle_401`（后者仅已 enrolled 后 401 触发），处置描述用语不精确。
- **t169_code_f006（minor）— 已修**：`src/shared/agent_bridge_config.ts:25-28` 注释已同步 t169 语义（首次需凭据、自动读 pairing code、伪造 origin 401），T091 直通表述移除。

### 本轮新发现

- 无。范围内仅 config 接线与注释同步，未引入新分支或行为改动。

### 结论

- 前轮 finding 复核：f004 已修；f005 接受处置（不阻断）；f006 已修。累计 f001/f003 已消除（Round 2）、f002 主体已修（残留 f006 本轮已修）
- 本轮新发现：0 条
- 未进表的提示：
  - `persist_instances` 写盘前无 `mkdir`：`CAPTURE_ALL_INSTANCES_FILE` 指向不存在目录时 `writeFile` 静默失败（best-effort catch），实例照常工作但持久化不生效，配置错误难排查——建议文档注明需存在目录，或写盘前 `mkdir(dirname, { recursive: true })`；minor 观察，非阻断。
  - `CAPTURE_ALL_PAIRING_AUTO_OPEN` 仅 `'0'`/`'false'`（小写）关闭，`'FALSE'`/`'0 '` 等按默认 true 处理；白名单语义可接受，文档已按小写示例即可。
  - 文件过大：`src/bridge/server.ts` 1033 行（≥800），同 Round 2，仅结论段提示。
- 总体判断：所有 finding 已处置，无未解决 critical/important；测试（154 passed）与 `tsc --noEmit`（0 错误）全绿。PASS。
- 系统性 follow-up：无等价 task；维持 Round 2 建议 `mcp_pair_open_multi_instance`（不阻断）。

### AC 复验方式（Round 3）

- AC-001：`re_verified`——「t169 AC-001」测试 + `server.ts` 拒绝分支；154 tests 全绿。
- AC-002：`re_verified`——「t169 AC-002」「AC-006 (t169)」+ heartbeat 断言；154 tests 全绿。
- AC-003：`re_verified`（有残留约束）——auto_open（AC-003a）、实例持久化（AC-003b）、config 默认值接线（`agent_bridge_config.test.ts`）均验证；「错过初始窗口需人工续窗」为已登记风险（f005 接受处置）。
- AC-004：`re_verified`——`npx vitest run tests/unit/bridge_config_health.test.ts tests/unit/agent_bridge_config.test.ts tests/unit/t137_bridge_security.test.ts tests/unit/agent_bridge_server.test.ts tests/unit/agent_bridge_client.test.ts` → 154 passed；`npx tsc --noEmit` → 0。

coverage = 4 / 4

reviewed_scope: e778879488e49a2e

verdict: PASS
