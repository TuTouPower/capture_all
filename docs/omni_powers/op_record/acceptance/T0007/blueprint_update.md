# T0007 Blueprint 更新提案
T0007 list_browsers + browser_no routing + schema passthrough。无暂存项，无红灯归因。

## agent_mcp.md
- §2 MCP 工具: 新增 `list_browsers` 工具
- §3 Bridge 协议: 所有工具新增可选 `browser_no` 参数
- §4 命令队列: browser_no 作为路由键
- §5 schema: 全工具 `.passthrough()`，不拒未知字段

## domain.md
- §2 MCP 工具: 新增 `list_browsers` → `get_status` 映射
- §6 不变量: browser_no 可选透传，TARGET_REQUIRED 来自 bridge

共 6 项变更，2 文件。
