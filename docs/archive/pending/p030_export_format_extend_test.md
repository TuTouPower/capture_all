# p030 export 非 archive 格式防重入测试扩展

- 来源：t120 遗留（t120_test_f004，minor）
- 内容：export_busy_guard 测试仅覆盖 `archive` 格式导出；`html`/`har`/`jsonl`/`json` 分支（chrome.runtime.sendMessage export action）未测防重入。guard 位于 format 分支之前、与格式无关，扩展为可选。
- 处理：t120,t121
