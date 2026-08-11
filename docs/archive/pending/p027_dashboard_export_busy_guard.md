# p027 dashboard 导出防重复触发

- 来源：t040 后续项（spec.md 决策段）
- 内容：`src/extension/dashboard/dashboard_shared.ts` 的 `export_capture` 与各导出接线点没有 in-flight/busy 保护，快速重复触发会并行执行 flush、构建与下载，造成重复下载及大 capture 双倍内存峰值。核实于 2026-08-11：问题仍在，但仅属低优先级体验改进；可用共享 in-flight 标记或按钮 disabled 防止重入。
- 处理：t120
