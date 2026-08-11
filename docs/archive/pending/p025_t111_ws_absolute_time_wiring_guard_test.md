# p025 t111 接线守卫无测试锁定

- 来源：t111 遗留（t111_test_f004，minor）
- 内容：`service_worker.ts` handle_network_request 的 absolute_time 接线守卫 `!(request.start_time_ms && request.start_time_ms > 0)`（websocket 保留绝对 epoch / cdp primary 填 absolute_time）无单元测试锁定（handle_network_request 未导出，数据经内部回调送达）。当前正确（AC-001b 保护 exporter 侧直接采用分支），但未来移除守卫会使 websocket 遮蔽回归且全部测试仍绿。建议导出直连断言或后续 task 处置。
- 处理：t116
