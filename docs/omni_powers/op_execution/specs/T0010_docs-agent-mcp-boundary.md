---
status: approved
type: docs
eval: required
---
# 对齐 agent_mcp 蓝图与边界文档
## 一句话意图
在 T0004–T0009 行为落地后，把 `op_blueprint` 与用户文档改成与实现一致：三层职责、多浏览器编号、自动绑定、大导出自动落盘；删除「用户必须手抄 token 给扩展和 Claude」作为唯一主路径的过时描述。

## 不变量（INV）
- INV-1: blueprint 是实现真相源，不得与代码主路径长期矛盾
- INV-2: 不在文档示例中写入真实 secret
- INV-3: conventions 中「Zod 为 MCP 业务真相源」等过时句必须修正
- INV-4: 大结果 `/extension/result` 上限与自动落盘策略与代码一致（64MB / 1MB 内联阈值等以代码为准）

## 验收场景（验收标准 AC）
- AC-1: `docs/omni_powers/op_blueprint/specs/agent_mcp.md` 描述多实例、enroll、browser_no、mcp/instance token 分离
- AC-2: `docs/mcp_usage.md` 主路径为自动 bridge + 编号选择；手贴 token 降为兼容/高级
- AC-3: `domain.md` / `conventions.md` 中与旧单实例手抄 token、MCP 严 schema 冲突的句子已更新
- AC-4: 否证 grep: 文档主路径不再写「必须将同一 token 同时粘贴到扩展设置与 .mcp.json 才能用」作为唯一方式（兼容说明可保留但降级）

## 边界与反例
- 历史 archive 文档可不改
- op_record 只读不改

## 不做的事
- 不改运行时代码（除非发现文档无法对齐的笔误级常量）

## 技术决策
### 条件强制
依赖 T0006–T0009 完成后再合，避免文档超前假实现。

### 实现锚点
- `op_blueprint/specs/agent_mcp.md`
- `op_blueprint/domain.md` 错误码表补 `TARGET_REQUIRED` / `PAIRING_REQUIRED`
- `op_blueprint/conventions.md` §6 Zod 表述
- `docs/mcp_usage.md` / `op_readme.md`

### 可测性契约
- 通道: 文档审查 + grep 否证
- 无行为 E2E

## 待澄清 [NEEDS CLARIFICATION]
无
