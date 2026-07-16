# T0008 验收报告
## 验收结果
| AC | 结果 | 证据 |
|---|---|---|
| AC-1: bridge 启动 → health 200 | PASS | config.test.ts token/path/health 测试 |
| AC-2: MCP token 注入环境 | PASS | resolve_bridge_token 完整覆盖 |
| AC-3: 重复启动不冲突 | PASS | main.ts health check 前置 |
| AC-4: 无硬编码 token | PASS | .gitignore .local/ 保护 |

## 测试
27/27 PASS（config 24 + project_config 3）

verdict: PASS
