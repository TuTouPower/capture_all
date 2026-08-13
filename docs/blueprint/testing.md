# 测试

项目门禁命令（对应用户与 agent 常用入口；日常 TDD 红/绿循环用 `npm test`）：

- doctor：环境前置检查 → `python3 -m pytest tests/repo_template -q --collect-only`（task 工具链依赖可导入即视为就绪）+ `node --version`（^20.19.0 || >=22.12.0）
- test：日常测试（红/绿）→ `npm test`（vitest 全量单测）；task 工具链测试 → `python3 -m pytest tests/repo_template/ -q`
- blackbox：黑盒验证 → `npm test && npx tsc --noEmit`（涉及构建产物时加 `npm run build`）

## Schema / codegen 验证

无。项目无 schema、migration 或 codegen 生成链（MCP 工具参数用 Zod schema 运行时校验，见 `src/mcp/schemas.ts`；IndexedDB schema 由 `src/extension/background/storage.ts` 升级路径维护）。

## 门禁类别清单

| 类别 | 必须覆盖 | 常见盲区 |
|------|----------|----------|
| 单元测试 | `npm test`（vitest run，`tests/unit/`）通过 | mock 掉被测逻辑、断言过弱（假绿） |
| 生产代码类型检查 | `npx tsc --noEmit` 通过（tsconfig include `src/**/*.ts` + 构建配置文件） | 类型错误被测试框架转译忽略 |
| 测试代码类型检查 | 无独立检查（vitest 经 esbuild 转译不查类型；tsconfig exclude `tests/`） | 测试 mock 类型不匹配长期积累；如需要可加 `tsc --noEmit -p tests/tsconfig.json` |
| lint | 无 lint 配置；CI 用 `npm run scan:tracked-tree`（`scripts/scan_tracked_tree.mjs`）扫描敏感路径/硬编码凭据 | 只查改动文件、存量无限积累 |
| 生产构建 | `npm run build`（tsc + vite build + copy:locales + build:bridge + build:mcp + build:zip）通过 | codegen 与 schema 不同步、RSC 边界、server-only 导入 |
| 端到端 | `npm run test:e2e`（Playwright，headless 基础 E2E）或 `test:e2e:all`（全部项目）；webServer 由 `serve:e2e` 构建 + 预览提供。项目：e2e、e2e-ext、e2e-real、e2e-cdp-capture、e2e-mcp、e2e-p1、e2e-streaming、e2e-t0001、e2e-t0003；t194 起 `tests/e2e/**/*.spec.ts` 全部文件被项目选中（discovery guard `npm run check:e2e-coverage` 强制，孤儿/重复即失败）；CI E2E job 跑 `xvfb-run -a npm run test:e2e:all`（release-gate 全项目，含 headed 扩展模式）；并发策略与历史纪律见 `docs/archive/omni_powers/op_blueprint/test.md` | 只在单测环境验证、未触达真实浏览器 API |

普通 merge 不自动执行生产 migration、部署或数据操作；此类动作遵循项目发布流程。
