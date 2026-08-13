# Dead code / stale docs / compatibility surface 审阅报告

- 审阅快照：`main` @ `03254fb`
- 审阅日期：2026-08-13
- 审阅模式：只读 intensive review；仅写本报告
- 结论摘要：Critical 0，High 0，Medium 4，Low 4，Info 1

## 审阅范围

- `src/` 下 87 个 TypeScript 源文件。
- `tests/` 下 201 个 TypeScript 文件：159 个 `tests/unit/*.test.ts`、37 个 `tests/e2e/*.spec.ts`、5 个 support 文件。
- 活动文档：`README.md`、`docs/blueprint/`、`docs/guides/`、`package.json`、测试与 MCP 配置示例。
- 历史取证：相关 archived task/review、`git log`、`git blame`，只用于确认引入时间、既有决策和是否为预存问题。
- 静态方法：TypeScript LanguageService 源码+测试引用图、全仓符号搜索、入口/调用链追踪、协议 schema 与测试断言对照。
- 机械验证：`npx tsc --noEmit --pretty false` 通过；仓库未安装顶层 `knip`、`madge`、`ts-prune`。

## Findings

### DD-001 — Medium — 对外承诺的 24 小时采集上限从未执行

- **severity**：Medium
- **confidence**：100
- **file:line**：`src/shared/constants.ts:20-21`；`src/shared/types.ts:513-518`；`src/extension/background/service_worker.ts:499-539,541-685,689-710`；`README.md:123-133`；`docs/blueprint/domain.md:108-126`
- **复现证据 / 调用链**：
  1. `MAX_SESSION_DURATION_MS` 仅在 `src/shared/constants.ts:21` 定义，源码与测试均无引用。
  2. `CaptureStoppedData.reason` 仍公开 `'max_duration'`（`src/shared/types.ts:515`），表明协议保留自动到期语义。
  3. `start_capture` 在设置活跃状态后只启动 keepalive、periodic flush 和各采集器（`service_worker.ts:499-685`），没有 deadline、alarm、timer 或 elapsed-time guard。
  4. `stop_capture(reason)` 支持传 reason（`service_worker.ts:689-710`），但无生产调用路径传入 `'max_duration'`。
  5. README 与当前生效 blueprint 分别明确承诺“500 MB、24 小时”和“单采集时长 24 小时”。
  6. 旧审阅 `docs/reviews/review_20260719_0859/src_bridge_mcp_shared_02/opus.md:16-22` 已报告同一问题，当前仍可复现。
- **影响**：用户依赖的生命周期约束是虚假的。忘记停止时采集不会在 24 小时自动终止，可持续运行直到用户停止、异常或 500 MB 大小限制触发；`max_duration` reason 也成为不可达协议分支。
- **具体修复**：采集成功后持久化截止时间，并注册可取消的 `chrome.alarms`（MV3 下优先于仅内存 `setTimeout`）；alarm 到期调用 `stop_capture('max_duration')`。Service Worker 重启时根据持久化截止时间立即终态化或重建 alarm，stop/失败清理 alarm。补 fake alarms/time 测试覆盖正常到期、手动提前停止、SW 重启后已过期三条路径。若产品不再需要上限，则同步删除常量、reason、README 与 blueprint 承诺。
- **history / pre-existing**：长期预存。常量由 `2f95a68c`（2026-06-03）引入；blueprint 声明由 `5d15d019`（2026-07-12）引入；README 用户承诺由 `99783357`（2026-07-14）引入。不是本次审阅产生。

### DD-002 — Medium — `contributing_dev.md` 声称描述当前结构，但结构、命令与示例均已失真

- **severity**：Medium
- **confidence**：100
- **file:line**：`docs/guides/contributing_dev.md:51-78,82-100,142-181,198-226`
- **复现证据 / 调用链**：
  1. `:56-65` 展示 `src/agent/{bridge,mcp,shared}` 与顶层 `src/{background,content,dashboard,...}`，而真实结构为 `src/{extension,bridge,mcp,shared}`；`:78` 又明确声明“本页描述当前结构”，形成文档内自相矛盾。
  2. `:96-99` 将 `bridge/server.ts` 描述成 WebSocket Bridge；当前 `src/bridge/server.ts` 是 Node HTTP server，WebSocket 只存在于外部 CDP 相关路径。
  3. `:146-149` 使用固定弱 token `test` 和硬编码端口 `3000`。项目安全不变量要求强随机 token，当前默认示例/惯例端口为 `17831`。
  4. `:156`、`:201`、`:226` 使用已不存在的根目录测试路径；当前单测位于 `tests/unit/`。
  5. `:170-173` 新 content 模块示例从 `src/extension/content/my_capture.ts` 导入 `../shared/logger`，实际解析到不存在的 `src/extension/shared/logger`；正确跨到根 shared 需 `../../shared/logger`。同时 `new Logger('content/my_capture')` 缺少 `src/shared/logger.ts:97-101` 要求的 transport 参数，照抄无法通过类型检查。
- **影响**：新贡献者按活动指南操作会启动错误端口、使用不安全 token、运行不存在的测试路径，并生成无法 typecheck 的模块；这不是措辞瑕疵，而是直接破坏开发入口。
- **具体修复**：从当前目录树、`package.json` scripts、`src/shared/logger.ts` API 重新生成本页；示例使用安全随机 token 的生成/持久化流程或直接指向零配置 Bridge 文档，不提供固定 token；所有测试路径改为 `tests/unit/...`；用可实际编译的最小 content 模块示例，并在文档 CI 增加路径/代码片段校验。
- **history / pre-existing**：预存。大部分内容由 `0d73bccd`（2026-07-16）引入；`6af4a440`（2026-07-20）补了“三产品结构”声明及 tests 子目录，却未改旧树与示例。旧文档审阅已指出类似漂移，未完成收敛。

### DD-003 — Medium — 活动测试指南仍描述归档时代目录、构建链与 MCP 注册方式

- **severity**：Medium
- **confidence**：100
- **file:line**：`docs/guides/test.md:34-64,77-126,140-155`；`vitest.config.ts:3-21`；`package.json:22-39`；`.mcp.json.example:1-14`
- **复现证据 / 调用链**：
  1. `test.md:36-46` 的 Vitest 配置漏掉当前 `tests/e2e/**`、`tests/support/**` exclusions 与完整 coverage 配置；真实配置见 `vitest.config.ts:3-21`。
  2. `test.md:50-64` 声称单测/E2E 平铺在 `tests/` 根，并列出 `tests/fixtures`、`__mocks__`、`helpers`；真实结构是 `tests/unit/`、`tests/e2e/`、`tests/support/fixtures/server.ts`。当前规模为 159 个 unit tests 与 37 个 E2E specs，不是文档所称约 80/40 个根目录文件。
  3. `test.md:84` 的 build 流程漏掉 `copy:locales` 与 `build:zip`；真实命令为 `package.json:24`。
  4. `test.md:89` 将 E2E server 写成 `tests/fixtures/server.ts`；真实 script 是 `package.json:36` 的 `tests/support/fixtures/server.ts`。
  5. `test.md:100-126` 要求手填 MCP token，声称 `.claude/settings.json` 已注册 MCP，并宣称通过内部点分命令调用“12 个工具”。当前公开配置是 `.mcp.json.example:1-14`，不含明文 token；MCP 对外工具名由 `src/mcp/tools.ts:9-31` 注册，共 17 个（含 4 个兼容 alias），不是点分内部 command 名。
  6. `test.md:154` 保留 `NEEDS CLARIFICATION`，但同段已经从实际 config 得出不存在 `e2e-p0` 的结论；活动指南仍把已确认漂移留作未决 TODO。
- **影响**：开发者会遗漏完整构建产物、启动错误 fixture 路径、配置错误 MCP 客户端，并误判测试与工具覆盖面。指南标题和措辞将这些内容标为“实际”，提高误导风险。
- **具体修复**：以 `vitest.config.ts`、`playwright.config.ts`、`package.json`、`.mcp.json.example`、`src/mcp/tools.ts` 为唯一来源重写相关章节；删除归档工作流强制语气和已解决的 clarification；工具数量由代码生成或只链接 MCP usage，避免手工计数再次漂移。
- **history / pre-existing**：预存。核心段落源自 `5d15d019`（2026-07-12）的 archived omni_powers 文档；`6af4a440`（2026-07-20）迁入活动指南时未按现行配置完整重建。

### DD-004 — Medium — 当前领域蓝图仍宣称已删除类型和字段存在，且“禁用术语完全移除”与现状冲突

- **severity**：Medium
- **confidence**：100
- **file:line**：`docs/blueprint/domain.md:49,59-76`；`src/shared/types.ts:370-386`；`src/mcp/tools.ts:9-31`；`src/mcp/schemas.ts:131-150`
- **复现证据 / 调用链**：
  1. `domain.md:74` 声称 `Session` / `RecordEvent` 类型仍以 `@deprecated` alias 存在；t125 已删除这些 alias，当前 `src/shared/types.ts` 不存在对应定义。
  2. `domain.md:76` 声称 `capture_mode` 字段仍保留 `'basic' | 'advanced'`；当前源码不存在该字段，只有名称不同、语义不同的 `body_capture_mode` / `keyboard_capture_mode`。
  3. `domain.md:61` 声称禁用概念已从“UI 与文档完全移除”，但同文档 `:49` 明确列出 4 个 session 命名 MCP alias；`src/mcp/tools.ts:14-15,22,24` 与 `src/mcp/schemas.ts:140-141,148,150` 也继续公开这些名字。
  4. `domain.md:71` 禁止 `session_id`，但 `WsFrameData.session_id` 仍以“v2.0 移除”的 deprecated 字段存在（`src/shared/types.ts:382-385`），`src/extension/background/network_capture.ts:418,477,504` 仍从 CDP target session 取值并写入网络事件。即使这些是有意例外，“完全移除”也不成立。
  5. ADR 013 已在 `docs/blueprint/decisions.md:102-107` 正确记录 t125 的破坏性删除，因此 domain 漂移不是缺少历史决策，而是当前真相未同步。
- **影响**：`docs/blueprint/` 是项目长期真相和 task/spec 输入。错误描述会让后续 task 重建已删除兼容层、误以为 `capture_mode` 仍属契约，或在审查时把有意 alias 当成违规，直接污染需求和变更边界。
- **具体修复**：删除 `:74`、`:76` 的过期陈述；把“完全移除”改成精确范围，列出仅存的 MCP alias 与 `WsFrameData.session_id` 例外、负责人和移除条件。若继续遵循破坏性升级方向，则创建明确 task 删除这些例外，再将 domain 改为完全移除。
- **history / pre-existing**：预存。相关 domain 行由 `5d15d019`（2026-07-12）引入；t125 删除代码后只同步了 ADR 013，未同步 `domain.md:74`。不是当前 review 引入。

### DD-005 — Low — 五个 exported API 在生产与测试引用图中均为零引用

- **severity**：Low
- **confidence**：100
- **file:line**：`src/bridge/logger.ts:25-27`；`src/extension/background/storage.ts:323-327`；`src/shared/protocol.ts:68-72`；`src/shared/types.ts:137,594`
- **复现证据 / 调用链**：TypeScript LanguageService 对全部 87 个源码文件与 201 个测试文件构建引用图，以下符号只有定义、无 import/call/type reference：
  - `bridge_error`
  - `write_error_events`
  - `ExtensionBridgeConfig`
  - `RedactionStatus`
  - `CaptureEventUnion`

  其中 `agent_bridge_client.ts` 的 `log_bridge_error` 是不同的私有符号。异常采集真实链路是 `exception_capture.ts:156-167` 构造 `runtime_exception` → `service_worker` 的通用 event handler → `write_events` 按 category 写 `ERROR_EVENTS`；没有调用 `write_error_events`。`tsc` 的 `noUnusedLocals` 不会把 exported declaration 当作 unused，故类型检查通过不能证伪。
- **影响**：无行为故障，但扩大公共面并误导维护者寻找不存在的调用方；特化 writer 尤其暗示异常写入存在第二条路径。t124 review 还把 `write_error_events` 误判为“存活函数”，说明死导出已产生审阅噪声。
- **具体修复**：删除五个 export/declaration；若某个符号是刻意留给尚未存在的外部消费者，在公开契约/spec 中登记，并增加实际消费测试，而不是仅保留代码。删除后跑 `tsc` 与相关 unit tests。
- **history / pre-existing**：均预存。`bridge_error` 由 `1d66fe3`（2026-08-13）引入；`write_error_events` 由 `c88c556`（2026-06-08）引入；`ExtensionBridgeConfig` 由 `a7b03c9`（2026-06-05）引入；`RedactionStatus` 由 `40d3b22`（2026-06-08）引入；`CaptureEventUnion` 由 `770b73d`（2026-06-22）引入。

### DD-006 — Low — deprecated `AgentStatus` 顶层字段仍在每次响应中生产，并被测试反向固化

- **severity**：Low
- **confidence**：100
- **file:line**：`src/shared/protocol.ts:119-131`；`src/bridge/server.ts:126-154`；`tests/unit/agent_bridge_server.test.ts:688-699`；`tests/unit/agent_mcp_client.test.ts:46-54,183-190`；`tests/e2e/e2e-mcp.spec.ts:143-149`；`tests/e2e/e2e-mcp-full.spec.ts:114-118`
- **复现证据 / 调用链**：
  1. `extension_online`、`extension_version`、`active_capture_id` 已明确标记 `@deprecated use extensions`。
  2. `build_status()` 仍选择 `online[0]` 作为含糊的 primary，并在每次 `/mcp/status` 响应写回三字段；同一响应已包含权威 `extensions[]` 与 `online_count`。
  3. unit 与 E2E 测试继续断言 `extension_online`，使删除 deprecated 字段必然红灯；测试保护的是兼容债务，不是新协议。
- **影响**：多实例场景中 `extension_version` / `active_capture_id` 的“第一在线实例”语义不稳定；消费者继续依赖旧字段，导致已宣告 deprecated 的兼容面无法自然退出。
- **具体修复**：按破坏性升级决策删除三字段、`primary` 派生和旧断言；消费者统一读取 `extensions` / `online_count`，需要单目标时显式按 `instance_id` 或 `browser_label` 选择。若必须兼容外部版本，增加版本化 endpoint 或明确 removal release/date，而不是无限期保留。
- **history / pre-existing**：预存。字段最早由 `a7b03c9`（2026-06-05）引入，多实例字段及 deprecated 标记由 `659c7945`（2026-07-16）引入。t125 测试审阅明确把这些字段判为 scope 外残留；`docs/reviews/review_20260812_1249/b1_core.md:100-102` 再次记录，尚未清理。

### DD-007 — Low — 九个事件契约无生产者，Dashboard 与测试包含不可达分支

- **severity**：Low
- **confidence**：90
- **file:line**：`src/shared/types.ts:101,117-119,126,130-133,551-589`；`src/shared/event_category.ts:4-6`；`src/extension/background/storage.ts:253-266`；`src/extension/dashboard/dashboard_shared.ts:195-219`；`src/extension/dashboard/dashboard_detail.ts:106-107`
- **复现证据 / 调用链**：源码搜索显示以下事件名只出现在类型、分类、storage fallback 或 Dashboard renderer，没有生产 emit/call site：`page_navigation`、`unhandled_rejection`、`resource_error`、`network_failed`、`dom_mutation`、`capture_config_changed`、`permission_missing`、`debugger_attach_status`、`body_capture_status_changed`。测试中的命中均为 synthetic fixture 或集合一致性断言。`storage.ts:262-264` 甚至明确注释 `dom_mutation` “目前无生产者（dormant 类别）”。当前导航生产者使用 `page_load` / `route_change` / `dom_ready` / `visibility_change` 及 tab 事件；异常生产者使用 `runtime_exception`。
- **影响**：类型/schema 暗示产品可生成这些事件，Dashboard 保留永远不可达的显示分支，synthetic tests 形成“已覆盖能力”的假象。后续统计、导出或 MCP 消费者可能为不存在的数据编写逻辑。
- **具体修复**：逐项与 roadmap/spec 对照。无计划的事件删除 `EventType`、data interface/map、category、renderer 和 synthetic tests；确有计划的事件建立 producer task 与行为测试，并在类型旁明确 `dormant/producer planned` 及跟踪 ID。不要仅靠 renderer fixture 宣称支持。
- **history / pre-existing**：预存。相关契约主要来自早期事件模型 commits（`6765ed6`、`770b73d`、`d852e9e`）；当前源码注释已承认至少 `dom_mutation` 属 dormant，不是本次变更引入。

### DD-008 — Low — 四个 MCP `session` 工具 alias 是显式兼容面，但没有退出条件

- **severity**：Low
- **confidence**：100
- **file:line**：`src/mcp/tools.ts:9-31`；`src/mcp/schemas.ts:131-150`；`docs/blueprint/domain.md:45-49,59-74`
- **复现证据 / 调用链**：MCP 注册 17 个工具，其中 `list_sessions`、`get_session`、`get_all_session_data`、`export_session` 分别映射 capture 主命令；schemas 同步公开四个 alias。`domain.md:49` 明确称其为兼容别名，因此它们不是误删遗漏；但同一文档 `:61-71` 又把 session 定为已从产品/文档完全移除的禁用术语，且仓库没有版本、日期、使用遥测或 removal task 说明何时退出。
- **影响**：兼容面会永久扩大 MCP schema、工具发现列表和测试矩阵；Agent 仍可能优先选旧名，进一步延长 session 术语寿命。与项目“破坏性升级优于兼容包袱”的当前方向不一致。
- **具体修复**：若没有已发布外部消费者约束，直接破坏性删除四个 alias、schemas 与对应测试，MCP 工具数同步更新；若确有兼容要求，在 ADR 明确最低兼容版本、弃用提示和删除 release/date，并让 alias 调用返回可观测 deprecation metadata。
- **history / pre-existing**：预存且显式保留。t124 review `docs/archive/tasks/t124_remove_dead_exports/review_general.md:25-30` 明确判定这些 MCP 名称不属于 storage alias 清理；t125 也未把它们纳入破坏性协议清理范围。本 finding 指向“无退出计划”，不是声称其当前无意存在。

### DD-009 — Info — 2026-06 留下的 TODO 仍描述未执行的 Dashboard 推送迁移

- **severity**：Info
- **confidence**：100
- **file:line**：`src/extension/dashboard/dashboard.ts:118-152`
- **复现证据 / 调用链**：`TODO(M4)` 要求 Service Worker 主动推送变化、Dashboard 改用 `chrome.runtime.onMessage`；当前实现仍每 2 秒执行 `load_captures()`，详情采集中还执行 `load_detail()`。相关 unit tests 没有覆盖此 TODO 的 owner、计划或完成条件。近期 t144 只优化“有变化才 render”和拖拽期间跳过，没有替换 polling。
- **影响**：不是 correctness 缺陷，但无 task ID、owner 或日期的 TODO 已存续两个月，并与后续 polling 优化叠加，容易被误认为已有路线承诺；代码无法判断这是明确设计还是遗留计划。
- **具体修复**：若 polling 是当前正式设计，删除 TODO 并在架构/性能说明记录理由；若仍计划 push，转成有 AC 的 task，覆盖状态变化通知、SW 重启、Dashboard 未打开和消息丢失后的 resync，不在生产代码中无限期留模糊 TODO。
- **history / pre-existing**：预存。TODO 由 `92706338`（2026-06-22）引入；轮询主体最早来自 `d7dafa5d`（2026-06-09）；t144 于 `17cde0df`（2026-08-12）优化轮询但保留 TODO。

## 未覆盖区域

- 未运行 `npm test`、`npm run build` 或 Playwright E2E；父审阅流程统一执行全量验证。本报告只运行 `tsc --noEmit`。
- 未启动 Chrome/Edge 扩展、Bridge 或 MCP 服务，未对 24 小时行为做真实长时运行；结论来自完整静态调用链与 timer/alarm 搜索。
- 未深审 CSS、图像、locale 文案、构建产物与 `data/` 运行数据；只在相关引用图与文档对照中检查。
- archived tasks/specs/reviews 只用于 history，不按当前文档正确性逐页审阅。
- 静态引用图无法证明仓库外消费者是否 import 某个 exported type/function；本项目 `private: true` 且这些符号未形成发布 package API，因此仍按仓库内死导出报告。
- 动态字符串调用、浏览器注入文本和运行时反射可能绕过 TypeScript 引用图；对事件类型另做了全源码文本搜索以降低漏报。

## Strengths

- `npx tsc --noEmit --pretty false` 通过，未发现机械 TypeScript 错误；源码入口与测试目录整体可被 TypeScript LanguageService 解析。
- 当前 `vitest.config.ts` 已明确隔离 `tests/e2e/**` 与 `tests/support/**`，并配置源码 coverage；问题主要在指南未同步，而非配置本身。
- `docs/blueprint/decisions.md:102-107` 能追踪 ADR 013 从渐进兼容到 t125 破坏性删除的演进，历史决策可审计。
- t124/t125 已删除大量 storage/type/error-code 兼容层，并保留 review evidence；本报告发现的剩余面边界清晰，可继续小步清理。
- `storage.ts:262-264` 主动标注 `dom_mutation` dormant，说明维护者已识别真实生产链与预留契约的差异。
- `AgentStatus.extensions[]`、`online_count` 已提供替代旧顶层字段的完整多实例模型，删除 deprecated 字段不需要设计新协议。

## 验证摘要

- `npx tsc --noEmit --pretty false`：exit 0。
- `npm ls knip madge ts-prune --depth=0`：无顶层依赖，未安装临时工具。
- TypeScript LanguageService 引用图：87 个源码 TS + 201 个测试 TS；确认 DD-005 五个 exported symbol 仓库内零引用。
- 全源码/测试事件名搜索：确认 DD-007 九个事件无生产者，测试命中为 synthetic fixtures/集合断言。
- `git blame` / archived review 对照：九项均为 pre-existing；其中 DD-001、DD-006、DD-009 已在历史 review、注释或 TODO 中被明确识别但未闭环。
