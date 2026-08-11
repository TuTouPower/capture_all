# Review: src_ext_bg_agent

- 批次：`review_20260811_0111` / `src_ext_bg_agent`
- 范围：当前文件状态全量只读（无 git diff/log）
- 文件：9（见 `file_list.txt`）
- 可追踪只读：`src/shared/protocol.ts`、`src/shared/agent_bridge_config.ts`、`src/extension/background/storage.ts` 分页签名；`service_worker.ts` 中 start/stop 与 `handle_network_request` 调用关系（用于判定可达性，非本批改动对象）

## Findings

### f001 — external CDP 轮询在 stop 后无法真正停止（poll_timer 快照 + 未置 poll_stopped）

- **严重度**：blocking
- **位置**：`src/extension/background/body_capture_coordinator.ts`（`try_external_cdp_bridge` ~L234–270；`stop_body_capture` ~L164–178；`stop_body_capture_with_cleanup` ~L180–198）
- **问题**：
  1. 单飞轮询用闭包内 `let poll_timer` + `finally` 里 `poll_timer = setTimeout(poll_once, 500)` 递归调度；写入 `coordinator_state` 的只是**首次** timer id。
  2. `stop_*` 只对 `coordinator_state.poll_timer` 做 `clearTimeout`/`clearInterval`，首次 tick 后该 id 已失效，清定时器为 no-op。
  3. 闭包内构造了 `stop: () => { poll_stopped = true; clearTimeout(poll_timer); }`，但 `stop_body_capture` / `stop_body_capture_with_cleanup` **从不调用**；`poll_stopped` 恒为 false。
  4. 结果：stop 后 `poll_once` 仍每 500ms 请求 Bridge；在 `is_capturing` 仍为 true 的 drain 窗口内继续 `on_network_request`；`is_capturing=false` 后写入被 SW 入口挡掉，但轮询进程不灭。下一轮 start 后旧闭包仍持有旧 `capture_id` 与 `handle_network_request`，可与新 session 并发写库并污染 `current_capture.stats`。
- **建议**：
  - 将 `poll_stopped` / `stop_fn` 挂到 `coordinator_state`（或模块级 generation），`stop_*` 必调。
  - 每次 reschedule 同步回写 `coordinator_state.poll_timer`，或仅依赖 `poll_stopped` + 清最新 timer。
  - `poll_once` 内校验 `coordinator_state?.external_session_key === session_key` 后再回调。
  - `start_body_capture` 入口若已有 external session，先 stop 再启。
- **置信度**：高

### f002 — `start_body_capture` 可重入覆盖 state，不停止旧 external 轮询

- **严重度**：blocking
- **位置**：`body_capture_coordinator.ts` `start_body_capture`；可达路径：`service_worker.ts` tab activate / URL change 重试（约 L973、L1076）在已 capturing 时再次 `start_body_capture`，无先 stop
- **问题**：重入时直接 `coordinator_state = bridge_result`（或其它 mode），旧闭包的 `poll_stopped`/timer 无引用可停。同 capture 或跨 capture 可叠多条 external 轮询。与 f001 叠加后更易污染数据。
- **建议**：start 前统一 `await stop_body_capture_with_cleanup(...)`；或 mode 已 active 且 session 有效则 no-op/升级，禁止并行第二套 poll。
- **置信度**：高

### f003 — 命令已执行后因 lifecycle 失效丢弃 result，不投递

- **严重度**：high
- **位置**：`src/extension/background/agent_bridge_client.ts` ~L151–168
- **问题**：`dispatch_agent_command` 完成后若 `!is_active_lifecycle` 直接 `return`，跳过 `send_result_with_retry`。Bridge 侧命令已出队；`capture.start`/`stop` 等副作用已发生；MCP 侧只会 `COMMAND_TIMEOUT`。`stop_bridge_client`（禁用 bridge / 重启 client）与长耗时命令并发时必现。
- **建议**：dispatch 完成后**无条件**尝试投递 result（可用当时 url/token 快照）；仅取消尚未开始的 dispatch。或 stop 时 drain 当前 cycle 的 result。
- **置信度**：高

### f004 — result 投递 401 不走 `handle_401`，半状态恢复偏慢且结果不可恢复

- **严重度**：medium
- **位置**：`agent_bridge_client.ts` ~L159–168 vs L170–180；`send_result_with_retry` ~L319–321
- **问题**：result 路径独立 try/catch，4xx（含 401）只记 `result_delivery` 日志。内存 `session_token` 仍旧；要等后续 heartbeat/command 401 才 `handle_401`。命令副作用不可重放，结果永久丢失（与 T046 注释一致，但 401 本可触发 re-enroll，仍无法补 result）。
- **建议**：result 401 与 polling 401 共用清 session + re-enroll；评估 Bridge 侧对「已执行无 result」的补偿（至少 metrics/告警）。
- **置信度**：高

### f005 — enroll 成功写内存后 `save_bridge_session` 失败留下半状态

- **严重度**：medium
- **位置**：`agent_bridge_client.ts` `resolve_token` ~L209–225；`handle_401` ~L236–250
- **问题**：顺序为 `session_token`/`enrolled=true` → `save_bridge_session`。save 抛错进入 catch 并 `return null`，但模块级 token 已设置。当轮 poll 视为无 token；次轮直接用内存 token。SW 若在 save 失败后立刻被杀，持久化无 session，服务端已 enroll，需再 enroll/401 恢复。
- **建议**：先 save 成功再提交内存；失败则 clear 内存并 `clear_bridge_session`。
- **置信度**：高

### f006 — 调度器仍返回废弃错误码，未应用 `ERROR_CODE_ALIASES`

- **严重度**：medium
- **位置**：`agent_command_dispatcher.ts` ~L109–123、`to_agent_error` ~L288–301；对照 `src/shared/protocol.ts` L44–49
- **问题**：协议标注 `RECORDING_ALREADY_RUNNING` / `NO_ACTIVE_RECORDING` / `SESSION_NOT_FOUND` 为兼容别名，推荐 `CAPTURE_*` / `NO_ACTIVE_CAPTURE`。dispatcher 与 `agent_data_queries` 仍抛旧码，且不调用 `ERROR_CODE_ALIASES`。`is_agent_error_code` 白名单也不含 capture 新码与 `NO_ACTIVE_*`/`RECORDING_*`。依赖新码的客户端会误判。
- **建议**：出站统一映射到推荐码；白名单与 `AgentErrorCode` 对齐；查询路径用 `AgentCommandError` 而非 `throw new Error('SESSION_NOT_FOUND')`。
- **置信度**：高

### f007 — `stop_capture` 将一切失败映射为 `NO_ACTIVE_RECORDING`

- **严重度**：medium
- **位置**：`agent_command_dispatcher.ts` ~L118–126
- **问题**：`handlers.stop_capture()` 仅 `{ success: boolean }`。任意失败都抛 `NO_ACTIVE_RECORDING`。SW 层 idle 时实际 `success: true`（幂等），故「无活跃」多表现为 ok+`capture_id: null`；若将来 stop 中途失败返回 `success: false`，Agent 会得到错误语义码。与 start 侧已区分 busy/storage 不对称。
- **建议**：handlers 返回 `error` 码/原因；区分 no-active、storage、内部错误。双重 stop 契约写清（幂等 ok vs 明确错误）。
- **置信度**：中

### f008 — `capture_state` 原语无 phase 守卫，错误调用可破坏状态机

- **严重度**：medium（本模块契约缺口；SW 主路径有 `run_exclusive`+phase 检查）
- **位置**：`capture_state.ts` `begin_start`/`begin_stop` ~L56–97
- **问题**：`begin_start` 不要求 `idle`；`begin_stop` 不要求 `capturing`。同 generation 下 start 的 `commit` 只设 `phase='capturing'`，与 stop 的 `commit` 清字段交叉可得到 `phase=capturing && capture_id=null`。`is_active_generation` 在 `starting` 亦为 true，stop 中途 listener 仍可能视为 active（SW 另有 `is_capturing` 门闩，模块自身不表达 drain）。
- **建议**：`begin_start`/`begin_stop` 内断言 phase；`commit`/`rollback` 校验期望 phase；文档写明必须 `run_exclusive`。
- **置信度**：中

### f009 — `load_agent_capture_data` 的「分页」在 storage 层仍全表 `getAll`，大 capture 内存/耗时放大

- **严重度**：medium（正确性上非静默截断；可用性风险）
- **位置**：`agent_data_queries.ts` `fetch_all` ~L55–68；`storage.ts` `query_by_store` ~L476–491（只读对照）
- **问题**：T043 去掉固定 100000 截断后，`fetch_all` 按 5000 翻页。但 `query_by_store` 每次 `index.getAll(capture_id)` 再 `slice`。N 条数据约 ⌈N/5000⌉ 次全量加载，峰值内存与耗时近似 O(N × pages)。`capture.get_all_data` / list/timeline 均先 `load_agent_capture_data`，大会话易导致 SW OOM 或 COMMAND_TIMEOUT，表面像「全量语义」实则不可用。
- **建议**：storage 真游标/续传 key；或 agent 查询按 source 流式分页，避免每次拼全量 `AgentCaptureData`。
- **置信度**：高

### f010 — `get_native_record_id` 无稳定 id 时时间戳兜底可碰撞

- **严重度**：low
- **位置**：`agent_data_queries.ts` ~L232–236
- **问题**：缺 `event_id`/`request_id` 时用 `` `${sort_key}:${absolute_time}` ``。同毫秒多条 cookie/storage/console 可能共享 id；`get_entry`/`timeline.get` 的 `find` 命中首条，读错记录。bridge 路径 `request_id` 缺省 `bridge_${Date.now().toString(36)}`（`body_capture_coordinator.ts` ~L283）同毫秒也有风险。
- **建议**：写入时强制稳定 `event_id`；兜底加序号/随机后缀。
- **置信度**：中

### f011 — external CDP allowlist 合理，但 `session_key` 进 query、token 依赖调用方配置

- **严重度**：low（边界加固项，非已证实 SSRF）
- **位置**：`external_cdp_bridge_client.ts` `is_allowed_bridge_url` ~L14–38；`poll_external_cdp_events` ~L160–161
- **问题**：loopback allowlist（127.0.0.1/localhost/[::1]）、禁 userinfo/fragment/非根 path，可防把 token/tab_url 打到远端，SSRF 面可控。`session_key` 放 query 可能进代理/扩展网络日志；`cdp_port` 无范围校验（本机端口扫描交给 Bridge，属产品边界）。agent 配置路径 `parse_local_bridge_url` 更严（仅 http + 固定 host），external 路径吃 raw `load_user_config()`，靠本文件二次校验兜底——一致但分叉。
- **建议**：`session_key` 改 header/body；port 限制 1–65535 与默认列表；配置出口统一 normalize + allowlist。
- **置信度**：高

### f012 — `app_log_storage` 容量估算主路径已覆盖 details；fallback 仍偏瘦

- **严重度**：low
- **位置**：`app_log_storage.ts` `estimate_entry_bytes` ~L9–15；`get_entries` ~L66–116
- **问题**：主路径 `TextEncoder + JSON.stringify(entry)` 含 details/stack，满足 T049。`JSON.stringify` 失败时 fallback 只计 message/module+40，会低估并延后 trim。分页 `skipped < offset` + `results.length >= limit` 语义正确，无「多返回 offset 条」。
- **建议**：fallback 计入 `JSON.stringify(details)` 粗长度或固定更大 pad；`stringify` 失败打点。
- **置信度**：高

### f013 — `keepalive` 间隔 0.5min 可能被 Chrome 钳制

- **严重度**：low / info
- **位置**：`keepalive.ts` ~L8–21
- **问题**：`periodInMinutes = 0.5`。MV3 常见最小周期 1 分钟，实际可能被抬升；`setup_keepalive_listener` 与 `start_keepalive` 分离，只 start 不 setup 时 alarm 仍可唤醒 SW（listener 空转）。非正确性缺陷。
- **建议**：按 Chrome 约束改为 `1` 或文档标明依赖钳制；init 路径保证 setup 先于 start。
- **置信度**：中

### f014 — `cdp_event_router` 子 session 登记竞态可丢事件

- **严重度**：low
- **位置**：`cdp_event_router.ts` `should_handle_event` ~L27–36
- **问题**：带 `sessionId` 且未 `register_session` 的事件直接丢弃。attach 与首包事件乱序时 sub-target（worker/iframe）丢数。主 target（无 sessionId）不受影响。
- **建议**：未知 sessionId 短暂缓冲或 attach 完成前 queue Network 事件；或先 register 再 enable。
- **置信度**：中

### f015 — browser_label / enroll-heartbeat 主路径基本正确（观察项）

- **严重度**：info
- **位置**：`agent_bridge_client.ts` enroll ~L262；heartbeat ~L272–283；每 cycle 重读 config ~L143–144
- **问题**：无缺陷级问题。heartbeat 每轮带当前 `browser_label`，满足 T047 配置热更新。enroll 允许空 `agent_bridge_token`（T091 origin 直通）与 shared normalize 一致。结果重试 3 次、非 429 的 4xx 不重试（T046）实现存在；注释写「500ms/1s/2s」与代码 `delays = [0, 500, 1000]` 不一致（观感问题）。
- **建议**：注释与退避数组对齐；可选对 5xx/网络错误使用真指数退避。
- **置信度**：高

### f016 — 命令分发：未知命令拒绝与 limit 上限

- **严重度**：info
- **位置**：`agent_command_dispatcher.ts` default ~L88–90；`get_optional_non_negative_int` ~L192–201
- **问题**：未知 type → `INVALID_QUERY`（T048），避免 `ok:true data:undefined`。offset/limit 非负整数，limit max 100000。`data.list`/`timeline.list` 未传 limit 时查询层默认 `filtered.length`（全量页），靠 `total` 可发现截断；客户端若忽略 `total` 会误以为页即全集——属 API 使用约定，实现已返回 `total`。
- **建议**：大默认全量时响应加 `truncated: false` 显式字段；或强制默认 limit（如 100）与 captures.list 一致。
- **置信度**：高

## 按评审重点对照

| 重点 | 结论 |
|------|------|
| Agent bridge 结果重试 | 有 `send_result_with_retry`；lifecycle 早退与 result 401 仍丢结果（f003/f004） |
| 命令与 ack 一致性 | dispatch 包 ok/error；出队后投递失败/丢弃 → 调用方超时（f003） |
| browser_label | heartbeat 每轮同步（f015） |
| enroll/heartbeat 半状态 | save 失败半提交（f005）；401 主路径可 re-enroll |
| 命令分发错误码/未知命令 | 未知命令 OK；废弃码未映射（f006）；stop 失败码粗糙（f007） |
| 数据查询静默截断/全量造假 | 已无固定 100k 静默砍；全量靠反复 getAll，有 OOM/超时风险（f009） |
| body_capture 重入/stop/单飞 | 单飞 poll_in_flight OK；stop 与重入致命（f001/f002） |
| capture_state 竞态/generation | generation 使 stopping 后 is_active 为 false；原语缺 phase 守卫（f008） |
| external_cdp allowlist/SSRF/token | allowlist 有效；query 含 session_key（f011） |
| app_log 分页/容量 | 分页正确；主估算 OK，fallback 偏瘦（f012） |

## 结论

external CDP 路径的 **stop/重入无法终止轮询**（f001、f002）可导致 stop 后资源泄漏，并在后续 capture 中写入错会话/污染 stats，属可观测正确性与数据边界问题。Agent bridge 在 lifecycle 切换时 **已执行命令不投递 result**（f003）破坏命令-结果契约。

其余为错误码一致性、半状态 enroll、全量加载可扩展性与边界加固。

**verdict: FAIL**

- blocking: 2（f001, f002）
- high: 1（f003）
- medium: 6（f004–f009）
- low/info: 7（f010–f016）
