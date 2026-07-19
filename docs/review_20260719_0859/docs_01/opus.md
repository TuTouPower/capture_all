# docs_01 审阅 — opus

## 模型依据

显式模型：opus。底层模型版本与采样参数不可观测；本报告仅依据仓库当前快照与代码事实做出判断。

## 范围

MANIFEST.md `docs_01` 批次 20 文件：

- `docs/blueprint/architecture.md`、`conventions.md`、`decisions.md`、`domain.md`
- `docs/guides/contributing_dev.md`、`deployment.md`、`mcp_usage.md`、`store_publish_list.md`、`test.md`、`troubleshooting.md`
- `docs/handoff.md`
- `docs/reviews/.gitkeep`
- `docs/tasks/T008_label_routing/plan.md`、`spec.md`
- `docs/tasks/index.md`
- `docs/templates/review/{adoption.md,review.md}`、`docs/templates/spike/report.md`、`docs/templates/task/{log.md,plan.md}`

交叉核对来源：`package.json`、`src/` 实际目录、`src/shared/constants.ts`、`src/mcp/tools.ts`、`src/bridge/config.ts`、`tests/` 实际结构、`docs/archive/refactor_plan.md`。

---

## 高优先级

### d01_f001 — `docs/refactor_plan.md` 已归档但活动文档仍按活动路径引用

- 严重度：HIGH
- 位置：
  - `docs/handoff.md:25` — "当前焦点：`docs/refactor_plan.md` 全部 Phase 闭合"
  - `docs/blueprint/decisions.md:29` — "详见 `docs/refactor_plan.md`"
  - `docs/blueprint/decisions.md:36` — "文件归属表见 `docs/refactor_plan.md` §4.3"
  - `docs/guides/contributing_dev.md:73` — 项目结构图标注 "refactor_plan.md # 重构计划（活动）"
  - `docs/guides/contributing_dev.md:77` — "目录即将按 `docs/refactor_plan.md` 重构…本页描述现状"
  - 仓库根 `AGENTS.md:20`、`CLAUDE.md:20` — "修改 `src/` 目录结构或 import 路径前必读"（不在本批次，但形成入口断链）
- 现象：文件系统验证 `docs/refactor_plan.md` 不存在；实际位于 `docs/archive/refactor_plan.md`（20.4 KB）。T001–T007 已全部 done，重构主体已闭合，但 blueprint 与 guides 仍把它当作"活动"真相源引用。
- 影响：新接手者按 CLAUDE.md 入口指示找不到文件；decisions §002/§003 的归属表链接断开；contributing_dev.md "本页描述现状" 与已完成的 `src/{extension,bridge,mcp,shared}` 三产品结构冲突。
- 建议：
  1. decisions.md §002/§003 把"详见 `docs/refactor_plan.md`"改为引用 `docs/archive/refactor_plan.md`，或直接内联结论（重构已完成，归属表可固化进 blueprint）。
  2. contributing_dev.md 第 73 行结构图与第 77 行"即将重构"语删除或改为历史注脚。
  3. handoff.md 第 25 行已是历史记录（交接段为追加式），可保留原文但建议在段尾补一句"refactor_plan.md 已归档至 `docs/archive/`"。
- 置信度：0.97

### d01_f002 — `docs/guides/test.md` 大面积残留 `src/agent/` 旧路径与旧项目结构

- 严重度：HIGH
- 位置：
  - `docs/guides/test.md:69` — Agent 链路文件清单引用 `agent_bridge_server` 等不存在于 src 的命名
  - `docs/guides/test.md:91` — `npm run build:bridge` 行写 `esbuild src/agent/bridge/main.ts`
  - `docs/guides/test.md:92` — `npm run build:mcp` 行写 `esbuild src/agent/mcp/main.ts`
  - `docs/guides/test.md:93` — `npm run bridge` 行写 `tsx src/agent/bridge/main.ts`
  - `docs/guides/test.md:94` — `npm run mcp` 行写 `tsx src/agent/mcp/main.ts`
- 现象：`package.json` 实际脚本为 `esbuild src/bridge/main.ts` 与 `esbuild src/mcp/main.ts`、`tsx src/bridge/main.ts`、`tsx src/mcp/main.ts`。`src/agent/` 目录在 T004 后已删除（见 `docs/tasks/index.md` T004 备注）。
- 影响：开发者照 test.md §3 命令表手抄命令会直接失败；test.md 与 architecture.md（已对齐新路径）出现内部冲突。
- 建议：把 §3 表中所有 `src/agent/bridge/` → `src/bridge/`、`src/agent/mcp/` → `src/mcp/`；§2.3 文件清单同步更新命名。
- 置信度：0.98

### d01_f003 — `docs/guides/test.md` 测试目录描述与实际结构不符

- 严重度：HIGH
- 位置：`docs/guides/test.md:50-64` §2.2
- 现象：文档描述 `tests/*.test.ts`、`tests/*.spec.ts`、`tests/__mocks__/`、`tests/fixtures/`、`tests/helpers/`、`tests/e2e-helpers.ts`，平铺在 `tests/` 根。实际 `tests/` 已是 `unit/`、`e2e/`、`support/` 三层（T007 已完成，见 `docs/tasks/index.md` T007）。
- 影响：开发者按 §2.2 找不到测试；与 `docs/handoff.md:46` 陷阱条目"`tests/unit/` 含所有 .test.ts"自相矛盾；§2.2 给的 vitest exclude `dist/**` 等配置也已过时（实际 vitest.config.ts 在 T007 Commit B 已改）。
- 建议：整段 §2.2 重写为 `tests/{unit,e2e,support}/` 树；同步 §2.1 vitest exclude 示例。
- 置信度：0.96

### d01_f004 — `docs/guides/test.md` 写 "Vitest 2.x"，实际为 Vitest 4.x

- 严重度：HIGH
- 位置：`docs/guides/test.md:21`
- 现象：表格第一行"单元测试"列写 `Vitest 2.x`；`package.json` 实际依赖 `"vitest": "^4.1.10"`；同仓库 `docs/blueprint/architecture.md:12` 和 `docs/guides/contributing_dev.md:11` 都写 "Vitest 4.x"。
- 影响：同一仓库三处版本声明，其中 test.md 错误，且 Vitest 2→4 跨两个大版本，API（fake timers、coverage、Task API）有差异，照 2.x 写测试代码会踩坑。
- 建议：改为 `Vitest 4.x`。
- 置信度：0.99

---

## 中低优先级

### d01_f005 — `docs/blueprint/architecture.md` 模块树遗漏实际存在的文件

- 严重度：MEDIUM
- 位置：`docs/blueprint/architecture.md:73-92`（background 树）、`architecture.md:93-100`（content 树）
- 现象：实际 `src/extension/background/` 还存在 `webrequest_handler.ts`、`ws_handler.ts`（architecture 只列了 `network_capture.ts` / `network_webrequest.ts` / `network_context.ts` / `network_correlator.ts`，未列两个 handler）。
- 影响：模块清单非"唯一真相源"声称的完整性；新开发者读 blueprint 后仍需 `ls` 才能知道 handler 文件存在。
- 建议：在 background 子树补 `webrequest_handler.ts # webRequest 事件入口` 与 `ws_handler.ts # WebSocket 事件处理`。
- 置信度：0.85

### d01_f006 — MCP 工具数量描述过时

- 严重度：MEDIUM
- 位置：
  - `docs/blueprint/architecture.md:246` — "启动后自动加载 12 个 MCP 工具"
  - `docs/guides/test.md:126` — "Claude Code 通过 MCP 工具直接调用 `capture.start`、`captures.list`、`data.list` 等 12 个工具"
  - `docs/blueprint/domain.md:29-48` — §2 MCP 工具表列 11 个用户工具 + 2 行别名，未列 `list_browsers`
- 现象：`src/mcp/tools.ts` 中 `MCP_TOOL_NAMES = ['get_status', 'list_browsers', ...Object.keys(TOOL_COMMANDS)]`，TOOL_COMMANDS 有 15 个键（含 3 个兼容别名 `list_sessions`/`get_session`/`get_all_session_data`/`export_session` 共 4 个别名 + 11 个主名）。实际暴露工具数 = 2 + 15 = 17。即便只数主名（不含别名），也是 13 个（`get_status` + `list_browsers` + 11 主工具），不是 12。
- 影响：architecture.md 与 test.md 数字错误；domain.md §2 漏列 `list_browsers`（T008 引入的多实例路由工具），与 T008 spec "MCP 工具参数 `target_instance_id` + `target_label`" 引入的新工具集不一致。
- 建议：
  1. 把 architecture.md 第 246 行与 test.md 第 126 行改为实际工具数（去掉兼容别名后是 13，含别名 17；建议明确写"13 个主工具 + 4 个兼容别名"）。
  2. domain.md §2 表补 `list_browsers` 行，说明对应 `get_status` 派生（返回扩展实例列表）。
- 置信度：0.9

### d01_f007 — `docs/blueprint/domain.md` 仍把 `start_recording` 写为推荐工具名，与禁用术语精神冲突

- 严重度：MEDIUM
- 位置：`docs/blueprint/domain.md:31-48`
- 现象：§4 禁用术语表明确禁止 `record / 录制 / 记录` 作产品术语；但 §2 MCP 工具表第一行 `start_recording` / `stop_recording` 仍保留 `record` 词汇作为对外 MCP 工具名。代码侧 `src/mcp/tools.ts` 也确实是 `start_recording`/`stop_recording`。
- 影响：术语规则与实际暴露 API 名不一致；文档审查者无法判断"禁用 record"是仅指中文文案还是也包括英文 API 名。
- 建议：要么 §4 显式声明"禁用 record 仅适用于中文 UI 文案，MCP 工具名 `start_recording` 作为已发布 API 保持兼容"，要么在 §2 表头加注"`start_recording` 为历史 API 名，保留兼容"。
- 置信度：0.8

### d01_f008 — `docs/guides/contributing_dev.md` 项目结构整段过时

- 严重度：MEDIUM
- 位置：`docs/guides/contributing_dev.md:53-77`
- 现象：项目结构图仍画 `src/agent/{bridge,mcp,shared}` + `src/{background,content,dashboard,...}` + `src/shared/`。实际 T001–T005 已完成 `src/{extension,bridge,mcp,shared}` 重构。第 77 行虽加了 "目录即将按 … 重构" 注脚，但重构是已完成动作（非"即将"）。
- 影响：与 architecture.md（已用新结构）冲突；新人入门页与模块树不一致。
- 建议：整段结构图替换为 `src/{extension,bridge,mcp,shared}` 现状；删除"即将重构"注脚或改为"历史：T001–T005 重构记录见 `docs/archive/refactor_plan.md`"。
- 置信度：0.95

### d01_f009 — `docs/guides/contributing_dev.md` Bridge 调试示例端口与项目默认端口不一致

- 严重度：MEDIUM
- 位置：`docs/guides/contributing_dev.md:148`
- 现象：示例写 `curl http://127.0.0.1:3000/health`，但项目实际默认端口是 17831（见 `.claude/settings.json` SessionStart hook、`docs/guides/mcp_usage.md:9`、`docs/guides/test.md:104`、`docs/guides/deployment.md` 隐式 `--port 17831`）。`troubleshooting.md:36` 与 `:49` 也都写 3000。
- 影响：开发者照复制 curl 会得到 connection refused；与 domain.md §5 "Bridge 端口由用户配置，默认配置中的 agent_bridge_url 指向 `http://127.0.0.1:17831`" 矛盾。
- 建议：统一为 `127.0.0.1:17831`，或在示例旁注明"以实际 `--port` 为准"。
- 置信度：0.9

### d01_f010 — `docs/guides/mcp_usage.md` 快速开始与 §133（i18n token）描述冲突

- 严重度：MEDIUM
- 位置：
  - `docs/guides/mcp_usage.md:8` — "在扩展设置页（Dashboard → 设置）为每个浏览器实例分配唯一编号（`browser_no`…）"
  - `docs/guides/mcp_usage.md:11` — "首次需通过 `http://127.0.0.1:17831/pair` 批准 `browser_no`"
  - `docs/guides/mcp_usage.md:13` — "多浏览器时通过 `browser_no` 参数指定目标"
- 现象：T008（done，commit `a408f24`）已删除 `browser_no` 路由，改为 `browser_label` + `target_instance_id` / `target_label`（见 T008 spec §决策、`src/shared/protocol.ts:112`、`src/mcp/schemas.ts:10-15`）。mcp_usage.md 快速开始仍全程使用 `browser_no` 术语；但同文件 §133-144（安全段）又描述了 instance_token 自动登记模型，与第 8-13 行的手动编号模型自相矛盾。
- 影响：用户照快速开始无法找到 `browser_no` 输入框（T008 已删除 UI）；MCP 工具调用使用 `browser_no` 参数会报 schema 校验错误。
- 建议：把第 8-13 行整段重写：删除 `browser_no` 概念，改用"扩展设置页为每个浏览器实例填 `browser_label`（可选备注）"，多实例路由用 `target_label` / `target_instance_id`。
- 置信度：0.95

### d01_f011 — `docs/guides/mcp_usage.md` 与 `troubleshooting.md` 中 `/pair/approve` 端点描述过时

- 严重度：MEDIUM
- 位置：`docs/guides/mcp_usage.md:11`、`docs/guides/troubleshooting.md:55`
- 现象：T008 spec §范围明确写"移除 `/pair/approve` 端点（不再预 approve browser_no；pair 简化为 pairing_code 窗口模式）"。mcp_usage.md 第 11 行仍写"首次需通过 `/pair` 批准 `browser_no`"；troubleshooting 第 55 行仍提示"检查扩展设置中的 `browser_no` 配置"。
- 影响：用户按文档去 pair 页面找 approve 按钮会失败；troubleshooting 排障路径错误。
- 建议：mcp_usage.md 改为 enroll/pairing_code 流程描述；troubleshooting.md 第 55 行把 `browser_no` 改为 `browser_label`。
- 置信度：0.92

### d01_f012 — `docs/blueprint/architecture.md` 架构图与文字描述数据流不一致

- 严重度：LOW
- 位置：`docs/blueprint/architecture.md:34-62` mermaid 图
- 现象：图里 `IDB <--> AQ`、`AQ <--> BC` 用双向箭头表示扩展内部数据查询；但 `BC`（Agent Bridge Client）实际通过 `chrome.runtime.sendMessage` 与 SW 通信，再由 SW 调 `AQ`（见 §5.2 数据流文字描述）。图把 AQ 画成独立与 IDB 双向直连，与文字"Data Queries 读 IndexedDB"一致，但漏画 SW 在 BC↔AQ 之间的消息中转角色。
- 影响：架构图易让人误以为 BC 直接调用 AQ；与 §5.2 文字描述形成轻微认知偏差。
- 建议：在 BC 与 AQ 之间补 SW 节点或注释"经 SW 消息路由"，或保持现状但加图注说明简化。
- 置信度：0.6

### d01_f013 — `docs/guides/contributing_dev.md` Logger 导入路径与新结构不符

- 严重度：LOW
- 位置：`docs/guides/contributing_dev.md:113`、`:170`
- 现象：示例代码 `import { Logger } from '../shared/logger'`，但新结构下 background/content 模块应从 `'../../shared/logger'`（depth +1）或 `'../../../shared/logger'` 导入，具体取决于模块所在层。第 170 行示例文件在 `src/extension/content/`，到 `src/shared/logger` 是 `../../shared/logger`，文档写 `../shared/logger` 少一层。
- 影响：复制示例代码编译失败；与 conventions.md §3 "共享代码放 `src/shared/`" 的扁平结构定位不符。
- 建议：示例 import 路径改为 `../../shared/logger`，或注明"相对路径按实际层级调整"。
- 置信度：0.85

### d01_f014 — `docs/guides/contributing_dev.md` 添加新捕获模块步骤与项目实际不符

- 严重度：LOW
- 位置：`docs/guides/contributing_dev.md:164-213`
- 现象：示例代码用 `export function start(send_event: ...)`、`start_capture`/`stop_capture` 函数命名；但 conventions.md §1 要求 `snake_case`（函数名应是 `start_xxx_capture`），`src/extension/content/` 已有模块（如 `clipboard_capture.ts`）导出的是 `start_clipboard_capture` / `stop_clipboard_capture`。文档示例与 conventions 和实际模块签名都偏差。
- 影响：新人照写会违反 conventions；与 architecture.md §8"参考已实现的 `clipboard_capture.ts`"指向的真实签名不一致。
- 建议：示例函数名改为 `start_my_capture` / `stop_my_capture` 或 `start_xxx_capture`；并在注册段对齐 content_script.ts 实际激活序列函数名。
- 置信度：0.85

### d01_f015 — `docs/guides/test.md` §0 引用已归档工作流文档

- 严重度：LOW
- 位置：`docs/guides/test.md:5-16`、`docs/guides/test.md:237`
- 现象：§0 标题"流程与验收纪律（omni_powers 实践强制）"引用 `docs/archive/WORKFLOW_POSTMORTEM.md` 和 T0001–T0003 process-deviation；CLAUDE.md 项目说明已声明 omni_powers heavy 工作流归档、当前活动流程是四态 task 生命周期。test.md §0 仍用旧工作流语气写"task 不得标 done"。
- 影响：流程权威冲突；新成员不知该遵循四态 task 规则还是 omni_powers 7 条纪律。
- 建议：§0 重写为对齐 CLAUDE.md 项目级开发循环（红→绿→agent-verify→文档→review→commit），把 omni_powers 7 条纪律中仍适用的（终态产物、否证断言、E2E 固化、关闭闸）择优吸纳，删除"omni_powers 强制"语境。
- 置信度：0.85

### d01_f016 — `docs/guides/store_publish_list.md` 标题与首行不一致

- 严重度：LOW
- 位置：`docs/guides/store_publish_list.md:1`（标题 `# Edge Add-ons 发布指南`）vs 文件名 `store_publish_list.md`
- 现象：文件名暗示"商店发布清单（多商店）"，实际内容只覆盖 Edge Add-ons；Chrome Web Store 发布清单未包含。
- 影响：文件名/标题语义偏差；读者期待落空。
- 建议：要么文件名改 `edge_addons_publish.md`，要么标题改 `# 商店发布清单（Edge Add-ons）` 并在文首注明"Chrome Web Store 清单待补"。
- 置信度：0.8

### d01_f017 — `docs/tasks/index.md` T010 "commit pending"

- 严重度：LOW
- 位置：`docs/tasks/index.md:20`
- 现象：T010 状态标 `done`，但备注列写 "commit pending；21+73 测试全绿；0 skip"。CLAUDE.md 项目规则要求 `done` 状态 task 在 finalize 阶段必须有 commit SHA（"`commit:<sha>`"格式）。
- 影响：done 状态但无 commit SHA，违反 CLAUDE.md finalization 纪律；接手者无法回溯 T010 实际 commit。
- 建议：补 commit SHA 或确认是否真已 finalize；若未 commit，状态应回退 `active`。
- 置信度：0.9

### d01_f018 — `docs/tasks/T008_label_routing/` 未按生命周期归档

- 严重度：LOW
- 位置：`docs/tasks/T008_label_routing/` 目录（含 plan.md / spec.md），`docs/tasks/index.md:18`
- 现象：index.md 显示 T008 `done`；CLAUDE.md 项目规则要求 `done` 任务目录移入 `docs/archive/tasks/`。但 `docs/tasks/T008_label_routing/` 仍位于活动 `docs/tasks/` 下（同目录还有已 done 的 T008 但未归档）。
- 影响：违反"done 任务必须移入 archive"规则；`docs/tasks/` 活动目录混入已完成 task。
- 建议：把 `docs/tasks/T008_label_routing/` 移到 `docs/archive/tasks/T008_label_routing/`。
- 置信度：0.88

### d01_f019 — `docs/tasks/T008_label_routing/spec.md` 验收标准与实际实现偏差

- 严重度：LOW
- 位置：`docs/tasks/T008_label_routing/spec.md:48`
- 现象：验收标准"`grep -rn "browser_no" src/ tests/` 无残留（或仅注释/字符串说明）"。但 `docs/tasks/index.md:18` T008 备注写"测试重写拆 T009/T010"，T009/T010 才完成测试侧清理。spec 验收标准未反映"测试拆分"这一实际路径，等于 T008 单 task 验收标准与 task 拆分事实不匹配。
- 影响：审阅 T008 时会误判"测试未完成"；spec 与 index.md 备注需互读才能还原真相。
- 建议：spec §验收标准补一行"测试重写拆分至 T009/T010，T008 仅验收代码 + 文档"。
- 置信度：0.8

### d01_f020 — `docs/guides/deployment.md` 仍写 "Bridge 默认绑定 127.0.0.1:3000"

- 严重度：LOW
- 位置：`docs/guides/deployment.md:38`
- 现象：deployment.md §本地运行写 "Bridge 默认绑定 `127.0.0.1:3000`"，但实际 `src/bridge/config.ts` port 必须显式传 `--port`（无默认值，见 config.ts:23 `if (port === undefined ...) throw`），且项目惯例端口是 17831（mcp_usage.md:9、settings.json hook）。
- 影响：用户照 deployment.md 启动会得到 "Invalid bridge port" 错误（config.ts 强制校验）。
- 建议：改为 "Bridge 需通过 `--port` 显式指定端口（项目惯例 17831）"，并补示例 `npm run bridge -- --port 17831 --token <token>`。
- 置信度：0.92

### d01_f021 — `docs/guides/troubleshooting.md` 错误码表漏项

- 严重度：LOW
- 位置：`docs/guides/troubleshooting.md:125-131`
- 现象：错误码表列 5 个（`BRIDGE_UNAVAILABLE` / `PAYLOAD_TOO_LARGE` / `COMMAND_TIMEOUT` / `EXPORT_FAILED` / `INVALID_QUERY`），但 domain.md §8 列举 Bridge 层 10 个 + 扩展层 9 个错误码。T008 引入的 `TARGET_AMBIGUOUS` / `LABEL_DUPLICATE` 也未入表。
- 影响：用户遇到 `TARGET_AMBIGUOUS` / `TOKEN_INVALID` / `EXTENSION_OFFLINE` 等错误码在 troubleshooting 找不到。
- 建议：错误码表对齐 domain.md §8 全集，至少补 T008 引入的两个新码。
- 置信度：0.85

### d01_f022 — `docs/guides/mcp_usage.md` 默认 timeout 与 domain.md 不一致

- 严重度：LOW
- 位置：
  - `docs/guides/mcp_usage.md:90` — "普通命令默认 `command_timeout_ms` = 120s"
  - `docs/blueprint/domain.md:118-122` — 查询类 30s / 全量类 120s / 导出类 120s / start/stop 15s
- 现象：mcp_usage.md 把"普通命令默认 120s"作为单一值，domain.md §7 按命令类分 4 档（15/30/120/120s）。两份文档对"默认超时"给出不同答案。
- 影响：开发者预期与实际超时不符；domain.md 的分档更细且更可能是实现真相。
- 建议：mcp_usage.md §timeout_ms 改为引用 domain.md §7 四档表，或直接内联相同表格。
- 置信度：0.85

### d01_f023 — `docs/guides/contributing_dev.md` 相关文档链接指向 `mcp_usage.md` 标题为"API 文档"

- 严重度：LOW
- 位置：`docs/guides/contributing_dev.md:236`
- 现象：链接文字 "[API 文档](mcp_usage.md)"，但 `mcp_usage.md` 实际是 MCP 工具使用指南，标题为 "MCP 工具使用指南"，并非完整 API 文档。
- 影响：链接文字误导，开发者期待 API 参考但得到工具指南。
- 建议：链接文字改为 "[MCP 工具使用指南](mcp_usage.md)"。
- 置信度：0.7

### d01_f024 — `docs/blueprint/architecture.md` 第 159 行 specs 引用未落地

- 严重度：LOW
- 位置：`docs/blueprint/architecture.md:159`、`176`、`180`、`184`、`231`
- 现象：多处 "详见 `specs/capture_core.md`"、"详见 `specs/network_body_capture.md`" 等引用。仓库当前 `specs/` 目录已不存在（T001 spec 验收标准明确 "无残留 `specs/`"），相关内容应已迁入 blueprint 或 archive。
- 影响：blueprint 内部引用断链；读者点击 `specs/...` 找不到文件。
- 建议：把 specs 引用改为 blueprint 内部章节锚点或 archive 路径。
- 置信度：0.88

### d01_f025 — `docs/blueprint/domain.md` 第 113 行 specs 引用同样过时

- 严重度：LOW
- 位置：`docs/blueprint/domain.md:113`
- 现象：同 f024，"`capture_all_db`，`DB_VERSION = 3`，10 stores。详见 `specs/storage_indexeddb.md`"，`specs/` 已不存在。decisions.md §007 第 64 行 "详见 `op_blueprint/specs/storage_indexeddb.md`（已归档）" 已正确改写为 archive 路径，domain.md 未同步。
- 影响：同 f024。
- 建议：改为 `docs/archive/omni_powers/op_blueprint/specs/storage_indexeddb.md`。
- 置信度：0.9

---

## 建议

按优先级落地（仅本批次范围；不在本批次执行）：

1. **立即修**（HIGH，影响开发者上手与命令可执行性）：
   - f001 refactor_plan.md 引用全量改写或改指 archive 路径（涉及 handoff.md、decisions.md、contributing_dev.md；同时建议同步 AGENTS.md / CLAUDE.md，但二者不在本批次）。
   - f002 test.md §3 命令表 `src/agent/` → `src/{bridge,mcp}/`。
   - f003 test.md §2.2 目录树重写为 `tests/{unit,e2e,support}/`。
   - f004 test.md Vitest 版本 2.x → 4.x。

2. **本迭代修**（MEDIUM，影响文档真实性）：
   - f005 architecture.md 模块树补 `webrequest_handler.ts` / `ws_handler.ts`。
   - f006 architecture.md / test.md 工具数 12 → 13（主工具）；domain.md §2 补 `list_browsers`。
   - f008 contributing_dev.md §项目结构整段重写。
   - f009 / f020 端口 3000 → 17831（contributing_dev.md、troubleshooting.md、deployment.md）。
   - f010 / f011 mcp_usage.md 快速开始 `browser_no` → `browser_label` + target 参数；troubleshooting.md 同步。
   - f007 domain.md §4 加注 MCP 工具名兼容说明。

3. **顺手修**（LOW）：
   - f017 / f018 task index T010 commit SHA 补齐；T008 目录归档。
   - f019 T008 spec 验收标准补"测试拆 T009/T010"。
   - f021 troubleshooting.md 错误码表对齐 domain.md §8。
   - f022 mcp_usage.md timeout 表对齐 domain.md §7。
   - f024 / f025 blueprint 内 `specs/...` 引用清理。
   - f012 / f013 / f014 / f015 / f016 / f023 视情修订。

---

## 不确定项

- **d01_u001** — `.mcp.json.example` 用 `node -e` 内联 `require()` 调用 `import()` 加载 ESM 产物。项目 `package.json` 声明 `"type": "module"`，但 `require` 在 ESM 上下文中不可用；此处 `node -e` 字符串是否被 Node 当 CJS 解析取决于 `node --input-type`，未在本批次核对运行时行为。可能是隐藏 bug，也可能 `-e` 默认 CJS 模式下成立。需运行 `node -e "<script>"` 实测才能定论。本批次 `.mcp.json.example` 不在 docs_01 清单内（属 project_01），仅记录供后续批次参考。
- **d01_u002** — `docs/blueprint/domain.md` §6 表第 104 行 `MAX_SESSION_SIZE_BYTES` 500MB 与实际 `src/shared/constants.ts:20` `500 * 1024 * 1024` 一致；但 §6 第 105 行 `MAX_SESSION_DURATION_MS` 24 小时与 constants.ts:21 一致。未发现差异，仅记录交叉核对完成。
- **d01_u003** — `docs/tasks/T008_label_routing/spec.md` §非范围第 42 行"session 术语迁移（已在历史 task 完成）"未指明具体 task ID。历史 task 可能在 `docs/archive/tasks/` 下，未在本批次逐一翻阅。需追溯可查 archive。
- **d01_u004** — `docs/guides/store_publish_list.md` 第 226 行测试说明提到 "Bridge with a self-generated random token, point your MCP client at http://127.0.0.1:17831"，端口与项目惯例一致，但未说明 `--port 17831` 的传参方式；若审核员照复制启动命令可能失败。属轻微措辞问题，归入 LOW。
- **d01_u005** — `docs/handoff.md` 第 23-49 行交接段记录的 head_commit `70dde67` 已验证存在（git log 一致）。但段尾"下一步：merge main"是否已执行未核对 git 历史（本批次只读 docs/，未跨到 git 状态核查）。若 main 已合并，此交接段应再有后续段追加说明。
