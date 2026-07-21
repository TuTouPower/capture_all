# Task review T091

- task：`T091_zero_config_auto_connect`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree）
- reviewer_focus：测试
- reviewed_at：2026-07-22 16:50 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。

## Findings

### T091_test_f001 — 扩展端 client 无 token enroll 路径零覆盖

- 严重度：HIGH
- 位置：`tests/unit/agent_bridge_client.test.ts`（全文件，未新增任何 T091 用例）
- 问题：T091 改动的核心交付之一是 `src/extension/background/agent_bridge_client.ts` 中 `resolve_token` / `handle_401` / `enroll` 三处：无 `agent_bridge_token` 时也尝试 enroll，且 `enroll` 在无 token 时省略 `Authorization` header。但该文件的 21 个用例里，唯一含 `agent_bridge_token: ''` 的配置是 `disabled_config`（`agent_bridge_enabled: false`），根本不会进入 enroll 路径。没有任何用例验证：
  - enabled + 空 token 时 `resolve_token` 会调用 `enroll` 而非直接 `return null`
  - `enroll` 在 `bridge_token === ''` 时 fetch 调用的 headers 里**不含** `Authorization`（diff 中 `bridge_token || undefined` 分支）
  - 401 重试路径 `handle_401` 在空 token 时不再 early-return（diff 删了 `if (config.agent_bridge_token.length < 1) return;`）
  - 回归：有 token 路径仍带 `Authorization` header 未被破坏
- 建议：至少补 3 个用例：(1) 空 token + enabled 调用 `enroll` 成功保存 session；(2) 断言空 token 时 fetch 的 init.headers 不含 `Authorization`（用 `vi.spyOn(global, 'fetch')` 检查 calls[0][1].headers）；(3) 有 token 时 headers 含 `Authorization: Bearer <token>` 作回归护栏。

### T091_test_f002 — 心跳「显式清空 label」新语义无测试

- 严重度：MEDIUM
- 位置：`tests/unit/agent_bridge_server.test.ts:1797`（仅覆盖「不传 browser_label 字段」一种路径）
- 问题：spec 验收点「心跳同步 label 时为空不再覆盖已有 label（保留 T047 不变量）」的代码改动（`src/bridge/server.ts:378`）实际改变了 T047 的两种语义：
  - 心跳**不传** `browser_label` 字段 → 保留 prev label（测试 `T091: heartbeat with empty browser_label keeps bridge-assigned default label` 覆盖，OK）
  - 心跳**显式传** `browser_label: null` 或 `''` → 按 diff 代码 `provided_label = null`，new_label 回退到 `prev?.browser_label ?? next_default_label`，即**保留旧 label 不清空**（覆盖了 T047「显式清空」语义）
  第二种路径无任何测试。且 server.ts:378 注释「清空 = 回到默认编号」与代码行为（保留 prev）不一致，测试缺失放大了这一语义漂移风险。
- 建议：补一个用例：扩展先以自定义 label `工作机` enroll，再发心跳 `browser_label: null`，断言 `mcp/status` 中该实例 label 仍为 `工作机`（或与产品方确认应为重新编号后再断言）。

### T091_test_f003 — 「自定义 label 与自动编号同名」场景未覆盖

- 严重度：MEDIUM
- 位置：`tests/unit/agent_bridge_server.test.ts:1778`（`T091: custom label does not advance auto numeral`）
- 问题：该用例验证自定义 label `工作机` 先入、再空 label 得 `一`。但未覆盖更刁钻的边界：用户把自定义 label 设成 `一`（与自动编号格式同名）后再空 label enroll。此时 `parse_chinese_numeral('一')` 返回 1，`next_default_label` 会把它计入 max，下一空 label 应得 `二`。这是 spec 验收点「自定义 label 不参与自动编号推进」的反例 —— 当自定义 label 形如中文数字时，代码无法区分「自动分配的」和「用户自定义的」，会被当作占位推进序号。单元测试 `next_default_label(['一'])` 仅断言常规路径（`bridge_label.test.ts:78`），未提示此歧义。
- 建议：补一个用例显式记录该已知行为：`next_default_label(['一'])` 期望 `二`（因为无法区分），并在测试注释中标记此为已知限制；或在 server 层用 metadata 区分自动/自定义 label 后再测。

### T091_test_f004 — 并发 enroll 不冲突：测试未覆盖，但代码层面安全

- 严重度：LOW
- 位置：`tests/unit/agent_bridge_server.test.ts:1755`（`subsequent empty-label enrolls get 二 / 三 in order`）
- 问题：该用例用顺序 await fetch 验证编号递增。review 提示关注「两个并发 enroll 不冲突」—— 实际上 `src/bridge/server.ts:283-321` 中 `randomBytes` 同步、label 计算→`instances.set` 全同步无 await，Node 单线程事件循环保证两个 enroll handler 不会交错执行，并发安全由运行时模型保证。单测难复现真并发竞争，此 finding 仅作记录，**不要求补测试**。
- 建议：无需补测试。若担心未来引入 await 打破原子性，可考虑在 server 加一条注释标注「label 计算到 set 必须同步」。

### T091_test_f005 — `resolve_client_token` 未覆盖文件空白内容 / 真实错误分支

- 严重度：LOW
- 位置：`tests/unit/mcp_token_fallback.test.ts:41-51`（仅测「文件不存在 → null」）
- 问题：`load_bridge_token_file` 的真实失败模式除「文件不存在」外，还包括权限拒绝（mode 非 0600 被拒）、文件内容为纯空白。已核查 `src/bridge/config.ts:96` 实现 `content.trim() || null`，空白文件会正确返回 null，**无潜在 bug**。但测试未直接覆盖这一路径，若未来有人改 `load_bridge_token_file` 去掉 trim，`mcp_token_fallback.test.ts` 不会失败（因为该文件测的是 `resolve_client_token`，间接依赖 trim 行为）。属于测试护栏缺失，非功能缺陷。
- 建议：可选补一条空白文件用例：`writeFile(file, '   \n  ')` → `resolve_client_token(undefined, file)` 期望 `null`。优先级低。

### T091_test_f006 — 纯单元测试设计优点（非缺陷，供记录）

- 严重度：LOW
- 位置：`tests/unit/bridge_label.test.ts`、`tests/unit/mcp_token_fallback.test.ts`
- 问题：两个新文件均采用「抽离纯函数 / 独立模块」策略（`label.ts`、`token_resolver.ts`），避免了直接测 `server.ts` / `main.ts` 的启动副作用，测试快且确定性好。`bridge_label.test.ts` 的 `round-trips 1..99` 用循环穷举，`parse_chinese_numeral` 的非法输入用例（`'一二三'` / `'Chrome 127'`）真实验证了 parser 的拒绝分支，非源串断言。这是良好实践，**不需修改**。
- 建议：无需修改。

## 结论

测试覆盖整体方向正确，但存在一处 HIGH 级缺口（f001）：T091 在扩展端 client 的核心改动（无 token enroll、Authorization header 省略）完全无测试覆盖，仅由 server 端集成测试间接验证 HTTP 入口。一旦 client 侧逻辑回归（例如未来重加 `if (!token) return null`），测试套件不会失败。

spec 六条验收标准中：

- 验收 1（扩展无 token 自动 enroll 成功）：server 端覆盖充分（`agent_bridge_server.test.ts:1468, 1722`），client 端缺测试（f001）。
- 验收 2（三个扩展依次得 一/二/三）：覆盖（`agent_bridge_server.test.ts:1755`）。
- 验收 3（自定义 label 不参与编号）：基本覆盖（`1778`），但同名边界未测（f003）。
- 验收 4（MCP 文件回退）：覆盖充分（`mcp_token_fallback.test.ts`），实现已确认 trim 空白文件返回 null（f005 仅为测试护栏建议）。
- 验收 5（`.mcp.json` 无明文 token）：覆盖（`mcp_project_config.test.ts` 断言 `undefined`）。
- 验收 6（全量测试通过）：本评审执行 `npx vitest run` 相关 5 个文件，121 PASS / 0 FAIL。

T047 heartbeat 清空语义（f002）是测试缺失导致的语义漂移信号，建议至少补显式清空用例确认预期行为。f004 经核查代码层面安全，不阻塞合并。

**建议：合并前修复 f001（补 client 端测试）；f002 / f003 至少补用例标注已知行为；f005 为可选护栏。**
