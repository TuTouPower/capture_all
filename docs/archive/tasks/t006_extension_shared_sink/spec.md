# Task spec — T006 extension_shared_sink

## 背景

`docs/refactor_plan.md` §4.3 表里 10 个"明确扩展专用"shared 文件按 §4.2 规则应下沉到 `src/extension/shared/`：i18n / theme / design_tokens.css / chrome.d.ts / export_utils / export_settings / archive_builder / capture_stats / poll_capture_status / dom_utils。这些文件被扩展 surfaces 引用，bridge / mcp 不引用（§4.1 已验证）。

T005 已下沉 capture_data_reader.ts（tsc-required）。本 task 完成剩余 10 个。

## 范围

- `git mv` 10 个文件 `src/shared/{...}` → `src/extension/shared/{...}`
- 改 5 个有内部依赖的文件对扁平 `src/shared/` 的引用（theme / export_utils / export_settings / archive_builder / capture_stats）：`./X` → `../../shared/X`（X 不在扩展专用集合内）
- 改 `src/extension/**` 里 18 处对这 10 个文件的引用：`../../shared/X` → `../shared/X`
- 改 2 处 HTML 引用 `design_tokens.css`：`../../shared/design_tokens.css` → `../shared/design_tokens.css`
- 改 `tests/*` 对这 10 个文件的引用（import、`vi.mock`、`source(...)` 字符串路径、注释）
- 跑 `npm test` 与 `npm run build` 全绿

## 非范围

- Phase 4 测试树重组（T007）
- blueprint/architecture.md 已在 T008 标注待 T006；本 task 完成后更新 architecture.md 去掉"待 T006"标注

## 验收标准

- [ ] `src/extension/shared/` 含 11 个文件（含 T005 已下沉的 `capture_data_reader.ts`）
- [ ] `src/shared/` 不再含这 10 个文件
- [ ] bridge / mcp 不引用这 10 个文件（保持 §4.1）
- [ ] `npm test` 全绿
- [ ] `npm run build` 全绿

## 依赖与约束

- T005 已完成（surfaces 已搬到 `src/extension/`；`capture_data_reader` 已在 `src/extension/shared/`）。
- 不变量：bridge / mcp 依赖边界不变；build 产物不变。
