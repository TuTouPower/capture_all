# Task plan - T033 sw_listener_generation

## 步骤

1. 红：新建 tests/unit/sw_listener_generation.test.ts 覆盖验收。
2. 红：跑测试失败。
3. 绿：onActivated 入口捕获 gen，await chrome.tabs.get 后校验。
4. 全量 npm test + tsc --noEmit。
5. log + commit + 归档。

## 风险与回退

- 风险：其他 listener（onUpdated 等）未改仍可能有跨 generation 问题。缓解：本 task 聚焦 onActivated 作示范，其他 listener 后续按同模式增量改。
- 回退：`git revert <commit>`。
