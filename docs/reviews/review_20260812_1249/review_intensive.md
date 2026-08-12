# Intensive Review — capture_all @ 8c82218 2026-08-12

## Summary
- Scope: `src/` 全量 86 文件 16,923 行，5 bundle 并行审（B1 核心层 / B2 采集引擎 / B3 内容脚本 / B4 仪表盘 / B5 popup+devtools）；tests/unit 按 P7 覆盖核查。bundle 原始报告见同目录 `b1_core.md`…`b5_popup_devtools.md`。
- Findings: C/H/M/L/Info = 0/20/46/40/若干（聚合去重后独立 issue 计数；两 agent 原判 Critical 因不满足「安全/数据丢失/崩溃」降级为 High，见裁决说明）
- Verdict: **REQUEST CHANGES**（无 Critical 但有 20 High，且 Spec Compliance 多项不变量被违反）

> 本报告聚合 5 路独立 bundle 审阅，去重合并跨 bundle 同根因项，并对全部 Critical 与 Top High 由主会话亲自源码核实（escape/redaction/keyboard/agent_command_dispatcher/bridge server 均已 Read 验证）。「预存」= git blame 判定旧提交遗留，多数源自 6 月基线（ac8fefe9）或更早。

## 裁决说明（Critical 降级）
| 原判 | 聚合裁决 | 理由 |
|---|---|---|
| B2-C1 HTML 导出 JSON 嵌入转义不完整（95） | **High** | 功能不可用，但非安全漏洞、非数据丢失（采集数据未损）。已核实 `escape_for_html_embed`（escape.ts:4-10）不转义 `'`/`\n`，`exporter.ts:221` 被击穿。 |
| B2-C2 body 上限被 agent 配置绕过（70） | **High** | 需 agent 显式传 `max_body_capture_bytes:1e15`，非默认路径；但无上限封顶是确定缺陷。已核实 `agent_command_dispatcher.ts:275-276` 仅 `is_non_negative_integer`。 |

## Critical / High（必修，聚合后 20 High）

### 安全 / 权限
- **[H][85] bridge `/mcp/command` output_path 任意文件写（B1-H1）** — `src/bridge/server.ts:487-496`、`src/mcp/schemas.ts:114-128`。已核实 `explicit_path` 分支直接 `writeFile` 绕过自动净化。持有 MCP token 的 agent 可写任意路径。修复：约束到 export_dir（`path.resolve` + 前缀校验）。威胁模型含恶意 MCP 客户端时升 Critical。
- **[H][70] `/extension/enroll` 伪造 chrome-extension origin 顶替/劫持实例（B1-H2）** — `src/bridge/server.ts:254-331,553-555`。`is_allowed_extension_origin` 仅验形状不绑真实扩展 ID；enroll 免 mcp token/pairing（T091）。伪造 Origin 本地进程用真实 `instance_id` 重 enroll 顶替 token_hash。修复：已存在 instance_id 时要求旧 token / 绑定扩展 ID / 限速。
- **[H][85] redact_url 对绝对 URL 无条件规范化，默认配置改写全部网络/日志 URL（B1-H3）** — `src/shared/redaction.ts:107-158`。已核实 L158 无条件 `parsed.toString()`，无敏感参数也追加尾斜杠/降 host/重排参数，破坏回放匹配。修复：仅 `redacted` 时用 `parsed.toString()`。

### 数据完整性 / 隐私
- **[H][85] keyboard 对 type=password 击键明文入库（B3-H1）** — `src/extension/content/keyboard_capture.ts:83-98`。已核实 L85 `key: masked?null:event.key`、全模块无 password 守卫（dom_capture 有，keyboard 漏）。`all`+`redact_data:false` 即明文密码入库，违反绝对约束「password input 永不采集」。无测试覆盖。修复：`HTMLInputElement && type==='password'` 置 key=null + 补测试。
- **[H][75] content 侧 ws/fallback 路径脱敏缺失（B3-H2/H3）** — `websocket_capture.ts:190-196`、`network_hook.ts:358-359`。ws_url 与 ws 消息前 200 字节、fallback hook URL 默认 `redact_data:true` 下原文入库，与 background CDP 路径（`network_capture.ts:724`）行为不一致。`?token=` 与消息明文直落 IndexedDB。修复：content 接收侧统一套 `redact_url`。

### 采集生命周期 / SW
- **[H][90] agent 查询全量整载 + `data.get` 也整载，OOM 风险（B2-H1）** — `agent_data_queries.ts:55-98`、`storage.ts:441-457`。7 source 全部 `fetch_all`（每页 5000）整载内存；`index.getAll` 再 slice = O(n²)。500MB capture 内存放大数倍。修复：IDB cursor 直接分页。
- **[H][85] 扩展侧无 64MiB 结果上限，大结果必被 bridge 413 拒收且副作用丢失（B2-H2）** — `agent_bridge_client.ts:298-332`。`MAX_EXTENSION_RESULT_BODY_BYTES` 只在 bridge 侧强制，扩展侧不预检，413 后 4xx 直接放弃（L312）。已执行命令结果永久丢失。修复：出口预算 + 分页收缩。
- **[H][80] SW 重启后 500MB 限额失效（bytes_written 纯内存态）（B2-H4）** — `storage.ts:259,409-435`。已核实 Map 重启清零，`check_storage_limit` 恒 false，超限持续膨胀。修复：限额持久化计数。
- **[H][80] SW 重启只「终态化」不「恢复」，跨重启采集被截断（B2-H5）** — `service_worker.ts:131-184`。`cleanup_stale_capture_state` 仅标 completed 清键，不重建 is_capturing/子系统，违反「长时操作必须重启后恢复」约束。`service_worker_stale_cleanup.test.ts` 只测终态化。修复：真恢复或明示「重启即终止」并保证不丢。
- **[H][75] body 换 tab 强拆 console debugger 会话，console 静默断流（B2-H3）** — `network_capture.ts:183-190`、`service_worker.ts:1048-1060`。`enable_response_body_capture` 换目标先 detach；onActivated 传 `already_attached=false` 强拆 console attach 的 tab。修复：统一仲裁单 attach 目标整体迁移。
- **[H][65] ws_frame 相对时间用 CDP monotonic 秒数×1000 减 epoch 起点，产出约 -1.7e12 负数（B2-H6）** — `network_capture.ts:340`。已核实 `params.timestamp*1000 - start_time`，负值绕过 `>1e10` 守卫直接落库污染 timeline。修复：`Date.now()` 或 CDP walltime。预存（t119 前遗留）。
- **[H][70] popup stop 后完成态被 storage.onChanged 竞态覆盖（B5-H1，本次新增）** — `popup.ts:484-494`。2aaeec9 新增监听对所有 is_capturing 变更无条件 load_state→render，无法区分自写/外部写入；SW stop + popup 自写两次 `false` 触发 onChanged，时序性覆盖 `state='saved'`，导出/查看入口消失。无测试。修复：SW 写入带来源标记或 self_transition guard。
- **[H][90] stop 后页面 hook 永久残留，network_hook 持续对每次 fetch 全量读 body（B3-H4）** — `network_hook.ts:392-398` + 注入脚本。stop 仅删 message_listener，不还原 fetch/XHR/localStorage/WebSocket，100MB 级 `clone().text()` 持续到导航。修复：注入还原脚本或 enabled 标记短路。

### Dashboard 功能
- **[H][95] dashboard 全量硬编码中文，零 data-i18n（B4-H1）** — dashboard 全部 8 文件。`rg data-i18n src/extension/dashboard/` 空；每文件 10-93 行中文字符串；`ui_strings.test.ts` 只拦 5 个废弃术语不拦硬编码文案。切 en 界面仍全中文。违反「国际化 data-i18n + t()」约束。
- **[H][88] 时间线 network/console/dom 三轨恒空，快速筛选计数恒 0（B4-H2）** — `dashboard_shared.ts:220-227`、`dashboard_detail.ts:248-259`。`load_detail` 只合并 5 类进 `detail_events`，network_requests/console_events 未并入 → 三轨恒空。修复：并入或删三轨。
- **[H][75] 详情页每 2s 全量快照重载 + 重渲染，交互竞态与监听泄漏（B4-H3）** — `dashboard.ts:114-137`。轮询 2s 无条件 `load_detail`（读 0..100000×5 类再排序）+ 整页重渲染；拖拽中途重渲染替换 DOM、pointermove 监听泄漏、`_dt_sel` 指向旧事件。修复：onMessage 推送增量或变化检测。

### 契约 / 跨层
- **[H][85] 消息契约漂移：请求/响应形状与文档约定不符（B5-M1，横切 B2-B5）** — `popup.ts:357,390`、`service_worker.ts:204-227`。约定 `{action,payload?}→{success,data?,error?}`；实际扁平字段/裸对象/裸数组、`get_capture_data` 返回 `{success,capture}`。全部依赖 `any` 无类型共享。修复：统一契约或改文档 + 共享类型。
- **[H][85] logger 仅脱敏 URL 子串，credential 形字段可明文入 app_logs（B1-M2）** — `src/shared/logger.ts:38-41`。`sanitize_value` 只对 URL 正则，`{headers:{authorization:'Bearer xyz'}}` 原样入库。修复：字段级置 `[REDACTED]`。
- **[H][75] cdp_handler 会话 body 内存总量无上限（B1-M1）** — `src/bridge/cdp_handler.ts:48,340-360`。事件数有界 5000，单条 body 可到 100MB，最坏 500GB 内存。修复：会话级聚合字节预算。

## Medium / Low / Info（建议，聚合去重后）

### 正确性 / 数据
- locale 双轨 `zh_CN` vs `zh`（B1-M6 + B4-M5）：`user_config.ts:401` 放行 `zh_CN` 但 `i18n.ts:2` `Locale` 枚举无；`zh` 被 sanitize 拒绝回退 en，设置页语言下拉与界面错位。
- `detail_time_display_mode='absolute'` sanitize 放行但类型/消费端不支持（B1-M5），静默类型谎言。
- network store 混存 ws_frame 与 NetworkRequestData，`get_record_type` cast 说谎（B2-M8）。
- fallback body 同毫秒 event_id 冲突覆盖丢事件（B2-M2，`service_worker.ts:855`）。
- `get_native_record_id` fallback 碰撞（B2-M13）。
- storage/ws payload 合并到事件顶层而非 `event.data`（B3-M1，8c82218 refactor 延续），dashboard 读不到 key 显示「 changed」。
- 网络表时间列恒 `+00.000s`、控制台时间列恒空（B4-M1/M2，读不存在的 `timestamp` 字段）。
- `event_kind` 映射与 `category_for_event_type` 不一致，ws/clipboard/form/focus/resize/fullscreen/print/visibility 错标「生命周期」（B4-M3）。
- 搜索输入 `"` 双转义为 `&amp;quot;`（B4-M4）。
- in-flight 状态轮询可在 stop 后复活采集 zombie（B3-M4，`poll_capture_status.ts:43` 不查 stopped）。
- focus 双重采集 dom_capture(focusin)+focus_capture(focus) 冗余 2x（B3-M6）。
- network_hook 全部请求 `resource_type:'fetch'`，XHR 误标（B3-M7）。
- request_id 碰撞 `hook_${Date.now()}_${6位随机}`（B3-L2）。

### 健壮性 / 可观测性
- flush 失败无退避无限重试，buffer 无界增长（B2-M9）。
- agent 结果投递 4xx/413 直接放弃不重试（B2-M10，放大 64MiB 问题）。
- 空 catch/静默吞错面广：CDP detach/enable/stream、bridge poll、detect（B2-M14）。
- 内部错误细节回传用户/agent（B2-M15，`to_agent_error` 原样外泄 error.message）。
- mcp client fetch 无超时 AbortController 缺失（B1-M3）。
- `sanitize_value` 对 getter 抛错无 catch，日志点成崩溃源（B1-M7）。
- strict-CSP 页面注入脚本静默失败无诊断，github/bank 类站点三类采集归零（B3-M3）。
- keepalive handler 空操作保活语义薄弱（B2-M16）。
- content 侧 `MessageLogTransport.flush` 自旋 50ms 无限循环（B2-M20）。
- bridge 无结构化日志/可观测性（B1-M13）。
- popup 轮询无单飞、capture_toggles 写后无人消费、get_capture_config 硬编码缺省不读 DEFAULT_CONFIG（B5-L1/L4/L5）。

### 性能 / 资源
- `app_log_storage.trim_if_needed` 每次 flush 全表 cursor 扫描 O(n)（B2-M18）。
- 非 full-data 大结果内联 JSON 回传膨胀 MCP 文本通道（B1-M4）。
- 时间线渲染 O(n²)（`indexOf` 双循环），10 万级卡死（B4-M8）。
- `zipSync` 同步压缩阻塞 UI（B1-M11）；`system_time` browser 分支每次 new Intl.DateTimeFormat（B1-M12）。
- fallback hook 对超大响应体全量 `clone().text()` + 结构化克隆（B3-M5）。
- popup list_captures 全量传输仅渲染 3 条（B5-I1）。

### 架构 / 可维护性
- `network_context.ts` 死代码（仅测试引用，B2-M7）。
- `devtools_panel.ts/html` 孤儿面无入口引用（B5-M2）。
- `dashboard_detail.ts` 769 行单体，resize 两套重复实现（B4-M13）。
- `capture_data_reader` 每类 100000 条静默截断无标记（B1-M14）；ID 工具重复 id.ts vs event_utils（B1-L8）。
- bridge `prune_stale` 死代码、`resolve_target._write` 未用参数（B1-L1/L2）。
- `FLUSH_BATCH_SIZE=100` 死常量批次语义未实现，规范与实现偏差（B2-M17）。
- bridge URL 校验两处口径不一致 agent_bridge_config vs external_cdp_bridge_client（B2-M19）。
- 超大文件：network_capture.ts 1211 行、service_worker.ts 1207 行、dashboard_detail.ts 769 行、storage.ts 519 行（§3.5 专项，均需按职责拆）。
- build_xpath/selector 对 id 特殊字符损坏（B1-M10 + B3-L4 同根合并）。

### XSS 纵深（触发面小，规范一致性）
- 状态徽章 status 未转义直接插值（B4-M6）；cache_status 未转义（B4-L1）。

## Spec Compliance（对照 `docs/blueprint/domain.md` 业务不变量 + `conventions.md`）
| 不变量 | 状态 |
|---|---|
| type=password 永不采集 | **违反**（B3-H-1 keyboard 路径） |
| 敏感 header/URL 必须脱敏 | **部分违反**（B3-H-2/H-3 content 侧、B1-H-19 logger 侧） |
| 长时操作 SW 重启后恢复 | **违反**（B2-H-9 只终态不恢复） |
| 单活跃采集 | 合规（capture_state run_exclusive） |
| stop drain 顺序 | 合规（stop_capture.test.ts 覆盖） |
| Bridge 只监听 127.0.0.1 | 合规 |
| instance_token 与 MCP token 分离 | 基本合规，enroll 伪造 origin 面见 H-2 |
| HTML 导出转义 | **违反**（C1 escape_for_html_embed 漏 `'`/`\n`，已降 High） |
| 国际化 data-i18n | **违反**（B4-H-1 dashboard 全量硬编码） |
| 应用日志进 app_logs（logger.ts） | 合规（B3 内容脚本用 MessageLogTransport） |
| 禁 console.log | 合规（未检出） |

## Strengths
- capture_state 状态机 + run_exclusive 串行化：start/stop 竞争防护设计良好，`network_stop_deferred_timers` 测试到位。
- stop drain 顺序：先停生产者 → flush_all → 翻 is_capturing → stopped event 含最终 stats，测试完整。
- XSS 主链路：`escape_html`/`esc()` 贯穿 dashboard/导出/popup，事件数据渲染逃逸一致。
- B3 认证层：postMessage targetOrigin + origin 校验 + nonce + per-message HMAC，RFC 向量测试（content_hmac_vectors）、双实现漂移与 e2e 交叉验证质量高。
- B1 脱敏函数深度：fail-closed 递归、嵌套 query 脱敏（t114）、`redact_headers`，边界测试扎实。
- bridge command_queue：超时双向清理、`cancel_all` 逐条 COMMAND_CANCELLED，设计良好。
- 导出防重入：`export_in_flight` guard 三路径覆盖（export_busy_guard.test.ts）。

## skill 新增扫描面核对（§3.5 + 探针新增项）
- **死代码全扫**：已覆盖 network_context（B2-M7）、prune_stale（B1-L1）、devtools_panel 孤儿（B5-M2）、FLUSH_BATCH_SIZE 死常量（B2-M17）、webrequest_handler 已删但 architecture.md 仍列（见下文档过时）。
- **文档过时全扫**：architecture.md §3 目录结构仍列 `webrequest_handler.ts`（t123 已删除，9e4e311 前清理）；domain.md 限制表与实际实现基本一致（除 FLUSH_BATCH_SIZE 语义、64MiB 仅在 bridge 侧）。
- **超大文件专项（§3.5）**：network_capture.ts 1211 / service_worker.ts 1207 命中 >1000 行强阈值；dashboard_detail.ts 769 / storage.ts 519 >500 行提示。t129 已拆 4 个超长函数但文件级仍未拆。
- **重复组件/逻辑**：sidebar_resize.ts 与 dashboard_detail 两套 resize（B4-M13）；三套轮询实现 popup/dashboard/poll_capture_status（B5-L3）。

## Appendix — Traceability
| finding | 规则源 | 代码片段 |
|---|---|---|
| H-1 output_path | `docs/blueprint/domain.md` Bridge body/命令限制 | `write_result_to_file(result, output_path, content)` server.ts:495 |
| H-2 enroll 顶替 | `docs/blueprint/domain.md` instance_token 分离、T091 loopback 直通 | `is_allowed_extension_origin` server.ts:553-555 |
| H-3 redact_url | `conventions.md` 安全编码「敏感 URL query 必须脱敏」 | `return { url: parsed.toString(), url_status: redacted?... }` redaction.ts:158 |
| H-4 password | `docs/blueprint/domain.md`「type=password input 永远不被采集」 | `key: masked ? null : event.key` keyboard_capture.ts:85 |
| C1 HTML 导出 | `docs/blueprint/domain.md`「HTML 导出必须转义动态内容」 | `JSON.parse('${safe_json}')` exporter.ts:221；escape.ts:4-10 |
| H-8/H-9 SW 重启 | `docs/blueprint/architecture.md` §4.1「SW 重启时 cleanup 恢复/终止旧采集」 | `cleanup_stale_capture_state` service_worker.ts:131-184 |
| H-14 i18n | `conventions.md` UI 编码「禁止组件里硬编码中/英文字符串」 | `rg data-i18n src/extension/dashboard/` 空 |
| H-17 消息契约 | `conventions.md` 浏览器扩展 API 规范「请求/响应统一形状」 | `sendMessage({action, capture_id, config})` popup.ts:357 |
| H-19 logger 脱敏 | `conventions.md` 安全编码「敏感 header 必须脱敏」 | `sanitize_string` logger.ts:38-41 |

---
*Generated by intensive-review skill · 5 bundle 并行 + 主会话核实聚合 · 只读，未改动代码 · 落盘 docs/reviews/review_20260812_1249/（同 my-review prepare_outdir 机制）*
