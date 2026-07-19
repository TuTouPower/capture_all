# Task spec — T008 label_routing

## 背景

取消 `browser_no`（数字编号）路由；改用 `browser_label`（人填备注，可选但多实例时条件强制 + 唯一性）+ `instance_id`（机器生成，AI 路由用）。

人看 label，AI 看 instance_id。token 仍是扩展↔Bridge 鉴权，不暴露给 AI。

## 决策（用户确认）

- **条件强制 label**：enroll 时可选；单实例零配置；多实例（≥2 在线）时若存在匿名实例，Bridge 在响应加 warning，AI 调用未 specify target 时返回 `TARGET_AMBIGUOUS`
- **label 唯一性**：enroll 时若 label 与已有在线实例冲突，返回 `LABEL_DUPLICATE`；同 label 顶替旧实例（与原 `browser_no` 顶替逻辑对齐）
- **MCP 路由参数**：移除 `browser_no`；加 `target_instance_id`（可选）与 `target_label`（可选）；二者都给时 `target_instance_id` 优先

## 范围

**代码**：
- `src/shared/protocol.ts`：`AgentExtensionStatus` 移除 `browser_no`；`AgentErrorCode` 加 `TARGET_AMBIGUOUS` / `LABEL_DUPLICATE`
- `src/shared/types.ts`：移除 `browser_no` 相关类型；保留/规范 `browser_label`
- `src/shared/constants.ts`：`DEFAULT_USER_CONFIG` 移除 `browser_no`，加 `browser_label: ''`
- `src/shared/agent_bridge_config.ts`：移除 `browser_no_valid`；`normalize` 改用 label；enabled 判断不依赖 browser_no
- `src/bridge/server.ts`：
  - `ExtensionInstance` 移除 `browser_no`
  - `validate_enroll` / `validate_heartbeat` 移除 browser_no 字段
  - enroll 顶替逻辑改为 label 唯一性（同 label 顶替）
  - `resolve_target` 移除 browser_no 分支；加 target_label 分支；多实例匿名时 `TARGET_AMBIGUOUS`
  - 移除 `/pair/approve` 端点（不再预 approve browser_no；pair 简化为 pairing_code 窗口模式）
  - `is_enroll_allowed` 不再用 allowlist
  - `build_status` 移除 browser_no；多实例匿名时返回 warning 字段
  - pair page HTML 简化（移除 Approve Browser UI）
- `src/mcp/schemas.ts`：移除 `browser_no_schema`；所有工具 schema 改用 `target_instance_id`（可选）+ `target_label`（可选）
- `src/mcp/tools.ts`：透传 target 参数（如有引用 browser_no）
- `src/extension/background/agent_bridge_client.ts`：enroll / heartbeat 传 `browser_label`，不传 `browser_no`
- `src/extension/background/service_worker.ts`：移除 browser_no 引用
- `src/extension/dashboard/dashboard_settings.ts`：UI 移除 `browser_no` 输入；加 `browser_label` 输入（text input，placeholder 提示）
- `src/extension/shared/i18n.ts`：相关文案 key 更新

**测试**：14 个测试文件更新（移除 browser_no 断言；新增 label 唯一性、TARGET_AMBIGUOUS、LABEL_DUPLICATE 用例）

## 非范围

- pair 机制完全重写（保留 pairing_code 窗口模式，仅移除 approve 端点）
- 现有 instance_id 路由逻辑（已支持，保留）
- session 术语迁移（已在历史 task 完成）

## 验收标准

- [ ] `grep -rn "browser_no" src/ tests/` 无残留（或仅注释/字符串说明）
- [ ] enroll 支持 label 字段；同 label 顶替
- [ ] label 唯一性冲突返回 `LABEL_DUPLICATE`
- [ ] 多实例匿名时 `TARGET_AMBIGUOUS`；多实例有 label 时按 label 路由
- [ ] 单实例默认路由
- [ ] MCP schemas 全部用 `target_instance_id` + `target_label`
- [ ] 扩展 UI 移除 browser_no 输入
- [ ] `npx tsc --noEmit` 无错
- [ ] `npm test` 全绿
- [ ] `npm run build` 全绿

## 依赖与约束

- T001-T007 已完成（仓库布局对齐 + 测试树重组）。
- 不变量：Bridge 仅绑 127.0.0.1；token 优先级不变；instance_token 不冒充 MCP。
