# spec: storage_export_boundaries

## 背景

存储/导出边界两条遗留（pending 总账）：`list_captures` 的 `limit` 参数无输入校验——负数/0 静默返回空数组、小数意外截断（p039）；exporter/coordinator/storage 三条断言缺口——`total_size_kb` 实际字节数未断言、bridge 相对时间 clamp 无直接单测、`dom_data` store 映射无路由断言（p044）。

## 验收标准

- AC-001：`list_captures` 对 limit 负数/0/小数给出明确行为（clamp），不静默截断；合法值（undefined/正整数）语义不变。负数/0 → 1 条（不空数组）、小数向下取整、NaN/非有限视为全量。
- AC-002：`total_size_kb` 断言为实际序列化字节数（与内嵌 JSON 的 TextEncoder 字节数一致）。
- AC-003：bridge 相对时间修正（`relative_time = timestamp - start_time`，clamp 非负）直接单测，含正常/时钟回拨/相等边界。
- AC-004：`dom_data` 类别事件落 USER_ACTION_EVENTS store（路由断言）。
- AC-005：新增测试全绿，既有 storage/exporter 测试无回归。

## 可测试性

全部 AC 可自动测试：AC-001 用 fake-indexeddb 行为断言；AC-002 exporter 回灌断言；AC-003 coordinator 转换函数单测；AC-004 storage 写读路由断言。

## 实现约定

- `list_captures` limit 归一化：`limit === undefined || !Number.isFinite(limit)` → 全量；否则 `Math.max(1, Math.floor(limit))`。
- `convert_bridge_event_to_request` 导出（供 clamp 单测）。

## 测试钩子约定

`src/` 测试钩子导出须带 `_for_test` 命名约定。
