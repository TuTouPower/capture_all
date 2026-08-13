# spec: fix_ui_export_100k_truncation

## 背景

页面侧快照读取器 `read_capture_snapshot()` 对 7 类数据各查询一次 `offset=0, limit=100000`，无续页、无 `truncated` 标记。Popup 与 Dashboard 的 ZIP 导出、Dashboard 详情页均直接把该截断数组交给 `build_archive()` 或渲染。同一 capture 经 background JSON/HAR/MCP 查询可得到更多数据，经 UI/ZIP 得到更少，形成入口相关数据完整性差异。ADR-012 已否决固定上限，要求分页读取至耗尽；T043 只在 `exporter.ts` 与 `agent_data_queries.ts` 落地，漏掉页面 reader。

## 验收标准

- AC-001：构造单类别记录数 > 100000 的 capture fixture，`read_capture_snapshot()` 返回该类别全部记录，且数量等于持久化统计值。
- AC-002：跨页读取行为遵循 `PAGE_SIZE=5000` 契约，第二页及以后数据被正确追加，offset 单调递增。
- AC-003：Popup ZIP 与 Dashboard ZIP 对 > 100000 条 capture 产出的归档 manifest 计数与持久化统计一致（不因截断而偏小）。
- AC-004：Dashboard 详情对 > 100000 条 capture 展示的数据条数与持久化统计一致。
- AC-005：若任何读取路径保留上限，必须显式返回 `truncated` 标记或失败错误，调用方不可观察到「看似完整」的截断归档（本 task 实现不留上限，全量分页）。

## 可测试性

全部 AC 可自动测试：AC-001/002 用 mock IndexedDB 分页 fixture 单测；AC-003/004/005 用 mock `read_capture_snapshot` 与 archive builder 单测。

## 实现约定

统一全量分页 helper：`src/extension/shared/paged_reader.ts` 的 `fetch_all_records`（PAGE_SIZE=5000，offset 单调推进至空批），供 `capture_data_reader.ts`、`exporter.ts`、`agent_data_queries.ts` 共用。fetcher 隐式契约：单次返回 ≤ limit、offset 单调不重不漏；异常原样传播不吞错。读取路径禁止引入固定上限；若未来需内存预算约束，须显式 truncated/失败而非静默裁切。

## 测试钩子约定

`src/` 测试钩子导出须带 `_for_test` 命名约定。
