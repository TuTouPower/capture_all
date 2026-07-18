# T0003 Report

## 总报告（每轮覆盖，截至最新轮的累积总结）
状态: DONE
完成内容:
- `dashboard.ts`: 移除 NAV 数组 integrations 项（5 项减为 4 项），移除 `render_integrations`/`wire_integrations` import，移除 `render_content` integrations 渲染分支，添加 else 回退到 captures 页面，`go('integrations')` 降级为 `go('captures')`
- `dashboard_integrations.ts`: 删除 `render_integrations` 和 `wire_integrations` 函数定义，清理 `get_user_config`/`router` import，更新 export 集合
- `dashboard-pages.css`: 删除 `.integrations` 等 11 条 CSS 规则，更新注释
- `tests/integration_page.test.ts`: 完全重写，15 条测试覆盖 AC-1/AC-3/AC-4
测试证据: 15/15 PASS (integration_page.test.ts)，全量 853/853 PASS，构建成功，grep 死代码无残留
假设与限制: 无
需进 spec 的决策: 无

---
## Round 1
### 创建/修改的文件
| 文件 | 用途 |
|---|---|
| src/extension/dashboard/dashboard.ts | 移除 NAV integrations 项、import、渲染分支，添加降级回退 |
| src/extension/dashboard/dashboard_integrations.ts | 删除 render_integrations/wire_integrations，清理 import/export |
| src/extension/dashboard/dashboard-pages.css | 删除 .integrations 相关 11 条 CSS 规则 |
| tests/integration_page.test.ts | 完全重写，15 条测试覆盖 AC-1/AC-3/AC-4 |

### 测试输出
integration_page.test.ts: 15 PASS, 0 FAIL
全量单测: 853 PASS, 0 FAIL
构建: tsc + vite build passed (479ms)
grep 死代码: src/ 无匹配，tests/ 仅测试自身中出现
