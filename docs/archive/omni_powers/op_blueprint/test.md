# 测试

测试分层、运行命令、Mock 策略、调试入口。命名 / 编码规范见 `conventions.md`，构建命令见本文 §3。

## 0. 流程与验收纪律（omni_powers 实践强制）

> 来源：`docs/archive/WORKFLOW_POSTMORTEM.md` + T0001–T0003 process-deviation。违反则 task 不得标 done。

1. **终态产物优先**：验收看用户可观察结果（导出文件、Dashboard DOM、E2E 截图），禁止仅用「调用了某函数 / 单测全绿」代理指标。
2. **否证断言**：至少一条证明旧坏行为消失（`not.toMatch` / grep 空 / DOM 无旧文案），禁止只断言「新字段存在」。
3. **清理类 AC 的 grep 范围默认 `src/`**：`tests/` 内为断言而出现的符号名不算残留；spec 须写清。
4. **通道对齐**：可测性契约写 CDP/Playwright 的 AC，必须由 evaluator 真机跑；implementer 只写结构层单测。
5. **禁止批量翻牌**：一个 commit 不得多项 `done` 而无逐项 evidence。
6. **E2E 固化**：只提交 `e2e/{TID}/*.{ts,cjs,mjs}` 脚本；禁止 `dist/`、Chrome user-data、截图瀑布入库（截图放 `artifacts/` 且 gitignore）。
7. **关闭闸**：`op_close_post` 前须有 review `verdict: PASS` +（行为型）`acceptance_report.md` 末行 `verdict: PASS`；报告正文不得与 PASS 矛盾的范围内 FAIL 未处理。

## 1. 测试分层

| 层 | 框架 | 覆盖 | 运行 |
|---|---|---|---|
| 单元测试 | Vitest 2.x | 纯函数 / 工具 / 脱敏 / 类型映射 / 协议映射 | `npm test` |
| 集成测试 | Vitest | bridge 闭环 / 采集管线 / 导出管线 / 脱敏管线 | `npm test`（与单测合并） |
| E2E | Playwright 1.60 | 用户端到端流程（开始→采集→停止→查看→导出） | `npm run test:e2e` |

原则：

- 验证纯函数 / 工具 / 脱敏 → 单测。
- 跨模块组合（bridge+MCP / 采集+存储 / 导出+脱敏）→ 集成测试（在单测中）。
- 用户端到端流程 → E2E。
- UI 验收（无滚动条 / 无旧概念 / 七标签一致）→ E2E + 手动验收。

## 2. 单元测试

### 2.1 配置

`vitest.config.ts`：

```typescript
export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        exclude: ['node_modules/**', 'dist/**', 'artifacts/**', '.claude/**', '**/*.spec.ts']
    }
});
```

所有 `*.test.ts` 由 vitest 执行；所有 `*.spec.ts` 排除（归 Playwright）。

### 2.2 测试目录（实际）

```
tests/
├── *.test.ts                # vitest 单元/集成测试（约 80 个文件）
├── *.spec.ts                # Playwright E2E（约 40 个文件，平铺在 tests/ 根）
├── __mocks__/
│   └── chrome_debugger.ts   # Chrome debugger mock
├── fixtures/
│   ├── server.ts            # 测试服务器
│   └── test-page.html       # 测试页面
├── helpers/
│   └── wcag_contrast.ts     # WCAG 对比度工具
└── e2e-helpers.ts           # E2E 公共工具
```

### 2.3 主要覆盖域

- 采集模块：`network_capture` / `network_cdp` / `network_correlator` / `console_capture` / `websocket_capture` / `clipboard_capture` / `focus_capture` / `form_submit_capture` / `fullscreen_capture` / `print_capture` / `resize_capture` / `visibility_capture` / `stream_buffer` / `streaming_capture` / `storage_helpers`。
- Agent 链路：`agent_bridge_client` / `agent_bridge_server` / `agent_bridge_queue` / `agent_bridge_config` / `agent_command_dispatcher` / `agent_data_queries` / `agent_mcp_client` / `agent_protocol` / `mcp_schema` / `external_cdp_bridge_client` / `live_data_queries`。
- 数据 / 导出：`redaction` / `escape` / `escape_html` / `export_settings` / `export_utils` / `export_integrity` / `archive_builder` / `archive_config` / `archive_entry` / `body_routing`。
- 统计 / 分类：`capture_stats` / `label_counts` / `event_category` / `event_utils` / `content_event_utils` / `entry_unification` / `pipeline_consistency`。
- UI：`popup_layout` / `popup_export` / `popup_immediate_refresh` / `popup_start_timing` / `popup_main_panel_url` / `dashboard_config_sync` / `settings_ui` / `sidebar_resize` / `detail_layout_source` / `detail_render_consistency` / `dashboard_timeline_marker` / `integration_page` / `ui_strings` / `wcag_contrast` / `extension_icons`。
- 协议契约：`sw_action_contract` / `tab_events` / `stop_capture` / `poll_capture_status` / `content_script_uses_poll` / `session_manager`（兼容层）。
- 历史 P0 回归：`p036_user_action_filter` / `p043_flush_before_read` / `p060_capture_id`。
- 工具：`system_time` / `logger` / `app_log_storage` / `hash` / `default_config`。

## 3. 构建 / 测试 / 启动命令

来源：`package.json scripts`。

| 命令 | 说明 |
|---|---|
| `npm run dev` | Vite dev |
| `npm run build` | `tsc && vite build && npm run build:bridge && npm run build:mcp`，扩展输出 `artifacts/dist/`，Bridge 输出 `artifacts/bridge/bridge.mjs`，MCP Server 输出 `artifacts/mcp/mcp.mjs` |
| `npm test` | `vitest run`，全量单测 |
| `npm run test:watch` | vitest watch |
| `npm run test:e2e` | `playwright test --project=e2e`（仅基础 headless 项目） |
| `npm run test:e2e:all` | `playwright test`（全部项目） |
| `npm run test:e2e:server` | 启动 E2E 测试服务器（`tests/fixtures/server.ts`） |
| `npm run serve:e2e` | `npm run build && vite preview --host 127.0.0.1 --port 4174` |
| `npm run build:bridge` | `esbuild src/agent/bridge/main.ts --bundle --platform=node --format=esm --outfile=artifacts/bridge/bridge.mjs` |
| `npm run build:mcp` | `esbuild src/agent/mcp/main.ts --bundle --platform=node --format=esm --outfile=artifacts/mcp/mcp.mjs` |
| `npm run bridge` | `tsx src/agent/bridge/main.ts`（开发）；构建后：`node artifacts/bridge/bridge.mjs` |
| `npm run mcp` | `tsx src/agent/mcp/main.ts`（开发）；构建后：`node artifacts/mcp/mcp.mjs` |

### 3.1 Bridge / MCP 生产部署

构建产物 `artifacts/bridge/bridge.mjs` 和 `artifacts/mcp/mcp.mjs` 为 esbuild 单文件 bundle，不依赖 tsx 和 node_modules。部署只需复制对应 `.mjs` 文件到目标机器，执行 `node bridge.mjs` 即可。

MCP Server 启动需要环境变量：

| 变量 | 说明 |
|------|------|
| `CAPTURE_ALL_BRIDGE_URL` | Bridge 地址，默认 `http://127.0.0.1:17831` |
| `CAPTURE_ALL_BRIDGE_TOKEN` | 与扩展设置 → 集成 → Bridge Token 一致 |

### 3.2 Claude Code MCP 注册

项目 `.claude/settings.json` 已注册 `capture-all` MCP Server：

```json
{
  "mcpServers": {
    "capture-all": {
      "command": "node",
      "args": ["artifacts/mcp/mcp.mjs"],
      "env": {
        "CAPTURE_ALL_BRIDGE_URL": "http://127.0.0.1:17831",
        "CAPTURE_ALL_BRIDGE_TOKEN": "<用户设置的值>"
      }
    }
  }
}
```

Bridge 持续运行在后台（`node artifacts/bridge/bridge.mjs &`），Claude Code 通过 MCP 工具直接调用 `capture.start`、`captures.list`、`data.list` 等 12 个工具。

## 4. E2E

### 4.1 配置

`playwright.config.ts` 关键项：

- `testDir: ./tests`，`outputDir: artifacts/test-results`。
- `timeout: 120_000`，`expect.timeout: 15_000`，`actionTimeout: 15_000`。
- `webServer` 同时启动扩展预览（`npm run serve:e2e`，`127.0.0.1:4174`）和本地测试站点（`npm run test:e2e:server`，`127.0.0.1:17832`）。
- config 将 `127.0.0.1`、`localhost` 合入 `NO_PROXY` / `no_proxy`，防止本机代理响应导致 `webServer` 健康检查误判。
- 浏览器：Chromium，`launchPersistentContext` + `--load-extension`（在 `e2e-helpers.ts`），不动用户本地 Chrome 实例。

### 4.2 Playwright 项目（实际 config）

| 项目名 | 模式 | 文件匹配 | workers |
|---|---|---|---|
| `e2e` | headless | `e2e.spec.ts` | 默认 |
| `e2e-ext` | headed | baidu / states / labels / stop / ui-audit / export / realtime-detail / consistency / dashboard-list / detail-tabs / toutiao / qq / sina / logging / 旧 T0001 测试 | 1 |
| `e2e-t0001` | headed | `e2e/T0001/*.spec.ts` | 1 |
| `e2e-t0003` | headed | `e2e/T0003/*.spec.ts` | 1 |
| `e2e-real` | headed | `e2e-real.spec.ts` | 默认 |
| `e2e-cdp-capture` | headed | `e2e-cdp-capture.spec.ts` | 默认 |
| `e2e-mcp` | headed | `e2e-mcp*.spec.ts` | 默认 |
| `e2e-p1` | headed | concurrent / network / console-errors / xss / mcp-full / theme-i18n | 1 |
| `e2e-streaming` | headed | websocket-capture / streaming-capture | 1 |

> **NEEDS CLARIFICATION**：项目根 `CLAUDE.md` 写 `npm run test:e2e -- --project=e2e-p0`（4 workers 并发）和 `--project=e2e-p1`（2 workers），但实际 `playwright.config.ts` 没有 `e2e-p0` 项目，且 `e2e-ext` / `e2e-p1` 实际 `workers: 1`、`fullyParallel: false`。以实际 config 为准；CLAUDE.md 该描述与 config 不一致，待核实是 config 待调整还是 CLAUDE.md 待修正。

### 4.3 核心 E2E 场景

- 开始采集 → 采集中（计时 + 实时计数）→ 停止采集 → 采集完成（`e2e-states` / `e2e-stop` / `e2e-labels`）。
- popup / dashboard 七标签口径一致（`e2e-consistency`）。
- 主面板采集详情（不跳转独立页，`?capture=xxx&page=detail`）（`e2e-dashboard-list` / `e2e-detail-tabs` / `e2e-realtime-detail`）。
- 实时详情不为空（`e2e-realtime-detail`）。
- 四网站采集（baidu / toutiao / qq / sina）。
- CDP body capture + retry（`e2e-cdp-capture` / `e2e-cdp-retry`，注：实际 config 无 `e2e-cdp-retry` 项目，retry 场景归入 `e2e-cdp-capture`）。
- Agent MCP 闭环（`e2e-mcp` / `e2e-mcp-full`）。
- 导出（JSON / JSONL / HAR / HTML，HTML 无 XSS）（`e2e-export` / `e2e-export-content` / `e2e-xss`）。
- 流式 / WebSocket（`e2e-streaming`）。
- 主题与国际化（`e2e-theme-i18n`）。
- UI 审计（无旧概念、无滚动条）（`e2e-ui-audit`）。
- 轨道视图缩放与 minimap（`e2e/T0001/zoom-slider.spec.ts`）：顶部 slider 和底部 `.tl-mm-window` 均执行真实 pointer 序列；minimap 拖动验证 width/zoom 不变、left 与 viewport 位置同步、playhead 居中、marker 进入/离开、左右边界 clamp、活动拖动拒绝其他 `pointerId` 和 100% 全览 no-op。主拖动场景附加前/按住中途/右端截图，必须视觉确认红色窗口本体发生位移。

### 4.4 E2E 纪律

- 禁止 `taskkill /F /IM chrome.exe`（历史事故）。
- 优先确定性断言（`expect().toBeVisible()`），不依赖 `waitForTimeout`。
- 每个 E2E 测试独立启动 `launchPersistentContext`，不共享浏览器状态。
- slider、拖拽、排序等交互 AC 必须执行真实 pointer 序列；禁止用 `fill()`、DOM 赋值或手工 `dispatchEvent()` 代替用户操作。
- 核心 AC 断言禁止用 `if` 静默跳过；前置数据不足必须显式失败。
- “增加”与“减少”必须使用严格比较，并同时断言用户可观察结果，不能只验证内部 value 或事件回调。

## 5. Mock 策略

### 5.1 应该 Mock

| 依赖 | 测试类型 | 方式 |
|---|---|---|
| Chrome API（runtime / storage / tabs / alarms / webRequest / cookies / debugger） | 单测 / 集成 | vitest mock（`__mocks__/chrome_debugger.ts` 等） |
| 网络请求（fetch / XHR） | 单测 | mock response |
| 系统时间 | 单测 | fixed time |
| 外部 CDP bridge | 集成 | stub HTTP |
| IndexedDB（单测环境） | 单测 | `fake-indexeddb` |

### 5.2 不应该 Mock

| 内容 | 原因 |
|---|---|
| 脱敏逻辑本身 | 被测对象 |
| capture_id → label 映射 | 被测对象 |
| IndexedDB schema（集成 / E2E） | 用真实 IndexedDB（Playwright Chromium 支持） |
| E2E 中的扩展加载 | 使用真实构建产物 `artifacts/dist/` |

## 6. 覆盖目标

- 纯函数 / 工具 / 脱敏 / 类型映射：接近全覆盖。
- 采集模块：每模块至少覆盖核心事件生成路径 + 边界（空 / 截断 / 异常）。
- Agent 链路：bridge 端点 + 命令分发 + 查询参数 + 错误码全路径。
- E2E：P0 核心流程（开始 / 停止 / 标签一致 / 详情 / 实时详情）必过。

## 7. 回归触发

| 触发 | 范围 | 必跑 |
|---|---|---|
| 修复 P0 bug | 相关功能 + 完整采集流程 | 单测 + 集成 + 核心场景 E2E |
| 修改类型定义 | 数据读写 + 旧数据兼容 + 导出格式 | 所有单测 + 集成 + 导出 E2E |
| 修改 UI 布局 | popup / dashboard 全状态 | E2E states / labels / consistency + 手动验收 |
| 发布前 | 所有 P0 流程 | 全部单测 + 全部 E2E + 冒烟 |

## 8. 冒烟（每次构建后）

- `npm run build` 成功，`artifacts/dist/` 完整。
- `npm test` 全绿（0 failures）。
- Chrome 可加载扩展，无 manifest 错误。
- 弹出窗口可打开，无滚动条。
- 开始采集 → 采集中（计数非全 0）→ 停止 → 采集完成。
- 主面板可查看采集列表。
- 无白屏 / 崩溃 / console 严重报错。

## 9. 调试入口

- 单测失败：`npm test <file>` 单跑，`npm run test:watch` watch。
- E2E 失败：`npx playwright test <spec> --headed --debug`，trace 在 `artifacts/test-results/`。
- Bridge 调试：`npm run bridge` 启动本地 bridge，`curl http://127.0.0.1:17831/health` 验证。
- MCP 调试：`npm run mcp` 启动 MCP Server。
- 扩展加载：Chrome `chrome://extensions` 加载 `artifacts/dist/`。
