# T0010 完成报告

## 状态
完成。所有 AC 通过。

## 修改文件

| 文件 | 变更摘要 |
|------|----------|
| `docs/omni_powers/op_blueprint/specs/agent_mcp.md` | 新增 §2 多实例与自动登记（enroll、browser_no、/pair 授权、Token 分离、目标路由）；重编号后续章节（3-10）；更新用户流程为自动登记主路径 + 手动粘贴兼容方式 |
| `docs/mcp_usage.md` | 快速开始重写：browser_no 步骤在前，自动登记为主路径；安全段拆分 MCP Token 与 instance_token 说明，移除「必须使用同一 Token」 |
| `docs/omni_powers/op_blueprint/domain.md` | §8 Bridge 层错误码补 `TARGET_REQUIRED`、`TARGET_NOT_FOUND`、`PAIRING_REQUIRED` |
| `docs/omni_powers/op_blueprint/conventions.md` | 无变更（§6 Zod 表述已正确，无过时句） |
| `docs/omni_powers/op_readme.md` | 无变更（内容已适配，无过时描述） |

## AC 验收

- **AC-1** ✅ agent_mcp.md 新增 §2 完整描述多实例、enroll（§2.1）、browser_no 路由（§2.2）、MCP/instance token 分离（§2.3）、/pair 授权（§2.4）
- **AC-2** ✅ mcp_usage.md 快速开始主路径为 browser_no + 自动登记；手动粘贴 Token 降为安全段兼容说明
- **AC-3** ✅ domain.md 错误码已补 TARGET_REQUIRED / TARGET_NOT_FOUND / PAIRING_REQUIRED；conventions.md §6 无过时「Zod 为业务真相源」表述（当前为「Zod schema 用于 MCP 工具参数校验」）；agent_mcp.md 移除「替代 passthrough」实现细节
- **AC-4** ✅ grep 否证通过：`rg "必须.*粘贴.*token"` 在 op_readme.md 和 mcp_usage.md 中无匹配

## 未修改
- `src/`、`tests/`、`e2e/`：未触碰
- `op_record/`：未触碰
- 历史 archive 文档：未触碰
