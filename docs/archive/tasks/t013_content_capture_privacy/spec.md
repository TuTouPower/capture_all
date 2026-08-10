# Task spec — T013 content_capture_privacy

## 背景

`src/extension/content/` 多处隐私缺陷：

1. `keyboard_capture.ts:77`：`masked = config.redact_data && !is_shortcut_mode()`，shortcuts 模式下无论 `redact_data` 是否启用，`masked` 永远为 false，`event.key/code` 明文发送。
2. `keyboard_capture.ts:103`：`target_input_type: null` 硬编码，无法区分键盘事件发生在 text/password/email 等输入类型上（与 focus_capture 不一致）。
3. `form_submit_capture.ts:56`：`form_action: form.action || null` 原样入库，未经 `redact_url`，可能泄露 `?token=...`。
4. `storage_capture.ts:104`：`tab_id: 0` 硬编码，content_script.ts:106 调用 `start_storage_capture` 时未传 tab_id，导致所有 storage_change 事件无法归属到具体 tab。

## 范围

代码/配置：

- `src/extension/content/keyboard_capture.ts`：
  - `masked = config.redact_data`（移除 `&& !is_shortcut_mode()`）。
  - `target_input_type` 提取 `(event.target as HTMLInputElement)?.type ?? null`。
- `src/extension/content/form_submit_capture.ts`：
  - 引入 `CaptureConfig`，签名追加 config；`form_action` 通过 `redact_url(form.action || '', config.redact_data && config.redact_url_query)` 脱敏。
- `src/extension/content/storage_capture.ts`：
  - `start_storage_capture` 签名追加 `new_tab_id: number`，存到模块变量并在事件中使用。
- `src/extension/content/content_script.ts`：
  - `start_form_submit_capture` 传 config；`start_storage_capture` 传 tab_id。

测试：

- 新增/更新 `tests/unit/`：
  - keyboard shortcuts 模式 + redact_data=true 时 `key/code` 为 null。
  - keyboard target_input_type 提取 input.type。
  - form_submit_capture 在 redact_url_query=true 时 form_action 被脱敏。
  - storage_capture 事件含传入的 tab_id。

文档：

- 无 blueprint 改动。

## 非范围

- 不改 shortcuts 模式"仅采修饰键组合"的过滤逻辑（line 71）。
- 不改其他 capture 模块。

## 验收标准

- [ ] shortcuts 模式 + redact_data=true 时 key/code 为 null。→ 验证：单测。→ 预期：`key === null && code === null`。
- [ ] keyboard 事件 target_input_type 取自 input.type。→ 验证：单测。→ 预期：input.type='email' 时 target_input_type === 'email'。
- [ ] form_action 在 redact_url_query=true + redact_data=true 时含敏感 query 被脱敏。→ 验证：单测。→ 预期：form_action 不含 token 原值。
- [ ] storage_capture 事件 tab_id 为传入值（非 0）。→ 验证：单测。→ 预期：tab_id === 42。
- [ ] `npm test` 全绿。

## 依赖与约束

- 受影响业务不变量：redact_data 控制；redact_url_query 控制；tab_id 数据完整性。
- 无数据迁移。
- 无平台限制。
