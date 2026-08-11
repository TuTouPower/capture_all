# p029 cdp_handler 与 network_capture 重复实现合并

- 来源：t112 遗留（t112_code_f003，minor）
- 内容：`src/extension/background/cdp_handler.ts` 与 `network_capture.ts` 存在同因 CDP 事件处理复制实现（loadingFinished/loadingFailed/streaming/deferred/orphan 生命周期双点维护）。t112 已同步两处修复并各自补断言，但消除重复实现（统一到单一 handler）留作后续技术债。`cdp_handler.ts` 当前无生产调用方（仅测试直驱），合并时需先接线生产路径或显式废弃。同类观察亦见 p007 分析（复制实现漂移导致 T023 只修单点）。
- 处理：t119
