# d005 SW 重启后 producer 不自动恢复，「重启即终止」语义成立

- 来源：s004 spike / t148 task
- 结论：SW 重启后 chrome.webRequest（5 listener）与 chrome.debugger onEvent 均在采集启动流程内注册，随 SW 销毁丢失需重注册；content script 为 document_start 声明式注入，已打开页面不重新注入、SW 侧状态归零。恢复生产者成本高，「重启即终止」合理。已落库数据由 t038 flush-on-write 保证，重启仅丢 in-flight 单批次事件。
- 证据：`network_capture.ts:89-235`（webRequest + dbg.onEvent 在 start 函数内注册）；`service_worker.ts:996-1204`（tabs listener 模块顶层）；MV3 SW 生命周期文档。详见 `docs/spikes/s004_sw_restart_terminate_semantics/report.md`。
- 影响：SW 重启后的捕获处理路径沿用决策 010 终止语义（cleanup_stale_capture_state 终态化 + 清键），不实现重启恢复；后续涉及 SW 生命周期或 producer 注册时机时复用。
- 现状：有效
