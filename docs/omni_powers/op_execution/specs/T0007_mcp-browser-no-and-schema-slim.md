---
status: approved
type: feat
eval: required
---
# MCP list_browsers + browser_no 路由透传 + schema 瘦身
## 一句话意图
MCP 保持瘦接口：新增按浏览器编号发现/指定目标的能力，工具参数改为宽松透传，业务校验不在 MCP 层做真相源；用户/模型只说编号即可路由。

## 不变量（INV）
- INV-1: MCP **不存储** instance_token / 各浏览器密钥
- INV-2: MCP 只持有 Bridge URL + mcp 通道 token（环境变量注入）
- INV-3: 业务非法参数（错误 format 等）错误来自 Extension/Bridge 业务路径，而非 MCP Zod 过度拒绝可选透传字段
- INV-4: 所有写/读采集工具可选 `browser_no`（或等价 target），原样进入 bridge payload
- INV-5: 多实例 online 且缺 browser_no 时，Bridge 返回 `TARGET_REQUIRED`；MCP 原样呈现

## 验收场景（验收标准 AC）
- AC-1: Given 两实例 online（编号 1/2） When 调 `list_browsers` 或增强版 `get_status` Then 返回两者的 browser_no、online、label、active_capture_id
- AC-2: Given 工具调用带 `browser_no: 2` When 到达 Bridge Then payload 含 browser_no=2 并路由到编号 2 队列（可用 bridge 测试双端验证）
- AC-3: Given export 传入未知可选字段（未来字段） When MCP schema 解析 Then 不因「未声明字段」直接失败（passthrough）
- AC-4: Given 仅声明业务非法 format When 调用 export_capture Then 失败码来自下游业务，不是 MCP 本地「schema 未收录 format」之外的误拒可选参数
- AC-5: 源码否证: MCP 模块无 instance_token 持久化逻辑

## 边界与反例
- `list_sessions` 等别名工具同步透传 browser_no
- timeout_ms 仍由 MCP 从 arguments 拆出传 bridge（信封字段）

## 不做的事
- 不在 MCP 内写文件/落盘
- 不实现 enroll
- 不把 capture_config 的细业务校验继续加重（应减负）

## 技术决策
### 条件强制
依赖 T0004 多实例 status；与 T0006 并行时可先用 bridge 单测模拟 browser_no。

### 设计探索结论
- schema 真相源下沉 extension；MCP schema 仅协议最小约束 + passthrough
- 工具命名 `list_browsers` 对用户心智优于只返回原始 instance_id

### 实现锚点
- `schemas.ts`: 放宽；export/get_all 等增加 `browser_no` optional + passthrough
- `tools.ts`: 注册 `list_browsers` → 对应 bridge 命令或 status 投影
- `protocol.ts`: 如需新 command type `browsers.list`
- 删除/避免 `.strict()` 导致可选扩展字段失败

### 可测性契约
- `tests/mcp_schema.test.ts` 改为宽松预期
- `tests/agent_mcp_client.test.ts` 透传 browser_no
- 否证: 不再要求「每新增可选业务字段必须改 MCP Zod 否则调用失败」

## 待澄清 [NEEDS CLARIFICATION]
- 工具名用 `list_browsers` 还是只扩展 `get_status`：草案 **两者都要**（list 专责，status 含摘要）。
