# 审阅批次清单

- 范围：当前活跃文本代码、测试、配置、脚本、文档。
- 排除：`docs/archive/` 历史归档、二进制图片、生成型 `package-lock.json`、本次新建审阅目录。
- 总计：282 文件，47807 行，29 批。

## project_01
- 模块：`project`
- 文件：20；行数：1672

- `.claude/settings.json` (15)
- `.github/ISSUE_TEMPLATE/bug_report.yml` (103)
- `.github/ISSUE_TEMPLATE/config.yml` (5)
- `.github/ISSUE_TEMPLATE/feature_request.yml` (70)
- `.github/dependabot.yml` (19)
- `.github/pull_request_template.md` (24)
- `.github/workflows/ci.yml` (42)
- `.gitignore` (21)
- `.mcp.json.example` (15)
- `.nvmrc` (1)
- `AGENTS.md` (149)
- `CHANGELOG.md` (31)
- `CLAUDE.md` (149)
- `CODE_OF_CONDUCT.md` (137)
- `CONTRIBUTING.md` (92)
- `LICENSE` (202)
- `PRIVACY.md` (67)
- `README.en.md` (227)
- `README.md` (228)
- `SECURITY.md` (75)

## project_02
- 模块：`project`
- 文件：13；行数：1230

- `assets/icons/icon.svg` (11)
- `assets/promo/promo_marquee.svg` (28)
- `assets/promo/promo_small.svg` (27)
- `package.json` (61)
- `playwright.config.ts` (141)
- `scripts/capture_store_screenshots.mjs` (186)
- `scripts/copy_locales.mjs` (18)
- `scripts/generate_icons.mjs` (238)
- `scripts/outline_svg_text.py` (155)
- `scripts/scan_tracked_tree.mjs` (300)
- `tsconfig.json` (21)
- `vite.config.ts` (22)
- `vitest.config.ts` (22)

## docs_01
- 模块：`docs`
- 文件：20；行数：1883

- `docs/blueprint/architecture.md` (248)
- `docs/blueprint/conventions.md` (106)
- `docs/blueprint/decisions.md` (72)
- `docs/blueprint/domain.md` (130)
- `docs/guides/contributing_dev.md` (237)
- `docs/guides/deployment.md` (93)
- `docs/guides/mcp_usage.md` (144)
- `docs/guides/store_publish_list.md` (231)
- `docs/guides/test.md` (233)
- `docs/guides/troubleshooting.md` (138)
- `docs/handoff.md` (50)
- `docs/reviews/.gitkeep` (0)
- `docs/tasks/T008_label_routing/plan.md` (39)
- `docs/tasks/T008_label_routing/spec.md` (62)
- `docs/tasks/index.md` (20)
- `docs/templates/review/adoption.md` (7)
- `docs/templates/review/review.md` (25)
- `docs/templates/spike/report.md` (27)
- `docs/templates/task/log.md` (7)
- `docs/templates/task/plan.md` (14)

## docs_02
- 模块：`docs`
- 文件：1；行数：21

- `docs/templates/task/spec.md` (21)

## src_bridge_mcp_shared_01
- 模块：`src_bridge_mcp_shared`
- 文件：11；行数：1944

- `src/bridge/cdp_handler.ts` (360)
- `src/bridge/command_queue.ts` (65)
- `src/bridge/config.ts` (133)
- `src/bridge/main.ts` (39)
- `src/bridge/server.ts` (851)
- `src/mcp/client.ts` (47)
- `src/mcp/main.ts` (34)
- `src/mcp/schemas.ts` (150)
- `src/mcp/tools.ts` (53)
- `src/shared/agent_bridge_config.ts` (84)
- `src/shared/body_routing.ts` (128)

## src_bridge_mcp_shared_02
- 模块：`src_bridge_mcp_shared`
- 文件：12；行数：1837

- `src/shared/constants.ts` (69)
- `src/shared/escape.ts` (17)
- `src/shared/event_category.ts` (17)
- `src/shared/event_utils.ts` (59)
- `src/shared/hash.ts` (10)
- `src/shared/id.ts` (11)
- `src/shared/logger.ts` (125)
- `src/shared/protocol.ts` (147)
- `src/shared/redaction.ts` (107)
- `src/shared/system_time.ts` (148)
- `src/shared/types.ts` (719)
- `src/shared/user_config.ts` (408)

## src_extension_01
- 模块：`src_extension`
- 文件：8；行数：1550

- `src/extension/_locales/en/messages.json` (8)
- `src/extension/_locales/zh_CN/messages.json` (8)
- `src/extension/background/agent_bridge_client.ts` (367)
- `src/extension/background/agent_command_dispatcher.ts` (292)
- `src/extension/background/agent_data_queries.ts` (297)
- `src/extension/background/app_log_storage.ts` (229)
- `src/extension/background/body_capture_coordinator.ts` (313)
- `src/extension/background/cdp_event_router.ts` (36)

## src_extension_02
- 模块：`src_extension`
- 文件：7；行数：1782

- `src/extension/background/cdp_handler.ts` (804)
- `src/extension/background/console_capture.ts` (161)
- `src/extension/background/cookie_capture.ts` (88)
- `src/extension/background/exception_capture.ts` (159)
- `src/extension/background/exporter.ts` (393)
- `src/extension/background/external_cdp_bridge_client.ts` (151)
- `src/extension/background/keepalive.ts` (26)

## src_extension_03
- 模块：`src_extension`
- 文件：4；行数：1660

- `src/extension/background/network_capture.ts` (1146)
- `src/extension/background/network_context.ts` (128)
- `src/extension/background/network_correlator.ts` (202)
- `src/extension/background/network_webrequest.ts` (184)

## src_extension_04
- 模块：`src_extension`
- 文件：4；行数：1938

- `src/extension/background/service_worker.ts` (960)
- `src/extension/background/storage.ts` (559)
- `src/extension/background/stream_buffer.ts` (83)
- `src/extension/background/webrequest_handler.ts` (336)

## src_extension_05
- 模块：`src_extension`
- 文件：16；行数：1934

- `src/extension/background/ws_handler.ts` (193)
- `src/extension/content/clipboard_capture.ts` (93)
- `src/extension/content/content_event_utils.ts` (38)
- `src/extension/content/content_script.ts` (261)
- `src/extension/content/dom_capture.ts` (171)
- `src/extension/content/focus_capture.ts` (85)
- `src/extension/content/form_submit_capture.ts` (75)
- `src/extension/content/fullscreen_capture.ts` (49)
- `src/extension/content/keyboard_capture.ts` (115)
- `src/extension/content/mouse_capture.ts` (186)
- `src/extension/content/network_hook.ts` (312)
- `src/extension/content/print_capture.ts` (55)
- `src/extension/content/resize_capture.ts` (56)
- `src/extension/content/scroll_capture.ts` (70)
- `src/extension/content/storage_capture.ts` (120)
- `src/extension/content/visibility_capture.ts` (55)

## src_extension_06
- 模块：`src_extension`
- 文件：8；行数：1824

- `src/extension/content/websocket_capture.ts` (179)
- `src/extension/dashboard/dashboard-pages.css` (321)
- `src/extension/dashboard/dashboard.css` (258)
- `src/extension/dashboard/dashboard.html` (17)
- `src/extension/dashboard/dashboard.ts` (135)
- `src/extension/dashboard/dashboard_captures.ts` (141)
- `src/extension/dashboard/dashboard_detail.ts` (731)
- `src/extension/dashboard/dashboard_integrations.ts` (42)

## src_extension_07
- 模块：`src_extension`
- 文件：14；行数：1807

- `src/extension/dashboard/dashboard_settings.ts` (258)
- `src/extension/dashboard/dashboard_shared.ts` (288)
- `src/extension/dashboard/detail-shell.css` (196)
- `src/extension/dashboard/detail-views.css` (179)
- `src/extension/dashboard/icons.ts` (37)
- `src/extension/dashboard/sidebar_resize.ts` (69)
- `src/extension/devtools/devtools.html` (10)
- `src/extension/devtools/devtools.ts` (12)
- `src/extension/devtools/devtools_panel.html` (11)
- `src/extension/devtools/devtools_panel.ts` (6)
- `src/extension/manifest.json` (48)
- `src/extension/popup/popup.css` (185)
- `src/extension/popup/popup.html` (26)
- `src/extension/popup/popup.ts` (482)

## src_extension_08
- 模块：`src_extension`
- 文件：11；行数：1404

- `src/extension/shared/archive_builder.ts` (364)
- `src/extension/shared/capture_data_reader.ts` (36)
- `src/extension/shared/capture_stats.ts` (49)
- `src/extension/shared/chrome.d.ts` (107)
- `src/extension/shared/design_tokens.css` (107)
- `src/extension/shared/dom_utils.ts` (36)
- `src/extension/shared/export_settings.ts` (27)
- `src/extension/shared/export_utils.ts` (123)
- `src/extension/shared/i18n.ts` (407)
- `src/extension/shared/poll_capture_status.ts` (83)
- `src/extension/shared/theme.ts` (65)

## tests_e2e_01
- 模块：`tests_e2e`
- 文件：7；行数：1831

- `tests/e2e/T0001/zoom-slider.spec.ts` (825)
- `tests/e2e/T0002/e2e-final-t0002.cjs` (263)
- `tests/e2e/T0003/nav-settings.spec.ts` (46)
- `tests/e2e/e2e-T0001-ac3-verify.spec.ts` (123)
- `tests/e2e/e2e-T0001-zoom.spec.ts` (311)
- `tests/e2e/e2e-baidu.spec.ts` (118)
- `tests/e2e/e2e-capture-baidu.spec.ts` (145)

## tests_e2e_02
- 模块：`tests_e2e`
- 文件：9；行数：1742

- `tests/e2e/e2e-capture-local.spec.ts` (320)
- `tests/e2e/e2e-cdp-capture.spec.ts` (283)
- `tests/e2e/e2e-cdp-retry.spec.ts` (199)
- `tests/e2e/e2e-concurrent.spec.ts` (182)
- `tests/e2e/e2e-consistency.spec.ts` (109)
- `tests/e2e/e2e-console-errors.spec.ts` (128)
- `tests/e2e/e2e-cycle-integrity.spec.ts` (309)
- `tests/e2e/e2e-dashboard-list.spec.ts` (126)
- `tests/e2e/e2e-detail-tabs.spec.ts` (86)

## tests_e2e_03
- 模块：`tests_e2e`
- 文件：7；行数：1954

- `tests/e2e/e2e-export-content.spec.ts` (307)
- `tests/e2e/e2e-export.spec.ts` (315)
- `tests/e2e/e2e-helpers.ts` (167)
- `tests/e2e/e2e-labels.spec.ts` (85)
- `tests/e2e/e2e-logging.spec.ts` (482)
- `tests/e2e/e2e-mcp-full.spec.ts` (381)
- `tests/e2e/e2e-mcp.spec.ts` (217)

## tests_e2e_04
- 模块：`tests_e2e`
- 文件：12；行数：1935

- `tests/e2e/e2e-network.spec.ts` (163)
- `tests/e2e/e2e-qq.spec.ts` (117)
- `tests/e2e/e2e-real.spec.ts` (91)
- `tests/e2e/e2e-realtime-detail.spec.ts` (127)
- `tests/e2e/e2e-settings-effects.spec.ts` (282)
- `tests/e2e/e2e-sina.spec.ts` (118)
- `tests/e2e/e2e-states.spec.ts` (102)
- `tests/e2e/e2e-stop.spec.ts` (66)
- `tests/e2e/e2e-streaming-capture.spec.ts` (52)
- `tests/e2e/e2e-theme-i18n.spec.ts` (354)
- `tests/e2e/e2e-toggle-effects.spec.ts` (352)
- `tests/e2e/e2e-toutiao.spec.ts` (111)

## tests_e2e_05
- 模块：`tests_e2e`
- 文件：8；行数：829

- `tests/e2e/e2e-ui-audit.spec.ts` (116)
- `tests/e2e/e2e-websocket-capture.spec.ts` (56)
- `tests/e2e/e2e-xss.spec.ts` (327)
- `tests/e2e/e2e.spec.ts` (32)
- `tests/support/__mocks__/chrome_debugger.ts` (125)
- `tests/support/fixtures/server.ts` (79)
- `tests/support/fixtures/test-page.html` (40)
- `tests/support/helpers/wcag_contrast.ts` (54)

## tests_unit_01
- 模块：`tests_unit`
- 文件：4；行数：1250

- `tests/unit/agent_bridge_client.test.ts` (759)
- `tests/unit/agent_bridge_config.test.ts` (251)
- `tests/unit/agent_bridge_config_ui.test.ts` (113)
- `tests/unit/agent_bridge_queue.test.ts` (127)

## tests_unit_02
- 模块：`tests_unit`
- 文件：2；行数：1976

- `tests/unit/agent_bridge_server.test.ts` (1740)
- `tests/unit/agent_command_dispatcher.test.ts` (236)

## tests_unit_03
- 模块：`tests_unit`
- 文件：13；行数：1957

- `tests/unit/agent_data_queries.test.ts` (426)
- `tests/unit/agent_mcp_client.test.ts` (371)
- `tests/unit/agent_protocol.test.ts` (50)
- `tests/unit/app_log_storage.test.ts` (139)
- `tests/unit/archive_builder.test.ts` (287)
- `tests/unit/archive_config.test.ts` (28)
- `tests/unit/archive_entry.test.ts` (16)
- `tests/unit/body_routing.test.ts` (98)
- `tests/unit/capture_stats.test.ts` (45)
- `tests/unit/cdp_handler_redaction.test.ts` (160)
- `tests/unit/clipboard_capture.test.ts` (107)
- `tests/unit/console_capture.test.ts` (183)
- `tests/unit/content_event_utils.test.ts` (47)

## tests_unit_04
- 模块：`tests_unit`
- 文件：18；行数：1918

- `tests/unit/content_script_uses_poll.test.ts` (59)
- `tests/unit/dashboard_config_sync.test.ts` (79)
- `tests/unit/dashboard_timeline_marker.test.ts` (572)
- `tests/unit/default_config.test.ts` (8)
- `tests/unit/detail_layout_source.test.ts` (27)
- `tests/unit/detail_render_consistency.test.ts` (41)
- `tests/unit/detail_zoom_control.test.ts` (259)
- `tests/unit/devtools_panel.test.ts` (39)
- `tests/unit/dom_capture_privacy.test.ts` (68)
- `tests/unit/entry_unification.test.ts` (45)
- `tests/unit/escape.test.ts` (25)
- `tests/unit/escape_html.test.ts` (37)
- `tests/unit/event_category.test.ts` (12)
- `tests/unit/event_utils.test.ts` (45)
- `tests/unit/exception_capture.test.ts` (122)
- `tests/unit/export_integrity.test.ts` (88)
- `tests/unit/export_large_fix.test.ts` (283)
- `tests/unit/export_settings.test.ts` (109)

## tests_unit_05
- 模块：`tests_unit`
- 文件：13；行数：1990

- `tests/unit/export_utils.test.ts` (236)
- `tests/unit/exporter.test.ts` (195)
- `tests/unit/extension_icons.test.ts` (19)
- `tests/unit/external_cdp_bridge_client.test.ts` (297)
- `tests/unit/focus_capture.test.ts` (80)
- `tests/unit/form_submit_capture.test.ts` (87)
- `tests/unit/fullscreen_capture.test.ts` (45)
- `tests/unit/hash.test.ts` (20)
- `tests/unit/integration_page.test.ts` (186)
- `tests/unit/label_counts.test.ts` (148)
- `tests/unit/live_data_queries.test.ts` (502)
- `tests/unit/logger.test.ts` (92)
- `tests/unit/manifest_permissions.test.ts` (83)

## tests_unit_06
- 模块：`tests_unit`
- 文件：4；行数：1898

- `tests/unit/mcp_project_config.test.ts` (69)
- `tests/unit/mcp_schema.test.ts` (321)
- `tests/unit/network_capture.test.ts` (766)
- `tests/unit/network_cdp.test.ts` (742)

## tests_unit_07
- 模块：`tests_unit`
- 文件：10；行数：1530

- `tests/unit/network_correlator.test.ts` (315)
- `tests/unit/open_source_automation.test.ts` (422)
- `tests/unit/p036_user_action_filter.test.ts` (66)
- `tests/unit/p043_flush_before_read.test.ts` (96)
- `tests/unit/p060_capture_id.test.ts` (76)
- `tests/unit/package_metadata.test.ts` (111)
- `tests/unit/pipeline_consistency.test.ts` (68)
- `tests/unit/poll_capture_status.test.ts` (188)
- `tests/unit/popup_export.test.ts` (66)
- `tests/unit/popup_immediate_refresh.test.ts` (122)

## tests_unit_08
- 模块：`tests_unit`
- 文件：12；行数：1932

- `tests/unit/popup_layout.test.ts` (542)
- `tests/unit/popup_main_panel_url.test.ts` (15)
- `tests/unit/popup_start_timing.test.ts` (158)
- `tests/unit/print_capture.test.ts` (39)
- `tests/unit/public_docs.test.ts` (216)
- `tests/unit/redaction.test.ts` (203)
- `tests/unit/resize_capture.test.ts` (48)
- `tests/unit/service_worker_bridge_initialization.test.ts` (129)
- `tests/unit/service_worker_stale_cleanup.test.ts` (155)
- `tests/unit/session_manager.test.ts` (92)
- `tests/unit/settings_ui.test.ts` (162)
- `tests/unit/sidebar_resize.test.ts` (173)

## tests_unit_09
- 模块：`tests_unit`
- 文件：9；行数：1879

- `tests/unit/stop_capture.test.ts` (655)
- `tests/unit/storage.test.ts` (14)
- `tests/unit/storage_helpers.test.ts` (185)
- `tests/unit/stream_buffer.test.ts` (159)
- `tests/unit/streaming_capture.test.ts` (103)
- `tests/unit/sw_action_contract.test.ts` (85)
- `tests/unit/system_time.test.ts` (333)
- `tests/unit/tab_events.test.ts` (288)
- `tests/unit/tabs_send_message_retry.test.ts` (57)

## tests_unit_10
- 模块：`tests_unit`
- 文件：5；行数：700

- `tests/unit/ui_strings.test.ts` (164)
- `tests/unit/visibility_capture.test.ts` (41)
- `tests/unit/wcag_contrast.test.ts` (97)
- `tests/unit/websocket_capture.test.ts` (293)
- `tests/unit/websocket_capture_page.test.ts` (105)
