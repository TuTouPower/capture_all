# Evaluator Brief: T0005

> 机械组装（op_assemble_eval_brief.sh），leader 不参与内容，主会话污染传不过来。
> 你只读本文件 + 启动应用。src/**、tasks/** 不在你的 worktree（结构隔离）。

## 工作 spec（AC/INV/边界/可测性契约/预期失败模式——剥设计探索结论，防 evaluator 被过程带偏，design §2.5/G2）

---
status: approved
type: feat
eval: required
---
# Bridge 自动 enroll 与 instance_token（hash 存储）
## 一句话意图
扩展通过本地 enroll 接口自动登记，Bridge 生成 `instance_token`、只存 hash，后续 heartbeat/poll/result 用该 token 鉴权并绑定实例，用户无需手抄长 token 给扩展。

## 不变量（INV）
- INV-1: Bridge 不向日志/错误回显 token 明文
- INV-2: 存储仅 token 的 sha256（或等价单向摘要），校验恒时比较
- INV-3: enroll 仅接受本机与合法 `chrome-extension://` Origin（与现 Origin 策略一致）；无 Origin 的任意远程不可 enroll
- INV-4: MCP 通道 token（mcp_token）与 instance_token 分离；本 task 至少定义清晰字段，MCP 不得使用 instance_token
- INV-5: 同 `browser_no` 再次 enroll → **顶替**旧实例绑定（写 app/bridge 日志），保证编号唯一路由

## 验收场景（验收标准 AC）
- AC-1: Given Bridge 已启动 When 扩展 `POST /extension/enroll` 带 `{browser_no:1, browser_label?, extension_version, instance_id?}` Then 200 返回 `{instance_id, instance_token, browser_no}` 且仅此一次可见明文 token
- AC-2: Given 已 enroll When 用 instance_token 调 heartbeat/command/result Then 鉴权通过并路由到该实例队列
- AC-3: Given 已 enroll When 用错误 token 调扩展端点 Then 401 `TOKEN_INVALID`
- AC-4: Given browser_no=1 已绑定实例 A When 再次 enroll browser_no=1 Then 旧 A token 失效，新 token 生效；`list/status` 中 browser_no=1 仅对应新 instance
- AC-5: Given enroll 成功 When 检查 Bridge 持久化或内存注册表 Then 无明文 instance_token 字段（仅 hash）

## 边界与反例
- `browser_no` 缺失/非正整数 → 400 `INVALID_QUERY`
- 磁盘持久化（若做）：文件权限应限制；若本 task 仅内存，重启后需重新 enroll（在 AC 中写明）
- MCP `/mcp/*` 仍用 mcp 通道 token，不能用 instance_token 冒充 MCP

## 不做的事
- 不做扩展 UI（T0006）
- 不做配对批准页/6 位码（T0009）；本 task 可为 S0 本机信任 enroll
- 不改导出业务与大文件落盘逻辑

## 技术决策
### 条件强制
依赖 T0004 实例表与每实例队列。

### 设计探索结论
- 用户主路径去手贴 token → enroll 发 token 是最小闭环
- Bridge 存 hash 可轮换/吊销；轮换 API 可留待后续，本 task 用「再 enroll 顶替」完成弱轮换

### 实现锚点
- 新路由: `POST /extension/enroll`、可选 `GET /extension/discover`
- `server.ts` 鉴权分支: MCP 路由 vs Extension 路由使用不同 token 空间
- 注册表字段: `instance_id`, `browser_no`, `browser_label`, `token_hash`, `extension_version`, `active_capture_id`, `last_seen_at`
- 配置: 可增加 `mcp_token` 与（过渡期）旧单一 `token` 兼容开关，但禁止把用户扩展 token 写回仓库

### 可测性契约
- 通道: 直驱 bridge server 单测
- AC-5 否证: 注册表 dump/序列化断言无 raw token 字符串
- 预期失败模式: 仍用全局单 token 导致多扩展互踢但无法编号路由

## 待澄清 [NEEDS CLARIFICATION]
- 注册表是否落盘到 `~/.capture-all/instances.json`：草案默认 **本 task 内存**；持久化可闸门指定并入本 task 或另开。

## 生效规格（开工前基线）

（spec_index.md 索引；按 TID 定位对应 specs/{feature}.md）
# 功能规格索引

每功能一行，指向 `specs/{feature}.md`。blueprint 定义即"已实现"，不设状态列。

| 功能 | 规格 |
|---|---|
| 采集核心（生命周期 / 消息路由 / SW 协调） | [specs/capture_core.md](specs/capture_core.md) |
| 页面事件捕获（content scripts 各 capture 模块） | [specs/content_events.md](specs/content_events.md) |
| 网络请求与 Body 捕获（webRequest / CDP / 三层降级） | [specs/network_body_capture.md](specs/network_body_capture.md) |
| Storage（IndexedDB schema / flush / store 路由） | [specs/storage_indexeddb.md](specs/storage_indexeddb.md) |
| Cookie 捕获 | [specs/cookie.md](specs/cookie.md) |
| Agent MCP（Bridge + MCP Server + 命令映射） | [specs/agent_mcp.md](specs/agent_mcp.md) |
| 弹出窗口三状态 | [specs/popup_3states.md](specs/popup_3states.md) |
| 主面板（采集列表 / 详情 / 设置 / 集成） | [specs/dashboard.md](specs/dashboard.md) |
| DevTools 面板 | [specs/devtools.md](specs/devtools.md) |
| 导出（JSON / JSONL / HAR / HTML） | [specs/export_zip.md](specs/export_zip.md) |
| 脱敏与安全 | [specs/redaction_security.md](specs/redaction_security.md) |
| 设计系统（令牌 / 主题 / 字体） | [specs/design_system.md](specs/design_system.md) |
| 国际化与主题 | [specs/i18n_theme.md](specs/i18n_theme.md) |
| 应用日志 | [specs/app_logging.md](specs/app_logging.md) |

## baselines 索引（重验对照；首次为空）

# baselines 索引

> 基准文件索引：功能名 → 验收标准→ 文件 + 更新说明。
> 验收标准的文字定义在 spec（`op_execution/specs/{TID}_{slug}.md` 的「验收场景」段，功能名 = task spec frontmatter `feature_key`，闸门 A 阶段定，D10），本文件**只索引基准快照文件**，不存 spec 内容。
> baselines 按功能名存（与 `specs/{feature}.md` 同键，1:1 零桥接）；TID 永不复用（op_execution 层）。

<!-- 每个功能一个 section，按验收标准列基准文件 -->

## {功能名}（{YYYY-MM-DD HH:mm:ss UTC+8}）

| 文件 | 对应验收标准 | 类型 | 说明 |
|---|---|---|---|
| {功能名}/AC-N_desc.dom.html | AC-N | DOM/advisory | {flaky，D7：CSS/组件重组触发不匹配，不机械阻断} |
| {功能名}/AC-N_desc.txt | AC-N | 结构化 | {stdout/CLI 原文} |
| {功能名}/AC-N_desc.png | AC-N | 视觉 | {截图锚点，advisory} |

<!--
类型语义：
- 结构化信号（stdout/API 响应体/DB 查询/进程日志；**DOM/a11y 降 advisory，D7**）→ 进机械硬门，夜跑回归判定以此为准
- 视觉锚点（截图）→ advisory，重验时 evaluator 多模态对照，不机械阻断
新增/更新/删除走 closer per-task 提案 + leader 自审（A18）。
-->

## 应用启动方式

从上方工作 spec 的「可测性契约」段提取。

## 执行纪律

- 所有 Bash 命令必须在 dispatch 指定的 eval worktree 内执行。
- cd 后用相对路径写产物，禁止用绝对路径写主工作区。
- 写 Playwright selector 前先 dump 目标页面 DOM，实测属性后再写；禁止猜测 data-* 属性名。
- **禁止用 .fill() 替代真实用户交互**：range/touch/slider 控件必须用 pointer 轨迹（mouse.move → mouse.down → mouse.move → mouse.up）模拟拖动。 只证明 input handler 能响应程序赋值，不能证明用户可操作。

## E2E 固化落点

- 固化产物必须写入仓库跟踪路径 `e2e/T0005/`（或项目 playwright testMatch 可发现路径）。
- 若有 playwright.config，先执行 `npx playwright test --list` 确认发现方式。
- 写在 worktree 临时目录、teardown 即丢的脚本不算固化。

## ⚠️ 构建产物新鲜度（强制自检，本轮改进——防跑旧代码伪绿）

验收前必须确认加载的构建产物来自**当前 task 分支最新源码**，而非 leader 预放的旧产物：
- **自建优先**：能自己从当前分支跑 build（见可测性契约的构建命令）就自建，别信别人放的 artifacts/dist。
- **无法自建时校验指纹**：对比构建产物与源码的时间戳/hash——`find <src> -newer <artifacts/dist入口文件>` 若有输出，说明源码比产物新 = 产物陈旧，判 INSUFFICIENT_EVIDENCE 并报告，不得用旧产物验收。
- **E2E 脚本路径校验**：E2E 用相对路径（$__dirname 等）定位产物时，脚本内必须先 `fs.existsSync` 断言产物入口存在，不存在直接抛错——禁止静默跑不存在/错位的产物（T0002 事故直接教训）。
- 加载产物后，先截图/取版本标识确认是新代码再跑 AC。

## 执行后端（按 AC 通道字段选，CDP 优先）

- 通道字段在上方可测性契约每条 AC 上（CDP | cua | 直驱）。能用 CDP 一律 CDP。
- CDP: Playwright（Electron 用 _electron.launch；扩展用 launchPersistentContext + --load-extension，headed）
- cua: **不可用**（本机未装）。cua 通道的 AC 一律判 INSUFFICIENT_EVIDENCE 并写明缺失，禁止跳过或降级推断。
- 直驱: Bash/HTTP/SQL（CLI/DB/API/进程类 AC）

