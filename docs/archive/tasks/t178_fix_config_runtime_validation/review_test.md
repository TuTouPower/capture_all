# Task review t178（reviewer_focus: 测试）

- task：`t178_fix_config_runtime_validation`
- spec：`docs/tasks/t178_fix_config_runtime_validation/spec.md`
- diff_anchor：`9e34c29bdd8747837ca21b85490a25fceca1a2b0`
- target：`git diff 9e34c29bdd8747837ca21b85490a25fceca1a2b0`
- round：1
- reviewed_at：2026-08-13 21:05 UTC+8

## Findings

### t178_test_f001 - AC-002 无行为测试：源码扫描断言验证文本存在而非 guard 行为

- 严重度：important
- 锚点：AC-002
- 位置：`tests/unit/config_runtime_validation.test.ts:76-97`（`t178 AC-002: set_log_level enum guard` describe 三个 it）
- 问题：AC-002 的「非法 `set_log_level` 返回失败或回退，不写入非法 logger level」核心行为从未被真实执行验证，三个测试均为文本/兜底断言：
  1. 测试 1/2 是 `readFileSync` + 正则扫描 `service_worker.ts` 源码文本（`/valid_levels/`、`/INVALID_QUERY/`、`/save_user_config\(\{ log_level:/`），验证的是字符串存在而非行为。guard 反转（`!valid_levels.includes(level)` 写成 `valid_levels.includes(level)`）或白名单列表误加非法值（如误加 `'verbose'`）时，这些字符串仍在，测试全绿，而 `handle_message` 会对非法 level 返回 success 并执行 `Logger.set_level('verbose')`——`Logger.set_level` 无自身 guard（`src/shared/logger.ts:147` 直接赋值 `_global_level`）。
  2. 测试 3 `expect(['debug','info','warn','error','silent']).toContain(cfg.log_level)` 是弱化断言（toContain 替代具体值），且无 storage 落库断言；即使 save 边界回退（直接落库非法值），load 边界 sanitize（`src/shared/user_config.ts:454`）仍兜底，该断言恒绿。
  3. 「返回失败」路径（`wrap_result({ success: false, error: 'INVALID_QUERY' })`）与「Logger level 不写入」路径在测试中完全未执行。
  复验：已核实 `service_worker.ts:106` 顶层 `chrome.runtime.onInstalled.addListener`、`:292` `onMessage.addListener` 真实存在，import 不可行有正当理由（handle_message 亦不 export），故不升 critical；但行为覆盖确已降级，按危险模式「弱化断言/存在即通过」最低 important。
- 建议：行为级替代——将 level 白名单 guard 提取到可测 helper（如 `shared/logger` 的 `is_valid_log_level(level)`）直接断言行为；或测试顶部 stub `chrome.runtime.onMessage.addListener` 捕获 handler 后 import `service_worker`，真实触发 `set_log_level` 消息，断言返回 `{ success: false, error: 'INVALID_QUERY' }`、logger level 不变、storage 不写入。维持源码扫描时至少：测试 3 改为 `expect(cfg.log_level).toBe(DEFAULT_USER_CONFIG.log_level)` 并补 `expect(stored.log_level).not.toBe('verbose')` 落库断言。

### t178_test_f002 - AC-003 边界值覆盖不全：等于硬上限的合法值未测

- 严重度：minor
- 锚点：AC-003
- 位置：`tests/unit/config_runtime_validation.test.ts:100-115`（`t178 AC-003` describe）
- 问题：`> MAX_COMMAND_TIMEOUT_MS` 的拒绝路径已测（300001 / 999999），但等于 `MAX_COMMAND_TIMEOUT_MS`（300000）的合法边界值未测——生产逻辑为 `> MAX` 拒绝（`src/bridge/config.ts:37-42`），300000 应放行，无测试钉住该边界，未来改为 `>=` 时不会红灯。字符串型非法 type（如 `command_timeout_ms: '60000'`）拒绝亦未测。
- 建议：补 `command_timeout_ms: MAX_COMMAND_TIMEOUT_MS`、`full_data_timeout_ms: MAX_COMMAND_TIMEOUT_MS` 放行 case 与字符串 type 拒绝 case。

### t178_test_f003 - AC-001 负数数值 case 断言力度不足，save 边界回退时不红

- 严重度：minor
- 锚点：AC-001
- 位置：`tests/unit/config_runtime_validation.test.ts:44-47`（`负数数值（max_body_capture_bytes）被滤回默认`）
- 问题：该 case 只断言 `load_user_config()` 结果回默认，无 `store.user_config` 落库断言；load 边界 sanitize（`src/shared/user_config.ts:454`）兜底使它在 save 边界未修/回退时仍绿，与同 describe 的 theme/browser_label/log_level 三个 case（均有 `stored.x not.toBe` 直接落库断言）不一致。AC-001 锚定「patch 不得进入 storage」，落库层断言才对。
- 建议：补 `expect(stored.max_body_capture_bytes).not.toBe(-1)`。

## 结论

- 前轮 finding 复核：Round 1，无
- 改测方向复核：无（未改动任何既有测试；相关既有测试 `user_config_persistence` / `i18n_locale_single_source` / `dashboard_config_sync` / `agent_command_dispatcher` / `agent_bridge_config` 共 86 条全绿，无回归）
- 本轮新发现：3 条（1 important + 2 minor）
- 未进表的提示：
  - AC-004「等于硬上限放行」用 `expect.objectContaining` 弱于既有 dispatcher 测试的精确 `toHaveBeenCalledWith({ ...DEFAULT_CONFIG, ...config })`（`tests/unit/agent_command_dispatcher.test.ts:70-73`），但断言有效（merged 确实含 DEFAULT_CONFIG 全部字段），不阻断。
  - AC-004 测试 mock 的 `exporter` / `agent_data_queries` 在该路径未真实触达（校验在 dispatcher 内完成、`start_capture` handler 被 mock），属 import 依赖的必要 mock，无副作用。
  - `docs/spikes/s008_body_inline_hard_caps/` 为未跟踪目录（git status `??`）——流程观察，非测试问题。
  - 生产侧观察（非本 review 职责）：`sanitize_user_config` 对 `max_body_capture_bytes` 只做 ≥0 整数校验、不做硬上限，硬上限在 dispatcher 层校验；AC-001 与 AC-004 分层符合 spec 范围（非范围明确「不改变 sanitize 既有白名单逻辑」），不判问题。
- 总体判断：AC-001/003/004 覆盖可信（行为断言 + 复验全绿），AC-002 核心行为（返回失败 + Logger 不写入）无行为测试、测试仅钉住源码文本，存在 1 条未解决 important，故 FAIL。
- 系统性 follow-up：建议 task「service_worker `handle_message` 行为级测试可达」slug `test_infra_sw_handler_behavior_testable`，阻断性：否。已查 `task.py list` 无等价 task。

### AC 复验方式

- AC-001：`re_verified`。运行 `npx vitest run tests/unit/config_runtime_validation.test.ts`（15 条全绿）；逐条读断言，theme/browser_label/log_level 三个 case 有 `stored.x not.toBe` 直接落库断言，可区分 save 边界修复与否。
- AC-002：`re_verified`（仅至源码扫描层）。确认三个测试均为文本/兜底断言、行为路径未执行（详见 f001）；实际 guard 位于 `src/extension/background/service_worker.ts:376-386`，其行为无测试钉住。
- AC-003：`re_verified`。`parse_bridge_config` 直接测试：-1 / 1.5 / 0 / 300001 / 999999 拒绝，默认值与显式合法值放行，断言有效。
- AC-004：`re_verified`。dispatcher 行为断言：超上限返回 `{ ok: false, error: { code: 'INVALID_QUERY' } }`、`start_capture` 未被调用、等于上限放行且传参为 DEFAULT_CONFIG merge。
- AC-005：`re_verified`。本 diff 即新增测试文件，15 条全绿。
- coverage = 5 / 5

reviewed_scope: 1375aefaa4653d6e

verdict: FAIL

## Round 2 (2026-08-13 21:10 UTC+8)

前轮 finding 复核（以 `git diff 9e34c29bdd8747837ca21b85490a25fceca1a2b0` 与代码/测试本身为准）：

- **t178_test_f001 — 已消除**：guard 提取为 `src/shared/user_config.ts:390` 导出的 `is_valid_log_level`，白名单 `LOG_LEVELS` 为单一事实来源且被 `sanitize_user_config` 的 enum_rules 复用（`user_config.ts:407-410`），guard 与 save 边界同源。新增 helper 行为测试（`config_runtime_validation.test.ts:93-104`）：非法 `'verbose'` / `'WARN'` / `42` / `undefined` 均 `toBe(false)`、合法 5 枚举逐值 `toBe(true)`——具体布尔断言，非弱化，与 `LogLevel` 定义（`types.ts:704`）对齐。源码扫描断言收窄为「分支调用 `is_valid_log_level(level)` + 返回 `INVALID_QUERY`」（`service_worker.ts:378-380` 实为 `if (!is_valid_log_level(level)) return wrap_result({ success: false, error: 'INVALID_QUERY' })`）。guard 语义现由行为测试直接钉住，f001 的 blocking 依据（guard 行为不可验证）已消除。
- **t178_test_f002 — 已消除**：补「等于 `MAX_COMMAND_TIMEOUT_MS`（300000）合法边界放行」（`config_runtime_validation.test.ts:151-155`，`toBe(300000)` 精确断言，与生产逻辑 `> MAX` 拒绝一致）与「字符串型非法 type 拒绝」（`:157-160`，`'60000'` / `'300000'` 均 `toThrow`，`Number.isInteger` 拒字符串行为正确）。
- **t178_test_f003 — 已消除**：负数 case 补 `expect(stored.max_body_capture_bytes).not.toBe(-1)` 落库断言（`config_runtime_validation.test.ts:72`），save 边界回退时该断言转红，与同 describe 其余 case 断言力度一致。

本轮新发现：0 条。危险模式复扫：新增 helper 断言为 `toBe(true/false)` 具体值，无恒真/弱化/条件跳过；无 `.skip`/`.only`/`ts-ignore`；扫描断言维持 t155 既有模式。

验证：`npx vitest run tests/unit/config_runtime_validation.test.ts` → 19 tests passed；`npx tsc --noEmit` → exit 0。

未进表的提示（不阻断）：
- 源码扫描断言固有上限：`service_worker` set_log_level 分支若把 `!` 用反（非法 level 走 success 分支），扫描断言仍绿——但该场景下 helper 语义正确、save 边界 sanitize 兜底（AC-001 已测）仍保证 storage 不写入非法 level，残余风险仅为 `Logger.set_level` 运行时污染这一实现缺陷路径；行为级彻底钉死需 stub chrome 捕获 onMessage handler 后 import `service_worker`，成本高且超本 task 范围（见 f001 建议）。
- `config_runtime_validation.test.ts:117-121` 的「save 边界兜底」测试仍用 `toContain` 且无 stored 断言，但与 AC-001 的 log_level case（`:61-67`，含 stored 断言 + `toBe(DEFAULT)`）同路径重复，弱化不构成独立覆盖缺口。

改测方向复核：无（未改动任何既有测试；生产改动仅为 helper 提取 + 分支改用共享 guard）。

总体判断：f001/f002/f003 均按建议处置到位且行为断言真实，无未解决 blocking finding。

reviewed_scope: def1b8f6ea775991

verdict: PASS
