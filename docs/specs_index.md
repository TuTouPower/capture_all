# 当前生效 spec 清单

在表即生效。每个 task 收尾时写入或更新对应行（须已过黑盒）；废弃时整行删除，spec 移入 `docs/archive/specs/`。历史清单由 `docs/archive/specs/` 目录承载。替代旧需求时在 `supersedes` 列填旧 slug；无则填 `-`。

| slug | task 清单 | 最后更新时间 |
|------|----------|--------------|
| user_config | t092 | 2026-08-11 |
| runtime_exception | t093 | 2026-08-11 |
| network_capture_session_key | t094, t112 | 2026-08-11 |
| body_external_poll_stop | t095 | 2026-08-11 |
| bridge_auto_export_path | t096 | 2026-08-11 |
| content_postmessage_nonce | t097 | 2026-08-11 |
| network_hook_config_gate | t098 | 2026-08-11 |
| sw_cleanup_stale_mutex | t099 | 2026-08-11 |
| privacy_logger_stack_redact_url | t100, t113, t114 | 2026-08-11 |
| bridge_cdp_idle_and_bounds | t101 | 2026-08-11 |
| agent_result_lifecycle_delivery | t102 | 2026-08-11 |
| network_stop_deferred_timers | t103 | 2026-08-11 |
| cookie_empty_domain_scope | t104 | 2026-08-11 |
| content_status_poll_tab_id | t105 | 2026-08-11 |
| popup_category_capture_gates | t106 | 2026-08-11 |
| dashboard_export_flush_save_as | t107, t115 | 2026-08-11 |
| detail_search_preserve_input | t108 | 2026-08-11 |
| archive_body_ref_consistency | t109 | 2026-08-11 |
| test_case_coverage_pack | t116 | 2026-08-11 |
| dead_code_shared_helper_cleanup | t117 | 2026-08-11 |
<!-- 示例行（实际项目使用时从真实 task 收尾开始填写；示例勿放表内，「在表即生效」）：
| example_slug | t000 | 2026-07-21 |
-->
