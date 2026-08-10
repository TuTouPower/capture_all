# Task plan - T025 loading_failed_events

## 步骤

1. 红：新建 tests/unit/loading_failed_events.test.ts 覆盖 3 项验收。
2. 红：跑测试失败。
3. 绿：
   - cdp_handler.handle_loading_failed：已有 meta 时直接 emit 主条目（build_cdp_primary_network_event）+ 清理 meta/body/finished_before_stream/orphan_timer；否则保留 orphan_check。
   - webrequest_handler.handle_error：emit 失败事件；清理 pending/deferred。
   - network_context.reset：先 clearTimeout 全部 deferred timer。
4. 全量 npm test + tsc --noEmit。
5. log + commit + 归档。

## 风险与回退

- 风险：handle_error 重写可能破坏现有 webRequest 测试。缓解：grep 现有断言。
- 回退：`git revert <commit>`。
