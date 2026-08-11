# 全量审阅评估（当前状态）

- 审阅日期：2026-08-11
- 范围：`src/` 当前工作区全量（98 文件 / 18842 行 / 7 批）
- 方法：不看 `git diff` / 历史 commit；7 路并行只读 reviewer + 主会话对 critical/blocking 源码复核
- 产物：`docs/reviews/review_20260811_0111/{batch}/review.md` + 本文件
- 总 finding（报告口径，未去重）：约 **96** 条；各批 verdict 均为 FAIL（shared 未写标准 verdict 行，按 blocking 计 FAIL）

## 评估原则

- 报告 claim 默认不采信；critical / blocking / 高影响 important 须源码复核
- 已核：`user`；报告合理但未逐行复跑：`likely`；证据不足或语境依赖：`open`
- 双实现分叉（`cdp_handler` vs `network_capture` 生产路径）按**生产接线**判定

## 核验结论：P0（建议立即修）

| ID | 摘要 | 核验 | 位置 |
|----|------|------|------|
| P0-1 | `sanitize_user_config` 丢弃 `browser_label` / `agent_bridge_poll_interval_ms`；任意 partial save 可抹掉 storage 中 label | **verified** | `src/shared/user_config.ts:378-411`；`DEFAULT_USER_CONFIG` 有字段但 sanitize 白名单未拷贝；`save_user_config` 先 load 再整表写回 |
| P0-2 | runtime exception 写入错误 sink：payload 无 `event.data`，`handle_console_log` 见空即 return → 异常全丢 | **verified** | `exception_capture.ts:154-165` 展开顶层；`service_worker.ts:871-874` 要求 `event.data`；应走 `write_error_events` |
| P0-3 | 生产 `network_capture` 仍用裸 `requestId` 作 Map 键；子目标 `getResponseBody`/`streamResourceContent` 未带 `sessionId` | **verified** | `network_capture.ts:397-457,498-565`；`cdp_handler.cdp_request_key` 存在但生产未接线 |
| P0-4 | external body 轮询 stop 未置 `poll_stopped`；`state.poll_timer` 仅首包 timeout id，后续递归 timer 清不掉 → stop 后可继续 poll/脏写 | **verified** | `body_capture_coordinator.ts:164-178,236-269`；返回对象上有 `stop()` 但 `stop_body_capture*` 未调用 |
| P0-5 | Bridge auto 导出 `format` 未净化，可 `join` 逃逸 `EXPORT_DIR` | **verified** | `src/bridge/server.ts:771-775`；`capture_id` 有字符过滤，`format` 无 |
| P0-6 | 页面 `postMessage` 仅静态 SIGNAL，无 per-page nonce → 页面可伪造 network/ws/storage 采集事件 | **verified** | `network_hook.ts` / `websocket_capture.ts` / `storage_capture.ts` 仅校验 `source === SIGNAL` |
| P0-7 | `network_hook` 在 content start 时无条件启动，无视 `capture_network` / body 策略 | **verified** | `content_script.ts:106` 无 config 门控 |

## 核验结论：P1（高优先）

| ID | 摘要 | 核验 | 批 |
|----|------|------|-----|
| P1-1 | SW `cleanup_stale_capture_state` 与 `start_capture` 无互斥；冷启动 setTimeout(0) 可能清掉刚写入的 `active_capture_*` | likely | sw_storage |
| P1-2 | Logger `Error.stack` 只截断不 URL 脱敏 | likely | shared |
| P1-3 | CDP session 固定 5min 销毁（非 idle）→ 长采集丢 body | likely | bridge_mcp |
| P1-4 | CDP events / body_seq map 无上限；`/json/list` 与 start 无超时 | likely | bridge_mcp |
| P1-5 | 命令已执行后 lifecycle 失效直接丢 result，不投递 | likely | bg_agent |
| P1-6 | stop 未清 deferred/orphan timer → 跨采集串写 | likely | cdp_net |
| P1-7 | Cookie 目标域为空时退化为全浏览器 | likely | cdp_net |
| P1-8 | content poll 用 `get_status.tab_id`（启动 active tab）→ 多 tab 串台 | likely | content |
| P1-9 | Popup 多数分类开关只写 tag 不关门控 | likely | ui |
| P1-10 | Dashboard ZIP 导出未 flush；`export_save_as` 存了不读 | likely | ui |
| P1-11 | 详情时间线搜索 debounce 重绘清空输入 | likely | ui |
| P1-12 | archive body 去重改文件名未回写 JSONL `*_body_ref` | likely | ui |
| P1-13 | `bytes_written` 仅内存；限额 API 无生产调用方 | likely | sw_storage |
| P1-14 | 活跃采集可被 `delete_capture`；SW 重启终态化无 `capture_stopped` | likely | sw_storage |
| P1-15 | `redact_url` 解析失败 fail-open（相对 URL 漏脱敏） | likely | shared |
| P1-16 | HAR `startedDateTime` 退化 1970；base64 缺 encoding | likely | cdp_net |

## 相对 2026-07 批的改善（可见）

- SW：`run_exclusive`、start rollback、stop drain 顺序、`active_capture_*` 持久化骨架、部分 generation 门闩（`onActivated` 主路径）
- body coordinator：单飞 `setTimeout` 递归（但仍有 stop 未接 `poll_stopped`）
- Agent：heartbeat 携带 `browser_label`（但 sanitize 导致配置不粘滞，实际仍断）
- UI：捕获数据进 `innerHTML` 普遍 escape；CSP 收紧；**本批无 XSS finding**
- 双实现：`cdp_handler` 复合键已写好，**生产仍走 `network_capture` 旁路**

## 批次统计

| 批 | 文件/行 | 报告 finding 约数 | verdict | 主导风险 |
|----|---------|-------------------|---------|----------|
| src_bridge_mcp | 11 / 1891 | 10 | FAIL | 导出路径、CDP session 生命周期、超时 |
| src_shared | 14 / 2177 | 12 | FAIL | config sanitize 丢字段、脱敏 |
| src_ext_bg_agent | 9 / 1960 | 16 | FAIL | body poll stop、result 投递 |
| src_ext_bg_cdp_net | 9 / 3524 | 14 | FAIL | session 复合键未接线、exception sink |
| src_ext_bg_sw_storage | 5 / 2374 | 14 | FAIL | stale cleanup 竞态、存储限额 |
| src_ext_content | 16 / 1961 | ~15 | FAIL | 伪造 postMessage、hook 门控、tab 串台 |
| src_ext_ui_shared | 34 / 4955 | 15 | FAIL | 开关假门控、导出/设置粘滞 |

## 建议 task 合并方向（未建 task，仅建议）

1. **config 持久化修复**：sanitize 补齐 + save 不抹字段 + 单测（P0-1，连带 UI F004）
2. **exception 管线**：`event.data` + `write_error_events` + 勿经 console sink（P0-2）
3. **CDP 生产路径统一**：`network_capture` 接 `cdp_request_key` + 子目标 sessionId 命令（P0-3，消双实现）
4. **body external poll 生命周期**：stop 调闭包 `stop()` / generation token（P0-4）
5. **Bridge 导出路径净化 + session TTL/超时/bound**（P0-5, P1-3/4）
6. **content 注入认证**：nonce + schema；network_hook 跟 config（P0-6/7）
7. **SW cleanup 互斥 + delete 活跃保护 + bytes 限额接线**（P1-1/13/14）
8. **UI 真门控 / flush 导出 / export_save_as / 搜索框状态**（P1-9..12）

## 不接受或降级

- 纯风格、文件过大、可再加 case：不进 P0/P1
- 扩展内 message 无 sender 收紧：manifest 隔离模型下标 minor（sw_storage_f009）
- 生产未接线模块（如部分 `ws_handler` 路径）的缺陷：标「若接线则 important」，不单独升 P0
- content 批 severity 标签与 share_prompt 三级不统一（B/H/M）：评估时映射为 critical≈B、important≈H、minor≈M

## 总体判断

当前代码相对 7 月批在 SW 状态机、XSS、部分 agent/heartbeat 上有实质收敛，但**生产路径仍存在多处可复现正确性/隐私/安全缺陷**。最硬核：配置字段被 sanitize 吃掉、runtime 异常全丢、CDP 子目标 body 失败、external poll 停不干净、导出 format 路径逃逸、页面可伪造采集事件。

**overall: FAIL** — 不建议在未处理 P0 前做发布级收口。

## 报告索引

- `docs/reviews/review_20260811_0111/MANIFEST.md`
- `docs/reviews/review_20260811_0111/src_bridge_mcp/review.md`
- `docs/reviews/review_20260811_0111/src_shared/review.md`
- `docs/reviews/review_20260811_0111/src_ext_bg_agent/review.md`
- `docs/reviews/review_20260811_0111/src_ext_bg_cdp_net/review.md`
- `docs/reviews/review_20260811_0111/src_ext_bg_sw_storage/review.md`
- `docs/reviews/review_20260811_0111/src_ext_content/review.md`
- `docs/reviews/review_20260811_0111/src_ext_ui_shared/review.md`
