# 功能规格索引

每功能一行，指向 `specs/{feature}.md`。blueprint 定义即"已实现"，不设状态列。

| 功能 | 规格 |
|---|---|
| 采集核心（生命周期 / 消息路由 / SW 协调） | [specs/capture_core.md](specs/capture_core.md) |
| 页面事件捕获（content scripts 各 capture 模块） | [specs/content_events.md](specs/content_events.md) |
| 网络请求与 Body 捕获（webRequest / CDP / 三层降级） | [specs/network_body_capture.md](specs/network_body_capture.md) |
| Storage（IndexedDB schema / flush / store 路由） | [specs/storage_indexeddb.md](specs/storage_indexeddb.md) |
| Cookie 捕获 | [specs/cookie.md](specs/cookie.md) |
| Agent MCP（Bridge + MCP Server + 命令映射） | [specs/agent_mcp.md](specs/agent_mcp.md) |
| 弹出窗口三状态 | [specs/popup_3states.md](specs/popup_3states.md) |
| 主面板（采集列表 / 详情 / 设置 / 集成） | [specs/dashboard.md](specs/dashboard.md) |
| DevTools 面板 | [specs/devtools.md](specs/devtools.md) |
| 导出（JSON / JSONL / HAR / HTML） | [specs/export_zip.md](specs/export_zip.md) |
| 脱敏与安全 | [specs/redaction_security.md](specs/redaction_security.md) |
| 设计系统（令牌 / 主题 / 字体） | [specs/design_system.md](specs/design_system.md) |
| 国际化与主题 | [specs/i18n_theme.md](specs/i18n_theme.md) |
| 应用日志 | [specs/app_logging.md](specs/app_logging.md) |
