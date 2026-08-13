# p038 handle_cdp_body_event .catch 位点测试

- 来源：t150 遗留（AC-007 f001 残余）
- 内容：`handle_cdp_body_event`（service_worker.ts）的 fire-and-forget `.catch` 无直接测试。触发需模拟 CDP body 事件流（set_cdp_body_event_handler 注册的 handler + network_capture 事件），单测成本高。AC-007 另两处位点（app_log_storage schedule_flush、service_worker tabs.get）已有测试。登记留待 CDP 集成测试或网络事件测试补。
- 处理：t199
