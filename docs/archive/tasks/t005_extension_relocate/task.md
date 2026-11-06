# Task spec — T005 extension_relocate

## 背景

`docs/refactor_plan.md` §4.4 + §4.5：`src/{background,content,popup,dashboard,devtools}` → `src/extension/{...}`；根 `manifest.json` → `src/extension/manifest.json`；根 `_locales/` → `src/extension/_locales/`。extension 是独立产品，应与 bridge/mcp 平级。

## 范围

- 建 `src/extension/`，搬入 5 个 surfaces
- 同步改 `src/extension/**` 内部 import：`../shared/` → `../../shared/`（指向扁平 `src/shared/`）
- 同步改所有引用 `src/{background,content,...}` 的位置：`tests/*.ts`、`tests/*.spec.ts`、`e2e/**`、`tests/fixtures/**`、`tests/helpers/**`、`tests/__mocks__/**`
- `manifest.json` → `src/extension/manifest.json`；manifest 内脚本/HTML 路径全改 `src/extension/...`
- `_locales/` → `src/extension/_locales/`
- `vite.config.ts`：manifest import 路径 + 5 个 rollup input
- 跑 `npm test` 与 `npm run build` 全绿；build 后 `artifacts/dist/_locales/{en,zh_CN}/` 存在

## 非范围

- §4.3 表里"明确扩展专用"文件下沉到 `src/extension/shared/`（T006 或 Phase 5）。本轮 `src/shared/` 内容不变，扁平结构继续承载扩展专用 + 跨端共用。
- 测试树重组（Phase 4 / T007+）。

## 验收标准

- [ ] `src/extension/{background,content,popup,dashboard,devtools}/` 存在；旧 `src/{background,...}` 不存在
- [ ] `src/extension/manifest.json` 与 `src/extension/_locales/` 存在；仓库根无 `manifest.json` 与 `_locales/`
- [ ] `vite.config.ts` 指向新 manifest 与 entry 路径
- [ ] 无残留 `src/extension/background/` `src/extension/content/` `src/extension/popup/` `src/extension/dashboard/` `src/extension/devtools/` 引用
- [ ] `npm test` 全绿
- [ ] `npm run build` 全绿；`artifacts/dist/_locales/{en,zh_CN}/` 存在

## 依赖与约束

- T003 + T004 已完成（bridge / mcp 已搬到 `src/{bridge,mcp}/`）。
- 不变量：MV3 打包产物布局不变；`artifacts/dist/_locales/` 仍存在；manifest 内权限 / host_permissions / CSP 不变。
