# Task plan — T007 test_tree_reorg

## 步骤与验证

1. `mkdir tests/{unit,e2e,support}` → 验证：目录存在
2. `git mv tests/*.test.ts tests/unit/`（90 文件）
3. `git mv tests/*.spec.ts tests/e2e/`（35 文件）
4. `git mv e2e/T0001 e2e/T0002 e2e/T0003 tests/e2e/`；`rmdir e2e`
5. `git mv tests/__mocks__ tests/support/__mocks__`；`git mv tests/fixtures tests/support/fixtures`；`git mv tests/helpers tests/support/helpers`
6. sed 改测试间互引：
   - `tests/unit/*.test.ts`：`'./__mocks__/` → `'../support/__mocks__/`；`'./helpers/` → `'../support/helpers/`；`'./fixtures/` → `'../support/fixtures/`
   - `tests/e2e/*.spec.ts`：`'./helpers/` → `'../support/helpers/`（同模式）
7. 改 `vitest.config.ts`：exclude 加 `'tests/e2e/**'`、`'tests/support/**'`
8. 改 `playwright.config.ts`：`testDir: './tests/e2e'`；e2e-t0001/t0003 testDir；webServer url 改 `/src/extension/popup/popup.html`
9. 改 `package.json`：`test:e2e:server` 改 `tests/support/fixtures/server.ts`
10. `npm test` → 验证：全绿
11. `npx playwright test --list`（不执行，只列）→ 验证：spec 发现数非零

## 风险与回退

- 风险：vitest auto-mock 配置依赖 `tests/__mocks__/` 路径（node_modules 风格 auto-mock）。
- 缓解：当前 vitest.config 无 auto-mock 配置；测试用显式 import，路径改对即可。
- 风险：playwright webServer url 不对，preview 找不到 HTML。
- 缓解：T005 后 dist 实际路径是 `/src/extension/popup/popup.html`；同步改 webServer url。
- 风险：fixture/helper 内部互引路径漏改。
- 缓解：grep 全量扫，逐个改。
- 回退：`git reset --hard` 后恢复扁平 tests/ 与根 e2e/。
