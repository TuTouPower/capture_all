# 项目交接记录

项目级交接放这里，不设 task 内交接。

追加式记录：交接者只新增段落，不删除或改写历史。接手者先读本文件，再按需下钻 task。

每段交接使用以下格式（以下为格式模板，不是真实记录）：

```markdown
## YYYY-MM-DD HH:MM UTC+8 from_owner → to_owner

- 当前焦点：{task ID 或议题}
- branch：`{branch；无则写"无"}`
- head_commit：`{已存在的 commit SHA；无则写"无"}`
- 已完成：{列点}
- 未完成：{列点}
- 陷阱：{已知坑或反直觉处}
- 下一步：{接手者首要行动}
```

---

## 2026-07-19 07:50 UTC+8 — repo layout refactor 完成

- 当前焦点：`docs/refactor_plan.md` 全部 Phase 闭合；剩 merge main
- branch：`task_t002_shared_protocol_relocate`（基于 `task_t001_align_repo_layout`）
- head_commit：`70dde67 test: update vitest/playwright/package config for new test tree`
- 已完成（自上次交接起新增）：
  - **T006** `410d1a4`：§4.3 表剩余 10 个扩展专用 shared 下沉到 `src/extension/shared/`（i18n / theme / design_tokens.css / chrome.d.ts / export_utils / export_settings / archive_builder / capture_stats / poll_capture_status / dom_utils）；blueprint/architecture.md 同步去掉"待 T006"标注
  - **T007 Commit A** `3416dd6`：测试树重组——`tests/*.test.ts` → `tests/unit/`；`tests/*.spec.ts` + `e2e/{T0001,T0002,T0003}/` → `tests/e2e/`；`tests/{__mocks__,fixtures,helpers}/` → `tests/support/`；根 `e2e/` 删除；测试间互引、src 引用深度、root resolution 全修
  - **T007 Commit B** `70dde67`：config 调整——vitest exclude 加 `tests/{e2e,support}/**`；playwright testDir `./tests/e2e`、e2e-t0001/t0003 testDir 同步；`webServer url` 修 `/src/extension/popup/popup.html`（T005 漏）；`test:e2e:server` script 路径同步
- 全部 commits（重构主体）：
  - `3a34685` T001 Phase 0 docs alignment
  - `c7bea96` finalize T001
  - `5c21a50` T002 Phase 2 protocol relocate
  - `e2a7f86` T003 Phase 3a bridge relocate
  - `0be0262` T004 Phase 3b mcp relocate
  - `cc399a4` T005 Phase 3c extension relocate
  - `0cfc760` T008 Phase 5 partial finalize（blueprint + scanner + settings.json）
  - `901aa39` archive T008 + handoff
  - `410d1a4` T006 extension-only shared sink
  - `3416dd6` T007A test tree relocate
  - `70dde67` T007B config updates
- 未完成：仅剩 merge main（两分支链：`task_t001_align_repo_layout` → `task_t002_shared_protocol_relocate`）
- 陷阱（更新）：
  - **T007 unit 内部未细分 integration**：`tests/unit/` 含所有 .test.ts，未按"模块协作 vs 纯逻辑"再细分。后续可把大文件（`agent_bridge_server.test.ts` 66K、`dashboard_timeline_marker.test.ts` 22K 等）从 unit/ 移到新建 `tests/integration/`。
  - **playwright webServer 启动依赖 build**：`npm run test:e2e` 跑前需 `npm run build` 产出 `artifacts/dist/`，否则 webServer url 找不到 HTML。
  - **scanner 仍报 `.claude/settings.json` forbidden-path**：pre-existing，非本次回归。
- 下一步：merge main。建议顺序：先 `task_t001_align_repo_layout` → main，再 rebase `task_t002_shared_protocol_relocate` 到 main，最后 merge task_t002。

---

## 2026-07-20 交接：审阅修复 T011-T088（main）

- **branch**: `main`
- **head_commit**: `874ebc3`
- **状态**: T011-T088 共 78 个 task 已完成（含 T001-T010 之前的 + T011-T088 本轮）。
- **本轮完成范围**:
  - P0 安全/隐私：T011-T017（token argv、URL 脱敏、redact_password、keyboard shortcuts、form_action URL、storage tab_id、WebSocket 脱敏、logger 脱敏、capture_response_body 配置、console/exception source filter）
  - P0 正确性：T018-T027（命令 ID 全局唯一、CDP events 不丢、input_event event_id、WebSocket 单监听器、CDP 复合键、CDP 状态清理、stream_buffer 生命周期、loadingFailed 事件、SSE 字节上限、重定向链保留）
  - SW 状态机：T028 spike + T029-T034（串行化、重启恢复、stop drain、start 回滚、listener generation、context clear）
  - 存储/事务：T035-T038（tx.oncomplete、delete_capture 单事务、bytes_written UTF-8、buffer durability）
  - Dashboard：T039-T042（搜索/筛选/导出 wiring、轮询单飞、navigation 列数）
  - 导出/Agent：T043-T050（分页替代截断、HTML 转义、HAR 字节、结果投递重试、browser_label sync、dispatcher 错误码、app_log 分页、body coordinator 单飞）
  - 隐私/安全：T051-T053（cookie scope、bridge URL allowlist、self_origin 精确化）
  - 网络细节：T054-T056（body bytes、header 多值、correlator merge）
  - 协议/分类：T057-T060（错误码别名、event_category exhaustive、event_id UUID、UserConfig schema）
  - CDP/Bridge：T061-T063（target strict、connect status、boundary validation）
  - 杂项：T064-T068（token file perm、ws cap、mouse target、keepalive idempotent）
  - WS 修复：T072（session_id deprecated）
  - 文档/CI：T074-T075（README 64MiB、token model）、T084-T088（PR template、scan archive skip、vite build time、screenshots path、playwright CI）
- **未完成 backlog**: T069-T071（deferred disambiguation、external bridge response schema、WebSocket nonce）、T073（T008 finalize）、T076-T083（deployment/mcp_usage/contributing_dev/test.md/blueprint/troubleshooting/store_publish_list 文档重写）、T089（task spec template）、T090（export streaming）。
- **测试状态**: `npm test` 102 文件 / 1137 用例全绿；`tsc --noEmit` 无错误。
- **下一步**: 按优先级完成剩余 backlog；T076-T083 文档重写工作量大但风险低。

