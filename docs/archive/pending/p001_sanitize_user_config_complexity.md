# p001 sanitize_user_config 圈复杂度超阈值

- 来源：t092 遗留（t092_code_f001，minor）
- 内容：`src/shared/user_config.ts` 的 `sanitize_user_config` 圈复杂度 ≈29 超 15 阈值。可将 `browser_label` 并入既有 `str_keys` 表驱动数组，poll 区间校验抽为独立 helper（如 `is_valid_poll_interval(v)`）降低单函数分支密度。功能正确、无缺陷，仅复杂度提示。
- 处理：t118
