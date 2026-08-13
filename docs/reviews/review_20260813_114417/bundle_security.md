# Security Intensive Review

## 结论摘要

静态安全审阅确认 **8 项 finding：6 Medium、2 Low**。最高优先级风险集中在本机 Bridge 首次 enroll 认证、CDP WebSocket 目标校验、默认网络 body 隐私边界、capture 外 URL 日志。未发现无需本机执行权限或用户授权即可直接远程利用的 Critical/High 漏洞；Bridge 固定绑定 `127.0.0.1`、MCP/CDP 路由 Bearer token、扩展 Bridge URL allowlist、导出路径收敛等控制显著缩小攻击面。

本报告 severity 基于当前部署模型：Bridge 仅 loopback、本地 IndexedDB、本地 MCP 客户端。若运行主机允许不可信本地进程，SEC-001/SEC-002 实际风险升高；若 capture/export 数据会被自动上传到共享系统，SEC-003/SEC-006 隐私影响也应重新评级。

## 审阅范围与方法

审阅范围：

- `src/bridge/**`：HTTP 路由、认证/enroll、命令队列、CDP、token 文件、日志、label。
- `src/mcp/**`：stdio server、Bridge client、token 解析、Zod schemas、tools。
- `src/extension/**`：manifest/background/content/popup/dashboard/devtools、采集、导出、日志、Bridge client、页面脚本注入。
- `src/shared/**`：协议、配置、脱敏、logger、常量、类型、消息契约。
- `scripts/**`：顶层构建/截图/扫描脚本，以及 `scripts/repo_template/**` 的 Git/worktree/path/HTTP/subprocess 路径。
- 顶层配置：`package.json`、`vite.config.ts`、`playwright.config.ts`、`vitest.config.ts`、`tsconfig.json`、`.mcp.json.example`；本地 `.mcp.json` 仅核对结构，不在报告复述敏感值。
- 关联测试与文档：`tests/unit/**`、`tests/repo_template/**`、`docs/specs_index.md` 当前生效 spec、相关 blueprint/guide/archive spec、既有 review。
- Git 历史：相关文件 `git log`、`git show`、`git blame`，用于区分本次新增、预存、已知接受风险。

方法：静态数据流/调用链分析、配置默认值核对、负向测试覆盖检查、Git 历史归因。遵守子任务边界，**未运行全量 test/lint/tsc/build、未启动 Bridge/MCP/浏览器服务、未执行动态利用**；父 reviewer 统一执行验证。

## Findings

### SEC-001 — 首次 extension enroll 把可伪造 HTTP Origin 当认证凭据

- **Severity:** Medium
- **Confidence:** 100%
- **Location:** `src/bridge/server.ts:244-275,280-351,606-614`; `src/shared/constants.ts:63-65`; `tests/unit/t137_bridge_security.test.ts:109-145`; `docs/guides/mcp_usage.md:15-18`
- **Evidence & call chain:**
  1. `/extension/enroll` 计算 `has_ext_origin = Boolean(origin && is_allowed_extension_origin(origin))`；没有 MCP token 时，只要该值为 true 即放行，pairing code 未提供时不校验（`server.ts:244-272`）。
  2. `is_allowed_extension_origin()` 只匹配 `^chrome-extension://[a-p]{32}$`（`server.ts:606-608`）。HTTP `Origin` 是客户端提供的 header，本地 Node/curl 进程可构造，不证明请求来自 Chrome 扩展。
  3. Bridge 为新 `instance_id` 签发 `ext_*` instance token 并创建命令队列（`server.ts:274-275,332-349`）。测试 AC-006 明确锁定“首次 enroll + 任意形状合法 Origin = 200”（`t137_bridge_security.test.ts:141-145`）。
  4. 默认扩展配置开启 Bridge 且 legacy token 为空（`constants.ts:63-65`），文档也声明 loopback 默认不要求 pairing。
  5. 获得 instance token 后，伪实例可 heartbeat、轮询自己的 `/extension/command`、提交 `/extension/result`。它不能仅凭 instance token访问 `/mcp/*`、`/cdp/*`，也不能读取真实扩展 IndexedDB，因此未评 High。
- **Impact:** 不可信本地进程可注册伪浏览器实例。若它是唯一在线实例，未指定 target 的 MCP 命令可发给伪实例并收到伪造状态/采集结果；攻击者也可抢先登记可预测的未来 `instance_id`，使真实扩展因 Origin extension ID 不同而无法复用该 ID。t137 阻止“不同 ID 顶替既有绑定”，但不建立首次登记身份。
- **Recommendation:** 首次 enroll 必须使用真正 secret：一次性 pairing code、MCP Bearer token，或安装时固定/安全分发的 extension credential。可选固定允许 extension ID，但不能继续把 `Origin` 当主凭据；Origin 仅作附加一致性校验。增加“伪造合法形状 Origin + 无 pairing/token 必须 401/403”测试。
- **History / pre-existing:** **预存且为明确产品决策。** `d8970e7`（2026-07-22，`feat(T091_zero_config_auto_connect)`）移除 pairing 强制。`7daf059`（2026-08-12，`security(t137)`）只防不同 extension ID 顶替已有实例和 label 顶替；其 AC-006 主动保留首次零配置放行。既有 2026-08-12 review 已指出相邻的 enroll 顶替风险；本 finding 是修复后仍存在的首次认证缺口。

### SEC-002 — CDP discovery 返回的 WebSocket URL 未限制到请求的 loopback 端口

- **Severity:** Medium
- **Confidence:** 100%
- **Location:** `src/bridge/cdp_handler.ts:158-185,191-225`; `src/bridge/server.ts:556-567`; `tests/unit/bridge_cdp_events.test.ts:77-88`
- **Evidence & call chain:**
  1. 已认证 `/cdp/start` 请求传入 `port`；Bridge 固定从 `http://127.0.0.1:${port}/json/list` 读取 target 列表（`cdp_handler.ts:174-185`）。
  2. 代码选择 target 后只检查 `webSocketDebuggerUrl` 非空，随后直接 `new WebSocket(target.webSocketDebuggerUrl)`（`cdp_handler.ts:191-225`）。没有解析 URL，也没有 scheme/hostname/port/userinfo allowlist。
  3. 因此占用指定 loopback 端口的恶意/被劫持服务可返回 `wss://attacker.example/...` 或其他 `ws://` 目标，让 Bridge 建立出站 WebSocket。现有测试只提供正常 `ws://127.0.0.1/...`，没有拒绝远端 URL 的负向断言。
  4. `/cdp/start` 本身仍要求 MCP Bearer token（`server.ts:357-377,563-566`），故攻击者需要授权客户端能力或诱导授权 Agent 连接其本地端口。
- **Impact:** Bridge 可被用作有限 SSRF/出站 WebSocket 连接代理；远端端点可收取 Bridge 发送的 CDP `Network.enable` 等消息并持续推送数据，造成网络策略绕过、资源占用或协议混淆。该链路不会自动附带 Bridge token。
- **Recommendation:** `new URL(webSocketDebuggerUrl)` 后仅允许 `ws:`，hostname 为 `127.0.0.1`/`localhost`/`[::1]`，且端口必须等于请求的 `port`；拒绝 credentials、fragment、异常路径和 `wss:`/远端 host。最好优先使用 target ID 自行构造已知 loopback URL，避免信任 discovery 返回的 authority。补远端 host、不同端口、userinfo、非 ws scheme 测试。
- **History / pre-existing:** **预存。** 直接信任 discovery URL 的实现来自 `c4e9851`（2026-06-07，后续仅目录迁移）；`d9804d4` 增加 HTTP/WebSocket 超时，`df1c690` 增加 tab URL 精确匹配，均未收敛 WebSocket authority。

### SEC-003 — 默认采集原始 request/response body，`redact_data` 不处理 body 内容

- **Severity:** Medium
- **Confidence:** 100%
- **Location:** `src/shared/constants.ts:20-24,30-43,46-53`; `src/extension/background/network_capture.ts:427-438`; `src/extension/background/network_webrequest.ts:35-74`; `src/shared/redaction.ts:207-234`; `src/extension/background/exporter.ts:69-73,346-375`; `docs/archive/specs/extension_capture.md:23-33`; `docs/archive/specs/privacy_redaction.md:3-45`; `tests/unit/public_docs.test.ts:118-122`
- **Evidence & call chain:**
  1. `DEFAULT_CONFIG` 与 `DEFAULT_USER_CONFIG` 均默认 `capture_request_body=true`、`capture_response_body=true`，单条上限 100MB（`constants.ts:20-24,30-53`）。公开文档测试锁定 body 默认开启。
  2. CDP request `postData` 在上限内原样赋给 `req_body`（`network_capture.ts:427-438`）；webRequest `formData`/raw body 编码后原样返回（`network_webrequest.ts:35-74`）。response body 路径同样只截断/编码。
  3. `redact_data` 的 shared body helper 只有字节截断和 preview，没有按 MIME/key/value 脱敏（`redaction.ts:207-234`）。archive privacy spec 只定义 URL/header/input/keyboard/cookie/WebSocket 元数据脱敏，没有 body 内容策略。
  4. export 默认保留 response body；即使 `include_response_body=false`，只移除 `response_body`，request body 仍写入 JSON/HAR `postData`（`exporter.ts:69-73,346-375`）。MCP 全量数据查询也可取得持久化 network record。
- **Impact:** 用户开始采集后，登录表单、OAuth/token exchange、API key、session material、PII 和业务响应可明文进入 IndexedDB、导出文件、Agent 上下文。`redact_data=true` 容易让用户误以为这类内容已统一脱敏。数据保持本地且采集由用户主动启动，因此定 Medium。
- **Recommendation:** 隐私优先方案：request/response body 默认关闭并在 UI/MCP 做显式 opt-in；把默认单条上限降到诊断所需规模。若保留 body，按 MIME 处理：`application/x-www-form-urlencoded`、JSON、multipart 字段按敏感 key 脱敏，password/file 内容默认跳过；无法安全解析时提供 hash/长度/preview 而非完整内容。导出选项应能同时剥 request body、response body、preview，并清晰显示脱敏覆盖边界。
- **History / pre-existing:** **长期预存且文档化。** `63fcc01`（2026-06-11）把 body 默认改为全开；`fb8bbdb`（2026-06-12）引入 CDP `postData` 原样采集。现行 archive specs 明确默认 100MB/完整捕获。2026-07-19 review 已报告 body 绕过 `redact_data`，至今未形成当前生效 spec 修复。

### SEC-004 — capture 未开始时 content script 仍记录访问 URL 到持久化 app logs

- **Severity:** Medium
- **Confidence:** 95%
- **Location:** `src/extension/manifest.json:16,21-27`; `src/extension/content/content_script.ts:25-41,43-61,225-251`; `src/shared/logger.ts:14-18,97-149,160-180`; `src/extension/background/service_worker.ts:103-108,279-295,363-370`; `src/shared/constants.ts:68-69`
- **Evidence & call chain:**
  1. content script 在 `<all_urls>`、`document_start`、所有 frame 注入（manifest）。
  2. 模块加载时、任何 capture 状态检查之前执行 `logger.info('Content script loaded', { url: window.location.href })`（`content_script.ts:25-41`）。
  3. Logger 模块全局默认 level 是 `debug`（`logger.ts:14-18`；用户默认也为 `debug`），所以 info 条目进入 `MessageLogTransport` buffer。content stop 才显式 flush；累计 20 条也自动发送（`logger.ts:160-180`）。
  4. Service Worker 收到 `app_log_batch` 后逐条写持久化 transport（`service_worker.ts:363-370`）。SW 启动/设置只在自己的 JS world 调用 `Logger.set_level`；没有消息把用户 log level同步给各 content world，因此用户改成 warn/silent 也不控制 content Logger。
  5. `sanitize_string` 会脱敏 URL query 和 credential 形对象字段，但 URL fragment不处理（见 SEC-006），普通完整路径也会保留。
- **Impact:** 用户未开始 capture 时，访问过的页面 URL（包括 iframe URL）仍可进入扩展诊断日志并保留到日志容量淘汰/用户清理。普通浏览路径、内部系统资源 ID、hash route，及 fragment credential 可能落盘，越过“主动开始采集”边界。是否立即落盘取决于 batch 达到 20 或后续 stop flush，因此 confidence 略低于 100%，但长期浏览通常满足条件。
- **Recommendation:** 删除模块加载 URL 日志，或仅在 active capture 后记录并使用 capture 的隐私配置。将 content 的 log level从 SW/user config 明确下发，在 Logger 创建前应用；默认日志级别改为 `info`/`warn`。增加“未采集访问页面不产生 URL app log”和“设置 silent 后 content 不写日志”测试。
- **History / pre-existing:** **长期预存。** URL 加载日志由 `6a7b094`（2026-06-09，P7 logging）引入。后续 logger 脱敏增强修复 query/credential 字段，但没有改变 capture 外记录行为或跨 world level 同步。

### SEC-005 — 页面可观察内联脚本文本并窃取 HMAC secret，伪造采集事件

- **Severity:** Medium
- **Confidence:** 100%
- **Location:** `src/extension/content/content_page_script.ts:22-26,42-63`; `src/extension/content/network_hook.ts:23-44,430-452`; 同型 `src/extension/content/storage_capture.ts`、`src/extension/content/websocket_capture.ts`; `docs/blueprint/decisions.md:160-166`
- **Evidence & call chain:**
  1. content 每次 start 生成 secret，`page_script_preamble()` 把它拼进字符串字面量 `var SECRET = '${secret}'`（`content_page_script.ts:22-26`）。
  2. `inject_script_element()` 创建 `<script>`、把完整脚本文本放入 `element.textContent`，append 到页面 DOM，下一 task 才移除（`content_page_script.ts:48-63`）。
  3. 对抗页面可预先 hook `Node.prototype.appendChild`，或使用 MutationObserver 捕获新增 script 并同步读取 `textContent`，取得 secret。拿到 secret 和 page-visible nonce 后，可生成合法 `sig`，通过接收侧 `origin/source/nonce/HMAC` 检查（`network_hook.ts:430-452`）。
  4. ADR-020 明确承认 MutationObserver/DOM hook 可窃取 secret，并把该对抗页面排除在方案威胁模型外（`decisions.md:165`）。代码注释“页面脚本无法读取”只成立于不观察注入过程的页面。
- **Impact:** 正在采集的恶意/被攻陷页面可向 network/storage/WebSocket 通道注入伪造事件和 body，污染本地证据及 Agent 判断。攻击不直接读取扩展 IndexedDB，也不能越权调用 Bridge；主要破坏完整性。
- **Recommendation:** 首先纠正文档/代码注释，避免把该 HMAC描述为可对抗页面。使用 `chrome.scripting.executeScript({ world: 'MAIN', func, args })` 或静态 web-accessible script 避免 secret 明文经过页面 DOM，但注意 MAIN world 本身仍不可信，页面可 hook被包装 API或调用链。若产品需要对抗恶意页面，不能让页面 MAIN world持有签名 key；应把可验证观测移到 extension CDP/webRequest/content isolated world，或将 fallback hook 数据标记为 untrusted provenance，禁止作为安全证据。
- **History / pre-existing:** **已知、预存、显式接受的设计边界。** `849b739`（2026-08-11）引入 per-message HMAC；`4cf960b`（2026-08-12）仅抽取模板，secret 仍内联。ADR-020 同日记录威胁模型排除。既有 2026-08-12 content review 已报告同一边界，本次确认当前实现仍在。

### SEC-006 — URL 脱敏保留 fragment，OAuth/hash credential 可落库和导出

- **Severity:** Medium
- **Confidence:** 100%
- **Location:** `src/shared/redaction.ts:107-166,168-203`; `docs/archive/specs/privacy_redaction.md:7-20`; `tests/unit/t114_nested_query_redaction.test.ts:86-90`; `src/extension/background/network_capture.ts:265-288,341,857,920`; `src/extension/content/network_hook.ts:454-472`
- **Evidence & call chain:**
  1. absolute URL 分支只遍历 `searchParams`，从不检查 `parsed.hash`；相对 URL 分支显式拆出 `hash_part` 后原样拼回（`redaction.ts:107-203`）。
  2. archive privacy spec 明确写“不处理：URL fragment（产品语义未定）”。现有 t114 测试只验证普通 `#frag` 保留，没有 `#access_token=...` 负向用例。
  3. 网络、WebSocket、fallback、日志均复用 `redact_url`，因此 `https://app/callback#access_token=SECRET&token_type=bearer` 在 `redact_data && redact_url_query` 下仍保留 secret。导航/hashchange 也把 fragment 作为 URL 变化处理。
- **Impact:** OAuth implicit flow、密码重置链接、magic link、SPA hash route 中的 token/API key/PII 可进入 capture、app log、导出及 MCP 查询。开启 URL 脱敏后仍泄漏真实 credential，属于隐私控制缺口。
- **Recommendation:** 对 fragment 采用保守、结构感知策略：若 hash 可解析为 `key=value`/`&` 参数，按 query 敏感 key规则脱敏；对 `#/route?token=...` 递归处理 route query；普通锚点和无敏感 hash route 保形。解析失败但命中 credential 模式时 fail-closed 替换整个 fragment。补 OAuth implicit、encoded hash、hash-router、普通 `#section` 回归测试。
- **History / pre-existing:** **长期预存且文档已知。** 初版 redaction 未覆盖 fragment；`31789b9` 扩大 query key，`146b0de` 修复相对 URL fail-open，`472509b` 增加 nested query，均保留 hash。2026-07-19 review 已指出 fragment 缺口；archive spec 后续把它记录为“产品语义未定”，但当前生效 spec `privacy_logger_stack_redact_url` 仍未覆盖。

### SEC-007 — MCP 可把本地 Bridge token发送到任意配置 URL

- **Severity:** Low
- **Confidence:** 100%
- **Location:** `src/mcp/main.ts:9-30`; `src/mcp/token_resolver.ts:11-16`; `src/mcp/client.ts:17-34,52-64`; `src/bridge/config.ts:66-75,88-116`; `.mcp.json.example:1-14`; `tests/unit/mcp_project_config.test.ts:64-68`
- **Evidence & call chain:**
  1. MCP 从 `CAPTURE_ALL_BRIDGE_URL` 原样读取 URL，没有 parse/allowlist（`main.ts:9-15`）。
  2. token 未显式提供时，客户端从 Bridge 默认 0600 token 文件读取（`token_resolver.ts:11-16`、`bridge/config.ts:88-116`）。
  3. `BridgeMcpClient` 对 `${bridge_url}/mcp/status|command` 发 fetch，并无条件附 `Authorization: Bearer ${token}`（`client.ts:17-34,52-64`）。
  4. 官方 `.mcp.json.example` 安全地使用 `http://127.0.0.1:17831`，但运行时未强制该边界。恶意项目配置、环境注入或误配置可指向 `http://attacker.example`，泄露本地 token。
- **Impact:** 能修改 MCP 启动环境/项目配置的主体可读取 token并取得本地 Bridge MCP/CDP 权限。该主体通常已能在用户上下文执行 MCP command，风险主要是凭据外泄和跨信任域复用，而非独立远程漏洞，故定 Low。
- **Recommendation:** 默认仅接受 `http://127.0.0.1|localhost|[::1]:port`，拒绝 credentials/fragment/非根 base path。若确需远端 Bridge，要求单独显式 opt-in、HTTPS、证书校验和与本地 token不同的 credential；启动日志打印规范化目标但不打印 token。复用 extension 的 local Bridge URL parser以避免策略分叉。
- **History / pre-existing:** **预存。** `4ddb94d`（2026-06-05）初版 MCP client 即信任环境 URL；`d8970e7` 把 URL 改为必填；`8fa73b7` 增加本地 token 文件自动解析，使误配 URL 的泄漏价值提高，但未增加 allowlist。

### SEC-008 — Agent capture config 的 body/inline 上限只校验非负，无硬上限

- **Severity:** Low
- **Confidence:** 100%
- **Location:** `src/mcp/schemas.ts:26-43`; `src/extension/background/agent_command_dispatcher.ts:235-295`; `src/shared/constants.ts:20-24`; `tests/unit/agent_command_dispatcher.test.ts:64-112,293-317`; 对照 `src/bridge/cdp_handler.ts:164-168`
- **Evidence & call chain:**
  1. MCP schema 对 `max_body_capture_bytes`、`inline_text_max_bytes` 只做 `int().min(0)`（`schemas.ts:36-37`）。
  2. extension dispatcher 合并 config 后只检查非负整数；仅 `sample_rate_ms` 有 10 秒 clamp，两个 size 字段无 clamp（`agent_command_dispatcher.ts:235-295`）。
  3. 因此授权 Agent 可传接近 `Number.MAX_SAFE_INTEGER` 的值，让 extension CDP/stream/fallback/storage 路径的截断形同虚设，放大内存和 IndexedDB消耗。现有 dispatcher 测试覆盖类型错误和 sample rate clamp，不覆盖 size cap。
  4. 外部 Bridge CDP 路径已正确要求 `Number.isSafeInteger && <= MAX_BODY_CAPTURE_BYTES`（`cdp_handler.ts:164-168`），说明两条入口策略不一致。
- **Impact:** 已授权 Agent 的误配置或恶意 MCP client 可造成单次采集内存/磁盘耗尽、浏览器卡顿或 capture 失败。它已持有 start/stop/export 能力，且用户可停止采集，因此定 Low。
- **Recommendation:** schema 与 dispatcher 双边限制：`max_body_capture_bytes <= MAX_BODY_CAPTURE_BYTES`，`inline_text_max_bytes <= INLINE_TEXT_MAX_BYTES` 或产品定义的新硬上限；使用 safe integer。超限应拒绝而非静默接受，或明确 clamp并回传 effective config。补边界值、`MAX+1`、`Number.MAX_SAFE_INTEGER` 测试。
- **History / pre-existing:** **预存。** `27ca0f1`（2026-06-22）引入专属 Zod schema时即只有 `.min(0)`；dispatcher 校验来自 `a03ac6f`（2026-07-14）。2026-08-12 background review 已报告同一问题；当前只修复了 `sample_rate_ms`，size 上限仍未处理。

## Strengths

- Bridge 配置强制 `127.0.0.1`，port 合法化，MCP/CDP 路由使用 Bearer token；token 自动生成、持久化文件按 0600读取/收紧，客户端错误原因可诊断。
- t137 已修复显式 export `output_path` 绝对/`..`/symlink 穿越，并对已有 instance 的不同 extension ID 顶替、label 顶替增加保护和测试。
- Extension 到 Bridge 的 URL parser/health fetch 有 loopback allowlist，避免手工 storage 写入远端 URL形成 SW SSRF；默认配置和 `.mcp.json.example` 指向 loopback。
- Bridge command queue 有 timeout、owner 绑定、cancel cleanup；extension result body 有 64MiB HTTP上限；CDP session 有 idle TTL、事件条数上限、200MB 聚合 body 预算和淘汰日志。
- `redact_url` 对 userinfo、query、nested query有 fail-closed/保形处理；logger 对 credential 形字段、URL、Error message/stack统一净化并有单条 64KB cap。
- Dashboard/export/popup 主要渲染路径使用 escape helper，相关 XSS tests覆盖 request/response body 等恶意字符串。
- content 消息接收有 `source`/`origin`/nonce/per-message HMAC、多次 start secret旋转、注入失败诊断；虽然 SEC-005 指出威胁模型边界，针对普通页面脚本误发/只读 nonce 的防护仍比单 nonce 明显更强。
- `scripts/repo_template` 的 Git 调用使用 argv list而非 shell，branch/tid/path多处正则与 ownership校验；worktree 删除拒绝未知/错 owner路径。view server默认 loopback，文档读取限制在 task/archive task目录，JSON注入转义 `</script>`，并有 traversal/XSS测试。顶层 Node scripts使用 `execFileSync` 固定命令与 argv，未发现 shell injection链路。
- Vite preview/E2E server显式 loopback；TypeScript strict/noEmit，Vitest 排除产物与 E2E，构建脚本没有发现 secret注入 bundle。

## 未覆盖区域与验证限制

- 未读取 `node_modules/**` 实现、浏览器/Node/Playwright/fflate/MCP SDK第三方依赖源码，也未执行 `npm audit`/供应链 provenance验证。
- 未动态验证 Chrome 对 content script注入、CSP、跨 frame、service worker休眠、IndexedDB quota、downloads权限的真实运行时行为。
- 未对现有 `data/**` capture/zip、`artifacts/**` build产物做敏感内容扫描；这些属于运行数据/产物，不是本次代码 review输入。
- 未进行网络抓包、端口监听、curl enroll PoC、恶意 CDP server、远端 WebSocket、OAuth hash页面或内存/磁盘压力测试；所有复现证据为代码调用链和现有测试契约。
- `scripts/repo_template` 约 20+ 模块以危险 API、核心 Git/worktree/integration/view path和对应 tests为重点审阅，未逐行证明每个 CLI状态转换的业务正确性。未发现需新增 security finding。
- 当前生效 spec 清单主要覆盖 t092–t126；多项长期产品行为只存在 archive specs/decisions。SEC-003/SEC-006/SEC-008 在历史 review中已有记录但未进入当前 active spec闭环。
- 未运行任何 test/lint/tsc/build，不能声称现有测试当前通过；父 reviewer 应统一验证。建议最小定向验证包括 Bridge enroll security、CDP events、redaction/logger、agent dispatcher/schema、dashboard XSS、repo_template view server tests。
