# Spec — user_config 持久化

用户配置存于 `chrome.storage.local` 的 `user_config` 键，由 `src/shared/user_config.ts` 统一读写。所有字段经 `sanitize_user_config` 白名单校验后落库。

## 字段白名单

持久化校验覆盖字段（与 `DEFAULT_USER_CONFIG` 对齐）：

- 布尔：`capture_input_values` / `capture_request_body` / `capture_response_body` / `redact_data` / `agent_bridge_enabled` / `export_save_as`
- 枚举：`mouse_precision` / `keyboard_capture_mode` / `theme` / `locale` / `detail_time_display_mode` / `log_level`
- 非负整数：`max_body_capture_bytes` / `inline_text_max_bytes`
- 正整数：`log_max_size_mb`
- 字符串：`export_capture_directory` / `export_log_directory` / `export_filename_template` / `agent_bridge_url` / `agent_bridge_token` / `browser_label` / `system_time_timezone`

### `agent_bridge_poll_interval_ms`

合法区间 `[250, 300000]`，须为整数；区间常量与 `normalize_agent_bridge_config` 共享（`MIN_POLL_INTERVAL_MS` / `MAX_POLL_INTERVAL_MS`）。越界、非整数或缺失时回退默认值 1000。

### `browser_label`

类型须为 string；非 string 回退默认空串。供多实例 `target_label` 路由与 Bridge enroll/heartbeat 使用，UI 侧 trim 归 `normalize_agent_bridge_config`，持久化侧保留原样。

## 读写语义

- `load_user_config()`：读 storage，缺失字段由默认值补齐，返回通过白名单校验的完整 `UserConfig`。旧 IANA 时区值自动迁移为固定 UTC 偏移并写回。
- `save_user_config(patch)`：先 load 当前值，再以 `{ ...current, ...patch }` 整表写回。因此任意 partial patch 不会抹掉 patch 中未出现的字段。t178 起：合并结果经 `sanitize_user_config` 白名单校验后再落库（load/save 对称），非法 enum/number/type 字段被滤，不进入 storage。

## 相关实现

- `src/shared/user_config.ts`：读写与校验
- `src/shared/agent_bridge_config.ts`：poll 区间常量、`normalize_agent_bridge_config`
- `src/shared/constants.ts`：`DEFAULT_USER_CONFIG`
- `tests/unit/user_config_persistence.test.ts`：持久化保留与校验测试
