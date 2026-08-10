# Task plan

## 步骤与验证

1. 读 `src/bridge/server.ts` 完整 enroll handler / heartbeat handler / `is_allowed_extension_origin`，确认 origin 校验入口 → 验证：阅读代码。
2. 新建 `src/bridge/label.ts`：`to_chinese_numeral(n)` + `next_default_label(existing_labels)`；纯函数单测 → 验证：`npm test -- label`。
3. 改 `src/bridge/server.ts` enroll handler：
   - 去掉 `if (!has_mcp && !is_s0)` pairing 硬门槛块；保留 mcp / origin 认证二选一。
   - label 为空时调 `next_default_label` 分配默认 label；冲突顶替逻辑保留。
   - 响应回传分配后 label（含自动编号值）。
   → 验证：扩展 origin 无 token enroll 单测通过。
4. 改 `src/extension/background/agent_bridge_client.ts` `resolve_token`：token 空时调无 Authorization enroll；enroll 函数支持空 token → 验证：单测 mock fetch。
5. 改 `src/mcp/main.ts`：env 缺失时 `load_bridge_token_file(default_token_file_path())` 回退；都没有则抛错。复用 `src/bridge/config.ts` 导出 → 验证：单测覆盖两种路径。
6. 改 `.mcp.json`：去掉 env.CAPTURE_ALL_BRIDGE_TOKEN 硬编码值，保留 `CAPTURE_ALL_BRIDGE_URL` → 验证：grep 无明文。
7. 文档批量更新（README、guides、blueprint、SECURITY） → 验证：通读。
8. 黑盒验证：`npm test && npx tsc --noEmit`；必要时 `npm run build` → 验证：0 fail。
9. review（两个 sub agent 并行）→ adoption → task_report → 归档 → commit。

## 风险与回退

- 风险：自动编号与自定义 label 冲突顶替逻辑互相影响（如用户自定义「二」时，新空 label 自动分配又拿到「二」）。
  - 缓解：`next_default_label` 只考虑「中文数字格式且未被占用」的序号，跳过自定义 label。
- 风险：MCP token 文件路径在不同启动方式下不一致（`XDG_RUNTIME_DIR` vs `.local/`）。
  - 缓解：复用 `default_token_file_path()`，与 Bridge 写入端同源。
- 风险：去掉 pairing 硬门槛后，本机非扩展 origin 伪造 enroll。 
  - 缓解：保留 `is_allowed_extension_origin` Origin 校验；非允许 origin 仍 401。
- 回退：如 review 发现安全 / 兼容问题，恢复 pairing 硬门槛 + 用户手填 token 路径；改动集中在 server.ts / agent_bridge_client.ts / mcp/main.ts / .mcp.json，可局部回滚。

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：enroll 流程从「pairing 强制」改为「loopback origin 直通 + 可选 pairing」；新增自动编号描述。
- `docs/blueprint/domain.md`：补「默认 label / 自动编号」术语。
- `docs/blueprint/decisions.md`：新增决策「loopback + origin 直通 / 自动中文编号 / 文件回读 MCP token」。
