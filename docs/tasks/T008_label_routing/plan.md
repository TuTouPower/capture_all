# Task plan — T008 label_routing

## 步骤

按"协议 → 实现 → 测试"顺序，单 commit 完成所有代码改动（编译依赖要求一次性切）；文档独立 commit。

### Commit A：代码 + 测试

1. 协议层（4 文件）：`protocol.ts` / `types.ts` / `constants.ts` / `agent_bridge_config.ts`
2. Bridge（`server.ts`）：enroll/heartbeat/resolve_target/pair page
3. MCP（`schemas.ts` / `tools.ts`）
4. 扩展端（`agent_bridge_client.ts` / `service_worker.ts` / `dashboard_settings.ts` / `user_config.ts` 类型 / `i18n.ts`）
5. 测试更新：14 文件
6. `npx tsc --noEmit` → 无错
7. `npm test` → 全绿
8. `npm run build` → 全绿
9. commit `refactor: replace browser_no with browser_label + instance_id routing`

### Commit B：文档

- `docs/blueprint/domain.md`：术语更新
- `docs/blueprint/decisions.md`：记 label 路由决策
- `docs/blueprint/architecture.md`：模块描述更新
- `docs/guides/mcp_usage.md`：工具参数更新
- `docs/guides/deployment.md`：多浏览器配置
- `README.md` / `README.en.md`：相关段落

### Commit C：finalize

- 归档 T008
- handoff 追加

## 风险与回退

- 风险：测试覆盖不全，多实例匿名场景漏检。
- 缓解：手动列测试矩阵（单实例 / 多实例有 label / 多实例部分匿名 / label 冲突）。
- 风险：pair page HTML 改动破坏 enroll 流程。
- 缓解：build 后人工或 e2e 验证 pair 流程。
- 回退：`git reset --hard` 恢复。
