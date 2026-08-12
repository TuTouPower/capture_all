# Task review t153（reviewer_focus: 通用）

- task：`t153_perf_spot_fixes`
- spec：`docs/tasks/t153_perf_spot_fixes/spec.md`
- diff_anchor：`325e93bdc6fbed3d310752246d7aa082e2da3ccd`
- target：`git diff 325e93bdc6fbed3d310752246d7aa082e2da3ccd`
- round：1
- reviewed_at：2026-08-13 02:47 UTC+8

## Findings

### t153_gen_f001 - app_log trim 增量估算后有效存储上限变为 ~2x log_max_size_mb（有界、自愈）

- 严重度：minor
- 锚点：AC-003（行为等价）；非 blocking——AC-003 明确允许「增量计数」，此差异是增量计数的固有代价
- 位置：`src/extension/background/app_log_storage.ts:224-229`（trim_if_needed 早退 + 扫描后 `_estimated_bytes = 0`）
- 问题：trim 触发改为「估算越限才全扫」。每次扫描+trim 后估算清零，此后需再累计 ~max_bytes 的新写入才会再次触发。因此实际落库量可增长到 `上次 trim 剩余（≤ max）+ 新写入（≈ max）≈ 2×max_bytes` 才被回收，相对修前「每次 flush 全扫、严格压到限额内」是行为差异。有界且自愈（越限即扫并删到限额内），非无限增长。用户可见影响：`log_max_size_mb` 从硬上限变为约 2x 的软上限（默认 100MB → 峰值约 200MB）。
- 建议：若需严格上限，可接受当前增量近似；或文档注明有效上限为 2x，或在 scan 后未删够时保留残余计数。处置优先级低。

### t153_gen_f002 - list_captures limit 未做输入校验（负数/0/小数静默返回空或意外截断）

- 严重度：minor
- 锚点：AC-007；非 blocking——当前无调用方传非法值（popup 恒定 `limit: 10`，MCP 走独立 dispatcher 不经此路径）
- 位置：`src/extension/background/service_worker.ts:259`（`typeof payload?.limit === 'number'` 直接透传）、`src/extension/background/storage.ts:174`（`captures.length < (limit ?? Infinity)`）
- 问题：limit 为负数时 `0 < -1` 恒假，立即 resolve 空数组；limit 为 0 时同样返回空；非整数传入则产生非预期截断。均为静默、无告警。现网无触发者，属防御性缺口。
- 建议：SW 层 clamp/校验（如 `limit >= 1 ? Math.floor(limit) : undefined`），或 message_contract 标注正整数约束。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：Round 1，无前轮。
- 本轮新发现：2 条，均为 minor，无 critical / important。
- 未进表的提示：
  - AC-006「与 dashboard/共享模块收敛」：popup 采用与 `dashboard.ts:121-150` 同款内联 `poll_in_flight` 单飞模式；未复用 `shared/poll_capture_status.ts` 的 `start_status_poll`。判定满足——popup 轮询是采集中持续 live-count 轮询（get_status 每 1s 刷新卡片），与 start_status_poll 的「采集启动检测、启动即停」语义不同，dashboard 自身也未用该模块；spec 括号「可复用」为可选项。不构成 finding。
  - network_hook 非流式回退路径（无 body / 无 getReader）仍 `clone().text()` 整读后截断：属 AC-005 允许的回退分支（现代 Chrome 恒有流式 body，走短路路径），不构成 finding。
  - `list_captures` 实现按 `started_at` 索引 `prev` 倒序（最新优先），而 storage.ts:162 上方注释与新测试描述「最旧优先倒序」措辞不符；实际行为正确（popup `recent_list` 取前 3 = 最新 3，与注释意图一致），仅注释措辞问题，不构成 finding。
- 总体判断：8 项优化实现正确、测试可信、AC 全部覆盖；仅 2 条 minor，可 PASS。
- 系统性 follow-up：无

### AC 复验方式

- AC-001（归档异步）：re_verified。`assemble_zip` 返回 Promise 包裹 fflate `zip` 异步回调；`build_archive` 已 async 且 `return assemble_zip(...)` 被 await；popup/dashboard 调用处均 `await build_archive`。全量 build_archive 行为用例（含 unzip 校验）通过；新增锚点测试断言源码不再含 `zipSync`。
- AC-002（formatter 缓存）：re_verified。`get_browser_formatter` 模块级 `_cached_browser_formatter`，选项与修前一致（sv-SE、固定 6 字段、hour12:false）；测试 spy `Intl.DateTimeFormat` 构造计数为 1。
- AC-003（增量 trim）：re_verified。估算仅在 flush 成功后累计、clear/扫描后清零、失败写入不累计（flush 内 try/catch 后置）；fake-indexeddb 真实 transport 测试覆盖「未越限不扫表」「越限扫表+trim」「trim 删最旧留最新」「clear 重置」。
- AC-004（idx 映射）：re_verified。`idx_map = new Map<CaptureEvent, number>()` 对象恒等键与 `indexOf` 的 `===` 严格等价；`filtered_events`/`filter` 返回同引用。行为测试断言过滤后 `data-ev` 仍为全量下标、trace 各 lane `data-event-idx` 正确。
- AC-005（hook 上限）：re_verified。注入脚本流式读、超 cap 即 cancel reader 并截断为 cap 前缀 + `...[TRUNCATED]`（与原整读截断语义一致）；测试验证短路（cancel 调用、read 次数 < 全量）、cap 内完整、非流式回退。
- AC-006（popup 单飞）：re_verified。`poll_in_flight` + finally 复位；fake timers 行为测试验证 in-flight 跳过、释放后恢复（1→1→2 序列，缺失单飞会 FAIL）。
- AC-007（limit）：re_verified。SW 透传、storage `started_at` 索引 prev 截断前 N；测试验证 `list_captures(2)` 截断、默认全量、limit 超存量返全量。
- AC-008（既有测试全通过）：re_verified。`npx vitest run` 152 files / 1539 tests 全绿；`npx tsc --noEmit` exit 0。

coverage = 8/8

reviewed_scope: 9d63e40703e8fa7f

verdict: PASS
