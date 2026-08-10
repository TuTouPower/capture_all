# Task log — T006 extension_shared_sink

## 记录

### 2026-07-19 §4.3 表剩余 10 文件下沉

- `git mv` 10 文件 `src/shared/{i18n,theme,export_utils,export_settings,archive_builder,capture_stats,poll_capture_status,dom_utils}.ts` + `design_tokens.css` + `chrome.d.ts` → `src/extension/shared/`。`src/extension/shared/` 现 11 文件（含 T005 的 `capture_data_reader.ts`）；`src/shared/` 剩 14 文件（纯跨端共用）。
- 5 文件内部对扁平 `src/shared/` 的引用改成 `../../shared/`：
  - `theme.ts`、`capture_stats.ts`：`./types` → `../../shared/types`
  - `export_utils.ts`、`export_settings.ts`：`./types` `./system_time` → `../../shared/...`（`./export_settings` 同目录不变）
  - `archive_builder.ts`：`./body_routing` `./hash` `./system_time` `./types` → `../../shared/...`
- `src/extension/{background,content,popup,dashboard,devtools}/**.ts` 里 18 处 surface 引用：按文件名精确 sed `'../../shared/X'` → `'../shared/X'`（X ∈ 10 文件名）。`src/extension/shared/` 内部不被替换（保持对扁平 `src/shared/` 的引用）。
- HTML 2 处：`../../shared/design_tokens.css` → `../shared/design_tokens.css`（dashboard.html、popup.html）。
- `tests/*.ts` 引用（import / `vi.mock` / `source(...)` 字符串 / 注释）：按文件名精确 sed `src/shared/X` → `src/extension/shared/X`。

### 关键验证

- `npx tsc --noEmit`：No errors found。
- `npm test`：90 文件 / 1079 测试全绿。
- `npm run build`：bridge.mjs + mcp.mjs + dist 正确；`design_tokens.css` 被 vite 打包合并到 `dist/assets/capture_data_reader-CLzLkUBs.css`（HTML `<link>` 自动重写为 hash 化 asset 路径）。
- `grep -rnE "'\.\./\.\./shared/(i18n|theme|export_utils|export_settings|archive_builder|capture_stats|poll_capture_status|dom_utils)'" src/extension/{background,content,popup,dashboard,devtools}/`：无残留。

### 完结

- 范围内全部完成；§4.3 表 11 文件（含 T005 的 capture_data_reader）全部下沉到 `src/extension/shared/`。
- blueprint/architecture.md §3 同步更新（`src/extension/shared/` 列 11 文件；`src/shared/` 去掉"待 T006"标注）。
- 未派 review subagent（精确 sed + tsc/vitest/build 三重验证已足够）。
