# Task review t172（reviewer_focus: 测试）

- task：`t172_fix_content_log_before_capture`
- spec：`docs/tasks/t172_fix_content_log_before_capture/spec.md`
- diff_anchor：`12a00f4a0934c529fc13e2871515ff8068df0119`
- target：`git diff 12a00f4a0934c529fc13e2871515ff8068df0119`
- round：1
- reviewed_at：2026-08-13 19:20 UTC+8

## Findings

### t172_test_f001 - AC-002 链路缺 SW 侧下发验证（仅 content 静态包含 + Logger 行为）

- 严重度：minor
- 锚点：AC-002
- 位置：`tests/unit/content_log_privacy.test.ts:32-39`；缺测点 `src/extension/background/service_worker.ts:746,1196`
- 问题：AC-002 用户可观察行为 = user config → SW start 消息带 `log_level` → content `Logger.set_level` → info 抑制。现有测试只覆盖后两段：content 源码静态包含 `message.log_level`/`Logger.set_level`（AC-002a）、Logger 真实 set_level 过滤行为（AC-002b）。SW 侧下发（`log_level: (await load_user_config()).log_level`）无任何测试——`sw_action_contract.test.ts` 仅断言 start 响应 `success`，不校验 per-tab 消息 payload。若 SW 侧回退该行，全部测试仍绿而 AC-002 端到端失效。
- 建议：在 `sw_action_contract.test.ts` 或本文件补一条：mock `load_user_config` 返回 `{ log_level: 'silent' }`，断言 start 消息含 `log_level: 'silent'`；或对两处下发点（`start_capture_inner_impl` / `onActivated`）各断言一次。

### t172_test_f002 - AC-001 静态正则过宽：会误伤 active capture 内合法 URL 日志

- 严重度：minor
- 锚点：AC-001（非范围：不改变 active capture 期间正常日志行为）
- 位置：`tests/unit/content_log_privacy.test.ts:29`
- 问题：`not.toMatch(/logger\.info\([^)]*window\.location\.href/)` 扫描整个文件，禁止**任意位置**（含 `start_capture` 内）的 `logger.info` 携带 URL。AC-001 只约束「未开始 capture」时的 app log；未来在 active capture 内合法新增带 URL 的 info 日志（非范围允许）将触发误红，测试成为未来合法改动的错误门禁。另 `[^)]*` 无法跨嵌套括号，`logger.info('x', fn(url))` 形态漏检，过宽与过窄并存。
- 建议：将扫描锚定模块加载段，如 `content_source.split('chrome.runtime.onMessage.addListener')[0]` 后再断言，仅约束加载路径。

### t172_test_f003 - AC-002a 模块级写入正则只匹配行首，弱于注释宣称

- 严重度：minor
- 锚点：AC-002a 断言强度（模块加载路径无 logger 写入）
- 位置：`tests/unit/content_log_privacy.test.ts:37-38`
- 问题：`content_source.match(/^logger\.(info|warn|error|debug)/gm)` 仅匹配列 0 的 logger 调用。对历史 bug（旧实现列 0 的 `logger.info('Content script loaded'...)`）能红 ✓，但注释宣称「模块加载路径无任何 logger 写入」，实际对缩进形态的模块级 logger 调用无防护（若回归写成 `  logger.info(...)` 则漏检）。与 f002 同类锚定粒度问题，方向相反（过窄）。
- 建议：与 f002 相同，先按模块加载段截取再扫描；或放宽为 `^\s*logger\.` 并显式排除函数体内行。

## 结论

- 前轮 finding 复核（Round 1 无）：无
- 改测方向复核：无（diff 仅新增 `content_log_privacy.test.ts`，未修改任何既有测试，无「迁就实现」改测）
- 本轮新发现：3 条（全部 minor，非阻断）
- 未进表的提示：
  - 契约区 AC-003 文字（「active capture 期间日志行为与既有采集隐私配置一致」）与测试语义（默认 info 不记 debug）错位。按 review 指令映射 AC-003=默认 info，测试覆盖成立；但 finalization 建议修订 spec 措辞或补一条 active capture 隐私一致性回归断言（处置为改 spec，不计 FAIL）。
  - `src/shared/constants.ts:70` 用户配置默认 `log_level: 'debug'` 与 logger 新默认 `info` 不一致：pre-capture 默认 info（隐私收益），active capture 期间按 user config（默认 debug）——与「非范围：不改变 active capture 期间正常日志行为」一致，属设计取舍，仅提示。
  - AC-001 测试仅覆盖字符串/正则形态；行为级验证（jsdom + chrome mock 实跑 content_script）受顶层副作用限制未做，仓库已有 `network_hook_config_gate.test.ts` 等同款 readFileSync 静态扫描先例，可接受。
- 总体判断：测试真实触达生产逻辑（真实 Logger + LEVEL_WEIGHT 过滤、真实源码文本），4 条新测试代入旧实现全部必红，全量套件无回归；3 条 minor 均属锚定粒度与链路补强，不阻断。
- 系统性 follow-up：无（静态扫描 content_script 已有仓库先例，SW 消息 payload 断言属常规扩展，无跨 task 基础设施缺口）

### AC 复验方式

- AC-001：`re_verified` — 重跑 4 测试全绿；`git show 12a00f4:src/extension/content/content_script.ts:41` 确认旧实现含 `logger.info('Content script loaded', { url: window.location.href })`（列 0），代入后 `not.toContain` 与 info-href 正则必红。
- AC-002：`re_verified` — 静态断言命中当前源码真实字符串（`message.log_level`/`Logger.set_level` 均在 start 分支）；AC-002b 通过真实 `Logger` 与 `LEVEL_WEIGHT` 过滤执行，silent 全抑制、warn 滤 info 留 warn/error；旧实现无 `message.log_level`，AC-002a 必红。
- AC-003：`re_verified` — `git show 12a00f4:src/shared/logger.ts:18` 旧默认 `'debug'`，代入后 debug 条目写入，断言 `['info recorded']` 必红；现默认 `'info'` 下测试通过。
- AC-004：`re_verified` — `npx vitest run` 全量通过（177 files / 1695 tests），本文件 4/4 通过。

coverage = 4 / 4

reviewed_scope: 63f86689ab2fbf40

verdict: PASS

## Round 2 (2026-08-13 19:25 UTC+8)

### 前轮 finding 复核（以 diff 为准）

- **t172_test_f001**：部分落实，残留为 minor 不阻断。处置新增 `AC-002c` 有效：`toContain('resp.log_level')` 与 `/on_active[\s\S]{0,200}Logger\.set_level\(resp\.log_level/` 均命中当前生产源码（`src/extension/content/content_script.ts:84-85`），红灯光成立——旧 anchor `12a00f4` 的 on_active 无 set_level、无 `resp.log_level`，代入必红。生产侧配套补全：SW `get_status` 响应新增 `log_level`（`service_worker.ts:338`）、类型契约 `poll_capture_status.ts:17` 加 `log_level?: string`、on_active 内 set_level 位于 `start_capture` 调用之前（`content_script.ts:84-87`，顺序经人工核对正确）。但原建议的「SW start 消息 payload 断言」（sw_action_contract 方向）未落实——SW 三处下发（`get_status:338` / `start:748` / `onActivated:1198`）仍无测试保护，属 f001 残留观察项，维持 minor。
- **t172_test_f002**：维持（静态扫描粒度已接受）。
- **t172_test_f003**：维持（静态扫描粒度已接受）。

### 改测方向复核

无（本轮仅新增 AC-002c 断言，未修改任何既有断言/测试）。

### 本轮新发现

0 条。危险模式扫描无命中（无 skip/only、无静默错误指令、无恒真/弱化断言——AC-002c 的正则比 AC-002a 的 toContain 更强，锚定 on_active 回调上下文）。

### 未进表的提示

- f001 残留：SW 三处下发无测试保护（见上复核），若后续要闭环可在 `sw_action_contract.test.ts` 补 start/get_status payload 断言。
- AC-002c 测试名内嵌 finding 引用「（f001）」，轻微格式偏好，无碍。

### 总体判断

AC-002c 有效且顺带补上了重载恢复路径（on_active）真实存在的生产缺口；AC-001~004 覆盖维持，本文件 5/5 绿，无未解决 critical / important。

### AC 复验方式

- AC-001：`re_verified` — 断言未变，`npx vitest run tests/unit/content_log_privacy.test.ts` 5/5 通过；旧实现含列 0 URL 日志，必红（Round 1 证据维持）。
- AC-002：`re_verified` — a（start 静态）/ b（Logger 行为）/ c（on_active 静态）三径齐备；c 断言与生产源码逐字核对命中，顺序人工核对正确。
- AC-003：`re_verified` — 断言未变，默认 info 行为测试通过。
- AC-004：`re_verified` — 本文件 5/5 通过（Round 1 全量 177 files / 1695 tests 维持）。

coverage = 4 / 4

reviewed_scope: 63f86689ab2fbf40

verdict: PASS
