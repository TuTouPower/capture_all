# Capture All 全采 — 测试计划与策略

> 最后更新：2026-06-09
> 基准文档：spec.md、chat10.md（最新用户需求）、TASKS.md、CLAUDE.md

---

## 1. 测试目标

根据 spec.md 和最新用户聊天记录（chat1-10），为 Capture All 全采制定完整测试方案。核心目标：

- 核心采集流程不可用 → 必须发现
- 数据丢失、状态错误、标签计数不准 → 必须发现
- UI 残留旧概念（深度采集/标准采集/模式切换）→ 必须发现
- popup 与 dashboard 七标签统计口径不一致 → 必须发现
- 脱敏、HTML 导出 XSS、bridge token 校验失败 → 必须发现

---

## 2. 测试范围

### 2.1 必须测试（P0）

- 开始采集 → 采集中计时 + 标签实时计数 → 停止采集 → 采集完成
- 弹出窗口三种状态切换（开始采集 / 采集中 / 采集完成）
- 七数据标签在 popup 和 dashboard 中名称和计数一致
- 弹出窗口无滚动条、宽度合适（不大于 Chrome popup 上限）
- popup 和 dashboard 不出现"深度采集""标准采集""模式""当前采集中"等旧概念
- 实时详情页有内容（时间线/网络/控制台不是空的）
- 停止采集按钮有效
- 脱敏管线完整
- HTML 导出 XSS 安全
- Agent bridge token 校验

### 2.2 可弱化测试（P2）

- DevTools 面板（优先级低于 popup 和 dashboard）
- 低频设置项（如 MCP 集成 UI）
- 纯视觉细节

### 2.3 不测试

- 云端同步（spec 明确不做）
- 团队协作后台（spec 明确不做）
- 自动化脚本生成（后续迭代）
- 公网 Agent 服务（spec 明确不做）

---

## 3. 测试策略

```
         ┌──────────────┐
         │  手动验收     │  Chrome 加载扩展 → 真实采集 → 导出
         │  E2E (4条)   │  Playwright 独立浏览器，覆盖核心流程
         ├──────────────┤
         │  集成测试     │  Agent bridge 闭环 / 采集管线 / 导出管线 / 脱敏管线
         ├──────────────┤
         │  单元测试     │  25+ vitest 用例，覆盖脱敏、截断、类型转换、协议映射
         └──────────────┘
```

原则：

- 验证（纯函数/工具/脱敏）→ 单测
- 跨模块组合（bridge+MCP/采集+存储/导出+脱敏）→ 集成测试
- 用户端到端流程（开始→采集→停止→查看→导出）→ E2E
- UI 验收（无滚动条/无旧概念/七标签一致）→ 手动验证 + E2E 截图

---

## 4. 单元测试

### 4.1 现有测试文件

| 测试文件 | 覆盖内容 | 状态 |
|----------|----------|------|
| `redaction.test.ts` | header 脱敏、URL query 脱敏、body 截断、password 脱敏 | 已有 |
| `network_capture.test.ts` | webRequest 监听、headers 捕获、body 状态 | 已有 |
| `capture_modes.test.ts` | CaptureConfig 默认配置 | 已有 |
| `escape.test.ts` | HTML/JS 转义、`</script>` 处理 | 已有 |
| `storage.test.ts` | DB 初始化、Capture CRUD | 已有 |
| `export_settings.test.ts` | 文件名模板、导出目录 | 已有 |
| `system_time.test.ts` | 时区转换、相对/系统时间 | 已有 |
| `agent_bridge_client.test.ts` | heartbeat、poll command、result 回传、401 | 已有 |
| `agent_bridge_config.test.ts` | 默认值、保存/读取 | 已有 |
| `agent_bridge_queue.test.ts` | 命令队列、超时 | 已有 |
| `agent_bridge_server.test.ts` | 端点响应、CORS、健康检查 | 已有 |
| `agent_protocol.test.ts` | 消息格式、错误码 | 已有 |
| `agent_command_dispatcher.test.ts` | 全部命令成功+至少一个错误路径 | 已有 |
| `agent_data_queries.test.ts` | source 统计、分页、时间范围、timeline 合并 | 已有 |
| `agent_mcp_client.test.ts` | 工具转发、错误透传 | 已有 |
| `network_correlator.test.ts` | CDP/webRequest/fallback 事件匹配 | 已有 |
| `external_cdp_bridge_client.test.ts` | CDP 端口发现、attach/detach | 已有 |
| `tab_events.test.ts` | Tab 打开/关闭/切换/URL 变化 | 已有 |
| `dashboard_config_sync.test.ts` | 设置持久化 | 已有 |
| `popup_main_panel_url.test.ts` | dashboard 跳转参数 | 已有 |
| `example.test.ts` | 示例/占位 | 已有 |

### 4.2 必须补充的单元测试

| 优先级 | 测试内容 | 原因 | 对应缺陷 |
|--------|----------|------|----------|
| **P0** | 七数据标签计数从实际数据计算（非固定为 0） | `refresh_counts()` 需返回正确的 `label_counts` | TASKS.md P0.1 |
| **P0** | `stop_capture` 发送 `{ action: 'stop' }` 后 SW 返回 `{ success: true }` | 验证消息传输和响应 | TASKS.md P0.2 |
| **P0** | `list_events`/`list_network`/`list_console` 对活跃采集 返回实时数据 | 验证数据查询 handler 不丢失活跃采集数据 | TASKS.md P0.3 |
| **P0** | `label_counts` 计算逻辑：从 CaptureEvent.category 映射到七标签 | 验证 category→label 映射正确 | spec 6.3 |
| **P1** | UI 渲染不包含 `深度采集`/`标准采集`/`mode` 等字符串 | 验证旧概念彻底清除 | chat10 |
| **P1** | 所有面向用户字符串使用 `Capture All`/`全采`/`采集` | 验证命名统一 | spec 3.3 |
| **P2** | popup body 高度计算 ≤ Chrome popup 上限 | 验证无滚动条 | TASKS.md 2.1 |

---

## 5. 集成测试

### 5.1 Agent Bridge 闭环

验证扩展 ↔ bridge ↔ MCP server 完整链路：

1. Bridge server 启动 → 健康检查 `GET /health` 返回 200
2. 扩展 heartbeat `POST /extension/heartbeat` → bridge 收到 `extension_version` + `active_capture_id`
3. Bridge 下发命令 → 扩展 dispatcher 执行 → result 回传
4. MCP 工具调用 → bridge → 扩展 → 数据返回
5. 无效 token → 401
6. token 缺失 → 不发起请求
7. 网络失败/超时 → 不静默，返回明确错误码（`BRIDGE_OFFLINE`、`AUTH_FAILED`、`TIMEOUT` 等）

### 5.2 采集管线（端到端数据流）

1. Content script 捕获鼠标/键盘/滚动/DOM 事件 → 规范化 → `chrome.runtime.sendMessage` → background 写入 IndexedDB
2. Background `webRequest` 捕获网络请求 → 脱敏 → 写入 `network_requests` store
3. CDP `Runtime.consoleAPICalled` → `console_event` → 写入 `console_events` store
4. CDP `Runtime.exceptionThrown` → `runtime_exception` → 写入 `error_events` store
5. `chrome.cookies.onChanged` → `cookie_change` → 写入 `cookie_changes` store
6. Content script storage hook → `storage_change` → 写入 `storage_changes` store
7. 采集停止 → flush 所有 buffer → stats 更新

### 5.3 导出管线

1. JSON 导出：`capture_id` 正确、使用新类型（`CaptureEvent` + `*Data`）
2. JSONL 导出：逐行事件、`capture_id` 替换旧 `session_id`
3. HAR 导出：标准格式兼容 Chrome DevTools / Fiddler / Charles
4. HTML 导出：`</script>` 转义为 `<\/script>`、`<` `>` `&` 全部转义、footer 使用 "Capture All"

### 5.4 脱敏管线

1. `authorization`/`cookie`/`set-cookie`/`x-api-key` 等 header → `[REDACTED]`
2. URL query 中 `token`/`key`/`secret`/`password`/`auth` 参数值 → `[REDACTED]`
3. `type=password` input 永远 `value_status: 'not_captured'`
4. request_body 截断 10KB、response_body 截断 50KB
5. `redact_data=false` 时不脱敏不截断

---

## 6. E2E 测试

### 6.1 测试环境

- 框架：Playwright 1.60+
- 浏览器：Chromium（`launchPersistentContext` + `--load-extension`）
- 配置：`playwright.config.ts`
- 原则：不动用户本地 Chrome 实例（参考 `docs/archive/errors.md` 的教训）

### 6.2 E2E 项目

| 项目名 | 文件 | 模式 | 用途 |
|--------|------|------|------|
| e2e | `e2e.spec.ts` | headless | 基础采集流程 |
| e2e-real | `e2e-real.spec.ts` | headed | 真实浏览器采集验证 |
| e2e-cdp-capture | `e2e-cdp-capture.spec.ts` | headed | 含 body capture 验证的采集测试 |
| e2e-mcp | `e2e-mcp.spec.ts` | headed | Agent bridge + MCP 闭环 |

### 6.3 运行命令

```bash
npm run test:e2e       # 基础 E2E (headless)
npm run test:e2e:all   # 全部 4 个项目
```

### 6.4 核心 E2E 场景

#### 场景 1：开始采集 → 采集中 → 停止采集（P0）

用户目标：进行一次完整采集循环。

初始状态：弹出窗口打开，未在采集。

测试步骤：
1. 打开扩展弹出窗口，验证无滚动条、尺寸合适
2. 验证标题为 "Capture All 全采"
3. 验证右上角为「主面板」入口
4. 验证不存在"就绪"状态行、"深度采集/标准采集"切换
5. 点击「开始采集」按钮
6. 验证进入采集中状态：红色计时按钮（含「点击结束」）、实时详情按钮
7. 验证操作区高度固定（108px），三种状态按钮行高一致
8. 验证七数据标签显示数字（不是空或全是 0）
9. 进行页面操作（点击、输入、触发网络请求）
10. 验证标签计数随时间增长
11. 点击红色区域停止采集
12. 验证进入采集完成状态：绿色时长 + 打开详情/导出/开始新采集三按钮

#### 场景 2：七标签统计一致性（P0）

用户目标：确认 popup 和 dashboard 的七标签口径一致。

初始状态：完成一次采集。

测试步骤：
1. 在弹出窗口查看采集完成后的七标签统计
2. 点击「打开详情」进入主面板
3. 在主面板采集详情中查看七标签
4. 验证标签名称完全一致：用户操作、页面导航、网络请求、存储、Cookie、控制台、运行时异常
5. 验证对应计数一致

#### 场景 3：主面板采集详情（P0）

用户目标：在主面板查看采集时间线和分类数据。

初始状态：主面板采集列表中有已完成的采集。

测试步骤：
1. 在主面板采集列表点击一条采集记录
2. 验证详情在主面板内打开（不跳转独立页面）
3. 验证七数据标签统计显示
4. 验证时间线 Tab 有事件
5. 验证网络 Tab 有请求数据
6. 验证控制台 Tab 有日志
7. 验证不出现"深度采集"标签、"当前采集中"卡片
8. 验证不出现"模式"列和"模式"筛选

#### 场景 4：实时详情不为空（P0）

用户目标：采集中查看实时详情时有实际数据。

初始状态：弹出窗口，点击开始采集。

测试步骤：
1. 开始采集后，在弹出窗口中点击「实时详情」
2. 验证跳转到 dashboard 详情视图（`?capture=xxx&page=detail`）
3. 验证时间线 Tab 有事件条目
4. 验证网络 Tab 有请求数据
5. 验证控制台 Tab 有日志输出

#### 场景 5：导出（P1）

用户目标：导出采集数据为不同格式。

初始状态：弹出窗口，采集完成状态。

测试步骤：
1. 点击「导出」→ 选择 JSON
2. 验证导出文件使用 `capture_id`（不是 `session_id`）
3. 验证事件使用 `category` + `type` 两级分类
4. 选择 HTML 导出
5. 验证 HTML 文件可独立打开，无 XSS
6. 验证 HTML footer 为 "Capture All"

#### 场景 6：Agent MCP 闭环（P1）

用户目标：验证 Agent 可通过 bridge 完整控制采集。

测试步骤：
1. 启动 bridge server → 验证 health 端点
2. 验证 heartbeat 上报 online 状态
3. `captures.list` 返回采集列表
4. `capture.start` 启动采集
5. `sources.list` 返回 7 个数据源
6. `capture.get_all_data` 返回完整数据
7. `capture.stop` 停止采集
8. 无效 token → 401

### 6.5 E2E 注意事项

- 禁止 `taskkill /F /IM chrome.exe`（历史事故，见 `docs/archive/errors.md`）
- 优先确定性断言（`expect().toBeVisible()`），不依赖 `waitForTimeout`
- 每个 E2E 测试独立，不依赖其他测试的浏览器状态

---

## 7. UI 验收标准

### 7.1 弹出窗口

| 检查项 | 通过标准 | 来源 |
|--------|----------|------|
| 无滚动条 | body 高度 ≤ Chrome popup 上限（约 600px） | spec 7.1, TASKS 2.1 |
| 宽度合适 | 360-400px，内容等比例缩小 | TASKS 2.2 |
| 主面板按钮背景 | 与外部白色一致，无额外背景块 | chat10 |
| 「查看全部」对齐 | 与「查看详情」右对齐 | chat10 |
| 七标签名称 | 用户操作 / 页面导航 / 网络请求 / 存储 / Cookie / 控制台 / 运行时异常 | spec 6.2 |
| 三种状态 | 只有开始采集、采集中、采集完成；无「就绪」 | chat8 |
| 操作区高度固定 | 三种状态按钮行高度一致（108px） | chat8 |
| 标签卡尺寸统一 | 三种状态下卡片尺寸不变 | chat8 |
| 无模式徽章 | 最近采集不显示"深度/标准" badge | chat10 |
| 无模式切换 | 不出现 segmented control 切换采集模式 | chat8 |

### 7.2 主面板

| 检查项 | 通过标准 | 来源 |
|--------|----------|------|
| 七标签一致 | 名称和计数与 popup 口径相同 | spec 6.3 |
| 无深度采集卡 | 概览统计无"深度采集"卡片 | chat10 |
| 无当前采集中卡 | 概览统计无"当前采集中"卡片 | chat10 |
| 无模式列 | 采集列表表格无"模式"列 | chat10 |
| 无模式筛选 | 筛选条件无"模式"选项 | chat10 |
| 详情不跳转 | 点击采集条目在主面板内展示详情 | spec 7.2 |

---

## 8. 安全测试

### 8.1 脱敏

| 测试项 | 验证方式 | 位置 |
|--------|----------|------|
| Authorization header → `[REDACTED]` | 单测 | `redaction.test.ts` |
| Cookie/Set-Cookie header → `[REDACTED]` | 单测 | 同上 |
| x-api-key 等敏感 header → `[REDACTED]` | 单测 | 同上 |
| URL query token/key/secret/password/auth → `[REDACTED]` | 单测 | 同上 |
| password input 永远不被采集 | 集成测试 | 采集管线 |
| redact_data=false 不脱敏不截断 | 单测 | `redaction.test.ts` |

### 8.2 HTML 导出安全

| 测试项 | 验证方式 |
|--------|----------|
| `</script>` → `<\/script>` | `escape.test.ts` |
| `<` `>` `&` 全部转义 | 同上 |
| 动态内容不可执行 JavaScript | 同上 |

### 8.3 Agent Bridge 安全

| 测试项 | 验证方式 |
|--------|----------|
| 无效 token → 401 | `agent_bridge_server.test.ts` |
| token 缺失 → 不发起请求 | `agent_bridge_client.test.ts` |
| URL 仅允许 127.0.0.1/localhost | `agent_bridge_config.test.ts` |

---

## 9. Mock / Stub 计划

### 应该 Mock

| 依赖 | 测试类型 | 方式 | 原因 |
|------|----------|------|------|
| Chrome API（runtime/storage/tabs/alarms/webRequest/cookies/debugger） | 单测/集成 | vitest mock | 单元测试不在浏览器运行 |
| 网络请求（fetch/XHR） | 单测 | mock response | 稳定可重复 |
| 系统时间 | 单测 | fixed time | 避免时间差异致失败 |
| 外部 CDP bridge | 集成 | stub HTTP | 不依赖外部服务 |

### 不应该 Mock

| 内容 | 原因 |
|------|------|
| 脱敏逻辑本身 | 这是被测对象 |
| capture_id → label 映射 | 这是被测对象 |
| IndexedDB schema | 集成测试用真实 IndexedDB（Playwright Chromium 支持） |
| E2E 中的扩展加载 | 使用真实构建产物 `artifacts/dist/` |

---

## 10. 测试数据

| 数据类型 | 用途 | 示例 |
|----------|------|------|
| 空采集 | 验证零状态 | 0 事件、7 标签全为 0 |
| 小采集 | 验证基本流程 | < 100 事件，每种标签 1-20 个 |
| 中等采集 | 验证统计和分页 | 100-1000 事件 |
| 异常数据 | 验证错误处理 | 网络失败、CDP detach、body 捕获失败、超大响应体 |
| 特殊字符 | 验证脱敏和转义 | URL 含 `<script>`、header 含换行符 |
| 旧版本数据 | 验证兼容性 | 旧 `session_id` 字段、旧 `Session` 类型 |

---

## 11. 回归测试

| 触发原因 | 回归范围 | 必跑测试 |
|----------|----------|----------|
| 修复 P0 bug | 相关功能 + 完整采集流程 | 单元 + 集成 + E2E 场景 1-4 |
| 修改类型定义 | 数据读写 + 旧数据兼容 + 导出格式 | 所有单测 + 集成 + E2E 场景 5 |
| 修改 UI 布局 | popup 和 dashboard 全部状态 | E2E 场景 1-3 + 手动验收 7.1/7.2 |
| 构建发布前 | 所有 P0 流程 | 全部单元 + 全部 E2E + 冒烟测试 |

---

## 12. 冒烟测试

每次构建后快速验证：

- [ ] `npm run build` 成功，`artifacts/dist/` 产物完整
- [ ] `npm test` 全部通过（0 failures）
- [ ] Chrome 可加载扩展，无 manifest 错误
- [ ] 弹出窗口可打开，无滚动条
- [ ] 点击「开始采集」进入采集中状态
- [ ] 采集中标签计数实时变化（非全 0）
- [ ] 点击停止按钮 → 进入采集完成状态
- [ ] 主面板可查看采集列表
- [ ] 无白屏、崩溃、console 严重报错

---

## 13. 已知缺陷与测试关联

| 缺陷 | 对应 TASKS.md | 测试覆盖 |
|------|---------------|----------|
| 采集中标签计数始终为 0 | P0.1 | 需补充单测，E2E 场景 1 step 8-10 |
| 停止采集按钮无效 | P0.2 | 需补充单测，E2E 场景 1 step 11-12 |
| 实时详情页内容为空 | P0.3 | 需补充单测，E2E 场景 4 |
| Popup 出现滚动条 | 2.1 | E2E 场景 1 step 1 |
| Popup 窗口过大 | 2.2 | E2E 场景 1 step 1 |
| UI 残留旧术语 | P1 | 手动验收 7.1/7.2，E2E 场景 1/3 |
| IndexedDB 复合主键碰撞风险 | review.md #3 | 存储层集成测试，高并发 flush 测试 |

---

## 14. 发布门槛

发布前必须全部满足：

- [ ] `npm test` 全部通过（0 failures）
- [ ] `npm run build` 成功，无类型错误
- [ ] `npm run test:e2e` 基础 E2E 通过
- [ ] 弹出窗口无滚动条、尺寸合适
- [ ] 弹出窗口和主面板均不出现"深度采集/标准采集/模式/当前采集中"等旧概念
- [ ] popup 和 dashboard 七数据标签名称和计数一致
- [ ] 采集中计数真实更新（非全 0）
- [ ] 停止采集按钮有效
- [ ] 实时详情页有内容
- [ ] Agent 可读取状态、采集列表、详情、时间线和分类数据
- [ ] HTML 导出无 XSS，`</script>` 已转义
- [ ] 无硬编码密钥/密码/token
- [ ] 所有面向用户文案使用 Capture All / 全采 / 采集

---

## 15. 测试工具速查

| 命令 | 作用 |
|------|------|
| `npm test` | 运行全部 Vitest 单元测试 |
| `npm run test:watch` | Vitest watch 模式 |
| `npm run test:e2e` | 基础 Playwright E2E（headless） |
| `npm run test:e2e:all` | 全部 4 个 E2E 项目 |
| `npm run build` | 生产构建 + TypeScript 类型检查 |

### 项目目录约定

```
tests/                          # 测试文件目录
├── *.test.ts                   # 单元测试（vitest，排除 *.spec.ts）
├── e2e.spec.ts                 # 基础 E2E
├── e2e-real.spec.ts            # 真实浏览器 E2E
├── e2e-cdp-capture.spec.ts      # CDP body capture E2E
└── e2e-mcp.spec.ts             # MCP 闭环 E2E

artifacts/
├── dist/                       # 构建产物（扩展加载源）
└── test-results/               # Playwright 测试输出
```

---

## 16. E2E 并发执行策略

### 16.1 设计原则

E2E 测试最大瓶颈是 I/O 等待（页面加载、网络请求）。必须最大化并行度：

- **独立 spec 文件**：每个网站/场景独立 `.spec.ts`，互不依赖
- **独立浏览器上下文**：每个 spec 启动独立 `launchPersistentContext`，无状态共享
- **Playwright workers**：利用 `--workers` 参数并行执行 spec 文件

### 16.2 Playwright 配置

```typescript
// playwright.config.ts
export default defineConfig({
    workers: 4,                        // 4 个 spec 同时跑
    fullyParallel: true,               // 同一个 spec 内的 test 也并行
    retries: 0,                        // CI 中可设 1
    timeout: 120_000,                  // 单 test 超时 2 分钟
    expect: { timeout: 10_000 },
    use: {
        actionTimeout: 15_000,
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'e2e-p0',
            testMatch: 'tests/e2e-{baidu,toutiao,qq,sina,states,labels,stop,realtime-detail,consistency,dashboard-list,detail-tabs,export,ui-audit}.spec.ts',
        },
        {
            name: 'e2e-p1',
            testMatch: 'tests/e2e-{concurrent,network,console-errors,xss,mcp-full,theme-i18n}.spec.ts',
            workers: 2,                // 增强测试并发数减半，避免资源竞争
        },
    ],
});
```

### 16.3 并发分组

| 分组 | Workers | Spec 文件 | 总耗时估算 |
|------|---------|-----------|-----------|
| **G1 状态基础** | 1 | states, stop, labels, realtime-detail | ~60s（串行，有依赖） |
| **G2 四网站** | 4 | baidu, toutiao, qq, sina | ~90s（完全并发，耗时=max(单个)） |
| **G3 一致性/导出** | 4 | consistency, dashboard-list, detail-tabs, export, ui-audit | ~60s |
| **G4 增强** | 3 | concurrent, network, console-errors, xss, mcp-full, theme-i18n | ~120s |

**总耗时**：G1+G2+G3+G4 ≈ 60+90+60+120 = 330s ≈ 5.5 分钟（串行则 15+ 分钟）

### 16.4 单文件内并发

同一个 spec 内，不共享状态的 test 用 `test.describe` 分组并行：

```typescript
// tests/e2e-baidu.spec.ts
test.describe.parallel('baidu full flow', () => {
    test('popup start and verify labels', async ({ popup }) => { ... });
    test('dashboard detail loads', async ({ dashboard }) => { ... });
});
```

### 16.5 避免竞态

- 同一时间只允许一个活跃采集 → 不同 spec 用不同 `capture_id`
- 扩展 popup 页面单例访问 → 每个 spec 打开独立 popup page
- IndexedDB 写入冲突 → 每个 spec 用独立 `launchPersistentContext` (不同 `userDataDir`)
- 端口冲突 → bridge/MCP spec 用独立端口号

### 16.6 CI 运行命令

```bash
npm run build                          # 先构建
npm test                               # 单元测试（vitest 默认并行）
npm run test:e2e -- --project=e2e-p0   # P0 E2E 并发
npm run test:e2e -- --project=e2e-p1   # P1 E2E 并发
```
