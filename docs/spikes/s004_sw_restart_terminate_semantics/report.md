# Spike report

## 问题

SW 重启（30s 空闲回收 / 浏览器重启）后，模块级 producer 状态是否自动恢复：chrome.webRequest / chrome.debugger listener 与 content script 激活态。若可低成本恢复则「重启后恢复采集」可行；否则决策 010 + t030 的「重启即终止」语义应确认并固化。

## 成功判据

- 确认 SW 重启后 webRequest / debugger listener 的存活形态（自动恢复 or 需重注册）；
- 确认 content script 注入与激活态在 SW 重启后的形态；
- 基于上述事实判定「重启即终止」是否合理，以及已落库数据是否可保证不丢。

## 尝试

- 静态核对 `service_worker.ts` 与 `network_capture.ts` 的 listener 注册点：
  - `chrome.tabs.*` listener 在 `service_worker.ts` 模块顶层注册（`onActivated/onRemoved/onCreated/onUpdated`），SW 重启后模块重执行自动重注册——但这些 callback 闭包引用模块内存状态（`is_capturing` 等），重启后归零。
  - `chrome.webRequest.onBeforeRequest` 等 5 个 listener 在 `network_capture.ts` `start_network_capture()` 内注册（每采集一次），SW 重启后不自动恢复。
  - `chrome.dbg.onEvent` / `sendCommand` / `attach` 在 `start_network_capture` / `start_console_capture` 等生产者内完成；`chrome.debugger` 的 attach 状态属 tab 级（扩展 reload 才释放），但 SW 重启后 `onEvent` listener 消失，需重注册，且 session 上下文（`debugger_attached_tab_id` 等）为 SW 内存状态已丢失。
- content script：manifest 声明 `matches: <all_urls>`, `run_at: document_start`；每次页面加载由浏览器注入。已打开的页面在 SW 重启时**不会**重新注入，已注入 hook 仍在页面内，content 的 `is_capturing` 是页面隔离世界内的模块变量，不因 SW 重启变化——但 SW 侧 `is_capturing=false`，content 上报事件被 `handle_event` 丢弃。
- flush 语义核对（t038）：`storage.ts` 每次 `write_events` 立即 `flush_store`（事务提交后才累计字节），SW 死亡时 `buffers` 随实例销毁，已提交数据在 IndexedDB 中不丢。

## 证据

- MV3 生命周期（Chrome docs）：SW 空闲 30s 或浏览器退出后销毁，模块顶层 listener 随重执行重注册，函数内注册的 listener 不恢复；`chrome.debugger` 为 tab 级句柄，扩展 reload 才释放，但事件订阅为 SW 进程态。
- `network_capture.ts:89-235`：webRequest 5 listener 与 `dbg.onEvent` 均在 start 流程函数内注册。
- `service_worker.ts:996-1204`：tabs listener 在模块顶层。
- 决策 010 + t030 已确立「重启即终止」：cleanup_stale_capture_state 终态化旧采集并清持久化键。

## 结论

SW 重启后：webRequest / debugger producer 全部丢失需重注册，debugger 虽可重 attach 但需重建 session 上下文；content script 激活态不随 SW 恢复（SW 侧状态归零）。恢复生产者成本高（重注册 listener + 重 attach + 重发 start 通知 + 重建 body capture 通道），且事件流中断窗口无法无缝衔接。决策 010「重启即终止」合理。已落库数据由 t038 flush-on-write 保证在 IndexedDB 中，重启仅丢 SW 死亡瞬间 in-flight 的单批次事件（t038 已接受的口径）。

## 是否采纳

- 决定：是
- 理由：MV3 行为与代码核对一致，「重启即终止」语义成立；限额持久化（本 task AC-005~007）独立于终止语义，仍须落地——重启后新采集的限额检查不得依赖旧实例的内存字节数。
- 后续 task：t148
