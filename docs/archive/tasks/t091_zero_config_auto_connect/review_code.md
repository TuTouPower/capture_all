# Task review T091

- task：`T091_zero_config_auto_connect`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree）
- reviewer_focus：文档+代码
- reviewed_at：2026-07-22 05:40 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。

## Findings

### T091_code_f001 — T047「显式清空 label 为 null」语义被反转，无回归测试覆盖

- 严重度：medium
- 位置：`src/bridge/server.ts:373-382`；`src/extension/background/agent_bridge_client.ts:282`
- 问题：T047 heartbeat handler 原语义为「`body.browser_label !== undefined` 即显式同步，包括清空为 null」。T091 改为 `provided_label ?? prev?.browser_label ?? next_default_label(...)`，即扩展发 `browser_label: null` 时不再清成 null，而是保留 prev 或重新分配中文默认编号。
  扩展端 `send_heartbeat` 第 282 行恒发 `browser_label: browser_label ?? null`（始终非 undefined），所以用户在扩展设置里清空 label 时，Bridge 不再清空，而是保留旧 label 或分配默认编号。
  这与 T047 的用户可感知行为相反：T047 下清空 label → 实例变匿名（null）；T091 下清空 label → 实例保留编号或拿默认编号。
  spec 与 `docs/blueprint/decisions.md` 018 明确记录此覆盖，**属有意决策**，但 `tests/unit/agent_bridge_server.test.ts` 无任何用例覆盖「扩展显式发 `browser_label: null`」的预期行为（grep `browser_label: null` / `清空` 均 0 命中）。T047 commit `aaa19f1` 的原始清空语义也无对应测试被反转或新增，存在行为回归窗口。
- 建议：新增单测，断言 heartbeat body `{ browser_label: null }` 在 prev 有自定义 label 时回退到默认编号（或明确决定保留 prev 自定义值，目前代码是 `prev?.browser_label ?? next_default_label`，即 prev 非空时**保留 prev 自定义 label**，连默认编号都不重新分配——这点也需在测试里固化）。同时在 `docs/blueprint/domain.md` 把「清空 label 的可观察行为」写清。

### T091_code_f002 — heartbeat handler 中 `provided_label` 分支逻辑冗余，语义不直观

- 严重度：low
- 位置：`src/bridge/server.ts:375-378`
- 问题：
  ```ts
  const provided_label = body.browser_label !== undefined
      ? (body.browser_label && body.browser_label.length > 0 ? body.browser_label : null)
      : null;
  ```
  扩展端恒发 `browser_label ?? null`，`body.browser_label !== undefined` 恒为 true，三元外层分支永远不进 `: null`。即 `provided_label` 实际只可能是「非空字符串」或「null」，从不为「undefined 对应的 null」。外层 `!== undefined` 判断对当前扩展客户端无意义，读代码时易误以为「未传字段」与「传 null」有区别。
  与 enroll handler 第 289 行 `body.browser_label && body.browser_label.length > 0 ? ... : null`（不判 undefined）也不一致。
- 建议：统一 enroll 与 heartbeat 的 label 规范化为一行（或抽辅助函数），移除冗余的 `!== undefined` 判断；若要保留「未传字段 = 不动，传 null = 显式清空」的语义区分，需先在 f001 决定清楚预期行为。

### T091_code_f003 — `next_default_label` 在 enroll 路径下 filter 当前 instance 多余

- 严重度：low（正确性无问题，仅冗余）
- 位置：`src/bridge/server.ts:290-294`
- 问题：enroll handler 在 `instances.set(instance_id, ...)` **之前**调用 `next_default_label`，此时 `instances.values()` 还不含当前 instance（除非同 instance_id 重 enroll，但此时旧记录 label 会被算入再被覆盖，也合理）。`.filter((inst) => inst.instance_id !== instance_id)` 在首次 enroll 路径下不会滤掉任何记录。heartbeat 路径（第 378-382 行） prev 还在 instances 里，filter 必要。
  两处代码形态一致但语义微妙不同，读代码需停顿判断。
- 建议：保留即可（防御性写法，重 enroll 场景下确实需要 filter），或在 enroll 处加一行注释说明 filter 是为重 enroll 场景。

### T091_code_f004 — `parse_chinese_numeral` 中残留 `&& false` 死代码

- 严重度：low
- 位置：`src/bridge/label.ts:88`
- 问题：第 88 行 `if (ch !== '十' || last_was_unit || !has_content && false)` 中 `!has_content && false` 恒为 false，是开发期遗留死代码。虽然外层 if 紧跟 `if (ch !== '十' || last_was_unit) return null;` 实际承担判断，但 `&& false` 让读者困惑。
- 建议：删除 `|| !has_content && false`，直接写 `if (ch !== '十' || last_was_unit)`（与第 90 行一致）。

### T091_code_f005 — origin 头可被本机任意进程伪造，T091 移除 pairing 门槛后 enroll 暴露面扩大

- 严重度：low（loopback-only 模型下可接受，但值得记录）
- 位置：`src/bridge/server.ts:175, 258, 553-555`
- 问题：`is_allowed_extension_origin` 仅校验 `Origin` 头格式 `^chrome-extension:\/\/[a-p]{32}$`，而 `Origin` 头可被本机任何 HTTP 客户端伪造（`curl -H "Origin: chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"`）。T091 前扩展 origin 还要过 pairing，本机恶意进程拿不到 instance_token；T091 后直通，本机任何进程都能 enroll 拿到 instance_token。
  spec 第 65 行明确接受此权衡（「防止本机恶意页面伪造 enroll」——页面无法伪造 chrome-extension origin，但进程级攻击不在防御范围），`docs/blueprint/decisions.md` 018 也说明仅防「本机非扩展页面伪造」。结论与 loopback-only 安全模型一致：本机不可信则整条链路都不可信。
  instance_token 仅能访问扩展数据端点，不能访问 MCP/CDP（硬约束保留，`src/bridge/server.ts:257-264` 的 `has_mcp` 判断与 MCP 路由 `is_authorized` 独立），所以暴露面扩大但权限边界不变。
- 建议：无需代码修改。在 `docs/guides/deployment.md` 安全加固章节补一句「loopback 模型假设本机可信；本机不可信场景请用 pairing code 强制」。

### T091_code_f006 — `.mcp.json.example` 删除 token 字段后，依赖该字段的代码/文档路径已对齐

- 严重度：low（确认无回归）
- 位置：`.mcp.json.example`；`tests/unit/mcp_project_config.test.ts:67`；`src/mcp/main.ts:4-18`
- 问题：复核 spec 验收点 5「`.mcp.json` 不再出现明文 token」。
  - `.mcp.json.example` env 仅留 `CAPTURE_ALL_BRIDGE_URL`，无 `CAPTURE_ALL_BRIDGE_TOKEN`，符合。
  - `.mcp.json`（本机 gitignored）同样无 token，符合。
  - `src/mcp/main.ts` 改用 `resolve_client_token(process.env.CAPTURE_ALL_BRIDGE_TOKEN)`，env 缺失时走 `load_bridge_token_file(default_token_file_path())`，与 `src/bridge/config.ts:66-100` 的 T064 权限校验链路一致。
  - `tests/unit/mcp_project_config.test.ts` 断言 `CAPTURE_ALL_BRIDGE_TOKEN` undefined，已对齐。
  - README / mcp_usage / deployment 文档均改写为「默认无需填 Token」。
  无别处依赖该字段。
- 建议：无需修改。

### T091_code_f007 — MCP token 文件回退路径的失败行为与报错一致性

- 严重度：low
- 位置：`src/mcp/main.ts:4-18`；`src/mcp/token_resolver.ts`；`src/bridge/config.ts:81-100`
- 问题：`resolve_client_token` env 缺失时调 `load_bridge_token_file`，后者在「文件不存在」「权限非 0600 且 chmod 失败」「内容为空」三种情况下均返回 `null`。main.ts 对 null 抛 `CAPTURE_ALL_BRIDGE_TOKEN required: ... ensure Bridge has persisted ...`。
  报错消息把「文件不存在」和「权限被拒」合并为同一提示，用户难分辨。spec 验收点 4 要求「缺文件明确报错」，当前消息提到了「ensure Bridge has persisted its self-generated token (default: $XDG_RUNTIME_DIR/...)」，算明确但未区分权限失败。
  另：`load_bridge_token_file` 收紧权限失败时静默返回 null，未记录日志（config.ts:90-93 注释「无法收紧权限，拒绝读取避免泄露」，但无 logger 调用）。MCP 客户端进程因此看到「token 不存在」而非「token 文件权限错误」，排障困难。
- 建议：可在 `load_bridge_token_file` 内对 chmod 失败补一条 stderr 警告（保持纯函数无 logger 依赖的话，返回区分 `'missing' | 'permission_denied' | 'empty' | <token>` 的判别联合，让 main.ts 报错更精确）。非阻塞。

### T091_code_f008 — `to_chinese_numeral` 递归调用在千位段可能产生不规范读法

- 严重度：low（9999 以内浏览器实例数远超实际，仅理论）
- 位置：`src/bridge/label.ts:39`
- 问题：第 39 行 `return prefix + to_chinese_numeral(rest)`，rest < 1000 时会再次走 `< 10` / `< 100` / `< 1000` 分支。对 1000-9999 范围正确，但 `to_chinese_numeral(rest)` 对 rest=0 已在 36 行 return，rest<100 走 38 行，rest>=100 才到 39 行，此时递归会重新带「百」字。例如 1234 → 「一千」+to_chinese_numeral(234) → 「一千二百三十四」，正确。枚举 1..200 抽样检查未发现错误读法。边界正确，仅记录已复核。
- 建议：无需修改。建议补一个 `to_chinese_numeral` 1..9999 与 `parse_chinese_numeral` 的往返测试（如未覆盖），锁定行为。

## 结论

spec 6 条验收点实现一致：

1. ✅ 无 token 扩展 loopback 内自动 enroll（`server.ts:258-264` origin 直通 + `agent_bridge_client.ts:208-217` 无 token enroll 路径）。
2. ✅ 三扩展首次 enroll 得 一/二/三（`next_default_label` 取 max+1，测试 `agent_bridge_server.test.ts` 新增用例覆盖）。
3. ✅ 自定义 label 优先、不参与编号（`server.ts:289-295` provided_label 优先；`label.ts:113-122` 仅扫中文数字 label）。
4. ✅ MCP env 无 token 时从文件读（`token_resolver.ts` + `main.ts`，`mcp_token_fallback.test.ts` 新增）。
5. ✅ `.mcp.json` 无明文 token（`.mcp.json` / `.mcp.json.example` 均已删字段）。
6. ✅ 测试 + tsc —— 黑盒验证由 owner 负责，本次只读不执行。

安全不变量保留：

- Bridge 仍仅绑 127.0.0.1（无 host 改动）。
- instance_token / MCP token 分离保留（enroll 签发 `ext_` 前缀 instance_token；MCP 路由独立 `is_authorized`）。
- `is_allowed_extension_origin` 保留（f005 记录其防御边界）。

主要风险点：

- **f001（medium）** 是唯一需 owner 处置的实质问题：T047 清空语义被覆盖但无回归测试。建议 adoption 决定是否补测试，或明确在 spec/domain 文档写清「清空 label 的可观察行为」。
- f002-f004、f007 是代码可读性 / 死代码 / 报错精度问题，低优先级。
- f005、f006、f008 为已复核的安全 / 一致性 / 边界点，无需修改。

文档真实性：README、decisions.md（018）、domain.md、mcp_usage.md、deployment.md、troubleshooting.md、capture_all.md 均与代码改动一致，未发现文档描述与实现脱节。

无 HIGH / critical 级别问题。建议 owner 在 adoption 处置 f001 后即可进入收尾。
