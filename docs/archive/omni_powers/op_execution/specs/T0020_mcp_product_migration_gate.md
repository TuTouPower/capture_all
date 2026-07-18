---
status: approved
type: refactor
eval: required
---
# 纯迁移 MCP 产品并关闭迁移轨

## 一句话意图
把 MCP 现有文件整体迁入 `apps/mcp`，完成三运行产品纯迁移并以全量门证明轨 A 行为不变。

## 不变量（INV）
- INV-1: `main.ts`、client、schemas、tools 只移动，不拆 module。
- INV-2: 工具名称、数量、兼容 alias、schema、command mapping 与 stdio transport 不变。
- INV-3: `.mcp.json.example` 继续启动 `artifacts/mcp/mcp.mjs`。
- INV-4: T0011 基线差异仅允许声明过的源码入口路径和非语义 bundle hash 变化。

## 验收场景（AC）
- AC-1: Given MCP bundle When 以 stdio 启动 Then 初始化和全部工具注册成功。
- AC-2: Given 每个工具合法与非法输入 When 执行 Then schema、command mapping、错误行为与基线一致。
- AC-3: Given Extension、Bridge、MCP 三产品 When fresh install、test、build、全部 E2E 与 MCP 闭环 Then 全部通过且无新增 skip。
- AC-4: Given 活动构建入口扫描 When 执行 Then 不再从 `src/**` 构建任何运行产品。

## 边界与反例
- `src/**` 可在本 task 后短期保留兼容转导，但不得是 bundle entry；T0032 最终删除。
- 任一测试发现数下降或工具遗漏都阻止进入轨 B。

## 不做的事
- 不建立 ToolRegistry/Executor deep module。
- 不新增、删除或重命名 MCP 工具。
- 不重组测试目录。

## 技术决策
### 条件强制（被 2+ task 依赖的决策）
- T0020 是轨 A 总门；未通过不得开始 T0021 及后续 interface 改造。

### 设计探索结论（命中方案先行信号时）
- 候选: MCP 与 Bridge 同 task / 独立迁移。
- 推荐: 独立迁移 —— 可分别验证 Node bundle 与协议映射。
- 已知坑: MCP SDK bundle 较大，smoke 应验证启动和工具注册而非固定字节 hash。

### 实现锚点（坐标集中地）
- `src/agent/mcp/`
- `apps/mcp/`
- `package.json`、`tooling/build/`、`.mcp.json.example`
- 迁移轨扫描规则

### 可测性契约（必填，无 N/A 例外）
- 应用启动方式: `npm ci && npm test && npm run build && npm run test:e2e:all`
- AC-1 验收信号: stdio initialize/tools list；通道: 直驱。
- AC-2 验收信号: schema/mapping tests；通道: 直驱。
- AC-3 验收信号: 全矩阵 summary + MCP/Bridge roundtrip；通道: CLI + CDP + HTTP。
- AC-4 验收信号: active entry scan；通道: CLI。
- 预期失败模式（建议每条 AC 1 条反例）:
  - AC-1 若 entry 或 dependency 错误则进程启动失败。
  - AC-2 若 schema 漂移则合法/非法 fixture 结果变化。
  - AC-3 若 workspace 路径漏改则某产品或 E2E 失败。
  - AC-4 若旧 entry 残留则轨道门拒绝。

## 待澄清 [NEEDS CLARIFICATION]
无
