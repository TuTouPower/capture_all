# 全量审阅：src_ext_bg_sw_storage

- 范围：当前工作区只读（禁止 git diff/log）
- 批次：`src_ext_bg_sw_storage`
- 文件：5（`service_worker.ts` / `storage.ts` / `stream_buffer.ts` / `webrequest_handler.ts` / `ws_handler.ts`）
- 可追踪依赖：`capture_state.ts`、`network_capture` 导出 API、`shared/constants` store 名
- reviewed_at：2026-08-11 UTC+8
- reviewer_focus：SW 生命周期/状态机、消息路由、storage 事务、stream_buffer、webrequest/ws

## Findings

### sw_storage_f001 - cleanup_stale 与 start 无互斥，可清掉新采集持久化键

- 严重度：critical
- 锚点：行为缺陷 — SW 冷启动后「旧 stale 清理」与「新 start」竞态，清空刚写入的 `active_capture_*`
- 位置：`service_worker.ts:126-181`（`cleanup_stale_capture_state` + `setTimeout(0)`）、`service_worker.ts:301-323`（`start_capture`/`run_exclusive`）、`service_worker.ts:408-417`/`567-574`（写持久化键）
- 问题：
  1. `cleanup_stale_capture_state` **不**走 `capture_state.run_exclusive`，与 start/stop 串行化无关。
  2. 冷启动时 `setTimeout(0)` 调度 cleanup；同时 `initialize_agent_bridge` 亦可在 `setTimeout(0)` 后很快 `start_capture`。
  3. 竞态：cleanup 已读到旧 `active_capture_id`/`is_capturing` → start 完成并写入新 `active_capture_*` → cleanup 无条件 `chrome.storage.local.set({ is_capturing:false, current_capture:null, active_capture_*:null })`，**抹掉新采集键**。
  4. 内存侧新采集仍 `is_capturing=true`，popup/storage 显示未采集；下次 SW 回收后 IDB 中该 CaptureRecord 可永久停在 `status:'capturing'`（无 active 键可清理）。
- 建议：SW 启动屏障 — cleanup 完成前拒绝 start；cleanup 与 start 共用 `run_exclusive`；cleanup 清键时二次校验 `active_capture_id === stale_capture_id`，否则 abort 清键。

### sw_storage_f002 - tab_created / tab_url_change 无 generation 校验（T033 漏网）

- 严重度：important
- 锚点：行为缺陷 — stop→新 start 后，旧 tab 异步 continuation 可把事件写入新采集或误启 CDP
- 位置：
  - `service_worker.ts:999-1020`（`tabs.onCreated`）
  - `service_worker.ts:1024-1093`（`tabs.onUpdated`）
  - 对照已修路径：`service_worker.ts:900-990`（`onActivated` 捕获 gen + await 后 `is_active_generation`）
- 问题：
  - `onCreated` 仅入口查 `is_capturing`，`await write_events` 前/后不校验 generation；事件用可变全局 `current_capture_id`/`start_time`。
  - `onUpdated` 在 URL 变更后可 `await start_console_capture` / `start_exception_capture` / `start_body_capture` 且**全程无 gen 校验**，stop 后仍可能 re-attach debugger / 改 body 状态。
- 建议：与 `onActivated` 对齐 — 入口捕获 `gen/cap_id/start_time/config`，每个 await 后 `is_active_generation(gen)`，事件字段只用捕获值。

### sw_storage_f003 - onActivated exception 重试路径仍读 live 全局且无 gen 门闩

- 严重度：important
- 锚点：行为缺陷 — 同 T033 场景下 exception 子系统可挂到错误 capture
- 位置：`service_worker.ts:962-970`
- 问题：同函数内 console/body 重试用 `cap_config`/`cap_id`/`cap_start` 且 await 后校验 gen；exception 分支却用 `current_config` / `current_capture_id` / `start_time`，await 后**不** `is_active_generation`，成功时写 `debugger_attached_tab_id`。
- 建议：统一为捕获值 + gen 校验；失败/过期直接 return。

### sw_storage_f004 - bytes_written 仅内存 Map，限额 API 无调用方

- 严重度：important
- 锚点：行为缺陷 — `MAX_SESSION_SIZE_BYTES`（500MB）与 `check_storage_limit` 形同虚设；SW 回收后 size 归零
- 位置：`storage.ts:265-266`、`449-470`；`constants.ts:20`；全仓生产路径无 `check_storage_limit`/`get_capture_size` 调用（仅 unit 测试）
- 问题：
  - `bytes_written` 在 `tx.oncomplete` 后累计（回填逻辑正确），但**不**写回 `CaptureRecord`，也不读盘恢复。
  - T037 历史声称「持久化到 CaptureRecord」；当前源码未落地。
  - SW/handler 从不调用 `check_storage_limit`，采集可顶到 IDB quota 才失败。
- 建议：提交后把累计字节写入 CaptureRecord（或独立 store）；start/恢复时 hydrate Map；`write_*`/`handle_*` 入口超限则 stop 或拒绝写入。

### sw_storage_f005 - stream_buffer 异步 force_flush 失败时先 delete 导致无法回填

- 严重度：important
- 锚点：行为缺陷 — SSE/流式连接结束时 on_flush reject → 已累计 body 静默丢失
- 位置：`stream_buffer.ts:50-64`
- 问题：
  ```ts
  entry.chunks = [];
  entry.bytes = 0;
  (ret as Promise<void>).catch(() => {
    const e = buffers.get(request_id);
    if (e) { e.chunks.unshift(...snapshot); ... }  // entry 已不在 map
  });
  if (delete_after) buffers.delete(request_id);  // force_flush/flush_all 恒 true
  ```
  `force_flush`/`flush_all` 在 async on_flush 尚未 settle 时即 `delete`；catch 回填找不到 entry → 数据丢弃。同步失败路径反而保留 chunks。
- 建议：async + `delete_after` 时等 promise settle 再 delete；失败保留 entry 或重建 entry 回填。

### sw_storage_f006 - 生产 webRequest 失败路径与 webrequest_handler 分叉（本批 handler 修好但未接线）

- 严重度：important
- 锚点：行为缺陷 — 非 CDP tab 的失败请求在运行时从采集中消失
- 位置：
  - 本批已修：`webrequest_handler.ts:189-202`（`handle_error` 发 `error_text` + `status_code=null`）
  - 生产编排：`network_capture.ts:19-20` `import {} from './webrequest_handler'`（空导入）、`network_capture.ts:1194-1198` 仅 `pending_requests.delete`，**不 emit**
  - 消费方：`cdp_handler.ts` 仅 import `build_network_event`
- 问题：单测覆盖 `webrequest_handler.handle_error`，真实 SW 注册的是 `network_capture` 内联 handler。修复落在死/旁路模块，生产仍丢 loading/failed 类 webRequest 错误事件。
- 建议：删除分叉 — `network_capture` 委托本批 handler，或把 emit 逻辑合并进唯一生产路径；空 `import {}` 删除。

### sw_storage_f007 - delete_capture 可删活跃采集数据且不拦 start 写入

- 严重度：important
- 锚点：行为缺陷 — 采集中 delete → IDB 半空 + 后续 write 重建孤儿事件
- 位置：`service_worker.ts:217-218`；`storage.ts:203-242`
- 问题：`delete_capture` 消息无 `is_capturing`/`current_capture_id` 守卫；单事务原子删 9 store 正确，但活跃采集继续 `write_*` 会向已删 capture_id 写入，CaptureRecord 不存在而事件存在（或反之依赖时序）。
- 建议：若 `capture_id === current_capture_id && is_capturing` 则拒绝或先 stop；删除后清理 `bytes_written` 条目。

### sw_storage_f008 - SW 重启 cleanup 只终态化，不写 capture_stopped，也不恢复

- 严重度：important
- 锚点：行为缺陷 — 重启后 CaptureRecord 变 `completed` 但无 lifecycle stopped / 最终 stats 不可信
- 位置：`service_worker.ts:126-174`
- 问题：
  - 架构文案「恢复/终止」；实现**仅终止**（合理：listener/CDP 难恢复），但终态化只 `update_capture({status:'completed',...})`，不 `flush_all`、不写 `capture_stopped`、不保证 buffer 已落盘（SW 已死则内存 buffer 本已丢）。
  - `active_capture_generation` 写入后从未用于恢复校验。
- 建议：cleanup 写 `capture_stopped`（reason=`sw_restart`）+ 尽量 flush；文档明确「不恢复采集，仅终态化」。

### sw_storage_f009 - 消息路由无 sender 收紧；危险 action 对扩展内任意上下文开放

- 严重度：minor（扩展内信任模型下）
- 锚点：行为缺陷 — 任意 content script / 扩展页可 `delete_capture`/`export_*`/`clear_app_logs`/`set_log_level`
- 位置：`service_worker.ts:187-283`
- 问题：
  - 未知 `action` 返回 `{success:false,error:'Unknown action'}` — 正确。
  - **无** `onMessageExternal`（本文件）— 外部网页默认不能直达。
  - 未校验 `sender.id`/`sender.url`；恶意页面脚本若能诱导同扩展 content 转发，或扩展页 XSS，可删导出数据。属纵深不足，非公网 RCE。
- 建议：破坏性 action（delete/export/clear）限制 `sender.url` 为 extension origin（popup/dashboard）；content 仅允许 `event`/`app_log_batch`。

### sw_storage_f010 - webrequest_handler pending/deferred 无连接数 cap

- 严重度：minor（本模块作库）/ 生产同源问题见 cdp_net 批
- 锚点：行为缺陷 — 大量挂起请求可撑大 Map
- 位置：`webrequest_handler.ts:57`（`pending_requests.set`）、`175`（`deferred_web_requests.set`）；无 size 上限
- 问题：无 complete/error 的请求永久留在 Map（直到 stop 清）。长会话 + 卡死请求 → 内存涨。
- 建议：与 `ws_handler` 类似加上限 + 超时 orphan 清理；timeout 回调检查 `is_capturing`。

### sw_storage_f011 - ws_handler 连接 cap 丢最旧且不发 closed；模块生产未接线

- 严重度：minor（生产未用）/ important 若未来接线
- 锚点：事件完整性 — cap 驱逐无 `ws_status:'closed'` 事件
- 位置：`ws_handler.ts:139-143`；生产 WS 在 `network_capture.ts`/`cdp_handler.ts` 内联且**无** 1000 cap
- 问题：
  - `size > 1000` 时 `delete(oldest)` 不 `send_ws_connection_event(...,'closed')`。
  - `WsFrameData` 未填 `capture_id`（types 已标 `session_id` @deprecated + 推荐 `capture_id`）；T072 在本模块未完成字段对齐。
  - `network_capture` 空导入 `ws_handler`，运行时 cap/字段修复不生效。
- 建议：统一单一 WS 实现；驱逐前发 closed；frame 写 `capture_id`。

### sw_storage_f012 - body_capture_mode 在无 dbg 时仍标 extension_cdp

- 严重度：minor
- 锚点：元数据完整性 — `not_enabled` body 却标 `body_capture_mode:'extension_cdp'`
- 位置：`webrequest_handler.ts:93-102`、`268-269`
- 问题：`capture_response_body && dbg_tab_id===null` 走 immediate `not_enabled`，但 `build_network_event` 用 `capture_response_body ? 'extension_cdp' : 'none'`。
- 建议：按实际路径填 `none` / `web_request_only`。

### sw_storage_f013 - capture_state 双轨 is_capturing + 未使用 rolling_back

- 严重度：minor
- 锚点：状态机完整性 — 架构 5 阶段 vs 实现
- 位置：`capture_state.ts`（phase 含 `rolling_back` 从未赋值）；`service_worker.ts` 模块级 `is_capturing` 与 `phase` 并行
- 问题：
  - start 失败走 `start_handle.rollback()` → 直接 `idle`，无 `rolling_back`。
  - 回调门闩几乎全看 `is_capturing` 而非 `phase`/`generation`（tab 监听部分除外）。stop drain 顺序本身正确（先停生产者再翻 `is_capturing`）。
  - `stop_capture`：`!is_capturing && phase!=='idle'` 时 `begin_stop` 后 `stop_inner` 因 `!is_capturing` 立刻 success，可能 **commit 到 idle 而不清理子系统**（半启动/错位时）。
- 建议：单一权威状态；rollback 用 `rolling_back` 或删类型；`stop_inner` 在 phase stopping 时仍清理子系统。

### sw_storage_f014 - write_storage/cookie/lifecycle 仍批量缓冲（API 死代码风险）

- 严重度：minor
- 锚点：耐久一致性 — 与 T038「write 立即 flush」不一致
- 位置：`storage.ts:318-349` vs `278-297`（`write_events` 立即 `flush_store`）
- 问题：content storage/cookie 经 `handle_event`→`write_events` 已立即 flush；但导出的 `write_storage_changes`/`write_cookie_changes`/`write_lifecycle_events`/`write_error_events` 仍 `FLUSH_BATCH_SIZE` 门槛，生产无调用方。留作公共 API 易被误用并在 SW 回收丢批。
- 建议：与 `write_events` 对齐立即 flush，或标记 deprecated 并删除。

## 结论

### 已改善（相对 2026-07 批问题，本批可见）

| 主题 | 现状 |
|------|------|
| start/stop 串行化 | `run_exclusive` + phase 检查 |
| stop drain 顺序 | 先停生产者 → flush → 再 `is_capturing=false` → stopped event |
| start 失败回滚 | `start_capture_inner` catch → `stop_capture_inner` + `start_handle.rollback` |
| active 键持久化 | start 写 / stop 清 / cleanup 读 |
| onActivated generation | 主路径已捕获 gen |
| delete_capture 原子性 | 单 readwrite 事务覆盖 9 store |
| flush 失败回填 | `tx.onerror`/`onabort` 把 batch 放回 buffer 头 |
| write_events 耐久 | 每次写入 `await flush_store` |
| bytes 计量 UTF-8 | `TextEncoder` + complete 后累计 |
| 未知 message | 显式 error 返回 |

### 本轮新发现

- critical：1（f001）
- important：7（f002–f008）
- minor：6（f009–f014）

### 未进表提示

- **文件过大**：`service_worker.ts` ≈1125 行（实现源码 important 阈值 800）— 协调层堆叠 start/stop/tab/bridge；建议拆 tab_listeners / capture_lifecycle。不单独作 finding。
- **圈复杂度**：`start_capture_inner_impl`、`handle_message` switch、`onActivated` 重试链偏高；分发型 switch 可排除。
- **双实现债务**：`webrequest_handler`/`ws_handler` vs `network_capture`/`cdp_handler` 内联逻辑 — 测试修一处、生产跑另一处（f006/f011）。
- **nonce**：WS/page nonce 属 content 层（T071），本批 background 无 per-frame nonce 职责；不记缺陷。
- **stream_buffer 全局内存上限**：单流靠 byte_threshold 触发 flush + 调用方 `max_body_capture_bytes`；无跨 request 总 cap — 观察项。

### 总体判断

状态机/drain/原子删/主写路径耐久已明显收敛，但 **SW 启动 cleanup 与 start 竞态（f001）**、**listener generation 覆盖不全（f002/f003）**、**配额未落地（f004）**、**stream force_flush 异步丢数（f005）**、**handler 修复未进生产路径（f006）** 均为可观测缺陷。存在未解决 critical/important → **FAIL**。

### 系统性 follow-up（建议）

1. `fix-sw-startup-barrier`：cleanup 完成屏障 + 清键 CAS
2. `fix-sw-listener-generation-complete`：onCreated/onUpdated/exception 对齐 T033
3. `fix-storage-quota-persist`：bytes_written → CaptureRecord + 强制 check
4. `refactor-network-single-path`：消灭 webrequest/ws 双实现，接好 handle_error
5. `fix-stream-buffer-async-delete`：force_flush 等待 settle

verdict: FAIL

## 计数

| 项 | 值 |
|----|-----|
| 审阅文件 | 5 |
| Findings | 14（critical 1 / important 7 / minor 6） |
| verdict | FAIL |
| 输出路径 | `/home/karon/karson_ubuntu/capture_all/docs/reviews/review_20260811_0111/src_ext_bg_sw_storage/review.md` |
