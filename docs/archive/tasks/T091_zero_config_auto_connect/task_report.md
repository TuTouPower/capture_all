# Task report T091

本报告所在 commit 即 task commit，SHA 由 `git log --grep T091` 查，不在此记录。

## spec 验收标准勾选

- [x] 扩展无 `agent_bridge_token` 配置时，loopback 内启动 Bridge 后扩展自动 enroll 成功 → 验证：`tests/unit/agent_bridge_client.test.ts` T091 用例 + `tests/unit/agent_bridge_server.test.ts` T091 origin 直通用例 → 预期达成
- [x] 三个扩展首次 enroll（均不传 label）依次得到 `一` / `二` / `三` → 验证：`tests/unit/agent_bridge_server.test.ts`「subsequent empty-label enrolls get 二 / 三 in order」+ `tests/unit/bridge_label.test.ts` → 预期达成
- [x] 扩展上报自定义 label 时 Bridge 用自定义值，不参与自动编号 → 验证：`tests/unit/agent_bridge_server.test.ts`「custom label does not advance auto numeral」+「custom label shaped as numeral 一 occupies the slot」→ 预期达成
- [x] MCP `main.ts` 在 env 无 token 时从文件读取 → 验证：`tests/unit/mcp_token_fallback.test.ts` 6 用例 → 预期达成
- [x] `.mcp.json` 不再出现明文 token → 验证：`grep CAPTURE_ALL_BRIDGE_TOKEN .mcp.json`（gitignored）；`.mcp.json.example` 已去字段，`tests/unit/mcp_project_config.test.ts` 断言 undefined → 预期达成
- [x] 全量测试通过 → 验证：`npm test && npx tsc --noEmit` → 104 文件 / 1163 用例全绿，0 tsc 错误

## adoption 处置摘要

- 已修 5 项 / 遗留 2 项 / 无需修改 9 项
- code_f001 — 采纳：T047 清空 label 语义被覆盖，补 heartbeat null label 回归测试
- code_f004 — 采纳：删除 `label.ts:88` `&& false` 死代码
- test_f001 — 采纳：补扩展 client 无 token enroll 路径测试；实施时发现并修复 `normalize_agent_bridge_config` 隐藏依赖
- test_f002 — 采纳：与 code_f001 同源，同测试覆盖
- test_f003 — 采纳：补自定义 label 形如「一」与自动编号边界测试
- code_f007 — 遗留：MCP token 报错未细分「文件不存在」与「权限被拒」，排障体验改进
- test_f005 — 遗留：resolve_client_token 空白文件路径护栏，边界改进
- code_f002 / f003 / f005 / f006 / f008 / test_f004 / f006 — 无需修改（冗余无害 / loopback 既定边界 / reviewer 已确认 / 非缺陷）

## 遗留问题

- code_f007：MCP `main.ts` 启动失败时未区分「token 文件不存在」与「权限被拒（非 0600）」两种情况，排障需用户手动 `ls -la $XDG_RUNTIME_DIR/capture-all/bridge_token`。文档 `troubleshooting.md` 已提示路径与权限要求。影响：轻微，下个 task 可加细分错误码。
- test_f005：`resolve_client_token` 未对空白内容文件做显式护栏（依赖 `load_bridge_token_file` 内部 trim）。当前实现安全，仅缺测试覆盖。
- `scan:tracked-tree` 在 README/docs 几处报 `credential-assignment` 误报（文档讨论 `CAPTURE_ALL_BRIDGE_TOKEN=...` 环境变量名 + `openssl rand -hex 32` 生成示例），属 T085 已知启发式误报模式，非真 secret 入库。
