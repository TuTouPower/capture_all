# Task spec - T020 input_event_event_id

## 背景

`src/extension/content/content_script.ts:236-261` `send_event` 同时支持新格式（CaptureEvent 对象）和旧格式（type 字符串 + data）。旧格式分支不调 `create_base_event`/`create_content_event`，构造的对象缺 `event_id`/`source`/`severity`/`redaction_status`/`raw_available`/`created_at` 等标准字段。

仍有两处走旧格式：
- `dom_capture.ts:142` `send_event('input_event', data)` 全部 input/change/focus/blur 事件
- `network_hook.ts:266` `send_event('network_body_hook', {...})`

`src/extension/background/storage.ts` 的 `user_action_events` store 用 `event_id` 作 keyPath，缺 `event_id` 的 `store.put(item)` 会触发 DataError，同事务其他事件可能随事务中止丢失。违反"所有事件 store 用 event_id 作 keyPath"硬约束。

## 范围

代码/配置：

- `src/extension/content/dom_capture.ts`：
  - `start_dom_capture` 签名改为接收 `capture_id`、`capture_start_epoch_ms`、`tab_id`、`sender: (event: CaptureEvent, data) => void`，模块变量保存上下文。
  - `send_input_event` 调 `create_content_event` 构造标准 base event，与 mouse/keyboard 模块一致。
- `src/extension/content/network_hook.ts`：
  - 同样改造：上下文参数 + `create_content_event` 构造事件，type 用合法 EventType（如 `network_request`）。
- `src/extension/content/content_script.ts`：
  - 删除 `send_event` 旧格式分支（type 字符串路径），签名收敛为 `(event: CaptureEvent, data?) => void`。
  - 更新 `start_dom_capture`/`start_network_hook` 调用点。

测试：

- `tests/unit/content_event_utils.test.ts` 或新建 `tests/unit/dom_capture_event_id.test.ts`：
  - dom_capture input 事件含 `event_id`（合法 UUID 形态）。
  - network_hook 事件含 `event_id`。
- 现有 `content_script_uses_poll.test.ts` 不应被破坏。

文档：

- 无 blueprint 改动。

## 非范围

- 不重命名 EventType。
- 不改 background normalize 逻辑。
- 不改 `send_capture_event`（已走 create_content_event）。

## 验收标准

- [ ] dom_capture input 事件含非空 `event_id`。-> 验证：单测。-> 预期：event.event_id 是字符串且非空。
- [ ] network_hook 事件含非空 `event_id`。-> 验证：单测。-> 预期：event.event_id 是字符串且非空。
- [ ] `send_event` 不再有 string type 分支。-> 验证：grep `typeof type_or_event === 'string'` 无结果。-> 预期：无匹配。
- [ ] `npm test` 全绿。

## 依赖与约束

- 受影响业务不变量：所有 content 事件含 event_id；IndexedDB keyPath 不缺。
- 无数据迁移。
- 无平台限制。
