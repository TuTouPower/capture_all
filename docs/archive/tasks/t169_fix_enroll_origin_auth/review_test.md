# Task review t169（reviewer_focus: 测试）

- task：`t169_fix_enroll_origin_auth`
- spec：`docs/tasks/t169_fix_enroll_origin_auth/spec.md`
- diff_anchor：`a631e0030d4ba8225a161f25ef1665b1af77a154`
- target：`git diff a631e0030d4ba8225a161f25ef1665b1af77a154`
- round：1
- reviewed_at：2026-08-13 18:06 UTC+8

## Findings

### t169_test_f001 - resolve_pairing_code 零测试触达，AC-003 client 侧自动取 code 链路无证据

- 严重度：important
- 锚点：AC-003
- 位置：`src/extension/background/agent_bridge_client.ts:270-280`（`resolve_pairing_code`）；`tests/unit/agent_bridge_client.test.ts:764-799`（T091 零配置 enroll 测试）
- 问题：diff 新增生产逻辑 `resolve_pairing_code`（无配置 token 时自动 fetch `/pair/status` 取一次性 code 附入 enroll），全仓库无任何测试触达：`tests/` 无 `resolve_pairing_code` 引用，client 测试的 fetch mock（`mock_enroll_response`，`agent_bridge_client.test.ts:623-644`）对 `/pair/status` 返回 `{}`（`data.open` 为 undefined），永远走「无 code」分支且零断言。`agent_bridge_client.test.ts:764` T091 测试仍 mock「无 token enroll → 200」，未断言 `/pair/status` 被调用、未断言 enroll body 含 `pairing_code`；真实 server 下该场景（无 token 无 code）返回 401，mock 掩盖了新认证链路。若 `resolve_pairing_code` 实现有误（URL 拼错、`data.code` 字段读错、无 token 分支未调用），真实扩展自动连接断裂而全部测试仍绿——AC-003「真实扩展自动连接仍可无人工手填 token 完成 enroll」的 client 半边无证据（服务端接受 code 的行为已有覆盖，如 `t137_bridge_security.test.ts:145` AC-006 (t169)、`agent_bridge_server.test.ts:1615` AC-2 correct code，但自动取 code 是本次新增的关键环节）。
- 建议：client 测试 mock fetch 使 `/pair/status` 返回 `{ ok: true, data: { open: true, code: '123456' } }`，断言 enroll 请求 body 含 `pairing_code: '123456'` 且无 Authorization header；补 `/pair/status` 关闭或非 200 时 body 不带 pairing_code 的分支；同步修正 `agent_bridge_client.test.ts:764` 测试的过时标题。

### t169_test_f002 - t137 AC-008 判别性漂移：label 顶替防护分支不再被该测试触达

- 严重度：minor
- 锚点：行为缺陷（t137 语义保留）
- 位置：`tests/unit/t137_bridge_security.test.ts:187`
- 问题：AC-008 中恶意 enroll（`instance_id: 'inst_evil'`、origin_b、label 'work'）未带 token，新实现下首次 enroll 无 secret → 401 拦截，label 顶替防护分支（`src/bridge/server.ts:302-305`）在该测试中不再执行；测试注释声称的「判别性验证」（inst_a 存活 ⇔ 防护生效）实际恒真（inst_evil 根本没创建），退化为 t169 AC-001 的重复场景，无法捕捉 label 防护回归。diff 仅给 real enroll 加 token（`:183`），evil enroll 的语义漂移无归因。AC-008b（`:194-211`，evil 带 token）仍触达该防护分支，整体覆盖未完全丢失。
- 建议：evil enroll 调用补 `token`（与 AC-008b 一致），恢复「伪造 origin 经 label 顶替被防护」的判别性。

### t169_test_f003 - T091 pairing window open 用例测试名与行为不符

- 严重度：minor
- 锚点：行为缺陷（命名误导）
- 位置：`tests/unit/agent_bridge_server.test.ts:1641`
- 问题：测试名「extension enroll without pairing_code succeeds even when pairing window open (loopback bypass)」与注释已过时——diff 将 body 改为携带 `pairing_code`（从 `/pair/open` 响应取得），「不传 pairing_code 即 loopback 直通」语义已不存在，测试实际验证「pairing window open 时无 token 凭 code 零配置 enroll」（AC-003 路径）。
- 建议：改名反映「凭 pairing code 零配置 enroll」，删除 loopback bypass 描述。

### t169_test_f004 - dev_mode 测试名与行为不符

- 严重度：minor
- 锚点：行为缺陷（命名误导）
- 位置：`tests/unit/agent_bridge_server.test.ts:1534`
- 问题：测试名「AC-1: S0 dev_mode allows extension enroll without pairing」与行为不符——diff 已加 MCP token（无 token 首次 enroll 在新实现下 401），且 dev_mode 对 enroll 无任何豁免（`src/` 中 `dev_mode` 仅存在于 `protocol.ts:65` 类型定义，`server.ts` enroll 路径未使用），「without pairing」与「dev_mode allows」两层语义均已消失。
- 建议：改名注明 dev_mode 不豁免首次 enroll 认证，测试验证的是「dev_mode + MCP token enroll 成功」。

### t169_test_f005 - AC-002 pairing code 路径的后续请求认证未验证

- 严重度：minor
- 锚点：AC-002
- 位置：`tests/unit/t137_bridge_security.test.ts:145-159`（AC-006 (t169)）
- 问题：AC-002 要求「携带有效一次性 pairing code 或 MCP Bearer token 的首次 enroll 成功，且后续请求认证不受影响」。token 路径（`t137_bridge_security.test.ts:169-176` t169 AC-002）验证了 enroll 后 heartbeat 200；pairing code 路径（AC-006 (t169)）只断言 enroll 200，未验证签发 instance token 的后续 heartbeat，AC-002 的 pairing 半边不完整。
- 建议：AC-006 (t169) 补 pairing enroll 后 heartbeat（用返回的 instance_token）断言。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：N/A（round 1）
- 改测方向复核：无「迁就实现」的改测。AC-3 wrong pairing / expires 的 403 PAIRING_REQUIRED → 401 TOKEN_INVALID 是契约变化（spec 契约区允许 401/403；pairing 由可选增强变为必需 secret，`PAIRING_REQUIRED` 分支被实现删除），且旧实现下这两个改测均红（见红绿验证），归因成立。旧测试批量加 MCP token 属认证前提随 spec 更新，断言目标（enroll 成功、label 自动编号、re-enroll 校验、顶替防护）均保留。
- 红绿验证：临时 worktree 以旧实现（a631e00）+ 新测试运行，3 红 / 96 绿——t169 AC-001（伪造 Origin 401）在旧实现下 200 红 ✓；AC-3 wrong pairing / expires 改测在旧实现下红 ✓；AC-003 pairing 成功路径（AC-006 (t169)）旧实现也 200 绿，其断言区分由 AC-001（无 code → 401）与 AC-006（有 code → 200）组合成立 ✓。
- 本轮新发现：5 条（1 important + 4 minor）
- 未进表的提示：① t169 AC-001 测试（`t137_bridge_security.test.ts:161-167`）断言 401 + `ok:false` 已证拒绝，「不签发 token」由 401 响应无 data 自然成立，可补 `error.code === 'TOKEN_INVALID'` 增强辨识度，非必需；② `agent_bridge_client.test.ts:764` T091 测试标题「enroll succeeds without agent_bridge_token」语义已过时（真实 server 下无 token 无 code 场景 401），断言对象（无 Authorization header、session 保存）仍成立，建议随 f001 一并更新。
- 总体判断：核心安全 AC（AC-001/AC-004）红灯成立且断言强度足够，AC-002/AC-003 服务端路径覆盖闭合；但 AC-003 的关键新增生产逻辑 `resolve_pairing_code`（真实扩展自动连接的依据）零测试触达，当前测试无法证明真实扩展仍可无人工手填 token 完成 enroll。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`——`t137_bridge_security.test.ts:161` 断言 401 + `ok:false` 通过；临时 worktree 旧实现下该测试红（200 → 期望 401），红灯归因成立。
- AC-002：`re_verified`——`t137_bridge_security.test.ts:169` enroll 200 + heartbeat 200 通过；pairing code 半边仅 enroll 成功、后续认证缺测（f005）。
- AC-003：`re_verified`——服务端接受有效 code 路径（AC-006 (t169)、`agent_bridge_server.test.ts:1615`、`:1666` correct code、`:1641` T091 open 用例）全部通过；client 侧 `resolve_pairing_code` 无测试触达（f001），「真实扩展自动连接」完整性未证。
- AC-004：`re_verified`——AC-001 测试即 AC-004 载体（spec 明示「新增...测试通过」），通过。

coverage = 4 / 4

reviewed_scope: f8d491668635b7fc

verdict: FAIL

## Round 2 (2026-08-13 18:20 UTC+8)

### 前轮 finding 复核（以 diff 为准）

- **t169_test_f001（important）— 已修复**。`agent_bridge_client.test.ts:627-633` mock `/pair/status` 返回 `{open:true, code:'123456'}`；T091 测试改名并新增断言：`/pair/status` 被调用（`pair_calls.length > 0`，`:786-789`）、enroll 请求无 Authorization header（`:796-798`）、enroll body 携带 `pairing_code === '123456'`（JSON.parse 强断言，`:800-801`）。`resolve_pairing_code` 生产逻辑真实触达：fetch `/pair/status` → `data.open` → 返回 code → body 附 code。mock 分支只影响无 token 的 T091 用例（其余用例 config 带 token，不调 resolve_pairing_code），无副作用。修复到位。
- **t169_test_f002（minor）— 已修复**。AC-008 evil enroll 已补 token（`t137_bridge_security.test.ts:199` `{ instance_id: 'inst_evil', origin: origin_b, label: 'work', token }`）→ enroll 成功走 label 顶替防护分支，判别性恢复。
- **t169_test_f003（minor）— 仍存在**。`agent_bridge_server.test.ts:1642` 测试名仍是「T091: extension enroll without pairing_code succeeds even when pairing window open (loopback bypass)」，body 已携带 pairing_code（implementer 声称改名，diff 未改——以 diff 为准）。minor 不阻断，处置表标遗留。
- **t169_test_f004（minor）— 仍存在（implementer 选择保留）**。`agent_bridge_server.test.ts:1535` 测试名「AC-1: S0 dev_mode allows extension enroll without pairing」保留，实际带 MCP token 且 dev_mode 对 enroll 无豁免。minor 不阻断。
- **t169_test_f005（minor）— 部分修复**。新增 AC-003a 覆盖 pairing 路径 enroll 成功 + code 一次性消费（enroll 后 `/pair/status` open=false）；AC-003b 覆盖 token 路径 heartbeat 后续认证 + 实例持久化恢复。但「pairing code 路径 enroll 后 instance_token 的 heartbeat 后续认证」仍未直接断言（AC-003a 断言的是 pairing closed，AC-003b 的 heartbeat 是 token 路径）。minor 不阻断，可在 AC-003a 补一行 heartbeat 断言。

### 本轮新发现

#### t169_test_f006 - AC-003b 持久化写盘竞态（潜在 flaky）

- 严重度：minor
- 锚点：行为缺陷（异步时序）
- 位置：`tests/unit/t137_bridge_security.test.ts:252-270`（AC-003b）；`src/bridge/server.ts:66-69`（`persist_instances`）
- 问题：`persist_instances` 为 fire-and-forget 异步写盘（`void writeFile(...).catch(...)`），enroll 响应在写盘完成前即可返回；AC-003b 在 `await server1.close()` 后立即启动 server2 读同一 `instances_file`，未等待写盘落盘。若 writeFile 慢于 readFile（慢磁盘 / CI 负载），server2 读到空文件 → 实例丢失 → heartbeat 401 测试红。本地循环 20 次实测全过（tmpdir 写盘快），但时序窗口逻辑上存在。
- 建议：AC-003b 在 server2 启动前轮询等待 `instances_file` 存在且内容含 `instance_id`（或改为持久化完成后才返回的同步保证）。

### 其他验证

- 全量三个文件 125 测试通过（`npx vitest run`）。
- 新测试红灯归因（逻辑验证）：AC-003a/b 依赖新配置 `pairing_auto_open` / `instances_file`（旧实现无此字段、忽略后分别导致 status 非 open、实例不持久化 → 断言红）；client T091 新断言依赖 `resolve_pairing_code`（旧 client 无此逻辑 → `/pair/status` 零调用 → 断言红）。均为新行为驱动的红灯，归因成立。
- 危险模式扫描：无恒真断言 / 删反转 expect / 注释断言 / 弱化 / skip/only / ts-ignore。client T091 删除小写 `headers?.authorization` 防御断言，核心 `headers?.Authorization` undefined 断言保留，不构成弱化。
- `pairing_auto_open` 语义确认：生产默认 true（`server.ts:87` `!== false`），测试侧显式 false 隔离（t137 `:25`、agent_bridge_server `:22`），AC-003a 显式 true 覆盖生产默认路径；AC-001 在 open 状态下不传 code 仍 401（`is_enroll_allowed` 需 code 匹配），安全断言不因 auto_open 失效。

### 结论

- 前轮 finding 复核：f001 已修复（resolve_pairing_code 真实触达 + body 断言）；f002 已修复；f003 仍存在（diff 未改名）；f004 仍存在（选择保留）；f005 部分修复（pairing 路径 heartbeat 未补）。
- 改测方向复核：无「迁就实现」的改测。
- 本轮新发现：1 条（f006，minor）。
- 未进表的提示：AC-003a 可补 pairing enroll 后 heartbeat 断言（即 f005 遗留）；AC-003b 的 `t169-instances-${Date.now()}.json` 临时文件不清理，属 tmpdir 常规行为，无碍。
- 总体判断：Round 1 blocking（f001 important）已修复，无未解决 critical / important；遗留问题均为 minor（f003/f004/f005 处置、f006 潜在 flaky）。
- 系统性 follow-up：无

### AC 复验方式（Round 2 增量）

- AC-001：`re_verified`（不变，通过）。
- AC-002：`re_verified`——token 路径后续认证经 AC-003b heartbeat 200 复验；pairing 路径后续认证仍缺直接断言（f005）。
- AC-003：`re_verified`——client 侧 `resolve_pairing_code` 已由 T091 新断言直接触达（/pair/status 调用 + body 带 code）；auto_open 路径由 AC-003a 覆盖（status open + code + enroll 200 + code 消费）；持久化恢复由 AC-003b 覆盖（重启后 heartbeat 200 + 无 token 重 enroll 200）。
- AC-004：`re_verified`（不变，通过）。

coverage = 4 / 4

reviewed_scope: f8d491668635b7fc

verdict: PASS

## Round 3 (2026-08-13 18:23 UTC+8)

### 前轮 finding 复核（以 diff 为准）

- **t169_test_f003（minor）— 已修复**。`agent_bridge_server.test.ts:1642` 测试名改为「T091 (t169): extension enroll with pairing code from open window succeeds」，body 携带 pairing_code 与测试名一致，「without pairing_code ... loopback bypass」描述已消失。
- **t169_test_f006（minor）— 已修复**。AC-003b（`t137_bridge_security.test.ts:262-264`）在 `await server1.close()` 后新增 `await new Promise((r) => setTimeout(r, 50))` 等待 fire-and-forget 写盘落盘再启动 server2，注释说明理由。50ms 固定延迟用于消除 writeFile 与 readFile 的竞态窗口，非阈值掩盖（测试验证的持久化功能本身未受影响）。重复 5 次实测全过。
- **t169_test_f004（minor）— 仍存在（implementer 选择保留，处置表遗留）**。`agent_bridge_server.test.ts:1535` dev_mode 测试名未改。
- **t169_test_f005（minor）— 仍存在（部分修复，处置表遗留）**。AC-003a/b 已覆盖 pairing 路径 enroll 成功 + code 消费 + token 路径 heartbeat；pairing 路径 enroll 后 instance_token 的 heartbeat 仍无直接断言。

### 本轮新发现

无（0 条）。Round 3 diff 仅含上述两处测试改动，无新增 skip/only、恒真断言、弱化断言或删断言。

### 其他验证

- 全量三个文件 125 测试通过（`npx vitest run tests/unit/agent_bridge_server.test.ts tests/unit/t137_bridge_security.test.ts tests/unit/agent_bridge_client.test.ts`）。
- AC-003b 循环 5 次全过，50ms 等待未引入不稳定。

### 结论

- 前轮 finding 复核：f003 已修复；f006 已修复；f004 / f005 仍为 minor（选择保留 / 部分修复），不阻断。
- 改测方向复核：无「迁就实现」的改测。
- 本轮新发现：0 条。
- 未进表的提示：AC-003b 的 50ms 固定延迟若在极端慢环境仍复现 flaky，可改为轮询 `instances_file` 内容；当前本地/CI 无复现，不阻断。
- 总体判断：两轮 blocking（f001 important、f006 潜在 flaky minor）均已修复，无未解决 critical / important；遗留 f004 / f005 为 minor，由 implementer 处置表闭环。
- 系统性 follow-up：无

### AC 复验方式（Round 3 增量）

- AC-001 / AC-002 / AC-003 / AC-004：`re_verified`——全部经本文件与 `agent_bridge_server.test.ts` / `agent_bridge_client.test.ts` 测试断言复验通过（AC-002/AC-003 缺口同 Round 2 标注：pairing 路径 heartbeat 无直接断言）。

coverage = 4 / 4

reviewed_scope: e778879488e49a2e

verdict: PASS
