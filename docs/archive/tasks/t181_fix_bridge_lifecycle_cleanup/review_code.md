# Task review t181（reviewer_focus: 代码）

- task：`t181_fix_bridge_lifecycle_cleanup`
- spec：`docs/tasks/t181_fix_bridge_lifecycle_cleanup/spec.md`
- diff_anchor：`089aac35499ed013030efd52a35bb38e530c9952`
- target：`git diff 089aac35499ed013030efd52a35bb38e530c9952`
- round：1
- reviewed_at：2026-08-13 22:05 UTC+8

## Findings

### t181_code_f001 - AC-003 测试为白盒源码字符串匹配，实现细节变更即误报

- 严重度：minor
- 锚点：行为缺陷——测试读取 `src/bridge/server.ts` 源码文本断言，任何格式化/重构（拆分 close 块、改函数名、注释措辞）都会让测试红，与实现正确性无关
- 位置：`tests/unit/bridge_lifecycle_cleanup.test.ts:164-177`（`close 实现含优雅 server.close 与超时兜底 closeAllConnections` it 块）
- 问题：`readFileSync(...)` 后 `src.split('close: async () => {')[1]?.split('_server: server')[0]` 取文本片段，再正则匹配 `server.close(` / `closeAllConnections` / `setTimeout`。这是实现文本断言而非行为断言；AC-003 的可观测行为「close 不预调 closeAllConnections 也能快速完成」已由 AC-001 测试的 `expect(elapsed).toBeLessThan(2000)`（`bridge_lifecycle_cleanup.test.ts:59-61`，pending 连接存活时 close 仍快速返回）真实覆盖，该白盒测试是脆弱冗余。
- 建议：删除该 it 块，保留 AC-001 的行为断言作为 AC-003 证据；若担心 closeAllConnections 兜底被移除，可改为对 `_server.closeIdleConnections`/`closeAllConnections` 的存在性做一次轻量行为探测（如调用后断言不抛）而非源码字符串匹配。

### t181_code_f002 - AC-004 测试「重新 enroll 不受旧实例阻碍」断言空转，验证不了 registry 删除

- 严重度：minor
- 锚点：行为缺陷——注释声称验证「同 instance_id 重新 enroll 成功」，实际请求体未携带 instance_id，服务端生成新随机 id，无论 sweep 是否发生都返回 200，断言不具判别力
- 位置：`tests/unit/bridge_lifecycle_cleanup.test.ts:174-183`
- 问题：第二次 enroll 的 fetch body 为 `{ extension_version, browser_label }`，无 `instance_id` 字段 → `server.ts:334` `instances.set(instance_id, ...)` 走 `inst_${randomBytes}` 新 id 分支，等价于全新实例 enroll，恒 200。真实可判别场景：body 携带原 instance_id——未 sweep 时命中 `server.ts:340-355` existing 分支，无 chrome-extension origin 返回 403「Re-enroll requires matching chrome-extension origin」；sweep 后 existing 不存在走首次登记返回 200。AC-004 核心（queue cancel → COMMAND_CANCELLED、registry 删除）目前由 `expect(...COMMAND_CANCELLED)`（`bridge_lifecycle_cleanup.test.ts:170-171`）传递证明——sweep 内 `instances.delete(id)` 在 `queue.cancel_all()` 之前（`server.ts:65-70`），命令被取消 ⇒ 实例确已入 sweep 删除路径——故该子断言无效不影响 AC 覆盖，但注释与断言不符，属弱化断言。
- 建议：第二次 enroll 的 body 显式携带第一次返回的 `instance_id`，断言 200（并可在注释中说明未 sweep 时该场景应 403）；或删除该子断言并在注释中说明 registry 删除由 COMMAND_CANCELLED 传递证明。

## 结论

- 前轮 finding 复核：首轮，无。
- 本轮新发现：2 条（均为 minor）。
- 未进表的提示：
  - 文件过大：`src/bridge/server.ts` 1155 行（本 task 净增 +67）≥ 实现源码 important 阈值 800；`src/bridge/cdp_handler.ts` 653 行（净增 +7）≥ minor 阈值 400。降级规则：不进 finding 表，此处仅记录。两者均为既有规模延续，本 task 增量有限，未观察到因过大引发的可观测缺陷（sweep/close 逻辑与既有代码风格一致）。测试文件 197 行，低于阈值。
  - 复杂度：无新增 ≥10 函数。`sweep_expired_instances`（`server.ts:62-78`）CC≈6，`close`（`server.ts:695-721`）CC≈5，均在阈值内。
  - 范围外观察：
    - a) close 二次调用依赖 Node 行为：测试内 `await server.close()` 后 `afterEach` 的 `cleanup()`（`bridge_lifecycle_cleanup.test.ts:118-123`）会对同一 server 二次 close。Node `server.close(cb)` 对未运行 server 以 `ERR_SERVER_NOT_RUNNING` 调 cb，`finish()`（`server.ts:710-715`）忽略错误参数故正常解析，且 2s 超时兜底保证不会挂死——实现侧健壮，但属隐式依赖；建议测试在已 close 后置 `cleanup = null`（`agent_bridge_server.test.ts:776` 同模式）。
    - b) sweep 删除内存实例后 `persist_instances()`（`server.ts:93-104`）不落盘：t169 的 instances 磁盘文件残留陈旧条目，重启后按陈旧 `seen_at` 在首次 registry 遍历时被懒清理，无实际影响（`resolve_extension_auth` 对该条目的 token 匹配至多放行一次 503，不会越权）。
    - c) AC-001 测试 `await new Promise((r) => setTimeout(r, 50))`（`bridge_lifecycle_cleanup.test.ts:55`）以固定 50ms 等命令送达为启发式：慢 CI 下命令未入队即 close 会因连接拒绝误报。本次实测 3 次运行均稳定通过，属测试脆弱性而非实现缺陷。
- 总体判断：AC-001~005 全部有实现与可运行测试覆盖（全量单测 1779 通过），改动严格贴合 spec 范围（src 仅 `cdp_handler.ts` +7 / `server.ts` +77 + 新测试文件），无越界行为；仅 2 条 minor 测试质量建议，无未解决 critical/important。
- 系统性 follow-up：无。

### AC 复验方式

- **AC-001**（close 后 pending command 收 COMMAND_CANCELLED，不阻塞至 timeout）：`re_verified`。① 实测 `npx vitest run tests/unit/bridge_lifecycle_cleanup.test.ts`：AC-001 两条用例过（elapsed < 2000、error.code === 'COMMAND_CANCELLED'）；② 读实现 `server.ts:695-701`：`cancel_all()`（`command_queue.ts:73-87`）同步 clearTimeout + resolve COMMAND_CANCELLED，先于 `queues.clear()`，在途 `/mcp/command` handler 微任务续跑写响应，不依赖 30s timeout。
- **AC-002**（close 后 CDP WS 与 idle timer 关闭/清理）：`re_verified`。① 测试 `bridge_lifecycle_cleanup.test.ts:140-148` spy 断言 `destroy_all_sessions` 被 close 调用（vi.mock 转发真实实现，非桩掉被测逻辑）；② 读实现 `cdp_handler.ts:149-164`：`destroy_session` 对每个 session 关 WS（try/catch）、clearTimeout idle_timer、删 map，`destroy_all_sessions` 遍历副本 `[...sessions.keys()]` 全量销毁。诚实披露：该测试断言的是「close 调用了销毁函数」这一接线，WS/timer 逐项清理行为由 `destroy_session` 代码本体承担，WS 终态化/定时器另有 `cdp_ws_close_terminal.test.ts`、`cdp_session_idle_bounds.test.ts` 覆盖（本轮随 111 tests 实测通过）。
- **AC-003**（close 不预调 closeAllConnections 也能快速完成）：`re_verified`。① 行为侧：AC-001 的 `expect(elapsed).toBeLessThan(2000)`（pending 连接存活时 close 秒级返回）实测通过；② 读实现 `server.ts:707-721`：先 `server.close(cb)` 等正常结束，2s 后超时兜底 `closeAllConnections?.()`，`settled` 防双解析，任何路径都保证有界完成；未在任何入口预调 closeAllConnections。
- **AC-004**（offline 实例超 TTL+grace 被 sweep）：`re_verified`。① 实测 sweep 用例过，stderr 可见 `extension_swept` 结构化日志（instance_id + reason: ttl_expired），pending 命令收 COMMAND_CANCELLED；② 读实现 `server.ts:62-78`：超过 `_extension_ttl_ms + _extension_sweep_grace_ms` 才删，先 `instances.delete` → `queue.cancel_all()` → `queues.delete` → 遍历 `command_owners` 清归属条目；懒清理入口覆盖 list_online（`server.ts:147`）/ build_status（204）/ enroll（325）/ heartbeat（470），符合 spec「懒清理或 interval」。测试钩子默认值不变（5000 / 30000）。
- **AC-005**（新增测试仅调用 public close，断言命令取消、WS 关闭、timer 清理、registry sweep）：`re_verified`。测试文件 197 行 5 条用例实测全过；close 相关用例只经 public `close()` 触发，未预调 `closeAllConnections`；sweep 用例经 registry 遍历入口（/mcp/status）触发，未调 close——与测试策略「只调 public close，不预调 closeAllConnections」一致。全量回归 `npx vitest run tests/unit`：186 文件 / 1779 tests 全过；`npx tsc --noEmit` exit 0。

coverage = 5 / 5

verdict: PASS
reviewed_scope: 524d5d4a565fd833

## Round 2 复核 (2026-08-13 22:05 UTC+8)

- reviewed_scope: c7495dc3acbde6e8

### 前轮 finding 复核

- **t181_code_f001（minor）——已消除**。`tests/unit/bridge_lifecycle_cleanup.test.ts` 中读源码做字符串匹配的 AC-003 用例已整体删除（原 `readFileSync` + split + 正则断言 `server.close`/`closeAllConnections`/`setTimeout`），`node:fs`/`node:path` import 与 `root` 常量一并移除，无死代码残留；文件头新增注释（`bridge_lifecycle_cleanup.test.ts:145-147`）说明 AC-003 可观测行为由 AC-001 的 `elapsed < 2000` 计时断言覆盖。实现 `server.ts:707-721` 未变，有界 graceful（先 `server.close` 等正常结束、2s 超时兜底 `closeAllConnections?.()`）依旧成立。
- **t181_code_f002（minor）——已消除**。第二次 enroll 的 body 现携带原 `instance_id`（`bridge_lifecycle_cleanup.test.ts:180`，来自 `enroll()` 返回的 `{ instance_id }`，`157`），判别力核实：未 sweep 时 `instances.get(instance_id)` 命中 existing 分支（`server.ts:340-355`），请求无 chrome-extension origin → `ext_id === null` → 403「Re-enroll requires matching chrome-extension origin」；sweep 后 existing 不存在 → 走首次登记分支，请求带 Bearer mcp token（`has_mcp` true）→ 200。注释（`175-176`）如实描述该判别逻辑。

### 复验命令

- `npx tsc --noEmit`：exit 0。
- `npx vitest run tests/unit/bridge_lifecycle_cleanup.test.ts`：4 tests 全过（stderr 可见 `extension_swept` 日志，AC-004 实测触发 sweep）；3 连跑稳定通过（4 passed × 3）。
- src 实现部分（`cdp_handler.ts` +7 / `server.ts` +77）与首轮审查逐字节一致，无处置期新增实现改动。
- 处置期测试参数调整记录：sweep 用例 TTL 注入 10→100ms、等待 40→300ms（`152-167`），扩大命令送达窗口，降低 round 1 结论段所记的送达竞态风险；断言链（COMMAND_CANCELLED + 判别性重 enroll 200）不变。

### 本轮新发现

0 条。处置未引入新问题（死 import 已清、注释与行为一致、判定路径经代码读证成立）。

verdict: PASS
reviewed_scope: c7495dc3acbde6e8
