# Task review t175（reviewer_focus: 代码）

- task：`t175_fix_timeout_ms_contract`
- spec：`docs/tasks/t175_fix_timeout_ms_contract/spec.md`
- diff_anchor：`b2e8a14495abd15835a10ac7b6917d63ac71ffe9`
- target：`git diff b2e8a14495abd15835a10ac7b6917d63ac71ffe9`
- round：1
- reviewed_at：2026-08-13 20:10 UTC+8

## Findings

### t175_code_f001 - AC-003 统一遗漏 start/stop：blueprint 15s 与 client/Bridge 120s 仍不一致

- 严重度：minor
- 锚点：AC-003「blueprint、指南、client、Bridge 中同一命令的默认超时值一致」
- 位置：`docs/blueprint/domain.md:138`（`| start / stop | 15 s |`）
- 问题：diff 只更新了查询类/全量类/导出类三行，`start / stop` 行保留 15s。但 client 侧 `send_command` 对非 full_data 命令缺省 `DEFAULT_COMMAND_TIMEOUT_MS = 120 * 1000`（`src/mcp/client.ts:13,30`），Bridge 侧 `queue.enqueue(body.timeout_ms || default_timeout)` 缺省 `command_timeout_ms`（`src/bridge/server.ts:567-570`，config 缺省 120000，`src/bridge/config.ts:37`），指南归入「其余普通命令默认 120s」（`docs/guides/mcp_usage.md:91`）。即 start/stop 实际默认 120s，blueprint 15s 无实现依据（server 无 start/stop 超时特例）。AC-003 声称统一四处的默认值，start/stop 一处仍未统一。
- 建议：确认无 15s 特例后，把 `domain.md:138` 改为 120s（归入普通命令类，注明 `command_timeout_ms` 缺省），或补一句说明；处置为改 blueprint，不需改实现（运行时行为 120s 稳定，与指南一致）。

### t175_code_f002 - client.ts 注释自相矛盾：旧注释仍称 get_status「固定 10s」

- 严重度：minor
- 锚点：代码质量/注释准确性（无 AC）
- 位置：`src/mcp/client.ts:7-8`
- 问题：第 7 行注释「B1-M3: bridge 挂起时 fetch 无限阻塞。get_status 固定 10s；send_command 取 timeout_ms+5s…」仍描述旧行为；同文件第 11-12 行 t175 注释已写「status 类默认对齐 domain 查询类 30s；显式 timeout_ms 优先」，两行注释互相矛盾。行为已改（30s + `timeout_ms ??` 可配置），注释未同步，误导读者。
- 建议：把第 7 行「get_status 固定 10s」改为「get_status 缺省 30s（可传 timeout_ms）」并去掉「固定」。

### t175_code_f003 - Bridge 校验处字面 300000 残留（注释 + 错误消息），未随常量替换

- 严重度：minor
- 锚点：DRY / 常量复用完整性（任务范围：MCP/Bridge 复用共享常量）
- 位置：`src/bridge/server.ts:987`（注释「上限（300000ms=5min）」）、`src/bridge/server.ts:989`（错误消息 `'Command timeout must be a positive integer <= 300000'`）
- 问题：校验逻辑已改为 `value.timeout_ms > MAX_COMMAND_TIMEOUT_MS`（server.ts:988），但紧邻的注释与错误消息仍硬编码 300000。当前值与常量一致（无行为缺陷），但若未来上限变更，错误消息会与校验脱节（用户收到错误码与消息描述的边界不符），注释同样过时。共享常量复用不彻底。
- 建议：错误消息用模板串入 `MAX_COMMAND_TIMEOUT_MS`（如 `<= ${MAX_COMMAND_TIMEOUT_MS}`），注释删字面值或引用常量名。

## 结论

- 前轮 finding 复核：Round 1，无
- 本轮新发现：3 条（f001 minor / f002 minor / f003 minor）
- 未进表的提示：
  - 文件过大：`src/bridge/server.ts` 1040 行（本 task 净增 1 行），仅结论段记录；未导致可观测缺陷，不出 finding。
  - 测试层观察（交 test reviewer）：`tests/unit/timeout_ms_contract.test.ts` AC-003 用 `readFileSync` 断言源码文本（`client.ts` 含 `'GET_STATUS_TIMEOUT_MS = 30 * 1000'`、`server.ts` 不含 `'> 300000)'`）——耦合实现字面，改常量写法/注释即误红；AC-002 各 case 以 `Object.defineProperty` 替换 `AbortSignal.timeout` 且仅成功路径恢复，断言失败时泄漏污染后续测试（AC-002a 的 `vi.spyOn(globalThis, 'AbortSignal')` 无实义）。均不影响当前断言有效性（timeout_fn 记录参数、fetch mock 保留被测参数传递逻辑）。
  - 字面 300000 其余残留（不属 f003 锚点或语义不同未替换）：`docs/blueprint/domain.md:124`（§6 存储限制表「命令 timeout 上限 300000 ms」，来源列未引常量名，与 §7 上限行风格不一）；`src/bridge/config.ts:38`（`full_data_timeout_ms ?? 300000` 是 bridge 配置默认值而非命令上限，语义不同，不强行替换，domain 表已注明 300s 出自 `full_data_timeout_ms` 缺省）。
  - 范围外观察：无偏航；diff 触及文件均属任务范围（src 4 文件、docs 2 文件、task.md front matter、测试 2 文件）。
- 总体判断：AC-001/002/004 完全达成，AC-003 主体达成（client 30/120/300s、Bridge 120/300s、domain 表、指南四处一致），仅 start/stop 一处文档未统一（f001 minor，处置为改 blueprint）；无未解决 critical / important，可 PASS。
- 系统性 follow-up：无

### AC 复验披露

- AC-001：`re_verified` — `tests/unit/timeout_ms_contract.test.ts:16-20` 断言 `MCP_TOOL_SCHEMAS.get_status/list_browsers.parse({timeout_ms:300001})` 抛错、`300000` 通过；`schemas.ts:5` `.max(MAX_COMMAND_TIMEOUT_MS)` 与 `server.ts:988` `> MAX_COMMAND_TIMEOUT_MS` 边界一致（300000 两边均过、300001 两边均拒）；`main.ts:34-39` 工具经 SDK `inputSchema` 校验后才进 `execute_mcp_tool`，超限值不达 Bridge。测试实跑通过。
- AC-002：`re_verified` — `timeout_ms_contract.test.ts:22-57` spy `AbortSignal.timeout` 断言收到 1（直接 `client.get_status(1)` 与经 `execute_mcp_tool` 的 get_status/list_browsers 三路径）；代码链 `tools.ts:36,41` → `client.ts:24`（`timeout_ms ?? 30s`）→ `fetch_with_timeout`（client.ts:65 `AbortSignal.timeout(timeout_ms)`）。测试实跑通过。
- AC-003：`re_verified`（主体）— client 缺省 30/120/300s（client.ts:12-14）、Bridge config 缺省 120/300s（config.ts:37-38）、domain 表（domain.md:134-139）、指南（mcp_usage.md:89-93）四处对同一命令一致；start/stop 例外见 f001（minor，处置为改 blueprint）。测试实跑通过。
- AC-004：`re_verified` — 新增 `tests/unit/timeout_ms_contract.test.ts`（78 行）覆盖 schema→tool→client 参数传递（AC-001/002/003 各 case 即为传递链验证），测试实跑通过。

coverage = 4 / 4

reviewed_scope: 94f5c09b3efb51cf

verdict: PASS
