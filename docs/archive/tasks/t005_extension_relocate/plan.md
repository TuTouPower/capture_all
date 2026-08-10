# Task plan — T005 extension_relocate

## 步骤与验证

1. `mkdir src/extension`；`git mv src/{background,content,popup,dashboard,devtools} src/extension/` → 验证：`ls src/extension/`
2. `sed -i 's|\.\./shared/|../../shared/|g' src/extension/**/*.ts` → 验证：`grep -rn "from '\\.\\./shared/" src/extension/` 无输出
3. `git mv manifest.json src/extension/manifest.json`；`sed -i 's|src/extension/background/|src/extension/background/|g; s|src/extension/content/|src/extension/content/|g; s|src/extension/popup/|src/extension/popup/|g; s|src/extension/dashboard/|src/extension/dashboard/|g; s|src/extension/devtools/|src/extension/devtools/|g' src/extension/manifest.json` → 验证：manifest 内 `src/extension/...` 一致
4. `git mv _locales src/extension/_locales` → 验证：根目录无 `_locales`
5. 改 `vite.config.ts`：`./manifest.json` → `./src/extension/manifest.json`；5 个 input 路径加 `extension/`
6. 批量改 tests：`sed -i 's|src/extension/background/|src/extension/background/|g; s|src/extension/content/|src/extension/content/|g; s|src/extension/popup/|src/extension/popup/|g; s|src/extension/dashboard/|src/extension/dashboard/|g; s|src/extension/devtools/|src/extension/devtools/|g' tests/*.ts tests/*.spec.ts tests/fixtures/*.ts tests/helpers/*.ts tests/__mocks__/*.ts e2e/**/*.ts e2e/*.ts` 2>/dev/null
7. `npx tsc --noEmit` → 验证：无错
8. `npm test` → 验证：全绿
9. `npm run build` → 验证：`artifacts/dist/_locales/{en,zh_CN}/` 存在；`artifacts/dist/manifest.json` 内路径正确
10. 若 `_locales` 未复制到 dist：vite.config 加 copy 步骤或调整 `publicDir`

## 风险与回退

- 风险：`_locales` 搬到 `src/extension/_locales/` 后 crxjs 不自动复制到 dist。
- 缓解：build 后检查；必要时 vite.config 显式 copy。
- 风险：tests/ 与 e2e/ 引用模式漏改。
- 缓解：grep 全量扫 `src/(background|content|popup|dashboard|devtools)` 残留；tsc 失败即停。
- 风险：surface 内部除 `../shared/` 外有其他跨层引用（如 `../agent/bridge`，但 agent 已删）。
- 缓解：grep 全量扫 `src/extension/` 内部 import。
- 回退：`git reset --hard` 后恢复原结构。

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：Phase 3 全部完成后（T005 + T006）统一更新目录结构。
