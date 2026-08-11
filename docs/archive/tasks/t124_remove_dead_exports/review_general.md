# Task review t124（reviewer_focus: 通用）

- task：`t124_remove_dead_exports`
- spec：`docs/tasks/t124_remove_dead_exports/spec.md`
- diff_anchor：`6c562ac1af850795109aacd010714f855c2ad15b`
- target：`git diff 6c562ac1af850795109aacd010714f855c2ad15b`
- round：1
- reviewed_at：2026-08-11 20:52 UTC+8

reviewed_scope: 466921b1cc169f34

## Findings

无（clean review，0 finding）。

已核对项：

- `storage.ts` deprecated aliases 块（create_session/get_session/list_sessions/update_session/delete_session/write_requests/write_logs/write_errors/get_session_size/get_events/get_console_logs/get_error_logs）整体删除；存活函数（create_capture/get_capture/list_captures/write_network_requests/write_console_events/write_error_events/get_capture_size/get_events_by_category/get_console_events/get_error_events）未受影响。
- 3 个特化 write 函数（write_storage_changes/write_cookie_changes/write_lifecycle_events）全仓 0 引用；替代写入路径确认存在：storage（content storage_capture.ts:171 产 category 'storage'）、cookie（cookie_capture.ts:89 产 category 'cookie'）、lifecycle（service_worker.ts:456/706/783/896/989/1080/1113 直调）均经通用 `write_events` → `CATEGORY_STORE_MAP`（storage.ts:243-251）路由到对应 store，数据路径无损。
- `_selected`（dashboard_shared.ts:25）删除 set_selected 后仍由 `get_selected()` 返回的活 Set 就地 add/delete/clear（dashboard_captures.ts:33/128/180），无调用方依赖整体替换，非写死状态。
- agent_bridge_client 删除两个测试访问器后 `runtime_instance_id` 仍有内部读写（行 19/194/204/229/231/270/286/326），模块状态完整。
- network_webrequest 删除 create_webrequest_handlers 时一并移除仅其使用的 `NetworkCaptureContext` import，其余导出（headers_array_to_map/extract_request_body/extract_mime_type）保留。
- storage.test.ts 符号迁移 `get_session_size`→`get_capture_size`，断言仍触达真实行为（unknown capture 返回 0、限额检查返回 false），非 mock 路径。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无
- 本轮新发现：0
- 未进表的提示：MCP 层 `get_session`/`list_sessions`（src/mcp/tools.ts、schemas.ts）与 storage alias 同名，但为独立 MCP 工具定义，非 storage.ts 引用，不构成 AC-001 违规。
- 总体判断：范围外内容未动，死导出删除干净，测试与类型检查全绿，无未解决 blocking。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified` — 对 21 个目标符号逐一 grep `src/ tests/`（词边界），零引用（同名的 get_session/list_sessions 仅命中 MCP 工具定义，非 storage alias 引用）。
- AC-002：`re_verified` — i18n.ts:365 `detect_locale` 已改私有，:385 `init_locale` 内部仍调用，全仓无其他引用。
- AC-003：`re_verified` — network_webrequest.ts 全文件 grep `require` 无命中。
- AC-004：`re_verified` — 实跑 `npm test` 129 文件 / 1368 测试全过；`npx tsc --noEmit` exit 0。

coverage = 4 / 4

verdict: PASS
