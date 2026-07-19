# Task spec - T017 console_exception_source_filter

## 背景

`src/extension/background/console_capture.ts:99-160` 与 `src/extension/background/exception_capture.ts:79-153` 的 `handle_debugger_event` 忽略 `_source` 参数，只检查 `is_capturing`，不调 `should_handle_event(source, tab_id)`。与 network handler 不同，未验证 `source.tabId` 或已登记 session。扩展同时附加其他 tab/target 时，其他页面 console/exception 会归入当前 capture 并错误标注当前 `tab_id`。

另外 `start_console_capture:33-58`/`start_exception_capture:31-56`：`chrome.dbg.attach` 成功后 `Runtime.enable` 失败时 catch 仅设 `is_capturing=false` 不 detach；`stop_*` 因 `!is_capturing` 跳过，debugger attachment 残留。

## 范围

代码/配置：

- `console_capture.ts`：
  - `handle_debugger_event` 入口调 `should_handle_event(source, tab_id)`，非目标 tab/session 直接 return。
  - `start_console_capture` catch 中：若 `attached_by_us` 则 best-effort detach，重置 `attached_by_us`/`is_capturing`。
  - `stop_console_capture` 不再仅依赖 `is_capturing`，也尝试 detach `attached_by_us`（即使 is_capturing 在异常路径已被清）。
- `exception_capture.ts`：同样三处修复。

测试：

- `tests/unit/console_capture.test.ts`、`tests/unit/exception_capture.test.ts`：
  - 其他 tab 的 console 事件不被采集（source.tabId 不匹配）。
  - 未登记 session 的 sub-target 事件不被采集。
  - `Runtime.enable` 失败时 attach 被 detach（mock 验证 detach 被调）。

文档：

- 无 blueprint 改动。

## 非范围

- 不改 `Target.attachedToTarget` 子目标 Runtime.enable 逻辑。
- 不改 console args 脱敏（src_extension_02/MEDIUM-12 属独立 finding，但若改动与 source filter 冲突则一并处理）。
- 不改 console_capture 启动签名。

## 验收标准

- [ ] source.tabId 不匹配 tab_id 时 console 事件不发。-> 验证：单测。-> 预期：sender 未被调。
- [ ] 未登记 session 的 sub-target console 事件不发。-> 验证：单测。-> 预期：sender 未被调。
- [ ] Runtime.enable 失败且 attached_by_us=true 时 start 返回失败且 detach 被调。-> 验证：单测。-> 预期：mock detach 调用次数 >= 1，返回 success:false。
- [ ] exception_capture 同样三行为。-> 验证：单测。
- [ ] `npm test` 全绿。

## 依赖与约束

- 受影响业务不变量：采集仅限目标 tab + 已登记 sub-target。
- 无数据迁移。
- 无平台限制。
