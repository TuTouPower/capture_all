# Task plan — T004 mcp_relocate

## 步骤与验证

1. `git mv src/agent/mcp src/mcp` → 验证：`ls src/mcp/` 含 4 个 .ts
2. 改 `src/mcp/*` 内部 `../../shared/` → `../shared/`（client.ts、tools.ts）
3. 批量改 `tests/*.ts`：`src/agent/mcp/` → `src/mcp/`
4. 改 `package.json` `mcp` 与 `build:mcp` 脚本
5. 改 `tests/package_metadata.test.ts:80` 期望字符串同步
6. 改 `AGENTS.md` `npm run mcp` 描述
7. `rmdir src/agent`
8. `npm test` → 验证：全绿
9. `npm run build` → 验证：mcp.mjs 正确生成

## 风险与回退

- 风险：`src/agent/` 下还有未发现文件导致 rmdir 失败。
- 缓解：`ls src/agent/` 确认空再 rmdir。
- 风险：mcp 内部除 protocol 外有其他 `../../shared/` 引用。
- 缓解：grep 全量扫。
- 回退：`git reset --hard` 后恢复 `src/agent/mcp/`。

## Finalization 时更新的 blueprint

- 无（Phase 3 全部完成后统一更新 architecture.md）。
