# docs_01 current 审阅

## 模型依据

继承 `default_model`，底层实际模型标识不可观测，不作额外推断。

## 范围

依据 `docs/review_20260719_0859/MANIFEST.md:50-73`，逐文件、逐段审阅以下 20 个目标：

1. `docs/blueprint/architecture.md`
2. `docs/blueprint/conventions.md`
3. `docs/blueprint/decisions.md`
4. `docs/blueprint/domain.md`
5. `docs/guides/contributing_dev.md`
6. `docs/guides/deployment.md`
7. `docs/guides/mcp_usage.md`
8. `docs/guides/store_publish_list.md`
9. `docs/guides/test.md`
10. `docs/guides/troubleshooting.md`
11. `docs/handoff.md`
12. `docs/reviews/.gitkeep`
13. `docs/tasks/T008_label_routing/plan.md`
14. `docs/tasks/T008_label_routing/spec.md`
15. `docs/tasks/index.md`
16. `docs/templates/review/adoption.md`
17. `docs/templates/review/review.md`
18. `docs/templates/spike/report.md`
19. `docs/templates/task/log.md`
20. `docs/templates/task/plan.md`

检查证据范围：仓库根 `CLAUDE.md`、`package.json`、Vite/Vitest/Playwright 配置、`.gitignore`、相关 `src/{extension,bridge,mcp,shared}` 实现、单元/E2E 测试、隐私政策、Git 提交与分支状态、活动及归档 task 目录。未运行构建或测试。

`docs/reviews/.gitkeep` 为空占位文件；`docs/templates/review/{adoption,review}.md`、`docs/templates/spike/report.md`、`docs/templates/task/{log,plan}.md` 未发现需单列的问题。

## 高优先级

### HIGH-01 — T008 对同 label 行为给出互斥验收要求，当前实现只满足“顶替”

- 位置：`docs/tasks/T008_label_routing/spec.md:12,25,49-50`；`docs/blueprint/decisions.md:71`；`docs/blueprint/domain.md:85`
- 现象：spec 同时要求“label 冲突返回 `LABEL_DUPLICATE`”和“同 label 顶替旧实例”。decisions/domain 只声明顶替。实现也直接删除同 label 旧实例后 enroll 成功，未返回 `LABEL_DUPLICATE`：`src/bridge/server.ts:285-305`。协议虽声明 `LABEL_DUPLICATE`：`src/shared/protocol.ts:35-37`，但当前 enroll 路径未使用。
- 影响：验收标准无法同时通过；测试、调用方和后续维护者无法判断重复 label 应报错还是触发重启替换语义。
- 建议：先明确唯一规则。若同 label 用于扩展重启顶替，删除 `LABEL_DUPLICATE` 验收项及无用错误码；若需拒绝冲突，定义如何区分“同实例重连”与“另一实例占用”，再修改实现、决策和测试。
- 置信度：高
- 优先级：HIGH

### HIGH-02 — 多实例未指定目标的错误码文档与实现不符

- 位置：`docs/tasks/T008_label_routing/spec.md:11,26,51`；`docs/blueprint/decisions.md:71`；`docs/guides/deployment.md:76`
- 现象：文档声称多实例存在匿名实例且未指定目标时返回 `TARGET_AMBIGUOUS`。实现对任意“多实例且未指定目标”统一返回 `TARGET_REQUIRED`：`src/bridge/server.ts:121-137`；`TARGET_AMBIGUOUS` 仅用于显式 `target_label` 匹配多个在线实例：`src/bridge/server.ts:110-117`。
- 影响：调用方按文档处理错误码会漏掉实际 `TARGET_REQUIRED`，自动恢复或用户提示逻辑可能失效。
- 建议：以实现为准把未指定目标统一写为 `TARGET_REQUIRED`；保留 `TARGET_AMBIGUOUS` 仅描述“显式 label 非唯一”。若 spec 坚持原语义，则修改 `resolve_target()` 并补行为测试。
- 置信度：高
- 优先级：HIGH

### HIGH-03 — T008 标记 done，但验收项仍有活跃测试残留且任务未归档

- 位置：`docs/tasks/T008_label_routing/spec.md:38,46-57`；`docs/tasks/index.md:18`
- 现象：全部验收框仍未勾选；`browser_no` 活跃兼容测试仍存在于 `tests/unit/agent_mcp_client.test.ts:334-350`、`tests/unit/mcp_schema.test.ts:257-273`，不属于仅说明移除行为的注释。与此同时 T008 状态为 `done`，目录仍位于 `docs/tasks/T008_label_routing/`，且缺少生命周期要求的 `log.md` 与 review/adoption 工件。根规则要求 done 目录归档：`CLAUDE.md:80-85`；index 自身也要求归档：`docs/tasks/index.md:3-7`。
- 影响：任务完成状态不可信；验收证据、偏离记录和 review 链断裂；后续 task ID 与归档查询可能误判活动状态。
- 建议：将 T008 恢复 `active` 并完成残余测试与 review，或在 log 中明确拆分/未完成项后新建后续 task；验收闭合后勾选 spec、补齐工件并移入 `docs/archive/tasks/`。
- 置信度：高
- 优先级：HIGH

### HIGH-04 — MCP 指南仍指导使用已移除的 `browser_no` 与不存在的批准流程

- 位置：`docs/guides/mcp_usage.md:8-13`；`docs/guides/troubleshooting.md:55`
- 现象：快速开始要求配置、批准并传递 `browser_no`。当前配置字段为 `browser_label`：`src/shared/constants.ts:62-66`；所有 MCP schema 路由字段为 `target_instance_id` / `target_label`：`src/mcp/schemas.ts:10-16,53-128`；pair API 是 open/close + pairing code，不存在批准 browser_no 端点：`src/bridge/server.ts:209-251,627-645`。
- 影响：新用户无法按指南完成配对和多浏览器路由；可能把未知 `browser_no` 透传到命令 payload，形成静默无效配置。
- 建议：重写快速开始第 2、5、7 步：配置可选 `browser_label`；通过 MCP token 打开 pairing window 并使用 pairing code enroll；调用时用 `target_label` 或 `target_instance_id`。
- 置信度：高
- 优先级：HIGH

### HIGH-05 — Bridge 启动命令缺少强制 `--port`，复制后直接失败

- 位置：`docs/guides/deployment.md:33-38,44-55`；`docs/guides/test.md:93,98`；`docs/guides/troubleshooting.md:33-42`
- 现象：`npm run bridge`、systemd `ExecStart`、`node bridge.mjs` 均未传 `--port`，但入口在端口缺失时抛出 `Invalid bridge port`：`src/bridge/main.ts:5-12`。部署文档还宣称默认 `127.0.0.1:3000`，实现没有默认端口；项目配置常用 17831：`src/shared/constants.ts:62-64`。
- 影响：本地调试和 systemd 服务按文档启动必失败；排障还会检查错误端口。
- 建议：所有启动示例显式追加 `--port <用户选择端口>`；健康检查引用同一端口。若项目希望固定推荐值，可写“示例使用 17831”，但不要描述为入口默认值。
- 置信度：高
- 优先级：HIGH

### HIGH-06 — 部署指南提供固定 token 占位值，违反仓库 secret 约束

- 位置：`docs/guides/deployment.md:34,51-54`；`docs/guides/troubleshooting.md:42`
- 现象：文档提供 `'your-random-token'` / `'your-token'` 固定占位值。仓库约束要求 token 禁止硬编码、默认值或示例值，并由用户生成：`CLAUDE.md:142-143`；domain 也声明禁止示例值：`docs/blueprint/domain.md:81-84`。
- 影响：用户可能原样复制弱且可预测的凭据；systemd 配置还会把 token 明文持久化到 unit 文件。
- 建议：改为“先由用户通过密码管理器或系统工具生成随机 token，再通过受限权限的 EnvironmentFile/环境变量注入”；不在文档给出可复制固定 token 内容。
- 置信度：高
- 优先级：HIGH

### HIGH-07 — 商店数据披露否认会采集身份验证/通信/PII，与默认采集能力及隐私政策冲突

- 位置：`docs/guides/store_publish_list.md:115-130`
- 现象：指南要求不勾选 PII、Authentication information、Personal communications，并断言“未勾选的项本扩展均不采集”。但输入值、请求体、响应体默认开启：`src/shared/constants.ts:29-42`；隐私政策明确这些数据可能包含 credentials、tokens、private messages、personal information：`PRIVACY.md:17-29`。
- 影响：Microsoft Edge 商店隐私披露可能不准确，产生审核拒绝、下架或合规风险。
- 建议：由发布负责人依据商店定义和实际默认行为重新完成数据分类；至少删除“未勾选项均不采集”的绝对断言，并让商店披露与 `PRIVACY.md` 同步审阅。
- 置信度：高
- 优先级：HIGH

## 中低优先级

### MEDIUM-01 — architecture 后台目录漏列 3 个实际模块

- 位置：`docs/blueprint/architecture.md:73-92`
- 现象：目录树漏列 `cdp_handler.ts`、`webrequest_handler.ts`、`ws_handler.ts`；三者实际位于 `src/extension/background/`。
- 影响：模块边界与网络/WebSocket 采集路径不完整，影响导航和架构分析。
- 建议：补齐三个文件及职责；若某文件已废弃，应删除源码而非从架构图隐去。
- 置信度：高
- 优先级：MEDIUM

### MEDIUM-02 — architecture 把未配置、未使用的 devtools_panel 写成 Vite 入口

- 位置：`docs/blueprint/architecture.md:109-110,237-242`
- 现象：文档列出 `devtools_panel` 为 Vite 多入口；实际 `vite.config.ts:12-19` 仅有 background/content/popup/dashboard/devtools。Chrome DevTools 创建的面板直接指向 dashboard：`src/extension/devtools/devtools.ts:8-12`，`devtools_panel.html` 未被该路径引用。
- 影响：读者误以为独立 panel 是当前产品入口，掩盖可能的遗留死文件。
- 建议：从入口清单移除 `devtools_panel`，或若确需使用，接入 manifest/devtools 创建流程和构建配置后再记录。
- 置信度：高
- 优先级：MEDIUM

### MEDIUM-03 — MCP 工具数量与清单均过时

- 位置：`docs/blueprint/architecture.md:245-246`；`docs/blueprint/domain.md:29-48`；`docs/guides/mcp_usage.md:16-48`；`docs/guides/test.md:126`
- 现象：architecture/test 声称 12 个工具，domain/mcp_usage 漏列 `list_browsers`。实际注册 17 个工具（含 4 个兼容别名）：`src/mcp/tools.ts:9-31`、`src/mcp/main.ts:18-32`。test 还把内部命令 `capture.start` / `captures.list` / `data.list` 当作 MCP 可见工具名。
- 影响：Agent 工具发现、人工调用和测试说明不一致，用户不知道可用的浏览器发现工具。
- 建议：统一说明“13 个主工具 + 4 个兼容别名，共注册 17 个”；工具表补 `list_browsers`，只把内部点分命令放映射列。
- 置信度：高
- 优先级：MEDIUM

### MEDIUM-04 — domain 错误码表使用不存在的新名称并遗漏实际错误码

- 位置：`docs/blueprint/domain.md:126-130`
- 现象：文档列 `CAPTURE_NOT_FOUND`、`CAPTURE_ALREADY_RUNNING`、`NO_ACTIVE_CAPTURE`；协议和分发实际使用 `SESSION_NOT_FOUND`、`RECORDING_ALREADY_RUNNING`、`NO_ACTIVE_RECORDING`：`src/shared/protocol.ts:17-37`、`src/extension/background/agent_command_dispatcher.ts:91-113,131-135`。扩展层表还遗漏 `TARGET_AMBIGUOUS`、`LABEL_DUPLICATE` 等现存协议码。
- 影响：调用方无法可靠匹配运行时错误，且与文档“禁用旧术语”要求互相矛盾。
- 建议：决定错误码迁移是否属于兼容 breaking change。迁移前先如实记录当前 wire code，并单列计划替代名称；迁移后同步协议、实现、测试和指南。
- 置信度：高
- 优先级：MEDIUM

### MEDIUM-05 — domain 关于 token 来源的业务不变量与实现、同文档端口策略冲突

- 位置：`docs/blueprint/domain.md:81-87`；`docs/guides/mcp_usage.md:9,138-142`
- 现象：domain 说 Bridge token 必须由用户提供；实现支持 `CLI > env > persisted > generated`，生成 token 后写文件：`src/bridge/main.ts:21-33`，且 decisions 明确 generated fallback：`docs/blueprint/decisions.md:53-58`。mcp_usage 同时写“未设置则自动生成”和“Token 由用户提供”。
- 影响：安全模型和运维预期不清：用户无法判断自动生成是否合规、首次启动应从何处取得 token。
- 建议：区分“不得硬编码固定值”和“允许本地安全随机生成”。若保留生成 fallback，把不变量改为“必须是用户提供或本地随机生成的强 token；禁止固定默认/示例值”。
- 置信度：高
- 优先级：MEDIUM

### MEDIUM-06 — conventions 中设计令牌、MCP schema、测试路径错误

- 位置：`docs/blueprint/conventions.md:30,68,78-93`
- 现象：设计令牌实际在 `src/extension/shared/design_tokens.css`，非 `src/shared/design_tokens.css`；schema 实际在 `src/mcp/schemas.ts`，文档写 `mcp/schemas.ts`；单测实际位于 `tests/unit/`，文档写 `tests/xxx_capture.test.ts`。
- 影响：按规范新增模块时会导入/创建到错误目录。
- 建议：修正为当前三产品目录完整路径，并在 background 新增步骤也明确 `tests/unit/xxx_capture.test.ts`。
- 置信度：高
- 优先级：MEDIUM

### MEDIUM-07 — architecture/decisions/domain 多处引用已归档或不存在的 spec/plan 路径

- 位置：`docs/blueprint/architecture.md:159,172,176,180,184,231,248`；`docs/blueprint/decisions.md:29,36,57,64`；`docs/blueprint/domain.md:113`
- 现象：多处使用 `specs/...`、`docs/refactor_plan.md`、`test.md` 相对/旧路径。相关 specs 与 refactor plan 已归档到 `docs/archive/`；活动测试指南为 `docs/guides/test.md`。Git 提交 `3d3b856` 也记录了 refactor plan 归档。
- 影响：蓝图作为长期真相源却含大量断链，Agent 按“必读”导航会失败。
- 建议：活动蓝图引用完整现行路径；历史依据明确标注 `docs/archive/...`。已归档计划只作为历史证据，不再描述为活动计划。
- 置信度：高
- 优先级：MEDIUM

### MEDIUM-08 — contributing_dev 大部分目录、命令、import 已过时

- 位置：`docs/guides/contributing_dev.md:31-35,51-98,108-116,141-170,197-225`
- 现象：仍展示已删除的 `src/agent`、顶层 `src/background`/`content`、根 `e2e` 和活动 `docs/refactor_plan.md`；Bridge 被误称 WebSocket；Logger 示例从 extension 子目录使用错误的 `../shared/logger`，且构造器缺少必需 transport（实现：`src/shared/logger.ts:18-22`）；vitest 示例仍指向 `tests/*.test.ts`，实际为 `tests/unit/`；构建产物漏 `artifacts/extension.zip`（`package.json:24-39`）。
- 影响：开发者照抄会遇到文件不存在、TypeScript 编译失败、测试命令找不到文件。
- 建议：按 `docs/blueprint/architecture.md` 当前目录整体重写该页，不做局部补丁；示例分别使用 background 的 IndexedDB transport 与 content 的 `MessageLogTransport`。
- 置信度：高
- 优先级：MEDIUM

### MEDIUM-09 — deployment/troubleshooting 声称存在 Bridge 日志文件，代码未写该文件

- 位置：`docs/guides/deployment.md:85-89`；`docs/guides/troubleshooting.md:35-38,133-138`
- 现象：文档把 `artifacts/bridge/bridge.log` 列为日志位置。Bridge 入口只写 stdout/stderr：`src/bridge/main.ts:16-18,30-38`；仓库无写入 bridge.log 的实现，且 `*.log` 被 `.gitignore:8` 忽略。
- 影响：用户排障时寻找不存在的文件，错过 systemd journal 或启动终端输出。
- 建议：改为“前台运行看 stdout/stderr；systemd 使用 `journalctl -u capture-all-bridge`；需要文件时由用户自行配置日志重定向/轮转”。
- 置信度：高
- 优先级：MEDIUM

### MEDIUM-10 — mcp_usage 的采集配置示例看似默认值，实际差异显著

- 位置：`docs/guides/mcp_usage.md:104-123`
- 现象：示例使用 `mouse_precision: clicks`、关闭 request/response body、body 上限 1 MiB；实际 `DEFAULT_CONFIG` 为 `clicks_scroll_drag`、两类 body 开启、100 MiB：`src/shared/constants.ts:20-42`。
- 影响：读者可能误判产品默认隐私/容量行为；复制示例也会显著改变采集结果。
- 建议：标题明确“最小化/保守示例”，或改为与默认值一致并逐项标注默认值。
- 置信度：高
- 优先级：MEDIUM

### MEDIUM-11 — test.md 的测试树、脚本、版本与实际配置大面积偏离

- 位置：`docs/guides/test.md:17-23,32-64,77-98,128-154`
- 现象：Vitest 写 2.x，实际 4.x：`package.json:41-53`；测试仍描述平铺 `tests/`，实际为 `tests/{unit,e2e,support}`；vitest exclude 漏 `tests/e2e/**` 和 `tests/support/**`：`vitest.config.ts:3-20`；Bridge/MCP 路径仍为 `src/agent/...`，实际脚本见 `package.json:31-39`；build 描述漏 `copy:locales`/`build:zip`；Playwright `testDir` 写 `./tests`，实际 `./tests/e2e`：`playwright.config.ts:16-18`；`e2e-mcp*.spec.ts` 会误含 mcp-full，实际配置只匹配 `e2e-mcp.spec.ts`：`playwright.config.ts:104-116`。
- 影响：测试定位、运行和覆盖范围判断均不可靠，复制构建命令会失败。
- 建议：直接从 `package.json`、`vitest.config.ts`、`playwright.config.ts` 重建命令和项目表；删除已失效的 omni_powers 强制闸门表述或明确仅作历史经验。
- 置信度：高
- 优先级：MEDIUM

### MEDIUM-12 — store_publish_list 的 storage 权限说明及图标产物路径不准确

- 位置：`docs/guides/store_publish_list.md:61-65,150-155`
- 现象：权限文案称 session metadata 存于 `chrome.storage.local`，但采集顶层记录存 IndexedDB，chrome.storage.local 用于设置/Bridge 配置/当前状态：`PRIVACY.md:31-35`。指南要求上传 `artifacts/dist/assets/icons/icon300.png`；源文件确有 `assets/icons/icon300.png`，生成脚本也生成 300：`scripts/generate_icons.mjs:29-37`，但 manifest 仅引用 16/32/48/128：`src/extension/manifest.json:29-43`，Vite 是否复制未引用的 300 文件无法由静态配置保证。
- 影响：商店权限说明可能不准确；发布者可能在构建产物找不到 300 图标。
- 建议：权限说明改为持久化设置和当前运行状态；商店图标直接引用稳定源文件 `assets/icons/icon300.png`，或把复制到 artifacts 的步骤纳入构建并验证。
- 置信度：中
- 优先级：MEDIUM

### MEDIUM-13 — handoff 作为当前接手入口，最新记录仍停留在已完成合并前状态

- 位置：`docs/handoff.md:23-49`
- 现象：唯一真实交接称当前在 `task_t002_shared_protocol_relocate` 且“仅剩 merge main”。当前 Git 仅 `main` 包含 `70dde67`，后续已有 T008-T010 提交；记录未追加合并完成和当前焦点。
- 影响：按仓库规则先读 handoff 的接手者会执行已完成操作并忽略最新任务状态。
- 建议：保留历史段落不改，追加新交接段，说明分支已合入 main、当前 head 与 T008-T010 未闭合事项。
- 置信度：高
- 优先级：MEDIUM

### MEDIUM-14 — T008 plan 与实际拆分、危险回退建议不符

- 位置：`docs/tasks/T008_label_routing/plan.md:5-17,28-39`
- 现象：plan 要求代码+14 个测试单 commit，实际提交拆为 `a408f24`、`89a88d4`、`e97d451`、`12a55bb`，且仍有测试残留；finalize/归档未完成。回退写 `git reset --hard`，会无条件丢弃未提交修改，不符合谨慎回退原则。
- 影响：plan 无法解释实际偏离，也为后续执行者提供破坏性回退指令。
- 建议：在缺失的 log 中记录拆分原因和剩余范围；回退改为基于独立 commit 的 `git revert <sha>`，仅在明确确认无待保留工作时使用 reset。
- 置信度：高
- 优先级：MEDIUM

### MEDIUM-15 — tasks index 的 T010 提交状态已过时，且 ID 复用违反自身规则

- 位置：`docs/tasks/index.md:3,18-20`
- 现象：T010 仍写 `commit pending`，实际提交 `12a55bb` 已存在。index 声明 ID 全局递增取最大值加一，却备注复用 T008；这使活动 T008 与归档旧 T008 重名。
- 影响：提交追溯与自动分配 ID 不可靠，后续脚本/Agent 可能选错任务目录。
- 建议：T010 更新为 `12a55bb`；禁止继续复用 ID。当前 label routing 若尚未完成，应以新 ID 继续，旧记录通过备注互链。
- 置信度：高
- 优先级：MEDIUM

### LOW-01 — architecture 技术栈版本和构建输出首段不精确

- 位置：`docs/blueprint/architecture.md:11,23`
- 现象：`@crxjs/vite-plugin` 实际声明为 `^2.7.1`：`package.json:41-43`，文档写 2.7；第 23 行只说构建输出 `artifacts/dist/`，而完整 build 还输出 Bridge、MCP 和 zip：`package.json:24-39`。
- 影响：版本/产物快速概览不完整。
- 建议：同步精确依赖范围，并在首段列出四类构建产物。
- 置信度：高
- 优先级：LOW

### LOW-02 — troubleshooting 的“采集无数据”排查过度聚焦 response body

- 位置：`docs/guides/troubleshooting.md:16-27`
- 现象：整体无事件时要求确认 `capture_response_body`，该配置只影响响应体，不决定用户行为、导航、console 等事件是否采集。
- 影响：排障路径偏离症状，可能忽略活跃采集状态、content script 注入、权限和消息链路。
- 建议：先检查 active capture、content script/SW 消息、站点限制与各类别开关；仅“缺响应体”场景检查 `capture_response_body`。
- 置信度：高
- 优先级：LOW

## 建议

1. 先裁决 T008 重复 label 与多实例错误码语义，形成单一 wire contract；随后同步 spec、decisions、domain、Bridge 实现和测试。
2. 将 T008 恢复为可信生命周期：处理残余 `browser_no` 测试，补 log/review/adoption，完成验收后归档；同步 T010 commit。
3. 立即修复可复制即失败/不安全的运维文档：Bridge `--port`、端口检查、token 生成与 systemd 注入、日志位置。
4. 重新评估 Edge 商店隐私披露，确保与默认 body/input 采集及 `PRIVACY.md` 一致，发布前由人工合规复核。
5. 以当前配置和源码自动或半自动重建 `contributing_dev.md`、`test.md`、`mcp_usage.md`，避免逐条修补旧目录结构。
6. 清理 blueprint 断链，所有活动文档使用完整现行路径；历史依据明确指向 `docs/archive/`。
7. 统一 MCP 工具表、工具数量、错误码、默认配置和多实例术语，避免同一事实存在多份互斥描述。

## 不确定项

- `assets/icons/icon300.png` 是否会被 CRX/Vite 作为未被 manifest 引用的静态文件自动复制到 `artifacts/dist/assets/icons/`，仅凭仓库静态配置无法确认；未运行构建。建议发布流程直接使用源文件或建立明确复制步骤。
- `devtools_panel.html` / `devtools_panel.ts` 可能是预留实验入口；当前 manifest、devtools 创建逻辑和 Vite input 均未引用，静态证据只能确认其不是当前显式入口。
- Edge Add-ons 对 PII、Authentication information、Personal communications 的具体勾选口径受商店实时政策影响；本报告只确认当前指南的绝对“不采集”声明与仓库自身隐私政策、默认配置冲突。
- `docs/handoff.md` 历史记录按规则不可改写；问题在于缺少后续追加，不代表原记录在写入当时失实。
