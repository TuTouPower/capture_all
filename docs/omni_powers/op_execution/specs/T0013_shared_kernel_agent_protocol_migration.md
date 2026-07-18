---
status: approved
type: refactor
eval: required
---
# 纯迁移 shared_kernel 与 agent_protocol

## 一句话意图
把无产品语义纯工具和 Agent 契约机械迁入独立 package，不改变任何函数体、类型成员或运行行为。

## 不变量（INV）
- INV-1: 仅移动文件、增加 package 配置、更新 import。
- INV-2: hash、ID、escape 结果逐输入保持一致。
- INV-3: Agent command 名、结果字段、错误码、兼容 alias 保持一致。
- INV-4: 调用者只从 package 根 `index.ts` 导入，不允许深导入。

## 验收场景（AC）
- AC-1: Given 原有纯函数输入 When 从 `shared_kernel` 调用 Then 输出与 T0011 基线一致。
- AC-2: Given Extension、Bridge、MCP 编译 When 引用 Agent contract Then 全部从 `agent_protocol` 根导出解析。
- AC-3: Given 完整 build 与 MCP 映射测试 When 执行 Then command/tool 数量和名称不变。

## 边界与反例
- 不为未来需求添加 Result、logger 或额外泛化工具。
- 原文件删除后不得留下可编辑双真相源；必要兼容转导只能在本 task 内短暂存在并在 commit 前清除。

## 不做的事
- 不迁移 `types.ts`、redaction、export 或 logger。
- 不调整 protocol interface 形状。
- 不移动任何运行产品目录。

## 技术决策
### 条件强制（被 2+ task 依赖的决策）
- `shared_kernel <- capture_domain <- agent_protocol` 为后续唯一 package 依赖方向。
- package public interface 只由根 `index.ts` 暴露。

### 设计探索结论（命中方案先行信号时）
- 候选: 路径 alias / workspace package / 保留旧 shared。
- 推荐: workspace package —— 构建产品共享同一契约，避免 alias 只在编译器生效。
- 已知坑: esbuild/Vite 必须同时解析 workspace export。

### 实现锚点（坐标集中地）
- `src/shared/escape.ts`、`hash.ts`、`id.ts`
- `src/agent/shared/protocol.ts`
- `packages/shared_kernel/`、`packages/agent_protocol/`

### 可测性契约（必填，无 N/A 例外）
- 应用启动方式: `npm test && npm run build`
- AC-1 验收信号: 现有纯函数行为测试；通道: 直驱。
- AC-2 验收信号: workspace typecheck 与禁止深导入扫描；通道: CLI。
- AC-3 验收信号: MCP schema/mapping tests 与三产物 smoke；通道: 直驱 + CLI。
- 预期失败模式（建议每条 AC 1 条反例）:
  - AC-1 若实现被改写则向量测试失败。
  - AC-2 若残留旧 import 则扫描失败。
  - AC-3 若契约漂移则 mapping coverage 失败。

## 待澄清 [NEEDS CLARIFICATION]
无
