# Task review t100（reviewer_focus: 代码）

- task：`t100_privacy_logger_stack_redact_url`
- spec：`docs/tasks/t100_privacy_logger_stack_redact_url/spec.md`
- diff_anchor：`e47d501b5e19cce4e486003830950beff707bebc`
- target：`git diff e47d501b5e19cce4e486003830950beff707bebc`
- round：1
- reviewed_at：2026-08-11 05:05 UTC+8

reviewed_scope: 228782fa72edd4ee

## Findings

### t100_code_f001 - 相对 query 嵌套绝对 URL 时明文敏感值泄露（fail-open 未消除）

- 严重度：critical
- 锚点：违反 AC-002；`?next=https://app.example.com/login?token=abc123` 输出仍含明文 `abc123`，而旧实现（diff 前）经内层绝对 URL 匹配已脱敏，属回归
- 位置：`src/shared/logger.ts:32`（新 bare-query 分支 `\?[^\s"'<>`)]+`）与 `src/shared/redaction.ts:77-96`（catch 手动拆 query 路径）
- 问题：新正则第 3 个分支 `\?[^\s"'<>`)]+` 从首个 `?` 贪婪吞并整段 `?next=https://app.example.com/login?token=abc123`，把内层绝对 URL 一并吞入单个 param；手动路径仅按首个 `=` 取 key=`next`（非敏感）即原样返回，内层 `token=abc123` 明文泄露。diff 前旧正则只匹配绝对 URL 子串 `https://...?token=abc123`，经 `new URL` 路径脱敏为 `token=%5BREDACTED%5D`。实测对比：
  - 输入 `登录跳转 ?next=https://app.example.com/login?token=abc123 结束`
  - 旧输出 `...?token=%5BREDACTED%5D...`（无明文）
  - 新输出 `...?token=abc123...`（**明文泄露**，`/token=abc123|api_key=KEY999/` 命中）
  同理 `?callback=https://example.test/x?api_key=KEY999` 泄露 `KEY999`。这是本 task 旨在消除的 fail-open 泄露形态，只是换了个入口，AC-002 未完全满足。
- 建议：手动路径检测 param 值内嵌 `scheme://`（含 `?` 的绝对 URL）时递归 `redact_url`；或收紧正则使 bare-query 分支不被内层绝对 URL 吞并（如 query 段遇 `://` 提前截断），并补 `?next=<abs>?token=` 回归用例。

### t100_code_f002 - 正则误匹配 JS 可选链/三元，日志正文被污染

- 严重度：important
- 锚点：行为缺陷（非 AC）。`sanitize_string` 作用于每条日志 message 与 details 内全部字符串，新 bare-query 分支把 `?.` 可选链、`cond?x:y` 三元当 query 吞并
- 位置：`src/shared/logger.ts:32`（`\?[^\s"'<>`)]+`）+ `src/shared/redaction.ts:85-94`
- 问题：`?` 后任意非分隔符文本被当 query，命中敏感键词典即把整段替换为 `key=[REDACTED]`。实测：
  - `user?.token 读取失败` → `user?.token=[REDACTED] 读取失败`
  - `config?.apiKey 未配置` → `config?.apiKey=[REDACTED] 未配置`
  - `cond?token:x` → `cond?token:x=[REDACTED]`
  旧正则不匹配此类文本（无 scheme），本改动引入系统性正文污染，与 spec 上下文区「风险：fail-closed 过严影响调试」方向相反且更严重（非仅抹掉，而是追加 `=[REDACTED]` 改写正文）。
- 建议：bare-query 分支要求命中 `key=value` 形态（`\?[^\s"'<>`)]*=[^\s"'<>`)]*`）以排除 `?.` / 三元，或要求 `?` 后首个字符非 `.`、`:`；补 `?.` / 三元回归用例。

### t100_code_f003 - Logger 自产 stack 字段未走 sanitize_string

- 严重度：minor
- 锚点：范围声明不一致（无 AC 直接锚定）
- 位置：`src/shared/logger.ts:117-119`
- 问题：`write()` 中 `stack: new Error().stack?.split('\n').slice(2).join('\n')` 为 logger 自产 stack，未过 `sanitize_string`。范围条款「Error.stack 与 logger 产出的 stack 字符串走与 message 相同的 URL/query 脱敏」仅覆盖到 details 内 Error 对象（`sanitize_value` 分支），自产 stack 字段遗漏。实际为扩展内部 JS 调用帧，含敏感 query 概率低，故判 minor。
- 建议：`stack` 字段同样经 `sanitize_string` 再写入。

### t100_code_f004 - 手动路径未 decode key 且未拆分 fragment

- 严重度：minor
- 锚点：行为缺陷（边角）
- 位置：`src/shared/redaction.ts:87-89`
- 问题：手动路径用原始串文本取 key，不做 URL decode。`?%74oken=secret`（`%74` 为 `t`）key=`%74oken` 不含 `token`，不命中敏感键，`secret` 明文保留；而 `new URL` 路径 `searchParams.keys()` 返回 decode 后 key 会命中，两路径不一致。另 `#fragment` 未先拆分，敏感 param 为末位时 fragment 被 `[REDACTED]` 吞掉（非泄露，丢数据）。
- 建议：手动路径对 key 先 `decodeURIComponent` 再匹配；拆分 `#` 处理 fragment。编码 key 场景实际罕见，可一并补用例。

## 结论

- 前轮 finding 复核（Round 1）：无
- 本轮新发现：4 条（f001 critical / f002 important / f003 minor / f004 minor）
- 未进表的提示：
  - 文件过大：无。`src/shared/redaction.ts` 138 行、`src/shared/logger.ts` 182 行、测试 54 行，均远低于阈值。
  - 复杂度：`redact_url` 手算 CC≈5、`sanitize_value` CC≈9，未达提示线。
  - 范围观察：`new URL` 路径 `delete+append` 致 query 参数重排（`ok=1&access_token=...`），为 diff 前既有行为，非本 task 引入。
- 总体判断：AC-001、AC-003 满足；AC-002 简单相对 URL 用例满足，但相对 query 内嵌绝对 URL 时明文泄露（f001），本 task 核心目标「fail-open 消除」未达成，且正则引入系统性正文污染（f002）。存在未解决 critical / important。
- AC 复验方式：
  - AC-001：`re_verified`。跑 `npx vitest run tests/unit/logger_stack_redact.test.ts` 6/6 通过；测试 1 直接断言 `sanitized.stack` 不含 `secret123`，独立核对 `sanitize_value` Error 分支调用 `sanitize_string(value.stack)`。
  - AC-002：`re_verified`（部分）。简单用例 `path?api_key=abc123&ok=1`、`?token=xyz123` 经独立 node 复现脱敏正确；但嵌套用例 `?next=<abs>?token=secret` 泄露，AC-002 未完全满足，锚定 f001。
  - AC-003：`re_verified`。独立复现 `redact_url('https://example.test/foo/bar', true)` 保留 host/path，status `captured`；测试断言 `example.test` 与 `/foo/bar`。
  - coverage = 3 / 3（AC-002 按部分满足计，泄露面见 f001）
- 系统性 follow-up：无独立 tid。建议标题与 slug：`privacy/redact_url 嵌套 query 泄露与正则误匹配`（阻断性：f001 修复即可，勿单列 pending）。

verdict: FAIL

## Round 2 (2026-08-11 05:12 UTC+8)

reviewed_scope: a63d65d6d0e07aa8

### 前轮 finding 复核（以 `git diff e47d501b5e19cce4e486003830950beff707bebc` 与运行结果为准）

- t100_code_f001 (critical)：已消除。catch 手动路径对 param 值内嵌绝对 URL 递归 `redact_url`（`src/shared/redaction.ts:14` `URL_SUBSTRING_RE` + `src/shared/redaction.ts:107-110`）。独立复验：`redact_url('?next=https://app.example.com/login?token=abc123', true)` → `?next=https://app.example.com/login?token=%5BREDACTED%5D`；logger 侧 `sanitize_log_value('登录跳转 ?next=... 结束')` 同无明文。AC-002d 回归用例断言 `not.toContain('abc123')` + `decodeURIComponent(...).toContain('[REDACTED]')`，通过。
- t100_code_f002 (important)：已消除（对 Round 1 报告用例）。logger `URL_SUBSTRING_PATTERN` 第 3 分支收紧为 `\?[^\s"'<>`)]*=[^\s"'<>`)]+`（`src/shared/logger.ts:33`）。独立复验：`user?.token 读取失败`、`cond?token:x` 原样保留，无 `[REDACTED]` 污染。AC-002e 用例通过。残余：含 `=` 的三元（`cond?token=x:y`）仍命中，见本轮 f006（minor）。
- t100_code_f003 (minor)：已消除。`write()` 自产 stack 改经 `sanitize_string`（`src/shared/logger.ts:118-123`）。独立复验：`Logger.error('boom')` 产出 stack 字段非空，走与 message 相同的脱敏 + `truncate_bytes_safe` 链路。
- t100_code_f004 (minor)：已消除。手动路径先按 `#` 拆分 fragment（`src/shared/redaction.ts:82-84`），key 先 `decodeURIComponent` 再匹配敏感词典（`src/shared/redaction.ts:96-102`）。独立复验：`redact_url('?%74oken=secret', true)` → `?%74oken=[REDACTED]`；`redact_url('?token=secret#frag', true)` → `?token=[REDACTED]#frag`（fragment 不再被吞）。

### Findings（本轮新）

### t100_code_f005 - url_status 过度上报：值内嵌绝对 URL 但递归未实际脱敏时仍标 redacted

- 严重度：minor
- 锚点：行为缺陷（无 AC 直接锚定；方向保守，不泄露）
- 位置：`src/shared/redaction.ts:107-110`
- 问题：手动路径 `if (value && URL_SUBSTRING_RE.test(value))` 命中即设 `redacted = true`，即使递归 `redact_url(value, true)` 未改动任何内容。独立复验：`redact_url('?u=https://example.com/foo', true)` 输出 `{url: '?u=https://example.com/foo', url_status: 'redacted'}`——输入输出完全一致却标 `redacted`。消费 `url_result.url_status` 的调用点（如 `src/extension/background/cdp_handler.ts:591`）会把该标记写入记录，语义失真（误称已脱敏，实际原样展示 URL）。
- 建议：仅当递归结果真正脱敏才置位——`const r = redact_url(value, true); if (r.url_status === 'redacted') { redacted = true; } return `${raw_key}=${r.url}`;`。

### t100_code_f006 - f002 修复残余：含 `=` 的三元仍被 bare-query 分支误匹配

- 严重度：minor
- 锚点：行为缺陷（日志正文污染，非泄露）
- 位置：`src/shared/logger.ts:33`
- 问题：bare-query 分支改为要求 `key=value` 形态后，Round 1 报告的 `?.` 与 `cond?token:x`（无 `=`）被正确排除，但三元真值分支含 `=` 时仍命中：复验 `sanitize_log_value('cond?token=x:y')` → `cond?token=[REDACTED]`。压缩/简写 JS 日志中变量名恰为敏感词且带赋值的三元理论上可出现，属 key=value 启发式的固有残余，非 Round 1 报告用例回归。
- 建议：如需进一步收紧，可在 bare-query 分支 value 段排除 `:`（三元标记）——如 `\?[^\s"'<>`):]*=[^\s"'<>`):]+`；但 query 值合法含 `:`（base64 等）会漏脱敏，属权衡。当前 minor 不阻断，implementer 可留作已知局限。

### 结论

- 前轮 finding 复核：f001/f002/f003/f004 全部经 diff + 独立复验确认消除（f002 对报告用例消除，残余见 f006）。
- 本轮新发现：2 条（f005 / f006，均 minor）。
- 未进表的提示：
  - 范围外既有局限（不阻断本 task）：try 分支（可 parse 的绝对 URL）param 值内嵌绝对 URL 时不递归，`https://app.example.com/login?next=https://x/login?token=abc123` 仍泄露 `abc123`。此为 diff 前既有行为（try 分支仅按顶层 key 脱敏，f001 建议范围限于手动路径），不属 AC-002「无法 parse」范围；需闭合建议单列 follow-up（见下）。
  - DRY：`src/shared/redaction.ts:14` `URL_SUBSTRING_RE` 与 `src/shared/logger.ts:33` 首分支绝对 URL 模式重复，可考虑从 redaction 导出共享常量，防两处漂移。
  - 复杂度：`redact_url` 手算 CC≈11（≥10 结论提示线，未达 15 minor 线）；未发现高复杂度直接产出可观测缺陷。
  - 既有行为：`new URL` 路径 `delete+append` 致 query 参数重排（`id=5&access_token=...`），diff 前既有，非本 task 引入。
  - 文件过大：无。redaction.ts 155 行 / logger.ts 185 行 / 测试 79 行，均远低于阈值。
- 总体判断：Round 1 全部 blocker 已消除，AC-001/002/003 满足；仅剩 2 条 minor 与若干范围外既有局限，无未解决 critical / important。
- AC 复验方式：
  - AC-001：`re_verified`。重跑 `npx vitest run tests/unit/logger_stack_redact.test.ts` 9/9 通过；测试 AC-001/001b 断言 stack 无明文；独立 node 复验 `sanitize_log_value(err)` 输出 `%5BREDACTED%5D` 占位。
  - AC-002：`re_verified`。测试 AC-002/002b/002d/002f 覆盖相对 URL、纯 query、嵌套绝对 URL、编码 key；独立复验 `?next=...?token=` 与 `?%74oken=` 均无明文。
  - AC-003：`re_verified`。测试 AC-003 + 独立复验 `redact_url('https://example.test/foo/bar', true)` 保留 host/path、status `captured`。
  - coverage = 3 / 3
- 系统性 follow-up：无已有 tid（`task.py list` 中 t012/t015 为既有 redaction 演进，与本残余不同）。建议标题与 slug：`privacy/redact_url try 分支嵌套绝对 URL 值递归脱敏`（阻断性：不阻断本 task，属既有局限闭合）。

verdict: PASS

## Round 3 (2026-08-11 05:14 UTC+8)

reviewed_scope: a5307a49a496754c

### 前轮 finding 复核（以 `git diff e47d501b5e19cce4e486003830950beff707bebc` 与独立运行结果为准）

- t100_code_f005 (minor)：已消除。`src/shared/redaction.ts:107-111` 改为「先递归 `redact_url(value, true)`，仅当递归结果 `url_status === 'redacted'` 才置位」，符合 Round 2 建议。独立复验（vitest 一次性用例）：`redact_url('?u=https://example.com/foo', true)` → `{url: '?u=https://example.com/foo', url_status: 'captured'}`（Round 2 报告输入输出一致仍标 `redacted` 的失真已消失）；敏感嵌套 `redact_url('?next=https://app.example.com/login?token=abc123', true)` → 递归脱敏 `%5BREDACTED%5D` 且 `url_status: 'redacted'`（红路径不回归）。`URL_SUBSTRING_RE` 非全局标志，`.test()` 无 lastIndex 状态副作用。
- t100_code_f006 (minor)：处置为遗留并已登记。`docs/pending/todo/p017_redact_url_ternary_remainder.md` 存在，来源标注 `t100_code_f006`，属 key=value 启发式已知局限，不阻断。

### Findings（本轮新）

无。

### 结论

- 前轮 finding 复核：f005 经 diff + 独立复验确认消除；f006 处置为遗留并登记 p017。
- 本轮新发现：0 条。
- 未进表的提示：
  - 范围外既有局限（不阻断本 task，与 Round 2 结论「try 分支嵌套」同族）：手动路径仅对 param 值内嵌**绝对 URL**（`scheme://`）递归；param 值内嵌**相对 query**（`?next=path?token=secret`）不递归 → 输出仍含明文 `token=secret`。该形态 base 版本同样泄露（旧 logger 正则仅匹配绝对 URL、catch 直接原样返回），非本 task 引入。建议 follow-up 闭合（见下）。
  - 测试覆盖：f005 语义（非敏感嵌套 URL → `url_status` 保持 `captured`）无专项回归用例，现有 AC-002d 仅覆盖敏感嵌套红路径；如需可补一条，属覆盖可更广，非阻断。
  - 文件过大 / 复杂度：同 Round 2（redaction.ts 157 行 / logger.ts 185 行 / 测试 79 行，均远低于阈值；`redact_url` CC≈11 结论提示线），无变化。
- 总体判断：f005 修复正确，无未解决 critical / important；仅范围外既有局限。
- AC 复验方式：
  - AC-001：`re_verified`。重跑 `npx vitest run tests/unit/logger_stack_redact.test.ts` 9/9 通过；测试 AC-001/001b 断言 `sanitized.stack` 无明文；独立核对 `sanitize_value` Error 分支调用 `sanitize_string(value.stack)`。
  - AC-002：`re_verified`。测试 AC-002/002b/002d/002f 覆盖相对 URL、纯 query、嵌套绝对 URL、编码 key；独立复验 `?next=...?token=`、`?%74oken=`、`?u=https://example.com/foo`（captured）均无明文。
  - AC-003：`re_verified`。测试 AC-003 + 独立复验 `redact_url('https://example.test/foo/bar', true)` 保留 host/path、status `captured`。
  - coverage = 3 / 3
- 系统性 follow-up：建议标题与 slug：`privacy/redact_url param 值内嵌相对 query 递归脱敏`（阻断性：不阻断本 task，既有局限闭合；可与 Round 2 建议的 try 分支嵌套 follow-up 合并评估）。

verdict: PASS
