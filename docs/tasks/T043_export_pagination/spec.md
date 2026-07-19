# Task spec + log - T043 export_pagination

## 背景

`src/extension/background/exporter.ts` 与 `agent_data_queries.ts` 每类数据固定 limit=100000，无分页、无截断标记。大采集无提示丢数据。

## 范围

- exporter.ts：新增 `get_all_events_by_category`/`get_all_network_requests`/`get_all_console_events` 分页 helper（PAGE_SIZE=5000），所有 export 函数（json/jsonl/html/har）替换 100000 调用。
- agent_data_queries.ts：新增通用 `fetch_all` 分页 helper，`load_agent_capture_data` 替换 FULL_DATA_LIMIT 调用。

## 验收

- [x] exporter.ts 不再有 100000 字面值。
- [x] agent_data_queries.ts 不再有 FULL_DATA_LIMIT。
- [x] npm test 全绿。

## 进展

- 2026-07-19：分页 helper 替换固定 100000 截断；测试更新期望 PAGE_SIZE=5000。

## 决策

- PAGE_SIZE=5000：平衡内存压力与查询次数。
- 内存仍全量加载（流式输出留 T090）；本 task 仅消除静默截断。
