# 导出

JSON / JSONL / HAR / HTML 四格式。实现：`src/background/exporter.ts`。

## 1. 格式

| 格式 | 内容 | 说明 |
|---|---|---|
| JSON | capture_id + events 全量 | 完整结构化数据，事件用 `category` + `type` 两级分类 |
| JSONL | 逐行事件 | 方便流式处理和 AI ingest |
| HAR | 网络请求归档 | 标准 HAR 格式，Chrome DevTools / Fiddler / Charles 可识别 |
| HTML | 自包含可读报告 | 必须转义动态内容防 XSS（`</script>` → `<\/script>`） |

HTML footer 使用 "Capture All"。

## 2. 文件名模板

默认 `capture_{date}.{ext}`（P0.60 新默认），`{date}` 为紧凑格式 `YYYYMMDD_HHMMSS`，不含 capture_id。

支持用户自定义模板，占位符 `{capture_id}` / `{date}` / `{ext}` 等。日志导出类似（`log_{date}.{ext}`）。

## 3. 保存位置

- 已配置 `export_capture_directory` / `export_log_directory`：直接保存，不弹框（P0.61）。
- 未配置目录：用 File System Access API（`showSaveFilePicker`），可写任意位置；按 `id`（`capture_export` / `log_export`）记忆各类导出的上次文件夹，等同网页下载。
- 用户取消：静默返回。
- 不支持环境：NEEDS CLARIFICATION（旧文档提及回退 `chrome.downloads.download`，当前代码是否保留此回退需核实）。

## 4. 导出内容完整性

- JSON / JSONL：事件使用新类型（`CaptureEvent` + 对应 `*Data`），`capture_id` 正确。
- HAR：网络请求条目按 HAR schema。
- HTML：动态内容全转义（`escape.ts`），`</script>` → `<\/script>`，`<` / `>` / `&` 全部转义。

`tests/export_integrity.test.ts` 验证完整性。

## 5. 安全

- HTML 导出必须转义（见 `redaction_security.md`）。
- 导出前若数据含敏感字段且 `redact_data=true`，已脱敏；用户可关脱敏，但截断仍生效。
- 导出能力通过 MCP 暴露（`export_capture` / `capture.export`），见 `agent_mcp.md`。

## 6. ZIP 归档（规划）

superpowers 设计文档规划了 zip 归档导出（`docs/archive_valid/superpowers/specs/2026-06-13-zip-archive-export-design.md`），实现进度需核实当前 `exporter.ts` / `archive_builder.ts` 状态。

`src/shared/archive_builder.ts` 已存在并有单测（`archive_builder.test.ts` / `archive_config.test.ts` / `archive_entry.test.ts`），依赖 `fflate`。

## 7. 关键文件

- `src/background/exporter.ts` — 主导出逻辑。
- `src/shared/export_settings.ts` — 导出设置。
- `src/shared/export_utils.ts` — 导出工具函数。
- `src/shared/archive_builder.ts` — 归档构建。
- `src/shared/escape.ts` — HTML 转义。
