# Task review t118（reviewer_focus: 测试）

- task：`t118_sanitize_user_config_complexity`
- spec：`docs/tasks/t118_sanitize_user_config_complexity/spec.md`
- diff_anchor：`5fdab14a9618a2501363aef1f6329bd32a3906ed`
- target：`git diff 5fdab14a9618a2501363aef1f6329bd32a3906ed`
- round：1
- reviewed_at：2026-08-11 16:26 UTC+8
reviewed_scope: fec94306898ee900

## Findings

### t118_test_f001 - 表驱动重构的 enum/num 字段路径缺回归锁定

- 严重度：minor
- 锚点：AC-002 覆盖扩展（不违反 AC 证据要求；按「可以再加一个 case」标 minor，不阻断）
- 位置：`src/shared/user_config.ts:397-423`（enum_rules / num_rules / str_keys），对照 `tests/unit/user_config_persistence.test.ts` 现有断言范围
- 问题：重构把 6 个 enum 字段（mouse_precision / keyboard_capture_mode / theme / locale / detail_time_display_mode / log_level）、3 个 num 字段（max_body_capture_bytes / inline_text_max_bytes / log_max_size_mb）与 str_keys 全表移入规则表。现有测试经 `sanitize_user_config` 实际锁定的字段只有 browser_label（str 表）、theme（enum 表，仅 'dark' 一个值，经 save/load 往返）与 poll 区间。规则表内白名单笔误（如 `'clicks_scroll_drag'` 拼错、locale 白名单漏值）不会被任何测试捕获——其余字段读不到该 bug。这是重构风险的主要集中面。
- 建议：补一条集成型 case：seed 含全部 enum/num/str 合法值 + 非法的 raw，`load_user_config` 后逐字段断言合法值保留、非法值回退默认（如 `expect(cfg.mouse_precision).toBe('clicks')`、`expect(cfg.log_max_size_mb).toBe(1)`）。单条 case 即可整体锁定规则表。纯覆盖扩展，不阻断。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：不适用（Round 1）
- 改测方向复核：无。diff 未改动任何既有测试（`git diff 5fdab14a9618a2501363aef1f6329bd32a3906ed --name-only` = `docs/tasks/t118_sanitize_user_config_complexity/task.md`（front matter）+ `src/shared/user_config.ts`），不存在「让断言迁就实现」的改测
- 本轮新发现：1 条（t118_test_f001，minor）
- 未进表的提示：
  - AC-001 无自动回归防线：spec 已声明圈复杂度不便自动断言（合理）。可选的长期方向是引入 eslint `complexity` 规则或脚本度量，防未来再次超阈值；非本 task 要求。
  - e2e 层 `tests/e2e/e2e-logging.spec.ts:308-388` 经 dashboard 输入 `log_max_size_mb` 并验证 trim 行为，属更高层间接锁定，但未断言非法值回退默认；无需处理。
- 总体判断：纯重构 diff（生产代码 1 文件 + task.md front matter），无测试改动；AC-002 列明的全部证据（browser_label 保留、poll 区间边界、非法值回退、NaN/Infinity 拒绝）均有既有测试且实测全绿；AC-001 静态度量达标；仅 1 条 minor 覆盖扩展建议，不阻断
- 系统性 follow-up：无

### AC 复验方式

- AC-001（圈复杂度 ≤ 15）：`re_verified` — 独立手算重构后 `sanitize_user_config` McCabe 复杂度：不含短路运算符约 12（1 个 `||` + 4 个 `for` + 6 个 `if`），最严口径（`&&`/`||` 各计 1 分支）为 15，均 ≤ 15；`npx tsc --noEmit` 通过（exit 0）。
- AC-002（校验行为不变）：`re_verified` — 重跑 `npx vitest run tests/unit/user_config_persistence.test.ts`：10/10 通过（browser_label 保留 2 条、poll 下边界 250 / 上边界 300000 / 越界 100 与 999999 / 非整数 12.5 / NaN / Infinity 回退默认、非 string browser_label 回退默认）；并逐行比对 diff 各改写路径语义等价：enum 由 `===` 链改为 `includes`（SameValueZero，对原始字符串严格等价）、`log_max_size_mb` 由 `> 0` 改 `>= 1`（整数域等价）、browser_label 并入 str_keys（语义同旧独立分支，均接受任意 string 含空串）、system_time_timezone 仅去冗余 cast（`c` 本就是 `Record<string, unknown>`）、poll 条件原样抽入 `is_valid_poll_interval`。

coverage = 2 / 2

verdict: PASS

## Round 2 (2026-08-11 16:27 UTC+8)

reviewed_scope: f593fb8ae92c7286

本轮 diff（相对同一 anchor）较 Round 1 仅新增 `tests/unit/user_config_persistence.test.ts` 的 AC-004 集成 case（130-192 行）与 task.md 处置表记录；生产代码 `src/shared/user_config.ts` 无新改动。

## Findings

本轮无新 finding。

## 结论

- 前轮 finding 复核：
  - t118_test_f001（minor，Round 1）— **已修**。新增 `tests/unit/user_config_persistence.test.ts:130-192` AC-004 集成 case，经真实接口 `load_user_config()`（chrome.storage.local mock 属系统边界）触达 `sanitize_user_config`，逐字段断言。规则表路径覆盖核对（对照 `user_config.ts:397-429`）：
    - enum_rules 6 字段（mouse_precision / keyboard_capture_mode / theme / locale / detail_time_display_mode / log_level）：legal + illegal 双向全覆盖
    - num_rules 3 字段（max_body_capture_bytes / inline_text_max_bytes / log_max_size_mb）：双向全覆盖
    - str_keys 6 字段（含 browser_label）：双向全覆盖
    - 独立分支 system_time_timezone（'UTC+8' / ''）与 poll（5000 / NaN）：双向覆盖
  - 非恒真核验（危险模式扫描重点）：对照 `constants.ts:46-70` 逐一比对，legal 23 键全部 ≠ 默认值（如 mouse_precision 'full_trajectory'≠'clicks_scroll_drag'、theme 'dark'≠'follow-system'、locale 'zh_CN'≠'en'、log_level 'warn'≠'debug'、poll 5000≠1000、browser_label 'B'≠''、max_body_capture_bytes 1024≠100MB、inline_text_max_bytes 2048≠32KB、6 个 bool 字段 false≠默认 true、system_time_timezone 'UTC+8'≠'browser' 且 ∈ VALID_UTC_OFFSETS 不被 migrate 改写）；illegal 21 键全部 ≠ 默认值。任一字段 sanitize 漏处理或误保留都会断言失败，不存在恒真 / 弱化（断言均为 `toBe` 精确比较）。实测 `npx vitest run tests/unit/user_config_persistence.test.ts` 11/11 通过。
- 改测方向复核：无。本轮只新增 it 块，未修改任何既有测试，无「让断言迁就实现」的改测。
- 本轮新发现：0 条
- 未进表的提示：
  - bool 字段（capture_request_body / capture_response_body）无单独非法值 case：bool_keys 不走规则表（独立 for 循环，`user_config.ts:392-395` 非本轮重构面），且有 4 个同类非法值代表（capture_input_values 'x' / redact_data 1 / export_save_as 'y' / agent_bridge_enabled 1）+ 6 个合法非默认值 case 代表覆盖，不构成缺口。属「可再加 case」级扩展，不阻断。
  - legal 中 6 个 bool 字段均取 false，非恒真依赖当前默认全为 true（`constants.ts:49-62`）；若未来默认值改为 false，该方向断言将退化为恒真。防御性观察，非本 task 问题。
- 总体判断：f001 已修且修复彻底（规则表全字段路径锁定、双向断言非恒真、实测全绿），本轮无新 finding，无未解决 blocker。
- 系统性 follow-up：无

### AC 复验方式

- AC-001（圈复杂度 ≤ 15）：`re_verified` — 生产代码相对 Round 1 审阅时无新增改动（本轮 diff 仅测试文件），重读 `sanitize_user_config`（`user_config.ts:380-432`：1 个 `||` + 3 张规则表 for + 3 个 if + bool for + poll if），Round 1 手算 McCabe ≤ 15 结论仍成立。
- AC-002（配置校验行为不变）：`re_verified` — 本轮重跑 `npx vitest run tests/unit/user_config_persistence.test.ts`：11/11 通过（原 10 条 + 新增 AC-004）；并对 AC-004 逐键核验非恒真与全表覆盖（见前轮 finding 复核）。

coverage = 2 / 2

verdict: PASS
