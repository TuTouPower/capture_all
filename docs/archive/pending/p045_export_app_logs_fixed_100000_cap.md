# p045 export_app_logs 固定 100000 上限

- 来源：t156 遗留
- 内容：`src/extension/background/exporter.ts` 的 `export_app_logs` 用 `transport.get_entries(100000, 0, ...)` 固定上限取 app 日志，超 100000 条时静默截断，与 t156 修复的 7 类采集数据同类问题。app 日志属独立路径（非 7 类采集数据），t156 范围外未处理。疑点：需确认是否也改分页耗尽，或显式 truncated 标记。
- 处理：t193
