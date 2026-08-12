# Task review t146（reviewer_focus: 代码）

- task：`t146_message_contract_unify`
- spec：`docs/tasks/t146_message_contract_unify/spec.md`
- diff_anchor：`17cde0df6d476d46f988cfc87dca80fcfc7b96c1`
- target：`git diff 17cde0df6d476d46f988cfc87dca80fcfc7b96c1`
- round：1
- reviewed_at：2026-08-12 21:31 UTC+8

reviewed_scope: 0c11981406c83678

## Findings

### t146_code_f001 - UiResponse 非判别联合，success 未携带 data 类型保证

- 严重度：minor
- 锚点：AC-002（类型共享的严格程度）
- 位置：`src/shared/message_contract.ts:97-101`（`UiResponse<T>` 定义）
- 问题：`UiResponse<T> = { success: boolean; data?: T; error?: string }`。TS 无法从 `success: true` 推导 `data` 存在，故 `r.data` 在成功分支类型仍为 `T | undefined`，每个调用点都需运行时兜底：popup `load_history` 用 `resp?.data ?? []`、dashboard `load_captures` 用 `resp?.data ?? []`、`load_detail` 用 `r.data ?? null`、dashboard_settings `export_app_logs` 用 `r.data as BlobPart`。SW 成功时恒带 `data`，运行时无缺陷；但类型层未完全兑现 AC-002「类型化收发」意图——未来新调用点若只判 `success` 便直读 `data`（如 `get_capture_data` 未命中时 `data` 为 undefined），会拿到类型撒谎的 `undefined`。属类型严格度缺口，非行为 bug。
- 建议：改判别联合 `type UiResponse<T> = { success: true; data: T } | { success: false; error?: string }`。运行时形状不变（仍满足 AC-001 的 `{ success, data?, error? }`），且调用点 `if (!r?.success) return;` 之后 `r.data` 自动收窄为 `T`，各 `?? []`/`?? null`/`as BlobPart` 兜底可移除。

### t146_code_f002 - wrap_result 以 `'success' in result` 结构化判定，隐性耦合

- 严重度：minor
- 锚点：无 AC 违反（代码质量 / 防御性设计）
- 位置：`src/extension/background/service_worker.ts:212-222`（`wrap_result`）
- 问题：`wrap_result` 用 `typeof result === 'object' && 'success' in result` 判断「操作结果」。当前所有传入值（start/stop/event 操作结果、get_status 状态对象、CaptureRecord、数组、导出字符串）均不含 `success` 键冲突，判定正确。但该 helper 对任何「含 success 键的纯数据对象」都会误判为操作结果重包——若未来某 action 的 data 对象（如 `CaptureRecord` 演进或新增状态字段）引入 `success` 字段，响应会被静默改形（操作结果语义 + 数据对象语义混淆）。属结构耦合的潜在 footgun，当前无可观测缺陷。
- 建议：操作结果类型加显式 marker（如 `{ op: true; success; ... }`）替代结构判断，或按 action 白名单决定是否 wrap。不做也可，属防御性设计。

## 结论

- 前轮 finding 复核：Round 1，无前轮。
- 本轮新发现：2 条（均 minor）。
- 未进表的提示：
  - 文件过大：`src/extension/background/service_worker.ts` 共 1231 行（超过 important 阈值 800），本 task 净增 +22 行（numstat +64/-42）。MV3 service worker 协议一体单文件，属不可拆硬约束，按降级规则仅列出，不出 finding。`src/shared/message_contract.ts` 新建 113 行，未超阈值。
  - 圈复杂度：`handle_message` 为大 switch 分发、每支单行转发，按「表驱动 / 大 switch 分发函数」排除规则不计；`wrap_result`、`refresh_counts` 等 CC 均低。无 ≥10 项。
  - 范围外观察：无。
- 总体判断：契约统一实现正确，`tsc --noEmit` 通过，逐 action 行为等价核对无回归，无 blocking finding；仅 2 条 minor（类型严格度 + wrap_result 防御性建议）。
- 系统性 follow-up：无。

### AC 复验方式

- AC-001：`re_verified`。grep 全 `src/` 消息面：popup/dashboard 4 文件全部改经 `send_ui_message`（发送 `{ action, payload }`）；SW `handle_message` 从 `payload` 取参、全部 case 经 `wrap_result` 出 `{ success, data?, error? }`；devtools 无独立消息面（`devtools.ts` 仅 `devtools.panels.create`，`devtools_panel.ts` 为日志壳）；content 内部 `event`/`app_log_batch` 保持扁平；content→SW `get_status` 响应解包 `data`。残留裸 `sendMessage` 仅 logger.ts（app_log_batch 扁平）、content_script.ts 事件与 get_status（均在契约外）。
- AC-002：`re_verified`。运行 `npx tsc --noEmit -p tsconfig.json` exit 0（strict + noUnusedLocals 开启，无类型错误）；`UiPayloadMap`/`UiDataMap` 与 SW 各 case 返回逐字段核对一致（start/stop 操作结果、get_status 7 字段、list_captures 数组、export 字符串、log 系列等）。
- AC-003：`re_verified`。对比基线 `17cde0d` 版 service_worker.ts：`get_status` tab_id 以 `sender?.tab?.id` 权威回填保留；`start`/`stop`/`list_captures`/`delete_capture`/`flush`/log 系列响应形状迁移后调用方全部随 `data` 同步读取；content 内部 `event`/`app_log_batch` 扁平未破坏（content 侧 `.catch` 忽略响应，storage_limit 测试仍断言顶层 `success`）；export 返回内容置于 `data`，dashboard 非 archive 路径读 `r.data`，popup export 仅依赖 `resp?.success` + snapshot。注：真实浏览器端到端行为依赖测试侧，代码路径核对完成。
- AC-004：`re_verified`。conventions.md 消息通信节与实现逐条对照：请求/响应形状、`send_ui_message` 禁止裸调、action 语义（start/stop 操作结果 / get_status 状态对象 / list_captures 数组 / get_capture_data 仅元数据）、content 内部消息扁平、content→SW get_status 解包，全部与代码一致。

coverage = 4 / 4

verdict: PASS

## Round 2 (2026-08-12 21:41 UTC+8)

reviewed_scope: 473601e072ebbbcc

### 前轮 finding 复核

- `t146_code_f001`（minor，UiResponse 非判别联合）：implementer 判保留。代码未变，运行时无缺陷（SW 成功恒带 data，各调用点 `?? []`/`?? null`/`as BlobPart` 兜底有效）。保留成立，非阻断。
- `t146_code_f002`（minor，wrap_result 结构化判定）：implementer 判保留。代码未变，当前无含 `success` 键的 data 对象冲突，保留成立，非阻断。
- `test_f001`（test reviewer finding，涉及导出 mock）：已修。`tests/unit/export_busy_guard.test.ts` mock 从 `{ success: true }` 更新为 `{ success, data }` 契约形状（export_json/export_har 返回内容在 data）；json 防重入 case 经 `resolve_msg({ success: true, data: '{"ok":1}' })` 后断言 `blob.text() === '{"ok":1}'`，har case 断言 `blob.text() === JSON.stringify({ exported: 'export_har' })`。与 dashboard_shared `export_capture` 非 archive 分支读取 `const content = r.data ?? ''` 一致，断言增强（内容级验证导出解包路径），无恒真/弱化断言。

### 本轮复验

- `npx tsc --noEmit -p tsconfig.json` exit 0。
- `npx vitest run`：138 files / 1444 tests passed。
- 1 个 unhandled error 提示（`ReferenceError: indexedDB is not defined`，来自 `src/extension/background/app_log_storage.ts` 定时 flush，触发于 popup_onchanged_race.test.ts 运行期间）。判定为 pre-existing 测试噪音，非本 task 引入：popup.ts 基线（`17cde0d`）即 `import { get_app_log_transport } from '../background/app_log_storage'`，且该测试未 mock app_log_storage / 无 fake-indexeddb；t146 未改动此 import 与该测试的 mock 环境。1444 断言全部通过，未受影响。

### 本轮新发现

- 0 条。

### 未进表的提示

- 同 Round 1：`service_worker.ts` 1231 行（净增 +22），MV3 协议一体单文件，不拆分。
- unhandled error 噪音见上，属测试环境既有缺口，建议 follow-up（如 popup_onchanged_race 测试 mock app_log_storage 或注入 fake-indexeddb），非本 task 阻断。

### 总体判断

f001/f002 保留成立（均 minor）；test_f001 修复与契约一致且增强断言；tsc 干净、全量 1444 断言通过。无未解决 critical / important。

verdict: PASS
