# 任务总清单

- ID 在此分配，全局递增；取 `docs/tasks/` 与 `docs/archive/tasks/` 中最大 ID 加一，无历史时从 T001 开始。
- 状态只使用：`backlog`、`active`、`done`、`dropped`。
- `backlog` 不建目录；`active` 必须有 `TNNN_slug/` 目录。
- `done` 及曾 active 的 `dropped` 任务目录必须移入 `docs/archive/tasks/`。
- owner 和 branch 表示当前归属；工作分支推荐 `task_tnnn_slug`。

| ID | 标题 | 状态 | owner | branch | 备注 |
|----|------|------|-------|--------|------|
| T001 | refactor: align agent docs layout with repo_template (Phase 0) | done | — | task_t001_align_repo_layout | commit `3a34685`；Phase 0 文档骨架 + 入口对齐 |
| T002 | refactor: move agent protocol into src/shared (Phase 2) | done | — | task_t002_shared_protocol_relocate | commit `5c21a50`；扁平 src/shared；extension/shared 下沉留 Phase 3 |
| T003 | refactor: move bridge sources to src/bridge (Phase 3a) | done | — | task_t002_shared_protocol_relocate | commit `e2a7f86` |
| T004 | refactor: move mcp sources to src/mcp (Phase 3b) | done | — | task_t002_shared_protocol_relocate | commit `0be0262`；src/agent/ 已删 |
| T005 | refactor: move extension surfaces + manifest + _locales (Phase 3c) | done | — | task_t002_shared_protocol_relocate | commit `cc399a4` |
| T006 | refactor: sink remaining extension-only shared into src/extension/shared/ | done | — | task_t002_shared_protocol_relocate | commit `410d1a4`；§4.3 表全闭合 |
| T007 | test: reorganize tests into unit/integration/e2e (Phase 4) | done | — | task_t002_shared_protocol_relocate | commit `3416dd6` + `70dde67`；三层 tests/{unit,e2e,support}/ |
| T008 | refactor: replace browser_no with browser_label + instance_id routing | done | — | main | commit `a408f24` + `89a88d4`；代码+文档；测试重写拆 T009/T010（注：T008 ID 复用，旧 T008_phase5_finalize 已在 archive） |
| T009 | test: rewrite browser_label config/UI tests (partial) | done | — | main | commit `e97d451`；config_ui + settings_ui 重写 |
| T010 | test: rewrite agent_bridge_client/server tests for label routing | done | — | main | commit `12a55bb`；21+73 测试全绿；0 skip |
| T011 | security: remove Bridge token from argv in SessionStart hook | active | claude | task_t011_security_argv_token | project_01/HIGH-1 |
| T012 | security: broaden URL query redaction + fix redact_password precedence | backlog | — | — | src_bridge_mcp_shared_02/HIGH-4 + HIGH-6 |
| T013 | privacy: keyboard shortcuts redaction + form_action URL + storage tab_id | backlog | — | — | src_extension_05/HIGH-1/2/3 + LOW-12 |
| T014 | privacy: WebSocket URL/header/payload redaction | backlog | — | — | src_extension_02/HIGH-3 + src_extension_03/HIGH-7 |
| T015 | privacy: logger URL redaction + size limit | backlog | — | — | src_bridge_mcp_shared_02/HIGH-3 |
| T016 | privacy: honor capture_response_body config in CDP capture | backlog | — | — | src_extension_02/HIGH-2 |
| T017 | privacy: console/exception source filter + startup failure cleanup | backlog | — | — | src_extension_02/HIGH-5 + HIGH-7 |
| T018 | correctness: globally unique Bridge command IDs + COMMAND_CANCELLED | backlog | — | — | src_bridge_mcp_shared_01/HIGH-1 + MEDIUM-5 |
| T019 | correctness: CDP events no-loss + CDP error terminal state | backlog | — | — | src_bridge_mcp_shared_01/HIGH-3/4 |
| T020 | correctness: input_event event_id via unified event creation | backlog | — | — | src_bridge_mcp_shared_02/HIGH-1 |
| T021 | correctness: WebSocket singleton listener + removeEventListener + UTF-8 byte size | backlog | — | — | src_extension_06/HIGH-1/2 + LOW-18 |
| T022 | refactor: CDP state keyed by sessionId + requestId | backlog | — | — | src_extension_02/HIGH-1/4 + src_extension_03/HIGH-2 |
| T023 | correctness: cdp finished_before_stream / cdp_primary_emitted / orphan timer cleanup | backlog | — | — | src_extension_02/HIGH-8 + src_extension_03/HIGH-3/5 + MEDIUM-10 |
| T024 | correctness: stream_buffer async backpressure + finish removes entry | backlog | — | — | src_extension_04/HIGH-9/10 + LOW-21 |
| T025 | correctness: loadingFailed main event + webRequest error + deferred cleanup | backlog | — | — | src_extension_03/HIGH-4 + src_extension_04/MEDIUM-18 |
| T026 | correctness: SSE cumulative body byte cap | backlog | — | — | src_extension_03/CRITICAL-1 |
| T027 | correctness: HTTP redirect chain preservation | backlog | — | — | src_extension_03/MEDIUM-8 |
| T028 | spike: SW capture state machine design | backlog | — | — | src_extension_04/CRITICAL-1/2 设计 |
| T029 | refactor: SW start/stop serialization + state machine | backlog | — | — | src_extension_04/CRITICAL-2（依赖 T028） |
| T030 | refactor: SW restart active capture recovery | backlog | — | — | src_extension_04/CRITICAL-1（依赖 T029） |
| T031 | refactor: SW stop drain order (producers before state flip) | backlog | — | — | src_extension_04/HIGH-5（依赖 T029） |
| T032 | refactor: SW start rollback on partial failure | backlog | — | — | src_extension_04/HIGH-6（依赖 T029） |
| T033 | refactor: SW async listener generation check | backlog | — | — | src_extension_04/HIGH-7（依赖 T029） |
| T034 | fix: SW stop clears current_capture_id/start_time/config | backlog | — | — | src_extension_04/MEDIUM-16 |
| T035 | fix: IndexedDB transaction commit boundary + flush retry | backlog | — | — | src_extension_04/HIGH-4 + src_extension_01/MEDIUM-7 + MEDIUM-12 |
| T036 | fix: delete_capture single transaction across stores | backlog | — | — | src_extension_04/HIGH-8 |
| T037 | fix: bytes_written persisted in CaptureRecord | backlog | — | — | src_extension_04/MEDIUM-15 |
| T038 | fix: storage buffer durability (persist before ack) | backlog | — | — | src_extension_04/HIGH-3 |
| T039 | feature: captures list search/filter/reset wiring | backlog | — | — | src_extension_06/HIGH-4 |
| T040 | feature: exports page wiring | backlog | — | — | src_extension_06/HIGH-5 |
| T041 | refactor: dashboard polling single-flight + incremental + a11y | backlog | — | — | src_extension_06/MEDIUM-6/7/8/14/15/16/17/19 |
| T042 | fix: navigation event table column schema | backlog | — | — | src_extension_06/MEDIUM-11 |
| T043 | refactor: export pagination/streaming (replace 100000 silent truncation) | backlog | — | — | src_extension_01/HIGH-3 + src_extension_02/HIGH-9 |
| T044 | security: HTML export escape all dynamic fields | backlog | — | — | src_extension_02/MEDIUM-18 |
| T045 | fix: HAR body size uses real bytes | backlog | — | — | src_extension_02/MEDIUM-20 |
| T046 | refactor: agent command result delivery retry + idempotency | backlog | — | — | src_extension_01/HIGH-1 |
| T047 | fix: browser_label sync to enrolled instance via heartbeat | backlog | — | — | src_extension_01/HIGH-2 |
| T048 | fix: agent dispatcher structured errors + offset/limit + unknown command | backlog | — | — | src_extension_01/MEDIUM-8/9/10 |
| T049 | fix: app_log pagination boundary + size estimate + flush retry | backlog | — | — | src_extension_01/MEDIUM-5/6/7 |
| T050 | fix: body_capture_coordinator single-flight + lifecycle token | backlog | — | — | src_extension_01/HIGH-4 |
| T051 | privacy: cookie listener scoped to target tab domain | backlog | — | — | src_extension_02/HIGH-6（产品默认：限定范围） |
| T052 | security: external bridge URL allowlist (127.0.0.1 only) | backlog | — | — | src_extension_02/HIGH-10 |
| T053 | fix: self_origin_url filter precise to configured Bridge origin | backlog | — | — | src_extension_02/MEDIUM-11 + src_extension_04/MEDIUM-19 |
| T054 | fix: webRequest response body bytes/encoding populated | backlog | — | — | src_extension_04/MEDIUM-20 |
| T055 | fix: HTTP headers preserve multi-value (Set-Cookie etc) | backlog | — | — | src_extension_03/MEDIUM-12 |
| T056 | fix: network_correlator merge_matched uses non-empty check | backlog | — | — | src_extension_03/MEDIUM-13 |
| T057 | refactor: error code term migration (SESSION/RECORDING → CAPTURE, alias compat) | backlog | — | — | src_bridge_mcp_shared_02/HIGH-2 |
| T058 | refactor: event_category exhaustive mapping | backlog | — | — | src_bridge_mcp_shared_02/MEDIUM-8 |
| T059 | refactor: event_id uses crypto.randomUUID | backlog | — | — | src_bridge_mcp_shared_02/MEDIUM-5 |
| T060 | refactor: UserConfig runtime schema validation | backlog | — | — | src_bridge_mcp_shared_02/MEDIUM-7 |
| T061 | refactor: CDP target URL strict match (no silent fallback) | backlog | — | — | src_bridge_mcp_shared_01/HIGH-2 |
| T062 | fix: /cdp/start waits for WebSocket open + Network.enable | backlog | — | — | src_bridge_mcp_shared_01/MEDIUM-7 |
| T063 | fix: max_body_capture_bytes + bridge timeout boundary validation | backlog | — | — | src_bridge_mcp_shared_01/MEDIUM-6 + LOW-9 |
| T064 | security: persisted token file permission verify/chmod | backlog | — | — | src_bridge_mcp_shared_01/MEDIUM-8 |
| T065 | fix: ws_connections cap + clear on capture stop | backlog | — | — | src_extension_05/MEDIUM-7 + LOW-11 |
| T066 | fix: network_hook UTF-8 safe truncation | backlog | — | — | src_extension_05/MEDIUM-6 |
| T067 | fix: mouse wheel/drag target info + keyboard target_input_type | backlog | — | — | src_extension_05/LOW-10 |
| T068 | fix: keepalive listener idempotent | backlog | — | — | src_extension_02/LOW-22 |
| T069 | fix: deferred body association disambiguation (mark ambiguous, no guess) | backlog | — | — | src_extension_03/MEDIUM-9 + src_extension_04/HIGH-11 |
| T070 | fix: external bridge response schema validation + session_key in header | backlog | — | — | src_extension_02/MEDIUM-15/16/17 |
| T071 | security: WebSocket capture per-page nonce + strict schema | backlog | — | — | src_extension_06/HIGH-3 |
| T072 | fix: WsFrameData.session_id deprecated alias | backlog | — | — | src_bridge_mcp_shared_02/LOW-10 |
| T073 | test: T008 residual browser_no tests cleanup + finalize archive | backlog | — | — | docs_01/HIGH-03 + MEDIUM-14/15 |
| T074 | docs: README 64 MiB + refactor_plan reference cleanup | backlog | — | — | project_01/MEDIUM-1/2 |
| T075 | docs: AGENTS/CLAUDE/SECURITY/decisions token model unification | backlog | — | — | project_01/MEDIUM-3/4 + docs_01/MEDIUM-05 |
| T076 | docs: deployment guide bridge --port + token + log location | backlog | — | — | docs_01/HIGH-05/06 + MEDIUM-09 |
| T077 | docs: mcp_usage guide rewrite (browser_no → browser_label/pairing) | backlog | — | — | docs_01/HIGH-04 + MEDIUM-10 |
| T078 | docs: contributing_dev full rewrite against current tree | backlog | — | — | docs_01/MEDIUM-08 |
| T079 | docs: test.md rebuild from package.json/vitest/playwright | backlog | — | — | docs_01/MEDIUM-11 |
| T080 | docs: blueprint cleanup (architecture/domain/conventions/decisions broken links + counts) | backlog | — | — | docs_01/MEDIUM-01~07 + LOW-01 |
| T081 | docs: troubleshooting focuses on active capture/content script first | backlog | — | — | docs_01/LOW-02 |
| T082 | docs: store_publish_list PII disclosure + icon path + storage permission | backlog | — | — | docs_01/HIGH-07 + MEDIUM-12 |
| T083 | docs: handoff append post-T008 status | backlog | — | — | docs_01/MEDIUM-13 |
| T084 | docs: PR template narrow .claude scope | backlog | — | — | project_01/LOW-1 |
| T085 | tooling: scan_tracked_tree skip docs/archive + AST-based credential detection | backlog | — | — | project_02/HIGH-1/2 |
| T086 | tooling: vite build time deterministic + indent + zip dep declare | backlog | — | — | project_02/MEDIUM-5/LOW-3/LOW-6 |
| T087 | tooling: store screenshots output path + outline_svg font_family | backlog | — | — | project_02/MEDIUM-4/LOW-7 |
| T088 | tooling: Playwright reuseExistingServer=false in CI | backlog | — | — | project_02/MEDIUM-3 |
| T089 | docs: task spec template enhancements (AC format, decisions, constraints) | backlog | — | — | docs_02 全部 |
| T090 | refactor: export memory streaming (avoid full materialization) | backlog | — | — | src_extension_02/MEDIUM-19 |
