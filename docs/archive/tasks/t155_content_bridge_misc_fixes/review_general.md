# Task review t155（reviewer_focus: 通用）

- task：`t155_content_bridge_misc_fixes`
- spec：`docs/tasks/t155_content_bridge_misc_fixes/spec.md`
- diff_anchor：HEAD
- target：`git diff HEAD`
- round：1
- reviewed_at：2026-08-13 04:02 UTC+8

## Findings

### t155_gen_f001 - 部分 AC 用源码扫描测试兜底，非行为测试

- 严重度：minor
- 锚点：AC-003 / AC-007 / AC-013 / AC-015 / AC-016
- 位置：`tests/unit/content_script_uses_poll.test.ts`（B3-M8、B3-L6 两个 it）、`tests/unit/service_worker_t155_guards.test.ts`（整文件）
- 问题：以上断言均为源码字符串扫描（`src` 匹配正则），不触达运行时行为。能守住「修复被 revert 即测试失败」，但测不出行为级回归——例如 content onMessage 的 else 分支虽调用 sendResponse，若 `return true` 导致通道仍不 resolve（正则不覆盖的行为缺陷）此类测试照样绿。service_worker_t155_guards 较优（含 `is_active_generation(gen)` 位于 `increment_capture_event_stats` 之前的次序断言），仍是静态扫描。
- 建议：content_script.ts / service_worker.ts 顶层注册 chrome 监听致无法直接 import 是客观约束，源码扫描可作守卫生；后续 task 可在可行处把 onMessage handler、start 并行通知、generation 守卫逻辑抽成可 import 单元做行为级单测。

### t155_gen_f002 - clipboard 去重窗口可能吞真实连续操作

- 严重度：minor
- 锚点：AC-018（clipboard 去重）
- 位置：`src/extension/content/clipboard_capture.ts:85-88`（DEDUP_WINDOW_MS=50）
- 问题：去重以纯时间窗 `Date.now() - last_emit_ts[action] < 50` 判定。同 action 两次真实且独立的操作落在 50ms 窗口内时第二条被静默丢弃（如页面同一 tick 内两次 `navigator.clipboard.writeText`，或极快连续复制）。属预期去重的数据丢失边角。
- 建议：去重条件叠加事件内容匹配（如 method/type 相同才视为同一操作），而非仅时间窗。

### t155_gen_f003 - AC-018「按项单测」部分未落实

- 严重度：minor
- 锚点：AC-018 可测试性声明
- 位置：`tests/unit/exporter.test.ts`（total_size_kb 无断言）、`body_capture_coordinator.ts:convert_bridge_event_to_request`（B2-L5 无直接单测）、`storage.ts:262`（B2-L7 dom_data 映射无路由断言）
- 问题：B2-L1 total_size_kb 改为实际字节数后 exporter.test.ts 仅冒烟覆盖 export_html，未断言该值；B2-L5 bridge 相对时间修正与 B2-L7 dom_data store 映射无直接断言。三项均有实现、无测试，覆盖缺口非阻塞。
- 建议：下轮在 exporter/coordinator/storage 测试中补三条断言（total_size_kb>0、relative_time=timestamp-start_time clamp、dom_data 事件落 USER_ACTION_EVENTS store）。

## 结论

- 本轮新发现：3 条（均 minor）
- 未进表的提示：`parse_local_bridge_url` 对非 http/https scheme 的错误消息由 'Bridge URL must use http' 变为 'scheme must be http/https'（行为变化非契约，测试未锁此文案）；web_request 路径 `response_body_encoding` 经 `extra` 显式置 null，与 cdp_primary/orphan/correlator 三条 CDP 路径的 base64 透传一致，B1-L5 无遗漏路径。
- 总体判断：19 条 AC 全部实现且实现正确（逐条核验含 `self` 绑定、generation API、theme 单源、编码透传、URL 口径统一），1604 测试全绿、无既有语义回退；仅 3 条 minor 测试质量/边角观察，无未解决 critical/important，可 PASS。
- 系统性 follow-up：无

verdict: PASS
