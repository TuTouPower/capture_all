# B1 核心层审阅报告 (shared + extension/shared + mcp + bridge)

## 审阅范围与规模
| Bundle | 文件数 | 行数 |
|---|---|---|
| src/shared/ | 14 | 2,639 |
| src/extension/shared/ | 10 (含 chrome.d.ts) | 1,362 |
| src/mcp/ | 5 | 318 |
| src/bridge/ | 6 | 1,633 |
| **合计** | **35** | **5,952** |

## Critical
未发现可直接导致崩溃、不可逆数据丢失或全局 RCE 的 Critical 项。

## High
### H1 预存 · Bridge `/mcp/command` 的 `output_path` 任意文件写（路径逃逸）
- **severity**: High  **confidence**: 85
- **file:line**: `src/bridge/server.ts` L486-497（explicit_path 分支）；L780-795（`write_result_to_file`）；`src/mcp/schemas.ts` L114-118 / L121-128（`output_path: z.string().min(1).optional()`）
- **证据**: 自动导出路径有 T096 白名单净化（L774-777），但 `explicit_path` 分支直接 `writeFile(output_path, ...)`，未经任何 `EXPORT_DIR` 约束/净化。MCP 侧 schema 只要求非空字符串。调用链：MCP agent 调 `capture.export` / `capture.get_all_data`，传 `output_path: /home/user/.ssh/config` → bridge 以进程权限覆写任意文件。
- **攻击向量**: 路径穿越（`/etc/...`、`../`、符号链接）任意写；结合 `result.content` 来自扩展采集数据，可写入受控内容到任意位置。
- **修复建议**: explicit 路径强制约束到 `default_export_dir()` 目录内（`path.resolve` + 前缀校验，防 `..`/symlink），或在 schema 层禁止绝对路径与 `..`。
  ```ts
  function safe_output_path(raw: string, base: string): string {
      const resolved = path.resolve(base, raw);
      if (resolved !== base && !resolved.startsWith(base + path.sep)) {
          throw new BridgeHttpError(400, 'INVALID_QUERY', 'output_path must be inside export dir');
      }
      return resolved;
  }
  ```
### H2 预存 · `/extension/enroll` 伪造 chrome-extension origin 可顶替/劫持任意实例
- **severity**: High  **confidence**: 70
- **file:line**: `src/bridge/server.ts` L254-331（enroll）；L289-312（label 顶替删除旧实例）；L553-555（`is_allowed_extension_origin`）；L89-138（`resolve_target`）
- **证据**:
  1. `is_allowed_extension_origin` 仅校验 `/^chrome-extension:\/\/[a-p]{32}$/` 形状，不绑定扩展真实 ID；非浏览器客户端（curl/node fetch）可任意设置该 Origin 头。
  2. enroll 时 `has_ext_origin` 为 true 即通过，无需 mcp token、无需 pairing code（T091 零配置直通）。
  3. `instances.set(instance_id, {token_hash: 新 token 的 hash, ...})` 覆盖同名实例 → 攻击者用真实扩展的 `instance_id` 重新 enroll，即替换 token_hash，真实扩展 heartbeat 变 401 被锁死；MCP 随后将命令派发到该 instance_id → 攻击者 `GET /extension/command` 读取命令、`POST /extension/result` 伪造结果。
  4. label 冲突（L289-312）也直接 `instances.delete(id)` + `cancel_all()`，可踢下线真实实例。
- **攻击向量**: 本机任意进程（同用户或更低权限）对 127.0.0.1:17831 发起伪造 Origin 的 enroll，即可接管采集命令通道，破坏采集数据真实性。
- **修复建议**: enroll 时若 `instance_id` 已存在，要求携带旧实例的 token 或 mcp token 才允许顶替；或把 Origin 的扩展 ID 与 `instance_id` 绑定校验（如要求 `chrome.runtime.id` 与声明一致）；enroll 增加失败限速。
### H3 预存 · `redact_url` 绝对 URL 无敏感参数也改写 URL（规范化失真）
- **severity**: High  **confidence**: 90
- **file:line**: `src/shared/redaction.ts` L107-158
- **证据**: absolute 分支 `new URL(url)` 后无条件 `parsed.toString()`。实测 `redact_url('http://example.com', true)` 返回 `'http://example.com/'`（追加尾斜杠）、host 转小写、默认端口剥离、参数重排，且 `url_status: 'captured'`——未脱敏却改写原文。
  - 影响面：`DEFAULT_CONFIG.redact_data:true` + `redact_url_query:true`（默认），网络事件 URL、以及 logger `sanitize_string`（logger.ts L38-41）对所有日志内 URL 子串都走此函数 → 日志/采集 URL 与真实 URL 不一致，破坏 URL 精确匹配与回放。
  - 与相对路径分支不一致：相对 URL 无 query 时原样返回（L165），绝对 URL 却总被规范化。
- **修复建议**: 仅在发生脱敏时才用 `parsed.toString()`，否则返回原串；或统一用「拆 query 重组」保留原始形态（同 relative 分支）：
  ```ts
  if (sensitive_keys.length === 0 && !redacted_nested) return { url, url_status: 'captured' };
  ```

## Medium
### M1 预存 · cdp_handler 会话内存 body 总量无上限（5000 × 100MB）
- **severity**: Medium  **confidence**: 75 — `src/bridge/cdp_handler.ts` L48（`MAX_SESSION_EVENTS=5000`）、L340-360（单 body 截断到 100MB）、L58-64（`push_bounded` 只淘汰条数）。事件数有界但总字节无聚合上限（最坏 500GB）。修复：会话级聚合字节预算，超限丢最旧或降级 too_large。
### M2 预存 · logger 只对 URL 子串脱敏，credential 形字段可明文入 app_logs
- **severity**: Medium  **confidence**: 75 — `src/shared/logger.ts` L38-41（`sanitize_string` 仅 URL 正则）、L72-79（对象逐字段递归）。`{headers:{authorization:'Bearer xyz'}}` 非 URL 原样入库。修复：字段级置 `[REDACTED]`（key 名 authorization|cookie|x-api-key|token|secret|password）。
### M3 预存 · mcp client 请求无超时（AbortController）
- **severity**: Medium  **confidence**: 80 — `src/mcp/client.ts` L10-26。bridge 挂起时 MCP 调用无限挂起阻塞 agent 会话。修复：`AbortSignal.timeout(timeout_ms+5000)`。
### M4 预存 · 大数据结果（非 full-data 命令）内联 JSON 回传，MCP 文本通道膨胀
- **severity**: Medium  **confidence**: 65 — `src/bridge/server.ts` L486-501（文件回退仅限 `FULL_DATA_COMMANDS`）、`src/mcp/main.ts` L40-43。`list_records`/`data.get` 最大 64MB 内联。修复：任何 `> INLINE_RESULT_MAX_BYTES` 统一走文件回退。
### M5 预存 · `detail_time_display_mode` 合法值 `'absolute'` 不在类型/消费端
- **severity**: Medium  **confidence**: 85 — `src/shared/user_config.ts` L402（`['system','relative','absolute']`）、`src/shared/types.ts` L662（`'relative'|'system'`）、`dashboard_settings.ts` L48（UI 只有两项）。sanitize 放行但类型/消费端不支持，形成类型谎言。修复：删 `'absolute'` 或扩类型。
### M6 预存 · locale 双轨且取值不一致（`zh_CN` vs `zh`）
- **severity**: Medium  **confidence**: 80 — `user_config.ts` L401（允许 `en/zh_CN`）、`constants.ts` L56（`locale:'en'`）、`i18n.ts` L2（`Locale='en'|'zh'`）、L375-378（`set_locale` 写独立 key）。两套独立状态，`zh_CN` 不在枚举内，语言切换不写 user_config。修复：统一单一 locale 源。
### M7 预存 · `sanitize_value` 对 getter 抛异常的 Proxy/对象无兜底
- **severity**: Medium  **confidence**: 70 — `src/shared/logger.ts` L68-80。`Object.entries` 字段访问在 try 内但无 catch（仅 finally 清理 seen），Proxy 抛错让 `logger.info` 成为崩溃源。修复：外层补 `catch { return '[Unserializable]' }`。
### M8 预存 · CORS `Access-Control-Allow-Headers` 缺 `x-capture-all-instance-id`
- **severity**: Medium  **confidence**: 60 — `src/bridge/server.ts` L557-568。认证用自定义头 `x-capture-all-instance-id`（L46、L651）但 allow-headers 只列 Authorization/Content-Type。当前 host_permissions `<all_urls>` 绕过未触发；收缩权限后 preflight 被拒。修复：补 `X-Capture-All-Instance-Id`。
### M9 预存 · `parse_local_bridge_url` 拒绝 `[::1]`（与约束 allowlist 不一致）
- **severity**: Medium  **confidence**: 80 — `src/shared/agent_bridge_config.ts` L77-79。约束 allowlist 含 `[::1]` 但 `url.hostname` 对 IPv6 返回 `[::1]` 被拒。修复：允许 `[::1]`。
### M10 预存 · `build_xpath` id 注入畸形/不转义
- **severity**: Medium  **confidence**: 75 — `src/extension/shared/dom_utils.ts` L15（`[@id='${current.id}']`）。id 含 `'`/`[`/`]` 时 XPath 损坏，`document.evaluate` 抛错或误匹配。修复：`xpath_literal`（`'`→`',"' ,'` concat 技巧）。附：L5-8 注释示例与实现不一致（Low）。
### M11 预存 · `archive_builder` `zipSync` 同步压缩阻塞页面线程
- **severity**: Medium  **confidence**: 65 — `src/extension/shared/archive_builder.ts` L411-451。百 MB 归档同步压缩阻塞 UI；`sha256_hex` 逐 body 计算线性放大。修复：换 `zip` 异步流式 + 进度。
### M12 预存 · `system_time` browser 分支每次调用新建 `Intl.DateTimeFormat`
- **severity**: Medium  **confidence**: 70 — `src/shared/system_time.ts` L76-87。`tz==='browser'` 每条记录 new formatter，上万条渲染重复构造。修复：缓存（按 locale+options 键）。
### M13 预存 · Bridge 无结构化日志/可观测性
- **severity**: Medium  **confidence**: 80 — `src/bridge/cdp_handler.ts` L57（注释「桥无 logging 基础设施」）、`server.ts` 全程无日志。认证失败/命令超时/CDP 淘汰/异常静默吞掉（cdp_handler onmessage catch 空 L370-372）。修复：引入独立于 chrome 的 logger 输出 stderr。
### M14 预存 · `capture_data_reader` 每类硬上限 100000 条静默截断
- **severity**: Medium  **confidence**: 75 — `src/extension/shared/capture_data_reader.ts` L24-36。超 10 万事件被静默截断无提示。修复：上限参数化 + 返回 `truncated` 标记。

## Low（预存）
- L1 `prune_stale` 为空操作死代码（server.ts:75-82，`void id;` 无清理）。删除。
- L2 `resolve_target` 的 `_write` 参数未使用（server.ts:89）。
- L3 `queue.resolve`/`/extension/result` 客户端错误抛 500（command_queue.ts:56-69、server.ts:449-458），应 400 INVALID_QUERY。
- L4 `redact_url` 对 URL userinfo（user:pass@）不脱敏。
- L5 `build_network_data` 派生默认假定 utf8（base64 陷阱），network_builder.ts L74-82。
- L6 theme 双存储源（theme.ts STORAGE_KEY + user_config.theme），popup 只读 'theme' 键漂移。
- L7 `is_bridge_healthy` 无超时（config.ts:160-167）。
- L8 随机/ID 工具重复且强度不一（id.ts Math.random vs event_utils crypto.randomUUID）。
- L9 `generate_log_id` 毫秒级同前缀 + 短随机，作 app_logs 主键建议 crypto.randomUUID。
- L10 `escape_for_html_embed` 首个 `</script>` 替换冗余（后续全局转义已覆盖）。Info 级。
- L11 `chrome.d.ts` 大量 `any`（sendMessage/tabs/webRequest 回调）。
- L12 MCP schemas 全面 `.passthrough()`，未知参数静默放行。建议 `.strict()`。
- L13 `get_relative_time` 时钟回拨为负，`Math.max(0,...)`。
- L14 `plan_body`/`is_text_body` 对未知 mime 保守作文本。
- L15 `pending_commands` 语义为「未取走」而非「在途」。
- L16 bridge `main.ts` stdout 输出作为唯一运维通道，错误无堆栈。

## Info
1. protocol.ts L119-131 `AgentStatus` 大量 `@deprecated` 字段仍被 build_status 填充。
2. capture_stats.ts `total_body_bytes` 双来源口径。
3. server.ts L691-735 `serve_pair_page` 参数未用、内联 HTML 无 CSP。
4. `/pair/status` 无鉴权返回 pairing code（设计），配合 H2 弱化。
5. poll_capture_status.ts 逻辑健壮无 finding。
6. command_queue.ts 超时双向清理、cancel_all 设计良好。
7. escape.ts / hash.ts / body_routing / export_settings 路径净化合格。

## P7 测试覆盖核查（tests/unit）
| 模块 | 测试 | 结论 |
|---|---|---|
| protocol/redaction/logger/system_time/escape/hash/id/event_utils/event_category/body_routing/network_builder/user_config/agent_bridge_config | 各有对应 ✓ | 覆盖；redaction 未覆盖「绝对 URL 无敏感参数仍规范化」（H3）、logger 未覆盖 credential 泄漏（M2） |
| archive_builder / export_utils / export_settings / capture_stats / poll_capture_status | 各有对应 ✓ | 覆盖 |
| bridge/server/command_queue/config/cdp_handler/label | agent_bridge_server / agent_bridge_queue / cdp_handler_redaction / bridge_cdp_events / cdp_session_idle_bounds / bridge_label ✓ | 覆盖；**未覆盖 H1（output_path 任意写）与 H2（伪造 origin 顶替）** |
| mcp/client/schemas/token_resolver/tools | agent_mcp_client / mcp_schema / mcp_token_fallback ✓ | execute_mcp_tool 覆盖充分 |
| **dom_utils.ts（build_xpath）** | 无对应 test | **缺**：id 引号/特殊字符边界未测（M10） |
| **theme.ts** | 无独立 test | **缺** |
| **capture_data_reader.ts** | 无独立 test | **缺** |
| **bridge/main.ts / mcp/main.ts** | 无 test | 可接受，`parse_bridge_cli_args` 应抽出可测 |

## Summary
- 35 文件 / 5,952 行；Critical 0 ｜ High 3 ｜ Medium 14 ｜ Low 16 ｜ Info 7。
- 核心风险 Top5：
  1. Bridge 本地攻击面（H1+H2）：output_path 任意写 + 伪造 origin 顶替实例。
  2. 采集数据失真（H3）：redact_url 无条件规范化改写全部 URL。
  3. 日志脱敏缺口（M2）：credential 明文入 app_logs。
  4. Bridge 资源与可用性（M1+M3+M4）：body 内存无上限、HTTP 无超时、大结果内联膨胀。
  5. 配置契约漂移（M5+M6）：absolute/locale 类型谎言。
