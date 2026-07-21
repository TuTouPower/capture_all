# Adoption T091

逐条处置 `review_code.md` 和 `review_test.md` 的 finding。流程见 CLAUDE.md step 7。

| finding_id | decision | rationale | status |
|------------|----------|-----------|--------|
| T091_code_f001 | 采纳 | T047 清空 label 语义被 T091 覆盖，应有显式回归测试覆盖新行为 | 已修 |
| T091_code_f002 | 不采纳 | heartbeat provided_label 规范化是为将来支持「显式清空回退到默认编号」预留，非冗余 | 无需修改 |
| T091_code_f003 | 不采纳 | enroll 时 filter 当前 instance_id 防御扩展同 instance_id 重启路径（罕见但无害），保留 | 无需修改 |
| T091_code_f004 | 采纳 | `label.ts:88` 残留 `&& false` 死代码，删除 | 已修 |
| T091_code_f005 | 不采纳 | origin 头本机伪造属 loopback 既定安全边界；instance_token 仅数据端点权限，pairing 保留为跨机可选增强 | 无需修改 |
| T091_code_f006 | 不采纳 | reviewer 已确认代码/测试/文档一致 | 无需修改 |
| T091_code_f007 | 不采纳 | MCP 报错细分属排障体验改进，文档已说明持久化路径与权限要求；非阻塞 | 遗留 |
| T091_code_f008 | 不采纳 | reviewer 已复核千位段递归正确 | 无需修改 |
| T091_test_f001 | 采纳 | 扩展端 client 无 token enroll 路径零覆盖，是 T091 核心改动的测试缺口 | 已修 |
| T091_test_f002 | 采纳 | 与 code_f001 同源 —— heartbeat 显式 null label 新语义应有回归测试 | 已修 |
| T091_test_f003 | 采纳 | 自定义 label 形如「一」与自动编号同名的边界行为应有显式断言 | 已修 |
| T091_test_f004 | 不采纳 | 并发 enroll 安全由 Node 单线程保证，reviewer 也认为代码层面安全 | 无需修改 |
| T091_test_f005 | 不采纳 | resolve_client_token env trim 已安全；空白文件路径属边界护栏，非必需 | 遗留 |
| T091_test_f006 | 不采纳 | 非缺陷（reviewer 表扬） | 无需修改 |

## Round 1 (2026-07-22 05:40 UTC+8)

采纳 5 条（code_f001 / code_f004 / test_f001 / test_f002 / test_f003），全部当场修复：
- 删除 `src/bridge/label.ts:88` `&& false` 死代码（code_f004）。
- 新增 `tests/unit/agent_bridge_client.test.ts` 用例：扩展 `agent_bridge_token: ''` 时走无 Authorization header enroll，Bridge 200 OK 返回 instance_token（test_f001）。
- 新增 `tests/unit/agent_bridge_server.test.ts` 用例：enroll 拿到自动编号「一」后，heartbeat 显式传 `browser_label: null`，Bridge 保留「一」（code_f001 / test_f002）。
- 新增 `tests/unit/agent_bridge_server.test.ts` 用例：自定义 label 设为「一」后，后续空 label enroll 分配「二」（test_f003）。

遗留 2 条（code_f007 / test_f005），均属排障体验改进，不影响 T091 验收；记入 task_report。

### 补丁：normalize_agent_bridge_config enabled 强制禁用（test_f001 实施时发现）

实施 test_f001（扩展无 token enroll）时发现 `src/shared/agent_bridge_config.ts:26` 旧逻辑 `agent_bridge_enabled: config.agent_bridge_enabled && token.length > 0` 在 token 空时强制把 enabled 置 false，导致 poll_cycle 第 4 步直接 stop_bridge_client 返回，enroll 根本没机会跑。这是 T091 核心改动的隐藏依赖，review 未发现（reviewer 未追踪 normalize 调用链）。

修法：normalize 改为 `agent_bridge_enabled: config.agent_bridge_enabled`，不再因 token 空强制禁用。同时把 `tests/unit/agent_bridge_config_ui.test.ts:24` 旧测「disables bridge when token is empty」改为「T091: keeps bridge enabled when token is empty (zero-config auto-enroll)」。

无新 review，改动局部、单向、有回归测试覆盖。
