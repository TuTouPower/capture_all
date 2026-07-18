# Task plan — T003 bridge_relocate

## 步骤与验证

1. `git mv src/agent/bridge src/bridge` → 验证：`ls src/bridge/` 含 5 个 .ts
2. 改 `src/bridge/*` 内部 `../../shared/` → `../shared/`（若仅 protocol 一项，复用 T002 改法） → 验证：`grep -rn '\\.\\./\\.\\./shared' src/bridge/` 无输出
3. 改 `cdp_handler.ts:1` 注释 `agent/bridge` → `bridge`
4. 批量改 tests/* import 路径：`../src/agent/bridge/` → `../src/bridge/` → 验证：`grep -rn 'src/agent/bridge' tests/` 无输出
5. 改 `package.json`：`tsx src/agent/bridge/main.ts` → `tsx src/bridge/main.ts`；`esbuild src/agent/bridge/main.ts` → `esbuild src/bridge/main.ts`
6. 改 `tests/package_metadata.test.ts:75` 期望字符串同步
7. 改 `AGENTS.md`：`tsx src/agent/bridge/main.ts` → `tsx src/bridge/main.ts`
8. `npm test` → 验证：全绿
9. `npm run build` → 验证：bridge.mjs 正确生成

## 风险与回退

- 风险：bridge 内部除 protocol 外还有其他 `../../shared/` 引用未发现。
- 缓解：grep 全量扫 `src/bridge/`，发现一并改。
- 风险：`tests/package_metadata.test.ts` 断言字符串漏改。
- 缓解：跑该测试单独验证。
- 风险：bridge/mcp 间相互引用（如 mcp 调 bridge 客户端）。
- 缓解：grep 确认；mcp 引用 bridge 走 HTTP 不走源码 import（§4.1 已强制）。
- 回退：`git reset --hard` 后恢复 `src/agent/bridge/`。

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：Phase 3 全部完成后一次性更新目录结构（不在 T003 单独改）。
