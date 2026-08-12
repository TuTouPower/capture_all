# Task review t150（reviewer_focus: 代码）

- task：`t150_error_handling_observability`
- spec：`docs/tasks/t150_error_handling_observability/spec.md`
- diff_anchor：`bdb141906330a49382009295f03497551bf379d2`
- target：`git diff bdb141906330a49382009295f03497551bf379d2`
- round：1
- reviewed_at：2026-08-12 18:40 UTC+8

reviewed_scope: c8a26e6436212c82

## Findings

### t150_code_f001 - mcp client 全量数据命令 fetch 超时上限与 bridge 全量缺省不一致，长时间导出被误杀

- 严重度：important
- 锚点：AC-003（mcp client fetch 带超时，bridge 挂起不无限阻塞）+ 评审重点「超时不误杀正常请求」。观察到的行为与 AC 意图有差距：超时兜底对全量数据命令缺省档失效。
- 位置：`src/mcp/client.ts:10,29`（`DEFAULT_COMMAND_TIMEOUT_MS=120*1000`、`(timeout_ms ?? DEFAULT_COMMAND_TIMEOUT_MS) + TIMEOUT_GRACE_MS`）；`src/bridge/server.ts:511-515`（`FULL_DATA_COMMANDS` 走 `config.full_data_timeout_ms`，缺省 300s）
- 问题：agent 调 `capture.export` / `capture.get_all_data` 且**未显式传 timeout_ms** 时：client fetch 上限 = 120s + 5s = 125s；bridge 对这两类命令（`FULL_DATA_COMMANDS`，含 capture.export/capture.get_all_data）缺省命令超时 = `full_data_timeout_ms` = 300s。当导出数据量大、耗时落在 125s~300s 区间：client 的 AbortSignal 在 125s 中断 fetch，agent 收到 `Bridge request timed out after 125000ms`，bridge 侧仍继续执行并在完成后 `send_json` 写已关闭 socket（数据丢失、结果无响应可送达）。改动前 fetch 无上限，此类请求可正常完成——本次改动对该路径引入过早中断。regular 命令（bridge 缺省 120s < client 125s 上限）不受影响，故问题集中于全量数据命令缺省档。
- 建议：client 侧按命令类型对齐 bridge 缺省——对 `capture.export`/`capture.get_all_data` 用 `full_data_timeout_ms`（300s）+grace 计算上限，或在 `src/mcp/tools.ts` 对这两类工具在未传 timeout_ms 时显式下发默认值，使 client 上限 ≥ bridge 命令超时。

### t150_code_f002 - external CDP 轮询失败 warn 每 500ms 重复刷屏，bridge 离线时 app_logs 洪泛

- 严重度：minor
- 锚点：评审重点「空 catch 补 warn 不引入噪音」。
- 位置：`src/extension/background/external_cdp_bridge_client.ts:179`（`poll_external_cdp_events` catch warn）；`src/extension/background/body_capture_coordinator.ts:255-268`（500ms 单飞轮询，捕获期内不停）
- 问题：bridge 中途关闭/挂起后，轮询以 500ms 节奏持续失败，`poll_external_cdp_events` 每次失败记一条 `warn`（SW 侧经 `get_app_log_transport` 落 IndexedDB app_logs），直到采集结束。约 2 条/秒持续累积（一次长采集可上千条）。轮询失败在 bridge 离线场景属**预期重复状态**而非一次性异常，warn 级别逐次记录构成噪音。无 bridge 启动时的 `detect_external_cdp` 每端口一条 warn 同理但次数少，可接受。
- 建议：连续 N 次失败后降级 debug 或加退避（如首次 warn、后续 debug，或指数退避轮询）。

### t150_code_f003 - 内容脚本同族空 catch（update_page_nonce / restore_page_script）未补日志，AC-001 覆盖不全

- 严重度：minor
- 锚点：AC-001（空 catch 位点补日志/错误上报）。
- 位置：`src/extension/content/network_hook.ts:306,327`；`src/extension/content/storage_capture.ts:108,134`；`src/extension/content/websocket_capture.ts:148,168`
- 问题：本 task 触及的 3 个内容模块，主注入已统一走 `inject_script_element` 诊断（B3-M3），但同族的 `update_page_nonce` 与 `restore_page_script` 仍是裸空 catch：DOM 异常时静默，strict-CSP 拦截 nonce 同步脚本时（无 error 监听、同步 remove）也无任何痕迹。影响低于主注入（restore 是 stop 清理、nonce 失效场景在主注入诊断已覆盖的 strict-CSP 下伴随发生），属 AC-001 覆盖补全项而非行为缺陷。
- 建议：`update_page_nonce` 至少补 warn/debug，或复用 `inject_script_element` 的 error 事件诊断；`restore_page_script` 可保留静默并在注释说明为清理路径。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：3 条（1 important + 2 minor）
- 未进表的提示：
  - **文件过大**（命中阈值，但本 task 净增小，按降级规则不进 finding 表）：`src/extension/background/network_capture.ts` 1245 行（本 task 净增约 +20）、`src/extension/background/service_worker.ts` 1257 行（净增约 +20）、`src/bridge/server.ts` 985 行（净增 +18）。超大体积为历史累积，本 task 仅小幅新增，未达「本 task 仍堆大不可信」的 important 判定，仅提示后续拆分。
  - **复杂度**：`network_capture.ts` 的 `handle_cdp_event` 分支多，历史累积；本 task 仅增一个 if/else（get_body_error 按 status 分流 debug/warn），未新增 ≥15 复杂度。
  - **范围外观察**：`src/bridge/cdp_handler.ts:73,88` 的淘汰 warn 为**逐事件**记日志（淘汰态下每新增事件一条 stderr 行），极端流量下行数多；属 B1-M13 有意诊断，未聚合/限流。另 `service_worker.ts` `handle_message`/`handle_export_app_logs`/`start_capture_inner` 的错误 detail 均已 `logger.error` 入 app_logs，对外仅回通用串，属 AC-002 一致取舍，不判 finding。
  - **认可取舍**：`handle_test_bridge_fetch` 保留原始错误串——用户手动诊断 bridge 的端点，脱敏会失去用途，与 AC-002「agent 侧脱敏」语义一致。
- **AC 复验方式**：
  - AC-001（空 catch 补日志）：`re_verified` — 逐文件核对：network_capture 全部 CDP 空 catch 转 warn（含 streamResourceContent_failed 升级、get_body_error 按 status 分流）；console/exception 的 detach 空 catch 转 warn；coordinator 两处空 catch 转 warn；external_cdp_bridge_client 三处转 warn；content 主注入转 `capture_error`（recoverable=false，SW `handle_event` 按 category='error' 计入 stats，`capture_stats.ts:41` 验证）。CDP 失败均 ≥warn。
  - AC-002（错误脱敏）：`re_verified` — 读代码核对对外 message：console/exception 返回 `CDP_ATTACH_FAILED: ...` 不含内部串；coordinator 对外 message 去掉 error_msg 插值（error_msg 仅用于分类）；service_worker 三处（message handler / export / start_capture）均 `logger.error` 保留 detail 后回通用结构化码；`to_agent_error` 未知错误走结构化码 + 通用 message。无剩余 `message: ${err}` 形态的内部路径泄漏。
  - AC-003（mcp 超时）：`re_verified` — 读代码 + 断言：`AbortSignal.timeout` 语义正确（get_status 10s / send_command timeout+5s / 缺省 120s+5s），`fetch_with_timeout` 将 TimeoutError 转可读错误；测试断言 `agent_mcp_client.test.ts` 覆盖三语义。**发现 f001 缺省档与 bridge 全量 300s 缺省不一致。**
  - AC-004（sanitize getter 兜底）：`re_verified` — `logger.ts:85-90` try/catch 返回 `'[Unserializable]'` 且 finally 清理 seen；测试断言 getter/Proxy 抛错不崩溃、seen 无跨调用污染。
  - AC-005（keepalive 真实工作）：`re_verified` — `keepalive.ts:16-24` handler 调用 `flush_all()` + app_log flush；`flush_store` 空 buffer 早退，30s 周期开销小；`keepalive.test.ts` 断言 flush_all 被调用。
  - AC-006（flush 轮次上限）：`re_verified` — `logger.ts:164,185` `max_flush_rounds=5`；`send_batch` 整批 splice + 成功后循环自然退出，正常 stop 路径不受限（写停后一轮清空）；测试断言 send ≤5 次。剩余缓冲在写继续时由下次 write 触发的 ≥20 自动发送兜底，无永久丢批。
  - AC-007（未处理 rejection）：`re_verified` — `handle_cdp_body_event` 补 `.catch`；`tabs.onActivated` 的 `tabs.get` try/catch；`app_log_storage.ts:29-35` fire-and-forget flush 补 `.catch`（失败回填 buffer 供重试，无 rejection 外泄）。
  - AC-008（bridge 结构化日志）：`re_verified` — `bridge/logger.ts` 用 console.warn/error 输出 JSON 行（Node 侧例外合理）；认证失败（server.ts 6 处 auth_failed）、命令超时（server.ts:516-525）、CDP 连接失败/淘汰/畸形消息（cdp_handler.ts）均接入；`agent_bridge_server.test.ts` 断言 auth_failed JSON 结构。
  - coverage = re_verified 8 / 8
- 系统性 follow-up：无

verdict: FAIL

## Round 2 (2026-08-13 00:20 UTC+8)

reviewed_scope: b3226dbd84bab50a

### 前轮 finding 复核（以当前 diff 为准）

- **t150_code_f001（important）**：已消除。`src/mcp/client.ts:8-14` 新增 `FULL_DATA_COMMANDS`（capture.export / capture.get_all_data）+ `DEFAULT_FULL_DATA_TIMEOUT_MS=300s`，send_command 对这两类命令缺省 fetch 上限 = 300s+5s = 305s，≥ bridge `full_data_timeout_ms` 缺省 300s（`src/bridge/config.ts:36`）。原 125s 早断场景消除：未传 timeout_ms 的长时间导出不再被 AbortSignal 中断。新增测试 `tests/unit/agent_mcp_client.test.ts`「full_data 命令（capture.export）缺省用 300s+5s」断言 305s / 普通命令 125s；复跑通过。残余非阻断项：bridge 若被自定义配置为 full_data_timeout_ms>300s，client 无法感知 server 配置，需调用方显式传 timeout_ms；默认档已对齐。
- **t150_code_f002（minor）**：已消除。`src/extension/background/external_cdp_bridge_client.ts:83,180-187` 模块级 `last_poll_fail_warn_ts` 节流 10s，轮询失败 warn 降频至每 10s 一条。行为不变（失败仍返回 []，既有 poll 失败测试仅断言返回值，不受节流影响，复跑通过）。节流无专属测试，但逻辑简单可读；模块级节流跨采集共享，新采集在距上次失败 <10s 内首个失败不 warn，可接受。
- **t150_code_f003（minor）**：已消除。3 内容模块 `update_page_nonce` catch 均补 `logger.debug('update_page_nonce injection failed', { error: String(err) })`（network_hook.ts:306-308 / storage_capture.ts:108-110 / websocket_capture.ts:148-150）。`restore_page_script` 保持静默——原 finding 建议允许（stop 清理路径）。

### 本轮新发现

- 0 条。

### 未进表的提示

- f001 残余：bridge 自定义 full_data_timeout_ms>300s 时 client 缺省 305s 会早断——需显式 timeout_ms；属配置错配而非默认档缺陷，不判 finding。
- f002 节流无专属测试：可后续在 external_cdp_bridge_client.test.ts 补（短时间连续失败仅 1 条 warn）。
- 文件过大 / 复杂度结论与 Round 1 一致，本任务仅小幅新增。

### AC 复验方式（本轮增量）

- 独立复跑命令：`npx vitest run tests/unit/agent_mcp_client.test.ts tests/unit/external_cdp_bridge_client.test.ts tests/unit/keepalive.test.ts tests/unit/content_injection_diagnostics.test.ts` → 4 文件 43 passed；`npx vitest run tests/unit/logger.test.ts tests/unit/agent_bridge_server.test.ts tests/unit/agent_command_dispatcher.test.ts` → 3 文件 129 passed；`npx tsc --noEmit` → exit 0。
- AC-001~008 复验类别同 Round 1（代码静态核对 + 测试断言）；本轮针对修复点额外复跑相关测试文件。
- coverage = re_verified 8 / 8

### 总体判断

f001（唯一 important）已修复并测试覆盖，f002/f003（minor）已修复；当前 diff 无未解决 critical / important。本轮新增测试断言与实现一致，未发现修复引入的新问题。

- 系统性 follow-up：无

verdict: PASS
