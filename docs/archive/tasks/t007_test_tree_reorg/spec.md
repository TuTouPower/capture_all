# Task spec — T007 test_tree_reorg (Phase 4)

## 背景

`docs/refactor_plan.md` §6：测试按层分类到 `tests/{unit, integration, e2e, support}`；§8 Phase 4 只做目录分类与 config 调整，不再修因 Phase 3 搬家产生的 import（那些已在 Phase 3 各子 commit 修完）。

## 范围

- `tests/*.test.ts` → `tests/unit/`（90 文件，本轮不强制细分 unit/integration，留作后续）
- `tests/*.spec.ts` → `tests/e2e/`（35 文件 playwright specs）
- 根 `e2e/{T0001,T0002,T0003}/` → `tests/e2e/{T0001,T0002,T0003}/`
- `tests/{__mocks__,fixtures,helpers}/` → `tests/support/{__mocks__,fixtures,helpers}/`
- 修测试间互引路径（`./__mocks__/` `./helpers/` `./fixtures/` → `../support/...`）
- `vitest.config.ts`：exclude 加 `tests/e2e/**` `tests/support/**`
- `playwright.config.ts`：testDir `./tests/e2e`；e2e-t0001 / e2e-t0003 testDir 改 `./tests/e2e/T000X`；webServer url 改 `/src/extension/popup/popup.html`（T005 后 dist 实际路径）
- `package.json`：`test:e2e:server` script 路径 `tests/support/fixtures/server.ts`

## 非范围

- `tests/unit/` 内部按内容再细分 unit/integration 子目录（§6.2 精神，留后续）
- 各 spec 的内容调整

## 验收标准

- [ ] `tests/` 顶层为 `unit/ e2e/ support/`（无扁平 *.test.ts 或 *.spec.ts）
- [ ] 根 `e2e/` 不存在
- [ ] `npm test` 全绿
- [ ] `npm run test:e2e` 基础 e2e project 能发现并执行 spec（不要求全绿，因依赖真机/Chrome 环境；但 spec 发现数非零）

## 依赖与约束

- Phase 3 (T003/T004/T005) 已完成；测试 import 已指向新 src 路径。
- 不变量：vitest 仍跑所有 unit 测试；playwright 各 project spec 发现数不退化。
