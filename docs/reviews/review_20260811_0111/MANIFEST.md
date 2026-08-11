# 审阅批次清单

- 生成时间：2026-08-11 01:11 UTC+8
- 范围：当前工作区 `src/` 全量（只看当前文件状态，不看 diff / 历史 commit）。
- 排除：`docs/archive/`、`node_modules/`、`coverage/`、`artifacts/`、生成物、本次审阅目录。
- 总计：98 文件，18842 行，7 批。
- 测试：本轮以生产源码为主；危险模式扫描覆盖 unit 抽样。

## src_bridge_mcp
- 模块：`src_bridge_mcp`
- 文件：11；行数：1891

- `src/bridge/cdp_handler.ts` (382)
- `src/bridge/command_queue.ts` (92)
- `src/bridge/config.ts` (150)
- `src/bridge/label.ts` (25)
- `src/bridge/main.ts` (39)
- `src/bridge/server.ts` (897)
- `src/mcp/client.ts` (47)
- `src/mcp/main.ts` (41)
- `src/mcp/schemas.ts` (150)
- `src/mcp/token_resolver.ts` (15)
- `src/mcp/tools.ts` (53)

## src_shared
- 模块：`src_shared`
- 文件：14；行数：2177

- `src/shared/agent_bridge_config.ts` (86)
- `src/shared/body_routing.ts` (128)
- `src/shared/constants.ts` (70)
- `src/shared/escape.ts` (17)
- `src/shared/event_category.ts` (18)
- `src/shared/event_utils.ts` (68)
- `src/shared/hash.ts` (10)
- `src/shared/id.ts` (11)
- `src/shared/logger.ts` (179)
- `src/shared/protocol.ts` (159)
- `src/shared/redaction.ts` (117)
- `src/shared/system_time.ts` (148)
- `src/shared/types.ts` (722)
- `src/shared/user_config.ts` (444)

## src_ext_bg_agent
- 模块：`src_ext_bg_agent`
- 文件：9；行数：1960

- `src/extension/background/agent_bridge_client.ts` (392)
- `src/extension/background/agent_command_dispatcher.ts` (318)
- `src/extension/background/agent_data_queries.ts` (314)
- `src/extension/background/app_log_storage.ts` (240)
- `src/extension/background/body_capture_coordinator.ts` (335)
- `src/extension/background/cdp_event_router.ts` (36)
- `src/extension/background/capture_state.ts` (98)
- `src/extension/background/keepalive.ts` (32)
- `src/extension/background/external_cdp_bridge_client.ts` (195)

## src_ext_bg_cdp_net
- 模块：`src_ext_bg_cdp_net`
- 文件：9；行数：3524

- `src/extension/background/cdp_handler.ts` (891)
- `src/extension/background/console_capture.ts` (169)
- `src/extension/background/cookie_capture.ts` (122)
- `src/extension/background/exception_capture.ts` (171)
- `src/extension/background/exporter.ts` (445)
- `src/extension/background/network_capture.ts` (1198)
- `src/extension/background/network_context.ts` (132)
- `src/extension/background/network_correlator.ts` (206)
- `src/extension/background/network_webrequest.ts` (190)

## src_ext_bg_sw_storage
- 模块：`src_ext_bg_sw_storage`
- 文件：5；行数：2374

- `src/extension/background/service_worker.ts` (1125)
- `src/extension/background/storage.ts` (583)
- `src/extension/background/stream_buffer.ts` (125)
- `src/extension/background/webrequest_handler.ts` (343)
- `src/extension/background/ws_handler.ts` (198)

## src_ext_content
- 模块：`src_ext_content`
- 文件：16；行数：1961

- `src/extension/content/clipboard_capture.ts` (93)
- `src/extension/content/content_event_utils.ts` (38)
- `src/extension/content/content_script.ts` (244)
- `src/extension/content/dom_capture.ts` (195)
- `src/extension/content/focus_capture.ts` (85)
- `src/extension/content/form_submit_capture.ts` (82)
- `src/extension/content/fullscreen_capture.ts` (49)
- `src/extension/content/keyboard_capture.ts` (115)
- `src/extension/content/mouse_capture.ts` (186)
- `src/extension/content/network_hook.ts` (341)
- `src/extension/content/print_capture.ts` (55)
- `src/extension/content/resize_capture.ts` (56)
- `src/extension/content/scroll_capture.ts` (70)
- `src/extension/content/storage_capture.ts` (123)
- `src/extension/content/visibility_capture.ts` (55)
- `src/extension/content/websocket_capture.ts` (174)

## src_ext_ui_shared
- 模块：`src_ext_ui_shared`
- 文件：34；行数：4955

- `src/extension/dashboard/dashboard-pages.css` (321)
- `src/extension/dashboard/dashboard.css` (258)
- `src/extension/dashboard/dashboard.html` (17)
- `src/extension/dashboard/dashboard.ts` (140)
- `src/extension/dashboard/dashboard_captures.ts` (184)
- `src/extension/dashboard/dashboard_detail.ts` (731)
- `src/extension/dashboard/dashboard_integrations.ts` (54)
- `src/extension/dashboard/dashboard_settings.ts` (258)
- `src/extension/dashboard/dashboard_shared.ts` (294)
- `src/extension/dashboard/detail-shell.css` (196)
- `src/extension/dashboard/detail-views.css` (179)
- `src/extension/dashboard/icons.ts` (37)
- `src/extension/dashboard/sidebar_resize.ts` (69)
- `src/extension/popup/popup.css` (185)
- `src/extension/popup/popup.html` (26)
- `src/extension/popup/popup.ts` (495)
- `src/extension/devtools/devtools.html` (10)
- `src/extension/devtools/devtools.ts` (12)
- `src/extension/devtools/devtools_panel.html` (11)
- `src/extension/devtools/devtools_panel.ts` (6)
- `src/extension/shared/archive_builder.ts` (364)
- `src/extension/shared/capture_data_reader.ts` (36)
- `src/extension/shared/capture_stats.ts` (49)
- `src/extension/shared/chrome.d.ts` (111)
- `src/extension/shared/design_tokens.css` (107)
- `src/extension/shared/dom_utils.ts` (36)
- `src/extension/shared/export_settings.ts` (27)
- `src/extension/shared/export_utils.ts` (123)
- `src/extension/shared/i18n.ts` (407)
- `src/extension/shared/poll_capture_status.ts` (83)
- `src/extension/shared/theme.ts` (65)
- `src/extension/manifest.json` (48)
- `src/extension/_locales/en/messages.json` (8)
- `src/extension/_locales/zh_CN/messages.json` (8)
