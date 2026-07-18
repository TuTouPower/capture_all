# Task log — T007 test_tree_reorg

## 记录

### 2026-07-19 Phase 4 执行（拆 2 commit）

**Commit A — 测试树搬家 + 路径修复：**

- `tests/*.test.ts`（90 文件）→ `tests/unit/`
- `tests/*.spec.ts`（35 文件）+ `e2e/{T0001,T0002,T0003}/` → `tests/e2e/`
- `tests/e2e-helpers.ts` → `tests/e2e/e2e-helpers.ts`
- `tests/{__mocks__,fixtures,helpers}/` → `tests/support/{__mocks__,fixtures,helpers}/`
- 根 `e2e/` 目录移除（所有内容在 `tests/e2e/`）
- 修测试间互引：`./__mocks__/` `./helpers/` `./fixtures/` → `../support/...`（tests/unit/ 与 tests/e2e/ 内）
- 修 src 引用深度：`../src/` → `../../src/`（tests/unit/ 与 tests/e2e/ 多一层）
- 修 root resolution：10 个测试文件的 `resolve(__dirname, '..')` → `resolve(__dirname, '..', '..')`；archive_entry 与 content_script_uses_poll 的特例单独处理
- 修 e2e-helpers 引用：`tests/e2e/T000*/` 子目录 spec 的 `'../../tests/e2e-helpers'` → `'../e2e-helpers'`

**Commit B — config 调整：**

- `vitest.config.ts`：exclude 加 `tests/e2e/**` `tests/support/**`
- `playwright.config.ts`：`testDir: './tests/e2e'`；e2e-t0001 / e2e-t0003 testDir 改 `./tests/e2e/T000X`；webServer url `/src/popup/popup.html` → `/src/extension/popup/popup.html`（T005 后 dist 实际路径，T005 漏修，T007 补）
- `package.json`：`test:e2e:server` script `tests/fixtures/server.ts` → `tests/support/fixtures/server.ts`

### 关键验证

- `npx tsc --noEmit`：No errors found。
- `npm test`：90 文件 / 1079 测试全绿。
- `npm run build`：bridge.mjs + mcp.mjs + dist 正确。
- `npx playwright test --list`：spec 发现 118 个（非零；list 模式 webServer 未启动所以全 skip，属正常）。

### 中途决策

- **不强制细分 unit/integration**：§6.1 表列 unit / integration 两层，但本轮按文件类型（.test.ts vs .spec.ts）分到 unit / e2e，未按"模块协作 vs 纯逻辑"再细分 unit 内部。后续可按内容把部分 integration 类（如 agent_bridge_server 66K、dashboard_timeline_marker 22K）从 unit/ 移到新建 integration/ 子目录。
- **T005 漏修 webServer url**：playwright.config 的 webServer url 在 T005 surfaces 搬家后没改（仍 `/src/popup/popup.html`，dist 实际是 `/src/extension/popup/popup.html`）。T007 补上。

### 完结

- 范围内全部完成；`tests/` 顶层为 `unit/ e2e/ support/`，根 `e2e/` 已删。
- 整个 `docs/refactor_plan.md` 主体（Phase 0/2/3/4/5 + §4.3 表全闭合）执行完毕。
