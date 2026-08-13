# 性能与资源审查 — 全仓生产代码

- 审查视角：性能、内存、I/O、资源生命周期、构建体积
- Reviewed commit：`03254fb2a9cc5e96fd2998355facde4fbebcfe06`
- Branch：`main`
- Reviewed at：`2026-08-13 11:54 CST`
- 结论：**REQUEST CHANGES**
- Findings：Critical 0 / High 4 / Medium 3 / Low 3 / Info 1

## 审查范围

静态审查覆盖以下生产路径及关联上下文：

- `src/extension/`：IndexedDB 存储、Agent 查询与 Bridge client、Dashboard 详情/导出、归档构建、网络采集、日志存储、popup/content/devtools 生命周期路径。
- `src/bridge/`：HTTP Bridge、命令队列、多实例 registry、CDP session/event/body 预算。
- `src/mcp/`：Bridge client 超时策略、命令调用链。
- `src/shared/`：资源上限、协议、配置与归档共享逻辑。
- 构建入口：`package.json`、`vite.config.ts`，并只读观察现有 `artifacts/` 大小。
- 关联测试：Agent data queries、storage cursor 分页、exporter、Bridge client、CDP event/session bounds、app log trim 等单元测试。
- 需求与历史：`docs/specs_index.md` 当前生效 spec、性能相关 spec、`t140`/`t144`/`t153` 历史 task 与 review、关键行 `git blame` 和引入提交。

## High

### PERF-H001 — offset cursor 分页在全量聚合时形成二次复杂度

- Severity：High
- Confidence：95%
- 位置：
  - `src/extension/background/storage.ts:473-501`
  - `src/extension/background/agent_data_queries.ts:53-68`
  - `src/extension/background/exporter.ts:29-66`
  - `tests/unit/t140_resource_budget.test.ts:165-214`
- 调用链：`capture.export` / Agent 全量读取 → `fetch_all` / `get_all_*` 按 `offset += batch.length` 循环 → `query_by_store` 每页重新 `index.openCursor(IDBKeyRange.only(capture_id))` → 从首条开始逐条 `cursor.continue()` 跳过 offset。
- 可复现证据：
  1. `query_by_store` 每次调用重新打开 cursor；`skipped < offset` 时逐条 `continue()`，没有 continuation key，也没有保持同一 cursor/事务。
  2. PAGE_SIZE 为 5000。若单个 store 有 500,000 条记录，100 页 cursor 访问量约为 `5,000 × (1 + ... + 100) = 25,250,000`，而线性遍历只需约 500,000 次。
  3. 源码注释 `storage.ts:483` 已明确写出“每页 O(n)，分页即 O(n²)”。
  4. `t140_resource_budget` 只验证跨页不丢不重及源码没有 `getAll`；没有统计深页 cursor advance 次数或证明 keyset 行为。
- 影响：大 capture 导出、Agent 全量数据读取会产生显著 IndexedDB 主线程调度和 structured-clone 开销；七个 store 并行读取时延和 CPU 竞争叠加。该实现降低单页内存峰值，但将完整遍历从近 O(N) 退化为约 O(N² / PAGE_SIZE)。
- 修复建议：
  - 首选 keyset pagination：增加 `[capture_id, event_id]` 或 `[capture_id, relative_time_ms, event_id]` 复合索引，查询返回 opaque continuation token/last key，下一页以 `IDBKeyRange.lowerBound(last_key, true)` 开始。
  - 对导出和 `get_all_data` 提供单事务、单 cursor walk 的 async iterator/page consumer，禁止循环调用 offset API。
  - 若必须保留 offset 契约，可用 `cursor.advance(offset)` 降低 JS 回调次数，但全量聚合仍不得逐页从头启动；外部深分页应迁移 continuation token。
  - 新增资源测试：instrument cursor success/advance 次数，断言读取 N 条记录为 O(N)，而非只断言“不调用 getAll”。
- History / pre-existing：offset API 更早已存在；`51e0843c`（2026-08-12，`perf(t140): 大数据量路径资源预算与 cursor 分页`）将实现改为当前从头 cursor 跳过 offset；全量 offset 循环来自 `42236c2f`（2026-07-19）。属于当前 HEAD 已存在、近期性能修复组合出的退化，不是本审查产生的新改动。
- High 证伪检查：检查过 `t140` 测试、storage 索引和聚合调用方；没有持久 cursor、continuation key、复合索引或 cursor-cost 断言。`getAll` 被移除只能证明峰值改善，不能否定二次扫描。

### PERF-H002 — Agent 分页和单条查询均先加载七个数据源全量

- Severity：High
- Confidence：94%
- 位置：
  - `src/extension/background/agent_command_dispatcher.ts:55-87`
  - `src/extension/background/agent_data_queries.ts:71-99`
  - `src/extension/background/agent_data_queries.ts:101-150`
  - `src/extension/background/agent_data_queries.ts:164-165`
  - `src/extension/background/agent_bridge_client.ts:321-345`
  - `tests/unit/agent_data_queries.test.ts:351-402,509-572`
  - `tests/unit/t140_resource_budget.test.ts:93-141`
- 调用链：MCP `sources.list` / `data.list` / `data.get` / `timeline.list` / `timeline.get` → Bridge command → extension `dispatch_agent_command` → `load_agent_capture_data` → 七源 `Promise.all(fetch_all(...))` → 返回后才执行 filter/sort/slice/find/summary。
- 可复现证据：
  1. `data.list` 即使 `limit=1`，仍先读取 capture 的七个 store 全量；`data.get` 已携带唯一 `record_id`，仍执行相同全量读取后 `.find()`。
  2. `sources.list` 为获得 count/range 先读取 value/body，并在 summary 中复制排序；`timeline.list` 先 `flatMap` 所选源，再全量 filter/sort，最后才 slice。
  3. `agent_data_queries.test.ts` 明确把“loads all 7 data sources”作为当前行为，并只用 mock 数组验证 5000 跨页功能；没有 IndexedDB predicate/order/limit pushdown 测试。
  4. 64 MiB 结果保护位于 `send_result`：dispatch 已完成、全量对象已驻留后才 `JSON.stringify`，再用 `TextEncoder` 复制编码检查。保护只能避免 Bridge 接收超限 body，不能保护 MV3 service worker 内存和查询成本。
  5. 该路径还叠加 PERF-H001 offset 重扫。
- 影响：本应为 O(limit) 或 O(log N) 的分页/点查，退化为读取最多 500 MB capture 的全部七源、创建多个数组并排序；可能触发 service worker 长任务、内存压力或 eviction，最终仍只返回极少记录。返回体超过 64 MiB 时，系统在支付全部读取、序列化和编码成本后才改写成错误结果。
- 修复建议：
  - 将 Agent storage API 拆为 source-specific `count/range/order/keyset page/get-by-id`；filter、time range、order、limit 尽量推入 IndexedDB cursor/index。
  - `data.get` / `timeline.get` 用 store primary key 或 `[capture_id, native_id]` 复合索引点查。
  - `sources.list` 用 `count()`、边界 cursor 或维护在 `CaptureRecord.stats` 的计数，不读取 body/value。
  - `timeline.list` 对各源有序 cursor 做 k-way merge，只保留当前 page；返回 continuation token。
  - 仅 `capture.get_all_data` / export 允许遍历全量，并改为流式/分页交付，避免巨大单个 command result。
  - 增加测试：`limit=1` 时断言 storage 读取量受限；点查断言不会调用其他六源；体积预算在 materialize 前生效。
- History / pre-existing：七源全量加载结构来自 `c3e82f6d` / `c76d228f`（2026-06）；无限分页聚合由 `42236c2f`（2026-07-19）替代 100000 截断。属于长期预存架构问题。
- High 证伪检查：核对 dispatcher 全部分支、query helper、64 MiB guard 和关联测试；API 的 `limit <= 100000` 只限制最终 slice，不限制 storage 读取量。未发现任何 query pushdown 或点查 fast path。

### PERF-H003 — Dashboard 活跃详情每 2 秒无条件重读并复制完整快照

- Severity：High
- Confidence：90%
- 位置：
  - `src/extension/dashboard/dashboard.ts:118-152`
  - `src/extension/dashboard/dashboard_shared.ts:241-303`
  - `src/extension/shared/capture_data_reader.ts:24-35`
  - `src/shared/constants.ts:20-21`
- 调用链：Dashboard 2 秒 interval → `load_captures` → 当前页面为 capturing detail 时 → 先计算旧 signature → 无条件 `load_detail` → `read_capture_snapshot` 并行读取七类完整数组 → `merge_detail_events` map/copy/sort → 再计算新 signature → 只有 signature 不同时才 render。
- 可复现证据：
  1. `dashboard.ts:141` 在比较新旧 signature 前调用 `load_detail`，因此“无变化不重渲染”没有避免 IndexedDB 全量读取和数组重建。
  2. `read_capture_snapshot` 每轮对七类分别请求 `limit=100000`，materialize 所有返回记录。
  3. `merge_detail_events` spread 复制五类数组，为 network/console 再创建包装事件并整体 sort；状态同时保存 merged events、network 数组和 console 数组。
  4. 合法 capture 资源上限为 500 MB、24 小时（`src/shared/constants.ts:20-21`）。在该边界下，2 秒周期全读足以持续占用 Dashboard 主线程和 IndexedDB。
  5. `poll_in_flight` 只防止重叠；若一次读取超过 2 秒，会跳过并发轮次，但每次完成后仍继续执行下一次完整读取。
- 影响：打开进行中 capture 详情后，即使没有新事件，Dashboard 仍持续产生全库 I/O、structured clone、数组分配和 O(N log N) sort；大 capture 会造成卡顿、GC 抖动、电量消耗，并与 background 持续写入争用 IndexedDB。
- 修复建议：
  - 在 `CaptureRecord` 维护轻量 `detail_version`/last sequence；轮询先只读 metadata，版本变化才取数据。
  - 更优方案：service worker 推送状态和增量事件；Dashboard 按 last key/time keyset 拉增量并 append。
  - 将 network/console 和统一 timeline 索引增量维护，避免每轮重新 map/sort 全量。
  - 大列表结合分页/虚拟化；Dashboard 离开详情或页面 hidden 时暂停轮询。
  - 添加无变化测试：连续两个 poll 只允许 metadata query，禁止调用 `read_capture_snapshot`；添加 100k+ fixture 的读取量/耗时基准。
- History / pre-existing：基础 2 秒轮询自 2026-06 已存在；`17cde0df`（2026-08-12，t144）引入当前 detail signature 分支，但 guard 放在完整重读之后。属于近期增强未消除的预存问题。
- High 证伪检查：核对 `poll_in_flight`、signature、stats 比较和 render guard；这些机制分别防重叠或避免 DOM 重渲染，均不在 snapshot 读取前短路，不能否定 finding。

### PERF-H004 — Dashboard 详情/归档固定截断 100000 条且全量渲染、全量组装

- Severity：High
- Confidence：91%
- 位置：
  - `src/extension/shared/capture_data_reader.ts:24-35`
  - `src/extension/dashboard/dashboard_detail.ts:147-197,241-297,329-347,389-418,486-496`
  - `src/extension/dashboard/dashboard_shared.ts:310-343`
  - `src/extension/shared/archive_builder.ts:235-307,311-369,410-455`
  - `docs/archive/tasks/t153_perf_spot_fixes/spec.md:31-38`
  - `docs/archive/tasks/t153_perf_spot_fixes/review_general.md:39-50`
- 调用链：详情或 ZIP 导出 → `read_capture_snapshot` 每类最多 100000 → 详情 merge/sort 后 `.map().join('')` 构建全部 DOM 字符串，或 archive `prepare_archive_content` 复制/enrich/map 为 JSONL string arrays → `resolve_body_paths` 再 parse/stringify network lines → `assemble_zip` 再 join 为大字符串、转 `Uint8Array`、构建完整 files map 和最终 ZIP。
- 可复现证据：
  1. 每类读取硬编码 `100000`，没有“还有下一页”标记。合法 24 小时 capture 中，50 ms 采样事件理论上可达 1,728,000 条；因此详情和 Dashboard ZIP 会静默漏掉第 100001 条之后记录。
  2. list view 对过滤结果全量 `.map().join('')`；trace 对七条 lane 分别 filter 并为每个事件创建 DOM mark；network、console、simple tables 同样全量生成 HTML。
  3. 搜索输入 200 ms debounce 后调用整页 `render_content`，再次全量 filter、string build、`innerHTML` 替换和 listener wiring。
  4. t153 历史 task AC-004 明确要求“大列表不卡死（分页或懒渲染）”；实现只用 `idx_map` 消除 `indexOf` 二次复杂度，没有分页或懒渲染。该 task review 将 AC 判为通过，但代码仍是全量 DOM。该 archive task 不是 `docs/specs_index.md` 当前生效 spec，本文只将其作为明确历史验收意图和漏检证据。
  5. ZIP 改用 fflate async callback 解决同步阻塞，但输入 snapshot、enriched arrays、JSONL strings、body byte arrays、files map 和输出 ZIP 会在构建期同时存在；异步压缩不等于流式低内存。
- 影响：数据量较大时详情首屏、筛选、切 tab 和搜索可能冻结或崩溃；归档在接近 500 MB capture 时产生多份驻留数据和高峰内存。同时固定 100000 上限使 Dashboard 展示和 ZIP 归档不完整，用户无法从 UI 识别截断。
- 修复建议：
  - 统一使用 keyset async iterator；详情按页读取，列表采用 windowed/virtual rendering，只为可视窗口创建 DOM。
  - timeline 轨道做层级聚合/downsampling；缩放到局部范围后才 materialize 细粒度 marks。
  - 搜索使用索引或 worker 增量处理，避免每次整页重建。
  - ZIP 使用 fflate streaming `Zip` API；JSONL 逐页编码并 push，body 文件按迭代器加入，避免保留 snapshot + mapped arrays + strings + bytes + output 全部副本。
  - 删除静默 100000 截断；若短期必须设预算，返回明确 `truncated/next_cursor` 并禁止标为完整 archive。
  - 补充超过 100000 条的完整性测试、DOM 节点数预算测试和大 capture peak-memory benchmark。
- History / pre-existing：`read_capture_snapshot` 固定上限来自 `08b9d130`（2026-06-13）；全量 UI 渲染自 2026-06 延续；`37cd9f11`（2026-08-13，t153）仅修复 `indexOf` O(N²) 和同步 zip，未实现 AC-004 中分页/懒渲染。属于预存且在近期性能验收中漏过的问题。
- High 证伪检查：检查了异步 zip、idx map、scroll 容器和搜索 debounce；异步 zip 只让出事件循环，CSS scroll 不减少 DOM 节点，debounce 不限制单次工作量，均不能否定峰值和截断。

## Medium

### PERF-M005 — Extension Bridge fetch 无 timeout，stop 无法取消 in-flight 请求

- Severity：Medium
- Confidence：93%
- 位置：
  - `src/extension/background/agent_bridge_client.ts:60-89,102-188,246-349`
  - `tests/unit/agent_bridge_client.test.ts:473-490`
  - 对照：`src/mcp/client.ts:7-15,20-34,60-70`
  - Bridge TTL：`src/bridge/server.ts:42,71-73,126-154,450-454`
- 调用链：poll → enroll / heartbeat / fetch command / send result → 原生 `fetch` 无 `signal` → 任一请求永久 pending → `poll_cycle` 不返回，后续 timer 不再安排；`stop_bridge_client` 只清已安排 timer和 lifecycle 标志，不能 abort 当前 fetch。
- 可复现证据：测试 `does not continue an in-flight poll after stop` 使用 deferred heartbeat；stop 后请求仍需测试主动 `heartbeat.resolve(...)` 才结束，证明 stop 没有取消底层请求。若 deferred 永不 resolve，client 永久停在该 await。MCP 侧同类 client 已使用 `AbortSignal.timeout`，此路径不一致。
- 影响：loopback Bridge 异常、连接半开或响应未结束时，扩展停止 heartbeat；5 秒后 Bridge 标记 extension offline。命令队列可在 120/300 秒超时，但 extension poll 本身可能永不恢复；停用/restart client 也保留底层 socket/request 直至浏览器网络栈自行结束。
- 修复建议：为每个 lifecycle 建 `AbortController`，stop 时 `abort()`；enroll/heartbeat/command fetch 使用短 timeout（heartbeat 必须与 5 秒 TTL 协调），result 使用 command/full-data budget；组合 `AbortSignal.any([lifecycle.signal, AbortSignal.timeout(ms)])`。增加 timeout、stop-abort、restart 后无 stale request 的测试。
- History / pre-existing：核心 fetch 自 `f0763c03`（2026-06-06）存在；多实例和重试后仍未加 signal。长期预存。

### PERF-M006 — Bridge 多实例 registry 和 queue 不清理过期实例

- Severity：Medium
- Confidence：91%
- 位置：
  - `src/bridge/server.ts:52-73`
  - `src/bridge/server.ts:126-154`
  - `src/bridge/server.ts:332-341,429-439`
  - `src/bridge/server.ts:599-602`
- 调用链：enroll/heartbeat → `instances.set` + `get_or_create_queue` → TTL 仅用于 `filter` online → offline instance 仍留在 `instances`、`queues`，status 每次遍历全部历史实例；除 label 顶替路径外无 delete/sweep。
- 可复现证据：创建多个不同 `instance_id` 并让 `seen_at` 超过 5 秒，`list_online` 会过滤它们，但 Map 长度不变，`build_status` 仍把全部实例映射进 `extensions`。server `close` 也只关闭监听器，没有显式 cancel queue；运行期没有 TTL 回收路径。
- 影响：扩展重装、session storage 清理、配置损坏或多浏览器轮换会产生新 ID；长期运行 Bridge 的 registry、queue 和 status payload 随历史实例单调增长。正常单实例 ID 持久化时增长较慢，因此定为 Medium 而非 High。
- 修复建议：增加过期 sweep：超过 TTL + grace 后 `cancel_all()`、删除 queue/instance、清理该 owner 的 `command_owners`。可在 enroll/heartbeat/status 懒清理，或使用 interval 并在 `close()` 清 timer；短 grace 内可保留离线展示，长期历史应单独持久化摘要而非保留运行时 queue。
- History / pre-existing：多实例 registry 由 `659c7945`（2026-07-16）引入；后续只在 label 顶替时清理。预存。

### PERF-M007 — CDP body 预算在轮询移除事件后不减量，预算退化为累计写入量

- Severity：Medium
- Confidence：92%
- 位置：
  - `src/bridge/cdp_handler.ts:63-89`
  - `src/bridge/cdp_handler.ts:375-392`
  - `src/bridge/cdp_handler.ts:419-465`
  - `tests/unit/t140_resource_budget.test.ts:37-71`
- 调用链：CDP body 回写 → `session.body_bytes += stored bytes` → poll 将 completed event 从 `session.events` 移除并返回 → 未扣除返回事件 body bytes → 后续新 body 再累加 stale total → `enforce_body_budget` 基于累计历史值淘汰当前队列事件。
- 可复现证据：构造两条带 body completed events，先令 `body_bytes` 等于两者总和，调用 `handle_cdp_events` 返回并移除它们；代码只执行 `session.events = pending.concat(remaining_completed)`，没有减少 `body_bytes`。下一批事件到达后预算仍包含已交付、已不可达的 body。现有测试直接手工调用 `enforce_body_budget`，没有覆盖 poll 后记账。
- 影响：持续 CDP 会话即使消费者及时把队列拉空，也会永久处于高 `body_bytes`；后续新事件可能被错误淘汰，预算不再表达当前驻留内存。`handle_cdp_events` 还每次扫描最多 5000 events，创建 completed/pending/slice/concat 多个数组，形成持续 O(N) 分配。
- 修复建议：移除 `to_return` 时按实际存储 `response_body` UTF-8 字节扣减，统一封装 `remove_events` 以保证 event-count 和 body-byte 两套记账同步；增加“poll 后 body_bytes 回到 0”和“后续事件不误淘汰”测试。进一步将 pending/completed 分队列或使用 deque/ring buffer，避免每 poll 重建全部数组。
- History / pre-existing：poll 移除逻辑自 `c4e98514`（2026-06）存在；body 聚合预算由 `51e0843c`（2026-08-12，t140）加入时未同步修改移除路径。属于近期资源预算实现缺口。

## Low

### PERF-L008 — app log 配置上限实际允许接近 2 倍峰值

- Severity：Low
- Confidence：100%
- 位置：
  - `src/extension/background/app_log_storage.ts:214-229`
  - `docs/archive/tasks/t153_perf_spot_fixes/review_general.md:12-18`
- 调用链：flush 累加 `_estimated_bytes` → 达 max 才全表 scan/trim → scan 后 `_estimated_bytes = 0`，但 DB 仍保留接近 max 的日志 → 再写接近 max 才触发下一次 trim。
- 可复现证据：默认 max 100 MB；一次 trim 后 DB 约 100 MB、estimate 为 0；再写约 100 MB 前早退条件持续成立，实际峰值接近 200 MB。t153 reviewer 已明确记录相同问题。
- 影响：`log_max_size_mb` 表现为约 2×软上限，增加磁盘使用和后续日志查询/导出峰值；有界且会自愈，所以为 Low。
- 修复建议：scan/trim 后将 estimate 设置为 retained bytes，而不是 0；或持续维护近似总量并在删除时减量。新增断言：实际总量不能超过 max + 单批 buffer 容差。
- History / pre-existing：`37cd9f11`（2026-08-13，t153）引入增量 estimate 行为；已被该 task review 识别但未修。已知预存 finding，本文不冒充新发现。

### PERF-L009 — Agent `captures.list` 全量读取并二次排序后才 slice

- Severity：Low
- Confidence：88%
- 位置：
  - `src/extension/background/agent_command_dispatcher.ts:133-145`
  - `src/extension/background/storage.ts:162-183`
- 调用链：Agent `captures.list(offset, limit, order)` → `storage_list_captures()` 不传 limit，按 `started_at` 已倒序全量 materialize → dispatcher clone + `Date` parse + sort → slice。
- 可复现证据：请求 `limit=1` 仍读全部 capture metadata；storage 已有 `started_at` 索引和方向 cursor，却未复用 order/limit，也无法 push offset。
- 影响：capture 数量通常远小于事件数量，当前风险较低；长期积累大量 capture 时增加启动/列表延迟和临时数组。
- 修复建议：storage 接受 `order/limit/continuation`，分别使用 `next`/`prev` cursor；total 如契约必须提供，可使用 `count()`，避免读取全部 record。增加 `limit=1` cursor 访问量测试。
- History / pre-existing：dispatcher 全量排序自 2026-06 存在；t153 修复的是 popup 独立列表路径，不覆盖 Agent MCP dispatcher。预存。

### PERF-L010 — app log 导出固定全量 100000 条并构建单个巨型字符串

- Severity：Low
- Confidence：87%
- 位置：`src/extension/background/exporter.ts:448-464`
- 调用链：日志导出 → flush → `get_entries(100000, 0, filters)` 全量 materialize → map 为第二个 string array → `join('\n')` 生成完整输出字符串 → 调用方再构建 Blob/下载。
- 可复现证据：硬编码 100000 无分页和 truncated 标记；每条 `details` 还执行 `JSON.stringify`。日志存储配置默认可接近 200 MB 实际峰值（PERF-L008），导出期间可同时持有 entry objects、line strings 和 joined string。
- 影响：大日志导出可能造成 Dashboard/SW 内存峰值，并静默遗漏第 100001 条之后日志。该路径非核心 capture 数据，定为 Low。
- 修复建议：按 timestamp keyset 流式读取和编码，分块构建 Blob/文件；或至少分页并返回显式 truncated/next cursor。添加超过 100000 条完整性和 peak-memory 测试。
- History / pre-existing：导出实现自 2026-06 存在。预存。

## Info

### PERF-I011 — 构建流程没有 bundle size 预算或差异门禁

- Severity：Info
- Confidence：85%
- 位置：
  - `vite.config.ts:15-26`
  - `package.json:22-39`
- 调用链：`npm run build` → Vite extension + esbuild Bridge/MCP + zip；配置没有 bundle analyzer、size budget、artifact diff 或 CI threshold。
- 可复现证据：现有脚本只生成产物，不检查入口/压缩包大小。只读观察当前工作区产物：`artifacts/dist` 约 472 KB、`artifacts/extension.zip` 约 784 KB、`artifacts/bridge/bridge.mjs` 约 56 KB、`artifacts/mcp/mcp.mjs` 约 1.1 MB。
- 影响：当前观测体积不构成明确性能缺陷，尤其 MCP 单文件包含 SDK 依赖具合理来源；风险在于后续依赖或入口膨胀不会触发 review/CI。
- 修复建议：记录各入口 gzip/brotli/raw size，CI 对 extension zip、service worker、content script、dashboard 和 MCP 设置基线差异阈值；MCP/Bridge 可生成 esbuild metafile 供依赖归因。门禁应允许显式审批更新基线，不以当前绝对大小直接判失败。
- History / pre-existing：当前构建配置长期未设预算。现有 `artifacts/` 未验证是否由 reviewed HEAD 构建，因此大小仅作观察，不作为代码缺陷硬证据。

## Strengths

- 资源上限已有系统化基础：capture 500 MB/24h、Bridge JSON/result body、CDP event count/body、network body 等路径均设置明确 cap。
- `t140` 已把 IndexedDB `getAll` 改为 cursor，降低单次查询内存峰值；问题集中在 continuation 语义，不是完全无界读取原语。
- Dashboard/popup poll 已有单飞保护，多数 timer/listener/session stop 路径会清理；检查过 network deferred/orphan timers、content listener、body polling、stream timer，未发现普遍性泄漏。
- CDP session 使用 idle TTL，`destroy_session` 会关闭 WebSocket 并清 timer；event-count eviction 和 body-budget eviction 有结构化日志与测试钩子。
- Archive 已从同步 `zipSync` 改为异步 `zip`，减少长压缩阶段完全阻塞 UI；system-time formatter cache、timeline index map、network hook capped stream、popup list limit 等近期点优化方向正确。
- Extension result 有 64 MiB 拒绝策略，MCP Bridge client 有与 command budget 对齐的 fetch timeout；说明项目已有资源预算意识，可复用到更早的 query/materialization 和 extension poll 阶段。
- 多数高风险 listener、Map、timer 位点经调用方和 stop 路径核查后被证伪，没有为“存在 Map/setInterval”本身泛报泄漏。

## 已检查需求、测试与历史

- 已核对 `docs/specs_index.md` 当前生效清单，以及性能相关 `dashboard_export_flush_save_as.md`、`agent_result_lifecycle_delivery.md`、`bridge_cdp_idle_and_bounds.md`。
- 已核对 `t140` 资源预算/cursor 分页测试、Agent query 测试、Bridge client lifecycle 测试、CDP session/event tests、app log trim tests。
- 已核对关键历史：
  - `37cd9f11`：t153 性能点修复。
  - `51e0843c`：t140 大数据资源预算与 cursor 分页。
  - `17cde0df`：t144 timeline 合并及 detail 增量渲染。
  - `42236c2f`：export/Agent pagination 替代 100000 截断。
  - `08b9d130`：页面侧 IndexedDB snapshot，规避 sendMessage 64 MB。
  - `659c7945`：Bridge 多实例 registry。
  - `f0763c03`：Extension Agent Bridge fetch 初始实现。
- 所有 finding 均标注 pre-existing/history；本文是全仓审查，不把“不是本次 diff 引入”作为过滤条件。

## 未覆盖区域与验证限制

- 按上游约束未运行全量 tests、typecheck、build、Playwright 或真实 Chrome profile；本文为静态代码、测试与 git history 审查。
- 未执行真实 100k/500k record IndexedDB benchmark、Chrome DevTools heap snapshot、CPU profile、GC/energy 测试；复杂度和峰值结论来自明确循环、allocation 与上限组合。
- 未验证现有 `artifacts/` 是否由 reviewed HEAD 构建；体积只作只读观察，未据此声称当前 bundle 过大。
- 未对第三方依赖内部实现做全面性能审查；重点检查项目自身调用方式和生命周期。
- 未覆盖运行环境差异（不同 Chrome IndexedDB 调度、设备内存、磁盘速度、Windows/WSL loopback 网络栈）。
- 外部辅助模型调用超时或未返回可用独立 finding，未作为证据来源。
