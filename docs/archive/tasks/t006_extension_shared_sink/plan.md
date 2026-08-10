# Task plan — T006 extension_shared_sink

## 步骤与验证

1. `git mv src/shared/{i18n,theme,export_utils,export_settings,archive_builder,capture_stats,poll_capture_status,dom_utils}.ts src/extension/shared/` + `git mv src/shared/design_tokens.css src/extension/shared/` + `git mv src/shared/chrome.d.ts src/extension/shared/` → 验证：`ls src/extension/shared/` 含 11 文件
2. 改内部对扁平 src/shared/ 的引用（5 文件）：
   - `theme.ts`: `./types` → `../../shared/types`
   - `export_utils.ts`: `./types` `./system_time` → `../../shared/...`；`./export_settings` 不变（同 extension/shared）
   - `export_settings.ts`: `./types` `./system_time` → `../../shared/...`
   - `archive_builder.ts`: `./body_routing` `./hash` `./system_time` → `../../shared/...`
   - `capture_stats.ts`: `./types` → `../../shared/types`
3. `src/extension/**` 18 处：`../../shared/{10 个文件名}` → `../shared/{文件名}`（用 sed 按文件名精确替换）
4. HTML 2 处：`../../shared/design_tokens.css` → `../shared/design_tokens.css`
5. `tests/*.ts` 引用（import / vi.mock / source 字符串）：`src/shared/{文件名}` → `src/extension/shared/{文件名}`
6. `npx tsc --noEmit` → 验证：无错
7. `npm test` → 验证：全绿
8. `npm run build` → 验证：bridge.mjs + mcp.mjs + dist 正确
9. 更新 `docs/blueprint/architecture.md` §3：去掉 10 个文件的"待 T006"标注

## 风险与回退

- 风险：sed 替换误伤其他 `../../shared/X`（X 不是 10 个之一）。
- 缓解：用 `sed -E` 按精确文件名替换；替换后 grep 验证。
- 风险：测试 `vi.mock` 字符串路径漏改。
- 缓解：grep 全量扫 `vi.mock.*shared/(i18n|theme|...)`。
- 风险：design_tokens.css 搬迁后 HTML 引用失效。
- 缓解：build 后检查 dist 是否含 design_tokens.css。
- 回退：`git reset --hard` 后恢复。
