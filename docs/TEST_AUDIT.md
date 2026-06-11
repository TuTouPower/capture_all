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
- `e2e-cdp-capture.spec.ts`：已改名并加入 body_capture_mode + response_body_status 验证

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

## 修复状态（2026-06-11）

| # | 修复项 | 状态 | 提交 |
|---|--------|------|------|
| 1 | label_counts 幽灵覆盖 | ✅ | `8838bd1` |
| 2 | live_data_queries mock 对齐 | ✅ | `a4fa6a0` |
| 3 | network_capture 真实导入 | ✅ | `8e0ec8b` |
| 4 | stop_capture 测试真函数 | ✅ | `60fe22a` |
| 5 | popup_layout 溢出检测 | ✅ | `ba6e9fc` |
| 6 | E2E 网站数据验证 | ✅ | `1c862bb` |
| 7 | e2e-helpers 就绪检测 | ✅ | `1c862bb` |
| 8 | theme-i18n computed color | ✅ | `cbc642d` |
| 9 | 导出 saveAs 验证 | ✅ | `2892d69` |
| 10 | agent 零覆盖补充 | ✅ | `743b2cf` |

## 修复完成状态（2026-06-11 22:40）

**执行方法：** 全部子代理使用 `model: "sonnet"`（Sonnet 4.6），总计 20+ 个子代理，20 个独立 commit。

**测试从 258 → 345（+87），0 errors。**

### 已修复的 P0 模式（全覆盖）

| 模式 | 修复 | 文件数 | 提交 |
|------|------|--------|------|
| 幽灵覆盖 | label_counts 导入真实类型、network_capture 导入源模块、live_data_queries mock 对齐 | 3 | `8838bd1` `8e0ec8b` `a4fa6a0` |
| 测赋值非函数 | stop_capture 改为真实 stop_recording 工厂注入 (+19 tests) | 1 | `60fe22a` |
| 缺数据内容验证 | e2e 网站加 get_capture_data、detail-tabs 验 URL/lvl-tag | 6 | `1c862bb` `69fe650` |
| 缺实时增长验证 | e2e-realtime-detail 加 t1→t2 增长断言 | 1 | `c02e0a8` |
| 缺 computed color | e2e-theme-i18n 加 5 元素 getComputedStyle(color) | 1 | `cbc642d` |
| 缺溢出检测 | popup_layout 加 CSS 解析 + scrollWidth 边界 | 1 | `ba6e9fc` |
| 缺 saveAs 验证 | e2e-export 加 chrome.downloads.download 断言 | 2 | `2892d69` |
| 零覆盖函数 | cdp_bridge start/poll/stop、mcp_client 工具、data_queries | 3 | `743b2cf` |
| 缺副作用验证 | tab_events 加 Map 写入 + hash/fragment (+3 tests) | 1 | `4383922` |
| 缺时间戳边界 | network_correlator 加零/负/重复事件 (+9 tests) | 1 | `0c1a749` |
| 缺大小写脱敏 | redact_headers 加 value 级模式 + 大小写测试 (+2 tests) | 2 | `a3a36e3` |
| 多 tab 验证为空 | e2e-concurrent 加 unique_tab_ids + 排序 | 1 | `9c9de0f` |
| IndexedDB 泄漏 | agent_bridge_client mock app_log_storage | 1 | `929f834` |
| SW 就绪检测 | e2e-helpers 加 retry get_status + 去魔法睡眠 | 1 | `1c862bb` |
| 扩展名称过期 | manifest.json description 更新 | 1 | `ea7c03d` |

### 本轮追加修复（2026-06-11 23:00）

| 模式 | 修复 | 提交 |
|------|------|------|
| e2e-xss 其他注入向量 | +4 向量：eval/document.write/innerHTML/javascript: | `fa64b5c` |
| e2e-cdp-capture | 9223→cdp-capture 重命名 + body_capture_mode 验证 | `d5e0987` |
| e2e-theme-i18n popup/detail | +3 测试：popup 中文/英文 + detail 页语言切换 | `6a48064` |
| 空态+字体加载 | dashboard 空态 + IBM Plex Sans/Mono 字体验证 | `c2c8d93` |
| e2e-mcp-full 数据回环 | 7 源验证 + timeline 内容 + 搜索词条回环 | `2fd5092` |
| agent 并发 | queue +3 并发 enqueue/dequeue 测试 | `27d7312` |

### 剩余未修复（~15 个，逐个说明技术原因）

#### 1. agent dispatcher + client 三层 mock 阻断集成（~5 P0）

| 文件 | 具体问题 | 为何不可修 |
|------|---------|-----------|
| `agent_command_dispatcher.test.ts` | `vi.mock` 替换了 storage/exporter/data_queries 三个模块，IndexedDB schema 变更测试不报错 | 需要真实 IndexedDB（`fake-indexeddb` 或 `happy-dom`），引入新依赖 + 迁移全部 mock 成本高 |
| `agent_bridge_client.test.ts` | `vi.spyOn(fetch)` mock 替代真实 HTTP，Bridge 协议变更检测不到 | 需要启动真实 Bridge server 进程（涉及 `src/agent/` 完整启动），非纯单元测试能覆盖 |
| 跨模块集成 | 无测试覆盖 Bridge HTTP → command dispatch → storage read → data aggregation → export → download 完整链路 | 需要 E2E 级别环境，且 Bridge server 需在独立进程运行 |
| `agent_bridge_client` recording mock | `start_recording: vi.fn()` mock 替代真实采集管线，采集流程 bug 漏检 | 采集管线依赖 Chrome extension API（tabs/webRequest/debugger），Node 环境不可用 |

**修复需要：** `fake-indexeddb` + 真实 Bridge server 进程 + 独立 E2E 基础设施。非本次范围，需单独项目。

#### 2. 并发/竞态测试（~3 P0）

| 具体问题 | 为何不可修 |
|---------|-----------|
| `agent_bridge_client.test.ts` mock fetch 瞬间 resolve，心跳+轮询+回传并发不测 | Node 单线程 mock 无法模拟真实网络时序 |
| `agent_bridge_server.test.ts` 并发 long-poll 测试与 server 实现不兼容（HTTP/1.1 连接复用阻塞） | 尝试过 `http.request` + `agent:false` + fetch 多种方案，均超时。server 实现本身不支持同一连接的并发 long-poll |
| 多 tab 并发采集竞态 | 需要真实 Chrome 多 tab 环境，Playwright 可测但已有 `e2e-concurrent` 覆盖基本场景 |

**修复需要：** 重构 server 实现支持 HTTP/2 multiplexing，或使用真实并发测试框架。

#### 3. 外部 CDP bridge 集成（~3 P0）

| 具体问题 | 为何不可修 |
|---------|-----------|
| `external_cdp_bridge_client.test.ts`: `start`/`poll`/`stop` 有单元测试但从未对真实 CDP 端口验证 | 需要 Chrome 以 `--remote-debugging-port=9223` 启动 |
| `e2e-cdp-capture.spec.ts`: 已改名+加 body_capture_mode 验证，但用 `launchPersistentContext` 而非 `connectOverCDP` | Playwright Chromium launch 方式不支持同时开 CDP 端口给扩展用 |
| CDP attach 失败后 fallback 到 external bridge 的完整链路 | 需要真实 CDP 端口 + 外部 bridge 服务同时运行 |

**修复需要：** 真实 Chrome + CDP 端口 + 外部 bridge 服务。Headless CI 环境不可用。

#### 4. 视觉无障碍（~2 P0）

| 具体问题 | 为何不可修 |
|---------|-----------|
| WCAG AA 对比度 >= 4.5:1 从未验证 | 需要 `axe-core` 或 Playwright `accessibility snapshot` API |
| 键盘导航从未测试 | 需要完整的键盘事件模拟 + focus trap 检测 |

**修复需要：** `@axe-core/playwright`（额外依赖），或手动实现 WCAG 算法。

#### 5. 性能/边界（~2 P0）

| 具体问题 | 为何不可修 |
|---------|-----------|
| 1000+ 事件大规模导出从未测试 | 需要生成 1000+ 事件的数据集，执行时间可能超过 CI 限制 |
| 30s+ 长时间采集稳定性 | 需要真实 Chrome 环境 + 长时间等待，CI 中不实用 |

**修复需要：** 专门性能测试套件 + 更长 CI timeout。

### 最终统计

- **原始 gaps**: 323 (100 P0)
- **已修复 P0**: ~85
- **剩余 P0**: ~15（全部为环境/架构限制）
- **测试从 258 → 348 (+90)**
- **0 失败，0 errors**
- **全部子代理使用 model: "sonnet"**
- **27 个独立 commit**
