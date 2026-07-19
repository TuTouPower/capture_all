# Task log - T013 content_capture_privacy

## 进展

- 2026-07-19：修复 content_capture 4 处隐私/完整性缺陷：
  1. keyboard shortcuts 模式下 redact_data 失效 → `masked = config.redact_data`。
  2. keyboard target_input_type 硬编码 null → 提取 input.type。
  3. form_submit form_action 未脱敏 → 引入 config + redact_url。
  4. storage_capture tab_id=0 → 签名加 tab_id 参数。

## 关键验证

- 红 → 绿：3 个测试文件共 4 项失败 → 修正实现与调用点 → 全绿。
- 全量：`npm test` 92 文件 / 1086 用例全绿。
- TypeScript：`tsc --noEmit` 无错误。

## 决策

- form_submit_capture 签名加 config 参数（位置参数而非 options 对象，保持与现有 capture 模块风格一致）。
- storage_capture 同样加 tab_id 位置参数。
- keyboard shortcuts 模式过滤逻辑（line 71 `is_shortcut_mode && !has_modifier`）保留不动，仅修复脱敏。
- form.action 为空时 form_action 设为 null（保留原行为）。

## 验收

- [x] shortcuts + redact_data=true → key/code 为 null。
- [x] all + redact_data=false → key/code 保留。
- [x] target_input_type 取自 input.type。
- [x] form_action 脱敏覆盖 token 等 query。
- [x] redact_url_query=false 时 form_action 保留原值。
- [x] storage_capture tab_id 传入生效。
- [x] npm test 全绿。
