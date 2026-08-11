# p026 MCP token 文件错误原因细分

- 来源：t091 遗留（task_report.md code_f007）
- 内容：`src/bridge/config.ts` 的 `load_bridge_token_file` 将文件不存在、权限修复失败、读取失败统一折叠为 `null`，`src/mcp/main.ts` 因而只能输出笼统报错。当前功能与安全语义正确，但用户需手工检查文件状态才能定位启动失败。核实于 2026-08-11：问题仍在，仅影响排障体验；可让 token 读取结果携带失败原因，并按原因细分 MCP 启动错误文案。
- 处理：未开
