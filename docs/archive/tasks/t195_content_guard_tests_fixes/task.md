# Task spec

## 背景

content 层三处遗留（pending 总账）：`storage_capture.ts` 注入脚本仍内联 `SYNC_HMAC_JS` 与重注入还原守卫（network_hook/websocket_capture 已迁移 `content_page_script.ts` 共享模板，p033 双份维护风险）；`clipboard_capture.ts` 去重以纯时间窗 `Date.now() - last_emit_ts[action] < 50ms` 判定，同 tick 两次真实独立操作第二条被静默丢弃（p043）；content_script/service_worker 顶层注册 chrome 监听致无法 import，onMessage 未知 action、start 并行通知、generation 守卫等 AC 仅源码字符串扫描兜底（p042，测不出行为级回归）。

## 契约区

### 范围

- `storage_capture.ts` 注入脚本迁移到 `content_page_script.ts` 共享模板（`page_script_reinstall_guard` / `page_script_preamble` / `page_script_restore`），消除内联重复。
- `clipboard_capture.ts` 去重条件叠加事件内容匹配（同 action 且 method/type 相同才视为同一操作），非仅时间窗。
- content_script/service_worker 顶层 listener 守卫逻辑（onMessage 分支、start 并行通知、generation 守卫）抽成可 import 单元，补行为级单测。

### 非范围

- 不改变采集数据格式与既有行为语义（去重窗口语义除外，见 AC-002）。
- 不改动 network_hook/websocket_capture 已迁移实现。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。创建时均为未勾选（`- [ ]`）；实施验证通过后由实施 Agent 就地打勾（`- [x]`）；由 Review Agent 独立复核打勾真实性。技术选型不作为行为 AC。review 判 FAIL 且需修改交付内容时，实施 Agent 撤回全部打勾，修复并重验后重新打勾；reviewer 用 `TICK-VALID` / `TICK-VOID` 逐条判定。

<!-- /规范 -->

- [ ] AC-001：`storage_capture.ts` 注入脚本经共享模板生成（不再内联 `SYNC_HMAC_JS` 与还原守卫），与 network_hook/websocket_capture 同构。
- [ ] AC-002：clipboard 同 action 两次独立操作（不同内容）均产生事件（时间窗内不同内容不再被误去重）；同内容重复仍去重。
- [ ] AC-003：content onMessage 未知 action 分支行为级测试——返回 `{success:false, error:'unknown_action'}` 且通道正常 resolve（无 return true 挂起）。
- [ ] AC-004：start 并行通知（Promise.all 全部 tab）与 generation 守卫行为级测试通过。
- [ ] AC-005：新增测试全绿，既有 content 相关测试无回归。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试：抽取的纯函数/模块可 import 行为测试；storage_capture 模板迁移以源码同构断言 + 注入行为测试。

## 上下文区

- 来源：p033（t126 code_review 观察）、p042（t155 遗留）、p043（t155 遗留）。2026-08-14 核实：storage_capture.ts:5,56 仍内联 SYNC_HMAC_JS；clipboard_capture.ts:16 仍纯时间窗；content 顶层监听未抽单元。

### 有意不测

- 无。

### 测试策略

- 抽函数/模块行为单测 + 模板迁移源码同构断言。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：storage_capture 模板迁移改变注入行为。
- 回退：迁移后跑既有 storage/websocket 注入测试；模板生成脚本与 network_hook 共用，行为等价。

### 依赖与约束

- 复用 `content_page_script.ts` 现有模板函数。

### Finalization 时更新的 blueprint

- 无。
