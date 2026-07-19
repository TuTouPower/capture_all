# Task spec + log - T058 event_category_exhaustive

## 背景

`src/shared/event_category.ts:7-17` 漏 4 个合法生命周期事件（capture_config_changed/permission_missing/debugger_attach_status/body_capture_status_changed），未知类型默认 dom_data。

## 范围

- 新增 LIFECYCLE_TYPES Set，含全部 6 个 lifecycle 事件。
- Set 类型改为 `Set<EventType>`（编译期类型安全）。

## 验收

- [x] 4 个遗漏事件映射到 capture_lifecycle。
- [x] npm test 全绿。

## 进展

- 2026-07-19：实施。
