# 测试审计报告：表面验证 vs 真实用户体验

日期：2026-06-11
审计范围：58 个测试文件（跳过 7 个新建文件）
方法：10 个子代理并发审计，每组覆盖 2-9 个文件

---

## 总览

| 组 | 文件 | Gaps | P0 | P1 | P2 |
|----|------|------|----|----|-----|
| 1 - e2e 网站 | 6 | 14 | 6 | 5 | 3 |
| 2 - e2e 状态/停止/标签 | 5 | 24 | 13 | 10 | 1 |
| 3 - e2e dashboard/detail | 5 | 46 | 9 | 22 | 15 |
| 4 - e2e network/console/export/logging | 4 | 32 | 10 | 13 | 9 |
| 5 - e2e xss/mcp/theme/9223 | 5 | 39 | 12 | 14 | 9 |
| 6 - agent 单元测试 | 6 | 45 | 10 | 17 | 18 |
| 7 - 数据/网络/脱敏 单元测试 | 6 | 40 | 12 | 19 | 9 |
| 8 - stats/layout 单元测试 | 5 | 32 | 10 | 13 | 9 |
| 9 - 杂项 单元测试 | 9 | 36 | 12 | 17 | 7 |
| 10 - CDP bridge + helpers | 2 | 15 | 6 | 6 | 4 |
| **合计** | **53** | **323** | **100** | **136** | **84** |

---

## 最严重的模式（导致 5 个已发生 Bug 漏检）

### 模式 1：元素存在 ≠ 内容正确

`toBeVisible()` + `toContain(string)` + `count() > 0` 是最常用断言，从不验证元素内的具体数据。

- e2e 网络测试：`net_html.length > 100` 通过，但所有 network 事件 URL/method/status 可为空
- e2e 控制台测试：`body_text.length > 50` 通过，但注入的具体消息文本从未断言出现过
- e2e 导出测试：`category` 存在通过，但值可为 `"unknown"` — 永远不验证是否正确
- e2e 实时详情测试：验了 `"Capture All"` 文本 + 长度 > 100，从未验证内容在采集过程中**增长**

### 模式 2：mock 替代真实代码

- `network_capture.test.ts`：`extract_request_body` 等函数是**本地副本**，非从源模块导入。源模块改了，测试静默通过
- `label_counts.test.ts`：整个文件测试的函数在 `src/` 中**全不存在** — 幽灵覆盖率
- `live_data_queries.test.ts`：mock 行为与真实代码**相反** — network/console 事件在真实代码中合入 events 数组，mock 断言不存在
- `agent_command_dispatcher.test.ts`：`vi.mock` 替换了 storage、exporter、data_queries 三个模块 — IndexedDB schema 变了测试不报错
- `stop_capture.test.ts`：测试通过手动赋值 `capture.status = 'completed'` 后断言它等于 `'completed'` — 测的是 JavaScript 赋值操作符，不是 `stop_recording` 函数

### 模式 3：属性/常量 ≠ 实际渲染值

- 深色模式测试：只验 `data-theme` 属性 + `--canvas` 变量，不验 `getComputedStyle(color)` — Bug 2/4 漏检
- 布局测试：只验常量 `POPUP_WIDTH_PX = 300`，不验 `scrollWidth > clientWidth` — Bug 5 漏检
- 计时器测试：只验 `toMatch(/\d{2}:\d{2}:\d{2}/)`，不验计时器实际递增 — 静态 `00:00:00` 也通过
- `popup_layout.test.ts`：高度计算是测试自建的算术，不验证实际 DOM 元素的 `getBoundingClientRect()`

### 模式 4：内存 API 调用 ≠ 真实用户交互路径

- 导出测试：通过 `chrome.runtime.sendMessage({ action: 'export_json' })` 在内存中取证，从不验证用户点击导出按钮 → saveAs 对话框 → 磁盘文件的完整链路 — Bug 3 漏检
- MCP 测试：验证协议响应 `data.ok`，从不验证 recording.start 后实际有数据采集到
- 设置测试：验证配置字段存在，不验证修改设置后下次采集实际生效

### 模式 5：无 compute/overflow/color/contrast 视觉断言

- 零个测试调用 `getComputedStyle().color`
- 零个测试检查 `scrollWidth <= clientWidth`
- 零个测试验证 WCAG 对比度
- 零个测试验证字体是否实际加载

---

## P0 关键缺口（每类列举代表性）

### E2E - 数据验证

- 10 个网站 E2E 测试**零个调用 `get_capture_data()`**
- `e2e-concurrent` 标题说"验证不同 tab_id"但断言只有 `body_text.length > 50`
- `e2e-labels` 用 `.mcard[data-count="1"]` 只匹配精确值 1 — 计数 >1 全漏
- `e2e-realtime-detail`：核心功能"实时更新"从未测试 — 打开页面后关闭，不验证内容增长
- `e2e-mcp-full`：16 个测试全部只验 `data.ok`，输入了文本但从不验证文本出现在返回数据中

### E2E - 视觉

- `e2e-ui-audit`：深色模式完全未测
- `e2e-theme-i18n`：英文测试用 `body_text.length > 50` 断言
- `e2e-theme-i18n`：深色模式只验 `data-theme` 属性和 `--canvas`，不验任何渲染颜色

### 单元测试 - 幽灵覆盖

- `label_counts.test.ts`：测试的函数在 src/ 中不存在 — 整文件幽灵覆盖
- `network_capture.test.ts`：测试的是本地复制的函数，不是导入源模块的
- `live_data_queries.test.ts`：mock 行为与真实代码相反
- `stop_capture.test.ts`：测的是 JavaScript 赋值操作符，不是 `stop_recording`

### 单元测试 - 零覆盖

- `external_cdp_bridge_client.test.ts`：只测 `detect`，`start`/`poll`/`stop` 零覆盖
- `agent_mcp_client.test.ts`：16 个 MCP 工具只通过 dispatcher 执行了 1 个
- `agent_data_queries.test.ts`：`load_agent_session_data`、`get_timeline_item_from_session_data` 已导出但从未被测试
- `storage.test.ts`：只测空状态初始条件，从未验证写入或 IndexedDB 持久化

### 基础设施

- `e2e-helpers.ts`：`launch_extension` 不验证扩展是否完全就绪（IndexedDB 初始化？bridge 连通？）
- `e2e-helpers.ts`：无清理/隔离辅助函数 — 一个测试污染后所有测试静默失败
- `e2e-9223.spec.ts`：文件名含 `9223` 但实际用 `launchPersistentContext`，不是 CDP 连接

---

## 已有 5 个 Bug 的测试漏检路径

| Bug | 为什么漏检 |
|-----|-----------|
| 1. 时间线 0 | 无测试调用 `get_capture_data().events` 验网络/控制台事件 |
| 2. 深色文本黑 | 零 `getComputedStyle(color)` 断言 |
| 3. 不弹 saveAs | 内存 `sendMessage` 不触发真实下载路径 |
| 4. 设置文本黑 | 同 Bug 2 |
| 5. 按钮溢出 | 零 `scrollWidth > clientWidth` 断言 |

---

## 建议修复优先级

1. **立即**：修复 `label_counts.test.ts`（幽灵覆盖）、`network_capture.test.ts`（本地副本）、`live_data_queries.test.ts`（mock 反向）
2. **P0**：所有 E2E 网站测试加 `get_capture_data()` 内容验证
3. **P0**：e2e-helpers 加扩展就绪检测 + 清理辅助函数
4. **P0**：深色模式测试加 `getComputedStyle(color)` 断言
5. **P1**：导出测试从内存 API 改为真实下载路径
6. **P1**：popup_layout 从纯算术改为 DOM 渲染验证
