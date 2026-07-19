# Task spec + log - T060 user_config_schema

## 背景

`user_config.ts:377-408` load_user_config 浅合并 + as UserConfig，不校验 enum/boolean/数值范围/URL/label 长度。save_user_config 同样直接合并任意 Partial。

## 范围

- 新增 sanitize_user_config：逐字段类型校验（boolean/enum/数值非负整数/字符串），无效回退 DEFAULT_USER_CONFIG。
- load_user_config 调 sanitize_user_config。
- merged 改为 Record<string, unknown> 避免 type narrowing 冲突。

## 验收

- [x] 损坏配置字段回退默认。
- [x] npm test 全绿。

## 进展

- 2026-07-19：实施。
