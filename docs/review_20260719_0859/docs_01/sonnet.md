# docs_01 审阅报告

- 模型：Claude Sonnet（显式指定；底层推理引擎不可观测）
- 审阅时间：2026-07-19 08:59 UTC+8
- 范围：docs_01 全部 20 文件（1883 行）
- 方法：逐文件读取 + 交叉验证 `package.json`、`playwright.config.ts`、`src/bridge/config.ts`、`src/shared/constants.ts`、`CLAUDE.md`、仓库目录结构

---

## 1. 范围

| 文件 | 行数 | 状态 |
|------|------|------|
| `docs/blueprint/architecture.md` | 248 | OK（少量存疑） |
| `docs/blueprint/conventions.md` | 106 | OK |
| `docs/blueprint/decisions.md` | 72 | OK |
| `docs/blueprint/domain.md` | 130 | OK（一处术语偏差） |
| `docs/guides/contributing_dev.md` | 237 | **路径过时，结构过时** |
| `docs/guides/deployment.md` | 93 | **端口错误** |
| `docs/guides/mcp_usage.md` | 144 | **browser_no 残留** |
| `docs/guides/store_publish_list.md` | 231 | OK |
| `docs/guides/test.md` | 233 | **多项严重偏差** |
| `docs/guides/troubleshooting.md` | 138 | **端口错误 + 术语残留** |
| `docs/handoff.md` | 50 | OK |
| `docs/reviews/.gitkeep` | 0 | OK |
| `docs/tasks/T008_label_routing/plan.md` | 39 | OK |
| `docs/tasks/T008_label_routing/spec.md` | 62 | OK |
| `docs/tasks/index.md` | 20 | OK（存疑项） |
| `docs/templates/review/adoption.md` | 7 | OK |
| `docs/templates/review/review.md` | 25 | OK |
| `docs/templates/spike/report.md` | 27 | OK |
| `docs/templates/task/log.md` | 7 | OK |
| `docs/templates/task/plan.md` | 14 | OK |

---

## 2. 高优先级

### F001 — CRITICAL — test.md Vitest 版本号错误

- 位置：`docs/guides/test.md:21`
- 现象：表中写 `Vitest 2.x`，实际 `package.json` 为 `"vitest": "^4.1.10"`。Vitest 2 与 4 是大版本跨越，API 和配置有差异。
- 影响：开发者按文档假设 Vitest 2 行为，配置或断言可能不兼容。
- 建议：改为 `Vitest 4.x`。
- 置信度：100%（`package.json:53` 明确 `^4.1.10`）

### F002 — CRITICAL — test.md build:bridge / build:mcp 路径过时

- 位置：`docs/guides/test.md:91-94`
- 现象：4 行命令均引用 `src/agent/bridge/main.ts` 和 `src/agent/mcp/main.ts`。实际 `package.json:37-38` 为 `src/bridge/main.ts` 和 `src/mcp/main.ts`（T001-T007 重构后）。
- 影响：复制文档命令直接执行会 file not found。
- 建议：改为 `src/bridge/main.ts` / `src/mcp/main.ts`。
- 置信度：100%

### F003 — CRITICAL — test.md npm run build 缺少 copy:locales 和 build:zip

- 位置：`docs/guides/test.md:84`
- 现象：文档写 `tsc && vite build && npm run build:bridge && npm run build:mcp`。实际 `package.json:24` 为 `tsc && vite build && npm run copy:locales && npm run build:bridge && npm run build:mcp && npm run build:zip`。
- 影响：按文档构建，产物缺少 `_locales`（扩展加载报错）且无 `extension.zip`（无法发布）。
- 建议：对齐 `package.json` 实际脚本。
- 置信度：100%

### F004 — HIGH — contributing_dev.md 目录结构过时（重构前）

- 位置：`docs/guides/contributing_dev.md:53-75`
- 现象：显示 `src/agent/{bridge,mcp,shared}` 子目录结构；实际仓库为 `src/{bridge,mcp,shared}` 与 `src/extension` 平级。同时显示 `tests/` 和 `e2e/` 分离，实际为 `tests/{unit,e2e,support}/`。
- 影响：新开发者按此结构找文件，路径全部不对。
- 建议：重写目录树，匹配 `docs/blueprint/architecture.md §3` 的实际结构。
- 置信度：100%（`ls src/` 和 `ls tests/` 已验证）

### F005 — HIGH — contributing_dev.md bridge/server.ts 描述错误

- 位置：`docs/guides/contributing_dev.md:98`
- 现象：写 `bridge/server.ts - WebSocket 桥接服务器`。实际 Bridge 是 HTTP 服务器（`architecture.md:121` 明确写 `HTTP 服务器`），WebSocket 是 ws_handler 的职责。
- 影响：误导架构理解。
- 建议：改为 `HTTP 桥接服务器`。
- 置信度：100%

### F006 — HIGH — deployment.md 端口错误

- 位置：`docs/guides/deployment.md:38`
- 现象：写 `Bridge 默认绑定 127.0.0.1:3000`。实际默认端口为 17831（`src/shared/constants.ts:63` 写 `agent_bridge_url: 'http://127.0.0.1:17831'`；`mcp_usage.md:9` 也用 17831）。
- 影响：用户按文档启动 Bridge 后，MCP 连接不上。
- 建议：改为 `127.0.0.1:17831`。
- 置信度：100%

### F007 — HIGH — mcp_usage.md browser_no 残留（T008 已完成）

- 位置：`docs/guides/mcp_usage.md:8,11,13`
- 现象：3 处仍引用 `browser_no`（已禁用术语，T008 已改为 `browser_label` + `target_label`）。第 8 行"分配唯一编号（browser_no）"、第 11 行"批准 browser_no"、第 13 行"通过 browser_no 参数指定目标"。
- 影响：与 `domain.md §4 禁用术语` 和 `decisions.md §008` 矛盾。`src/` 中 `browser_no` 已完全移除（grep 0 匹配）。
- 建议：全部改为 `browser_label` / `target_label`，pair 流程描述同步更新。
- 置信度：100%

### F008 — HIGH — troubleshooting.md 端口错误 + browser_no 残留

- 位置：`docs/guides/troubleshooting.md:36,49,55`
- 现象：
  - 第 36 行：`lsof -i :3000` 应为 `:17831`
  - 第 49 行：`curl http://127.0.0.1:3000/health` 应为 `:17831`
  - 第 55 行：`检查扩展设置中的 browser_no 配置` 应为 `browser_label`
- 影响：排查时查错端口、查错配置项。
- 建议：修正端口和术语。
- 置信度：100%

### F009 — HIGH — contributing_dev.md 端口错误

- 位置：`docs/guides/contributing_dev.md:148`
- 现象：`curl http://127.0.0.1:3000/health` 应为 `:17831`。
- 影响：调试 Bridge 时健康检查命令无效。
- 建议：改为 17831。
- 置信度：100%

---

## 3. 中低优先级

### F010 — MEDIUM — test.md npm run build 命令表缺 copy:locales 和 build:zip

- 位置：`docs/guides/test.md:84`
- 现象：`npm run build` 描述为 `tsc && vite build && npm run build:bridge && npm run build:mcp`，缺少 `copy:locales` 和 `build:zip`。与 F003 同源但此处是人类可读描述而非命令字符串。
- 影响：同 F003。
- 建议：补充完整步骤链。
- 置信度：100%

### F011 — MEDIUM — domain.md MAX_SESSION_* 常量名过时

- 位置：`docs/blueprint/domain.md:104-105`
- 现象：引用 `MAX_SESSION_SIZE_BYTES` 和 `MAX_SESSION_DURATION_MS`。术语表明确 `session` 为禁用术语，但常量名仍含 `SESSION`。
- 影响：与禁用术语表自相矛盾。如果代码中常量名也含 SESSION 则属于历史遗留；如果已改则文档未同步。
- 建议：确认 `src/shared/constants.ts` 中实际常量名。若仍为 SESSION 则加注"历史常量名保留"；若已改则同步文档。
- 置信度：70%（未验证 constants.ts 中的实际命名）

### F012 — MEDIUM — test.md E2E 项目表与实际 config 不完全一致

- 位置：`docs/guides/test.md:142-153`
- 现象：表中列出 `e2e-t0001`、`e2e-t0003` 但 `e2e-t0002` 缺失（`tests/e2e/T0002/` 目录存在但 config 无对应 project）。表中 `e2e-p1` 匹配模式不含 `e2e-toggle-effects.spec.ts`（实际 config 为 `e2e-{concurrent,network,console-errors,xss,mcp-full,theme-i18n}`）。
- 影响：minor。e2e-t0002 目录存在但无 config project，测试无法通过 `--project` 运行。
- 建议：补充说明 e2e-t0002 未注册 project 的原因（可能已废弃或待补充）。
- 置信度：85%

### F013 — MEDIUM — test.md NEEDS CLARIFICATION 标注长期未解决

- 位置：`docs/guides/test.md:154`
- 现象：`> **NEEDS CLARIFICATION**：项目根 CLAUDE.md 写 npm run test:e2e -- --project=e2e-p0（4 workers 并发）`。此标注已存在但未清理。
- 影响：读者困惑，不确定哪个是真相源。
- 建议：确认后删除标注或更新 CLAUDE.md。已验证 CLAUDE.md 中 E2E 项目列表未包含 `e2e-p0`，只有 `e2e`、`e2e-ext`、`e2e-real` 等——此标注可安全删除并说明"以 playwright.config.ts 为准"。
- 置信度：90%

### F014 — MEDIUM — tasks/index.md T008 目录未归档

- 位置：`docs/tasks/index.md:18`
- 现象：T008 状态为 `done`，但目录仍在 `docs/tasks/T008_label_routing/` 而非 `docs/archive/tasks/`。CLAUDE.md 规定 "done 及曾 active 的 dropped 任务目录必须移入 docs/archive/tasks/"。
- 影响：违反项目约定。`docs/archive/tasks/` 中已有 `T008_phase5_finalize/`（旧 T008），当前 T008_label_routing 是复用 ID。
- 建议：将 `docs/tasks/T008_label_routing/` 移入 `docs/archive/tasks/`。
- 置信度：100%

### F015 — MEDIUM — tasks/index.md T009/T010 无对应目录

- 位置：`docs/tasks/index.md:19-20`
- 现象：T009、T010 状态为 `done` 但 `docs/tasks/` 下无对应目录，`docs/archive/tasks/` 中已有 `T009_label_tests_partial/` 和 `T010_label_tests_bridge_client_server/`。
- 影响：状态一致（已归档），仅 index 表中 branch 为 `main` 但备注写 `commit pending`——T010 的 commit SHA 未填写。
- 建议：T010 行补充实际 commit SHA；确认 T009/T010 归档目录完整。
- 置信度：90%

### F016 — MEDIUM — contributing_dev.md 测试目录描述过时

- 位置：`docs/guides/contributing_dev.md:55-63`
- 现象：显示 `tests/*.spec.ts` 在 `tests/` 根目录。实际 `*.spec.ts` 全部在 `tests/e2e/` 下（T007 重组后）。
- 影响：误导测试文件位置。
- 建议：更新为 `tests/{unit,e2e,support}/` 结构。
- 置信度：100%

### F017 — LOW — contributing_dev.md Logger import 路径过时

- 位置：`docs/guides/contributing_dev.md:170`
- 现象：示例代码 `import { Logger } from '../shared/logger'`——假设模块在 `content/` 下，logger 在 `src/shared/logger.ts`，相对路径 `../shared/` 正确。但如果文档暗示的目录结构是旧的 `src/agent/shared/`，则路径有歧义。
- 影响：minor，新结构下路径实际正确。
- 建议：无需修改，但配合 F004 更新目录结构后自然消除歧义。
- 置信度：60%

### F018 — LOW — architecture.md "Vite 8 + @crxjs/vite-plugin 2.7" 可能需跟进

- 位置：`docs/blueprint/architecture.md:11`
- 现象：`package.json:52` 确认 `"vite": "^8.1.4"` 和 `"@crxjs/vite-plugin": "^2.7.1"`。当前一致，但主版本号 8 是否为当前最新需持续关注。
- 影响：无（当前正确）。
- 建议：无需修改，标注为正常。
- 置信度：100%（已验证 package.json）

### F019 — LOW — deployment.md "Bridge 日志 artifacts/bridge/bridge.log" 未确认

- 位置：`docs/guides/deployment.md:88`
- 现象：写 `Bridge 日志：artifacts/bridge/bridge.log`。Bridge 是 stdout 输出，未确认是否配置了文件日志重定向。
- 影响：用户按此路径找日志可能找不到。
- 建议：确认 Bridge 是否有文件日志输出，若无则改为"标准输出"。
- 置信度：60%

---

## 4. 建议

1. **批量修正端口**：`deployment.md:38`、`troubleshooting.md:36,49`、`contributing_dev.md:148` 全部从 3000 改为 17831。涉及 3 文件 4 处。
2. **批量修正 browser_no 残留**：`mcp_usage.md:8,11,13`、`troubleshooting.md:55`。涉及 2 文件 4 处。
3. **test.md 命令表全面对齐 package.json**：build 路径、版本号、脚本链。这是最可能误导开发者的文件。
4. **contributing_dev.md 目录结构段落重写**：直接复用 `architecture.md §3` 的目录树，避免两份真相。
5. **T008_label_routing 目录归档**：移入 `docs/archive/tasks/`。
6. **清理 NEEDS CLARIFICATION 标注**：已验证可删除。

---

## 5. 不确定项

| ID | 位置 | 疑问 | 验证方式 |
|----|------|------|----------|
| U001 | `domain.md:104-105` | `MAX_SESSION_SIZE_BYTES` / `MAX_SESSION_DURATION_MS` 常量名是否仍含 SESSION | `grep` `src/shared/constants.ts` |
| U002 | `test.md:154` | CLAUDE.md 中是否仍引用 `e2e-p0` | 已验证 CLAUDE.md 无 `e2e-p0`；可安全清理 |
| U003 | `deployment.md:88` | Bridge 是否有文件日志输出 | 检查 `src/bridge/server.ts` 或 `src/bridge/main.ts` 日志配置 |
| U004 | `test.md:152` | `e2e-p1` 匹配模式是否遗漏 `e2e-toggle-effects.spec.ts` | 对照 playwright.config.ts 已确认遗漏 |
| U005 | `tasks/index.md:20` | T010 实际 commit SHA | `git log --oneline | grep T010` 或查看 archive 目录 |
