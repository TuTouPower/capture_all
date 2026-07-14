# Issues 轻量分诊（2026-07-14）

未改各 issue 状态（避免误关）。建议下次 `/optriage` 按下列处理：

| 建议 | issues |
|------|--------|
| **P2 转 task（可下一轮 intake）** | `issue_exception_subtarget_gap`（Runtime.enable 子目标）、`issue_performance_label_gap`、`issue_sw_messaging_gap` / `issue_sw_sendmessage_retry` |
| **P3 tech-debt 登记不转** | `issue_jsonl_terminator_spec`、`issue_mcp_mode_residual`、`issue_payment_drm_gap`、`issue_stats_counts_drift`、`issue_t0003_grep_test_hit` |
| **已 closed** | `issue_t0003_ac1_source_regression`（E2E 已补） |

T0001 验收报告中 zoom 默认值 / lane 空载等若仍存在，应单独 `/opintake` 开 fix，勿依赖历史 PASS 报告。
