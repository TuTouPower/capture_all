# 移除 Webhook/Issue 平台卡片及 MCP 集成侧边栏入口 验收报告

## 验收结果

| 验收标准 | 结果 | 证据 |
|---|---|---|
| AC-1: 侧边栏 4 项、无 "MCP / 集成" | PASS | E2E Playwright: nav items = ["采集记录","当前采集","导出任务","设置"], count=4; 截图 artifacts/test-results/T0003-AC1-sidebar.png |
| AC-2: 设置页 #set-integrations 保留、Bridge 配置可用 | PASS | E2E Playwright: #set-integrations 可见, data-sw="agent_bridge_enabled" 可见, data-cfg="agent_bridge_url/token/poll_interval_ms" 全部可见; 截图 artifacts/test-results/T0003-AC2-settings-v2.png |
| AC-3: go('integrations') 无异常、降级到 captures | PASS | 单元测试 25/25 通过(vitest): router.go('integrations') 无 throw, get_page() 返回 'captures'; INV-5 行为等价验证通过 |
| AC-4: grep 死代码无残留 | PASS(附注) | src/: render_integrations/wire_integrations/BUG-010/BUG-011 均 0 匹配; tests/: 仅有验证性断言引用(.not.toContain), 非死代码; BUG-010/BUG-011 全仓库 0 匹配 |

**AC-4 附注**: `grep -r 'render_integrations\|wire_integrations' tests/` 在 integration_page.test.ts 的断言中有命中（`.not.toContain('render_integrations')` 等），这些是验证清理完成的测试断言，不属于"死代码残留"。BUG-010/BUG-011 两个旧 describe 块及其测试逻辑已完全删除，全仓库无匹配。

## 不变量验证

| 不变量 | 结果 |
|---|---|
| INV-1: MCP Bridge 后端功能不受影响 | PASS: src/agent/ 目录完整保留（bridge/mcp/shared/ 均在） |
| INV-2: 设置页集成分区保留 | PASS: #set-integrations 元素存在，Bridge 开关/URL/Token/间隔均可见且功能正常 |
| INV-3: 侧边栏从 5 项减到 4 项 | PASS: .sb-item count=4, 不含 "MCP / 集成" |
| INV-4: 后端代码不做修改 | PASS: src/agent/ 目录 intact, src/background/agent_bridge_client.ts intact |
| INV-5: 行为等价 | PASS: go('captures')/go('settings')/go('current')/go('exports') 行为不变; go('integrations') → captures |

## 边界与反例验证

| 边界 | 结果 |
|---|---|
| CSS 残留: .integrations 等样式类 | PASS: grep src/ for `\.integrations\|integ-card\|integ-top\|integ-meta\|integ-ic\|integ-state` → 0 matches |
| 测试文件不为空 | PASS: integration_page.test.ts 保留 25 个新测试，文件未被删除 |
| 旧 localStorage 残留降级 | PASS: go() 函数 `if (p === 'integrations') p = 'captures'` 处理所有调用路径 |
| 设置页其他分区不受影响 | PASS: 截图显示通用/采集默认值/隐私与脱敏/导出/诊断日志分区均正常 |

## 固化清单

| 测试文件 | 对应验收标准 | 破坏检查 |
|---|---|---|
| e2e/T0003/run-acceptance.mjs | AC-1 (CDP), AC-2 (CDP) | PASS: 脚本通过 Playwright 直接操作扩展自有页 DOM，不依赖内部 import |
| tests/integration_page.test.ts | AC-3 (直驱), AC-4 (直驱) | PASS: AC-3 若 go() 未处理 'integrations' 映射 → get_page() 返回 'integrations' 非 'captures' → 测试变红 |
| baselines/AC-1_nav_items.txt | AC-1 | 结构化基准: 4 项导航文本 |
| baselines/AC-2_integrations.html | AC-2 | 结构化基准: #set-integrations HTML 片段含 Bridge 配置项 |
| baselines/AC-3_unit_test.txt | AC-3 | 结构化基准: 25 tests passed |
| baselines/AC-4_grep.txt | AC-4 | 结构化基准: src/ 零死代码匹配 |

## 破坏检查

AC-3 判别力验证（推理法——单元测试环境无法直接修改源码并重跑）:
- 当前 `go()` 实现: `if (p === 'integrations') p = 'captures'; set_page(p);`
- 若移除 integrations 映射: `set_page('integrations')` → `get_page()` = `'integrations'`
- 测试断言: `expect(get_page()).toBe('captures')` → **变红** ✓
- 测试具备判别力，能捕获回归

AC-1/AC-2 E2E 判别力: 脚本通过 Playwright 直接检查 DOM (.sb-item count, #set-integrations 存在性, data-sw/data-cfg 可见性)。若实现有误（NAV 未移除、设置页误删），playwright assertions 直接 FAIL。

## 对抗探索发现

- 快速连续点击侧边栏导航项（采集记录→设置→当前采集→导出任务→采集记录）: 无异常，导航正常切换
- 直接导航到 dashboard URL 后点击"设置": #set-integrations 正常渲染
- 无发现违反 INV-1~INV-5 的行为

## 可用性判断

- 侧边栏 4 项清晰，导航逻辑正常
- 设置页集成分区完整可用，MCP Bridge 开关/URL/Token/间隔均可交互
- 无导航死胡同（go('integrations') 静默降级到 captures）
- 可用

## 范围外发现

无

verdict: PASS
