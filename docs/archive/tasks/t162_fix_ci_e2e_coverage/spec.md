# Task spec

## 背景

CI 的 `test:e2e` 只运行 `e2e` 项目（`playwright.config.ts:41-43` 仅匹配 `e2e.spec.ts`），其余 7 个 `tests/e2e/e2e-*.spec.ts` 文件不属于任何 Playwright 项目，`test:e2e:all` 也无法覆盖它们；同时 CI 无 Python 步骤，`tests/repo_template/test_*.py` 全部不在 main 门禁内，`docs/blueprint/testing.md` 声明的 pytest 门禁从未在 CI 运行。

## 契约区

### 范围

- 将全部预期 E2E 文件纳入明确 Playwright 项目（优先维护 glob 模式，避免枚举易漏清单）。
- 增加 discovery guard：枚举 `tests/e2e/**/*.spec.ts`，任何文件被零个项目选中（或意外被多项目选中）则失败。
- CI 运行真实 release-gate 项目集；为 headed 扩展场景提供 CI 可用的 Chromium 扩展模式（如虚拟显示）。
- `test:e2e:all` 语义完整，或改名以反映真实范围。
- CI quality job 增加 `actions/setup-python` + `python3 -m pytest tests/repo_template/ -q`（可统一为 `npm run test:toolchain` 入口）。

### 非范围

- 不修复各 E2E 文件内部断言质量问题（见 t163）。
- 不改变 `npm test`（vitest）的收集范围。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->
只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。
<!-- /规范 -->

- [ ] AC-001：`tests/e2e/**/*.spec.ts` 中每个文件至少被一个 Playwright 项目 testMatch 选中，discovery guard 通过。
- [ ] AC-002：向 `tests/e2e/` 新增一个不被任何项目匹配的 `*.spec.ts` 文件时，discovery guard 失败并报出该文件名。
- [ ] AC-003：CI 的 E2E job 实际运行 release-gate 项目集（非仅静态 headless smoke 路径）。
- [ ] AC-004：CI quality job 执行 `python3 -m pytest tests/repo_template/ -q`，任一测试失败使 job 失败。
- [ ] AC-005：`test:e2e:all` 命令名与其实际覆盖一致（完整覆盖或改名）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- AC-003 `[deploy]`：需真实 CI 环境运行验证，agent 本地无法自证；其余 AC 可用本地 Playwright `--list` 与 discovery guard 脚本自测。

## 上下文区

- 来源：TD-001、RT-001（2026-08-13 核实；`docs/archive/tasks/t106_popup_category_capture_gates/review_test.md:119-134` 已指出 `e2e-toggle-effects.spec.ts` 未接线）。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- discovery guard 用真实目录枚举 + Playwright config 解析断言覆盖；CI 变更用 workflow 静态检查。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- headed 扩展模式在 Linux CI 的最小可行方案（xvfb 等）：`UNVERIFIED-SPIKE`，执行期在本地/CI 验证 Chromium 扩展加载。

### 风险与回退

- 风险：CI 新增 headed E2E 导致不稳定/慢。
- 回退：将不稳定扩展场景标记为允许失败或拆独立 job，但 discovery guard 仍保证文件被选中。

### 依赖与约束

- 依赖 t163 的 E2E 断言质量修复后，接入的 E2E 才有真实价值（非强依赖，可并行）。

### Finalization 时更新的 blueprint

- `docs/blueprint/testing.md`：同步 CI 实际运行的门禁命令与 E2E 项目覆盖。
