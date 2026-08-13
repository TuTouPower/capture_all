# Task review t180（reviewer_focus: 代码）

- task：`t180_fix_store_contract_consistency`
- spec：`docs/tasks/t180_fix_store_contract_consistency/spec.md`
- diff_anchor：`b81d0ab2113563756b8edeca44eba1e8f0f05764`
- target：`git diff b81d0ab2113563756b8edeca44eba1e8f0f05764`
- round：1
- reviewed_at：2026-08-13 21:40 UTC+8
reviewed_scope: e98af2fa7950c3c3

复验环境：全量单测 185 文件 / 1771 用例全绿；`tsc --noEmit` 退出码 0。

## Findings

### t180_code_f001 - popup archive 导出事件合并漏 `capture_lifecycle_events`（重复合并逻辑只修一处，同格式导出内容分叉）

- 严重度：important
- 锚点：AC-003「export 事件合并」未覆盖全部导出入口；可观测行为缺陷：同一 archive（zip）导出，从 dashboard 进入含 lifecycle 事件、从 popup 进入不含，事件流随入口分叉。
- 位置：`src/extension/popup/popup.ts:277-288`（对比 `src/extension/dashboard/dashboard_shared.ts:374-384`）
- 问题：两处入口各自内联复制了一份快照事件合并数组（`...user_events / nav_events / error_events / storage_changes / cookie_changes`）并交给同一 `build_archive`。t180 只更新了 dashboard 一侧（补 `...snapshot.lifecycle_events`，dashboard_shared.ts:383），popup 侧（manifest default_popup，popup.ts 导出按钮 → `build_archive` → `download_blob` 为活动路径）未同步。结果：popup 导出的 archive zip 中事件流缺失 `capture_lifecycle_events`，与 dashboard 导出内容不一致；该差异不可由 exporter 侧（json/jsonl/html）弥补，因为 archive 路径直接在 UI 层组 zip。这属于「重复已造成行为分叉、修复遗漏」的典型场景。
- 建议：popup.ts:279-285 的 events 数组补 `...snapshot.lifecycle_events`；更稳妥是抽一个共享的「快照 → archive events」合并函数（dashboard_shared / popup 共用），消除两处内联重复。

### t180_code_f002 - 文档同步不完整：活跃 blueprint 仍声明 7 源 / 10 stores

- 严重度：minor
- 锚点：AC-001/AC-003 的「文档一致」要求未完全落实（行为已对，文档残留旧表述）
- 位置：
  - `docs/blueprint/domain.md:55`——MCP 参数枚举节仍写「`source`/`sources`：7 个数据源（仅列 7 项）」；t180 把 `AGENT_DATA_SOURCES` 扩为 8 源后，同一文件第 135-139 行已改、第 55 行漏改，形成自相矛盾。
  - `docs/blueprint/architecture.md:35`——架构图仍标「IndexedDB capture_all_db 10 stores」。
  - `docs/blueprint/domain.md:135`——「详见 `docs/archive/specs/storage.md`」，该归档文档（`docs/archive/specs/storage.md:12`）仍称「Object Stores（10 个）」，引用即产生矛盾（归档正文可不动，引用关系需处理）。
- 问题：文档修正范围未覆盖全部声明点，后续读者按活跃 blueprint 会得到与实现（14 stores / 8 源）冲突的信息。非行为缺陷。
- 建议：domain.md:55 改为 8 源并列出 `capture_lifecycle_events`；architecture.md:35 图例改 14（10+4 legacy）；domain.md:135 的引用改为指向已对齐的当前文档或注明归档版为历史口径。

## 结论

- 前轮 finding 复核：Round 1，无前轮。
- 本轮新发现：2 条（f001 important、f002 minor）。
- 未进表的提示：
  - 文件过大（达 minor 阈值 400 且本 task 净增）：`src/extension/background/storage.ts` 761 行（+6）、`src/extension/background/agent_data_queries.ts` 462 行（+17）、`src/extension/background/exporter.ts` 455 行（+24）、`src/extension/dashboard/dashboard_shared.ts` 432 行（+2）。无证据表明过大直接导致 f001 之外的可观测缺陷，按降级规则不进表。
  - 复杂度：无可达 ≥15 的函数；`get_record_type/summary/preview` 等 switch 为表驱动分发（每支一行转发），排除。
  - 范围外观察：`storage.ts` 的 `get_lifecycle_events()` 仍无生产消费者（spec 背景提及的旧状态；t180 消费者走 `get_events_by_category('capture_lifecycle')`，该函数保留未删，pre-existing 死 API，未扩大）；`exporter.ts` 的 json/jsonl/html 三份 fetch+merge 结构重复为 pre-existing，t180 对称加入 lifecycle、三处一致无分叉。
- 总体判断：AC-001/002/003/004 主链路实现正确且测试通过，但 archive 导出存在一个未覆盖入口（f001，important），文档同步残留（f002）；存在未解决的 important，判定 FAIL。
- 系统性 follow-up：无独立 follow-up 建议（f001 修复即可闭合；如抽共享合并函数属 f001 建议方向，无需另立 task）。

### AC 复验方式

- AC-001 `re_verified`：`docs/blueprint/domain.md:135` 已改 14（10 当前 + 4 legacy）；`storage.ts:47-138` upgradeneeded 对 4 legacy + 10 当前 store 全部 `if (!contains) createObjectStore`；`tests/unit/store_contract_consistency.test.ts:26-43` 断言 `objectStoreNames.length === 14`，重跑通过。
- AC-002 `re_verified`：`exporter.ts:64-78 / 90-104 / 127-141` 三类导出事件合并含 `...lifecycle_events`；`agent_data_queries.ts:55-79` `load_agent_capture_data` 聚合含 `capture_lifecycle_events`（`capture.get_all_data` 路径，dispatcher:93）；dashboard archive 合并含（`dashboard_shared.ts:383`）；`store_contract_consistency.test.ts:71-78` 断言 export_json 输出含 lifecycle 事件，重跑通过。popup archive 入口除外（见 f001）。
- AC-003 `re_verified`：`capture_data_reader.ts:23` `CaptureSnapshot.lifecycle_events` 必填字段且 `read_capture_snapshot` 为唯一构造点；`constants.ts:89` `AGENT_DATA_SOURCES` 扩为 8 源、`agent_data_queries.ts:343` `SOURCE_STORE` 映射 + `get_record_type/summary/preview` 三处加 `capture_lifecycle_events` 分支；UI 不展示由 `dashboard_shared.ts:243` `Pick<CaptureSnapshot, ...>` 显式不含 `lifecycle_events` 保证；MCP Zod `source_schema = z.enum(AGENT_DATA_SOURCES)`（`schemas.ts:15`）自动接收新源。相关测试重跑通过。
- AC-004 `trust_prior`（spec 标注 `[deploy]`）：依赖实施侧 [deploy] 标注与代码审查——`storage.ts:40-43` 在 onsuccess 注册 `onversionchange`（`db?.close(); db = null;`），关闭后 `init_db` 重新 open 走完升级事务，符合规范建议的「收到 versionchange 主动关连接」；单元测试（`store_contract_consistency.test.ts:105-120`）仅验证回调注册与源码形态，未验证真实多上下文升级场景，无法由 reviewer 独立复验。

coverage = 3 / 4

verdict: FAIL

## Round 2 复核 (2026-08-13 21:46 UTC+8)

- 前轮 finding 复核（以 diff 与代码为准，不采信处置表自述）：

  - **t180_code_f001（important）— 已消除**：`src/extension/popup/popup.ts:285-286` archive 导出事件合并已补 `...snapshot.lifecycle_events`（注释注明与 dashboard 侧一致），与 `dashboard_shared.ts:374-384` 的合并集合一致；popup 与 dashboard 两个 archive 导出入口事件流不再分叉。tsc 通过（`lifecycle_events` 为 `CaptureSnapshot` 必填字段，编译即证明读取路径类型安全）。
  - **t180_code_f002（minor）— 已消除**：`docs/blueprint/domain.md:55` MCP 枚举已改 8 个数据源并列出 `capture_lifecycle_events`；`docs/blueprint/domain.md:135` 已写明 14 = `STORE_NAMES` 10 个当前 store（captures、7 事件源、capture_lifecycle_events、app_logs）+ 4 legacy，并注明「t180 对齐：文档不再宣称 10 stores 为全量」，与归档文档（历史口径）的引用关系不再误导；`docs/blueprint/architecture.md:35` 图示已改「14 stores（10 当前 + 4 legacy）」。

- 本轮新发现：0 条。
- 修复引入的新问题扫描：无。
  - 新增测试均为行为级断言（写→读闭环 `load_agent_capture_data` 8 源、`merge_detail_events` 行为级不含 lifecycle、真实 versionchange 路径用第二连接以 `DB_VERSION+100` 打开并断言不被 blocked），无恒真断言 / 弱化断言 / mock 掉被测逻辑。
  - AC-004 新增真实 versionchange 测试将 fake-indexeddb 实例版本升至 104，仅影响本文件内后续测试（已置于文件末尾），未波及其他测试文件（全量绿）。
- 复验：全量单测 185 文件 / 1774 用例全绿（较 Round 1 新增 3 个）；`tsc --noEmit` 退出码 0；AC-004 仍为 `[deploy]`，本轮新增的真实 versionchange 行为测试由 fake-indexeddb 模拟，真实多上下文行为维持 `trust_prior`。
- 总体判断：前轮 2 条 finding 均已按建议消除，未发现新问题，当前无未解决的 critical / important。

reviewed_scope: 165bcb2ef4ce14b2

verdict: PASS

## Round 3 复核 (2026-08-13 21:49 UTC+8)

- 代码侧变化确认：`git diff b81d0ab2113563756b8edeca44eba1e8f0f05764` 的 `src/` 业务代码改动仍为 7 个文件、45 insertions / 16 deletions（`agent_data_queries.ts` 17+ / `exporter.ts` 24± / `storage.ts` 6+ / `dashboard_shared.ts` 2+ / `popup.ts` 2+ / `capture_data_reader.ts` 8± / `constants.ts` 2+），与 Round 2 复核时逐文件比对完全一致，代码侧自 Round 2 后零变化。
- 唯一后续文件改动为 `tests/unit/store_contract_consistency.test.ts`（168 → 172 行，test reviewer f005 处置的测试断言调整）；`docs/` 仅 `task.md` 处置表更新（流程文件）。业务代码未动。
- 前轮 finding 复核：**f001（important）已消除**、**f002（minor）已消除** 维持不变——代码未变，Round 2 以 diff 与代码为据的消除结论依然成立；无新增业务代码路径进入审查范围。
- 本轮新发现：0 条（测试断言调整属 test reviewer 职责范围，不重复报告）。
- 复验：`tsc --noEmit` 退出码 0；受影响测试（store_contract_consistency 11 用例 / agent_data_queries 16 / export_busy_guard 5）全绿。
- 总体判断：Round 2 后代码侧无新增改动，前轮 2 条 finding 维持已消除，无未解决的 critical / important。

reviewed_scope: fe759501af06e384

verdict: PASS
