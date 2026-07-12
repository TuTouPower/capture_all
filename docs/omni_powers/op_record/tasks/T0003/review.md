# T0003 Review (Round 1)

## 裁决一：规格合规

### 验收标准覆盖
- AC-1：✅ 覆盖 —— NAV 数组从 5 项减为 4 项，移除 `{ key: 'integrations', icon: 'navMcp', lbl: 'MCP / 集成' }`。测试 `'NAV 数组只有 4 项'` + `'NAV 数组不含 integrations key'` 通过正则匹配源码字符串验证（`dashboard.ts:21-26`）。
- AC-2：❌ 缺失 —— 无任何测试覆盖。spec 可测性契约要求 Playwright 验证设置页 `#set-integrations` 存在且包含 Bridge 配置项。现有 `tests/settings_ui.test.ts` 只测 BUG-006/007/008（采集上限/日志级别/日志大小），不涉 `#set-integrations`。实现正确（设置页代码未动），但 0 测试验证此不变量。可在本任务测试文件中补充最小覆盖：读取 settings 源码确认 `id="set-integrations"` 仍存在。
- AC-3：✅ 覆盖 —— `go()` 函数内 `if (p === 'integrations') p = 'captures'`（`dashboard.ts:74`），`render_content()` 中 integrations 分支移除改为 `else { ... render_captures() }`（`dashboard.ts:84`）。测试通过 3 条 it 验证降级逻辑（字符串级检查）。注意 spec 可测性契约要求"调用 `go('integrations')` 后验证无异常、内容区降级到 captures 页面"，当前测试是正则匹配源码而非实际调用 go() 函数，但考虑到纯删除操作的性质，字符串级检查可接受。
- AC-4：✅ 覆盖 —— `grep -r 'render_integrations\|wire_integrations\|BUG-010\|BUG-011' src/` 返回空（仅 tests/ 中测试自身的检查代码命中，符合预期）。测试通过 5 条 it 验证源码中无残留。

### 偏航检查
- 预估 worket：`dashboard.ts`、`dashboard_integrations.ts`、`dashboard-pages.css`、`tests/integration_page.test.ts`
- 实际改动：上述 4 文件 + `leader_checkpoint.md` + `tasks_list.json`（后者为 omni_powers 工作流基础设施文件，leader 更新，非实现偏航）
- 无偏航、无自由发挥。`get_user_config`/`router` import 清理是 spec 实现锚点明确要求的连带清理。

### 不变量检查
- INV-1：✅ 守住 —— MCP Bridge/本地 Agent 后端代码未修改（`src/agent/`、`src/background/agent_bridge_client.ts` 等不动）
- INV-2：✅ 守住 —— 设置页代码（`dashboard_settings.ts`）未修改，`#set-integrations` 保留（`dashboard_settings.ts:91`）
- INV-3：✅ 守住 —— NAV 数组 4 项，侧边栏渲染逻辑不变，其他导航项样式/交互无影响
- INV-4：✅ 守住 —— 后端通信代码全部未动
- INV-5：✅ 守住 —— `go()` 中 integrations 降级为 captures（`dashboard.ts:74`），`render_content()` else 分支回退到 captures（`dashboard.ts:84`），已知 4 个 page 行为不变

### 技术决策落地
- ✅ 所有实现锚点命中：NAV 数组移除（`dashboard.ts:23` 行删除）、import 移除（`dashboard.ts:18`）、渲染分支移除并改为 else（`dashboard.ts:82-84`）、`render_integrations`/`wire_integrations` 函数体删除（`dashboard_integrations.ts` 原 43-74 行）、export 清理（`dashboard_integrations.ts:42`）、CSS 删除（`dashboard-pages.css` 原 291-301 行共 11 条规则）、注释更新（"integrations route" → 移除）
- ✅ 不做的事列表全部遵守：未删除 MCP Bridge 后端、未删除设置页集成区、未修改 MCP 协议/通信逻辑、保留了 `render_current`/`wire_simple_open`/`render_exports`

### 契约边界
- 无 spec-delta。本 task 独立，不涉及变更子流程。

## 裁决二：测试可信

### 测试质量
- **AC-1 测试**：字符串级验证（`readFileSync` + 正则匹配 `const NAV = [...]`）。对于纯删除任务，验证目标代码不存在是可接受的策略，但比行为测试弱——修改源码格式（如加空格）不会破坏测试，修改逻辑（如误删 navigation key）也不一定会被检测到（当前 regex 只检查 key 值不检查完整性）。
- **AC-3 测试**：字符串级验证（检查源码中是否含 `'integrations'`/`'captures'`/`'else'` 等字符串）。spec 可测性契约要求真正调用 `go('integrations')` 并验证副作用，当前实现只做源码正则匹配。**这是事实上的源码快照测试，而非行为测试。** 不过对删除/降级任务来说，源码级检查的实用价值可以接受。
- **AC-4 测试**：合理。既检查源码字符串不含目标函数，又依赖 CLI grep 作为最终验证。
- **导出模块测试**（`dashboard_integrations` 模块 import + `not.toHaveProperty`）：这部分是真正的 JS 行为测试，验证模块消费者视角的导出集合。属于可观察行为。

### 断言用户可观察
- 模块导出检查（`not.toHaveProperty('render_integrations')`）—— 部分可观察（模块公共 API 变更对消费者可见）
- 源码字符串匹配检查 —— 非用户可观察行为，是源码快照
- 对于 T0003 这种纯删除 refactor 任务，源码级断言有一定合理性（AC-4 本身就是 grep），但 AC-3 应该做真正的函数调用测试

### 异步时序
- 无异步逻辑。不适用。

### 危险模式扫描
- 无 `.skip`/`.only`
- 无删除/反转 expect
- 无 timeout/阈值增大
- 无恒假断言或纯存在性断言
- 无 eslint-disable
- `not.toContain`/`not.toHaveProperty` 用法 —— 用于验证删除，方向正确，非危险模式
- implementer 未偷跑 e2e（测试文件为纯 vitest 单元测试，无 Playwright 代码）

## 问题清单

| 问题 | 暂存 | 说明 |
|---|---|---|
| AC-2 零测试覆盖 | 否 | spec 验收标准 AC-2 要求验证设置页 `#set-integrations` 存在且 Bridge 配置项可见。`tests/settings_ui.test.ts` 不涉集成区，`tests/integration_page.test.ts` 未包含 AC-2 测试。可补最小覆盖：读取 `dashboard_settings.ts` 源码确认含 `id="set-integrations"`。实现正确（设置页未动），但缺少自动化不变量守卫。属于范围内 fix |
| AC-3 测试未做实际函数调用 | 否 | spec 可测性契约明确要求"调用 `go('integrations')` 后验证无异常、内容区降级到 captures 页面"。当前测试只正则匹配源码字符串，未实际调用 `go('integrations')` 并验证 `get_page()` 返回 `'captures'`。jsdom 环境下可真正调用函数做行为验证 |

verdict: FAIL

---

# T0003 Review (Round 2)

## Round 1 问题修复情况

| Round 1 问题 | 状态 | 证据 |
|---|---|---|
| AC-2 零测试覆盖 | 已修复 | 新增 5 条测试（`dashboard_settings.ts 保留 #set-integrations 元素`、`保留 MCP Bridge 配置开关`、`保留 Bridge URL 配置`、`保留 Bridge Token 配置`、`保留轮询间隔配置`），全部 PASS |
| AC-3 测试未做实际函数调用 | 已修复 | 新增 8 条测试，通过 `router.go('integrations')` + `get_page()` 真实函数调用验证降级行为，不再仅做源码正则匹配 |

## 裁决一：规格合规

### 验收标准覆盖
- AC-1：覆盖 —— NAV 数组 4 项（正则匹配源码中 `{ key: '...' }` 模式计数为 4），不含 `integrations` key。源码级验证方式与 Round 1 一致，对纯删除 refactor 任务可接受。
- AC-2：覆盖 —— 新增 5 条测试，验证 `dashboard_settings.ts` 源码中保留 `id="set-integrations"`、`agent_bridge_enabled`、`agent_bridge_url`、`agent_bridge_token`、`agent_bridge_poll_interval_ms`。所有测试 PASS。实现端已确认：`dashboard_settings.ts:91-99` 包含完整 `#set-integrations` 区块且 Bridge 配置项齐全。
- AC-3：覆盖 —— `go('integrations')` 通过 `router.go()` 真实调用。测试验证：不抛异常、`get_page()` 返回 `'captures'`、已知 4 个合法 page 行为不变、router.go 是真实函数。实现端：`dashboard.ts:74` 中 `if (p === 'integrations') p = 'captures'` 降级逻辑正确。
- AC-4：覆盖 —— `grep -r 'render_integrations\|wire_integrations\|BUG-010\|BUG-011' src/` 返回空（`src/` 中无残留）。测试文件本身包含这些字符串作为断言内容（`not.toHaveProperty('render_integrations')` 等），属预期行为，非死代码残留。模块导出测试（真实 JS 行为测试）验证 `integrations_mod` 无 `render_integrations`/`wire_integrations` 属性，保留 `render_current`/`wire_simple_open`/`render_exports`。

### 偏航检查
- 实际改动文件：`dashboard.ts`、`dashboard_integrations.ts`、`dashboard-pages.css`、`tests/integration_page.test.ts` + 工作流基础设施文件（`leader_checkpoint.md`、`tasks_list.json`，leader 管理）。与 spec workset 一致，无偏航。
- 无 spec 外的"顺手改进"或额外功能。

### 不变量检查
- INV-1：守住 —— `src/agent/`、`src/background/agent_bridge_client.ts` 等后端代码未修改。
- INV-2：守住 —— `dashboard_settings.ts:91-99` 中 `#set-integrations` 完整保留，包含启用开关、URL、Token、轮询间隔输入框。
- INV-3：守住 —— NAV 数组 4 项，侧边栏渲染逻辑未变。
- INV-4：守住 —— 后端通信代码全部未动。
- INV-5：守住 —— `go('integrations')` 降级为 `go('captures')`，`render_content()` else 分支回退到 captures。已知 4 个合法 page 行为不变（经测试验证）。

### 技术决策落地
- 所有实现锚点命中：NAV 移除、import 清理、渲染分支移除并改为 else 回退、函数体删除、export 清理、CSS `.integrations` 11 条规则删除、CSS 注释更新（`integrations route` → 移除）。
- "不做的事"全部遵守。

### 契约边界
- 无 spec-delta，无擅自改 spec。

## 裁决二：测试可信

### 测试质量
- **AC-3 测试（核心改进）**：使用真实函数调用 `router.go('integrations')` + `get_page()`，验证降级行为。这是行为测试，测试的是用户可观察的页面状态变化。符合 spec 可测性契约"调用 go('integrations') 后验证无异常、内容区降级到 captures 页面"。
- **AC-4 模块导出测试**：真实 JS 行为测试，验证模块公共 API (`not.toHaveProperty`)，对模块消费者可见。
- **AC-1 测试**：源码字符串匹配（正则匹配 NAV 数组中的 `{ key: '...' }` 模式计数）。对纯删除 refactor 任务可接受，但不如行为测试强。spec 可测性契约要求 Playwright E2E 验证侧边栏文本——该 E2E 测试本任务 spec 未要求 implementer 补齐（lite 分支约束）。
- **AC-2 测试**：源码字符串匹配（验证 `id="set-integrations"` 等 HTML 模板字符串存在于源码中）。验证的是不变量是否被误删，对纯删除 refactor 任务可接受。

### 断言用户可观察
- 模块导出检查 —— 可观察（模块公共 API 变更对消费者可见）
- `router.go()` + `get_page()` 行为测试 —— 可观察（页面状态变化是用户可感知的）
- 源码字符串匹配（AC-1/AC-2）—— 非直接用户可观察，但对删除型 refactor 任务有实用价值

### 异步时序
- beforeAll 中使用 `await import('../src/dashboard/dashboard')` 动态导入，正确 await。`router.go()` 是同步函数，无 race condition 风险。

### 危险模式扫描
- 无 `.skip`/`.only`
- 无删除/反转 expect
- 无 timeout/阈值增大
- 无恒假断言或纯存在性断言（所有断言均有明确的真/假语义）
- 无 eslint-disable
- `not.toThrow()`/`not.toContain()`/`not.toHaveProperty()` 用于验证删除操作，方向正确

### 红灯归因
- 本轮为修复轮，implementer 响应 Round 1 两个问题的归因正确：AC-2 缺失测试属于覆盖缺口（补充测试），AC-3 测试方式需改进（从源码匹配改为行为调用）。

## 问题清单

| 问题 | 暂存 | 说明 |
|---|---|---|
| AC-4 grep 在测试文件自身命中 | 【暂存:spec 措辞边缘】 | spec AC-4 字面要求 `grep -r 'render_integrations\|wire_integrations' src/ tests/` 无结果。测试文件自身包含这些字符串作为断言内容（`not.toHaveProperty('render_integrations')`），属测试正确行为，非死代码残留。`src/` 单独 grep 返回空。spec 措辞未考虑"测试自身引用被测符号名"的情况，属于 spec 措辞边界问题，非实现缺陷。不阻塞 PASS。 |
| AC-1 仍为源码级验证 | 【暂存:跨 scope】 | AC-1 测试仍用正则匹配源码字符串，而非 Playwright E2E 验证侧边栏 DOM 文本。spec 可测性契约要求 Playwright E2E，但 lite 分支约束下 implementer 不做 E2E。后续 task 如有 E2E 基础设施可补齐。不阻塞本 task PASS。 |

verdict: PASS
