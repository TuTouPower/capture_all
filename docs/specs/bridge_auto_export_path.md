# Spec — Bridge auto 导出路径净化

`/mcp/command` 的 `capture.export` 等 FULL_DATA 命令在 `output_path` 缺省且结果超内联阈值时，自动写文件到配置导出目录。

## 路径解析

`resolve_auto_output_path`：

- 导出目录：`CAPTURE_ALL_EXPORT_DIR` 环境变量，缺省 `os.tmpdir()/capture-all-exports`。
- `capture_id`：非空字符串取原值，否则 `export_<timestamp>`；字符过滤 `[^a-zA-Z0-9._-]` → `_`。
- `format`：白名单 `^[a-zA-Z0-9]{1,16}$`，通过则小写归一，否则回退 `json`。杜绝 `..`、`/`、`\` 逃逸导出目录。
- 最终路径：`join(dir, ${safe_id}.${format})`。

## 安全边界

- 任何经 `format` 或 `capture_id` 注入的路径分隔符 / `..` 均在拼接前被净化，最终文件必然落在导出目录内。
- 非法 format 不报错，回退安全默认扩展名 `json`，调用方仍拿到成功结果与目录内路径。

## 相关实现

- `src/bridge/server.ts`：`resolve_auto_output_path`
- `tests/unit/agent_bridge_server.test.ts`：逃逸样例 / 合法 format / realpath 前缀测试
