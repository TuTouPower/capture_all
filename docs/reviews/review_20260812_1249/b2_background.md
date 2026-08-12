# B2 采集引擎（Service Worker 侧）穷尽式审查报告

**范围**：`src/extension/background/` 20 个 .ts（6457 行）+ `src/shared/` 契约层 9 个文件。覆盖 P1–P7。

## Critical
### C1. HTML 导出嵌入 JSON 转义不完整，含 `'` 或控制符转义即整页损坏 — confidence 95
- **文件**：`src/extension/background/exporter.ts` L156-157、L221；`src/shared/escape.ts` L4-10
- `escape_for_html_embed` 只转义 `</script>`/`<`/`>`/`&`，未转义 `'`（JS 字符串定界符）与控制符（`\n`/`\t`）。产物 `const data = JSON.parse('${safe_json}')`：捕获数据含 `'`（`"it's"`）截断字面量；含换行/制表（错误堆栈、console 多行、请求体必有）时 `\n` 被 JS 解析为真实换行，`JSON.parse` 抛 SyntaxError。node 实测两场景均 PARSE FAIL。
- 非 XSS（`<` 已转义）但导出功能实质性损坏。
- 测试盲区：`tests/unit/exporter.test.ts` L175-183 只断言 `toContain('const data = JSON.parse')`，从不回灌验证。git blame：`5f6a900 fix: esc() 转义单引号 (P2 #20)` 声称转义单引号但 `escape_for_html_embed` 路径漏掉。**预存**。
- 修复：嵌入 `JSON.parse` 前对 JSON 文本做 JS 字符串字面量安全转义（`'`→`\\'`、`\`→`\\\\`、控制符→`\u00XX`），或改 `JSON.parse(decodeURIComponent('...'))` + `encodeURIComponent` 全量转义；补含撇号+多行数据回灌测试。
### C2. 单条 body / 会话上限被 agent 配置绕过 — confidence 70
- **文件**：`src/extension/background/agent_command_dispatcher.ts` L275-281、L246-264
- `get_capture_config` 对 `max_body_capture_bytes`/`inline_text_max_bytes` 只校验非负整数，无上限。agent 下发 `1e15` 后 CDP/stream/hook 截断形同虚设，SSE 长流可无界累积，内存与 IndexedDB 双爆。
- 修复：`max_body_capture_bytes` 封顶 `MAX_BODY_CAPTURE_BYTES`(100MB)，`inline_text_max_bytes` 封顶 `INLINE_TEXT_MAX_BYTES`。

## High
### H1. 全量采集数据整载入内存，`data.get` 单条查询也整载 — confidence 90
- **文件**：`agent_data_queries.ts` L55-98；`storage.ts` L441-457
- `load_agent_capture_data` 对 7 source 全 `fetch_all`（每页 5000）整载全部记录与 body；`data.list`/`data.get`/`timeline.*`/`capture.get_all_data` 全先整载。500MB capture 内存放大数倍，OOM 风险。`query_by_store` 用 `index.getAll` 再 slice，每页 O(n)，`fetch_all` 分页 = O(n²)。
- 修复：IDB cursor 直接分页；`data.get` 用主键直查。
### H2. 扩展侧无 64 MiB 结果上限，export/get_all_data 必被 bridge 413 拒收 — confidence 85
- **文件**：`agent_bridge_client.ts` L298-318、L320-332
- `MAX_EXTENSION_RESULT_BODY_BYTES=64MiB` 只在 bridge server 侧（server.ts L43）强制，扩展侧从不预检。`send_result` 超限后 413 → `send_result_with_retry` 判定 4xx 非 429 直接放弃（L312）。命令已执行但调用方永远超时，SW 白费构建超大 JSON。`PAYLOAD_TOO_LARGE` 扩展侧从未产生。
- 修复：`dispatch_agent_command` 出口体积预算，超限返回 `PAYLOAD_TOO_LARGE`；分页按 body 体积动态收缩。
### H3. body 采集切 tab 时强拆 console 的 debugger 会话，console 静默死亡 — confidence 75
- **文件**：`network_capture.ts` L183-190；`service_worker.ts` L1048-1060
- `enable_response_body_capture(newTab, already_attached=false)`：`dbg_tab_id !== null` 时先 `detach(dbg_tab_id)` 再 attach 新 tab。onActivated 用 `activeInfo.tabId` 重跑 body capture，`already_attached=false`，把 console 独占 attach 的旧 tab 强拆。console_capture 仍自认 attached（is_capturing=true、listener 未摘），CDP 事件不再到达，之后 console/error 静默丢数据，stop 时 detach 旧 tab 报错被吞。
- 修复：换目标前先通知 console/exception 摘 listener，或统一仲裁单 attach 目标整体迁移。
### H4. SW 重启后 500MB 存储限额失效（bytes_written 纯内存态）— confidence 85
- **文件**：`storage.ts` L259、L409-435；`service_worker.ts` L889-897
- `bytes_written` Map 只存内存，重启清零。`check_storage_limit`/`check_limit_and_stop` 重启后恒 false，24h 内超 500MB 不触发停止，持续膨胀到 IndexedDB 配额错误（flush 失败回填 buffer 无限重试）。
- 修复：限额持久化计数（随 stats 持久化），重启后重建。
### H5. SW 重启只"终态化"不"恢复"，跨 SW 重启采集被截断 — confidence 80
- **文件**：`service_worker.ts` L131-184
- 约束要求"长时操作必须能在 SW 重启后恢复（capture_state 持久化键）"。但 `cleanup_stale_capture_state` 仅标 completed 清键，从不重建 is_capturing/current_capture/子系统。浏览器重启/SW 被回收后活跃采集被静默终止。测试只覆盖终态化分支。
- 修复：真恢复（重建 is_capturing + 重启 subsystem + 保留 generation）或明示「重启即终止」并保证 events 已落库不丢。
### H6. ws_frame 相对时间用 CDP monotonic 秒×1000 减 epoch 起点，产出巨型负数 — confidence 65
- **文件**：`network_capture.ts` L340
- `relative_time_ms: (params?.timestamp ? params.timestamp*1000 : Date.now()) - start_time`。CDP `Network.webSocketFrameSent/Received.timestamp` 是 MonotonicTime（任意起点），减 epoch 起点得到约 -1.7e12 负数。走 ws 分支不经过 `>1e10` 守卫（L807），负数直接落库，timeline 排序全错。
- 修复：`Date.now()-start_time` 或 CDP walltime；补 ws_frame 相对时间测试。**预存**（t119 重构前遗留）。
### H7. stop 中途抛错 → `phase=idle` 而 `is_capturing=true`，卡死态无法 start — confidence 55
- **文件**：`service_worker.ts` L646-665
- stop catch 调 `stop_handle.commit()` 置 phase=idle，但 `stop_capture_inner` 若在翻 `is_capturing=false` 之前抛错，`is_capturing` 保持 true。start 被 `is_capturing || phase!=='idle'` 拒绝（L359）。靠重试自愈但期间状态不一致。
- 修复：catch 内显式 `is_capturing=false` 并复位全部模块级变量。

## Medium
- **M1** console 对象参数渲染 "[object Object]"（值优先于 description）— `console_capture.ts` L136-137。修复：`typeof value==='object' ? description : (value ?? '')`。
- **M2** fallback body 事件同毫秒 event_id 冲突覆盖 — `service_worker.ts` L855-856（`fallback_${Date.now().toString(36)}` 同毫秒同 id，store.put 覆盖丢一条）。加随机后缀。
- **M3** `handle_cdp_body_event` fire-and-forget 调 async 无 catch — `service_worker.ts` L833-843。加 `.catch(logger.error)`。
- **M4** `onActivated` 中 `chrome.tabs.get` 无 try/catch — `service_worker.ts` L983。tab 激活与 get 之间被关则 rejection 未处理。
- **M5** `handle_test_bridge_fetch` 用未规范化原始 URL 直 fetch — `service_worker.ts` L309-319。不经过 normalize 的 loopback 白名单，storage 被写手工 URL 时从 SW 发请求。改走 normalize。
- **M6** `start` 对全部 tab 串行 sendMessage 重试，多 tab 阻塞 start 超 30s — `service_worker.ts` L610-623。最坏 50×(200+400+600)ms≈60s 包在 run_exclusive 内。改 Promise.all 并行。
- **M7** `network_context.ts` 死代码 — 仅测试引用，生产路径用模块级变量，类型与 cdp_handler 重复。P5 死代码，建议删除。
- **M8** network store 混存 ws_frame（CaptureEvent）与 NetworkRequestData — `storage.ts` L242-252、`agent_data_queries.ts` L243-244。`get_record_type` 读 ws_frame 的 resource_type undefined。建议 ws_frame 独立 store 或查询层按 type 区分。
- **M9** flush 失败无退避无限重试，buffer 无界增长 — `storage.ts` L340-350、L374-396。加失败计数与丢弃策略。
- **M10** agent 结果投递 4xx/413 直接放弃 — `agent_bridge_client.ts` L312-313。至少 413 应降级重投。
- **M11** `get_capture_config` 允许注入超大 `sample_rate_ms` 等合法但不合理组合 — `agent_command_dispatcher.ts` L266-286。clamp。
- **M12** 多个过期闭包缺 generation 守卫 — `service_worker.ts` L1102-1176（onUpdated/onCreated）、L787-825（handle_event）。stop+start 跨 await 时旧 tab 事件以新采集身份落库。onActivated 已示范守卫，其余未跟进。
- **M13** `get_native_record_id` fallback 碰撞 — `agent_data_queries.ts` L232-236（`${sort_key}:${abs}` 同时间两条同 id）。加序号。
- **M14** 空 catch/静默吞错面广 — `network_capture.ts` L154/L156/L373/L506/L644、`body_capture_coordinator.ts` L249-251/L272-274、`external_cdp_bridge_client.ts` L106/L172/L192。CDP 失败应打 warn。
- **M15** 内部错误细节回传用户/agent — `console_capture.ts` L64、`exception_capture.ts` L61、`agent_command_dispatcher.ts` L297-301。`error: Failed to attach debugger: ${error}`、`to_agent_error` 原样外泄。改结构化错误码 + 脱敏。
- **M16** keepalive handler 空操作，只靠 alarm 唤醒 — `keepalive.ts` L12-16。仅 logger.debug，不执行 keepalive 业务。建议 handler 内执行真实工作延长存活。
- **M17** FLUSH_BATCH_SIZE=100 死常量，批次语义未实现 — `constants.ts` L27、`storage.ts` L271-291。write_events 每次立即 flush，无人引用。修规范或真用批次。
- **M18** `app_log_storage.flush` 每次全量 cursor 扫描估字节 — `app_log_storage.ts` L200-232、L180-198。每 100ms O(n) 全扫描。维护增量计数或抽样。
- **M19** bridge URL 校验两处口径不一致 — `agent_bridge_config.ts` L73-83（仅 http+localhost+必须端口）vs `external_cdp_bridge_client.ts` L14-39（允许 https+[::1]+禁 path/cred）。统一抽一处。
- **M20** `MessageLogTransport.flush` 自旋 50ms 循环 — `logger.ts` L170-175。sendMessage 失败静默丢批可能无限自旋。加轮次上限。

## Low / Info
- **L1** `exporter.ts` L167-169 `total_size_kb=(event+req+log)*0.5` 纯虚构估算。— 85
- **L2** `service_worker.ts` L101-112+L122-126：onInstalled 与顶层 setTimeout 双入口都可能启动 bridge（running 幂等兜底无害）。— 70
- **L3** `capture_state.ts` L41-52：run_exclusive 若 fn 永不 resolve 永久占锁，无超时兜底。— 50
- **L4** `cookie_capture.ts` L53-63：map_cause 在 removed=false 无条件返回 explicit（文档对齐，观察）。— 40
- **L5** `body_capture_coordinator.ts` L290-291：bridge 事件 relative/absolute 均取 evt.timestamp（epoch），与其它路径 relative 语义不一致。— 60
- **L6** `network_capture.ts` L926-927 send_ws_connection_event 用 `Date.now()` 正确，ws_frame 用 CDP timestamp（H6），两条 ws 路径口径不一致。— 60（并入 H6）
- **L7** `storage.ts` L252 dom_data 类别映射到 USER_ACTION_EVENTS。— 45
- **L8** `network_capture.ts` L1141-1143 `_deferred_cdp_index` 定义在使用之后（运行期 OK 可读性差）。— 30
- **L9** exporter 所有导出整载全量再 stringify 无流式，500MB 捕获内存翻倍。— 65（并入 H1）

## P7 测试覆盖核对
| 模块 | 测试 | 覆盖评价 |
|---|---|---|
| capture_state | capture_state.test.ts（5 用例） | 只测状态机单函数，不测 start/stop 编排、generation 防串写、SW 重启恢复 |
| flush 语义 | storage.test.ts、p043_flush_before_read | 未测 flush 失败回填重试、限额触发 stop、重启后限额失效 |
| SW 重启恢复 | service_worker_stale_cleanup.test.ts（5 用例） | 只覆盖终态化；恢复/续采无测试（H5） |
| stop drain 顺序 | stop_capture.test.ts（~20 用例）、network_stop_deferred_timers | 较完整 |
| network_capture | 93 用例 | 强；但 ws_frame 相对时间（H6）、换 tab 拆 console（H3）无覆盖 |
| console/exception | 8/7 用例 | 覆盖基本路径；对象参数预览（M1）未测 |
| stream_buffer | 12 用例 | 较好 |
| app_log_storage | 5 用例 | 弱：trim、全表扫描性能未测 |
| agent_command_dispatcher / agent_data_queries | 无独立测试文件（0 it） | P3 契约核心无直接单测；64MiB（H2）、整载（H1）未测 |
| keepalive | 无测试文件 | 保活语义无验证 |
| exporter HTML 嵌入 | 仅 toContain 表面断言（C1） | 无回灌验证 |

## Summary
- 20 个 background 文件 6457 行 + 9 个 shared 契约文件。
- Critical 2 ／ High 7 ／ Medium 20 ／ Low 9 ／ Info 若干。
- 核心风险 Top5：
  1. HTML 导出被撇号/换行彻底击穿（C1），测试未覆盖回灌。
  2. agent 查询全量整载 + 无 64MiB 上限（H1/H2），SW OOM + 大结果被 bridge 413 拒收、命令副作用丢失。
  3. 存储限额 SW 重启后失效（H4）+ 重启只终态不恢复（H5），直接违反项目约束。
  4. CDP 单 attach 约束被 body 换 tab 破坏（H3），console/error 静默断流。
  5. ws_frame 相对时间计算错误（H6），timeline 数据污染。
- 预存标注：C1（escape P2#20 修复漏路径）、H6、M7、M10 等为旧代码遗留；H1/H2/H5 为近期 agent 功能引入。
