---
status: approved
type: refactor
eval: required
---
# 深化 MCP tool registry 与 executor

## 一句话意图
把 MCP Bridge client、工具描述、schema 与执行映射收进深 modules，并让 main 只负责配置、组装、注册和 stdio connect。

## 不变量（INV）
- INV-1: 工具数量、名称、兼容 aliases、schema 与 command mapping 不变。
- INV-2: 不新增、删除或重命名工具。
- INV-3: stdio transport、Bridge HTTP route、browser target 透传语义不变。
- INV-4: 所有 executor command 必须属于 `agent_protocol`。

## 验收场景（AC）
- AC-1: Given工具描述源 When 注册 Then每个工具均有 schema 与 executor，兼容 alias 映射到正确 command。
- AC-2: Given合法/非法输入 When executor 运行 Then校验、Bridge 请求、错误与大结果处理符合基线。
- AC-3: Given protocol/tool/schema 变更 When 一致性测试执行 Then任何遗漏映射立即失败。
- AC-4: Given `main.ts` 扫描 When 完成 Then仅含配置、module 组装、工具注册与 stdio connect。

## 边界与反例
- 单一描述源可为数据表或生成器；若引入生成复杂度大于消除重复，使用双向一致性测试。
- 不把每个工具拆成一个仅转发文件。

## 不做的事
- 不改 Bridge route/auth。
- 不新增 MCP resource/prompt。
- 不删除历史别名。

## 技术决策
### 条件强制（被 2+ task 依赖的决策）
- ToolRegistry interface 隐藏 SDK 注册细节；ToolExecutor 隐藏 command mapping、timeout 与文件结果处理。

### 设计探索结论（命中方案先行信号时）
- 候选: 强制代码生成 / 声明表 / 保留分散文件加一致性测试。
- 推荐: 小型声明表优先；若 Zod 类型约束受损则保留模块并加穷举一致性测试。
- 已知坑: aliases 不应重复实现 schema/executor 逻辑。

### 实现锚点（坐标集中地）
- `apps/mcp/bridge_client/`、`tool_registry/`、`tool_executor/`、`schemas/`
- `apps/mcp/main.ts`、旧 client/schemas/tools
- `packages/agent_protocol/`

### 可测性契约（必填，无 N/A 例外）
- 应用启动方式: `npm test && npm run build:mcp`
- AC-1 验收信号: registered tools snapshot + mapping table；通道: 直驱。
- AC-2 验收信号: schema/executor fixtures；通道: 直驱。
- AC-3 验收信号: exhaustive protocol consistency test；通道: 直驱。
- AC-4 验收信号: entry responsibility scan + stdio smoke；通道: CLI。
- 预期失败模式（建议每条 AC 1 条反例）:
  - AC-1 若工具无 executor/schema 则 coverage 失败。
  - AC-2 若 alias 行为漂移则 fixture 失败。
  - AC-3 若新增 command 未映射则 exhaustive check 失败。
  - AC-4 若 main 含 tool switch 则扫描失败。

## 待澄清 [NEEDS CLARIFICATION]
无
