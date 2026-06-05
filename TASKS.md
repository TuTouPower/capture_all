# Record All — 待完成任务

已完成任务见：`docs/archive/record_all_completed_tasks.md`

## 七、导出格式

### 7.3 导出文件位置与路径选择 — ✅ 已完成
- 已完成：导出 JSON / JSONL / HTML / HAR 使用 `chrome.downloads.download({ saveAs })`，默认允许用户选择保存位置
- 已完成：设置面板允许配置导出目录和文件名模板
- 说明：Chrome 扩展只能指定下载目录内的相对路径；固定绝对路径仍由浏览器保存对话框决定
- 文件名模板支持 `{session_id}` / `{date}` / `{ext}`

### 7.4 导出数据追加系统时间字段 — ✅ 已完成
- 已完成：JSON / JSONL / HTML / HAR 导出保留原始时间字段，并追加可读系统时间字段
- 已完成：`session.start_time` / `session.end_time` 追加 `*_system_time`
- 已完成：事件、网络请求、控制台日志的 `absolute_time` 追加 `absolute_time_system_time`
- 已完成：HAR 保留标准 ISO 时间，并追加 `_startedDateTimeSystemTime`
- 系统时间按用户设置的时区格式化

## 十、设置完善

### 10.4 时间显示与系统时区设置 — ✅ 已完成
- 已完成：设置面板新增详情页时间显示模式
  - 相对时间：按录制开始时间计算，例如 `0:01.234`
  - 系统时间：按用户设置的时区显示真实时间
- 已完成：用户可设置系统时间使用的时区；默认跟随浏览器 / 系统时区
- 已完成：支持 UTC 和中国时间（UTC+8 / Asia/Shanghai）
- 已完成：详情页、HTML 导出、JSON / JSONL / HAR 导出中的系统时间字段使用同一设置
- 设置值存 `chrome.storage.local.user_config`

---

## 剩余优先级排序

当前 `/goal` 三项已完成。新的剩余优先级待下一轮整理。
