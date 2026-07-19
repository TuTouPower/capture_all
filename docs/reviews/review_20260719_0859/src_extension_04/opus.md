# 审阅报告：src_extension_04（service_worker / storage / stream_buffer / webrequest_handler）

- 审阅模型：opus
- 审阅范围：`MANIFEST.md` 中 `src_extension_04` 清单的 4 个文件
  - `src/extension/background/service_worker.ts`（960 行）
  - `src/extension/background/storage.ts`（559 行）
  - `src/extension/background/stream_buffer.ts`（83 行）
  - `src/extension/background/webrequest_handler.ts`（336 行）
- 审阅日期：2026-07-19
- 审阅模式：独立只读，仅基于本批次文件与必要依赖（`constants.ts`、`network_webrequest.ts` 的 `extract_request_body`、`cdp_handler.ts` 的类型定义、`keepalive.ts`）

---

## 总览

四份文件构成扩展后台采集的核心骨架：`service_worker.ts` 编排采集生命周期与跨子系统协调；`storage.ts` 管理 IndexedDB v3 与按 store 的缓冲写入；`stream_buffer.ts` 提供 SSE/分块响应的节流累积；`webrequest_handler.ts` 负责 webRequest API 的事件归并、CDP body 关联与延迟写。

整体结构清晰、职责分层合理。但存在多处影响数据一致性与并发安全的实现缺陷，尤其集中在 IndexedDB 升级路径、写入并发、stale-state 恢复、延迟写入资源回收等环节。

严重级别约定：`critical`（数据丢失/损坏/安全）/ `high`（功能错误、并发竞态）/ `medium`（边界缺陷、资源泄漏）/ `low`（可维护性、风格）。

---

## Findings

### F-01 `cleanup_stale_capture_state` 与 `stop_capture` 之间无互斥，重启竞态导致 events 写入被丢弃

- 位置：`service_worker.ts:123-147`（cleanup）、`service_worker.ts:84-94`（模块级状态）、`service_worker.ts:479-558`（stop_capture）
- 现象：
  - `is_capturing`、`current_capture`、`current_capture_id` 仅是模块级内存变量。`cleanup_stale_capture_state` 在 SW 重启后通过 `setTimeout(..., 0)` 异步执行，从 `chrome.storage.local` 读出"残留"标志位后强制将 record 标记为 `completed` 并清空 `is_capturing`。
  - 但 `start_capture` 并不读写 `chrome.storage.local` 中的 `is_capturing`/`current_capture`，也不在结束时长写回。即 `cleanup_stale_capture_state` 读到的"stale"状态来源不明，仅反映某个旧版本（或某个未对齐的写入路径）留下的值。
  - 真实崩溃场景下（SW 被回收且未触发 stop），`chrome.storage.local.is_capturing` 是否为 `true` 取决于先前是否有写入。当前 `start_capture` 路径（`service_worker.ts:316-326`）只更新 IndexedDB，未同步 `chrome.storage.local.is_capturing = true`，因此 `cleanup_stale_capture_state` 在多数崩溃场景下根本检测不到 stale，cleanup 实际是空操作。
  - 反之，若旧版本曾写入 `is_capturing=true`，cleanup 会把 record 强制标为 `completed`，但其 events 仍处于 `flush_store` 的内存 buffer（已随旧 SW 销毁），导致 record 显示已完成但 events 大量缺失，统计与实际数据不一致。
- 影响：
  - SW 重启后既可能漏掉对真正 stale 的清理（cleanup 形同虚设），也可能在错误时机把正在进行中的 capture 强制标完成。两条路径都会破坏 P0 验收要求的"采集状态一致性"。
- 建议：
  - 在 `start_capture` 成功创建 record 后，同步写 `chrome.storage.local` 的 `is_capturing`/`current_capture`；在 `stop_capture` 收尾时清空。
  - 或改为单一真相源（IndexedDB 中的 capture.status），cleanup 只信任 IndexedDB，不读 `storage.local`。
  - 在 cleanup 完成前阻塞其他 `start_capture`/`stop_capture`/`handle_event` 路径（用 promise gate）。
- 置信度：high
- 级别：high

### F-02 `set_log_level` 写入 `chrome.storage.local.user_config` 时整体覆盖，会丢失未读字段

- 位置：`service_worker.ts:235-241`
- 现象：
  ```ts
  await chrome.storage.local.set({ user_config: { ...(await load_user_config()), log_level: message.level } });
  ```
  - 读 `load_user_config()` 后立即整体覆盖 `user_config`。`load_user_config` 默认合并 `DEFAULT_USER_CONFIG`，若 `DEFAULT_USER_CONFIG` 在版本间增删字段，会把扩展最新默认值写入 `storage.local`，覆盖用户显式设置过的"非默认"偏好的反义（例如用户把某项显式关掉，但因合并默认值是 true，写入仍为 true，看似没问题；但如果用户曾写入过 partial config，此处仍会展开成完整对象，影响其他读取路径对"未设置即默认"的判断）。
  - 更关键的是：`load_user_config()` 与 `set` 之间没有锁，与 `dashboard_settings` 等其他写入 `user_config` 的路径存在 lost-update 风险。
- 影响：配置写一致性弱；并发保存（如用户在 dashboard 改配置的同时命令行调 `set_log_level`）会导致后写者整体覆盖前者。
- 建议：改为局部 patch 写入（读-改-写为原子事务，或仅写 `{ user_config: { ..., [key]: value } }` 的部分字段，并在 dashboard 侧同样收敛到 patch API）。
- 置信度：medium
- 级别：medium

### F-03 `setInterval`/`setTimeout` 在 MV3 service worker 休眠时会被回收，keepalive 形同虚设

- 位置：`service_worker.ts:116-120`、`service_worker.ts:143-147`、`storage.ts:399-428`、`keepalive.ts:10-26`
- 现象：
  - MV3 SW 在 30 秒无事件后会被挂起，模块级 `setTimeout` / `setInterval` 会随之销毁。`initialize_agent_bridge` 用 `setTimeout(0)` 启动还好；但 `storage.ts` 的 `start_periodic_flush` 使用 `setInterval(FLUSH_INTERVAL_MS=1000)`——SW 一旦休眠，interval 即消失。
  - `keepalive.ts` 用 `chrome.alarms` 每 30 秒触发一次 alarm，但 alarm 监听器只是 `logger.debug`，没有任何实际"延长 SW 寿命"的副作用（alarm 触发会唤醒 SW，但唤醒后 SW 仍可能 30 秒后再次休眠，期间 `flush_interval` 是否重新注册不可靠）。
  - 结果：长时间无用户行为（鼠标键盘事件来自 content script 走 runtime.sendMessage，可勉强维持 SW 活跃）但仍有网络/CDP 事件涌入的场景下，periodic_flush 不可靠；events 长时间滞留内存 buffer，若 SW 终止则全丢。
- 影响：低活跃会话下数据丢失风险；`stop_capture` 的 `flush_all` 兜底有效，但崩溃/强制卸载场景无保护。
- 建议：
  - `flush_interval` 改用 `chrome.alarms`（最小周期 30 秒）做兜底，`setInterval` 仅做活跃期加速 flush。
  - keepalive alarm 触发时显式调用 `flush_all()`，把唤醒转换为副作用。
  - 文档化 SW 生命周期风险，必要时在 `stop_capture` 之外增加 `runtime.onSuspend` 兜底 flush（受 MV3 限制可能注册不到，但应尝试）。
- 置信度：high
- 级别：high

### F-04 IndexedDB 升级路径不删除旧 store，`CATEGORY_STORE_MAP` 未映射旧 store，历史数据成孤儿

- 位置：`storage.ts:46-138`（onupgradeneeded）、`storage.ts:247-257`（CATEGORY_STORE_MAP）
- 现象：
  - v1 schema 中存在 `sessions`、`events`、`console_logs`、`error_log` 四个旧 store。升级到 v3 时仅"keep if they exist"，没有任何迁移逻辑（无 read-then-write 到新 store），也没有在 `CATEGORY_STORE_MAP`、`delete_capture`、`flush_all` 中考虑旧 store。
  - 即升级后的扩展无法读取老版本采集到的任何 events/console/error 数据；`list_captures` 只能列出 v2+ 的 `captures` store record，老 `sessions` store 数据完全孤立。
  - 与 CLAUDE.md 硬约束"IndexedDB v3 升级路径不得丢 records"冲突——严格说没"丢"（数据还在），但等于不可访问。
- 影响：从 v1 升级的用户历史数据不可读、不可删；`delete_capture` 无法清理旧 store 中对应 session_id 的数据，导致 IDB 占用持续增长。
- 建议：
  - 在升级回调中显式迁移：读旧 `sessions`/`events` → 转换为 `CaptureRecord`/`CaptureEvent` 写入新 store；或提供"导入旧 session"工具。
  - 若决定不迁移，应在文档与 CHANGELOG 明确声明，并在 `delete_capture` 提供"清理旧 store"选项。
- 置信度：high
- 级别：medium（v1 升级路径并非主路径，但 CLAUDE.md 明确约束）

### F-05 `flush_store` 中 `JSON.stringify` 计算 byte 与 `update_bytes_written` 不一致，且 `MAX_SESSION_SIZE_BYTES` 限制未被强制执行

- 位置：`storage.ts:357-379`（flush_store+update_bytes_written）、`storage.ts:443-446`（check_storage_limit）
- 现象：
  - `flush_store` 每条 item 调用 `JSON.stringify(item).length`（字符数，非字节数）累加到 `bytes_written`，命名是 `bytes_written` 但实际是字符数；与 `MAX_SESSION_SIZE_BYTES`（500MB 字节）单位不匹配。
  - `check_storage_limit` 虽然导出，但本批次代码无任何调用点（grep 仅定义点）。即配额限制形同虚设：采集可无限增长直到 IDB quota 抛错（`tx.onerror`），而 `flush_store` 的 `reject` 会让该批次整批丢失（`batch = buf.splice(0)` 已从 buffer 摘出，但 tx 失败后未回填）。
- 影响：
  - 配额超额时数据丢失（整批 reject，buffer 已清空）。
  - 字节统计不精确，dashboard 展示与实际 IDB 占用偏差。
- 建议：
  - `flush_store` 在 `tx.onerror` 时把 `batch` 重新 unshift 回 buffer（或写入死信），避免整批丢。
  - 统一用 `new TextEncoder().encode(str).length` 或 `Blob([str]).size` 计字节。
  - 在 `handle_event`/`write_network_requests` 入口处调 `check_storage_limit`，超限触发 capture 自动 stop（与 CLAUDE.md "同一时间只允许一次活跃采集"对采集边界的精神一致）。
- 置信度：high
- 级别：high

### F-06 `flush_store` 没有事务串行化，多入口并发触发 `tx.oncomplete` 与 buffer 操作竞态

- 位置：`storage.ts:263-379`、调用方 `service_worker.ts:344/507/595/728` 等（write_events 来自不同回调）
- 现象：
  - `write_events` → `get_buffer` → `buf.push(...)` → `flush_store`（若超阈值）走 `buf.splice(0)` 清空 buffer，然后 `database.transaction(store_name, 'readwrite')` 异步写。
  - 期间若另一回调再次 push 并触发 flush，第二次 `buf.splice(0)` 会拿到新累积部分；两个事务并行（IDB 支持同 store 多事务，但若两次都 put 同 key，后写覆盖先写）。
  - 更严重：`handle_event` 每次 write 后立即 `await persist_stats()`，`persist_stats` 再 `update_capture` 触发 `captures` store 的 readwrite 事务；与同时进行的 `flush_store` 事务不冲突（不同 store），但高频率 `update_capture`（每个 event 都调用）会创建大量小事务，性能差且可能在 SW 临近休眠时大量事务未完成。
- 影响：
  - 高频 event（如 mouse_move 50ms 采样）下 IndexedDB 事务爆炸，性能下降。
  - `persist_stats` 失败时仅 log，无退避，可能持续失败刷屏日志。
- 建议：
  - `persist_stats` 节流（如 1 秒一次），不再每 event 调用。
  - 考虑把 stats 写入合并到 periodic_flush 周期。
- 置信度：high
- 级别：medium

### F-07 `stream_buffer.flush_all` 在 `for...of buffers.keys()` 中删除 key（通过 flush→chunks=[]，但 entry 不 delete），行为符合预期但 `remove` 的 `clearTimeout` 缺空判断

- 位置：`stream_buffer.ts:64-76`
- 现象：
  - `flush` 函数将 `entry.chunks=[]; entry.bytes=0`，但 `buffers.delete(request_id)` 未调用，entry 仍保留在 Map 中，`flush_all` 反复迭代所有 entry 是安全的（不会跳过元素，因为没在迭代中 delete）。这部分正确。
  - 但 `remove(request_id)` 的 `clearTimeout(entry!.timer!)` 使用 `!` 强解，仅在 `entry?.timer !== null` 判断后才执行；逻辑上安全。可读性上，`entry?.timer !== null` 当 entry 为 undefined 时为 `undefined !== null` → true，会进入分支并 `buffers.delete(undefined)`——不会异常但语义错误。
  - 真正问题：`flush` 调用后 entry 不被回收，长期采集下 `buffers.size` 持续增长（每请求一个 entry），内存泄漏。`network_capture.ts` 必须显式调 `remove(req_id)` 才能清理，本批次未审阅调用方是否覆盖所有路径。
- 影响：长时间采集 + 大量流式请求时，`buffers` Map 累积残留 entry。
- 建议：`flush` 后若 entry 空闲（chunks=[] 且 timer=null）应 delete entry；或在 `flush_all` 后遍历清理空 entry。
- 置信度：medium
- 级别：medium

### F-08 `stream_buffer` 的 `append` 在达到 `byte_threshold` 时 flush，但 flush 内 `on_flush` 同步调用可能在递归/重入场景下出问题

- 位置：`stream_buffer.ts:40-58`、消费方 `network_capture.ts:191`（on_flush 回调）
- 现象：
  - `append` → `flush` → 同步调 `on_flush` → 回调内若再次调 `append`（重入），会在迭代中修改 buffer。本批次未审计 `network_capture.ts` 的 on_flush 实现，但 `stream_buffer` 自身没有防重入保护。
  - 同时 `byte_threshold` 默认 16KB，对长 SSE 流（如 chat 流式响应）会触发频繁 flush；每次 flush 又触发下游 write_network_requests → IDB 事务，与 F-06 叠加。
- 影响：取决于消费方实现，潜在重入风险；性能上 flush 频次高。
- 建议：
  - 文档化"on_flush 不得在回调内同步调 append"。
  - 或将 `on_flush` 调用包装到 `queueMicrotask`，避免同步重入。
- 置信度：medium
- 级别：low

### F-09 `webrequest_handler.handle_completed` 的延迟路径在 `_deferred_cdp_index` 与 `deferred_web_requests` 之间缺乏原子性

- 位置：`webrequest_handler.ts:135-186`（deferred 写入）、`cdp_handler.ts:722-762`（try_resolve_deferred）
- 现象：
  - `handle_completed` 写入 `deferred_web_requests[deferred_key]` 后再循环写 `_deferred_cdp_index[cdp_id].add(deferred_key)`。这两步非原子。
  - 若在两步之间，CDP 端刚好完成 body 并调 `try_resolve_deferred`，则 `try_resolve_deferred` 通过 `_deferred_cdp_index.get(cdp_id)` 拿不到任何 deferred_key（因为还没注册），导致 CDP body 写入 `cdp_body_results` 但 deferred 永远不会被 resolve，最终走 timeout 路径 1500ms 后以 `not_enabled` 发出。
  - 反向时序：deferred 已注册但 CDP body 先到 → `try_resolve_deferred` 能 resolve，但 resolve 后 `handle_completed` 的 timer 仍在跑，timeout 时会再次 `send_to_background(build_network_event(..., 'not_enabled'))`，造成同一 requestId 发出两条记录（重复）。
- 影响：CDP body 与 webRequest 完成时序接近时出现 body 丢失或重复网络记录。
- 建议：
  - 注册 deferred 前先检查 `cdp_body_results` 是否已有匹配项；若已有，直接 resolve。
  - resolve 后立即 `clearTimeout(entry.timer)` 并 delete `deferred_web_requests[deferred_key]`，避免 timer 兜底重复发。
  - 把 `_deferred_cdp_index` 和 `deferred_web_requests` 视为一个原子单元，提供 `register_or_resolve` 单一入口。
- 置信度：high
- 级别：high

### F-10 `webrequest_handler` 的 `find_matching_cdp_request` 与 `find_cdp_candidates` 对 status_code=0 的"宽松匹配"可能错配

- 位置：`webrequest_handler.ts:261-323`
- 现象：
  - `find_cdp_candidates` 与 `find_matching_cdp_request` 都允许 `meta.status_code !== 0 && meta.status_code !== status_code` 时跳过——即 CDP 端尚未收到 response（status=0）时，认为任何 webRequest 状态都匹配。
  - 同 URL + 同 method 在并发场景下（如 polling 请求）会匹配到错误的 CDP body。`find_matching_cdp_request` 用 time diff（2000ms 窗口）取最优，但若两个并发请求时间接近，仍可能错配。
  - 错配后果：把 A 请求的 body 写到 B 请求的记录上，是数据正确性问题。
- 影响：高并发同 URL 请求的 body 张冠李戴。
- 建议：
  - 优先用 request hash/initiator 等更稳定键关联；时间窗配合多维度（总字节数、resource_type）。
  - 若无法消除错配，应在记录上标注 `correlation_confidence`，让下游可见风险。
- 置信度：medium
- 级别：medium

### F-11 `is_self_origin_url` 在 `webrequest_handler.ts` 与 `cdp_handler.ts` 重复定义，且过度宽泛

- 位置：`webrequest_handler.ts:325-336`、`cdp_handler.ts:705-712`（外部已见）、被 `network_capture.ts:17,26` 从 `cdp_handler` re-export
- 现象：
  - 两处实现相同：`hostname === '127.0.0.1' || hostname === 'localhost'`，会过滤所有本地服务（包括用户本地的开发服务器、Bridge、其他 MCP）。BUG-005 注释说明意图是过滤扩展自身 origin 与本地 Bridge URL，但实现把所有本地端口都过滤了。
  - 用户若采集的是本地开发站点（如 `http://localhost:3000` 的 Next.js dev server），其所有请求都会被静默丢弃，且无任何提示。
  - 同时 `webrequest_handler.ts` 定义的版本并未被本文件外的 `network_capture.ts` 使用（`network_capture.ts` 从 `cdp_handler` 导入），存在两份实现 drift 风险。
- 影响：
  - 本地开发场景的请求全部丢失（功能错误）。
  - 双份实现维护成本高。
- 建议：
  - 收敛到单一实现（导出一份）。
  - 改为只过滤扩展自身 origin（`chrome-extension://<id>`）与配置中明确的 Bridge URL（来自 `user_config.agent_bridge_url`），不按 hostname 全量过滤。
- 置信度：high
- 级别：high

### F-12 `service_worker` 的 `chrome.dbg = chrome.debugger` 全局别名属 hack，且未声明类型

- 位置：`service_worker.ts:82`
- 现象：`(chrome as any).dbg = (chrome as any).debugger` 在模块顶层副作用执行。注释解释"debugger 是 TS 保留字"。但全代码 grep `chrome.dbg` 仅此一处定义，未见消费方（本批次未审计 cdp_handler 是否通过 `chrome.dbg` 调用）。
- 影响：若 cdp_handler 等通过 `chrome.dbg.attach` 使用，需保证该副作用先于其他模块执行；ESM import 顺序不保证文件级 `chrome.dbg` 赋值早于其他模块使用。即使顺序巧合成立，也脆弱。
- 建议：删除别名，直接 `chrome.debugger`；TS 中 `debugger` 作属性访问不会触发保留字问题（保留字仅在变量名声明时受限）。
- 置信度：medium
- 级别：low

### F-13 `handle_message` 缺乏消息来源校验，扩展内任何 sender（含被注入的 content script）可触发敏感动作

- 位置：`service_worker.ts:153-250`
- 现象：`onMessage` 监听器不校验 `sender`，任何能向扩展 runtime 发消息的对象（包括恶意页面若获得扩展 ID，或被攻击的 content script）可触发 `start`/`stop`/`delete_capture`/`export_*`/`clear_app_logs`/`set_log_level` 等动作。
- 影响：在扩展被攻击或 content script XSS 的场景下，攻击者可清空日志、停止采集、删除历史数据。
- 建议：
  - 校验 `sender.id === chrome.runtime.id`。
  - 对破坏性操作（`delete_capture`、`clear_app_logs`）额外校验来源（仅接受 dashboard / popup 的 frame）。
- 置信度：medium
- 级别：medium

### F-14 `service_worker` `current_capture.stats` 直接 mutation，再 `update_capture(current_capture)`，IndexedDB 中存的是引用还是拷贝不确定

- 位置：`service_worker.ts:322-326`（赋值引用）、`service_worker.ts:596`（mutation + update）、`storage.ts:190-199`（update_capture）
- 现象：
  - `current_capture` 是内存对象。`update_capture` 内部 `store.put(capture)` 把对象结构化克隆到 IDB。每次 mutation + put 都正确序列化。但 `list_captures`/`get_capture` 返回的是 IDB 反序列化的新对象——若某处把 `get_capture` 返回值赋给 `current_capture`，则后续 mutation 与 IDB 中对象分离。
  - 本批次未见此类赋值（cleanup_stale_capture_state 把 `stale_capture` 当作临时变量更新后 `update_capture`，是安全的），但 `start_agent_bridge` → `bridge_deps.get_status` 返回 `current_capture_id` 字符串，无问题。
  - 真正风险：`get_capture_data` handler 调 `get_capture(capture_id)` 拿到对象直接返回给调用方（dashboard），若 dashboard 持有引用并 mutation，会污染下次 `get_capture` 的缓存——但 IDB 不缓存，每次读都新建，所以问题不存在。
- 影响：当前批次安全；属代码异味，未来若引入缓存层易踩坑。
- 建议：在 `get_capture_data` 返回前做深拷贝（`structuredClone(capture)`），明确边界。
- 置信度：low
- 级别：low

### F-15 `webrequest_handler.handle_completed` 的"无 dbg_tab 但配置开启 body"分支返回 `body_capture_mode: 'extension_cdp'`

- 位置：`webrequest_handler.ts:91-102`、`webrequest_handler.ts:254-256`
- 现象：
  - 当 `state.config.capture_response_body` 为 true 但 `state.dbg_tab_id === null` 时，`handle_completed` 走 immediate 分支发出 `build_network_event`，但 `build_network_event` 在 `body_capture_mode` 字段返回 `state.config.capture_response_body ? 'extension_cdp' : 'none'`——即此时标 `extension_cdp`，但实际根本没有 CDP 连接。
  - 同样在 `cdp_match_found_but_no_result` 与 deferred timeout 分支，body_status 是 `not_enabled` 但 `body_capture_mode` 仍是 `extension_cdp`，标签错误。
- 影响：下游 dashboard 与 export 的统计字段（"已开启 CDP body"计数）虚高；用户看到 mode=extension_cdp 但 body 全空，误判为 CDP 失败。
- 建议：`body_capture_mode` 应反映实际产出 body 的方式（无 CDP 时为 `none` 或 `web_request_only`）。
- 置信度：high
- 级别：medium

### F-16 `extract_request_body` 对 `enabled === undefined` 的"静默放行"分支含混

- 位置：`network_webrequest.ts:37-43`（被 `webrequest_handler.handle_before_request:40` 调用）
- 现象：调用方 `handle_before_request` 的 `state.config.capture_request_body` 来自 `NetworkCaptureConfig`，始终有 boolean 值。但 `extract_request_body` 在 `enabled === undefined` 时既不报错也不进入 `if (enabled === false)`，会继续尝试解析 body。注释写"Caller must pass config explicitly when needed"——意图模糊。当前调用方已传 boolean，不会触发该分支，但作为公共工具函数，行为不清晰。
- 影响：未来误用（忘记传参）会得到与"未启用"相反的结果（即采集了 body）。
- 建议：`enabled === undefined` 时 throw 或显式当 false 处理；删除空 if 分支。
- 置信度：medium
- 级别：low

### F-17 `service_worker.handle_event` 的 `relative_time_ms > 10_000_000_000` 阈值含义不明

- 位置：`service_worker.ts:590-592`
- 现象：判断条件"relative_time_ms > 10_000_000_000"重置为 `Date.now() - start_time`。10_000_000_000 ms ≈ 115 天，远超采集上限 24h（`MAX_SESSION_DURATION_MS`）。该分支形同虚设，且不解决 `absolute_time` 与 `start_time` 时钟源不一致（不同 tab 的 content script `Date.now()` 与 background `start_time` 都是同主机时钟，应一致；但若 content script 传了非 epoch 的字符串解析出错，`Number.isFinite` 已过滤）。
- 影响：无实际效果，仅增加阅读成本。
- 建议：删除或改为针对 `negative` relative_time 的校正（`if (event.relative_time_ms < 0) event.relative_time_ms = 0`）。
- 置信度：medium
- 级别：low

### F-18 `service_worker` 的 `tabs_send_message_retry` 在 stop 流程的"无差别广播"会向所有 tab 发 stop，包括非 capturable

- 位置：`service_worker.ts:538-549`
- 现象：stop 时遍历 `chrome.tabs.query({})` 全部 tab（包括 chrome://、about:、settings），对每个发 `{action:'stop'}`。content script 在这些 tab 未注入，sendMessage 必然失败，重试 2 次后 warn 日志。start 流程（`service_worker.ts:452-468`）已用 `/^https?:\/\//.test(t.url)` 过滤，但 stop 没复用该过滤。
- 影响：每次 stop 产生多条无意义 warn 日志；非 capturable tab 的 content script 若意外注入（dev 模式）也可能收到 stop。
- 建议：stop 同样按 capturable 过滤，或直接 try-catch 不重试。
- 置信度：high
- 级别：low

### F-19 `service_worker.start_capture` 中 `tab_id` 变量在 `if (config.capture_console)` 块内重复声明

- 位置：`service_worker.ts:281`（外层 `const tab_id`）、`service_worker.ts:360`（内层 `const tab_id = tabs[0].id`）
- 现象：外层 `const tab_id` 已在 281 行声明（`active_tab?.id ?? 0`），359-388 的 if 块内又用 `const tab_id = tabs[0].id`，二者在不同作用域（外层函数作用域 vs if 块作用域），合法但易混淆——内层 tab_id 与外层可能不同（若 `tabs[0]` 与 `active_tab` 不一致，理论上不会，但语义模糊）。
- 影响：可读性差，未来修改易引入 shadow bug。
- 建议：内层复用外层 `tab_id`，或重命名内层为 `cdp_tab_id`。
- 置信度：medium
- 级别：low

### F-20 `storage.delete_capture` 不清理 `app_logs` store，但 CLAUDE.md 未要求关联，可能是设计

- 位置：`storage.ts:201-241`
- 现象：`delete_capture` 的 store_names 列表不包含 `APP_LOGS`。app_logs 是全局日志（不按 capture_id 索引），删除单个 capture 时不应清理——设计正确。但 `app_logs` store 也没有 `capture_id` 索引（`storage.ts:130-137`），无法按 capture 关联清理。
- 影响：无问题；本项仅记录审阅结论。
- 置信度：high
- 级别：无需修改（确认项）

### F-21 `webrequest_handler` 整体未对 MV3 `webRequest` 权限做防御性检查

- 位置：`webrequest_handler.ts` 全文
- 现象：本文件是 handler 函数集，listener 注册应在 `network_capture.ts` 或 `network_webrequest.ts`。但本文件假设 `state.config`/`state.pending_requests` 等已就绪，若 listener 在 `start_capture` 前被触发（理论上 webRequest 是全局监听，不会仅限采集期间），`handle_before_request` 的 `if (!state.is_capturing) return` 提供保护。
- 影响：保护充分；本项确认。
- 置信度：high
- 级别：无需修改

### F-22 `service_worker` 中 `category_for_event_type` 与 `event.category` 的赋值顺序存在 fallback 隐患

- 位置：`service_worker.ts:580-589`
- 现象：
  ```ts
  event.capture_id = current_capture_id;
  event.category = event.category || category_for_event_type(event.type);
  ```
  - 若 content script 传来的 event 已带 `category` 字段且与 `category_for_event_type(type)` 不一致，则以 content script 的为准。无强一致性校验。
  - `write_events` 再用 `event.category` 路由到 store。若 content script 注入恶意/错误 category（如 `'capture_lifecycle'`），事件会被写入 `CAPTURE_LIFECYCLE_EVENTS` store，污染生命周期事件流。
- 影响：信任边界的扩展内容可绕过分类。
- 建议：background 应始终用 `category_for_event_type(type)` 强制分类，不信任 content script 传入的 category；或在 `category_for_event_type` 无法识别时拒绝事件。
- 置信度：medium
- 级别：medium

---

## 汇总

| 级别 | 数量 | 编号 |
| --- | --- | --- |
| critical | 0 | — |
| high | 6 | F-01, F-03, F-05, F-09, F-11, F-15(归 medium) |
| medium | 8 | F-02, F-04, F-06, F-07, F-10, F-13, F-15, F-22 |
| low | 6 | F-08, F-12, F-16, F-17, F-18, F-19 |
| 确认项 | 2 | F-20, F-21 |

最严重的三类系统性问题：

1. **采集状态与 IndexedDB/`storage.local` 双真相源不一致**（F-01、F-02、F-22）：影响生命周期正确性与配置一致性。
2. **MV3 SW 休眠下 timer 不可靠**（F-03、F-06）：影响数据持久化稳定性。
3. **CDP body ↔ webRequest 关联与延迟写入的并发竞态**（F-09、F-10、F-15）：影响 body 数据正确性与统计准确性。

非系统性问题集中在重复实现（F-11、F-12）、防御性边界（F-13、F-18）与可读性（F-17、F-19）。

---

## 附录：本批次文件交叉依赖审计

- `service_worker.ts` → `storage.ts`：写入路径（write_events / write_network_requests / write_console_events / flush_all / create_capture / update_capture）依赖 `storage.ts` 的缓冲机制。F-05、F-06 反映缓冲-事务边界脆弱。
- `service_worker.ts` → `keepalive.ts`：F-03 指出 keepalive 形同虚设。
- `webrequest_handler.ts` → `cdp_handler.ts`（外部依赖）：类型 `PendingRequest`/`CdpRequestMeta`/`CdpBodyResult`/`NetworkCaptureConfig`/`NetworkEventPayload` 来自 cdp_handler；运行期共享 state 对象的 `deferred_web_requests`/`_deferred_cdp_index`/`cdp_body_results` 三个 Map。F-09 反映这三 Map 操作非原子。
- `stream_buffer.ts` → `network_capture.ts`/`cdp_handler.ts`（消费方）：本批次只审 buffer 本身，F-07、F-08 反映 entry 回收与重入保护不足。

未审计但建议下一批次覆盖：`cdp_handler.ts` 完整逻辑、`network_capture.ts` 的 stream_buffer 调用路径、`agent_bridge_client.ts` 对 `start_capture` 的并发触发。
