# src_extension_02 审阅报告

**审阅人**: Haiku   **日期**: 2026-07-19   **批次**: review_20260719_0859

## 清单

| 文件 | 行数 |
|------|------|
| `src/extension/background/cdp_handler.ts` | 805 |
| `src/extension/background/console_capture.ts` | 162 |
| `src/extension/background/cookie_capture.ts` | 89 |
| `src/extension/background/exception_capture.ts` | 160 |
| `src/extension/background/exporter.ts` | 394 |
| `src/extension/background/external_cdp_bridge_client.ts` | 152 |
| `src/extension/background/keepalive.ts` | 27 |

---

## 一、CDP（cdp_handler.ts）

### CDP-01 `schedule_orphan_check` 超时硬编码 magic number

- **位置**: `cdp_handler.ts:800` 行 `setTimeout` 调用
- **现象**: setTimeout 第三个参数写死 `3000`，仅以注释 `// ORPHAN_TIMEOUT_MS` 标注，文件底部同时导出了常量 `ORPHAN_TIMEOUT_MS = 3000`
- **影响**: 常量和实际调用值解耦，未来若调整常量值，此处超时不会跟随变化，造成行为不一致
- **建议**: 将 `setTimeout(..., 3000)` 改为 `setTimeout(..., ORPHAN_TIMEOUT_MS)`
- **置信度**: 高
- **级别**: 低

### CDP-02 orphan check 回调触发时未校验采集是否已停止

- **位置**: `cdp_handler.ts:768-800` `schedule_orphan_check` 函数
- **现象**: 3 秒延迟回调执行时，仅检查 `state.on_cdp_body_event` 是否存在，未检查 `state.is_capturing`。若采集在 3 秒内已停止，仍会尝试通过 `state.on_cdp_body_event` 发送数据
- **影响**: 采集停止后仍可能产生 orphan 事件回调。虽然上游 `on_cdp_body_event` 在停止后可能已被 clear，但缺少显式守卫让行为依赖隐式状态
- **建议**: 回调开头增加 `if (!state.is_capturing) return;` 守卫
- **置信度**: 中
- **级别**: 中

### CDP-03 orphan check 中 `on_cdp_body_event` 为 null 时未清理 state

- **位置**: `cdp_handler.ts:769`
- **现象**: `if (!state.on_cdp_body_event) return;` 在 return 前未执行 797-799 行的清理逻辑（`cdp_request_meta.delete`, `cdp_body_results.delete`, `_deferred_cdp_index.delete`）
- **影响**: orphan 数据在 state map 中泄漏，积累后影响内存。虽然每次停止采集会重建 state，但长采集场景（24 小时上限）仍有风险
- **建议**: 将清理逻辑提取到 return 之前执行
- **置信度**: 高
- **级别**: 中

### CDP-04 `is_self_origin_url` 过滤范围过宽

- **位置**: `cdp_handler.ts:705-716`
- **现象**: 函数同时过滤 `chrome-extension://` 前缀 和所有 `127.0.0.1` / `localhost` 的请求。本地开发服务器（如 `http://localhost:3000`）的流量也会被静默丢弃
- **影响**: 用户若需要在 localhost 上采集自己开发的应用网络请求，CDP body 采集路径会完全跳过这些请求。注：webRequest 路径仍可捕获元数据，仅 CDP 路径受影响
- **建议**: 收回 localhost 过滤范围，或改为仅过滤 Bridge 端口（`http://127.0.0.1:{bridge_port}`）。至少将此限制写入文档
- **置信度**: 高
- **级别**: 高

### CDP-05 `Network.streamResourceContent` 失败后 stream_buffer 未清理

- **位置**: `cdp_handler.ts:299-304`
- **现象**: `Network.streamResourceContent` catch 分支仅设置 `response_body_status = 'partial'`，未清理 `state.streaming_requests` 中的 `req_id`，也未调用 `stream_buffer_instance?.force_flush(req_id)`
- **影响**: `streaming_requests` set 中残留已失败的 req_id。虽然不太可能导致功能故障（`handle_data_received` 仍会追加数据但不再有意义），但属于状态不一致
- **建议**: catch 分支中增加 `state.streaming_requests.delete(req_id)` 和 `state.stream_buffer_instance?.force_flush(req_id)`
- **置信度**: 中
- **级别**: 低

---

## 二、控制台 / Cookie / 异常

### CCE-01 `console_capture.ts` 与 `exception_capture.ts` 重复 Runtime.enable 子目标

- **位置**: `console_capture.ts:109-119` 和 `exception_capture.ts:84-97`
- **现象**: 两个模块对同一 `Target.attachedToTarget` 事件分别注册了独立 listener，各自对子目标 session 发送 `Runtime.enable`。实际上两次 `Runtime.enable` 调用完全等价，Chrome CDP 对重复 enable 是幂等的
- **影响**: 浪费一次 CDP 往返（性能影响极小），但代码上两处重复逻辑若未来需要差异化行为可能导致不一致
- **建议**: 考虑提取公共子目标 Runtime 初始化逻辑到 `cdp_event_router.ts` 或一个独立工具函数，由各模块按需调用
- **置信度**: 高
- **级别**: 低

### CCE-02 `cookie_capture.ts` 的 `tab_id` 固定为 0

- **位置**: `cookie_capture.ts:58`
- **现象**: cookie 变更事件的 `tab_id` 始终设为 `0`，因为 `chrome.cookies.onChanged` 不提供 tab 上下文
- **影响**: 用户无法从 cookie 事件追溯到触发 tab。这是 Chrome API 的限制，非代码 bug
- **建议**: 无需修改。在文档中注明 cookie 事件的 `tab_id` 为 0 是设计如此
- **置信度**: 高
- **级别**: 无（提示）

### CCE-03 `console_capture.ts` `args.map` 可能抛异常

- **位置**: `console_capture.ts:132`
- **现象**: `params.args.map((arg: any) => arg.value || arg.description || '')` 在 `params.args` 为 undefined/null 时抛出 TypeError
- **影响**: CDP 规范中 `Runtime.consoleAPICalled` 的 args 字段始终为数组，但防御性不足
- **建议**: `(params.args || []).map(...)`
- **置信度**: 中
- **级别**: 低

### CCE-04 `cookie_capture.ts` `handle_cookie_changed` 参数类型过于冗长

- **位置**: `cookie_capture.ts:22,34`
- **现象**: cookie change info 参数类型重复书写了两次（`map_cause` 签名和 `handle_cookie_changed` 签名各一份相同的内联类型）
- **影响**: 类型不一致风险，Chrome API 的 `chrome.cookies.CookieChangeInfo` 已有标准声明（`src/extension/shared/chrome.d.ts`），此处应引用而非内联
- **建议**: 使用 `chrome.cookies.CookieChangeInfo` 类型
- **置信度**: 高
- **级别**: 低

---

## 三、导出（exporter.ts）

### EXP-01 全量加载风险

- **位置**: `exporter.ts:25-33`, `49-57`, `84-92`, `174`
- **现象**: 所有四个导出函数（JSON/JSONL/HTML/HAR）均通过 `get_events_by_category` 和 `get_network_requests` 以 `limit=100000` 一次性加载全部记录到内存
- **影响**: 当单次采集数据量接近 500MB 上限时，导出可能因 Service Worker 内存压力导致 OOM。MV3 Service Worker 内存限制约 300-400MB（因 Chrome 版本而异）
- **建议**: 大采集考虑分批读取+流式写入。短期方案：在导出入口增加大小检查，超过阈值时返回 `PAYLOAD_TOO_LARGE` 错误码而非尝试全量加载
- **置信度**: 中
- **级别**: 高

### EXP-02 HTML 导出 XSS 防护验证

- **位置**: `exporter.ts:163` `JSON.parse('${safe_json}')`
- **现象**: `safe_json` 经 `escape_for_html_embed` 处理，该函数依次替换 `</script>`、`<`、`>`、`&`，符合 domain.md 要求。但 `escape_for_html_embed` 对 `</script>` 的替换使用了 `replace(/<\/script>/g, '<\\/script>')`，而 `JSON.parse` 接收到的字符串中 `<` 会被 JS 引擎解析为 `<`
- **验证**: 若原始 JSON 中包含字符串 `</script>` → 被替换为 `<\\/script>` → 嵌入 `<script>` 块后 HTML 解析器看到 `<\/script>`（合法的转义斜杠），不会提前关闭 script 标签。但 `JSON.parse` 收到的字符串中包含 `</script>` → JS 解析为 `</script>`。安全。仅当原始 JSON 中已包含 `<` 时有风险，但 JSON.stringify 会转义为 `\\u003c`
- **影响**: 当前实现基本安全，但多层转义链（JSON.stringify → escape_for_html_embed → JSON.parse）复杂，未来修改易引入回归
- **建议**: 增加 HTML 导出 XSS 模糊测试，覆盖 `</script>`、`<!--`、`<` 等边界输入
- **置信度**: 中
- **级别**: 中

### EXP-03 HAR 导出 `startedDateTime` 使用相对时间戳

- **位置**: `exporter.ts:270` `startedDateTime: new Date(abs_time_ms).toISOString()`
- **现象**: `abs_time_ms` 来自 `r.start_time_ms ?? 0`，该字段是相对于采集起始的相对时间（非 Unix 时间戳）。将其传入 `new Date()` 会得到一个 1970 年附近的时间而非实际请求时间
- **影响**: HAR 文件中的 `startedDateTime` 字段不正确，使得 HAR 查看器无法正确展示请求时间线
- **建议**: 若 `start_time_ms` 确为相对时间，需加上采集的 `started_at` 时间戳进行换算。检查 `NetworkRequestData` 类型定义中的 `start_time_ms` 字段语义
- **置信度**: 中
- **级别**: 高

### EXP-04 `export_app_logs` 未受 `ExportOptions` 控制

- **位置**: `exporter.ts:376-393`
- **现象**: `export_app_logs` 独立于其他导出函数，直接调用 `get_app_log_transport()` 而不受 `strip_response_body` 或隐私选项约束
- **影响**: 日志导出目前不涉及网络请求 body，无直接隐私风险。但若未来日志中添加敏感内容（如 URL 参数），缺少统一的导出隐私控制
- **建议**: 暂无风险，作为提示保留
- **置信度**: 高
- **级别**: 无（提示）

---

## 四、外部 Bridge（external_cdp_bridge_client.ts）

### EXT-01 `session_key` 通过 URL 查询参数传输

- **位置**: `external_cdp_bridge_client.ts:118`
- **现象**: `poll_external_cdp_events` 将 `session_key` 拼接到 URL 查询字符串 `?session_key=...`
- **影响**: Bridge 绑定 127.0.0.1，攻击面极小。但查询参数可能被 Bridge 侧日志记录或以 Referer 头泄漏。`session_key` 作为临时 CDP 会话令牌，其敏感性低于 MCP token 和 instance_token，但仍然是鉴权凭据
- **建议**: 考虑改为请求体 POST 传输，或至少在 Bridge 侧避免将查询参数写入访问日志
- **置信度**: 中
- **级别**: 低

### EXT-02 `detect_external_cdp` 顺序扫描延迟

- **位置**: `external_cdp_bridge_client.ts:42-68`
- **现象**: 5 个默认端口（9222-9333）顺序探测，每个超时 3 秒，最坏情况 15 秒阻塞
- **影响**: 用户等待 detect 超时体验差。当前无明显后果（只在配置阶段使用一次），但可优化
- **建议**: 考虑并行探测或使用 `Promise.any` 缩短最坏情况延迟
- **置信度**: 高
- **级别**: 低

### EXT-03 `detect_external_cdp` 返回 `cdp_port_not_found` 错误信息不精确

- **位置**: `external_cdp_bridge_client.ts:70`
- **现象**: 网络错误和桥接返回错误合并为同一错误码 `cdp_port_not_found`。网络拒绝返回此码、Bridge 返回 404 也返回此码。无法区分"Bridge 不可达"与"CDP 端口无匹配目标"
- **影响**: 用户排障困难，无法从错误信息判断是 Bridge 未启动还是 CDP 端口不对
- **建议**: 区分为 `bridge_unavailable`（网络错误）和 `cdp_port_not_found`（Bridge 可达但端口无目标）
- **置信度**: 高
- **级别**: 中

---

## 五、隐私与资源管理

### PRV-01 Cookie 采集不记录 value，符合隐私设计

- **位置**: `cookie_capture.ts:48-50`
- **现象**: `value_status: 'not_captured'`, `value_length: null`, `value_preview: null` 明确不采集 cookie 值
- **影响**: 正面。符合 domain.md 的隐私要求
- **建议**: 无需修改
- **置信度**: 高
- **级别**: 无（合规确认）

### PRV-02 CDP 采集中的脱敏控制分散

- **位置**: `cdp_handler.ts:623-659` `build_cdp_primary_network_event` 和 `765-793` `schedule_orphan_check`
- **现象**: 脱敏逻辑在两处独立实现，重复了 `redact_q` / `redact_hdrs` 计算和 `redact_url` / `redact_headers` 调用
- **影响**: 两处脱敏参数来源于同一个 `state.config`，目前行为一致，但维护时需同步修改两处
- **建议**: 提取 `apply_redaction(meta, config)` 函数统一处理
- **置信度**: 高
- **级别**: 低

### PRV-03 Keepalive 仅通过 alarm 保活，无健康检查

- **位置**: `keepalive.ts:21-25`
- **现象**: `setup_keepalive_listener` 仅记录 debug 日志，对 alarm 是否真正触发没有验证。如果 `chrome.alarms` API 因某些原因静默失败，SW 会在 30s 后被终止
- **影响**: 长采集场景 SW 被意外终止导致数据丢失。虽然当前已有 `ServiceWorkerGlobalScope` 层面的保活机制，但缺少 alarm 触发的正向确认
- **建议**: 在 alarm 回调中更新一个时间戳，由上层定期检查时间戳是否在 2 倍 interval 内更新，超时则上报异常
- **置信度**: 中
- **级别**: 低

---

## 汇总

| 编号 | 模块 | 摘要 | 级别 |
|------|------|------|------|
| CDP-04 | cdp_handler | is_self_origin_url 过滤所有 localhost，阻止本地开发服务器采集 | 高 |
| EXP-01 | exporter | 全量加载 100000 条记录到内存，大采集 OOM 风险 | 高 |
| EXP-03 | exporter | HAR startedDateTime 使用相对时间戳而非绝对时间 | 高 |
| CDP-02 | cdp_handler | orphan check 未校验采集已停止 | 中 |
| CDP-03 | cdp_handler | orphan check on_cdp_body_event 为 null 时泄漏 state | 中 |
| EXP-02 | exporter | HTML 导出多层转义链复杂，需 XSS 模糊测试覆盖 | 中 |
| EXT-03 | external_cdp | 错误码不区分 Bridge 不可达 vs 端口无目标 | 中 |
| CDP-01 | cdp_handler | orphan timeout 硬编码 3000 而非引用常量 | 低 |
| CDP-05 | cdp_handler | streamResourceContent 失败后 streaming_requests 未清理 | 低 |
| CCE-01 | console/exception | 两个模块重复 Runtime.enable 子目标 | 低 |
| CCE-03 | console | args.map 缺少空数组防御 | 低 |
| CCE-04 | cookie | CookieChangeInfo 类型重复定义 | 低 |
| EXT-01 | external_cdp | session_key 通过 URL 查询参数传输 | 低 |
| EXT-02 | external_cdp | 顺序端口扫描延迟 15s | 低 |
| PRV-02 | cdp_handler | 脱敏逻辑在 build_cdp_primary 和 orphan_check 中重复 | 低 |
| PRV-03 | keepalive | alarm 无健康检查，无法确认保活是否生效 | 低 |
| CCE-02 | cookie | tab_id 恒为 0（Chrome API 限制，设计如此） | 提示 |
| EXP-04 | exporter | export_app_logs 不受统一导出隐私选项控制 | 提示 |
| PRV-01 | cookie | Cookie 值不采集，符合隐私设计 | 合规 |

**结论**: 7 个文件整体质量良好。最高优先级的三项：CDP-04（localhost 过度过滤）、EXP-01（导出内存风险）、EXP-03（HAR 时间戳错误）。建议优先处理这三项。
