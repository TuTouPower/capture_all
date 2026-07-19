# src_extension_04 独立审阅报告

## 模型依据

模型依据：继承 default_model，底层具体模型不可观测。

## 审阅范围

依据 `/home/karon/karson_ubuntu/capture_all/docs/review_20260719_0859/MANIFEST.md` 中 `src_extension_04` 清单，逐文件、逐段、逐函数审阅以下全部源文件：

- `src/extension/background/service_worker.ts`（960 行）
- `src/extension/background/storage.ts`（559 行）
- `src/extension/background/stream_buffer.ts`（83 行）
- `src/extension/background/webrequest_handler.ts`（336 行）

未读取本批次其他审阅报告，未运行构建或测试，未修改源文件。

## 高优先级问题（CRITICAL / HIGH）

### 1. Service worker 重启后活跃采集状态不会恢复，且清理逻辑依赖未由本模块写入的状态

- 位置：`src/extension/background/service_worker.ts:84-88,122-147,267-327,479-558`
- 级别：CRITICAL
- 现象：活跃状态仅保存在模块内存变量 `is_capturing`、`current_capture`、`current_capture_id`、`start_time`。`cleanup_stale_capture_state()` 从 `chrome.storage.local` 读取 `is_capturing` 和 `current_capture`，但 `start_capture()`、`stop_capture()` 均未写入或清除这两个持久化键。Bridge 发起采集时也直接调用 `start_capture()`，无法依赖 popup 代写状态。
- 影响：MV3 service worker 被浏览器回收后，内存状态重置为未采集；IndexedDB 中旧 CaptureRecord 仍可能保持 `capturing`，旧内容脚本及浏览器监听器状态无法可靠恢复或结束。随后可再启动新采集，违反“同一时间只允许一次活跃采集”，并造成旧采集永久悬挂、数据跨采集混杂或尾部丢失。
- 建议：将活跃采集元数据作为 service worker 自身负责的持久状态，在创建 CaptureRecord 与启动子系统前后按明确事务阶段写入；启动时先从持久状态和 IndexedDB 共同恢复或终止旧采集。恢复/清理完成前禁止处理 `start`。不要依赖其他 UI 上下文维护核心状态。
- 置信度：高（99%）

### 2. start/stop 无串行化，存在同时启动两个采集及“旧 stop 拆掉新 start”竞争

- 位置：`src/extension/background/service_worker.ts:267-327,479-558`
- 级别：CRITICAL
- 现象：`start_capture()` 仅在入口检查 `is_capturing`，随后在设置该标志前执行多次 `await`（查询 tab、`create_capture`）。两个并发 start 可同时通过检查并分别创建 CaptureRecord、启动监听器。`stop_capture()` 又在清理任何子系统前立即把 `is_capturing` 设为 `false`；清理期间新 start 可进入。旧 stop 最后执行 `flush_all()`、`current_capture = null`、清理共享监听器及 CDP，可能作用于刚启动的新采集。
- 影响：可同时存在多个 `capturing` 记录；模块全局状态被后完成者覆盖；旧 stop 可停止新采集网络/CDP/cookie/console 子系统并清空新采集指针。该竞争直接破坏单活约束和数据归属。
- 建议：为 start/stop 使用单一异步互斥或显式状态机（`idle -> starting -> capturing -> stopping -> idle`）。在进入 `starting` 时同步占位；`stopping` 完成前拒绝或排队 start。所有异步步骤携带不可变 generation/capture_id，提交结果前验证 generation 仍有效。
- 置信度：高（99%）

### 3. MV3 下事件先进入内存缓冲再确认成功，service worker 回收会静默丢数据

- 位置：`src/extension/background/storage.ts:263-317,320-351,357-420`；`src/extension/background/service_worker.ts:570-602,683-733`
- 级别：HIGH
- 现象：多数写入函数只把事件放入模块内存 `buffers`；不足 `FLUSH_BATCH_SIZE` 时不写 IndexedDB。调用方随后更新 stats 并向消息发送方返回成功。周期 flush 使用 `setInterval`，但 MV3 service worker 可在定时器触发前被终止，定时器不能提供存活保证。
- 影响：小流量采集或最后一个 flush 周期内的数据可永久丢失，而 CaptureRecord stats 已增加，形成统计与实际数据不一致。service worker 重启后内存缓冲无法恢复。
- 建议：不要把未持久化内存批次作为已成功接收。可使用短生命周期 IndexedDB 事务直接落库，或建立持久化队列/写前日志；批处理只优化事务合并，不得让成功确认早于耐久写入。至少在每个消息处理 promise 完成前保证对应数据已进入 IndexedDB。
- 置信度：高（98%）

### 4. flush 失败时已从缓冲移除整个批次，数据不可重试且容量统计提前增加

- 位置：`src/extension/background/storage.ts:357-378,434-446`
- 级别：HIGH
- 现象：`flush_store()` 在事务开始前执行 `buf.splice(0)`；事务错误时仅 reject，不把 batch 放回缓冲。`update_bytes_written()` 在 `store.put()` 后、事务提交前执行，即使事务最终 abort 仍累计容量。
- 影响：Quota、连接关闭、序列化/DataError 或任一 put 导致事务 abort 时，整批事件静默永久丢失；容量计数则可能虚高。周期 flush 又吞掉错误（417 行），不会留下可诊断或重试状态。
- 建议：仅在 `tx.oncomplete` 后确认批次；失败时按原顺序放回缓冲或写入持久失败队列。容量增量也应在事务提交后一次性更新。周期 flush 至少记录结构化错误并实施受限重试。
- 置信度：高（99%）

### 5. stop 先禁止事件接收并完成 CaptureRecord，再停止生产者，尾部事件必然存在丢失窗口

- 位置：`src/extension/background/service_worker.ts:479-553,570-572,605-620,683-684,717-718`
- 级别：HIGH
- 现象：`stop_capture()` 首先设 `is_capturing = false`，随后写 stopped event、把 CaptureRecord 更新为 completed，之后才依次停止 network/body/cookie/console/exception。所有回调入口看到 `is_capturing === false` 后直接返回。
- 影响：stop 开始到各生产者真正停止之间已产生或正在异步处理的网络、body、cookie、console、exception 事件被丢弃。CaptureRecord 的 stats、结束时间及 stopped lifecycle event可能早于真实采集终点，数据完整性和时序均不可信。
- 建议：进入 `stopping` 后拒绝新用户命令，但继续接受当前 generation 的生产者回调；先停止生产者并等待其 drain，再写 stopped lifecycle event、更新最终 stats/ended_at，最后 flush 并切换到 `idle`。
- 置信度：高（98%）

### 6. start 中途失败无回滚，可留下半启动采集和永久 `capturing` 记录

- 位置：`src/extension/background/service_worker.ts:316-476`
- 级别：HIGH
- 现象：只有 `create_capture()` 被局部 try/catch 包裹。其后已设置全局 active 状态并启动 keepalive、flush、network、CDP、cookie 等多个子系统；任一后续 await（例如 `update_capture`、tab 查询、body coordinator）抛错都会使 start 消息失败，但没有逆序清理或将 CaptureRecord 标记失败/完成。
- 影响：调用方收到启动失败，但实际可能仍在采集；监听器、debugger、timer 残留；后续 start 被 `is_capturing` 拒绝，或重启后留下悬挂数据。
- 建议：把启动实现为可回滚事务式流程，记录已完成步骤；异常时逆序停止所有已启动子系统、flush 已产生数据、更新 CaptureRecord 终态并清空持久/内存状态。区分可降级能力失败与整体启动失败。
- 置信度：高（97%）

### 7. 异步 tab 监听器跨 stop/start 后继续执行，可把旧事件写入新采集并重启已停止子系统

- 位置：`src/extension/background/service_worker.ts:745-827,835-856,860-929`
- 级别：HIGH
- 现象：监听器只在进入时检查一次 `is_capturing`，随后执行 `await chrome.tabs.get()`、消息重试、CDP/body 启动等异步操作。await 返回后不核对 capture_id/generation。此期间 stop 及新 start 可完成，代码会读取已变化的全局 `current_capture_id`、`current_config`、`start_time`。
- 影响：旧采集触发的 tab_switch/tab_url_change 可归入新采集；旧异步 continuation 可在 stop 后重新 attach debugger 或启动 body capture；`update_capture_body_state()` 可能更新错误 CaptureRecord。
- 建议：监听器入口捕获 `capture_id` 与 generation；每个 await 后验证仍处于同一 generation，失败则立即退出。事件构造使用捕获值，不读取可变全局值。start/stop 状态机需使过期 continuation 可识别。
- 置信度：高（96%）

### 8. delete_capture 跨多个独立事务逐库删除，无法保证原子性，且删除请求错误未完整处理

- 位置：`src/extension/background/storage.ts:201-241`
- 级别：HIGH
- 现象：CaptureRecord 与八类事件分别通过九个独立 readwrite 事务顺序删除。任一步失败会保留部分 store 数据。游标分支对 `cursor.delete()` 返回请求未设置错误处理，并在游标结束时 resolve，而非等待 `tx.oncomplete`。
- 影响：删除过程中 service worker 终止、Quota/InvalidState/事务 abort 时，可出现 CaptureRecord 已删但事件孤儿残留，或部分分类已删、部分仍在。函数甚至可能在事务最终失败前报告成功。
- 建议：在一个覆盖全部相关 object store 的 readwrite transaction 内完成删除；统一监听 `tx.oncomplete/onabort/onerror`。处理每个 delete 请求错误。若数据量要求分批删除，应使用可恢复 tombstone/进度状态，而非暴露半删除结果。
- 置信度：高（99%）

### 9. stream buffer 无异步背压/失败协议，flush 后立即清空；回调失败会丢 chunk

- 位置：`src/extension/background/stream_buffer.ts:6-10,27-38,40-58,64-68`
- 级别：HIGH
- 现象：`on_flush` 类型固定为同步 `void`。`flush()` 在调用回调前已清空 chunks/bytes；若回调同步抛错或实际启动异步写入后失败，buffer 无法恢复数据。连续达到阈值时也不会等待前一次 flush 入队/落库，缺少高水位、排队上限或拒绝策略。
- 影响：流式 body 写入失败时静默丢片段；生产速度高于消费速度时，下游异步队列可无界增长，内存压力无法反馈到上游。timer 回调抛错还可能形成未捕获异常。
- 建议：令 `on_flush` 返回 Promise，按 request_id 串行 flush；成功后才丢弃批次，失败时保留/重试或明确标记 body truncated/failed。增加全局及单请求高水位、最大累计字节和清理策略。
- 置信度：高（95%）

### 10. stream buffer 正常 flush 后不删除空 entry，按 request_id 永久增长

- 位置：`src/extension/background/stream_buffer.ts:25-38,60-82`
- 级别：HIGH
- 现象：`flush()` 仅清空 entry 内容，不从 `buffers` Map 删除；`force_flush()`、timer flush、`flush_all()` 均不清理 entry。只有外部显式调用 `remove()` 才删除，但接口未把“连接结束后必须 remove”编码为不变量。
- 影响：长时间采集大量请求时，每个 request_id 至少永久保留一个对象，Map 持续增长。MV3 service worker 被 keepalive 维持时可形成显著内存泄漏；`size()` 还会把已空 entry 计为活跃流。
- 建议：区分 `flush` 与 `finish`；连接结束必须原子执行 flush + delete。若 flush 后仍允许后续 chunk，可在 timer flush 后保留，但需 idle TTL；force_flush/finish 应默认删除。
- 置信度：高（96%）

### 11. CDP/webRequest 关联忽略 tab/frame/request 唯一关系，可能把另一个请求响应体绑定到当前请求

- 位置：`src/extension/background/webrequest_handler.ts:104-185,261-323`
- 级别：HIGH
- 现象：匹配条件仅为 method、status、去掉 query 后的 base URL 与 2 秒时间窗；候选查找甚至不使用时间。没有 tab_id、frame_id、完整 URL/query 或可证明唯一的关联键。同一 base URL 的并发请求会竞争同一 CDP result；非 debugger tab 的 webRequest 还可能与 debugger tab 的 CDP meta 匹配。
- 影响：响应 body 可被写入错误请求，造成数据真实性破坏；跨 tab 场景甚至可能把一个页面敏感响应体归入另一个页面请求，属于隐私和数据隔离风险。删除匹配结果后，真正对应请求只能超时降级。
- 建议：优先使用浏览器提供的稳定关联标识；无法直接关联时，至少加入 tab/frame、完整未脱敏 URL、method、精确时序、redirect 序号及唯一消费约束。歧义候选超过一个时不得猜测，应标记 `failed/ambiguous` 且不附 body。
- 置信度：高（94%）

## 中低优先级问题（MEDIUM / LOW）

### 12. IndexedDB CRUD 多处以 request success 代替 transaction commit

- 位置：`src/extension/background/storage.ts:146-155,157-166,190-199`
- 级别：MEDIUM
- 现象：`create_capture()`、`update_capture()` 在 `request.onsuccess` 时 resolve，未等待 `tx.oncomplete`，也未监听 `tx.onabort`。IndexedDB request 成功不等于整个事务最终提交成功。
- 影响：事务随后因 abort、连接关闭或其他错误失败时，上层已继续启动采集或报告状态保存成功。核心状态机可与持久层不一致。
- 建议：写操作统一以 `tx.oncomplete` resolve，以 `tx.onerror/tx.onabort` reject；request error 只用于补充根因。
- 置信度：高（97%）

### 13. IndexedDB 初始化缺少并发 open 复用、versionchange 与 blocked 处理

- 位置：`src/extension/background/storage.ts:27-46,138-140`
- 级别：MEDIUM
- 现象：`db` 赋值前的并发 `init_db()` 会分别调用 `indexedDB.open()`；连接未注册 `onversionchange` 自动 close，也没有 `request.onblocked` 处理或日志。
- 影响：启动阶段多个入口并发初始化时产生重复连接；未来版本升级可能被旧扩展上下文连接阻塞且无诊断，导致升级长期挂起。该风险需多上下文/升级场景运行时验证。
- 建议：缓存单一 `opening_promise`；成功后设置 `db.onversionchange = () => db.close()` 并清空引用；处理 `onblocked`，输出可操作日志。
- 置信度：中高（88%）

### 14. v1 旧 stores 仅保留不迁移，旧数据对新 CRUD/API 不可见

- 位置：`src/extension/background/storage.ts:46-70,72-138,532-559`
- 级别：MEDIUM
- 现象：升级时保留 `sessions/events/console_logs/error_log`，但未把旧 records 迁移到 v2/v3 stores；deprecated alias 只是把旧函数名映射到新 Capture CRUD，不读取旧 stores。
- 影响：升级不物理删除旧数据，但旧采集无法通过 `list_captures/get_capture` 访问，形成“数据仍占空间但用户不可见”的逻辑丢失。是否必须展示 v1 数据需结合发布过的 schema 与产品升级承诺确认。
- 建议：若需旧数据兼容，在 upgrade transaction 内做可重入迁移，或提供明确只读兼容查询；记录迁移版本及失败策略。若明确不支持旧数据，应删除误导性 alias 并在升级说明中声明。
- 置信度：中（82%）

### 15. 容量统计仅存在内存、仅在 flush 时累计，重启后限额失效

- 位置：`src/extension/background/storage.ts:263-264,368-373,434-446`
- 级别：MEDIUM
- 现象：`bytes_written` 是 service worker 内存 Map，不从 IndexedDB 恢复；缓冲但未 flush 的数据也不计入。JSON 字符串字符长度还不是实际 UTF-8 字节数。
- 影响：service worker 重启后已写入大采集的 size 变为 0，`check_storage_limit()` 可继续放行；多字节文本估算偏低。若限额用于保护存储，无法可靠执行。
- 建议：把累计字节持久化到 CaptureRecord，事务提交后更新；启动恢复时读取。使用 `TextEncoder` 或实际 Blob 大小形成一致字节口径，并计入待写缓冲。
- 置信度：高（96%）

### 16. stop 后未清空 current_capture_id/start_time/current_config，Bridge 状态继续暴露旧 active_capture_id

- 位置：`src/extension/background/service_worker.ts:169-178,554-558,942-949`
- 级别：MEDIUM
- 现象：stop 只清空 `current_capture`，未把 `current_capture_id` 设为 null，也未重置 start_time/config。Agent bridge `get_status()` 直接返回 `{ active_capture_id: current_capture_id }`，不检查 `is_capturing`。
- 影响：停止后 Bridge 仍可能报告旧采集为 active，Agent 可能错误拒绝新任务、重复 stop 或把后续操作指向已完成采集。
- 建议：在 stop 最终原子状态切换时同时清空全部上下文字段；Bridge 状态由状态机派生，仅 `capturing/starting/stopping` 返回 active id。
- 置信度：高（99%）

### 17. delete_capture 消息允许删除当前活跃采集

- 位置：`src/extension/background/service_worker.ts:181-185`
- 级别：MEDIUM
- 现象：消息处理直接调用 `storage_delete_capture(message.capture_id)`，未检查目标是否为当前活跃采集，也未先 stop。
- 影响：活跃 CaptureRecord 可被删除，但采集回调继续向各事件 store 写入，形成无主事件；stop 后 `update_capture(current_capture)` 又可能重新创建 CaptureRecord，产生不可预测结果。
- 建议：活跃 capture_id 删除应返回明确错误；如产品允许“一键停止并删除”，必须串行执行 stop、drain、原子删除。
- 置信度：高（98%）

### 18. webRequest error 路径直接丢弃请求，不生成失败网络事件

- 位置：`src/extension/background/webrequest_handler.ts:188-192`
- 级别：MEDIUM
- 现象：`handle_error()` 仅从 `pending_requests` 删除条目，未构造包含 `error_text`、耗时、headers/request body 的 NetworkRequestData。
- 影响：DNS、连接拒绝、TLS、取消等失败请求完全不出现在采集结果中，网络时间线和错误诊断缺项；已采集请求 body/headers 也被丢弃。
- 建议：在错误回调生成终态网络事件，设置 `status_code = null`、`error_text = details.error`、body status 与 capture_method，并完成相关 CDP/deferred 索引清理。
- 置信度：高（97%）

### 19. 自身请求过滤扩大到所有 localhost/127.0.0.1，用户本地应用请求全部漏采

- 位置：`src/extension/background/webrequest_handler.ts:36-38,325-335`
- 级别：MEDIUM
- 现象：`is_self_origin_url()` 把任意端口的 `localhost` 和 `127.0.0.1` 都视为 Bridge/开发服务器，不校验配置中的 Bridge origin/path。
- 影响：采集本地 Web 应用、API、测试服务时，所有相关请求被静默排除；范围远大于“扩展自身与 Bridge 日志端点”。
- 建议：仅排除扩展 origin，以及从已验证配置解析出的精确 Bridge origin/必要路径；不要按整个 hostname 排除。需防止配置被恶意扩大过滤范围。
- 置信度：高（96%）

### 20. webRequest 响应体存在时仍不填写字节数和编码，导致 stats 低估

- 位置：`src/extension/background/webrequest_handler.ts:242-247`；`src/extension/background/service_worker.ts:707-711`
- 级别：MEDIUM
- 现象：`build_network_event()` 无论 `response_body` 是否存在，均设置 `response_body_encoding: null`、`response_body_bytes: null`。service worker 依赖 `response_body_bytes` 累加 `total_body_bytes`。
- 影响：已捕获响应体不计入 CaptureRecord body 统计；导出或 UI 无法可靠判断编码与大小。
- 建议：根据 body result 的真实编码信息填写 encoding；按实际编码后的字节长度填写 bytes。base64 与 UTF-8 必须区分，不能统一按字符串长度。
- 置信度：高（94%）

### 21. stream_buffer.remove 对不存在 request_id 会抛 TypeError

- 位置：`src/extension/background/stream_buffer.ts:70-76`
- 级别：LOW
- 现象：条件 `entry?.timer !== null` 在 `entry` 为 undefined 时结果为 true（`undefined !== null`），随后 `entry!.timer!` 解引用 undefined。
- 影响：重复清理、乱序 connection-end 或未知 request_id 清理会抛异常，可能中断上层资源回收。
- 建议：改为显式 `if (entry?.timer != null) clearTimeout(entry.timer);`，随后幂等 delete。为重复 remove 增加行为测试。
- 置信度：高（99%）

### 22. deferred timeout 使用 `not_enabled` 表示实际匹配失败，状态语义错误

- 位置：`src/extension/background/webrequest_handler.ts:135-173`
- 级别：LOW
- 现象：已启用 response body capture 且进入 CDP 等待后，超时仍把 `response_body_status` 写为 `not_enabled`。
- 影响：统计和诊断会把关联失败/超时误报为用户未启用功能，掩盖 CDP 或关联算法故障。
- 建议：使用现有明确失败/超时状态；若类型暂不支持，应扩展枚举并保留失败原因。
- 置信度：高（98%）

## 改进建议

1. 先建立唯一采集状态机与异步互斥；所有 start/stop、tab listener、Bridge 命令通过同一串行入口。
2. 把 active capture generation、capture_id、启动阶段持久化；service worker 启动先恢复/清理，再开放消息处理。
3. 将“事件接收成功”定义为 IndexedDB transaction 已提交；内存 batch 只能作为受控优化，不作为唯一副本。
4. stop 顺序统一为：阻止新控制命令 → 停止生产者 → 等待回调/drain → 写 stopped event 与最终 stats → flush/commit → 清理状态。
5. IndexedDB 写、批量删除、容量更新统一以 transaction commit 为成功边界；补充 abort、blocked、versionchange 路径。
6. stream 使用 per-request 串行异步队列、最大内存阈值、finish/abort 幂等清理与失败状态。
7. 网络请求关联无法证明唯一时宁可标记 ambiguous，不应猜测并绑定可能含敏感信息的 body。

## 不确定项 / 可能误报

1. `storage.ts:46-138` 的旧 store 未迁移问题取决于历史正式发布版本是否曾写入 v1 schema，以及产品是否承诺在 UI/API 中继续访问旧数据；“物理不删除”本身成立，但“必须迁移”需产品契约确认。
2. `webrequest_handler.ts:104-185` 中 CDP meta 是否已在其他文件预先按 tab 隔离，本次严格范围内不可确认；当前接口与本文件匹配逻辑未使用 tab/frame，跨请求误关联风险仍成立。
3. `stream_buffer.ts` 外部调用方是否始终在连接结束后调用 `remove()`，本次严格范围内不可确认；即便如此，接口本身不保证 finish 清理，异常/漏调路径仍会泄漏。
4. `init_db()` 并发 open 在多数浏览器实现中可能最终成功，主要问题是重复连接和未来升级阻塞，属于设计风险，需多上下文升级测试验证。
