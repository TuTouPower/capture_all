# 架构与可维护性审查

## 结论摘要

本轮记录 9 条 finding：**High 1、Medium 5、Low 3**。最优先问题是页面侧统一快照读取仍按每类 `100000` 条固定上限，导致 Dashboard 详情、Dashboard ZIP 与 Popup ZIP 对大采集静默丢数据；该行为与仓库已生效架构决策“分页读取至耗尽”直接相反。其余主要风险集中在产品目录反向依赖、Dashboard/Bridge/Network Capture 的中心化模块、内部 lifecycle 数据契约缺口，以及 repo task 工具链重复解析器。

本轮为只读静态审查，未运行 `tsc`、lint、测试、构建或 E2E。结论基于源码调用链、import graph、测试结构、active/archived specs、blueprint 与 `git log`/`git blame` 交叉核验。

## 审阅范围

- 生产代码：`src/extension/**`、`src/bridge/**`、`src/mcp/**`、`src/shared/**`。
- 工具链：`scripts/repo_template/**`，重点核对 task front matter、review prompt/status 路径。
- 关联测试：`tests/unit/**`、`tests/repo_template/**` 中与候选 finding 直接相关的测试。
- 架构与契约：`docs/blueprint/{architecture,decisions,domain}.md`、`docs/specs_index.md`、`docs/archive/specs/{export,mcp_server,storage,data_model}.md`、相关已归档 task/review。
- 历史：候选位置的 `git log --follow`、`git blame`、关键提交 `42236c2`、`d8970e7`、`ac8fefe`、`ea0ff5c` 等。
- 静态分析：解析 `src/**/*.ts` import graph 并跑 Tarjan SCC；未发现 TypeScript import cycle。扫描跨产品边，唯一明确违规边为 `mcp -> bridge`。粗略扫描函数体量后逐段阅读最高风险函数。

## Findings

### ARCH-001 — 页面侧快照固定 100000 条，详情与 ZIP 导出静默截断

- **Severity:** High
- **Confidence:** 98%
- **Location:**
  - `src/extension/shared/capture_data_reader.ts:24-35`
  - `src/extension/background/storage.ts:473-502,508-531`
  - `src/extension/dashboard/dashboard_shared.ts:288-303,310-359`
  - `src/extension/popup/popup.ts:263-288`
  - 对照实现：`src/extension/background/exporter.ts:14,29-67,76-97`、`src/extension/background/agent_data_queries.ts:53-99`
  - 契约：`docs/blueprint/decisions.md:95-100`、`docs/archive/specs/export.md:7-10,31-36`
- **Evidence / reproduction:**
  1. `read_capture_snapshot()` 对 7 类数据各调用一次，参数固定为 `offset=0, limit=100000`，没有续页、总数检查、`truncated` 标记或错误（`capture_data_reader.ts:25-34`）。
  2. 底层 `query_by_store()` 在 `out.length >= limit` 时立即结束 cursor（`storage.ts:487-500`），因此同一类别第 `100001` 条起确定不会返回。
  3. Dashboard 详情 `load_detail()` 直接使用该快照（`dashboard_shared.ts:288-300`）；Dashboard archive 导出与 Popup archive 导出也直接把该快照交给 `build_archive()`（`dashboard_shared.ts:316-336`、`popup.ts:263-288`）。调用链上没有第二次补页。
  4. 相同问题已在 background exporter 与 Agent 查询中修复：两者使用 `PAGE_SIZE=5000` 循环到耗尽（`exporter.ts:29-67`、`agent_data_queries.ts:53-68`）。ADR 012 明确否决固定上限并选择分页读取至耗尽（`decisions.md:95-100`）；export spec 将 JSON 定义为“完整快照 + 所有事件”（`export.md:7-10`）。
  5. 现有 `tests/unit/live_data_queries.test.ts:145-158,435-444` 复制旧读取逻辑并反向锁定 `limit=100000`，不是 `read_capture_snapshot()` 的行为测试。archive 相关测试 mock `read_capture_snapshot`；仓库没有 `capture_data_reader` 专属跨页/第 `100001` 条测试。
  6. **High 证伪检查：**未找到“每类最多 100000 条”产品上限；存储契约只有单采集 500MB 上限（`docs/archive/specs/storage.md:5-10`），足以容纳超过 100000 条小事件。相反，ADR 012 与 T043 明确把该模式定性为“静默截断”。因此不是设计上限，而是修复漏网路径。
- **Impact:**
  - 大采集在 UI 详情与两个主要 ZIP 入口中看似成功，实际每类最多保留前 100000 条，归档 manifest 也只会基于截断数组生成，无法让调用方发现丢失。
  - 同一 capture 经 background JSON/HAR 或 MCP 查询可得到更多数据，而经 Dashboard/Popup ZIP 得到更少数据，形成入口相关的数据完整性差异。
  - `read_capture_snapshot` 还是详情页数据源，用户会将截断误判为采集层缺失。
- **Recommendation:**
  - 抽取 extension 内统一 `fetch_all(fetcher, page_size=5000)`，供 `exporter.ts`、`agent_data_queries.ts`、`capture_data_reader.ts` 共用；每个类别循环到 `batch.length < PAGE_SIZE`。
  - 给 `read_capture_snapshot` 增加真实 cursor/mock 分页测试：第一页恰好 5000 条、第二页至少 1 条，断言第 5001/100001 条存在且 offset 递增。
  - 若内存预算必须限制全量快照，需返回显式 `truncated`/`PAYLOAD_TOO_LARGE`，不能静默裁切；长期可让详情分页、归档流式输出。
- **History / pre-existing:** `08b9d13`（2026-06-13）引入固定 `100000`；`42236c2`（2026-07-19，T043）只修 `exporter.ts` 与 `agent_data_queries.ts`，未覆盖页面 reader。明确 pre-existing，并已在旧 review 中出现但尚未闭环。

### ARCH-002 — MCP 直接依赖 Bridge 配置模块，违反产品依赖方向

- **Severity:** Medium
- **Confidence:** 100%
- **Location:**
  - `src/mcp/token_resolver.ts:1-16`
  - `src/mcp/main.ts:1-11`
  - `src/bridge/config.ts:1-172`
  - `docs/blueprint/architecture.md:145-155`
- **Evidence / reproduction:**
  1. `token_resolver.ts` 从 `../bridge/config` 导入 `default_token_file_path`、`load_bridge_token_file` 与 `TokenFileLoadResult`，`mcp/main.ts` 再调用 resolver 完成启动 token 解析。
  2. 架构依赖表明确规定 `mcp ──✗── extension / bridge（运行时只走 HTTP）`，三个产品只能共同依赖 `src/shared`（`architecture.md:145-155`）。静态 import graph 中这是唯一明确跨产品违规边；无 TS import cycle。
  3. `bridge/config.ts` 同时包含 Bridge CLI 解析、token 文件 contract、token 生成/持久化、Bridge token resolution 与健康检查（`config.ts:14-172`）。MCP 为复用只读 token 文件逻辑，被迫依赖拥有 Bridge 启动职责的模块。
  4. `tests/unit/mcp_token_fallback.test.ts` 测 MCP resolver，`tests/unit/agent_bridge_config.test.ts` 测 Bridge config；测试边界也跟随当前错误依赖，而非一个中立 token-file contract。
- **Impact:**
  - Bridge 配置重构、入口拆分或浏览器端打包规则变化会无关地影响 MCP；产品目录无法独立构建和演进。
  - 架构文档与真实依赖不一致，使依赖门禁失去可信度；后续复用容易继续从产品目录横向导入。
- **Recommendation:**
  - 将 Node 专用 token 文件类型、默认路径与读取逻辑移到中立模块，例如 `src/shared/node_bridge_token_file.ts`；Bridge config 与 MCP resolver 同向依赖该模块。
  - Bridge 专属 CLI、token 生成/持久化、health probe 留在 `src/bridge/config.ts`。若不希望 `shared` 含 Node API，可建立明确的 `src/node_shared/` 层并在 blueprint 中记录，仍禁止产品横向依赖。
  - 增加 import-boundary 测试/脚本，拒绝 `src/{extension,bridge,mcp}` 互相导入。
- **History / pre-existing:** `d8970e7`（2026-07-22，T091）引入；`8fa73b7`（2026-08-11）扩充失败原因类型。明确 pre-existing。

### ARCH-003 — Dashboard shared 同时充当全局状态仓库、数据服务与可变 service locator

- **Severity:** Medium
- **Confidence:** 93%
- **Location:**
  - `src/extension/dashboard/dashboard_shared.ts:1-109,240-378`
  - `src/extension/dashboard/dashboard.ts:74-99,101-137`
  - `src/extension/dashboard/dashboard_detail.ts:1-23`
  - 关联测试：`tests/unit/dashboard_detail_xss_escape.test.ts:11-17,122-125`、`tests/unit/t154_dashboard_misc.test.ts:40-43,104-106`
- **Evidence / reproduction:**
  1. `dashboard_shared.ts:26-109` 持有约 20 个模块级可变状态，暴露成对 get/set；同文件还负责格式化、event 归一化、详情加载、archive 导出、logger 与下载（`dashboard_shared.ts:111-363`）。模块名“shared”已无法表达职责边界。
  2. 文件尾定义带默认 no-op 的可变 `router`（`dashboard_shared.ts:365-373`）。`dashboard.ts` 通过赋值注入 `go/render_content/render_shell/open_detail` 以“breaks circular deps”（`dashboard.ts:95-99`），`dashboard_detail.ts` 又反向覆写 `router.is_tl_dragging`（`dashboard_detail.ts:21-23`）。
  3. 未完成入口初始化时，`router.go()` 等调用不会 fail-fast，而是静默 no-op；行为依赖 import/执行顺序。`integration_page.test.ts` 必须动态 import `dashboard.ts` 才能把占位函数变成真实函数，已暴露隐式初始化契约。
  4. 多个测试直接修改模块单例，并在 `beforeEach` 手工恢复部分字段。没有统一 state factory/reset；新增字段容易跨测试泄漏或被遗漏。
- **Impact:**
  - 页面状态、业务数据加载、渲染导航互相耦合；任何 tab/导出/轮询功能都倾向继续修改中心模块。
  - service locator 的默认 no-op 会把接线错误变成静默功能失效，调试依赖模块加载顺序。
  - 单例状态使测试隔离脆弱，也阻碍未来对 Dashboard 实例化、热重载或分页面懒加载。
- **Recommendation:**
  - 最小拆分为 `dashboard_state.ts`（显式 `DashboardState` 对象与 factory/reset）、`dashboard_data.ts`（load/export）、`dashboard_format.ts`（纯函数）。不需要引入 UI 框架。
  - 将 router 改为入口显式传入 controller/callbacks，或提供一次性 `wire_dashboard_router()`；未接线调用应抛明确错误，而非 no-op。
  - 让测试每例创建 state/controller，不再直接共享模块单例；先覆盖现有路由与详情状态，再逐步迁移调用方。
- **History / pre-existing:** `ac8fefe`（2026-06-22）从 1317 行 `dashboard.ts` 拆为 6 模块时形成；后续 t144/t152/t154 继续向 shared 增加网络/console 状态、router 标志和记忆状态。明确 pre-existing。

### ARCH-004 — Bridge HTTP server 以单一 553 行闭包路由承载全部控制面

- **Severity:** Medium
- **Confidence:** 91%
- **Location:**
  - `src/bridge/server.ts:52-604`（`create_bridge_server`）
  - 重点职责段：状态/路由 `:53-155`、pair/enroll `:157-351`、认证 `:353-384`、heartbeat/command/result `:386-498`、MCP/file spill `:500-554`、CDP `:556-579`
  - 测试：`tests/unit/agent_bridge_server.test.ts`、`tests/unit/t137_bridge_security.test.ts`
- **Evidence / reproduction:**
  1. 粗略函数扫描显示 `create_bridge_server` 约 553 行，是 `src` 中最长函数。它闭包捕获 `instances`、`queues`、`command_owners`、`pairing_state`，同时实现 target resolution、status projection、CORS、认证、pairing、enroll/替换、heartbeat、queue、MCP 大结果落盘与 CDP 路由。
  2. 相同“实例被顶替时删除 instance + cancel queue + 清 command owners”逻辑在 enroll（`server.ts:288-308`）和 heartbeat（`:406-427`）重复；安全修复必须保证两条路径同步。
  3. 单一 `try/catch` 将所有 route 共享成一个错误边界（`:157-595`），route 级输入/权限/错误映射难以独立推演。CDP 已有 handler 模块，却仍与 pairing/MCP/extension route 编排混在一个函数。
  4. `agent_bridge_server.test.ts` 已扩张为近 2000 行的大型端到端式单测文件，大量行为只能通过启动完整 server 验证，说明内部领域逻辑缺少可单测边界。
  5. **Medium 证伪检查：**文件长本身不是 finding；问题依据是可指出的重复状态变更、隐式闭包依赖和多安全域共用路由函数。当前测试覆盖较广，故未评 High。
- **Impact:**
  - 修改 enroll/heartbeat/认证任一逻辑需在巨型 handler 中同时理解四类 endpoint 与共享 map 生命周期，容易产生路径不对称。
  - 安全敏感边界（extension token、MCP token、origin、output path）集中在高 churn 文件，review diff 难聚焦。
  - 领域逻辑只能经 HTTP server 级测试驱动，增加测试成本并促使测试文件继续单体化。
- **Recommendation:**
  - 保留一个薄 `create_bridge_server` 负责 state/context 构造与 `http.createServer`；拆出 `handle_pair_route`、`handle_extension_route`、`handle_mcp_route`、`handle_cdp_route`。
  - 抽 `BridgeRegistry`（instances/queues/owners）并集中实现 `replace_instance/remove_instance`，消除 enroll/heartbeat 重复清理逻辑；注入 clock/random/file writer 以便单测。
  - 每个 route handler 返回统一 `{status, body}`；server 层只做 CORS、异常映射与发送。
- **History / pre-existing:** 初始 server handler 自 `25ba3e9`/`cfed3fe`（2026-06）即存在；多实例、pairing、file spill、zero-config、安全修复持续叠加。明确 pre-existing，且 t129 只拆指定 4 个函数，未覆盖该函数。

### ARCH-005 — `network_capture.handle_cdp_event` 仍是 421 行多协议状态机

- **Severity:** Medium
- **Confidence:** 90%
- **Location:**
  - `src/extension/background/network_capture.ts:27-66,369-789`
  - 关联模块：`src/extension/background/cdp_event_router.ts`、`cdp_handler.ts`、`stream_buffer.ts`、`network_webrequest.ts`
  - 历史范围说明：`docs/archive/tasks/t129_split_long_functions/spec.md:3-18`
- **Evidence / reproduction:**
  1. `handle_cdp_event()` 在同一函数内处理：sub-target attach/detach（`:373-409`）、HTTP request/redirect（`:420-480`）、response/stream detection（`:482-539`）、loadingFinished/body 异步生命周期（`:548-700`）、loadingFailed（`:702-711`）、WebSocket connection/frame 生命周期（`:713-788`）。粗略扫描约 421 行。
  2. 函数直接读写至少 7 组模块级状态：`cdp_request_meta`、`cdp_body_results`、`streaming_requests`、`finished_before_stream`、`ws_connections`、deferred/orphan state、capture globals（`network_capture.ts:27-66`）。
  3. 文件头称“Delegates to specialized handlers”，也已 import `cdp_event_router`、`stream_buffer`、`network_webrequest`、`cdp_handler`；但核心协议分派与状态转换仍集中在 orchestrator。注释中的“orchestrator”与实际责任不符。
  4. 该函数横跨同步 CDP 事件与异步 `sendCommand().then/.catch`，许多历史 task（T094/T103/T112/T119 等）都在同一状态面修 session key、迟到回调、marker 清理，显示维护风险不是单纯行数。
  5. t129 明确只拆 4 个指定函数，其余 >80 行函数属于非范围（`t129 spec:5,11-18`），因此当前风险不是已闭环 finding。
- **Impact:**
  - 新增/修复任一 CDP 终态必须同时维护多个 Map/Set 清理不变量；遗漏一个 terminal path 即产生跨 capture 串写、内存残留或事件缺失。
  - HTTP streaming 与 WebSocket 共享大 dispatcher，测试需要构造复杂全局状态，降低局部修改可信度。
- **Recommendation:**
  - 先引入显式 `NetworkCaptureContext` 包装当前 Map/Set 与 capture generation，不改行为；再按 method family 拆 `handle_target_event`、`handle_http_event`、`handle_websocket_event`。
  - 将 request lifecycle 收敛为单一 record/state transition API，集中 `finalize/cleanup`，避免每条异步分支手工删除多个集合。
  - 保留现有生产接线测试，并增加 terminal-path table test，逐项断言相关 state 均清空。
- **History / pre-existing:** 主 dispatcher 自 2026-06 初期存在；`855a9c4`（2026-07-16）虽抽 specialized modules，核心函数仍保留。随后多个 correctness task 在其上增补守卫。明确 pre-existing。

### ARCH-006 — 三份 front matter parser 形成重复真相源且转义语义已漂移

- **Severity:** Low
- **Confidence:** 97%
- **Location:**
  - canonical：`scripts/repo_template/repo_task/documents.py:10-74`
  - 副本：`scripts/repo_template/render_review_prompts.py:39-57`
  - 副本：`scripts/repo_template/check_review_status.py:84-104`
  - 测试：`tests/repo_template/test_task_save.py:50-87,110-119`、`test_render_review_prompts.py:27-48,352-358`
- **Evidence / reproduction:**
  1. 三处 docstring 明确写“改解析规则需三处同步”（`documents.py:54-59`、两个脚本 parser docstring），即代码主动承认重复真相源。
  2. canonical `_quote/_unquote` 对双引号与反斜杠做对称转义（`documents.py:10-31`），`dump_front_matter()` 统一用该规则输出（`:65-71`）。两个简化副本仅执行 `strip('"').strip("'")`，不会还原 `\"`/`\\`。
  3. 可静态复现：canonical 写入 `title: "a\\\"b"` 后会读回 `a"b`；两个副本会保留反斜杠。任务标题、slug、路径或 note 若含这类字符，task CLI、prompt 渲染、review status 会对同一 `task.md` 得到不同值。
  4. canonical 有 quote/backslash round-trip 测试（`test_task_save.py:50-51,73-87`）；render 副本只测普通引号与行内注释；status 副本没有 parser parity 测试。
- **Impact:**
  - task 状态权威是 `task.md` front matter，但不同工具会解释成不同值；错误可能表现为 prompt 占位内容漂移、fingerprint/status 判断异常，排查困难。
  - 每次 parser 规则变化都需手动同步三处，已有注释不能替代可执行复用。
- **Recommendation:**
  - 两个脚本直接 import `repo_task.documents.parse_front_matter` / `parse_front_matter_text`，仅在 CLI 边界转换 `TaskDataError` 为各自错误文案。
  - 增加一组共享 corpus/parity 测试，至少覆盖双引号、反斜杠、单引号、冒号、`#` 与未闭合 front matter。
- **History / pre-existing:** 三份实现随 `ea0ff5c`（2026-08-11）进入当前仓库；`b6c03aa` 仅同步模板，未收敛。明确 pre-existing。

### ARCH-007 — lifecycle 是持久化内部分类，但所有“全量”读取/导出路径均不可达

- **Severity:** Medium
- **Confidence:** 82%
- **Location:**
  - 写入：`src/extension/background/service_worker.ts:517-533,765-783`
  - store/query：`src/extension/background/storage.ts:116-120,558-564`
  - 遗漏读取：`src/extension/shared/capture_data_reader.ts:13-35`、`src/extension/background/exporter.ts:76-155`、`src/extension/background/agent_data_queries.ts:14-99`
  - 契约：`docs/blueprint/domain.md:51-57`、`docs/archive/specs/data_model.md:152,168`、`docs/archive/specs/export.md:7-10`、`docs/archive/specs/mcp_server.md:24,80-85`
  - 测试：`tests/unit/storage_helpers.test.ts:100-143,170-184`
- **Evidence / reproduction:**
  1. start/stop 会真实写 `capture_started` / `capture_stopped` 到 `capture_lifecycle_events`（`service_worker.ts:517-533,765-783`），store 与 `get_lifecycle_events()` 均存在。
  2. 全仓生产调用搜索中，`get_lifecycle_events()` 除定义外无消费者。测试仅断言函数存在与常量字符串，未验证任一产品路径返回 lifecycle（`storage_helpers.test.ts:134-136,183`）。
  3. 页面快照接口没有 lifecycle 字段；background exporter 的 7 类 `Promise.all` 不读取 lifecycle；Agent `ALL_SOURCES` 与 `load_agent_capture_data` 也只含 7 类。因此 Dashboard/Popup archive、JSON/JSONL/HTML/HAR 与 MCP `get_all_capture_data` 均无法获得这类已持久化事件。
  4. domain 明确内部有 9 类，`capture_lifecycle` 只是不在 UI 标签展示（`domain.md:51-57`），不等于从导出/MCP 过滤。MCP spec 还声明“不自动过滤”（`mcp_server.md:80-85`），export spec 写“所有事件”（`export.md:7-10`）。
  5. **证伪检查：**`export.md:31-36` 又写“Promise.all 并行加载 7 类数据”，说明当前实现可能源自历史 UI 七标签设计；因此本 finding 的根因更准确是契约冲突/不可达数据面，而非断言所有格式必然违反明确 AC。置信度相应降至 82%。
- **Impact:**
  - lifecycle store 占用 schema 与写入成本，却无法从公开查询/归档恢复；采集开始配置快照、停止原因和最终统计等诊断证据只留在本地孤立 store。
  - “内部分类”“所有事件”“不自动过滤”与实际七源 API 不一致，调用方无法判断 lifecycle 是遗漏、元数据还是有意隐藏。
- **Recommendation:**
  - 先做契约决策：若 lifecycle 属完整采集证据，将其加入 `CaptureSnapshot`、export event 合并与 Agent source（建议 `capture_lifecycle_events`），仍可不在 UI 标签展示。
  - 若 lifecycle 只作内部实现细节，则在 domain/export/MCP spec 明确排除，评估是否只保留 CaptureRecord 字段并移除无消费者 query/store，避免双重真相源。
  - 无论选择哪条，增加 start→stop→export/get_all_data 行为测试，明确 lifecycle 可见性。
- **History / pre-existing:** lifecycle store 与 query 由 `c88c556`/`40d3b22`（2026-06-08）引入，读取面长期仅围绕 7 个 UI 类别。明确 pre-existing。

### ARCH-008 — fresh install 也创建 4 个 legacy stores，实际 schema 为 14 stores 而非文档 10 stores

- **Severity:** Low
- **Confidence:** 92%
- **Location:**
  - `src/extension/background/storage.ts:39-130`
  - `docs/archive/specs/storage.md:12-25,56-61`
  - 关联测试：`tests/unit/storage_helpers.test.ts:145-184`
- **Evidence / reproduction:**
  1. `onupgradeneeded` 无条件执行 `if (!contains) createObjectStore`，先创建 legacy `sessions/events/console_logs/error_log`（`storage.ts:42-63`），再创建当前 10 stores（`:65-130`）。在空数据库 `oldVersion=0` 时，四个 legacy store 当然“不存在”，所以 fresh install 也会创建，总数为 14。
  2. storage spec 将 Object Stores 定义为 10 个（`storage.md:12-25`）；升级策略只要求“v1 旧 stores 保留不迁移”（`:56-61`），并未要求新安装创建旧 schema。
  3. 全仓生产搜索没有旧 store 消费者；当前代码只通过新 `STORE_NAMES` 读写。现有测试验证 helper/常量，不断言 fresh DB 的完整 objectStoreNames，因此该偏差可长期存在。
- **Impact:**
  - 新用户永久携带 4 个不可达空 store，DevTools/诊断看到的 schema 与文档不一致；未来迁移逻辑无法仅凭 store 存在判断用户是否真来自 v1。
  - schema 测试缺少完整断言，后续 keyPath/index 漂移也较难发现。
- **Recommendation:**
  - 在 upgrade callback 使用 `event.oldVersion` 区分 fresh install 与真实 v1 升级：只保留数据库里已经存在的 legacy stores，不在 `oldVersion=0` 时创建它们。
  - 不要直接删除升级用户旧 store；删除需单独 migration、备份/恢复策略和版本升级。补两类 schema test：空库精确 10 stores；v1 fixture 升级后旧数据/store 保留。
- **History / pre-existing:** `c88c556`（2026-06-08 storage rewrite）引入；旧 review 已指出 legacy store 问题，但 active storage spec 仍保留“升级用户不迁移”策略。明确 pre-existing。

### ARCH-009 — extension UI 为使用通用日志 transport 反向依赖 background 模块

- **Severity:** Low
- **Confidence:** 88%
- **Location:**
  - UI 调用方：`src/extension/popup/popup.ts:14-19`、`src/extension/dashboard/dashboard_shared.ts:9-17`、`src/extension/devtools/devtools.ts:1-6`
  - 实现：`src/extension/background/app_log_storage.ts:1-6,17-60`
- **Evidence / reproduction:**
  1. Popup、Dashboard、DevTools 三个独立 extension context 都直接 import `../background/app_log_storage`，说明 `get_app_log_transport()` 实际是 extension-wide IndexedDB logging adapter，不是 background-only capture service。
  2. `app_log_storage.ts` 依赖 `storage.get_db()` 与 shared logger/types/config，本身没有 service worker 专属 API；模块路径只反映最初落点。
  3. 这不违反 blueprint 的产品级 `extension -> shared` 规则，也不是 TS cycle；问题是 extension 内层次命名错误，使 UI 依赖看起来指向 background 执行上下文。
- **Impact:**
  - background 目录无法被理解为 service worker 专属边界；UI 继续横向复用 background 实现会扩大隐式共享面。
  - 后续若 background storage 引入 SW-only 假设，Popup/DevTools 会在不同 context 中被连带破坏。
- **Recommendation:**
  - 将通用 transport 下沉到 `src/extension/shared/app_log_storage.ts`（或 `extension/storage/`），并通过明确的 extension DB adapter 获取连接；background 与三个 UI context 同向依赖。
  - 保持 `Logger` 接口在 `src/shared/logger.ts`，不要把 IndexedDB/Chrome context 逻辑推入跨产品 shared。
- **History / pre-existing:** 日志系统自 `6a7b094`（2026-06-09）即位于 background，UI 调用随后沿用。明确 pre-existing。

## Strengths

- `src/{extension,bridge,mcp,shared}` 产品边界总体清晰；静态 import graph 未发现 TypeScript cycle，仅发现一条明确跨产品违规边。
- `exporter.ts` 与 `agent_data_queries.ts` 已采用 `PAGE_SIZE=5000` 分页聚合，并有跨页测试，说明仓库已有可复用正确模式。
- `network_capture.ts` 已抽出 `cdp_event_router`、`stream_buffer`、`network_webrequest`、`cdp_handler` 等模块；问题是核心 dispatcher 尚未完成职责收敛，不是从零开始。
- Bridge 安全边界近期已有 `output_path`、origin binding、超时与结构化错误修复；相关测试覆盖丰富。
- repo task 工具链已从单体 `task.py` 模块化到 `repo_task/**`，并有 façade 体量门禁和大量流程测试；本轮未把兼容 façade 误报为架构问题。
- blueprint 明确记录依赖方向、存储语义、分页决策与领域分类，便于静态检测实现偏差。

## 已证伪或不报告项

- **`ws` external 与“产物不依赖 node_modules”矛盾：**源码及当前 artifacts 未发现 `from 'ws'`/`require('ws')`；MCP SDK WebSocket transport 使用 Node/browser 全局 `WebSocket`。仅凭 `--external:ws` 构建参数不足以证明运行时依赖，故不报告。
- **legacy stores 可直接删除：**storage spec 明确要求升级用户保留 v1 store，不应把兼容策略本身判为缺陷；本轮只报告 fresh install 也创建旧 store 与 schema 文档偏差。
- **`task.py` 薄 façade：**存在明确兼容职责及专门结构测试，不构成无价值抽象。
- **`capture_data_reader -> background/storage`：**blueprint 已记录 extension 页面可直连 IndexedDB；本轮不将其作为产品级依赖违规。问题是固定截断与模块命名边界。

## 未覆盖区域

- 未运行 `tsc`、lint、Vitest、pytest、构建或 E2E；按本轮只读审查约束保留给统一验证阶段。
- 未动态启动 Chrome、Bridge 或 MCP；无法验证 MV3 context 实际生命周期、浏览器 IndexedDB 升级事件和大采集运行时内存峰值。
- 未重建 `artifacts/**`；仅静态读取现有产物与源码，产物可能不对应当前 HEAD。
- Python/JS 工具链复杂度扫描为启发式，只用于定位后再人工阅读，不作为 finding 的唯一证据。
