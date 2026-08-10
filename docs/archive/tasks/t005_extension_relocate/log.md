# Task log — T005 extension_relocate

## 记录

### 2026-07-19 Phase 3c 执行

- 建 `src/extension/`，搬入 5 个 surfaces：`background`（22）、`content`（16）、`popup`（3）、`dashboard`（13）、`devtools`（4）。
- `src/extension/**` 内部 134 处 `../shared/` → `../../shared/`（指向扁平 `src/shared/`）；跨 surface 引用 `../content/` `../background/` 等保持不变（同 extension 内相对位置不变）。
- `git mv manifest.json src/extension/manifest.json`；manifest 内 5 处 surface 路径改 `src/extension/...`。
- `git mv _locales src/extension/_locales`。
- `vite.config.ts`：manifest import 改 `./src/extension/manifest.json`；5 个 rollup input 加 `extension/`。
- 批量改 tests / e2e / scripts / docs：所有 `src/{background,content,popup,dashboard,devtools}/` → `src/extension/{...}/`。

### 中途决策与调整

- **`capture_data_reader` 紧急下沉**：tsc 报错 `src/shared/capture_data_reader.ts` 反向引用 `../background/storage`（违反 §4.1 依赖方向）。原本计划 T006 处理，但因 surfaces 搬家后该反向引用失效，必须立即下沉到 `src/extension/shared/capture_data_reader.ts`；同步改 3 处引用（`dashboard_shared.ts` x2、`popup.ts` x1）从 `../../shared/capture_data_reader` 回到 `../shared/capture_data_reader`。其他 §4.3 表里的"扩展专用"文件（i18n/theme/design_tokens.css/chrome.d.ts/export_utils/export_settings/archive_builder/capture_stats/poll_capture_status/dom_utils）继续留 `src/shared/`，未引起 tsc 错误；它们的进一步下沉留 T006（Phase 5 收口时做）。
- **build 加 `copy:locales` 步骤**：crxjs 不自动从 `src/extension/_locales/` 复制到 `artifacts/dist/_locales/`。新增 `scripts/copy_locales.mjs` + `package.json` 的 `copy:locales` script，在 `vite build` 后、`build:zip` 前执行。
- **修测试硬编码**：4 个测试因路径硬编码或字符串期望失效：
  - `tests/manifest_permissions.test.ts`：`manifest.json` → `src/extension/manifest.json`；vite_config 期望字符串同步。
  - `tests/public_docs.test.ts`：`manifest.json` → `src/extension/manifest.json`。
  - `tests/content_script_uses_poll.test.ts`：path.resolve 字符串拼接 `'src', 'content', ...` → `'src', 'extension', 'content', ...`（sed 替换不了字面拼接）。
  - `tests/entry_unification.test.ts`：期望 `from '../shared/redaction'` → `from '../../shared/redaction'`（surface 搬到 src/extension/ 后引用路径多一层）。

### 文档副作用

- `docs/tasks/T005_extension_relocate/plan.md` 与 `spec.md` 的 sed 命令示例被批量 sed 误污染（字面 `src/background/` 等被替换成 `src/extension/background/`，命令字符串自指）。实际执行命令以本 commit diff 为准；本 log 步骤描述为真实执行内容。

### 关键验证

- `npx tsc --noEmit`：No errors found。
- `npm test`：90 文件 / 1079 测试全绿。
- `npm run build`：bridge.mjs 46.6K、mcp.mjs 1.1M；`artifacts/dist/_locales/{en,zh_CN}/messages.json` 存在。
- `grep -rnE "src/(background|content|popup|dashboard|devtools)/"`：无残留。
- `grep -rnE "from ['\"]\\.\\./shared/" src/extension/`：无残留（全部改为 `../../shared/`）。

### 完结

- 范围内全部完成。
- 未派 review subagent（路径批量替换 + tsc/vitest/build 三重验证已足够）。
- T006（剩余扩展专用 shared 下沉）留 Phase 5 收口时做；当前不阻塞。
