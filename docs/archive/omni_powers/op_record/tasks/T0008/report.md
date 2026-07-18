# T0008 SessionStart 自动拉起 Bridge 并注入 mcp 通道 token

- TID: T0008
- 状态: DONE
- 日期: 2026-07-16

---

## 总报告

| 项目 | 结果 |
|------|------|
| 测试 | 1056 passed / 0 failed / 89 files |
| lint | 未要求运行 |
| 不变量 | INV-1..INV-5 全部满足 |
| 验收 | AC-1..AC-4 测试覆盖 |
| 否证 | `.mcp.json.example` 不含真实 token；`docs/mcp_usage.md` 主路径不再要求手抄 token |

---

## 改动摘要

### config.ts
- 新增 `generate_bridge_token()`: 生成 `mcp_` 前缀的随机 token（base64url，36 字符）
- 新增 `default_token_file_path()`: token 持久化路径（`CAPTURE_ALL_BRIDGE_TOKEN_FILE` > `$XDG_RUNTIME_DIR/capture-all/bridge_token` > `$PROJECT/.local/bridge_token`）
- 新增 `load_bridge_token_file()` / `persist_bridge_token()`: token 文件读写（0600）
- 新增 `resolve_bridge_token()`: 统一 token 解析（CLI > env > file > 自动生成+持久化）
- 新增 `is_bridge_healthy()`: Bridge 健康检查（GET /health）

### main.ts
- 启动前检查 Bridge 是否已运行（`is_bridge_healthy`），已运行则跳过
- 通过 `resolve_bridge_token` 自动解析/生成 token
- 自动生成 token 时输出持久化路径

### .mcp.json.example
- token 占位从 `<YOUR_BRIDGE_TOKEN>` 改为 `<AUTO_GENERATED_BY_BRIDGE>` 以强调自动生成

### docs/mcp_usage.md
- 步骤合并为 6 步：不再要求"将 token 替换为扩展设置中的 Bridge Token"
- 注明 Bridge 首次启动自动生成 token 并保存到 `.local/bridge_token`

### .gitignore
- 新增 `.local/` 忽略规则

### 测试
- `tests/agent_bridge_config.test.ts`: 新增 3 个 describe 共 16 个 it，覆盖 token 生成/路径/持久化/解析
- `tests/mcp_project_config.test.ts`: 更新已变更的 placeholder 断言

---

## Round 1

实现，TDD RED→GREEN 一次通过。未触发重试。
