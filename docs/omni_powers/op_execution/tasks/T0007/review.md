# T0007 Review (Round 1)

## 裁决一：规格合规
### 验收标准覆盖
- AC-1: ➕ — list_browsers 返回 browsers 数组，但测试不验证 browser_no/online/label/active_capture_id 四个字段
- AC-2: PASS — browser_no 透传至 bridge payload 验证
- AC-3: PASS — 未知字段 passthrough 不因 schema 失败
- AC-4: PASS — format z.string()，非法格式错误来自下游
- AC-5: PASS — grep instance_token 零结果

### 偏航检查
- 仅改 schemas.ts/tools.ts + tests，严格对应 spec
- get_status_schema 有 browser_no 但 execute_mcp_tool 未消费（静默丢弃）——设计模糊

### 不变量检查
- INV-1..INV-4: 守住
- INV-5: 无 MCP 层测试，仅信任透传机制

## 裁决二：测试可信
### 测试质量
- schema 45 cases + client 14 cases
- .passthrough() + z.string() 按 spec 决策
### 危险模式扫描: 无

## 问题清单
| 问题 | 暂存 | 说明 |
|---|---|---|
| AC-1 list_browsers 测试不验证返回字段 | 否 | 核心 AC 证据不足，须补断言 |
| get_status_schema browser_no 静默未用 | 否 | 要么实现过滤，要么移除参数 |

verdict: FAIL
