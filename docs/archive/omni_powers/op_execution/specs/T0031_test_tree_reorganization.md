---
status: approved
type: test
eval: required
---
# 重组测试与 runner 发现规则

## 一句话意图
把测试按 unit、integration、e2e、support 分层迁移，并用显式发现规则保证原测试一项不少、无新增 skip。

## 不变量（INV）
- INV-1: 只移动测试、fixture、mock、helper 与 runner 配置，不修改生产行为。
- INV-2: 原断言不得弱化或删除，不用 skip/only/glob 排除掩盖失败。
- INV-3: 各 runner/project 发现数非零，总测试数和分类数量不低于 T0011 基线。
- INV-4: 历史 TID 行为 E2E 继续可执行。

## 验收场景（AC）
- AC-1: Given纯逻辑 tests When 重组 Then位于 `tests/unit/packages` 或 `tests/unit/apps` 且单独可运行。
- AC-2: Given IndexedDB、CaptureRuntime、Bridge、MCP、export tests When 重组 Then位于 `tests/integration` 且单独可运行。
- AC-3: Given Extension/Agent/历史行为 tests When 重组 Then位于 `tests/e2e`，Playwright project 显式发现。
- AC-4: Given mock、fake IndexedDB、WCAG helper 与 fixtures When 重组 Then位于 `tests/support` 且 import 有效。
- AC-5: Given CI/test scripts When 执行 Then unit、integration、e2e 分别运行并对零发现失败。

## 边界与反例
- 测试分类按验证对象和通道，不按旧文件名前缀机械分配。
- 测试移动引发路径问题可修 import/fixture path，不可改业务期望。

## 不做的事
- 不新增产品功能。
- 不改生产源码。
- 不清理活动文档或旧 `src` 转导。

## 技术决策
### 条件强制（被 2+ task 依赖的决策）
- Vitest/Playwright 每个 runner 显式 `testDir`/`testMatch`，零发现属于失败。

### 设计探索结论（命中方案先行信号时）
- 候选: 保持平铺 / 按 runner / 按验证层次。
- 推荐: 按验证层次并由 runner 显式匹配 —— 更清楚表达速度、依赖和验收通道。
- 已知坑: `.spec.ts` 与 `.test.ts` glob 重叠会重复或漏跑，需 count gate。

### 实现锚点（坐标集中地）
- `tests/*.test.ts`、`tests/*.spec.ts`、`e2e/T*/`
- `tests/unit/`、`tests/integration/`、`tests/e2e/`、`tests/support/`
- Vitest/Playwright/tooling test config、CI scripts

### 可测性契约（必填，无 N/A 例外）
- 应用启动方式: `npm run test:unit && npm run test:integration && npm run test:e2e:all`
- AC-1 验收信号: unit discovery/count/pass；通道: CLI。
- AC-2 验收信号: integration discovery/count/pass；通道: CLI。
- AC-3 验收信号: Playwright project discovery/count/pass；通道: CDP。
- AC-4 验收信号: support import resolution；通道: CLI。
- AC-5 验收信号: CI command matrix + zero-test negative fixture；通道: CLI。
- 预期失败模式（建议每条 AC 1 条反例）:
  - AC-1/2/3 若 glob 漏项则 count gate 失败。
  - AC-4 若路径错误则 typecheck/test collect 失败。
  - AC-5 若某 runner 未执行则 CI contract test 失败。

## 待澄清 [NEEDS CLARIFICATION]
无
