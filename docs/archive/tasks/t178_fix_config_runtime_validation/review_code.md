# Task review t178（reviewer_focus: 代码）

- task：`t178_fix_config_runtime_validation`
- spec：`docs/tasks/t178_fix_config_runtime_validation/spec.md`
- diff_anchor：`9e34c29bdd8747837ca21b85490a25fceca1a2b0`
- target：`git diff 9e34c29bdd8747837ca21b85490a25fceca1a2b0`
- round：1
- reviewed_at：2026-08-13 21:03 UTC+8

## Findings

### t178_code_f001 - set_log_level 合法 level 列表硬编码重复，与白名单/类型单源脱钩

- 严重度：minor
- 锚点：代码质量（DRY）——verbatim 重复，当前无行为分叉
- 位置：`src/extension/background/service_worker.ts:379`
- 问题：`const valid_levels: readonly string[] = ['debug', 'info', 'warn', 'error', 'silent'];` 与 `src/shared/user_config.ts:403` 的 `['log_level', ['debug', 'info', 'warn', 'error', 'silent']]` 白名单、`src/shared/types.ts:704` 的 `LogLevel` 联合类型三处各写一份。当前三份内容一致，无可观测缺陷；但任一单源演进（如新增 level）会先造成三处失步：guard 拒绝合法 level（UI 层失败）或 save 侧滤掉 Logger 已接受的 level（存储与运行态不一致），且无编译期/测试期联动。
- 建议：在 `src/shared/constants.ts` 抽 `LOG_LEVELS` 常量（或复用 `LogLevel` 推导数组），三处引用同一来源；guard 处 `LOG_LEVELS.includes(level as LogLevel)`。

### t178_code_f002 - has_valid_capture_config_values 扁平 && 链达圈复杂度 minor 阈值，新增上限谓词可内联化简

- 严重度：minor
- 锚点：代码质量（圈复杂度）——CC≈15（本 task 新增 2 分支，达到 ≥15 阈值）；非 blocking
- 位置：`src/extension/background/agent_command_dispatcher.ts:282-300`
- 问题：函数为 15 项扁平 `&&` 链（手算 McCabe≈1+14=15），本 task 新增两项 `Number(value.max_body_capture_bytes) <= MAX_BODY_CAPTURE_BYTES` / `Number(value.inline_text_max_bytes) <= INLINE_TEXT_MAX_BYTES`（:292/:294）后达 minor 阈值。另：两项上限判断前的 `is_non_negative_integer`（:291/:293）已收窄为 number，`Number(...)` 包装冗余。
- 建议：抽取 `is_within_body_cap(v: number)` / `is_within_inline_cap(v: number)` 命名谓词（内部做 `v <= MAX_*`），替换 :292/:294 两项并去掉 `Number()` 冗余，链长降至 13。

## 结论

- 前轮 finding 复核：Round 1，无
- 本轮新发现：2 条（均为 minor，无 blocking）
- 未进表的提示：
  - **文件过大（降级规则，不进 finding 表）**：`src/extension/background/service_worker.ts` 1399 行、`src/shared/user_config.ts` 466 行，均已超实现源码 400 行 minor 阈值，且本 task 分别净增约 +8 / +6 行；diff 未给出不可拆硬约束。本 task 增量小、未因过大直接产出可观测缺陷，故仅在此提示。
  - **AC-002 测试方式观察（归 test reviewer 判断）**：`tests/unit/config_runtime_validation.test.ts:91-100` 对 service_worker 的 enum guard 用源码扫描断言（test 文件头注释说明 service_worker 顶层注册 chrome 事件无法 import，同 t155 模式）；guard 拒绝路径未在运行时执行。storage 侧过滤行为已有行为断言兜底（:102-106 + AC-001 用例）。实现本身经代码阅读确认正确（非法 type/非白名单 level → 返回 INVALID_QUERY；合法 → set_level + save_user_config 落库）。
  - **范围外观察**：`docs/spikes/s008_body_inline_hard_caps/` 为未跟踪 spike 材料（指纹计算已排除 docs/spikes），内容与 未知契约清单 结论一致（复用既有常量、无新魔数）。
  - e2e `tests/e2e/e2e-logging.spec.ts` 仅使用合法 level（debug/silent/warn），set_log_level guard 收紧不构成回归风险；e2e 未运行。
- 总体判断：实现覆盖 AC-001~AC-005，load/save 对称白名单、enum guard、timeout parse 校验、body/inline 硬上限均正确落地；仅 2 条 minor（DRY 与复杂度），无未解决 critical / important。
- 系统性 follow-up：无
- AC 复验方式：
  - AC-001：`re_verified`。重跑 `npx vitest run tests/unit/config_runtime_validation.test.ts tests/unit/user_config_persistence.test.ts tests/unit/agent_command_dispatcher.test.ts`（57 tests 全过），mock storage 下断言非法 theme/browser_label/log_level/max_body_capture_bytes 不落库、合法 patch 落库。
  - AC-002：`trust_prior`。guard 拒绝路径未在测试中执行，仅源码扫描断言（`expect(section).toMatch(/valid_levels/)` 等）；依赖实施侧证据：源码断言测试 + save 边界行为测试（`save_user_config({ log_level: 'verbose' })` 被滤）。guard 代码本身经逐行阅读确认为拒绝语义正确。
  - AC-003：`re_verified`。`parse_bridge_config` 对非正整数/0/超 `MAX_COMMAND_TIMEOUT_MS` 抛 `Invalid command_timeout_ms`/`Invalid full_data_timeout_ms`，测试覆盖默认值、合法显式值、-1/1.5/0/300001/999999 拒绝（`config_runtime_validation.test.ts:110-135`）。
  - AC-004：`re_verified`。`dispatch_agent_command('capture.start')` 对 `MAX_BODY_CAPTURE_BYTES+1` / `INLINE_TEXT_MAX_BYTES+1` 返回 `{ok:false, error:{code:'INVALID_QUERY'}}` 且 `start_capture` 不被调用；等于上限放行（test:172-208）。
  - AC-005：`re_verified`。15 个新测试全绿；全量 unit 回归 `npx vitest run tests/unit`：183 文件 / 1747 测试全部通过，无回归。
  - coverage = 4 / 5

reviewed_scope: 1375aefaa4653d6e

verdict: PASS

## Round 2 (2026-08-13 21:08 UTC+8)

### 前轮 finding 复核

- **t178_code_f001：已修**。`src/shared/user_config.ts:388` 新增导出 `LOG_LEVELS`（`as const`）单一事实来源，`sanitize_user_config` enum_rules（:410）与 `service_worker.ts:378` guard 共用；`is_valid_log_level`（user_config.ts:390-391）为 `typeof value === 'string' && LOG_LEVELS.includes(value)` 类型守卫，与原硬编码 `valid_levels` 判断逐字等价，非法/合法集合无变化，guard 语义无回归。`service_worker.ts:376-385` set_log_level 分支 `!is_valid_log_level(level)` → `INVALID_QUERY`，合法路径 `Logger.set_level(level)` + `save_user_config({ log_level: level })` 无需 cast，类型正确（`typeof LOG_LEVELS[number]` 与 `types.ts:704` `LogLevel` 结构一致；若未来失步，set_level/save 调用点有编译期报错）。测试已同步：原 `/valid_levels/` 源码断言替换为 `is_valid_log_level` 本体行为断言（合法/非法 4+5 用例，`config_runtime_validation.test.ts:91-101`）+ 接线断言 `/is_valid_log_level\(level\)/`，较 Round 1 补强。
- **t178_code_f002：已修**。`agent_command_dispatcher.ts:283-289` 抽出 `is_within_body_cap` / `is_within_inline_cap`（`is_non_negative_integer(v) && Number(v) <= MAX_*`），与原内联表达式短路语义逐字等价，行为无变化；`has_valid_capture_config_values` 链由 15 项降至 13 项（CC≈13），回到 ≥10 结论段区间，不再达 minor 阈值。残留：谓词内部仍保留 `Number(v)`（类型守卫后冗余），无任何可观测影响，属 cosmetic，不追加 finding。

### 本轮新发现

- 无。

### AC 复验更新

- AC-002 由 `trust_prior` 提升：guard 本体逻辑现经行为测试执行验证（`is_valid_log_level` 纯函数可 import，非法/合法用例全过）；service_worker 内联接线仍为源码断言（`/is_valid_log_level\(level\)/` + `/INVALID_QUERY/` + `/save_user_config\(\{ log_level:/`），其语义已由本体测试与 AC-001 save 边界行为测试覆盖。
- 复验命令：`npx vitest run tests/unit/config_runtime_validation.test.ts tests/unit/user_config_persistence.test.ts tests/unit/agent_command_dispatcher.test.ts tests/unit/i18n_locale_single_source.test.ts tests/unit/dashboard_config_sync.test.ts`（80 tests 全绿，其中新测试文件 19 个）；全量 `npx vitest run tests/unit`：183 文件 / 1751 测试全部通过（较 Round 1 增 4 个 guard 本体测试），无回归。

reviewed_scope: def1b8f6ea775991

verdict: PASS
