# Evaluator Brief: T0002

> 机械组装（op_assemble_eval_brief.sh），leader 不参与内容，主会话污染传不过来。
> 你只读本文件 + 启动应用。src/**、tasks/** 不在你的 worktree（结构隔离）。

## 工作 spec（AC/INV/边界/可测性契约/预期失败模式——剥设计探索结论，防 evaluator 被过程带偏，design §2.5/G2）

---
status: approved
type: fix
eval: required
---
# 时间线标记点击跳转
## 一句话意图
点击轨道视图时间线上的事件标记（菱形/圆点/竖线）后，playhead 跳到该事件的时间位置并打开事件详情面板。

## 不变量（INV）
- INV-1: 点击标记后 playhead 时间位置必须精确对应所点击事件的 `relative_time_ms` —— 不能偏移到相邻事件
- INV-2: 点击同一标记两次，第二次行为与第一次一致（幂等）—— 不会因为 inspector 已打开而行为异常或重复渲染

## 验收场景（验收标准 AC）
- AC-1: Given 轨道视图有至少一个事件标记 When 点击任意一个标记 Then playhead 红色竖线跳到该标记所在时间位置，playhead 标签时间更新为该事件时间
- AC-2: Given 轨道视图有事件标记 When 点击标记 Then 右侧 inspector 面板打开，显示该事件的类型、时间、来源等字段信息
- AC-3: Given inspector 已打开显示事件 A When 点击事件 B 的标记 Then inspector 内容切换为事件 B 的详情
- AC-4: Given 轨道视图有事件标记 When 在标记上按住拖动（mousedown → mousemove → mouseup，位移超过阈值） Then 行为等同于 lanes 区域拖动 playhead（仅移动播放头，不打开 inspector）

## 边界与反例
- 标记重叠: 同一时间位置有多个标记时（如 network 和 console 事件同时发生），点击应选中对应 lane 的标记而非误触其他 lane
- 点击 lanes 空白区域: 行为不变——仅移动 playhead，不打开 inspector
- 事件已选中再点标记: 若 inspector 已打开且显示的就是该事件，不重复渲染
- 点击已过滤隐藏的标记: 时间窗口外的标记（`.tl-hidden`，`display:none`）不可见也不可点，点击行为等同于空白区域
- 空事件集: 无标记时 lanes 区域点击行为不变

## 不做的事
- 不实现标记拖拽移动（标记位置由事件时间决定，不可修改）
- 不实现多选标记
- 不实现标记右键菜单
- 不改变 minimap 交互

## 技术决策
### 条件强制
- T0001 方案 B（时间窗口过滤）已冻结。标记位置用 `left: N%` 百分比（无 transform），点击命中可直接用标记的百分比坐标计算 playhead 位置

### 设计探索结论
- 候选: A) 仅 seek——playhead 跳到事件时间 / B) seek + 打开 inspector
- 推荐: B，用户已确认 —— 点击后直接看到事件详情比只跳转更有用
- 已知坑: 标记 pointerdown 冒泡到 lanes 触发拖动。用 stopPropagation + 位移阈值区分 click 和 drag
- 完整探索过程见 `docs/omni_powers/op_record/decisions.md`

### 实现锚点
- 标记元素: `.tl-tick`、`.tl-dot`、`.tl-diamond`（`dashboard_detail.ts:206-212`）
- 标记新增 `data-event-idx` 属性，值为事件在 `filtered_events()` 中的索引
- 事件绑定: `wire_trace()` 中对 `.tl-lanes` 做事件委托，判断 `e.target` 是否匹配标记选择器
- click/drag 区分: pointerdown 记起始坐标，pointerup 算位移。≤ 3px → 单击（seek + inspector）；> 3px → 拖动（仅 seek）
- seek: 单击从 `data-event-idx` 取事件，以 `(e.relative_time_ms / maxT) * 100` 设 playhead 位置并调用 seek。缩放后标记 click 仍用事件时间，不依赖物理坐标
- inspector 打开: `set_dt_sel(idx)` + `set_dt_insp_open(true)` + 重新渲染
- 冒泡: 标记 pointerdown 时 `e.stopPropagation()`

### 可测性契约
- 应用启动方式: `npm run build && npm run serve:e2e`，Playwright 加载扩展后导航到 dashboard 详情页轨道视图
- AC-1 验收信号: Playwright 点击可见标记 → 读 `#tlPlayhead` 的 `left` → 与标记 `left` 值一致（容差内）；关键入口: 扩展 dashboard 详情页轨道视图
- AC-1 通道: CDP（Playwright）
- AC-2 验收信号: Playwright 点击标记 → `.dt-insp` 出现在 DOM 且包含事件类型字段
- AC-2 通道: CDP
- AC-3 验收信号: 点标记 A 记 inspector 文本，点标记 B 验证文本已变
- AC-3 通道: CDP
- AC-4 验收信号: Playwright 在标记上 `mousedown → mousemove`（> 3px）→ `mouseup`，验证 inspector 未出现
- AC-4 通道: CDP
- 测试缝: 需有测试数据（至少一条采集记录含多个不同类型事件）
- 预期失败模式:
  - AC-1 若未 stopPropagation，点击标记触发了 lanes 拖动 → playhead 跳到物理坐标而非事件时间
  - AC-4 若位移阈值缺失或过大，拖动误判为点击 → inspector 意外打开

## 待澄清 [NEEDS CLARIFICATION]
无

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

## 执行后端（按 AC 通道字段选，CDP 优先）

- 通道字段在上方可测性契约每条 AC 上（CDP | cua | 直驱）。能用 CDP 一律 CDP。
- CDP: Playwright（Electron 用 _electron.launch；扩展用 launchPersistentContext + --load-extension，headed）
- cua: **不可用**（本机未装）。cua 通道的 AC 一律判 INSUFFICIENT_EVIDENCE 并写明缺失，禁止跳过或降级推断。
- 直驱: Bash/HTTP/SQL（CLI/DB/API/进程类 AC）

