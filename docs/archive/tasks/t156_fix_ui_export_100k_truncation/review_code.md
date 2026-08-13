# Task review t156（reviewer_focus: 代码）

- task：`t156_fix_ui_export_100k_truncation`
- spec：`docs/tasks/t156_fix_ui_export_100k_truncation/spec.md`
- diff_anchor：`4f6368f8d12565cf352fd5692f4626b72f939d5b`
- target：`git diff 4f6368f8d12565cf352fd5692f4626b72f939d5b`
- round：1
- reviewed_at：2026-08-13 13:45 UTC+8

reviewed_scope: 76670d3e5d5de296

## Findings

### t156_code_f001 - `fetch_all_records` 未声明 fetcher 隐式契约（offset/limit 语义）

- 严重度：minor
- 锚点：行为缺陷（共享 helper 设计契约未文档化；当前无调用点触发）
- 位置：`src/extension/shared/paged_reader.ts:7-19`
- 问题：`fetch_all_records` 以「fetcher 在指定 offset 返回至多 `limit` 条、offset 单调推进时结果不重不漏」为前提，但注释未声明该契约。当前 7 个调用点全部来自 `storage.ts` 的 cursor 分页函数（`query_by_store` 尊重 offset），契约满足；但作为跨三模块共享 helper，若未来新调用方传入忽略 offset 或对单批长度有内部限制的 fetcher，循环将死循环（满页返回永远不空）或重复/漏数据（offset 推进与返回不一致），且无任何防护。ADR-012 契约（decisions.md:99）本身是「循环 offset 直至 batch < PAGE_SIZE」，helper 与该契约一致，问题仅在文档化与防御。
- 建议：在 `paged_reader.ts` 头部注释补充 fetcher 契约（单批长度 ≤ limit；offset 单调递增时结果不重不漏；以空批或不足批终止）；可选加最大页数防呆（如 `MAX_PAGES`）防误用死循环。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无（Round 1）
- 本轮新发现：1 条（t156_code_f001，minor）
- 未进表的提示：
  - 文件过大：无命中。`exporter.ts` 438 行已超 400 阈值，但本 task 净减（-27 行，删本地分页 helper），不满足「本 task 仍净增」条件，不进表；其余改动文件均远低于阈值。
  - 复杂度：无 ≥10 函数。`fetch_all_records` 手算 CC≈3；`exporter.ts` / `agent_data_queries.ts` 本 diff 仅简化未增分支。
  - 范围外观察：
    - `exporter.ts:425` `export_app_logs` 仍用 `get_entries(100000, 0, ...)` 固定上限，属 app log 导出（非 7 类 capture 数据读取路径），不在本 task 范围，未改。
    - `agent_command_dispatcher.ts:61/76/135` 的 `limit=100000` 是查询参数默认值（语义为「返回前 N 条」），非读取静默截断，未改。
    - reader 分页依赖 `storage.ts` cursor skip（`query_by_store` 每页 O(offset)），>100k 记录时读取放大为 O(n²)；分页契约由 ADR-012 强制、性能与流式组装属 spec 非范围（t193），不阻断。
    - spec「Finalization 时更新」要求 decisions.md 记录统一 helper 位置与分页契约，当前 `decisions.md:99` 仅记 ADR-012 结论、未提 `shared/paged_reader.ts`；属收尾阶段待办，非代码缺陷。
- AC 复验方式：
  - AC-001：`re_verified` — `capture_data_reader.test.ts:98-105` 构造 100001 条 user_action 分页 fixture，断言全量返回且等于 `stats.user_action_count`；测试实跑通过；实现侧 `capture_data_reader.ts:29` 分页耗尽。
  - AC-002：`re_verified` — `paged_reader.test.ts:20-53` 断言 offset 序列 `[0,5000,...,100000]` 单调、limit 恒为 5000、整数倍页码继续取到空批；与 `fetch_all_records` 循环（paged_reader.ts:12-18）逐行核对一致。
  - AC-003：`re_verified` — 调用点核查 `popup.ts:272` 与 `dashboard_shared.ts:320`（Popup/Dashboard ZIP）均消费 `read_capture_snapshot` 全量结果；`capture_archive_count.test.ts:126-143` 用 100001 事件过 `build_archive` 解包断言 `manifest.counts.events=100001`（按 spec 测试策略 mock reader + 真实 archive builder）；测试实跑通过。
  - AC-004：`re_verified` — 调用点 `dashboard_shared.ts:296` 详情加载走 reader 全量，`merge_detail_events`（dashboard_shared.ts:241-286）拼接全量数组；`capture_archive_count.test.ts:145-151` 断言详情条数 = 统计值且 >100000；测试实跑通过。
  - AC-005：`re_verified` — 全 `src/` grep `100000`/固定上限：UI/ZIP 读取路径（reader/exporter/agent_data_queries）已无固定上限（`export_app_logs` 与 dispatcher 默认参数属范围外）；实现未保留上限，AC-005 的「若保留上限」条件未触发，无静默裁切路径残留。
  - coverage = 5 / 5
- 总体判断：统一分页 helper 与原 `exporter.ts` / `agent_data_queries.ts` 分页实现逐字等价，三处调用点行为无回归；`read_capture_snapshot` 修复静默截断，AC-001~005 全部实现并有测试覆盖（11 用例实跑全绿，`tsc --noEmit` 通过）；仅 1 条 minor（契约文档化），无未解决 critical / important。
- 系统性 follow-up：无（性能/流式组装已有 t193 承接）

verdict: PASS

## Round 1 复核 (2026-08-13 13:50 UTC+8)

复核范围：修复后工作区（`git diff 4f6368f8d12565cf352fd5692f4626b72f939d5b`，含处置后改动）。

reviewed_scope: 741a7d61c4e99605

- **f001 修复确认**：`src/extension/shared/paged_reader.ts:7-12` 新增 JSDoc，声明 fetcher 隐式契约（单次返回条数 ≤ limit；offset 单调推进时批次不重不漏；fetcher 异常原样向上传播不吞错）。循环逻辑（`paged_reader.ts:13-25`）与上轮审阅一致，仅新增注释，无行为变化。修复到位。
- **处置后 diff 无新引入问题**：代码改动仅 `paged_reader.ts` 增注释；测试文件为 test reviewer 两条 minor 的修复——`paged_reader.test.ts:55-67` 新增 fetcher 异常传播用例 2 条（首批 reject / 后续批 reject），`capture_data_reader.test.ts:127-131` AC-005 断言改为仅断言全量返回（不再锁返回结构形状），均核查无问题；`docs/blueprint/decisions.md` / `docs/specs_index.md` 为 spec「Finalization 时更新」文档落地（ADR-012 记录统一 helper 位置与分页契约，内容与实现一致），非代码改动。
- **验证**：3 个测试文件 13 用例实跑全绿（上轮 11 + 新增 2），`tsc --noEmit` 通过。
- **前轮 finding 复核**：t156_code_f001（minor）已消除；无 critical / important 遗留。
- 总体判断：修复与处置未引入新问题，PASS 维持。

verdict: PASS
