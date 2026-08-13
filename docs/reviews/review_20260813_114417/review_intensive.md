# Intensive Review — capture_all @ 03254fb2a9cc5e96fd2998355facde4fbebcfe06

- Generated: 2026-08-13T04:33:23Z
- Scope: full repository static review across `src/`, `tests/`, `scripts/`, `docs/`, `.agents/skills/`, `.github/workflows/ci.yml`, root config files
- Method: 9 parallel bundle reviews (security, contracts, tests/docs, dead docs, architecture, bridge/MCP, extension UI, performance, repo tooling) + aggregation
- Validation: user elected to skip project validation commands (`tsc`, `npm test`, `build`, etc.); no runtime/CI commands executed

## Summary

- Findings: **99** (Critical=0, High=16, Medium=48, Low=31, Info=4)
- Verdict: **REQUEST CHANGES** — no Critical issues, but multiple High-confidence findings affect data integrity, CI trust, or concurrency correctness.

## Cross-bundle clusters (same root cause reported by multiple perspectives)

- CL-01: 100k record truncation in UI/Popup/Dashboard ZIP/archive — ARCH-001, EXTUI-001, PERF-H004
- CL-02: CDP body_bytes not decremented on poll eviction — BM-H001, PERF-M007
- CL-03: MCP/Bridge timeout_ms contract drift — BC-002, BM-M002
- CL-04: CDP session body budget / eviction semantics — BM-H002, BM-L004
- CL-05: Legacy/fresh IndexedDB store count mismatch (10 vs 14) — ARCH-008, BC-007
- CL-06: Dashboard detail polling rereads full snapshot — EXTUI-002, PERF-H003
- CL-07: Agent query full materialization before filtering — BM-H002, PERF-H002

## Critical / High

### [High][100%] TD-001 — CI and `test:e2e:all` omit seven high-value E2E files

- **Source bundle:** `bundle_tests_docs.md`
- **Location:** `playwright.config.ts:41-48`, `playwright.config.ts:85-139`, `.github/workflows/ci.yml:31-42`, `package.json:34-35`, `tests/e2e/e2e.spec.ts:1-4`, `tests/e2e/e2e.spec.ts:21-29`, `docs/guides/test.md:156-168`, `docs/guides/test.md:201-215`

**Evidence / call chain:** 1. `package.json:34` defines `test:e2e` as `playwright test --project=e2e`. 2. CI invokes exactly that script at `.github/workflows/ci.yml:42`. 3. The `e2e` project matches only `e2e.spec.ts` (`playwright.config.ts:41-43`). That file explicitly says no extension is loaded and only renders static HTML (`tests/e2e/e2e.spec.ts:1-4`); its sole test checks the popup start button (`tests/e2e/e2e.spec.ts:21-29`). 4. The remaining projects use explicit `testMatch` patterns (`playwright.config.ts:46-139`). None matches these existing files: - `tests/e2e/e2e-capture-local.spec.ts` - `tests/e2e/e2e-capture-baidu.spec.ts` - `tests/e2e/e2e-toggle-effects.spec.ts` - `tests/e2e/e2e-cdp-retry.spec.ts` - `tests/e2e/e2e-settings-effects.spec.ts` - `tests/e2e/e2e-cycle-integrity.spec.ts` - `tests/e2e/e2e-export-content.spec.ts` 5. `test:e2e:all` runs all configured projects, not unmatched files. Therefore those seven files remain omitted even from the command documented as “all Playwright projects.” 6. `docs/guides/test.md:156-168` labels several omitted files as core scenarios, while `docs/guides/test.md:201-215` says all P0 flows and all E2E are mandatory before release. Current automation does not enforce either statement. 7. Every extension-bearing project is configured `headless: false` (`playwright.config.ts:46-139`), but CI never invokes those projects. The Linux CI job therefore proves only the static headless smoke path.

**Impact:** CI can remain green while capture option gates, settings effects, restricted-URL CDP recovery, repeated capture isolation, or exported HAR body content are broken. The label `test:e2e:all` creates an additional false assurance because files outside every project are silently absent. This is release-gate coverage loss, not merely stale documentation.

**Recommendation:** - Add every intended E2E file to an explicit project, preferably by grouping deterministic extension tests under maintained glob patterns rather than enumerating an incomplete filename list. - Add a discovery guard that enumerates `tests/e2e/**/*.spec.ts` and fails if any file is selected by zero projects (and optionally if selected unexpectedly by multiple projects). - Change CI to run the actual release-gate project set. Provide a CI-compatible Chromium extension mode (for example, a virtual display for headed persistent contexts) rather than silently substituting static HTML. - Make `test:e2e:all` semantically complete, or rename it if intentionally limited.

**History / pre-existing:** Pre-existing. The baseline `e2e` match dates to `98d3cf6` / `a8f6199` (2026-06-03); CI has invoked only `npm run test:e2e` since `a03ac6f` (2026-07-14). Current explicit extension match patterns predate the reviewed baseline. `docs/archive/tasks/t106_popup_category_capture_gates/review_test.md:119-134` already identified `e2e-toggle-effects.spec.ts` as unwired on 2026-08-11, but the configuration remains unchanged.

### [High][99] EXTUI-001 — ZIP exports silently truncate every source at 100,000 records `[CL-01]`

- **Source bundle:** `bundle_extension_ui.md`
- **Location:** - `src/extension/shared/capture_data_reader.ts:24-35` - `src/extension/popup/popup.ts:263-302` - `src/extension/dashboard/dashboard_shared.ts:310-344` - `src/extension/background/storage.ts:508-531` - `docs/blueprint/decisions.md:95-100`

**Evidence / call chain:** `read_capture_snapshot()` issues one query per category with `offset=0, limit=100000`; each storage query stops once `out.length >= limit`. Popup ZIP and Dashboard archive both pass those arrays directly to `build_archive()` and then download the result. There is no next-page loop, total-count comparison, `truncated` flag, warning, or export failure. A capture with 100,001 network requests therefore produces a ZIP containing exactly the first 100,000. `manifest.json` and README counts are generated from the already-truncated arrays, so the archive appears internally consistent and complete. This is reachable under the configured 500 MB session ceiling (`src/shared/constants.ts:20`); record count and byte ceiling are independent, and compact events can exceed 100,000 well below 500 MB. The project already established the opposite architecture rule in ADR-012: fixed 100,000 truncation must be replaced by 5,000-record pagination until exhaustion. T043 implemented that rule only in `exporter.ts` and `agent_data_queries.ts`; its explicit scope omitted `capture_data_reader.ts`. Tests reinforce rather than challenge the cap: `tests/unit/live_data_queries.test.ts:435-443` asserts `limit=100000`; `popup_export.test.ts`, `export_busy_guard.test.ts`, and `archive_builder.test.ts` do not create a source above the boundary or compare archive counts with persisted stats.

**Impact:** A user-requested “ZIP 完整包” can lose arbitrary tail data without any indication. This is irreversible at export-consumption time and undermines the primary debugging artifact.

**Recommendation:** Add shared paginated readers using the ADR-012 `PAGE_SIZE=5000` contract, or stream cursor batches directly into archive generation. Before download, compare persisted category stats/DB counts with exported counts. If an intentional cap remains, abort with a localized error or include explicit `truncated` metadata and per-source totals.

**History / pre-existing:** Pre-existing since `08b9d130` (`2026-06-13`). Previously recorded as a pre-stored architecture item, but still active. T043/ADR-012 fixed sibling paths, leaving this UI reader inconsistent with the accepted decision. ---

### [High][98%] ARCH-001 — 页面侧快照固定 100000 条，详情与 ZIP 导出静默截断 `[CL-01]`

- **Source bundle:** `bundle_architecture.md`
- **Location:** - `src/extension/shared/capture_data_reader.ts:24-35` - `src/extension/background/storage.ts:473-502,508-531` - `src/extension/dashboard/dashboard_shared.ts:288-303,310-359` - `src/extension/popup/popup.ts:263-288` - 对照实现：`src/extension/background/exporter.ts:14,29-67,76-97`、`src/extension/background/agent_data_queries.ts:53-99` - 契约：`docs/blueprint/decisions.md:95-100`、`docs/archive/specs/export.md:7-10,31-36`

**Evidence / call chain:** 1. `read_capture_snapshot()` 对 7 类数据各调用一次，参数固定为 `offset=0, limit=100000`，没有续页、总数检查、`truncated` 标记或错误（`capture_data_reader.ts:25-34`）。 2. 底层 `query_by_store()` 在 `out.length >= limit` 时立即结束 cursor（`storage.ts:487-500`），因此同一类别第 `100001` 条起确定不会返回。 3. Dashboard 详情 `load_detail()` 直接使用该快照（`dashboard_shared.ts:288-300`）；Dashboard archive 导出与 Popup archive 导出也直接把该快照交给 `build_archive()`（`dashboard_shared.ts:316-336`、`popup.ts:263-288`）。调用链上没有第二次补页。 4. 相同问题已在 background exporter 与 Agent 查询中修复：两者使用 `PAGE_SIZE=5000` 循环到耗尽（`exporter.ts:29-67`、`agent_data_queries.ts:53-68`）。ADR 012 明确否决固定上限并选择分页读取至耗尽（`decisions.md:95-100`）；export spec 将 JSON 定义为“完整快照 + 所有事件”（`export.md:7-10`）。 5. 现有 `tests/unit/live_data_queries.test.ts:145-158,435-444` 复制旧读取逻辑并反向锁定 `limit=100000`，不是 `read_capture_snapshot()` 的行为测试。archive 相关测试 mock `read_capture_snapshot`；仓库没有 `capture_data_reader` 专属跨页/第 `100001` 条测试。 6. **High 证伪检查：**未找到“每类最多 100000 条”产品上限；存储契约只有单采集 500MB 上限（`docs/archive/specs/storage.md:5-10`），足以容纳超过 100000 条小事件。相反，ADR 012 与 T043 明确把该模式定性为“静默截断”。因此不是设计上限，而是修复漏网路径。

**Impact:** - 大采集在 UI 详情与两个主要 ZIP 入口中看似成功，实际每类最多保留前 100000 条，归档 manifest 也只会基于截断数组生成，无法让调用方发现丢失。 - 同一 capture 经 background JSON/HAR 或 MCP 查询可得到更多数据，而经 Dashboard/Popup ZIP 得到更少数据，形成入口相关的数据完整性差异。 - `read_capture_snapshot` 还是详情页数据源，用户会将截断误判为采集层缺失。

**Recommendation:** - 抽取 extension 内统一 `fetch_all(fetcher, page_size=5000)`，供 `exporter.ts`、`agent_data_queries.ts`、`capture_data_reader.ts` 共用；每个类别循环到 `batch.length < PAGE_SIZE`。 - 给 `read_capture_snapshot` 增加真实 cursor/mock 分页测试：第一页恰好 5000 条、第二页至少 1 条，断言第 5001/100001 条存在且 offset 递增。 - 若内存预算必须限制全量快照，需返回显式 `truncated`/`PAYLOAD_TOO_LARGE`，不能静默裁切；长期可让详情分页、归档流式输出。

**History / pre-existing:** `08b9d13`（2026-06-13）引入固定 `100000`；`42236c2`（2026-07-19，T043）只修 `exporter.ts` 与 `agent_data_queries.ts`，未覆盖页面 reader。明确 pre-existing，并已在旧 review 中出现但尚未闭环。

### [High][98/100 - perspectives：P2 Correctness/Lifecycle、P3 Protocol/Spec、P4 Performance/Resource、P7 Test Quality] BM-H001 — 轮询移除已完成 CDP 事件时不递减 `body_bytes`，正常流量会触发错误淘汰 `[CL-02]`

- **Source bundle:** `bundle_bridge_mcp.md`
- **Location:** - `src/bridge/cdp_handler.ts:389-392` - `src/bridge/cdp_handler.ts:419-445` - `tests/unit/t140_resource_budget.test.ts:37-70` - contract：t140 `AC-009`（聚合预算正确约束驻留 body）与 `AC-010`（预算内常规流量完整性不降级）

**Evidence / call chain:** 1. `Network.getResponseBody` 成功后，`session.body_bytes += ...`，随后执行 `enforce_body_budget(session)`：`src/bridge/cdp_handler.ts:389-392`。 2. `/cdp/events` 把最多 100 条 completed 事件放入 `to_return`，随后直接重建 `session.events = pending.concat(remaining_completed)`：`src/bridge/cdp_handler.ts:430-445`。 3. 被返回、已从 `session.events` 移除的事件 body 字节未从 `session.body_bytes` 扣除。 4. 因此 `body_bytes` 不再代表当前驻留内存，而是接近会话累计捕获量。 确定性状态推演（测试 cap 100 bytes）： - A body 80 bytes：`body_bytes=80`；poll 返回并删除 A，但计数仍为 80。 - B body 30 bytes：计数变 110；当前实际驻留仅 B=30 bytes。 - C body 30 bytes：计数变 140，事件数组 `[B,C]`；预算循环错误淘汰 B，计数仍为 110，数组只剩 C。 - 坏结果：实际驻留仅 30 bytes、远低于 100 bytes，B 仍被静默丢弃；计数还保持超限，后续事件继续被误淘汰。 现有 `t140_resource_budget` 测试只直接构造简化 session 并调用内部 helper，未经过生产 `/cdp/events` 路径，因此无法发现轮询后的账本漂移：`tests/unit/t140_resource_budget.test.ts:45-70`。 - 已检查是否有 poll 后重算或扣减：`handle_cdp_events` 无任何 `body_bytes` 更新。 - 已检查计数是否仅作日志：计数直接控制 `enforce_body_budget` 淘汰。 - 已检查是否需要异常输入：不需要；任意累计返回 body 超过 200MB 后都会触发，测试小 cap 可稳定复现。 - 未升 Critical：影响限定于外部 CDP body 捕获会话，不破坏 IndexedDB 既有数据，也不构成权限突破。

**Impact:** - 常规轮询本身会把会话推入“永久虚假超预算”状态。 - 后续网络响应 body 或完整网络事件被错误淘汰，采集数据不完整。 - 这是核心采集功能可观察数据丢失，不只是内存统计偏差。

**Recommendation:** - 在从 session 移除 `to_return` 前，按 UTF-8 实际存储长度扣减每条非 null `response_body`。 - 更稳妥方案：封装唯一 `remove_event`，统一负责数组移除、body 账本和关联映射清理，禁止多个路径各自维护计数。 - 新增生产路径回归：MockWebSocket 完成 body → `/cdp/events` poll → 再写 body，断言预算内事件全部返回且 `body_bytes` 只统计当前驻留事件。

**History / pre-existing:** t140 新引入**。`body_bytes` 计数来自 `51e0843`；既有轮询删除逻辑未随计数器加入而更新。

### [High][96/100 - perspectives：P2 Correctness/Lifecycle、P5 Error Handling/Observability、P7 Test Quality] BM-H003 — CDP WebSocket 建连后关闭不会终态化 session，扩展永久保持“active”并静默停止 body 捕获

- **Source bundle:** `bundle_bridge_mcp.md`
- **Location:** - `src/bridge/cdp_handler.ts:224-264` - `src/bridge/cdp_handler.ts:409-413` - `src/extension/background/external_cdp_bridge_client.ts:139-166` - `src/extension/background/body_capture_coordinator.ts:242-281`

**Evidence / call chain:** 1. `ws.onopen` 将 `session.cdp_ws = ws` 并 resolve `ws_connect='ok'`：`src/bridge/cdp_handler.ts:235-240`。 2. 同一个 `ws.onclose` 在建连后仍只设置 `session.connect_error='WebSocket closed'` 并再次调用已 settled Promise 的 `resolve('failed')`：`src/bridge/cdp_handler.ts:247-251`。 3. post-open close 不调用 `destroy_session`，不把 pending 事件终态化，也不向 `/cdp/events` 暴露 session failure。 4. session 已在 `sessions` 中并启动 5 分钟 idle TTL：`src/bridge/cdp_handler.ts:409-411`。 5. `/cdp/events` 对该 session 继续返回 HTTP 200 `{ok:true, events:[]}`。 6. 即使 TTL 后 session 变 404，扩展 client 把所有非 2xx 统一变成空数组：`src/extension/background/external_cdp_bridge_client.ts:154-165`。 7. coordinator 每 500ms 永久重排下一次 poll，不依据 session failure 切换 fallback：`src/extension/background/body_capture_coordinator.ts:247-265`；返回状态一直是 `external_cdp_bridge / active`：`:270-280`。 可复现操作：MockWebSocket `onopen` → `/cdp/start` 成功 → 触发 `onclose` → 连续调用 `/cdp/events`。预期应暴露终态并降级；实际为最多 5 分钟 200 空数组，随后 404 仍被扩展转换为空数组，采集模式不变。 - 已检查 onclose 是否在成功连接后被替换：未替换。 - 已检查 `connect_error` 是否被 `/cdp/events` 读取：未读取。 - 已检查 404 是否触发扩展 fallback：client 吞成 `[]`，coordinator 不变更模式。 - 已检查 idle TTL 是否构成恢复：TTL 只删除 session，扩展仍继续空轮询，不恢复。 - 未升 Critical：只影响外部 CDP body 捕获路径，基础网络元数据仍可能由其他采集路径存在。

**Impact:** - Chrome tab 关闭、远端调试端口重启、Chrome 崩溃或 WebSocket 中断后，外部 body 捕获静默永久停止。 - UI/状态仍宣称 external CDP active，用户无法区分“页面无请求”和“采集链已死亡”。 - pending 请求没有失败终态，导致数据完整性与诊断同时缺失。

**Recommendation:** - 建连成功后安装运行态 `onclose/onerror`：把所有 pending 事件终态化为 `cdp_failed`，标 session terminal reason，关闭并清理 WS/timer。 - `/cdp/events` 返回明确 terminal 状态或 410 + 结构化错误。 - `poll_external_cdp_events` 不得把 404/410/鉴权失败统一降为空数组；向 coordinator 抛出可分类错误。 - coordinator 收到 terminal failure 后停止 poll，并切到 fallback hook 或明确更新失败状态。 - 新增 post-open close、error、TTL 后 poll、fallback 切换测试。

**History / pre-existing:** 预存**，`ws.onclose` 当前行为来自 `d9804d4`（t101）。当前 active/backlog task 关键词扫描未发现等价承接。

### [High][96] EXTUI-002 — Live detail polling rereads and rematerializes the full capture every two seconds `[CL-06]`

- **Source bundle:** `bundle_extension_ui.md`
- **Location:** - `src/extension/dashboard/dashboard.ts:118-152` - `src/extension/dashboard/dashboard_shared.ts:288-303` - `src/extension/shared/capture_data_reader.ts:24-35` - `src/extension/dashboard/dashboard_shared.ts:242-285`

**Evidence / call chain:** While a detail page is open for a capturing session, the two-second interval always calls `load_detail()`. `load_detail()` first clears all detail state, requests capture metadata, then launches eight IndexedDB reads in `Promise.all`, each allowing up to 100,000 records. It then creates additional network/console event objects, concatenates the arrays, copies with `.slice()`, and sorts the full merged list. The t144 “incremental render” change only compares signatures **after** this full reread and merge. It avoids DOM replacement when unchanged, but does not avoid database scans, object allocation, array copies, or sorting. A quiet large capture still pays the full cost every two seconds. The single-flight guard prevents overlapping intervals, but when one pass takes more than two seconds it merely drops timer ticks; it does not reduce the cost of each pass. No unit test asserts that unchanged stats skip `read_capture_snapshot()`.

**Impact:** Large live captures can repeatedly allocate hundreds of thousands of records and freeze or exhaust the Dashboard renderer. This competes with ongoing capture/storage work and can make the live detail page unusable precisely when data volume is highest.

**Recommendation:** Poll only lightweight metadata/counters first. Fetch deltas using per-source cursor/offset after counters advance, append them to in-memory state, and sort only the new merge boundary. Prefer SW change notifications over polling. Keep a bounded/virtualized render window for timeline and tables.

**History / pre-existing:** The full polling path predates the current review. Commit `17cde0d` (t144) improved render gating and drag protection but left the expensive full read before the signature comparison. `dashboard.ts:119-120` still contains a TODO acknowledging push notifications as the intended replacement. ---

### [High][95%] PERF-H001 — offset cursor 分页在全量聚合时形成二次复杂度

- **Source bundle:** `bundle_performance.md`
- **Location:** - `src/extension/background/storage.ts:473-501` - `src/extension/background/agent_data_queries.ts:53-68` - `src/extension/background/exporter.ts:29-66` - `tests/unit/t140_resource_budget.test.ts:165-214` - 调用链：`capture.export` / Agent 全量读取 → `fetch_all` / `get_all_*` 按 `offset += batch.length` 循环 → `query_by_store` 每页重新 `index.openCursor(IDBKeyRange.only(capture_id))` → 从首条开始逐条 `cursor.continue()` 跳过 offset。 - 可复现证据： 1. `query_by_store` 每次调用重新打开 cursor；`skipped < offset` 时逐条 `continue()`，没有 continuation key，也没有保持同一 cursor/事务。 2. PAGE_SIZE 为 5000。若单个 store 有 500,000 条记录，100 页 cursor 访问量约为 `5,000 × (1 + ... + 100) = 25,250,000`，而线性遍历只需约 500,000 次。 3. 源码注释 `storage.ts:483` 已明确写出“每页 O(n)，分页即 O(n²)”。 4. `t140_resource_budget` 只验证跨页不丢不重及源码没有 `getAll`；没有统计深页 cursor advance 次数或证明 keyset 行为。

**Evidence / call chain:** 检查过 `t140` 测试、storage 索引和聚合调用方；没有持久 cursor、continuation key、复合索引或 cursor-cost 断言。`getAll` 被移除只能证明峰值改善，不能否定二次扫描。

**Impact:** 大 capture 导出、Agent 全量数据读取会产生显著 IndexedDB 主线程调度和 structured-clone 开销；七个 store 并行读取时延和 CPU 竞争叠加。该实现降低单页内存峰值，但将完整遍历从近 O(N) 退化为约 O(N² / PAGE_SIZE)。

**Recommendation:** - 首选 keyset pagination：增加 `[capture_id, event_id]` 或 `[capture_id, relative_time_ms, event_id]` 复合索引，查询返回 opaque continuation token/last key，下一页以 `IDBKeyRange.lowerBound(last_key, true)` 开始。 - 对导出和 `get_all_data` 提供单事务、单 cursor walk 的 async iterator/page consumer，禁止循环调用 offset API。 - 若必须保留 offset 契约，可用 `cursor.advance(offset)` 降低 JS 回调次数，但全量聚合仍不得逐页从头启动；外部深分页应迁移 continuation token。 - 新增资源测试：instrument cursor success/advance 次数，断言读取 N 条记录为 O(N)，而非只断言“不调用 getAll”。

**History / pre-existing:** offset API 更早已存在；`51e0843c`（2026-08-12，`perf(t140): 大数据量路径资源预算与 cursor 分页`）将实现改为当前从头 cursor 跳过 offset；全量 offset 循环来自 `42236c2f`（2026-07-19）。属于当前 HEAD 已存在、近期性能修复组合出的退化，不是本审查产生的新改动。

### [High][95%] RT-001 — CI 不运行 Python 工具链测试，`tests/repo_template/` 全部在 main 门禁之外

- **Source bundle:** `bundle_repo_tooling.md`
- **Location:** `.github/workflows/ci.yml:15-29,31-42`；`docs/blueprint/testing.md:5-6`；`package.json:26`；`vitest.config.ts:6-7`；`tests/repo_template/package.json:1-6`

**Evidence / call chain:** 1. `ci.yml` 仅两个 job：`quality`（`npm ci` → `scan:tracked-tree` → `npm test` → `npm run build` → `npm audit` ×2）与 `e2e`（Playwright）。全程无 `setup-python`、无 `python3`、无 `pytest`——已用 `grep` 确认 `.github/` 下零 python 引用。 2. `npm test` = `vitest run`（`package.json:26`）；`vitest.config.ts` 只排除 `node_modules/dist/artifacts/.claude/tests/e2e/tests/support/**/*.spec.ts`，且 vitest 只收集 JS/TS——`tests/repo_template/test_*.py` 是 Python，永远不会被执行。 3. `docs/blueprint/testing.md:5-6` 明确声明工具链测试命令：doctor 用 `python3 -m pytest tests/repo_template -q --collect-only`，test 用 `python3 -m pytest tests/repo_template/ -q`。**文档定义的门禁命令在 CI 中从未运行。** 4. `tests/repo_template/package.json` 只声明 `type: commonjs`，无任何 test script。 **证伪尝试**：全局 `grep -rn "pytest\|unittest\|python3"`（package.json、vitest.config、scripts/、.github/）零命中；`npm test` 脚本链上无任何 python 调用。不存在 CI 间接运行 pytest 的通道。

**Impact:** 工具链（task 状态机、ledger、integrate/chain、pending/findings 取号、review 门禁）的任何回归——包括本报告全部 5 个 High——可静默合入 `main`。`repo-template-sync` 模板同步同样无 CI 校验。项目对工具链的信任完全依赖本地手动 `pytest`。

**Recommendation:** `ci.yml` quality job 增加 `actions/setup-python` + `python3 -m pytest tests/repo_template/ -q`（可并入 `npm run test:toolchain` 脚本统一入口）；模板同步后 CI 即验证，避免模板仓与消费仓工具链漂移。

**History / pre-existing:** 预存。** `ea0ff5c`（2026-08-11）一次性引入工具链与 `tests/repo_template/`，CI 配置（早于工具链的既有文件）未同步加 python 步骤；`b6c03aa`（2026-08-11 模板同步）未补。

### [High][94/100 - perspectives：P2 Correctness/Lifecycle、P3 Protocol/Spec、P4 Performance/Resource、P7 Test Quality] BM-H002 — 事件数与 body 预算淘汰不区分 pending，响应回来后请求永久消失 `[CL-07]`

- **Source bundle:** `bundle_bridge_mcp.md`
- **Location:** - `src/bridge/cdp_handler.ts:63-89` - `src/bridge/cdp_handler.ts:344-372` - `src/bridge/cdp_handler.ts:419-445` - `tests/unit/t140_resource_budget.test.ts:45-70` - contract： - t140 `AC-009` 要求按既定策略“丢弃最旧/标记 too_large”限制 body，而非删除无 body pending 请求。 - archived Bridge spec `src/bridge` CDP proxy 条款要求未返回事件保留，completed 分页不丢。

**Evidence / call chain:** 1. `push_bounded` 超事件数上限时无条件 `session.events.shift()`：`src/bridge/cdp_handler.ts:66-75`。 2. `enforce_body_budget` 超 body 预算时同样无条件 shift 最旧事件：`src/bridge/cdp_handler.ts:81-89`。 3. 两处均不检查 `response_body_status`。最旧事件可以是等待 `Network.getResponseBody` 的 `pending` 请求。 4. `Network.loadingFinished` 把 CDP command id → request id 保存在闭包 `body_seq_to_req_id`：`src/bridge/cdp_handler.ts:344-355`。 5. command response 到达时仅在 `session.events` 中查 pending event：`src/bridge/cdp_handler.ts:368-372`。若前面已淘汰，`waiting_event` 为 undefined，映射删除，且不产生失败终态事件。 6. `/cdp/events` 只能返回仍在数组内的非 pending 事件：`src/bridge/cdp_handler.ts:430-445`。被移除请求永久不可见。 确定性状态推演（body cap 100 bytes）： - A：pending、无 body。 - B：已回写 120-byte body，数组 `[A,B]`、`body_bytes=120`。 - `enforce_body_budget` 首先 shift A；A 无 body，计数仍为 120；数组只剩 B，循环因 `events.length > 1` 退出。 - 坏结果：A 请求元数据永久丢失，预算仍超限，B 也未按注释所称“最旧带 body 事件”处理。 事件数 cap 满时也可直接淘汰 pending，形成同一终态缺失。 - 已检查淘汰注释是否与实现一致：注释声称“丢最旧带 body 事件”，实现无筛选。 - 已检查迟到响应能否重建事件：不能；response handler 只更新现存 waiting event。 - 已检查 poll 是否可返回被淘汰元数据：不能；唯一来源是 `session.events`。 - 未升 Critical：需要达到事件数或 body 预算，影响限定于当前 CDP 会话采集完整性。

**Impact:** - 高并发、慢响应或大 body 场景下静默丢失完整请求记录，不只是省略 body。 - `body_seq_to_req_id` 与 session event 生命周期分离，淘汰后只能丢弃迟到结果。 - Bridge 日志只有淘汰计数，无法指出哪个 request 被删除、是否 pending。

**Recommendation:** - body 预算只选择最旧、已终态且确有 `response_body` 的事件；不得用 pending 元数据偿还 body 预算。 - 若只剩当前超大 body、无法通过淘汰降到预算，保留请求元数据，把当前 body 置 null 并标 `too_large`。 - event-count 淘汰若必须删除 pending，先生成可返回终态（如 `cdp_failed` / `evicted`），并清理对应 command 映射。 - 将 `body_seq_to_req_id` 纳入 session 生命周期；destroy/evict 时显式清理。 - 测试必须走 MockWebSocket 生产路径，覆盖 pending 位于最旧位置、迟到 body response、事件数 cap 与 body cap 交叉场景。

**History / pre-existing:** 混合来源**。event-count 淘汰来自 t101；body-budget 淘汰来自 t140 `51e0843`。t140 扩大并常态化该失败场景。

### [High][94%] PERF-H002 — Agent 分页和单条查询均先加载七个数据源全量 `[CL-07]`

- **Source bundle:** `bundle_performance.md`
- **Location:** - `src/extension/background/agent_command_dispatcher.ts:55-87` - `src/extension/background/agent_data_queries.ts:71-99` - `src/extension/background/agent_data_queries.ts:101-150` - `src/extension/background/agent_data_queries.ts:164-165` - `src/extension/background/agent_bridge_client.ts:321-345` - `tests/unit/agent_data_queries.test.ts:351-402,509-572` - `tests/unit/t140_resource_budget.test.ts:93-141` - 调用链：MCP `sources.list` / `data.list` / `data.get` / `timeline.list` / `timeline.get` → Bridge command → extension `dispatch_agent_command` → `load_agent_capture_data` → 七源 `Promise.all(fetch_all(...))` → 返回后才执行 filter/sort/slice/find/summary。 - 可复现证据： 1. `data.list` 即使 `limit=1`，仍先读取 capture 的七个 store 全量；`data.get` 已携带唯一 `record_id`，仍执行相同全量读取后 `.find()`。 2. `sources.list` 为获得 count/range 先读取 value/body，并在 summary 中复制排序；`timeline.list` 先 `flatMap` 所选源，再全量 filter/sort，最后才 slice。 3. `agent_data_queries.test.ts` 明确把“loads all 7 data sources”作为当前行为，并只用 mock 数组验证 5000 跨页功能；没有 IndexedDB predicate/order/limit pushdown 测试。 4. 64 MiB 结果保护位于 `send_result`：dispatch 已完成、全量对象已驻留后才 `JSON.stringify`，再用 `TextEncoder` 复制编码检查。保护只能避免 Bridge 接收超限 body，不能保护 MV3 service worker 内存和查询成本。 5. 该路径还叠加 PERF-H001 offset 重扫。

**Evidence / call chain:** 核对 dispatcher 全部分支、query helper、64 MiB guard 和关联测试；API 的 `limit <= 100000` 只限制最终 slice，不限制 storage 读取量。未发现任何 query pushdown 或点查 fast path。

**Impact:** 本应为 O(limit) 或 O(log N) 的分页/点查，退化为读取最多 500 MB capture 的全部七源、创建多个数组并排序；可能触发 service worker 长任务、内存压力或 eviction，最终仍只返回极少记录。返回体超过 64 MiB 时，系统在支付全部读取、序列化和编码成本后才改写成错误结果。

**Recommendation:** - 将 Agent storage API 拆为 source-specific `count/range/order/keyset page/get-by-id`；filter、time range、order、limit 尽量推入 IndexedDB cursor/index。 - `data.get` / `timeline.get` 用 store primary key 或 `[capture_id, native_id]` 复合索引点查。 - `sources.list` 用 `count()`、边界 cursor 或维护在 `CaptureRecord.stats` 的计数，不读取 body/value。 - `timeline.list` 对各源有序 cursor 做 k-way merge，只保留当前 page；返回 continuation token。 - 仅 `capture.get_all_data` / export 允许遍历全量，并改为流式/分页交付，避免巨大单个 command result。 - 增加测试：`limit=1` 时断言 storage 读取量受限；点查断言不会调用其他六源；体积预算在 materialize 前生效。

**History / pre-existing:** 七源全量加载结构来自 `c3e82f6d` / `c76d228f`（2026-06）；无限分页聚合由 `42236c2f`（2026-07-19）替代 100000 截断。属于长期预存架构问题。

### [High][91%] PERF-H004 — Dashboard 详情/归档固定截断 100000 条且全量渲染、全量组装 `[CL-01]`

- **Source bundle:** `bundle_performance.md`
- **Location:** - `src/extension/shared/capture_data_reader.ts:24-35` - `src/extension/dashboard/dashboard_detail.ts:147-197,241-297,329-347,389-418,486-496` - `src/extension/dashboard/dashboard_shared.ts:310-343` - `src/extension/shared/archive_builder.ts:235-307,311-369,410-455` - `docs/archive/tasks/t153_perf_spot_fixes/spec.md:31-38` - `docs/archive/tasks/t153_perf_spot_fixes/review_general.md:39-50` - 调用链：详情或 ZIP 导出 → `read_capture_snapshot` 每类最多 100000 → 详情 merge/sort 后 `.map().join('')` 构建全部 DOM 字符串，或 archive `prepare_archive_content` 复制/enrich/map 为 JSONL string arrays → `resolve_body_paths` 再 parse/stringify network lines → `assemble_zip` 再 join 为大字符串、转 `Uint8Array`、构建完整 files map 和最终 ZIP。 - 可复现证据： 1. 每类读取硬编码 `100000`，没有“还有下一页”标记。合法 24 小时 capture 中，50 ms 采样事件理论上可达 1,728,000 条；因此详情和 Dashboard ZIP 会静默漏掉第 100001 条之后记录。 2. list view 对过滤结果全量 `.map().join('')`；trace 对七条 lane 分别 filter 并为每个事件创建 DOM mark；network、console、simple tables 同样全量生成 HTML。 3. 搜索输入 200 ms debounce 后调用整页 `render_content`，再次全量 filter、string build、`innerHTML` 替换和 listener wiring。 4. t153 历史 task AC-004 明确要求“大列表不卡死（分页或懒渲染）”；实现只用 `idx_map` 消除 `indexOf` 二次复杂度，没有分页或懒渲染。该 task review 将 AC 判为通过，但代码仍是全量 DOM。该 archive task 不是 `docs/specs_index.md` 当前生效 spec，本文只将其作为明确历史验收意图和漏检证据。 5. ZIP 改用 fflate async callback 解决同步阻塞，但输入 snapshot、enriched arrays、JSONL strings、body byte arrays、files map 和输出 ZIP 会在构建期同时存在；异步压缩不等于流式低内存。

**Evidence / call chain:** 检查了异步 zip、idx map、scroll 容器和搜索 debounce；异步 zip 只让出事件循环，CSS scroll 不减少 DOM 节点，debounce 不限制单次工作量，均不能否定峰值和截断。

**Impact:** 数据量较大时详情首屏、筛选、切 tab 和搜索可能冻结或崩溃；归档在接近 500 MB capture 时产生多份驻留数据和高峰内存。同时固定 100000 上限使 Dashboard 展示和 ZIP 归档不完整，用户无法从 UI 识别截断。

**Recommendation:** - 统一使用 keyset async iterator；详情按页读取，列表采用 windowed/virtual rendering，只为可视窗口创建 DOM。 - timeline 轨道做层级聚合/downsampling；缩放到局部范围后才 materialize 细粒度 marks。 - 搜索使用索引或 worker 增量处理，避免每次整页重建。 - ZIP 使用 fflate streaming `Zip` API；JSONL 逐页编码并 push，body 文件按迭代器加入，避免保留 snapshot + mapped arrays + strings + bytes + output 全部副本。 - 删除静默 100000 截断；若短期必须设预算，返回明确 `truncated/next_cursor` 并禁止标为完整 archive。 - 补充超过 100000 条的完整性测试、DOM 节点数预算测试和大 capture peak-memory benchmark。

**History / pre-existing:** `read_capture_snapshot` 固定上限来自 `08b9d130`（2026-06-13）；全量 UI 渲染自 2026-06 延续；`37cd9f11`（2026-08-13，t153）仅修复 `indexOf` O(N²) 和同步 zip，未实现 AC-004 中分页/懒渲染。属于预存且在近期性能验收中漏过的问题。

### [High][90%] PERF-H003 — Dashboard 活跃详情每 2 秒无条件重读并复制完整快照 `[CL-06]`

- **Source bundle:** `bundle_performance.md`
- **Location:** - `src/extension/dashboard/dashboard.ts:118-152` - `src/extension/dashboard/dashboard_shared.ts:241-303` - `src/extension/shared/capture_data_reader.ts:24-35` - `src/shared/constants.ts:20-21` - 调用链：Dashboard 2 秒 interval → `load_captures` → 当前页面为 capturing detail 时 → 先计算旧 signature → 无条件 `load_detail` → `read_capture_snapshot` 并行读取七类完整数组 → `merge_detail_events` map/copy/sort → 再计算新 signature → 只有 signature 不同时才 render。 - 可复现证据： 1. `dashboard.ts:141` 在比较新旧 signature 前调用 `load_detail`，因此“无变化不重渲染”没有避免 IndexedDB 全量读取和数组重建。 2. `read_capture_snapshot` 每轮对七类分别请求 `limit=100000`，materialize 所有返回记录。 3. `merge_detail_events` spread 复制五类数组，为 network/console 再创建包装事件并整体 sort；状态同时保存 merged events、network 数组和 console 数组。 4. 合法 capture 资源上限为 500 MB、24 小时（`src/shared/constants.ts:20-21`）。在该边界下，2 秒周期全读足以持续占用 Dashboard 主线程和 IndexedDB。 5. `poll_in_flight` 只防止重叠；若一次读取超过 2 秒，会跳过并发轮次，但每次完成后仍继续执行下一次完整读取。

**Evidence / call chain:** 核对 `poll_in_flight`、signature、stats 比较和 render guard；这些机制分别防重叠或避免 DOM 重渲染，均不在 snapshot 读取前短路，不能否定 finding。

**Impact:** 打开进行中 capture 详情后，即使没有新事件，Dashboard 仍持续产生全库 I/O、structured clone、数组分配和 O(N log N) sort；大 capture 会造成卡顿、GC 抖动、电量消耗，并与 background 持续写入争用 IndexedDB。

**Recommendation:** - 在 `CaptureRecord` 维护轻量 `detail_version`/last sequence；轮询先只读 metadata，版本变化才取数据。 - 更优方案：service worker 推送状态和增量事件；Dashboard 按 last key/time keyset 拉增量并 append。 - 将 network/console 和统一 timeline 索引增量维护，避免每轮重新 map/sort 全量。 - 大列表结合分页/虚拟化；Dashboard 离开详情或页面 hidden 时暂停轮询。 - 添加无变化测试：连续两个 poll 只允许 metadata query，禁止调用 `read_capture_snapshot`；添加 100k+ fixture 的读取量/耗时基准。

**History / pre-existing:** 基础 2 秒轮询自 2026-06 已存在；`17cde0df`（2026-08-12，t144）引入当前 detail signature 分支，但 guard 放在完整重读之后。属于近期增强未消除的预存问题。

### [High][90%] RT-002 — review scope 指纹不覆盖未跟踪文件，`git add -N` 漏做即静默绕过 review 门禁

- **Source bundle:** `bundle_repo_tooling.md`
- **Location:** `scripts/repo_template/check_review_status.py:306-334`（`current_scope_fingerprint`）；`scripts/repo_template/render_review_prompts.py:129-155`（`review_scope_fingerprint`）；`.agents/skills/task-work/SKILL.md:92`；对照 `repo_task/monitoring.py:63-66`

**Evidence / call chain:** 1. 指纹 = `git diff --binary <diff_anchor> -- . <excludes>` 的 SHA-1 前 16 位（`check_review_status.py:326-334`，`render_review_prompts.py:149-155`）。`git diff <commit>` 只比较 commit 与工作树中**已跟踪**文件的差异；**未跟踪文件对 diff 完全不可见**。 2. 新文件要进入被审 diff，必须先 `git add -N -- <path...>`；该动作只存在于 `task-work/SKILL.md:92` 的操作指引，无任何机械强制。agent（或直接调 reviewer 的用户）漏做一次，新增源码文件即不在 review 的 scope 内。 3. reviewer 写入报告的 `reviewed_scope:` 与 checker 重算的 `current_scope_fingerprint` 同口径——两侧对 untracked 同样失明；且排除清单（`SCOPE_EXCLUDES`）刻意只排除处置产物，声明「行为文件计入指纹」，但机制本身漏了未跟踪文件这一大类。 4. 同仓库已有正确口径：`monitoring.py:63-66` 的 `repository_fingerprint` 用 `git ls-files --others --exclude-standard` 显式把未跟踪文件纳入哈希。两种指纹并存且口径不一致，证明这是遗漏而非设计意图。 5. 测试 `test_check_review_status.py:403-476` 全部 monkeypatch `current_scope_fingerprint`（如 :409 `lambda task_dir, anchor: SCOPE`），只验证 PASS/stale/missing 分支逻辑，**从未用真实 git diff + 未跟踪文件跑过**。 **证伪尝试**：`grep` 指纹实现中是否存在 `ls-files --others`/`add -N`/intent-to-add 处理——无；`test_check_review_status.py` 无 untracked 用例；`task-work` 的 `git add -N` 指引无对应 checker 侧校验（如「发现未 add -N 的 untracked 则降级不可验证」）。

**Impact:** 新源码（如新增 `src/extension/xxx_capture.ts`）若未 `git add -N`，reviewer 看不到、PASS 判定与指纹均不受影响；review 后 agent 继续添加文件也不改变指纹。review 门禁对「新增文件」这一最核心审查对象存在可静默绕过的盲区，违背「防 PASS 后继续改」的设计目标。

**Recommendation:** `current_scope_fingerprint` 改为 `git diff <anchor>` 与 `git ls-files --others --exclude-standard`（按相同 excludes）内容拼接后哈希（直接复用 `monitoring.repository_fingerprint` 的构成方式，统一口径）；或 checker 先检测任务目录/排除清单外是否存在未 `add -N` 的 untracked 文件，存在则返回 `None`（保守不可验证）并提示。补真实 git 行为测试：未跟踪文件加入后指纹必须变化。

**History / pre-existing:** 预存。** `ea0ff5c` 引入指纹机制与 skill 指引；`monitoring.repository_fingerprint` 同 commit 已含 untracked，两侧未统一。

### [High][90%] RT-003 — 单 task `integrate` 无 transaction，崩溃重入把任意当前 HEAD 记为 `merge_sha`

- **Source bundle:** `bundle_repo_tooling.md`
- **Location:** `scripts/repo_template/repo_task/integration.py:394-463`（重点 :429、:436-438、:454-463）；`attempts.py:168-187`（`require_exact_terminal(allow_integrated=True)`）；对照 chain 事务 `integration.py:466-506`；`tests/repo_template/test_dispatch_integration.py:406-424`

**Evidence / call chain:** 1. `cmd_integrate` 全程无持久标记：`require_primary_worktree` → exact gate → `_resolve_integrate_branch` → `_verify_exact_handoff` → worktree 检查 → `merge --no-ff` → `_commit_index()` → `append_integrated(...)` → `_delete_branches`。任一步之后崩溃，无 transaction 文件可恢复。 2. 崩溃窗口：merge 成功但 `append_integrated` 未执行（进程被杀/断电/异常）。重入时：`_require_execution_gate`（`allow_integrated=True`）通过——ledger 中 state 仍是 `terminal` 且 terminal_status=completed、report=done；`_resolve_integrate_branch` 分支仍在；`_verify_exact_handoff` 通过；`_registered_for_branch` 为空。 3. 然后 `:436` 的 `merge-base --is-ancestor sha HEAD` 为真（已合并）→ 走「跳过 merge」分支，`:438` `merge_sha = _get_head()`——**把当前 HEAD 原样当作 merge_sha**。此时 HEAD 要么是本 task 的 index 维护 commit（崩溃发生在 `_commit_index` 之后），要么已被其他会话/操作推进到任意后续 commit（另一 task 的 merge、其 index commit、手动 commit）。 4. `append_integrated`（`:457`）把该错误 merge_sha 永久写入 ledger。若崩溃发生在 merge 与 `_commit_index` 之间，重入的 `_commit_index` 会先产生 index commit，再把 index commit 记为 merge_sha——同样错误。 5. 现有测试 `test_dispatch_integration.py:406-424`（`test_integrate_skip_merge_also_appends_integrated`）**把这一行为固化为预期**：手动预 merge 后 integrate，断言 `merge_sha == preintegrate_head`。它只覆盖良性场景（预 merge 恰是本 task 的 merge），未覆盖「HEAD 已被无关 commit 推进」的崩溃窗口。 **证伪尝试**：`grep` `_integration_tx_path`/`integrate-*.json`/`O_EXCL` 在 `cmd_integrate` 的使用——无；搜索「merge_sha 与真实 merge commit 比对」（如 `HEAD^1`/`rev-list --merges`）——无；`test_integrate_is_idempotent_after_merge`（`test_task_start_flow.py:805-819`）只测无并发推进的良性重入。代码路径无条件信任当前 HEAD，缺陷确定。

**Impact:** ledger `integrated.merge_sha` 永久指向错误 commit，integration 溯源/审计失真；任何按 merge_sha 重建「task 由哪个 commit 合入」的消费方（含未来工具、`rev-list --grep merge({tid})` 审计）得到错误结果。与 chain 事务的精确性设计形成鲜明反差——单 task 路径是同样语义却无同样保护。

**Recommendation:** 仿 chain 加最小持久标记：merge 前写 `.git/repo-task/integrate-{tid}.json`（含 base_head、branch sha、merge 前 HEAD），收尾后删除；skip-merge 分支改为解析真实 merge commit（`git rev-list --merges --max-count=1 --grep "merge({tid}):"` 或校验 `HEAD` 与 branch merge 的双亲关系），解析不到或 HEAD 与分支 merge 无对应关系时拒绝并要求人工确认，绝不无条件 `_get_head()`。补崩溃窗口测试：`_commit_index` 后模拟中断，HEAD 前进后再重入，断言 merge_sha 仍为真实 merge commit。

**History / pre-existing:** 预存。** `ea0ff5c` 引入；测试同 commit 固化现状行为。

### [High][80%] RT-004 — chain 锁不覆盖 single `integrate` 与其他主干写入，事务窗口内 `base_head` 快照可失效

- **Source bundle:** `bundle_repo_tooling.md`
- **Location:** `scripts/repo_template/repo_task/integration.py:487-506`（`_chain_locked`）、`:394`（`cmd_integrate` 无锁）、`:810-819`（tx 写 `base_head`）、`:688-698`（`_record_prepared_merge` 双亲校验）；`docs/blueprint/architecture_repo_template.md:15,61`

**Evidence / call chain:** 1. `_chain_locked` 只装饰 `cmd_integrate_chain`（`:754`）。`cmd_integrate`（`:394`）与 `_commit_index`（`:350-364`）均不获取该锁；agent 的手动 commit、`cmd_add` 等也不受约束。 2. chain 流程：预检 → `:810-819` 写 transaction（快照 `base_head = _get_head()`）→ `:821-837` 执行 `merge --no-ff`。若另一会话的 single `integrate`（其 merge + `_commit_index`）落在 tx 创建与 chain merge 之间，主干在事务窗口内被推进。 3. chain merge 本身仍会成功（git 三方 merge），但若进程此后崩溃、phase 停在 `prepared`，恢复时 `_record_prepared_merge`（`:688-698`）要求 `HEAD^1 == base_head && HEAD^2 == tail_sha`——第一父已被单 integrate 的 commit 顶掉，**恢复被永久拒绝**，只能按 skill 指引手动删 tx 重跑（重复 merge 或丢失恢复上下文）。 4. `architecture_repo_template.md:15,61` 明确写着「多会话同时写主仓不互斥——合并撞车由 git 报错、人来收场，index 是派生缓存、撞了重建」——文档承认的「不互斥」只覆盖 merge 冲突与 index 可重建性，**未覆盖 chain 事务快照不变量**（base_head、成员 SHA 锚定）。 **证伪尝试**：`grep` 确认 `_chain_locked` 唯一装饰点；`cmd_integrate` 内无任何锁获取；`_ensure_primary_merge_ready`（`:371-379`）只检查 `MERGE_HEAD` 与已跟踪脏文件——该窗口内两者都为空（另一会话的 merge 已完成、index 已提交），形同虚设。`_validate_tx_members` 重验成员 SHA 但不重验 base_head。

**Impact:** 多会话并发（系统明确支持的模式）下，chain 事务崩溃恢复路径可能卡死，aggregate transaction「零 merge / 一次性合并」的原子性承诺在真实并发下不成立。

**Recommendation:** 最小改动：`cmd_integrate`（及 `_commit_index` 调用方）在 merge/commit 前获取同一 `integrate-chain.lock` 排他锁；更彻底：抽出统一的主干写锁。或 chain merge 前重读 HEAD 与 `base_head` 比对，漂移则拒绝并提示用户先处理并发 integrate。

**History / pre-existing:** 预存。** `ea0ff5c` 引入 chain 锁与事务；并发不互斥是同日文档化的既有设计边界，但该边界未延伸到事务快照。

### [High][75%] RT-005 — chain index 恢复只检查 `HEAD^1 == merge_sha`，可把无关紧邻 commit 误认为 index 维护 commit

- **Source bundle:** `bundle_repo_tooling.md`
- **Location:** `scripts/repo_template/repo_task/integration.py:701-713`（`_record_index_phase`，关键 `:711`）；`:716-725`（`_record_integrated_phase`）

**Evidence / call chain:** 1. 崩溃于 `_commit_index()` 完成、`_update_chain_tx(payload, "indexed", ...)`（`:713`）之前时，恢复路径 `:707-712`：`HEAD != merge_sha` 则只检查 `HEAD^1 == merge_sha` 即认领为「紧邻 index 维护 commit」，写入 `index_sha`。 2. 该检查**不验证 commit 是否真的是工具链的 index commit**：无 subject 匹配（`chore(task): rebuild task indexes`）、无路径集合校验（只应含 `docs/tasks_index.json`、`docs/archive/tasks_index.json`）、无 author/时间窗校验。任何 first-parent 指向 chain merge 的 commit 都会被认领。 3. 具体交错：另一会话 single `integrate` 若其分支已合入（走 `:436-438` skip-merge 分支）且其 `_commit_index` 恰好落在 chain merge commit 之上，该 index commit 的 `HEAD^1 == chain merge_sha` → chain 恢复把它认领为自己的 index commit，`index_sha` 归属错误。RT-004 的不互斥放大了这个窗口。 4. 多数错误交错会被后续 `_record_integrated_phase`（`:716-719`，要求 `_get_head() == index_sha`）与 finalize 检查 fail-closed 拦截，实际数据损坏有限；但「恢复时 provenance 校验」的语义被架空——接受的是未经验证的相邻 commit。 **证伪尝试**：`grep` 恢复路径中是否存在 `git show --format=%s`/`git diff-tree --name-only`/`git log --merges` 校验——无；`_validate_tx_members` 只重验成员分支 SHA 与 ancestry，不校验 index_sha 归属；测试 `test_dispatch_integration.py:601-640` 只覆盖正常 phase 推进与冲突恢复，无「崩溃后主干被无关 commit 推进」用例。

**Impact:** 恢复路径无法保证 `index_sha` 归属；与 RT-004 组合时误认领概率上升。归属错误的 tx 在 finalize 时多数 fail-closed，但 audit 语义（谁、何时、以什么 commit 维护了 index）不可信。

**Recommendation:** `:711` 分支加归属校验：`git show -s --format=%s HEAD` 必须等于 `chore(task): rebuild task indexes`，且 `git diff-tree --no-commit-id --name-only -r HEAD` 的路径集合 ⊆ {两个 index JSON}；不匹配则拒绝并要求人工确认。补故障注入测试：在 index commit 后、phase 写入前中断，用无关 commit 推进 HEAD，断言恢复拒绝。

**History / pre-existing:** 预存。** `ea0ff5c` 引入。

## Medium

### [Medium][100%] ARCH-002 — MCP 直接依赖 Bridge 配置模块，违反产品依赖方向

- **Source bundle:** `bundle_architecture.md`
- **Location:** - `src/mcp/token_resolver.ts:1-16` - `src/mcp/main.ts:1-11` - `src/bridge/config.ts:1-172` - `docs/blueprint/architecture.md:145-155`

**Evidence:** 1. `token_resolver.ts` 从 `../bridge/config` 导入 `default_token_file_path`、`load_bridge_token_file` 与 `TokenFileLoadResult`，`mcp/main.ts` 再调用 resolver 完成启动 token 解析。 2. 架构依赖表明确规定 `mcp ──✗── extension / bridge（运行时只走 HTTP）`，三个产品只能共同依赖 `src/shared`（`architecture.md:145-155`）。静态 import graph 中这是唯一明确跨产品违规边；无 TS import cycle。 3. `bridge/config.ts` 同时包含 Bridge CLI 解析、token 文件 contract、token 生成/持久化、Bridge token resolution 与健康检查（`config.ts:14-172`）。MCP 为复用只读 token 文件逻辑，被迫依赖拥有 Bridge 启动职责的模块。 4. `tests/unit/mcp_token_fallback.test.ts` 测 MCP resolver，`tests/unit/agent_bridge_config.test.ts` 测 Bridge config …

**Impact:** - Bridge 配置重构、入口拆分或浏览器端打包规则变化会无关地影响 MCP；产品目录无法独立构建和演进。 - 架构文档与真实依赖不一致，使依赖门禁失去可信度；后续复用容易继续从产品目录横向导入。

**Recommendation:** - 将 Node 专用 token 文件类型、默认路径与读取逻辑移到中立模块，例如 `src/shared/node_bridge_token_file.ts`；Bridge config 与 MCP resolver 同向依赖该模块。 - Bridge 专属 CLI、token 生成/持久化、health probe 留在 `src/bridge/config.ts`。若不希望 `shared` 含 Node API，可建立明确的 `src/node_shared/` 层并在 blueprint 中记录，仍禁止产品横向依赖。 - 增加 import-boundary 测试/脚本，拒绝 `src/{extension,bridge,mcp}` 互相导入。

**History:** `d8970e7`（2026-07-22，T091）引入；`8fa73b7`（2026-08-11）扩充失败原因类型。明确 pre-existing。

### [Medium][100/100 - perspectives：P3 Protocol/Spec、P5 Error Handling、P6 Docs/Config、P7 Test Quality] BM-M002 — `get_status` / `list_browsers` 声明的 `timeout_ms` 被分发层静默忽略 `[CL-03]`

- **Source bundle:** `bundle_bridge_mcp.md`
- **Location:** - `src/mcp/schemas.ts:46-52` - `src/mcp/tools.ts:33-41` - `src/mcp/client.ts:7-25` - `docs/guides/mcp_usage.md:87-93` - `tests/unit/agent_mcp_client.test.ts:103-112` - `tests/unit/mcp_schema.test.ts:249-255`

**Evidence:** - 两个工具 schema 都公开接受 `timeout_ms`：`src/mcp/schemas.ts:46-52`。 - `execute_mcp_tool` 对两者直接调用 `client.get_status()`，没有读取 `call.arguments`：`src/mcp/tools.ts:33-41`。 - `BridgeMcpClient.get_status()` 固定使用 10000ms：`src/mcp/client.ts:11,20-25`。 - 指南声明“所有工具支持 timeout_ms”且“显式传入始终优先”：`docs/guides/mcp_usage.md:87-93`。 可观察输入：`get_status({timeout_ms:1})` 或 `list_browsers({timeout_ms:1})`。实际 AbortSignal 仍为 10000ms。现有 client 测试反而固定断言 10s；schema 测试只证明参数被接受，没有端到端断言参数生效。

**Impact:** - 调用方无法按工具契约设置快速失败界限。 - Bridge 挂起时 agent 可能比声明多等待近 10 秒。 - 参数被静默接受比显式拒绝更难诊断。

**Recommendation:** 二选一： 1. `BridgeMcpClient.get_status(timeout_ms = 10000)`，tools 读取并传递参数；list_browsers 同步。 2. 若产品决定固定 10s，则从 schema、工具描述和指南删除该参数。 新增 MCP tool 分发测试，spy `AbortSignal.timeout` 并从 `execute_mcp_tool` 输入验证 1ms/5000ms 确实到达 client。

**History:** 预存**。get_status 分发来自 `4ddb94d4`，list_browsers 来自 `eec69857`；2026-08-13 strict schema 只拒绝未知键，未修参数消费。

### [Medium][100] DD-001 — 对外承诺的 24 小时采集上限从未执行

- **Source bundle:** `bundle_dead_docs.md`
- **Location:** `src/shared/constants.ts:20-21`；`src/shared/types.ts:513-518`；`src/extension/background/service_worker.ts:499-539,541-685,689-710`；`README.md:123-133`；`docs/blueprint/domain.md:108-126`

**Evidence:** 1. `MAX_SESSION_DURATION_MS` 仅在 `src/shared/constants.ts:21` 定义，源码与测试均无引用。 2. `CaptureStoppedData.reason` 仍公开 `'max_duration'`（`src/shared/types.ts:515`），表明协议保留自动到期语义。 3. `start_capture` 在设置活跃状态后只启动 keepalive、periodic flush 和各采集器（`service_worker.ts:499-685`），没有 deadline、alarm、timer 或 elapsed-time guard。 4. `stop_capture(reason)` 支持传 reason（`service_worker.ts:689-710`），但无生产调用路径传入 `'max_duration'`。 5. README 与当前生效 blueprint 分别明确承诺“500 MB、24 小时”和“单采集时长 24 小时”。 6. 旧审阅 `docs/reviews/review_20260719_0859/src_bridge_mcp_shared_02/opus.md:16-22` 已报告同一问题，当前仍可复现。

**Impact:** 用户依赖的生命周期约束是虚假的。忘记停止时采集不会在 24 小时自动终止，可持续运行直到用户停止、异常或 500 MB 大小限制触发；`max_duration` reason 也成为不可达协议分支。

**Recommendation:** 采集成功后持久化截止时间，并注册可取消的 `chrome.alarms`（MV3 下优先于仅内存 `setTimeout`）；alarm 到期调用 `stop_capture('max_duration')`。Service Worker 重启时根据持久化截止时间立即终态化或重建 alarm，stop/失败清理 alarm。补 fake alarms/time 测试覆盖正常到期、手动提前停止、SW 重启后已过期三条路径。若产品不再需要上限，则同步删除常量、reason、README 与 blueprint 承诺。

**History:** 长期预存。常量由 `2f95a68c`（2026-06-03）引入；blueprint 声明由 `5d15d019`（2026-07-12）引入；README 用户承诺由 `99783357`（2026-07-14）引入。不是本次审阅产生。

### [Medium][100] DD-002 — `contributing_dev.md` 声称描述当前结构，但结构、命令与示例均已失真

- **Source bundle:** `bundle_dead_docs.md`
- **Location:** `docs/guides/contributing_dev.md:51-78,82-100,142-181,198-226`

**Evidence:** 1. `:56-65` 展示 `src/agent/{bridge,mcp,shared}` 与顶层 `src/{background,content,dashboard,...}`，而真实结构为 `src/{extension,bridge,mcp,shared}`；`:78` 又明确声明“本页描述当前结构”，形成文档内自相矛盾。 2. `:96-99` 将 `bridge/server.ts` 描述成 WebSocket Bridge；当前 `src/bridge/server.ts` 是 Node HTTP server，WebSocket 只存在于外部 CDP 相关路径。 3. `:146-149` 使用固定弱 token `test` 和硬编码端口 `3000`。项目安全不变量要求强随机 token，当前默认示例/惯例端口为 `17831`。 4. `:156`、`:201`、`:226` 使用已不存在的根目录测试路径；当前单测位于 `tests/unit/`。 5. `:170-173` 新 content 模块示例从 `src/extension/content/my_capture.ts` 导入 `../shared/logger`，实际解析到不存在的 `src/extension/shared/logger`；正确跨到根 shared 需 `../../share …

**Impact:** 新贡献者按活动指南操作会启动错误端口、使用不安全 token、运行不存在的测试路径，并生成无法 typecheck 的模块；这不是措辞瑕疵，而是直接破坏开发入口。

**Recommendation:** 从当前目录树、`package.json` scripts、`src/shared/logger.ts` API 重新生成本页；示例使用安全随机 token 的生成/持久化流程或直接指向零配置 Bridge 文档，不提供固定 token；所有测试路径改为 `tests/unit/...`；用可实际编译的最小 content 模块示例，并在文档 CI 增加路径/代码片段校验。

**History:** 预存。大部分内容由 `0d73bccd`（2026-07-16）引入；`6af4a440`（2026-07-20）补了“三产品结构”声明及 tests 子目录，却未改旧树与示例。旧文档审阅已指出类似漂移，未完成收敛。

### [Medium][100] DD-003 — 活动测试指南仍描述归档时代目录、构建链与 MCP 注册方式

- **Source bundle:** `bundle_dead_docs.md`
- **Location:** `docs/guides/test.md:34-64,77-126,140-155`；`vitest.config.ts:3-21`；`package.json:22-39`；`.mcp.json.example:1-14`

**Evidence:** 1. `test.md:36-46` 的 Vitest 配置漏掉当前 `tests/e2e/**`、`tests/support/**` exclusions 与完整 coverage 配置；真实配置见 `vitest.config.ts:3-21`。 2. `test.md:50-64` 声称单测/E2E 平铺在 `tests/` 根，并列出 `tests/fixtures`、`__mocks__`、`helpers`；真实结构是 `tests/unit/`、`tests/e2e/`、`tests/support/fixtures/server.ts`。当前规模为 159 个 unit tests 与 37 个 E2E specs，不是文档所称约 80/40 个根目录文件。 3. `test.md:84` 的 build 流程漏掉 `copy:locales` 与 `build:zip`；真实命令为 `package.json:24`。 4. `test.md:89` 将 E2E server 写成 `tests/fixtures/server.ts`；真实 script 是 `package.json:36` 的 `tests/support/fixtures/server.ts`。 5. `test.md:100-126` 要求手填 MCP token，声称 `.claude …

**Impact:** 开发者会遗漏完整构建产物、启动错误 fixture 路径、配置错误 MCP 客户端，并误判测试与工具覆盖面。指南标题和措辞将这些内容标为“实际”，提高误导风险。

**Recommendation:** 以 `vitest.config.ts`、`playwright.config.ts`、`package.json`、`.mcp.json.example`、`src/mcp/tools.ts` 为唯一来源重写相关章节；删除归档工作流强制语气和已解决的 clarification；工具数量由代码生成或只链接 MCP usage，避免手工计数再次漂移。

**History:** 预存。核心段落源自 `5d15d019`（2026-07-12）的 archived omni_powers 文档；`6af4a440`（2026-07-20）迁入活动指南时未按现行配置完整重建。

### [Medium][100] DD-004 — 当前领域蓝图仍宣称已删除类型和字段存在，且“禁用术语完全移除”与现状冲突

- **Source bundle:** `bundle_dead_docs.md`
- **Location:** `docs/blueprint/domain.md:49,59-76`；`src/shared/types.ts:370-386`；`src/mcp/tools.ts:9-31`；`src/mcp/schemas.ts:131-150`

**Evidence:** 1. `domain.md:74` 声称 `Session` / `RecordEvent` 类型仍以 `@deprecated` alias 存在；t125 已删除这些 alias，当前 `src/shared/types.ts` 不存在对应定义。 2. `domain.md:76` 声称 `capture_mode` 字段仍保留 `'basic' | 'advanced'`；当前源码不存在该字段，只有名称不同、语义不同的 `body_capture_mode` / `keyboard_capture_mode`。 3. `domain.md:61` 声称禁用概念已从“UI 与文档完全移除”，但同文档 `:49` 明确列出 4 个 session 命名 MCP alias；`src/mcp/tools.ts:14-15,22,24` 与 `src/mcp/schemas.ts:140-141,148,150` 也继续公开这些名字。 4. `domain.md:71` 禁止 `session_id`，但 `WsFrameData.session_id` 仍以“v2.0 移除”的 deprecated 字段存在（`src/shared/types.ts:382-385`），`src/extension/background/network_capture.ts:418,477,504 …

**Impact:** `docs/blueprint/` 是项目长期真相和 task/spec 输入。错误描述会让后续 task 重建已删除兼容层、误以为 `capture_mode` 仍属契约，或在审查时把有意 alias 当成违规，直接污染需求和变更边界。

**Recommendation:** 删除 `:74`、`:76` 的过期陈述；把“完全移除”改成精确范围，列出仅存的 MCP alias 与 `WsFrameData.session_id` 例外、负责人和移除条件。若继续遵循破坏性升级方向，则创建明确 task 删除这些例外，再将 domain 改为完全移除。

**History:** 预存。相关 domain 行由 `5d15d019`（2026-07-12）引入；t125 删除代码后只同步了 ADR 013，未同步 `domain.md:74`。不是当前 review 引入。

### [Medium][100%] SEC-001 — 首次 extension enroll 把可伪造 HTTP Origin 当认证凭据

- **Source bundle:** `bundle_security.md`
- **Location:** `src/bridge/server.ts:244-275,280-351,606-614`; `src/shared/constants.ts:63-65`; `tests/unit/t137_bridge_security.test.ts:109-145`; `docs/guides/mcp_usage.md:15-18`

**Evidence:** 1. `/extension/enroll` 计算 `has_ext_origin = Boolean(origin && is_allowed_extension_origin(origin))`；没有 MCP token 时，只要该值为 true 即放行，pairing code 未提供时不校验（`server.ts:244-272`）。 2. `is_allowed_extension_origin()` 只匹配 `^chrome-extension://[a-p]{32}$`（`server.ts:606-608`）。HTTP `Origin` 是客户端提供的 header，本地 Node/curl 进程可构造，不证明请求来自 Chrome 扩展。 3. Bridge 为新 `instance_id` 签发 `ext_*` instance token 并创建命令队列（`server.ts:274-275,332-349`）。测试 AC-006 明确锁定“首次 enroll + 任意形状合法 Origin = 200”（`t137_bridge_security.test.ts:141-145`）。 4. 默认扩展配置开启 Bridge 且 legacy token 为空（`constants.ts:63-65`），文档也声明 loopback 默认不要求 pairing。 …

**Impact:** 不可信本地进程可注册伪浏览器实例。若它是唯一在线实例，未指定 target 的 MCP 命令可发给伪实例并收到伪造状态/采集结果；攻击者也可抢先登记可预测的未来 `instance_id`，使真实扩展因 Origin extension ID 不同而无法复用该 ID。t137 阻止“不同 ID 顶替既有绑定”，但不建立首次登记身份。

**Recommendation:** 首次 enroll 必须使用真正 secret：一次性 pairing code、MCP Bearer token，或安装时固定/安全分发的 extension credential。可选固定允许 extension ID，但不能继续把 `Origin` 当主凭据；Origin 仅作附加一致性校验。增加“伪造合法形状 Origin + 无 pairing/token 必须 401/403”测试。

**History:** 预存且为明确产品决策。** `d8970e7`（2026-07-22，`feat(T091_zero_config_auto_connect)`）移除 pairing 强制。`7daf059`（2026-08-12，`security(t137)`）只防不同 extension ID 顶替已有实例和 label 顶替；其 AC-006 主动保留首次零配置放行。既有 2026-08-12 review 已指出相邻的 enroll 顶替风险；本 finding 是修复后仍存在的首次认证缺口。

### [Medium][100%] SEC-002 — CDP discovery 返回的 WebSocket URL 未限制到请求的 loopback 端口

- **Source bundle:** `bundle_security.md`
- **Location:** `src/bridge/cdp_handler.ts:158-185,191-225`; `src/bridge/server.ts:556-567`; `tests/unit/bridge_cdp_events.test.ts:77-88`

**Evidence:** 1. 已认证 `/cdp/start` 请求传入 `port`；Bridge 固定从 `http://127.0.0.1:${port}/json/list` 读取 target 列表（`cdp_handler.ts:174-185`）。 2. 代码选择 target 后只检查 `webSocketDebuggerUrl` 非空，随后直接 `new WebSocket(target.webSocketDebuggerUrl)`（`cdp_handler.ts:191-225`）。没有解析 URL，也没有 scheme/hostname/port/userinfo allowlist。 3. 因此占用指定 loopback 端口的恶意/被劫持服务可返回 `wss://attacker.example/...` 或其他 `ws://` 目标，让 Bridge 建立出站 WebSocket。现有测试只提供正常 `ws://127.0.0.1/...`，没有拒绝远端 URL 的负向断言。 4. `/cdp/start` 本身仍要求 MCP Bearer token（`server.ts:357-377,563-566`），故攻击者需要授权客户端能力或诱导授权 Agent 连接其本地端口。

**Impact:** Bridge 可被用作有限 SSRF/出站 WebSocket 连接代理；远端端点可收取 Bridge 发送的 CDP `Network.enable` 等消息并持续推送数据，造成网络策略绕过、资源占用或协议混淆。该链路不会自动附带 Bridge token。

**Recommendation:** `new URL(webSocketDebuggerUrl)` 后仅允许 `ws:`，hostname 为 `127.0.0.1`/`localhost`/`[::1]`，且端口必须等于请求的 `port`；拒绝 credentials、fragment、异常路径和 `wss:`/远端 host。最好优先使用 target ID 自行构造已知 loopback URL，避免信任 discovery 返回的 authority。补远端 host、不同端口、userinfo、非 ws scheme 测试。

**History:** 预存。** 直接信任 discovery URL 的实现来自 `c4e9851`（2026-06-07，后续仅目录迁移）；`d9804d4` 增加 HTTP/WebSocket 超时，`df1c690` 增加 tab URL 精确匹配，均未收敛 WebSocket authority。

### [Medium][100%] SEC-003 — 默认采集原始 request/response body，`redact_data` 不处理 body 内容

- **Source bundle:** `bundle_security.md`
- **Location:** `src/shared/constants.ts:20-24,30-43,46-53`; `src/extension/background/network_capture.ts:427-438`; `src/extension/background/network_webrequest.ts:35-74`; `src/shared/redaction.ts:207-234`; `src/extension/background/exporter.ts:69-73,346-375`; `docs/archive/specs/extension_capture.md:23-33`; `docs/archive/specs/privacy_redaction.md:3-45`; `tests/unit/public_docs.test.ts:118-122`

**Evidence:** 1. `DEFAULT_CONFIG` 与 `DEFAULT_USER_CONFIG` 均默认 `capture_request_body=true`、`capture_response_body=true`，单条上限 100MB（`constants.ts:20-24,30-53`）。公开文档测试锁定 body 默认开启。 2. CDP request `postData` 在上限内原样赋给 `req_body`（`network_capture.ts:427-438`）；webRequest `formData`/raw body 编码后原样返回（`network_webrequest.ts:35-74`）。response body 路径同样只截断/编码。 3. `redact_data` 的 shared body helper 只有字节截断和 preview，没有按 MIME/key/value 脱敏（`redaction.ts:207-234`）。archive privacy spec 只定义 URL/header/input/keyboard/cookie/WebSocket 元数据脱敏，没有 body 内容策略。 4. export 默认保留 response body；即使 `include_response_body=false`，只移除 `response_ …

**Impact:** 用户开始采集后，登录表单、OAuth/token exchange、API key、session material、PII 和业务响应可明文进入 IndexedDB、导出文件、Agent 上下文。`redact_data=true` 容易让用户误以为这类内容已统一脱敏。数据保持本地且采集由用户主动启动，因此定 Medium。

**Recommendation:** 隐私优先方案：request/response body 默认关闭并在 UI/MCP 做显式 opt-in；把默认单条上限降到诊断所需规模。若保留 body，按 MIME 处理：`application/x-www-form-urlencoded`、JSON、multipart 字段按敏感 key 脱敏，password/file 内容默认跳过；无法安全解析时提供 hash/长度/preview 而非完整内容。导出选项应能同时剥 request body、response body、preview，并清晰显示脱敏覆盖边界。

**History:** 长期预存且文档化。** `63fcc01`（2026-06-11）把 body 默认改为全开；`fb8bbdb`（2026-06-12）引入 CDP `postData` 原样采集。现行 archive specs 明确默认 100MB/完整捕获。2026-07-19 review 已报告 body 绕过 `redact_data`，至今未形成当前生效 spec 修复。

### [Medium][100%] SEC-005 — 页面可观察内联脚本文本并窃取 HMAC secret，伪造采集事件

- **Source bundle:** `bundle_security.md`
- **Location:** `src/extension/content/content_page_script.ts:22-26,42-63`; `src/extension/content/network_hook.ts:23-44,430-452`; 同型 `src/extension/content/storage_capture.ts`、`src/extension/content/websocket_capture.ts`; `docs/blueprint/decisions.md:160-166`

**Evidence:** 1. content 每次 start 生成 secret，`page_script_preamble()` 把它拼进字符串字面量 `var SECRET = '${secret}'`（`content_page_script.ts:22-26`）。 2. `inject_script_element()` 创建 `<script>`、把完整脚本文本放入 `element.textContent`，append 到页面 DOM，下一 task 才移除（`content_page_script.ts:48-63`）。 3. 对抗页面可预先 hook `Node.prototype.appendChild`，或使用 MutationObserver 捕获新增 script 并同步读取 `textContent`，取得 secret。拿到 secret 和 page-visible nonce 后，可生成合法 `sig`，通过接收侧 `origin/source/nonce/HMAC` 检查（`network_hook.ts:430-452`）。 4. ADR-020 明确承认 MutationObserver/DOM hook 可窃取 secret，并把该对抗页面排除在方案威胁模型外（`decisions.md:165`）。代码注释“页面脚本无法读取”只成立于不观察注入过程的页面。

**Impact:** 正在采集的恶意/被攻陷页面可向 network/storage/WebSocket 通道注入伪造事件和 body，污染本地证据及 Agent 判断。攻击不直接读取扩展 IndexedDB，也不能越权调用 Bridge；主要破坏完整性。

**Recommendation:** 首先纠正文档/代码注释，避免把该 HMAC描述为可对抗页面。使用 `chrome.scripting.executeScript({ world: 'MAIN', func, args })` 或静态 web-accessible script 避免 secret 明文经过页面 DOM，但注意 MAIN world 本身仍不可信，页面可 hook被包装 API或调用链。若产品需要对抗恶意页面，不能让页面 MAIN world持有签名 key；应把可验证观测移到 extension CDP/webRequest/content isolated world，或将 fallback hook 数据标记为 untrusted provenance，禁止作为安全证据。

**History:** 已知、预存、显式接受的设计边界。** `849b739`（2026-08-11）引入 per-message HMAC；`4cf960b`（2026-08-12）仅抽取模板，secret 仍内联。ADR-020 同日记录威胁模型排除。既有 2026-08-12 content review 已报告同一边界，本次确认当前实现仍在。

### [Medium][100%] SEC-006 — URL 脱敏保留 fragment，OAuth/hash credential 可落库和导出

- **Source bundle:** `bundle_security.md`
- **Location:** `src/shared/redaction.ts:107-166,168-203`; `docs/archive/specs/privacy_redaction.md:7-20`; `tests/unit/t114_nested_query_redaction.test.ts:86-90`; `src/extension/background/network_capture.ts:265-288,341,857,920`; `src/extension/content/network_hook.ts:454-472`

**Evidence:** 1. absolute URL 分支只遍历 `searchParams`，从不检查 `parsed.hash`；相对 URL 分支显式拆出 `hash_part` 后原样拼回（`redaction.ts:107-203`）。 2. archive privacy spec 明确写“不处理：URL fragment（产品语义未定）”。现有 t114 测试只验证普通 `#frag` 保留，没有 `#access_token=...` 负向用例。 3. 网络、WebSocket、fallback、日志均复用 `redact_url`，因此 `https://app/callback#access_token=SECRET&token_type=bearer` 在 `redact_data && redact_url_query` 下仍保留 secret。导航/hashchange 也把 fragment 作为 URL 变化处理。

**Impact:** OAuth implicit flow、密码重置链接、magic link、SPA hash route 中的 token/API key/PII 可进入 capture、app log、导出及 MCP 查询。开启 URL 脱敏后仍泄漏真实 credential，属于隐私控制缺口。

**Recommendation:** 对 fragment 采用保守、结构感知策略：若 hash 可解析为 `key=value`/`&` 参数，按 query 敏感 key规则脱敏；对 `#/route?token=...` 递归处理 route query；普通锚点和无敏感 hash route 保形。解析失败但命中 credential 模式时 fail-closed 替换整个 fragment。补 OAuth implicit、encoded hash、hash-router、普通 `#section` 回归测试。

**History:** 长期预存且文档已知。** 初版 redaction 未覆盖 fragment；`31789b9` 扩大 query key，`146b0de` 修复相对 URL fail-open，`472509b` 增加 nested query，均保留 hash。2026-07-19 review 已指出 fragment 缺口；archive spec 后续把它记录为“产品语义未定”，但当前生效 spec `privacy_logger_stack_redact_url` 仍未覆盖。

### [Medium][100%] TD-002 — CDP retry E2E cannot prove retry recovery even if wired

- **Source bundle:** `bundle_tests_docs.md`
- **Location:** `tests/e2e/e2e-cdp-retry.spec.ts:96-108`, `tests/e2e/e2e-cdp-retry.spec.ts:111-163`, `tests/e2e/e2e-cdp-retry.spec.ts:165-197`, `src/extension/background/service_worker.ts:1095-1134`, `src/extension/background/service_worker.ts:1208-1250`, `docs/archive/E2E_GAP.md:183-205`

**Evidence:** - Scenario A explicitly accepts an empty `console_events` array (`tests/e2e/e2e-cdp-retry.spec.ts:96-104`). It then accepts `fallback_hook` as a valid `body_capture_mode` (`tests/e2e/e2e-cdp-retry.spec.ts:106-108`), although fallback mode does not establish that CDP retry recovered. - Scenario B performs the restricted-to-normal URL transition but asserts only `capture.status === 'completed'` (`tests/e2e/e2e-cdp-retry.spec.ts:111-163`). It does not assert recovered console or response-body data. - Scenario C computes `has_retry`, but missing retry logs only produce `console.log` and never fail …

**Impact:** A regression that disables CDP reattachment after starting on `chrome://` can pass all three scenarios. Once TD-001 is fixed, this file would still provide false-green coverage for the production retry path.

**Recommendation:** Use a deterministic local page that emits a unique console marker and returns a unique response body after the retry-triggering transition. Require: - the marker in exported `console_events`; - at least one matching request with `response_body_status === 'captured'` and expected content; - a CDP-backed body mode (`extension_cdp` or the intentionally tested external CDP mode, not `fallback_hook`);  …

**History:** Pre-existing since `23a3728` (2026-06-11). Commit `aa444bf` (2026-06-13) narrowed the body-mode set but retained `fallback_hook`; it did not make recovery mandatory.

### [Medium][100%] TD-003 — HAR body assertion is true for both body-present and body-absent output

- **Source bundle:** `bundle_tests_docs.md`
- **Location:** `tests/e2e/e2e-export-content.spec.ts:235-242`, `docs/archive/E2E_GAP.md:236-244`

**Evidence:** The test correctly computes whether any HAR entry contains non-empty `response.content.text` (`tests/e2e/e2e-export-content.spec.ts:235-240`), then asserts only that the result's type is boolean (`tests/e2e/e2e-export-content.spec.ts:241-242`). JavaScript `Array.prototype.some()` always returns a boolean, so both `true` and `false` pass. The archived acceptance contract explicitly requires non-empty `response.content.text` (`docs/archive/E2E_GAP.md:236-244`).

**Impact:** A HAR exporter regression that drops every response body remains green. This is independent of TD-001: wiring the file into Playwright would not restore meaningful coverage.

**Recommendation:** Create one deterministic response with known content, locate its HAR entry by URL or a unique request marker, and assert both `response.content.text` and the expected body value. If body capture is an environment prerequisite, fail setup or explicitly skip the project rather than converting the acceptance criterion into a type check.

**History:** Pre-existing since the test was introduced by `781caea` (2026-06-11).

### [Medium][100%] TD-005 — Console/error separation E2E never asserts target records or categories

- **Source bundle:** `bundle_tests_docs.md`
- **Location:** `tests/e2e/e2e-console-errors.spec.ts:11-37`, `tests/e2e/e2e-console-errors.spec.ts:42-76`, `tests/e2e/e2e-console-errors.spec.ts:83-122`

**Evidence:** - The first scenario injects explicit console and error markers (`tests/e2e/e2e-console-errors.spec.ts:19-37`), but the declared popup card locators are never asserted (`tests/e2e/e2e-console-errors.spec.ts:42-44`). - If either target tab is invisible, its verification block is silently skipped (`tests/e2e/e2e-console-errors.spec.ts:59-76`). If visible, the test checks only whole-page HTML length, not marker presence or classification. - The second scenario injects five distinct console levels (`tests/e2e/e2e-console-errors.spec.ts:91-98`) but again conditionally skips the console tab and only …

**Impact:** Missing tabs, dropped console records, dropped runtime errors, or swapped console/error routing can all pass. The test name promises category separation but verifies only that a non-trivial dashboard document rendered.

**Recommendation:** Require both tab controls to be visible. Assert each unique marker in the expected tab and absent from the wrong tab, using data-backed selectors or exported records if virtualized UI makes text assertions unstable. Assert console levels and error event category/type explicitly.

**History:** Pre-existing since `eda22a3` (2026-06-09); all cited weak assertions trace to the original file.

### [Medium][100%] TD-006 — Active nonce security spec contradicts t121 HMAC behavior

- **Source bundle:** `bundle_tests_docs.md`
- **Location:** `docs/specs_index.md:12`, `docs/specs/content_postmessage_nonce.md:3-18`, `docs/specs/content_postmessage_nonce.md:20-23`, `src/extension/content/network_hook.ts:430-452`, `src/extension/content/websocket_capture.ts:189-205`, `src/extension/content/storage_capture.ts:159-175`, `src/extension/content/content_hmac.ts:1-5`, `src/extension/content/content_hmac.ts:128-145`, `tests/unit/content_hmac_vectors.test.ts:29-77`, `tests/unit/content_postmessage_nonce.test.ts:94-124`

**Evidence:** - `docs/specs_index.md:12` marks `content_postmessage_nonce` as the current active spec for both t097 and t121. - The spec describes nonce equality as the receiver's authentication check (`docs/specs/content_postmessage_nonce.md:7-12`) and says stronger per-message HMAC is outside the spec (`docs/specs/content_postmessage_nonce.md:18`). Its implementation/test references list only nonce behavior (`docs/specs/content_postmessage_nonce.md:20-23`). - Current production creates a per-start secret that is not written to `window`, then requires both nonce equality and `verify_payload(...)` for netwo …

**Impact:** The active requirements source materially understates protection and misstates the current trust boundary. Future maintenance based on the spec could remove HMAC as “out of scope,” omit signature lifecycle requirements, or create tests that accept nonce-only messages.

**Recommendation:** Update the active spec to define the combined nonce + per-start secret + per-message HMAC contract, including: - secret generation and non-exposure via `window`; - canonical payload and signature coverage; - rejection of missing, malformed, mismatched, or stale signatures; - stop/start and extension-reload lifecycle behavior; - all three channel implementations and both HMAC/nonce test suites. If  …

**History:** The spec is unchanged from `6774a80` (t097, 2026-08-11). Commit `849b739` (t121, 2026-08-11) added HMAC implementation/tests and associated the task with this spec in `docs/specs_index.md`, but did not update the spec body.

### [Medium][100%] TD-007 — Public English/privacy docs retain obsolete shared user-token model

- **Source bundle:** `bundle_tests_docs.md`
- **Location:** `README.en.md:38-46`, `README.en.md:60-67`, `README.en.md:134-160`, `PRIVACY.md:39-45`, `SECURITY.md:34-42`, `src/bridge/config.ts:137-157`, `src/extension/background/service_worker.ts:1259-1275`, `.mcp.json.example:1-14`

**Evidence:** - `README.en.md:45` says Bridge authorization uses a user-supplied token, and `README.en.md:67` says extension, Bridge, and MCP must use the same token. - `PRIVACY.md:41` repeats that Bridge requires a user-provided Bearer token. - The same English README later correctly documents zero-config operation: Bridge generates/persists an MCP token, extension auto-enrolls, and MCP reads the token file (`README.en.md:134-160`). The document therefore contradicts itself. - `SECURITY.md:38-42` defines the current two-token model: MCP token protects MCP/CDP routes; per-extension `instance_token` protects …

**Impact:** Users may search for a token they do not need, place the MCP token into extension settings unnecessarily, or misunderstand route isolation and privacy boundaries. Contradictory authentication documentation is particularly harmful in a local data-capture product because it affects threat-model and se …

**Recommendation:** Replace the obsolete sentences with the same two-token, zero-config model used by `SECURITY.md` and the later README section. Clarify that explicit shared configuration is an advanced override, not the default, and that extension `instance_token` is issued by enrollment rather than manually copied from MCP configuration.

**History:** The stale README sentence dates to `9c9833f` and the privacy statement to `a03ac6f` (both 2026-07-14). Zero-config was introduced by `d8970e7` (2026-07-22); later documentation updates synchronized the detailed setup and `SECURITY.md` but left these earlier summary statements unchanged.

### [Medium][100%] TD-008 — Test guide describes obsolete layout, authentication, tool names, and E2E selection

- **Source bundle:** `bundle_tests_docs.md`
- **Location:** `docs/guides/test.md:48-64`, `docs/guides/test.md:77-94`, `docs/guides/test.md:96-126`, `docs/guides/test.md:140-163`, `package.json:22-39`, `.mcp.json.example:1-14`, `src/mcp/tools.ts:9-31`, `playwright.config.ts:95-102`

**Evidence:** - The guide says unit and E2E tests are flat under `tests/`, with `tests/fixtures` and `tests/helpers` (`docs/guides/test.md:48-64`). Current layout is `tests/unit`, `tests/e2e`, and `tests/support`; `package.json:36` starts `tests/support/fixtures/server.ts`. - It says MCP requires `CAPTURE_ALL_BRIDGE_TOKEN`, is registered through `.claude/settings.json`, and exposes internal command names such as `capture.start`, `captures.list`, and `data.list` among “12 tools” (`docs/guides/test.md:96-126`). Current `.mcp.json.example` omits a token and loads the MCP artifact; public MCP names are defined  …

**Impact:** Developers following the guide hit missing paths, configure obsolete credentials, call non-existent MCP tool names, and believe critical E2E scenarios run when they do not. This directly impairs reproducible verification and can conceal TD-001.

**Recommendation:** Regenerate the guide's repository tree and command table from current `package.json` and Playwright config. Replace MCP setup with `.mcp.json.example`, zero-config token resolution, and the public tool names from `MCP_TOOL_NAMES`. Remove claims that unmatched files are included; ideally link to an automated E2E coverage manifest produced by the discovery guard recommended in TD-001.

**History:** Most stale sections came from archived omni documentation (`5d15d01` / `ac8800a`, 2026-07). Commit `6af4a44` (2026-07-20) fixed selected guide details but left these layout, token, tool, and project-match statements stale.

### [Medium][100%] TD-009 — Contributor guide contains contradictory source layout and unusable Bridge/test commands

- **Source bundle:** `bundle_tests_docs.md`
- **Location:** `docs/guides/contributing_dev.md:51-99`, `docs/guides/contributing_dev.md:142-163`, `docs/guides/contributing_dev.md:198-213`, `docs/guides/contributing_dev.md:216-226`, `src/bridge/main.ts:4-14`, `package.json:32-38`

**Evidence:** - The tree lists `src/agent`, `src/background`, `src/content`, `src/dashboard`, `src/devtools`, and `src/popup` (`docs/guides/contributing_dev.md:53-65`), then immediately claims it describes the current `src/{extension,bridge,mcp,shared}` structure (`docs/guides/contributing_dev.md:78`). The module summary continues using old `background/`, `content/`, and `agent/` locations (`docs/guides/contributing_dev.md:80-99`). - The Bridge command omits required `--port`, while its health check targets port 3000 (`docs/guides/contributing_dev.md:142-150`). `src/bridge/main.ts:7-12` throws `Invalid brid …

**Impact:** A new contributor cannot start Bridge with the documented command, probes the wrong port, and receives file-not-found/no-test results from copied test commands. The contradictory tree also encourages new code in paths that no longer own those responsibilities.

**Recommendation:** Replace the tree and module map with actual `src/extension/{background,content,dashboard,devtools,popup}`, `src/bridge`, `src/mcp`, and `src/shared` paths. Use `npm run bridge -- --port 17831` (or the project's exact supported syntax) and probe `http://127.0.0.1:17831/health`. Update all test examples to `tests/unit/...` and ensure imports match current relative paths.

**History:** The stale structure and commands originate mainly from `0d73bcc` (2026-07-16). `6af4a44` (2026-07-20) updated the tests subtree and added the current-layout note but did not replace the contradictory source tree or commands.

### [Medium][99/100 - perspectives：P3 Protocol/Spec、P6 Docs/Config] BM-M003 — 官方 MCP 指南的导出路径示例必失败，64MiB 故障说明也已反转

- **Source bundle:** `bundle_bridge_mcp.md`
- **Location:** - `docs/guides/mcp_usage.md:54-71` - `docs/guides/mcp_usage.md:95-106` - `src/bridge/server.ts:504-508,537-548,817-848` - `src/extension/background/agent_bridge_client.ts:321-348` - `tests/unit/t137_bridge_security.test.ts:59-97`

**Evidence:** 1. 指南示例给出绝对路径 `"/absolute/path/export.json"`：`docs/guides/mcp_usage.md:60-66`。 2. Bridge 现在在 target 解析前调用 `safe_output_path`，绝对路径解析到 export dir 外会返回 `INVALID_QUERY`：`src/bridge/server.ts:504-508,841-844`。 3. t137 测试明确断言 `/etc/cron.d/evil` 等绝对路径被拒：`tests/unit/t137_bridge_security.test.ts:66-79`。 4. 指南还称超过 64MiB 后 Bridge 返回 413、MCP 等待超时：`docs/guides/mcp_usage.md:97-100`。 5. 当前扩展在发送前估算，改写为小型 `PAYLOAD_TOO_LARGE` AgentCommandResult 并投递：`src/extension/background/agent_bridge_client.ts:321-345`。MCP 应收到结构化失败结果，不再等待原命令超时。

**Impact:** - 用户复制官方唯一导出示例即失败。 - 排查大结果时会依据错误的 413/超时模型定位，忽略实际结构化错误。 - 文档误导触达核心 MCP 导出路径，故高于普通文字瑕疵。

**Recommendation:** - 示例改为 export dir 内相对路径，如 `"output_path":"exports/export.json"`，或更直接使用 `"output_path":"export.json"`。 - 明确路径相对 `CAPTURE_ALL_EXPORT_DIR`，拒绝绝对路径、`..` 与 symlink escape。 - 更新 64MiB 条目：扩展侧将超限结果改写为 `PAYLOAD_TOO_LARGE`，Bridge 正常接收该小结果；说明原命令副作用不可回滚。

**History:** 代码修复后文档漂移**。原指南为 2026-07 文本；路径约束由 t137 引入，64MiB 扩展侧预检由 t140 引入。

### [Medium][99] EXTUI-004 — SPA navigation misses `pushState`/`replaceState` and labels back/forward as `push_state`

- **Source bundle:** `bundle_extension_ui.md`
- **Location:** - `src/extension/content/content_script.ts:161-210` - `src/shared/types.ts:266-274` - `tests/unit/tab_events.test.ts:239-288`

**Evidence:** The content script listens only for `popstate` and `hashchange`. Native `history.pushState()` and `history.replaceState()` do not dispatch `popstate`, so normal client-side SPA route changes produce no `route_change` event. Conversely, actual `popstate` events from browser back/forward are emitted with `route_action: 'push_state'`, which is semantically false. A direct reproduction is a capturing page calling `history.pushState({}, '', '/next')`: URL changes, neither registered handler fires, and no route event is sent. Calling `history.back()` later invokes `handle_popstate_navigation()` and  …

**Impact:** Modern SPA timelines omit primary route transitions and misdescribe history traversal, weakening causal debugging around route-triggered network/UI activity.

**Recommendation:** Patch `history.pushState` and `history.replaceState` in MAIN world using the existing authenticated page-script channel pattern; restore patches on stop. Extend `RouteChangeData.route_action` with a back/forward value, or use a separate navigation trigger field. Add browser/jsdom behavior tests for push, replace, back, duplicate URL, stop, and restart.

**History:** Pre-existing since `c76d228f` (`2026-06-08`); previously reported and not covered by t155. ---

### [Medium][99] EXTUI-005 — `all_frames` capture collapses most iframe events to `frame_id=0`

- **Source bundle:** `bundle_extension_ui.md`
- **Location:** - `src/extension/manifest.json:21-27` - `src/extension/content/content_script.ts:28-39` - `src/extension/content/content_script.ts:111-149` - `src/extension/content/content_event_utils.ts:20-35` - `src/shared/event_utils.ts:32-64` - representative producer: `src/extension/content/mouse_capture.ts:85-93`

**Evidence:** The manifest injects content scripts into all frames. `content_script.ts` creates a nonzero random ID for an iframe, but only its own navigation/lifecycle `send_capture_event()` supplies that value. Capture modules receive capture ID, epoch, tab ID, and sender—not frame ID. Their `create_content_event()` calls omit `frame_id`, and `create_base_event()` defaults it to zero. Thus an iframe click, key, input, focus, storage-hook event, or fallback network event is stored with the same frame ID as the top document. `top_frame_url` helps only when same-origin access succeeds and does not provide fr …

**Impact:** Events from multiple frames cannot be reliably attributed or ordered by frame. Selectors/XPaths are ambiguous across frames, and agent queries that expose `frame_id` return misleading data.

**Recommendation:** Use Chrome's authoritative `sender.frameId` where possible, or assign one per content-script instance and pass it through the shared capture-state parameters into every `create_content_event()`. Do not use random IDs when platform frame IDs are available. Add top-frame, same-origin iframe, and cross-origin iframe tests.

**History:** Pre-existing from the original content implementation; previously reported as H1/Info in earlier reviews and still unresolved. ---

### [Medium][99] EXTUI-006 — Captured CSS selectors are syntactically invalid or point to the wrong element

- **Source bundle:** `bundle_extension_ui.md`
- **Location:** - `src/extension/content/dom_capture.ts:39-80` - `src/extension/content/mouse_capture.ts:59-75` - `src/extension/content/keyboard_capture.ts:36-47` - `src/extension/content/focus_capture.ts:44-49` - `tests/unit/dom_utils.test.ts:1-39`

**Evidence:** `dom_capture.get_nth_of_type()` counts only siblings with the same tag but emits `:nth-child(n)`, which counts all element children. For `<div><span></span><input></div>`, the input is the first input but second child; generated `input:nth-child(1)` does not match it. IDs and class tokens are interpolated without `CSS.escape()` in DOM, mouse, keyboard, focus, form, and scroll selector helpers. IDs such as `a:b` or classes containing CSS punctuation produce a selector with different meaning or a `querySelector` syntax error. Tests only validate XPath single-quote escaping. They do not execute g …

**Impact:** Recorded target metadata cannot reliably locate the original element for debugging, replay, or agent explanation. This is especially harmful for iframe data already lacking frame identity.

**Recommendation:** Use `:nth-of-type(n)` with the current counter or compute the all-child index for `:nth-child`. Escape identifier components with `CSS.escape()`. Consolidate selector generation into one tested helper consumed by all producers. Round-trip test `document.querySelector(generated) === target`.

**History:** The DOM bug dates to `ccfdd6be` (`2026-06-03`); unescaped selectors are similarly pre-existing. Previous M6 remains valid. ---

### [Medium][99] EXTUI-007 — Fallback fetch records `Request` objects with the wrong HTTP method

- **Source bundle:** `bundle_extension_ui.md`
- **Location:** - `src/extension/content/network_hook.ts:232-270` - `src/extension/content/network_hook.ts:444-492`

**Evidence:** The MAIN-world wrapper computes method solely from `init.method || 'GET'`. For `fetch(new Request('/api', { method: 'POST' }))`, `init` is undefined, so the emitted fallback record says `GET` even though the browser sends `POST`. The receiver accepts that value and persists it as a `fallback_hook` network request. Tests cover response body gates/caps and authenticated postMessage delivery, but no test invokes `build_page_script` with a `Request` carrying its own method.

**Impact:** Fallback network records can contradict the real request, misleading method-based filtering, archive inspection, and request/response debugging.

**Recommendation:** Resolve method as `init?.method ?? (input instanceof Request ? input.method : 'GET')`, normalize case if required, and add GET/POST `Request` plus `init.method` override tests.

**History:** Pre-existing since fallback hook commit `c4e98514` (`2026-06-07`). ---

### [Medium][99] EXTUI-009 — Core Popup and Settings switches are pointer-only custom controls

- **Source bundle:** `bundle_extension_ui.md`
- **Location:** - `src/extension/popup/popup.ts:130-143,148-170,308-325` - `src/extension/dashboard/dashboard_settings.ts:18-23,55-80,95-109,190-196` - `tests/unit/wcag_contrast.test.ts:1-97`

**Evidence:** Popup category gates are clickable `<div class="mcard-toggle">` elements with no `role`, `tabindex`, keyboard listener, accessible name, or `aria-pressed`. Recent capture rows and “View All” are `<a>` elements without `href`, also wired only to click. Dashboard settings switches are clickable `<span class="switch" data-sw>` elements with the same omissions. These include sensitive capture, response body, input values, redaction, export save-as, and Bridge enablement settings. Tabbing through either page cannot focus these controls; Enter/Space cannot activate them. Existing WCAG tests validate …

**Impact:** Keyboard-only and assistive-technology users cannot operate primary capture gates or settings. Visual state is not announced, including privacy-sensitive switches.

**Recommendation:** Render native `<button type="button" aria-pressed>` or checkbox/switch inputs with labels. Use real `<button>` for recent rows/View All unless navigation uses a real `href`. Preserve visible focus styles and test Tab + Enter/Space plus announced state.

**History:** Popup controls predate current review (`4d01d430`); Dashboard switches date to `ac8fefe9`. No active task found for this accessibility gap. ---

### [Medium][98%] TD-004 — Realtime detail “growth” test permits zero growth

- **Source bundle:** `bundle_tests_docs.md`
- **Location:** `tests/e2e/e2e-realtime-detail.spec.ts:49-74`, `docs/guides/test.md:173-178`

**Evidence:** The test title/comments state that it verifies t1-to-t2 realtime growth and waits across dashboard/SW refresh cycles (`tests/e2e/e2e-realtime-detail.spec.ts:49-69`). Its assertion is `toBeGreaterThanOrEqual(ev_count_t1)` (`tests/e2e/e2e-realtime-detail.spec.ts:70-73`), so an unchanged event count passes. The following comment incorrectly claims that quantity change has been verified (`tests/e2e/e2e-realtime-detail.spec.ts:74`). The project test guide itself says “increase” and “decrease” must use strict comparisons (`docs/guides/test.md:173-178`).

**Impact:** Stopping the dashboard refresh interval, SW flush propagation, or detail re-render after t1 can remain green as long as existing rows do not disappear.

**Recommendation:** After taking t1, trigger a deterministic new event carrying a unique marker. Poll the detail data/UI until that marker appears, then require both marker presence and `ev_count_t2 > ev_count_t1`. Avoid relying on incidental background activity from a public website.

**History:** Pre-existing. The non-strict assertion was introduced in `8b3c56f` (2026-06-14), whose commit message described it as “strict” despite implementing `>=`.

### [Medium][97] EXTUI-008 — Timeline lane drags lack cancellation cleanup; blank-area drag updates detached DOM

- **Source bundle:** `bundle_extension_ui.md`
- **Location:** - `src/extension/dashboard/dashboard_detail.ts:663-729` - `src/extension/dashboard/dashboard.ts:136-145` - `tests/unit/dashboard_timeline_marker.test.ts:299-345,485-497`

**Evidence:** Marker drag sets global `_tl_dragging=true`, but cleanup is registered only for `pointerup`. `pointercancel`, `lostpointercapture`, blur, or leaving the window never removes the `pointermove` listener or resets `_tl_dragging`. Dashboard live-detail polling then permanently skips refresh because it gates on `!router.is_tl_dragging()`. The minimap path has robust pointer capture and cancellation cleanup, and its test covers `pointercancel`; the lane-marker path does not. The existing cancellation test therefore proves only the separate minimap implementation. For non-marker lane drag, code calls …

**Impact:** A normal OS/browser pointer cancellation can stop live detail refresh for the rest of the page lifetime. Blank-area dragging appears broken or discontinuous and may leak window listeners until pointerup.

**Recommendation:** Use pointer capture and one idempotent `finish_drag()` for `pointerup`, `pointercancel`, `lostpointercapture`, and window blur. Set/reset `_tl_dragging` for both lane branches. Do not re-render before drag completion; update live nodes, then render once on finish. Add lane-specific cancellation and visual playhead movement tests.

**History:** Base lane logic is pre-existing (`36be1fb9`/`ac8fefe9`). Commit `17cde0d` added the global drag gate without cancellation cleanup, increasing impact. Minimap cancellation was fixed separately in t154. ---

### [Medium][96/100 - perspectives：P3 Protocol/Spec、P5 Error Handling/Observability、P6 Docs/Config、P7 Test Quality] BM-M004 — 启动探测把目标端口任意 HTTP 2xx 服务误判为 Capture All Bridge

- **Source bundle:** `bundle_bridge_mcp.md`
- **Location:** - `src/bridge/main.ts:14-19` - `src/bridge/config.ts:160-171` - `.claude/settings.json:28-34` - `src/bridge/server.ts:42-43`

**Evidence:** - `is_bridge_healthy` 对 `${bridge_url}/health` 只返回 `response.ok`：`src/bridge/config.ts:163-170`。 - main 看到 true 就打印“capture-all bridge already listening”并正常退出：`src/bridge/main.ts:14-19`。 - SessionStart hook 也只检查 `/health` HTTP code 200：`.claude/settings.json:33`。 - 无响应 JSON 产品标识、bridge version、特征 header 或 token challenge 校验。 可观察输入：在配置端口运行任意服务，使 `/health` 返回 200。随后启动 Bridge。实际结果不是明确 `EADDRINUSE` 或“端口被非 Capture All 服务占用”，而是静默宣称 Bridge 已运行并退出；后续 MCP 对错误服务调用失败。

**Impact:** - 常见端口碰撞导致 Bridge 无法启动，错误信息与根因相反。 - hook 可能长期不拉起真正 Bridge，MCP 初始化表现为鉴权/路由/JSON 错误。 - 运维诊断成本高，但不造成安全越权，故 Medium。

**Recommendation:** - `/health` 返回稳定产品标识与版本，例如 `{ok:true, service:"capture-all-bridge", bridge_version:"0.1.0"}`。 - `is_bridge_healthy` 校验 status、Content-Type、完整标识；解析失败视为端口冲突，不视为已运行。 - main 对“端口有 2xx 非本服务”输出明确错误并非零退出。 - SessionStart hook 复用同一探测脚本，避免 shell 逻辑漂移。 - 新增“任意 200 服务不算健康”的 config/main 测试。

**History:** 预存**。main/config 判断来自 `c6afa690`；2026-08-13 仅补 3s timeout，未增加身份校验。

### [Medium][95%] SEC-004 — capture 未开始时 content script 仍记录访问 URL 到持久化 app logs

- **Source bundle:** `bundle_security.md`
- **Location:** `src/extension/manifest.json:16,21-27`; `src/extension/content/content_script.ts:25-41,43-61,225-251`; `src/shared/logger.ts:14-18,97-149,160-180`; `src/extension/background/service_worker.ts:103-108,279-295,363-370`; `src/shared/constants.ts:68-69`

**Evidence:** 1. content script 在 `<all_urls>`、`document_start`、所有 frame 注入（manifest）。 2. 模块加载时、任何 capture 状态检查之前执行 `logger.info('Content script loaded', { url: window.location.href })`（`content_script.ts:25-41`）。 3. Logger 模块全局默认 level 是 `debug`（`logger.ts:14-18`；用户默认也为 `debug`），所以 info 条目进入 `MessageLogTransport` buffer。content stop 才显式 flush；累计 20 条也自动发送（`logger.ts:160-180`）。 4. Service Worker 收到 `app_log_batch` 后逐条写持久化 transport（`service_worker.ts:363-370`）。SW 启动/设置只在自己的 JS world 调用 `Logger.set_level`；没有消息把用户 log level同步给各 content world，因此用户改成 warn/silent 也不控制 content Logger。 5. `sanitize_string` 会脱敏 URL …

**Impact:** 用户未开始 capture 时，访问过的页面 URL（包括 iframe URL）仍可进入扩展诊断日志并保留到日志容量淘汰/用户清理。普通浏览路径、内部系统资源 ID、hash route，及 fragment credential 可能落盘，越过“主动开始采集”边界。是否立即落盘取决于 batch 达到 20 或后续 stop flush，因此 confidence 略低于 100%，但长期浏览通常满足条件。

**Recommendation:** 删除模块加载 URL 日志，或仅在 active capture 后记录并使用 capture 的隐私配置。将 content 的 log level从 SW/user config 明确下发，在 Logger 创建前应用；默认日志级别改为 `info`/`warn`。增加“未采集访问页面不产生 URL app log”和“设置 silent 后 content 不写日志”测试。

**History:** 长期预存。** URL 加载日志由 `6a7b094`（2026-06-09，P7 logging）引入。后续 logger 脱敏增强修复 query/credential 字段，但没有改变 capture 外记录行为或跨 world level 同步。

### [Medium][94] EXTUI-003 — Content status polling is one-shot across sessions and permits stop/in-flight restart races

- **Source bundle:** `bundle_extension_ui.md`
- **Location:** - `src/extension/content/content_script.ts:64-86` - `src/extension/content/content_script.ts:223-245` - `src/extension/shared/poll_capture_status.ts:38-82` - `src/extension/background/service_worker.ts:51-76` - `tests/unit/poll_capture_status.test.ts:42-188`

**Evidence:** `content_script.ts` creates one poll controller at module load. Once active capture is found, its timer is cleared; on stop, `stop_status_poll()` permanently sets the closure's `stopped=true`. A later capture does not create a new controller. Recovery then depends entirely on the three-attempt `tabs.sendMessage` path. Any later missed start notification has no BUG-004 polling fallback. Separately, `check_once()` does not test `stopped` after `await get_status()`. If `stop_status_poll()` runs while a status request is in flight, an already-produced active response can still call `on_active()`,  …

**Impact:** A reused page can either miss a later session or restart hooks/listeners after stop. The former recreates silent user/storage capture gaps; the latter leaves page instrumentation active while SW no longer accepts the session.

**Recommendation:** Model polling as a restartable lifecycle owned by content capture state. Re-arm it after each stop, or run a low-rate lifetime status watcher keyed by capture generation. Add an in-flight guard and check `stopped` immediately after every await and before `on_active`. Test deferred promises for stop/restart and interval overlap.

**History:** Pre-existing since BUG-004 implementation commit `30771e30` (`2026-06-14`). Previous review evidence remains applicable. ---

### [Medium][93%] ARCH-003 — Dashboard shared 同时充当全局状态仓库、数据服务与可变 service locator

- **Source bundle:** `bundle_architecture.md`
- **Location:** - `src/extension/dashboard/dashboard_shared.ts:1-109,240-378` - `src/extension/dashboard/dashboard.ts:74-99,101-137` - `src/extension/dashboard/dashboard_detail.ts:1-23` - 关联测试：`tests/unit/dashboard_detail_xss_escape.test.ts:11-17,122-125`、`tests/unit/t154_dashboard_misc.test.ts:40-43,104-106`

**Evidence:** 1. `dashboard_shared.ts:26-109` 持有约 20 个模块级可变状态，暴露成对 get/set；同文件还负责格式化、event 归一化、详情加载、archive 导出、logger 与下载（`dashboard_shared.ts:111-363`）。模块名“shared”已无法表达职责边界。 2. 文件尾定义带默认 no-op 的可变 `router`（`dashboard_shared.ts:365-373`）。`dashboard.ts` 通过赋值注入 `go/render_content/render_shell/open_detail` 以“breaks circular deps”（`dashboard.ts:95-99`），`dashboard_detail.ts` 又反向覆写 `router.is_tl_dragging`（`dashboard_detail.ts:21-23`）。 3. 未完成入口初始化时，`router.go()` 等调用不会 fail-fast，而是静默 no-op；行为依赖 import/执行顺序。`integration_page.test.ts` 必须动态 import `dashboard.ts` 才能把占位函数变成真实函数，已暴露隐式初始化契约。 4. 多个测试直接修改模块单例，并在 `beforeEach` …

**Impact:** - 页面状态、业务数据加载、渲染导航互相耦合；任何 tab/导出/轮询功能都倾向继续修改中心模块。 - service locator 的默认 no-op 会把接线错误变成静默功能失效，调试依赖模块加载顺序。 - 单例状态使测试隔离脆弱，也阻碍未来对 Dashboard 实例化、热重载或分页面懒加载。

**Recommendation:** - 最小拆分为 `dashboard_state.ts`（显式 `DashboardState` 对象与 factory/reset）、`dashboard_data.ts`（load/export）、`dashboard_format.ts`（纯函数）。不需要引入 UI 框架。 - 将 router 改为入口显式传入 controller/callbacks，或提供一次性 `wire_dashboard_router()`；未接线调用应抛明确错误，而非 no-op。 - 让测试每例创建 state/controller，不再直接共享模块单例；先覆盖现有路由与详情状态，再逐步迁移调用方。

**History:** `ac8fefe`（2026-06-22）从 1317 行 `dashboard.ts` 拆为 6 模块时形成；后续 t144/t152/t154 继续向 shared 增加网络/console 状态、router 标志和记忆状态。明确 pre-existing。

### [Medium][93%] PERF-M005 — Extension Bridge fetch 无 timeout，stop 无法取消 in-flight 请求

- **Source bundle:** `bundle_performance.md`
- **Location:** - `src/extension/background/agent_bridge_client.ts:60-89,102-188,246-349` - `tests/unit/agent_bridge_client.test.ts:473-490` - 对照：`src/mcp/client.ts:7-15,20-34,60-70` - Bridge TTL：`src/bridge/server.ts:42,71-73,126-154,450-454` - 调用链：poll → enroll / heartbeat / fetch command / send result → 原生 `fetch` 无 `signal` → 任一请求永久 pending → `poll_cycle` 不返回，后续 timer 不再安排；`stop_bridge_client` 只清已安排 timer和 lifecycle 标志，不能 abort 当前 fetch。 - 可复现证据：测试 `does not continue an in-flight poll after stop` 使用 deferred heartbeat；stop 后请求仍需测试主动 `heartbeat.resolve(...)` 才结束，证明 stop 没有取消底层请求。若 deferred 永不 resolve，client 永久停在该 await。MCP 侧同类 client 已使用 `AbortSignal.timeout`，此路径不一致。

**Impact:** loopback Bridge 异常、连接半开或响应未结束时，扩展停止 heartbeat；5 秒后 Bridge 标记 extension offline。命令队列可在 120/300 秒超时，但 extension poll 本身可能永不恢复；停用/restart client 也保留底层 socket/request 直至浏览器网络栈自行结束。

**Recommendation:** 为每个 lifecycle 建 `AbortController`，stop 时 `abort()`；enroll/heartbeat/command fetch 使用短 timeout（heartbeat 必须与 5 秒 TTL 协调），result 使用 command/full-data budget；组合 `AbortSignal.any([lifecycle.signal, AbortSignal.timeout(ms)])`。增加 timeout、stop-abort、restart 后无 stale request 的测试。

**History:** 核心 fetch 自 `f0763c03`（2026-06-06）存在；多实例和重试后仍未加 signal。长期预存。

### [Medium][92%] PERF-M007 — CDP body 预算在轮询移除事件后不减量，预算退化为累计写入量 `[CL-02]`

- **Source bundle:** `bundle_performance.md`
- **Location:** - `src/bridge/cdp_handler.ts:63-89` - `src/bridge/cdp_handler.ts:375-392` - `src/bridge/cdp_handler.ts:419-465` - `tests/unit/t140_resource_budget.test.ts:37-71` - 调用链：CDP body 回写 → `session.body_bytes += stored bytes` → poll 将 completed event 从 `session.events` 移除并返回 → 未扣除返回事件 body bytes → 后续新 body 再累加 stale total → `enforce_body_budget` 基于累计历史值淘汰当前队列事件。 - 可复现证据：构造两条带 body completed events，先令 `body_bytes` 等于两者总和，调用 `handle_cdp_events` 返回并移除它们；代码只执行 `session.events = pending.concat(remaining_completed)`，没有减少 `body_bytes`。下一批事件到达后预算仍包含已交付、已不可达的 body。现有测试直接手工调用 `enforce_body_budget`，没有覆盖 poll 后记账。

**Impact:** 持续 CDP 会话即使消费者及时把队列拉空，也会永久处于高 `body_bytes`；后续新事件可能被错误淘汰，预算不再表达当前驻留内存。`handle_cdp_events` 还每次扫描最多 5000 events，创建 completed/pending/slice/concat 多个数组，形成持续 O(N) 分配。

**Recommendation:** 移除 `to_return` 时按实际存储 `response_body` UTF-8 字节扣减，统一封装 `remove_events` 以保证 event-count 和 body-byte 两套记账同步；增加“poll 后 body_bytes 回到 0”和“后续事件不误淘汰”测试。进一步将 pending/completed 分队列或使用 deque/ring buffer，避免每 poll 重建全部数组。

**History:** poll 移除逻辑自 `c4e98514`（2026-06）存在；body 聚合预算由 `51e0843c`（2026-08-12，t140）加入时未同步修改移除路径。属于近期资源预算实现缺口。

### [Medium][91%] ARCH-004 — Bridge HTTP server 以单一 553 行闭包路由承载全部控制面

- **Source bundle:** `bundle_architecture.md`
- **Location:** - `src/bridge/server.ts:52-604`（`create_bridge_server`） - 重点职责段：状态/路由 `:53-155`、pair/enroll `:157-351`、认证 `:353-384`、heartbeat/command/result `:386-498`、MCP/file spill `:500-554`、CDP `:556-579` - 测试：`tests/unit/agent_bridge_server.test.ts`、`tests/unit/t137_bridge_security.test.ts`

**Evidence:** 1. 粗略函数扫描显示 `create_bridge_server` 约 553 行，是 `src` 中最长函数。它闭包捕获 `instances`、`queues`、`command_owners`、`pairing_state`，同时实现 target resolution、status projection、CORS、认证、pairing、enroll/替换、heartbeat、queue、MCP 大结果落盘与 CDP 路由。 2. 相同“实例被顶替时删除 instance + cancel queue + 清 command owners”逻辑在 enroll（`server.ts:288-308`）和 heartbeat（`:406-427`）重复；安全修复必须保证两条路径同步。 3. 单一 `try/catch` 将所有 route 共享成一个错误边界（`:157-595`），route 级输入/权限/错误映射难以独立推演。CDP 已有 handler 模块，却仍与 pairing/MCP/extension route 编排混在一个函数。 4. `agent_bridge_server.test.ts` 已扩张为近 2000 行的大型端到端式单测文件，大量行为只能通过启动完整 server 验证，说明内部领域逻辑缺少可单测边界。 5. **Medium 证伪检查：** …

**Impact:** - 修改 enroll/heartbeat/认证任一逻辑需在巨型 handler 中同时理解四类 endpoint 与共享 map 生命周期，容易产生路径不对称。 - 安全敏感边界（extension token、MCP token、origin、output path）集中在高 churn 文件，review diff 难聚焦。 - 领域逻辑只能经 HTTP server 级测试驱动，增加测试成本并促使测试文件继续单体化。

**Recommendation:** - 保留一个薄 `create_bridge_server` 负责 state/context 构造与 `http.createServer`；拆出 `handle_pair_route`、`handle_extension_route`、`handle_mcp_route`、`handle_cdp_route`。 - 抽 `BridgeRegistry`（instances/queues/owners）并集中实现 `replace_instance/remove_instance`，消除 enroll/heartbeat 重复清理逻辑；注入 clock/random/file writer 以便单测。 - 每个 route handler 返回统一 `{status, body}`；server 层只做 CORS、异常映射与发送。

**History:** 初始 server handler 自 `25ba3e9`/`cfed3fe`（2026-06）即存在；多实例、pairing、file spill、zero-config、安全修复持续叠加。明确 pre-existing，且 t129 只拆指定 4 个函数，未覆盖该函数。

### [Medium][91/100 - perspectives：P2 Correctness/Lifecycle、P4 Performance/Resource、P5 Error Handling] BM-M001 — Bridge public `close()` 不取消 pending command，也不销毁 CDP sessions

- **Source bundle:** `bundle_bridge_mcp.md`
- **Location:** - `src/bridge/server.ts:52-69` - `src/bridge/server.ts:597-603` - `src/bridge/command_queue.ts:19-87` - `src/bridge/cdp_handler.ts:45,92-99` - `tests/unit/agent_bridge_server.test.ts:755-779`

**Evidence:** - `queues`、`command_owners` 是 `create_bridge_server` 闭包状态：`src/bridge/server.ts:52-55`。 - public `close` 仅执行 `server.close(callback)`：`src/bridge/server.ts:599-602`。 - 一个 `/mcp/command` handler 可正在 await queue result；timeout 上限 300000ms。未取消时 active HTTP connection 会让 close 等到结果或超时。 - `AgentCommandQueue.cancel_all()` 已能清 timer、pending、commands 并返回 `COMMAND_CANCELLED`：`src/bridge/command_queue.ts:71-87`，但 close 路径未遍历调用。 - CDP sessions 为模块全局 Map，仅 `/cdp/stop`、idle timer 等路径销毁；server close 不触达：`src/bridge/cdp_handler.ts:45,92-99`。 - 现有测试在调用 public close 前先用内部 `_server.closeAllConnections()` 强拆连接：` …

**Impact:** - 进程内关闭、测试 teardown、嵌入式重启可阻塞到命令 timeout（最长约 5 分钟）。 - outbound CDP WebSocket 与 idle timer 可在 HTTP server 关闭后继续存活，阻止进程退出或污染下一次实例。 - pending command 没有确定 `COMMAND_CANCELLED` 终态。

**Recommendation:** - public close 开始时遍历 `queues.values()` 调 `cancel_all()`，清 `command_owners`/instances。 - 从 cdp_handler 导出 `destroy_all_sessions()`，close 时关闭所有 WS、timer、映射。 - 之后再 `closeIdleConnections`/`server.close`；必要时定义有界 graceful timeout。 - 测试只调用 public close，不预先 `closeAllConnections`；断言快速完成、请求收到 `COMMAND_CANCELLED`、WS close、timer 清理。

**History:** 预存**。public close 来自首版；`cancel_all` 注释已明确“server close 时调用”，但实际未调用。

### [Medium][91%] PERF-M006 — Bridge 多实例 registry 和 queue 不清理过期实例

- **Source bundle:** `bundle_performance.md`
- **Location:** - `src/bridge/server.ts:52-73` - `src/bridge/server.ts:126-154` - `src/bridge/server.ts:332-341,429-439` - `src/bridge/server.ts:599-602` - 调用链：enroll/heartbeat → `instances.set` + `get_or_create_queue` → TTL 仅用于 `filter` online → offline instance 仍留在 `instances`、`queues`，status 每次遍历全部历史实例；除 label 顶替路径外无 delete/sweep。 - 可复现证据：创建多个不同 `instance_id` 并让 `seen_at` 超过 5 秒，`list_online` 会过滤它们，但 Map 长度不变，`build_status` 仍把全部实例映射进 `extensions`。server `close` 也只关闭监听器，没有显式 cancel queue；运行期没有 TTL 回收路径。

**Impact:** 扩展重装、session storage 清理、配置损坏或多浏览器轮换会产生新 ID；长期运行 Bridge 的 registry、queue 和 status payload 随历史实例单调增长。正常单实例 ID 持久化时增长较慢，因此定为 Medium 而非 High。

**Recommendation:** 增加过期 sweep：超过 TTL + grace 后 `cancel_all()`、删除 queue/instance、清理该 owner 的 `command_owners`。可在 enroll/heartbeat/status 懒清理，或使用 interval 并在 `close()` 清 timer；短 grace 内可保留离线展示，长期历史应单独持久化摘要而非保留运行时 queue。

**History:** 多实例 registry 由 `659c7945`（2026-07-16）引入；后续只在 label 顶替时清理。预存。

### [Medium][90%] ARCH-005 — `network_capture.handle_cdp_event` 仍是 421 行多协议状态机

- **Source bundle:** `bundle_architecture.md`
- **Location:** - `src/extension/background/network_capture.ts:27-66,369-789` - 关联模块：`src/extension/background/cdp_event_router.ts`、`cdp_handler.ts`、`stream_buffer.ts`、`network_webrequest.ts` - 历史范围说明：`docs/archive/tasks/t129_split_long_functions/spec.md:3-18`

**Evidence:** 1. `handle_cdp_event()` 在同一函数内处理：sub-target attach/detach（`:373-409`）、HTTP request/redirect（`:420-480`）、response/stream detection（`:482-539`）、loadingFinished/body 异步生命周期（`:548-700`）、loadingFailed（`:702-711`）、WebSocket connection/frame 生命周期（`:713-788`）。粗略扫描约 421 行。 2. 函数直接读写至少 7 组模块级状态：`cdp_request_meta`、`cdp_body_results`、`streaming_requests`、`finished_before_stream`、`ws_connections`、deferred/orphan state、capture globals（`network_capture.ts:27-66`）。 3. 文件头称“Delegates to specialized handlers”，也已 import `cdp_event_router`、`stream_buffer`、`network_webrequest`、`cdp_handler`；但核心协议分派与状态转换仍集中在 orches …

**Impact:** - 新增/修复任一 CDP 终态必须同时维护多个 Map/Set 清理不变量；遗漏一个 terminal path 即产生跨 capture 串写、内存残留或事件缺失。 - HTTP streaming 与 WebSocket 共享大 dispatcher，测试需要构造复杂全局状态，降低局部修改可信度。

**Recommendation:** - 先引入显式 `NetworkCaptureContext` 包装当前 Map/Set 与 capture generation，不改行为；再按 method family 拆 `handle_target_event`、`handle_http_event`、`handle_websocket_event`。 - 将 request lifecycle 收敛为单一 record/state transition API，集中 `finalize/cleanup`，避免每条异步分支手工删除多个集合。 - 保留现有生产接线测试，并增加 terminal-path table test，逐项断言相关 state 均清空。

**History:** 主 dispatcher 自 2026-06 初期存在；`855a9c4`（2026-07-16）虽抽 specialized modules，核心函数仍保留。随后多个 correctness task 在其上增补守卫。明确 pre-existing。

### [Medium][90%] RT-006 — attempt reserve 可在 start 之前执行，产生无 worktree 的孤儿 running identity

- **Source bundle:** `bundle_repo_tooling.md`
- **Location:** `scripts/repo_template/repo_task/control.py:115-117`；`attempts.py:190-246`（`reserve_attempt`）；`tests/repo_template/test_task_start_flow.py:1796-1807`

**Evidence:** 1. `cmd_attempt_reserve`（`control.py:115-117`）只做 `require_primary_worktree()` + `reserve_attempt(...)`，不检查 task 是否已 `start`。 2. `reserve_attempt`（`attempts.py:190-246`）在 `TASKS_DIR` 存在时校验 tid 存在且未归档（`:198-207`），但**不校验 status 是否为 active、不校验 worktree 是否已登记**——backlog 状态即可 reserve。 3. `test_task_start_flow.py:1796-1807`（`test_attempt_reserve_and_start_are_separate_events`）明确演示 reserve-before-start 是受支持的顺序（ledger 事件序 `attempt_reserved, start`）。 4. 若 reserve 后 `start` 失败（分支/路径冲突、磁盘满、文档校验失败），identity 已以 `state=running` 写入 ledger，但没有对应 worktree/分支；`_require_exact_current`（`attempts.py:150-165`）挡住该 ti …

**Impact:** 崩溃/乱序调用留下孤儿 running identity，阻塞该 tid 后续执行直到人工介入；多会话并发下掩盖真实执行状态，与控制面「exact identity」的严谨性不符。

**Recommendation:** `reserve_attempt` 增加 start 门禁：task 有效状态必须为 `active` 且 worktree 已登记（`worktree_paths()` 含 `effective_worktree`）；或允许 backlog reserve 但要求 `start` 事件已存在于 ledger。补「reserve 后 start 失败 → identity 自动失效或可一键清理」路径。

**History:** 预存。** `ea0ff5c` 引入；`test_attempt_reserve_and_start_are_separate_events` 同 commit 固化顺序弹性。

### [Medium][90%] RT-011 — 原生 Windows 上空 lock 文件上 `msvcrt.locking` 失败，`id_lock` 不可用

- **Source bundle:** `bundle_repo_tooling.md`
- **Location:** `scripts/repo_template/_id_scan.py:71-78`（`_lock_fh`）、`:89-99`（`id_lock`）；对照 `repo_task/ledger.py:95-108`（`_with_lock`，`:99-101` 注释）、`repo_task/integration.py:497-500`（`_chain_locked`）

**Evidence:** 1. `id_lock`（`_id_scan.py:94`）以 `open(lock_path, "w")` 打开——生成**空文件**且从不写入字节；`_lock_fh`（`:75`）随即 `msvcrt.locking(fd, LK_LOCK, 1)` 锁定 1 字节。Windows 上锁区超出 EOF 会抛 `OSError`。 2. 仓库内另两处锁实现都先写 1 字节再锁：`ledger.py:99-102`（写入 `\0` 后 `_ledger_lock_fh`），`integration.py:498-500`（同模式）；`ledger.py:99-101` 注释明确写着「空 lock 文件上 Windows msvcrt.locking(1 字节) 会失败，先写入 1 字节」——`_id_scan.id_lock` 遗漏了同一处理。 3. 影响面：`pending.py new`、`findings.py new`、`spikes.py new` 在原生 Windows 上全部失败（`os.name == "nt"` 分支遍布全仓库，平台是被支持的）。WSL/Unix 走 fcntl 不受影响，故当前主环境可绕过。

**Impact:** 模板消费方在原生 Windows 运行即踩；取号锁失败 → 并发取号保证（`conventions.md:10` 承诺）在 Windows 上直接失效。

**Recommendation:** `id_lock` 照抄 `ledger._with_lock`：`open(lock_path, "a+")`，`tell() == 0` 时写 `\0` 再锁。补 Windows 路径注释或抽象共享锁 helper 消除三份重复。

**History:** 预存。** `ea0ff5c` 引入；`b6c03aa` 同步未修。

### [Medium][85%] RT-007 — 派生 index 写非原子，并发 rebuild 可落盘损坏 JSON

- **Source bundle:** `bundle_repo_tooling.md`
- **Location:** `scripts/repo_template/repo_task/store.py:146-173`（`rebuild_index`，写点 `:169-172`）；`repo_task/goal.py:95-97`（同模式）；`repo_task/integration.py:350-364`（`_commit_index` 依赖）

**Evidence:** 1. `rebuild_index` 对 `docs/tasks_index.json` 与 `docs/archive/tasks_index.json` 直接 `path.write_text(json.dumps(...))`——truncate + 整块写，**无临时文件 + `os.replace` 原子替换**。`goal.py:95-97` 写 `goal_queue.json` 同模式。 2. 崩溃（SIGKILL/断电）于写入中途 → 截断/半写 JSON 落盘；随后 `_commit_index`（`:353-363`）`git add` + commit 把损坏文件固化进 main 历史。 3. 多会话并发（RT-004 不互斥）同时 `rebuild_index` → 交错 truncate/write → 损坏概率显著上升。 4. 程序侧无读 index 的消费方（`scan_tasks()` 直接扫目录；index 只被 git diff/排除清单/人引用——已 `grep` 确认），因此损坏影响限于版本库垃圾与 merge 冲突处置时的报错，但「派生缓存撞了重建」的承诺在崩溃/并发下不成立。

**Impact:** 截断 JSON 进入版本库；冲突处置中依赖「脚本重建覆盖」的路径可能读到坏文件报错；审计历史被垃圾 commit 污染。

**Recommendation:** 与 `_write_chain_tx`（`:509-523`）同模式：写 `.tmp` + `os.replace`；`_commit_index` 前校验 JSON 可解析，解析失败拒绝 commit。`goal_queue.json` 同样处理。

**History:** 预存。** `ea0ff5c` 引入。

### [Medium][85%] RT-008 — `edit` 多文件反向边更新非原子，中途崩溃留半同步冲突边

- **Source bundle:** `bundle_repo_tooling.md`
- **Location:** `scripts/repo_template/repo_task/lifecycle.py:230-259`（反向边计算）、`:321-325`（写盘序列：先 peers 循环、再 owner、再 `rebuild_index`）

**Evidence:** 1. `cmd_edit` 修改 `conflicts_with` 时，把每个 peer 的反向边 front matter 更新收集进 `peer_updates`，随后 `:321-322` 逐个 `write_front_matter(peer_path, ...)`，`:323` 再写 owner，`:324` `rebuild_index`。 2. 任一步崩溃（写盘中途进程死亡）→ 部分 peer 已加反向边、owner 未写（或反之）→ 双向冲突边单向残留。调度图 `scheduling.py:75-77` 按「并集」双向展开冲突，残留单边会让 `view`/`start` 的冲突判定与声明不一致。 3. 恢复途径只有人工核对多个 front matter；无自动修复命令。测试只覆盖完整成功路径（`test_task_start_flow.py:1316-1388`），无中途失败用例。

**Impact:** 崩溃后调度图脏数据残留，`conflicts_with` 声明与生效行为不一致；多会话并发编辑同 task 时窗口放大。

**Recommendation:** 先在内存完成全部新 front matter 内容，再一次性顺序落盘（owner 最后）；或引入「同步反向边」幂等命令供恢复。对每个 front matter 写盘用临时文件 + rename，降低半写风险。

**History:** 预存。** `ea0ff5c` 引入。

### [Medium][82%] ARCH-007 — lifecycle 是持久化内部分类，但所有“全量”读取/导出路径均不可达

- **Source bundle:** `bundle_architecture.md`
- **Location:** - 写入：`src/extension/background/service_worker.ts:517-533,765-783` - store/query：`src/extension/background/storage.ts:116-120,558-564` - 遗漏读取：`src/extension/shared/capture_data_reader.ts:13-35`、`src/extension/background/exporter.ts:76-155`、`src/extension/background/agent_data_queries.ts:14-99` - 契约：`docs/blueprint/domain.md:51-57`、`docs/archive/specs/data_model.md:152,168`、`docs/archive/specs/export.md:7-10`、`docs/archive/specs/mcp_server.md:24,80-85` - 测试：`tests/unit/storage_helpers.test.ts:100-143,170-184`

**Evidence:** 1. start/stop 会真实写 `capture_started` / `capture_stopped` 到 `capture_lifecycle_events`（`service_worker.ts:517-533,765-783`），store 与 `get_lifecycle_events()` 均存在。 2. 全仓生产调用搜索中，`get_lifecycle_events()` 除定义外无消费者。测试仅断言函数存在与常量字符串，未验证任一产品路径返回 lifecycle（`storage_helpers.test.ts:134-136,183`）。 3. 页面快照接口没有 lifecycle 字段；background exporter 的 7 类 `Promise.all` 不读取 lifecycle；Agent `ALL_SOURCES` 与 `load_agent_capture_data` 也只含 7 类。因此 Dashboard/Popup archive、JSON/JSONL/HTML/HAR 与 MCP `get_all_capture_data` 均无法获得这类已持久化事件。 4. domain 明确内部有 9 类，`capture_lifecycle` 只是不在 UI 标签展示（`domain.md:51-57`），不等于从导出/MCP 过滤。MC …

**Impact:** - lifecycle store 占用 schema 与写入成本，却无法从公开查询/归档恢复；采集开始配置快照、停止原因和最终统计等诊断证据只留在本地孤立 store。 - “内部分类”“所有事件”“不自动过滤”与实际七源 API 不一致，调用方无法判断 lifecycle 是遗漏、元数据还是有意隐藏。

**Recommendation:** - 先做契约决策：若 lifecycle 属完整采集证据，将其加入 `CaptureSnapshot`、export event 合并与 Agent source（建议 `capture_lifecycle_events`），仍可不在 UI 标签展示。 - 若 lifecycle 只作内部实现细节，则在 domain/export/MCP spec 明确排除，评估是否只保留 CaptureRecord 字段并移除无消费者 query/store，避免双重真相源。 - 无论选择哪条，增加 start→stop→export/get_all_data 行为测试，明确 lifecycle 可见性。

**History:** lifecycle store 与 query 由 `c88c556`/`40d3b22`（2026-06-08）引入，读取面长期仅围绕 7 个 UI 类别。明确 pre-existing。

### [Medium][80%] RT-009 — task ID 取号无锁，并发 `add` 撞号

- **Source bundle:** `bundle_repo_tooling.md`
- **Location:** `scripts/repo_template/repo_task/lifecycle.py:37-45`（`:41-42` `n = max(...) + 1` / `tid = f"t{n:03d}"`）；对照 `_id_scan.py:234-254`（锁内分配）；`docs/blueprint/conventions.md:10`

**Evidence:** 1. `cmd_add` 从 `scan_tasks()` 计算 `max(tid)+1`，全程无锁；同一仓库内 pending/findings/spikes 的取号（`_id_scan.allocate`）都在 git 公共目录排他锁内完成（`conventions.md:10` 明确「并发 worker 不会撞号」）——task tid 是唯一无锁取号的序列。 2. 两会话并发 `task.py add`（多会话 `task-create` 是文档支持模式）→ 同 tid 两个目录（slug 不同）→ 下次任意 `scan_tasks` 触发 `_validate_task_records`「重复 tid」错误，整个工具链 fail-closed；`rebuild_index` last-writer-wins，索引丢一项。 3. `test_pending.py:186`（`test_concurrent_allocation_yields_unique_ids`）用进程池验证了 pending 的并发取号；`cmd_add` 无对应测试。

**Impact:** 并发立项场景下工具链整体不可用（重复 tid 抛错），且需人工清理重复目录；与总账取号的并发保证不一致。

**Recommendation:** 复用 `_id_scan.id_lock`（或独立 `task_id.lock`）覆盖「取号 + 建目录」；或 `task_dir` 创建用 `mkdir` O_EXCL 原子占位 + 冲突重试。补并发 `add` 测试（复用 `test_pending.py` 的 ProcessPoolExecutor 模式）。

**History:** 预存。** `ea0ff5c` 引入。

### [Medium][75%] RT-010 — pending 批量迁移（archive/park/revive）无锁、非原子

- **Source bundle:** `bundle_repo_tooling.md`
- **Location:** `scripts/repo_template/pending.py:166-197`（`_apply` 批量循环）、`:199-231`（`cmd_archive`/`cmd_park`/`cmd_revive`）；对照 `:130-140`（`cmd_new` 走锁内 `allocate`）

**Evidence:** 1. `archive`/`park`/`revive` 的 `--write` 分支（`_apply`）不取 `id_lock`，逐条 `git mv`（`move_entry`）→ `set_field` 改写状态行 → `git add`；中途崩溃 → 部分条目已迁、部分未迁（迁移状态不一致，可重入修复，但无批量原子性）。 2. 并发窗口：`cmd_new`（持锁，扫描全部分支 + worktree 文件取号）与 `archive`（无锁，`git mv` 移动文件）同时进行时，`scan_max_id` 可能观察到移动中间态（文件短暂不在原目录/新目录），配合 `move_entry` 的 TOCTOU（`destination.exists()` 检查与 `git mv` 之间），极端交错下产生「同号多处」歧义——`find_entry`（`:87-100`）对此 fail-closed 拒绝。 3. 测试覆盖并发 `new`（`:186`）与单线程 CLI 迁移，无并发迁移/中断用例。

**Impact:** 批量闭环/暂搁在半途失败时留下部分迁移状态；并发下可能触发「同号多处」拒绝，需人工核对恢复。影响有限（条目文件可重跑），但破坏「一条目一文件 + 三态目录」的总账不变量边界。

**Recommendation:** 批量迁移整体持 `id_lock`；`move_entry` 改为目标不存在则 `os.replace`/`git mv` 幂等重试；命令末尾输出「已完成 N 条 / 未完成 M 条」。补并发 `archive` vs `new` 测试。

**History:** 预存。** `ea0ff5c` 引入。

### [Medium][High] BC-001 — 显式 `output_path` 公开契约已被安全约束改变，默认导出目录首次使用还会返回 500

- **Source bundle:** `bundle_contracts.md`
- **Location:** - `docs/guides/mcp_usage.md:46-71` - `src/mcp/schemas.ts:115-129` - `src/bridge/server.ts:504-509` - `src/bridge/server.ts:536-549` - `src/bridge/server.ts:823-869` - `src/bridge/server.ts:582-593` - `tests/unit/t137_bridge_security.test.ts:16-17` - `tests/unit/t137_bridge_security.test.ts:66-105` - **可复现证据与调用链**： 1. 指南把 `output_path` 公开为普通本地输出路径，示例明确使用 `"/absolute/path/export.json"`，并承诺“指定 `output_path`：始终写文件”（`docs/guides/mcp_usage.md:46-71`）。 2. MCP schema 仅要求非空字符串，不表达“只能是 `CAPTURE_ALL_EXPORT_DIR` 内相对路径”（`src/mcp/schemas.ts:115-129`）。 3. `/mcp/command` 在目标路由前调用 `safe_output_path`，写文件前再次调用（`src/bridge/server.ts:504-509,536-549`）。`safe_output_path` 使用 `resolve(base, raw)` 并拒绝 base 外路径，因此指南示例在绝大多数环境必定得到 HTTP 400 / `INVALID_QUERY`（`src/bridge/server.ts:841-869`）。 4. 对合法相对路径，例如默认环境下首次调用 `output_path: "export.json"`，`safe_output_path` 会先执行 `realpath(base)`（`src/bridge/server.ts:848`）；但只有自动输出路径会提前 `mkdir(dir, { recursive: true })`（`src/bridge/server.ts:823-826`）。默认导出目录尚不存在时，`realpath` 抛 `ENOENT`，顶层转成 HTTP 500 / `BRIDGE_UNAVAILABLE`（`src/bridge/server.ts:582-593`）。 5. 即使 base 已存在，`nested/export.json` 的父目录不存在时，校验会通过，但 `writeFile` 在 `src/bridge/server.ts:874-883` 失败并返回 500。 6. t137 测试通过 `mkdtemp` 预先创建所有 base（`tests/unit/t137_bridge_security.test.ts:16,95,101`），因此未覆盖默认目录首次使用或嵌套父目录缺失。

**Evidence:** t137 已有效阻止绝对路径和 `..`/symlink 逃逸，未发现任意文件写入，因此不定 High；问题是安全修复后契约和初始化路径未同步。

**Impact:** 文档中合法调用变成 breaking behavior；新安装或清理过临时目录的环境，首次显式相对路径导出也可能失败。调用方无法仅凭 MCP schema 预先发现限制，错误在较深 HTTP 边界才出现。

**Recommendation:** 1. 明确选择并发布单一契约：建议把 `output_path` 定义为“导出根目录内相对路径/文件名”，指南删除任意绝对路径示例，并解释返回的实际绝对 `file_path`。 2. MCP schema 增加相对路径、禁止 `..`/绝对路径的校验，使错误在 tool 输入边界产生。 3. `safe_output_path` 在 `realpath(base)` 前安全创建 base；写入嵌套路径时，在 containment/symlink 校验不退化前提下创建目标父目录并再次校验。 4. 补默认目录不存在、合法相对路径、嵌套目录、base/parent symlink 四类测试。

**History:** 绝对路径能力与文档由 `da722d5` / `5649916` 引入；目录 containment 由 `7daf059 security(t137)` 引入。绝对路径不兼容和首次目录 500 属于 t137 后的新回归；父目录创建语义此前已不明确。

### [Medium][High] BC-002 — `timeout_ms` 在 MCP schema、工具实现、Bridge 与文档间漂移 `[CL-03]`

- **Source bundle:** `bundle_contracts.md`
- **Location:** - `src/mcp/schemas.ts:3-6` - `src/mcp/schemas.ts:45-64` - `src/mcp/tools.ts:33-52` - `src/mcp/client.ts:7-34` - `src/bridge/server.ts:519-525` - `src/bridge/server.ts:926-950` - `docs/guides/mcp_usage.md:24-28` - `docs/guides/mcp_usage.md:87-93` - `docs/blueprint/domain.md:122-137` - `tests/unit/mcp_schema.test.ts:24-29` - `tests/unit/mcp_schema.test.ts:301-325` - **可复现证据与调用链**： 1. MCP 共用 schema 只要求 `timeout_ms` 为正整数，没有 Bridge 的 300000ms 上限（`src/mcp/schemas.ts:4`）。例如 `timeout_ms: 300001` 会通过 MCP Zod，然后在 `/mcp/command` 被 Bridge 以 400 / `INVALID_QUERY` 拒绝（`src/bridge/server.ts:939-943`）。 2. `get_status` 与 `list_browsers` schema 接受 `timeout_ms`（`src/mcp/schemas.ts:46-52`），但 `execute_mcp_tool` 两条分支完全不读取 arguments，直接调用 `client.get_status()`（`src/mcp/tools.ts:33-41`）。 3. `BridgeMcpClient.get_status()` 固定使用 10 秒；普通 command 默认 120 秒，全量/导出默认 300 秒（`src/mcp/client.ts:7-34`）。 4. 指南称 `get_status` 有 `timeout_ms`，且“所有工具支持”“显式传入始终优先”（`docs/guides/mcp_usage.md:24-28,87-93`），与 no-op 实现冲突。 5. 当前 domain blueprint 又声明查询 30 秒、全量/导出 120 秒、start/stop 15 秒（`docs/blueprint/domain.md:128-137`），与 client/Bridge 的 120/300 默认值冲突。 6. schema 测试只覆盖正负值及“所有工具接受 3000”，未覆盖 `300001`，也未验证参数实际传入 client（`tests/unit/mcp_schema.test.ts:24-29,301-325`）。

**Evidence:** Bridge 最终仍强制 300000ms 上限，不会形成无界等待；因此不定 High。

**Impact:** 工具元数据会接受实际不可执行的值；status 类调用看似可配置，实际固定 10 秒；使用 blueprint 或指南估算超时的调用方会得到不同结果。错误可能表现为 Zod 成功后 HTTP 400，或合法的用户参数静默失效。

**Recommendation:** 抽取共享 `MAX_COMMAND_TIMEOUT_MS = 300000`，MCP Zod 使用 `.max(...)`，Bridge 复用同一常量。`get_status` / `list_browsers` 要么把 timeout 传至 `BridgeMcpClient.get_status(timeout_ms)`，要么从 schema 与指南删除该参数。统一 blueprint、archived spec 与指南中的默认值，并增加 schema→tool→client 参数传递测试。

**History:** MCP schema 无上限自早期实现存在；Bridge 上限由 `492a37e` 后加，未同步 MCP。status timeout 长期为 no-op；`325e93b` 只收紧未知键，未解决值域和消费问题。整体为 pre-existing 契约漂移。

### [Medium][High] BC-003 — Bridge 未运行时校验 `AgentCommandResult`，畸形成功结果可原样进入 MCP

- **Source bundle:** `bundle_contracts.md`
- **Location:** - `src/shared/protocol.ts:17-43` - `src/shared/protocol.ts:52-57` - `src/extension/background/agent_bridge_client.ts:129-153` - `src/extension/background/agent_bridge_client.ts:321-348` - `src/bridge/server.ts:461-497` - `src/bridge/command_queue.ts:56-68` - `src/bridge/server.ts:519-553` - `src/mcp/client.ts:28-49` - `tests/unit/agent_bridge_server.test.ts:594-612` - **可复现证据与调用链**： 1. 共享线协议声明结果至少包含 `command_id: string`、`ok: boolean`，错误码须属于 `AgentErrorCode`（`src/shared/protocol.ts:17-57`）。 2. 正常扩展生产方经 `dispatch_agent_command` 产生结果并发送，通常满足类型契约（`src/extension/background/agent_bridge_client.ts:129-153,321-348`）。但这是生产方实现事实，不是 HTTP 信任边界校验。 3. `/extension/result` 对 JSON 仅执行 `as AgentCommandResult`，随后只用 `body.command_id` 检查 owner/queue；未验证 `command_id` 类型、`ok` boolean、`error.code`、成功/失败字段组合（`src/bridge/server.ts:469-489`）。 4. 取得合法 pending `command_id` 后，可由对应已鉴权实例 POST：`{"command_id":"<pending>","ok":"yes","error":{"code":"BOGUS"}}`。owner 检查通过，queue 原样 `pending.resolve(result)`（`src/bridge/command_queue.ts:56-68`）。 5. `/mcp/command` 对该结果返回 HTTP 200（`src/bridge/server.ts:525-553`）；MCP client 对所有 2xx body 直接 cast 为 `AgentCommandResult`（`src/mcp/client.ts:39-49`）。调用方最终收到违反公开 schema 的“成功”响应。 6. 现有测试覆盖未知 `command_id`、实例 owner 和 body 大小，但未覆盖 malformed result；例如 `tests/unit/agent_bridge_server.test.ts:594-612` 仅验证未知 ID。

**Evidence:** 默认扩展生产方走类型化 dispatcher，且 result 路由要求有效 instance token 与 command owner，外部未鉴权请求不能直接注入；攻击面受限，因此不定 High。

**Impact:** 扩展 bug、版本错配或被同一实例 token 控制的进程可破坏 MCP 返回结构，导致 false success、错误码不可识别、调用方分支失效。Bridge 作为跨进程/跨版本边界，TypeScript cast 不能提供运行时兼容保证。

**Recommendation:** 在 `/extension/result` 增加共享运行时 schema：验证 plain object、非空 `command_id`、boolean `ok`、合法 `AgentErrorCode`、`ok:true` 不带 error、`ok:false` 必须带 error；失败返回 400 / `INVALID_QUERY`，且不得 resolve/delete pending command。MCP client 也可对 Bridge 响应做防御性 parse。补畸形 `ok`、未知 error code、缺失 error、owner 合法但 body 非法测试。

**History:** 结果路由初始实现即以 cast 代替校验；后续只补 owner、大小和未知 ID 处理。pre-existing。

### [Medium][High] BC-004 — 空闲态 `stop_recording` 返回成功和 `capture_id: null`，已声明的 `NO_ACTIVE_CAPTURE` 在真实调用链不可达

- **Source bundle:** `bundle_contracts.md`
- **Location:** - `src/shared/protocol.ts:17-37` - `src/extension/background/agent_command_dispatcher.ts:122-131` - `src/extension/background/service_worker.ts:689-713` - `docs/blueprint/domain.md:139-143` - `tests/unit/agent_command_dispatcher.test.ts:127-136` - **可复现证据与调用链**： 1. 协议和当前 domain 都声明扩展错误码 `NO_ACTIVE_CAPTURE`（`src/shared/protocol.ts:25`；`docs/blueprint/domain.md:139-143`）。 2. dispatcher 先读取 `active_capture_id`，再调用 stop handler；只有 handler 返回 `success:false` 才映射为 `NO_ACTIVE_CAPTURE`（`src/extension/background/agent_command_dispatcher.ts:122-130`）。 3. 真实 Service Worker 在 idle 状态显式返回 `{ success: true }`，`stop_capture_inner` 对 `!is_capturing` 也返回成功（`src/extension/background/service_worker.ts:689-713`）。 4. 因此空闲实例调用 MCP `stop_recording` 的实际结果是 `ok:true, data:{ capture_id:null, status:"stopped" }`，而不是声明错误。 5. dispatcher 测试人为把 `stop_capture` mock 为 `{ success:false }`，只证明映射分支存在，没有触达真实 SW 语义（`tests/unit/agent_command_dispatcher.test.ts:127-136`）。

**Evidence:** 操作本身幂等且不会丢数据，问题主要是状态和错误契约，不定 High。

**Impact:** 调用方无法区分“本次真正停止一个 capture”和“原本已空闲”；`capture_id` 的实际 nullability 超出通常成功结果预期；公开错误码存在但真实生产链不产生，容易造成自动化状态机误判。

**Recommendation:** 先明确产品语义。若 stop 非幂等，dispatcher 在调用 handler 前发现 `active_capture_id === null` 应直接返回 `NO_ACTIVE_CAPTURE`。若 stop 有意幂等，应删除/降级该错误码契约，并把成功 data 明确定义为 `capture_id: string | null`，同步文档和测试。不要同时保留两套含义。

**History:** dispatcher 的失败映射自 2026-06 已存在；SW 至少自 2026-07 明确 idle success。`5f985fb` 仅将旧错误码重命名为新码。pre-existing 语义漂移。

### [Medium][High] BC-006 — `save_user_config` 未在写入边界 sanitize，违反当前生效 spec

- **Source bundle:** `bundle_contracts.md`
- **Location:** - `docs/specs/user_config.md:1-26` - `src/shared/user_config.ts:378-431` - `src/shared/user_config.ts:434-464` - `src/extension/background/service_worker.ts:290-295` - `src/shared/logger.ts:143-149` - `tests/unit/user_config_persistence.test.ts:35-219` - **可复现证据与调用链**： 1. 当前生效 spec 明确要求 `user_config` 所有字段“经 `sanitize_user_config` 白名单校验后落库”（`docs/specs/user_config.md:1-4`），并列出值域和读写语义（`docs/specs/user_config.md:5-26`）。 2. sanitizer 已完整实现（`src/shared/user_config.ts:378-431`），`load_user_config` 返回前会调用它（`src/shared/user_config.ts:434-455`）。 3. `save_user_config` 却只执行 `{ ...current, ...patch }` 后原样 `chrome.storage.local.set`，没有 sanitize 或 reject（`src/shared/user_config.ts:460-464`）。`Partial<UserConfig>` 仅是编译期约束，不能保护 runtime message、JS 调用方、导入数据或未来版本错配。 4. `set_log_level` 消息分支在 truthy 检查后把任意 `payload.level` cast 为 `LogLevel`，直接设置全局 logger 并直接写 storage（`src/extension/background/service_worker.ts:290-295`）；`Logger.set_level` 本身无运行时校验（`src/shared/logger.ts:143-149`）。例如 payload `{level:"verbose"}` 可令当前运行态和原始 storage 持有非法值，直到下一次 load 才回退。 5. persistence tests 全部从预置 raw storage 调用 `load_user_config`，或用合法 patch 验证字段保留；未测试非法 patch 的落库结果（`tests/unit/user_config_persistence.test.ts:35-219`）。

**Evidence:** 正常 TypeScript UI 调用受静态类型约束，后续 load 也会 sanitize，影响受限；不构成持久化代码执行或权限提升，因此不定 High。

**Impact:** 持久化原始值和当前运行态可短期偏离 `UserConfig` 契约；消费方若绕过 `load_user_config`，或在同一生命周期使用已设置的 logger level，会观察到非法状态。也使“写入即合法”的生效 spec 不成立。

**Recommendation:** `save_user_config` 对合并后的对象调用 `sanitize_user_config` 再落库；对外部消息边界最好显式拒绝非法 patch，而不是静默回退。`set_log_level` 使用共享 enum guard，并统一调用 `save_user_config({ log_level })`。增加非法 enum/number/type patch 不得进入 storage，以及非法 `set_log_level` 返回失败的测试。

**History:** `save_user_config` 当前写法可追溯至 `bdcfcdaa`；T060 后只增强 load 边界，未补 save。pre-existing，且与现行 spec 存在直接冲突。

## Low / Info

Full list of remaining findings. See the source bundle files for complete evidence and recommendations.

| Severity | Confidence | ID | Cluster | Location | Title | Source |
|---|---|---|---|---|---|---|
| Low | 100/100 - perspectives：P3 Spec Compliance、P6 Docs/Maintainability | BM-L004 | CL-04 | - `docs/archive/tasks/t140_agent_query_cursor_paging/spec.md:92-94` - `docs/blue | t140 要求更新的长期限制表仍缺 CDP 会话 200MB body 预算 | bundle_bridge_mcp.md |
| Low | 100 | DD-005 | — | `src/bridge/logger.ts:25-27`；`src/extension/background/storage.ts:323-327`；`src/ | 五个 exported API 在生产与测试引用图中均为零引用 | bundle_dead_docs.md |
| Low | 100 | DD-006 | — | `src/shared/protocol.ts:119-131`；`src/bridge/server.ts:126-154`；`tests/unit/agen | deprecated `AgentStatus` 顶层字段仍在每次响应中生产，并被测试反向固化 | bundle_dead_docs.md |
| Low | 100 | DD-008 | — | `src/mcp/tools.ts:9-31`；`src/mcp/schemas.ts:131-150`；`docs/blueprint/domain.md:4 | 四个 MCP `session` 工具 alias 是显式兼容面，但没有退出条件 | bundle_dead_docs.md |
| Low | 100 | EXTUI-014 | — | - `tests/unit/ui_strings.test.ts:185-216` - `src/extension/manifest.json:1-48` - | UI string tests contain a vacuous assertion and skip the actual source manifest | bundle_extension_ui.md |
| Low | 100% | PERF-L008 | — | - `src/extension/background/app_log_storage.ts:214-229` - `docs/archive/tasks/t1 | app log 配置上限实际允许接近 2 倍峰值 | bundle_performance.md |
| Low | 100% | SEC-007 | — | `src/mcp/main.ts:9-30`; `src/mcp/token_resolver.ts:11-16`; `src/mcp/client.ts:17 | MCP 可把本地 Bridge token发送到任意配置 URL | bundle_security.md |
| Low | 100% | SEC-008 | — | `src/mcp/schemas.ts:26-43`; `src/extension/background/agent_command_dispatcher.t | Agent capture config 的 body/inline 上限只校验非负，无硬上限 | bundle_security.md |
| Low | 100% | TD-010 | — | `tests/e2e/e2e-detail-tabs.spec.ts:48-70` | Detail-tab E2E silently passes when the content container is absent | bundle_tests_docs.md |
| Low | 100% | TD-011 | — | `tests/e2e/e2e-theme-i18n.spec.ts:348-352` | Theme/i18n suite contains a permanent true placeholder with stale product claim | bundle_tests_docs.md |
| Low | 100% | TD-012 | — | `PRIVACY.md:61-64`, `README.md:190`, `tests/unit/public_docs.test.ts:26-46` | Privacy document links to a nonexistent README fragment, and doc tests ignore fr | bundle_tests_docs.md |
| Low | 99 | EXTUI-012 | — | - `src/extension/dashboard/dashboard_shared.ts:310-362` - `src/extension/dashboa | Dashboard export exceptions are logged but not shown to the user | bundle_extension_ui.md |
| Low | 99 | EXTUI-013 | — | - `src/extension/dashboard/dashboard.html:2-6` - `src/extension/popup/popup.html | Locale switching leaves hardcoded English/Chinese strings and a stale document l | bundle_extension_ui.md |
| Low | 98 | EXTUI-010 | — | - `src/extension/content/content_script.ts:130-142` - `src/extension/content/net | Fallback network hook ignores `capture_request_body` | bundle_extension_ui.md |
| Low | 97% | ARCH-006 | — | - canonical：`scripts/repo_template/repo_task/documents.py:10-74` - 副本：`scripts/r | 三份 front matter parser 形成重复真相源且转义语义已漂移 | bundle_architecture.md |
| Low | 96 | EXTUI-011 | — | - `src/extension/content/clipboard_capture.ts:18-53` - `tests/unit/clipboard_cap | Clipboard API interception is installed in the isolated world, not the page worl | bundle_extension_ui.md |
| Low | 95/100 - perspectives：P3 Protocol/Spec、P6 Maintainability、P7 Test Quality | BM-L002 | — | - `src/mcp/schemas.ts:3-9,84-106,122-129` - `src/bridge/server.ts:939-943` - `sr | MCP Zod schema 未表达 Bridge/dispatcher 已知边界，向 agent 暴露必失败调用 | bundle_bridge_mcp.md |
| Low | 92% | ARCH-008 | CL-05 | - `src/extension/background/storage.ts:39-130` - `docs/archive/specs/storage.md: | fresh install 也创建 4 个 legacy stores，实际 schema 为 14 stores 而非文档 10 stores | bundle_architecture.md |
| Low | 90 | DD-007 | — | `src/shared/types.ts:101,117-119,126,130-133,551-589`；`src/shared/event_category | 九个事件契约无生产者，Dashboard 与测试包含不可达分支 | bundle_dead_docs.md |
| Low | 90% | RT-012 | — | `scripts/repo_template/render_review_prompts.py:321-328`（`--out-dir` 处理）；对照 `:94 | `render_review_prompts --out-dir` 无仓库 containment 校验，可写仓库外 | bundle_repo_tooling.md |
| Low | 88% | ARCH-009 | — | - UI 调用方：`src/extension/popup/popup.ts:14-19`、`src/extension/dashboard/dashboard | extension UI 为使用通用日志 transport 反向依赖 background 模块 | bundle_architecture.md |
| Low | 88% | PERF-L009 | — | - `src/extension/background/agent_command_dispatcher.ts:133-145` - `src/extensio | Agent `captures.list` 全量读取并二次排序后才 slice | bundle_performance.md |
| Low | 87% | PERF-L010 | — | `src/extension/background/exporter.ts:448-464` - 调用链：日志导出 → flush → `get_entries | app log 导出固定全量 100000 条并构建单个巨型字符串 | bundle_performance.md |
| Low | 85% | RT-013 | — | `scripts/repo_template/repo_task/view_server.py:227-247`（`_is_loopback_host` + ` | `view --serve` 非 loopback 绑定暴露 task 文档，仅打印警告 | bundle_repo_tooling.md |
| Low | 78/100 - perspectives：P1 Security/Privacy、P3 Protocol/Spec、P7 Test Quality | BM-L001 | — | - `src/bridge/server.ts:616-625` - `src/extension/background/agent_bridge_client | CORS allow-headers 缺实例认证头，违反 Bridge spec | bundle_bridge_mcp.md |
| Low | 72/100 - perspectives：P3 Protocol、P5 Error Handling | BM-L003 | — | - `src/mcp/client.ts:39-49` - `src/mcp/main.ts:33-43` - `src/bridge/server.ts:53 | extension 返回 `AgentCommandResult.ok=false` 时 MCP 响应仍缺 `isError:true` | bundle_bridge_mcp.md |
| Low | High | BC-005 | — | - `src/mcp/schemas.ts:84-106` - `src/mcp/schemas.ts:122-129` - `src/extension/ba | MCP schema 未编码公开的 `source` / `sources` / `format` 枚举 | bundle_contracts.md |
| Low | High | BC-007 | CL-05 | - `src/shared/constants.ts:4-18` - `src/extension/background/storage.ts:26-65` - | 文档宣称 IndexedDB v3 为 10 stores，fresh DB 实际创建 14 stores | bundle_contracts.md |
| Low | High | BC-008 | — | - `src/extension/background/storage.ts:20-40` - `src/extension/shared/capture_da | IndexedDB 长连接未处理 `versionchange`，未来 schema bump 可能被旧上下文阻塞 | bundle_contracts.md |
| Low | High | BC-009 | — | - `src/shared/protocol.ts:33-37` - `src/bridge/server.ts:75-123` - `docs/guides/ | 多实例未指定目标的公开错误码文档与实现不一致 | bundle_contracts.md |
| Low | High | BC-010 | — | - `src/shared/protocol.ts:59-66` - `src/bridge/config.ts:6-37` - `src/bridge/con | Bridge timeout 配置字段缺少运行时 parse 校验 | bundle_contracts.md |
| Info | 100/100 | BM-I001 | — | `src/bridge/server.ts`（993 行） | Bridge 主实现文件已超过实现源码 800 行提示阈值 | bundle_bridge_mcp.md |
| Info | 100/100 | BM-I002 | — | `tests/unit/agent_bridge_server.test.ts`（2064 行） | Bridge server unit test 已超过测试源码 1200 行提示阈值 | bundle_bridge_mcp.md |
| Info | 100 | DD-009 | — | `src/extension/dashboard/dashboard.ts:118-152` | 2026-06 留下的 TODO 仍描述未执行的 Dashboard 推送迁移 | bundle_dead_docs.md |
| Info | 85% | PERF-I011 | — | - `vite.config.ts:15-26` - `package.json:22-39` - 调用链：`npm run build` → Vite ext | 构建流程没有 bundle size 预算或差异门禁 | bundle_performance.md |

## Appendix — Traceability

Source bundle reports (all under `docs/reviews/review_20260813_114417/`):
- `bundle_architecture.md`
- `bundle_bridge_mcp.md`
- `bundle_contracts.md`
- `bundle_dead_docs.md`
- `bundle_extension_ui.md`
- `bundle_performance.md`
- `bundle_repo_tooling.md`
- `bundle_security.md`
- `bundle_tests_docs.md`

Aggregation: `intensive-review/scripts/aggregate.sh` produced an initial merge; final report was manually reconciled due to formatting differences across bundle files.

## Spec compliance note

This review treats `docs/specs_index.md` and current active specs as the requirement baseline. Many findings are pre-existing relative to HEAD and are not tied to a single recent diff; they are reported because the task requested a full-repository review.
