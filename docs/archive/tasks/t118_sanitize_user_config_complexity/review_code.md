# Task review t118（reviewer_focus: 代码）

- task：`t118_sanitize_user_config_complexity`
- spec：`docs/tasks/t118_sanitize_user_config_complexity/spec.md`
- diff_anchor：`5fdab14a9618a2501363aef1f6329bd32a3906ed`
- target：`git diff 5fdab14a9618a2501363aef1f6329bd32a3906ed`
- round：1
- reviewed_at：2026-08-11 16:20 UTC+8

## Findings

无 finding（round 1 clean review）。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：不适用（round 1）。
- 本轮新发现：0 条
- 未进表的提示：
  - 文件过大：`src/shared/user_config.ts` 共 464 行，超过实现源码 400 行 minor 阈值。其中 351 行（第 11–361 行）为既有 IANA 时区映射数据表与 UTC offset 常量，非本 task 引入，属天然不可拆数据；函数逻辑部分仅约 113 行。本 task 对该文件净增约 10 行（helper 抽取 + 三张规则表），不构成「本 task 继续堆大」。
  - 圈复杂度：重构后 `sanitize_user_config` 手算 McCabe ≈ 12（不含短路运算符）～15（短路 `&&` 计分支的最严口径），均 ≤ 15，达标；`is_valid_poll_interval` ≈ 5。无超阈值项。
  - 范围外观察：无。diff 仅触及 `src/shared/user_config.ts` 与 `docs/tasks/t118_sanitize_user_config_complexity/task.md`（后者为 front matter 状态更新，非代码改动）。
- 总体判断：表驱动重构行为等价，两 AC 均达成，无 blocking 亦无 minor；PASS。
- 系统性 follow-up：无

### AC 复验方式

- AC-001（圈复杂度 ≤ 15）：`re_verified` — 独立手算重构后 `sanitize_user_config` 圈复杂度：基数 1 + 4 个 `for` + 5 个 `if`（bool/enum/num/str 表内 if、timezone if、poll if 按分支计 6 个）≈ 12；最严口径（`&&` 计分支）15，未超阈值。分支数由 27 级 if 链收敛为三张规则表 + helper。
- AC-002（校验行为不变）：`re_verified` — 逐字段语义比对无差异（详见下）；实际运行 `npx vitest run tests/unit/user_config_persistence.test.ts` 10/10 全绿，覆盖 browser_label 保留、poll 下/上边界（250/300000 保留、100/999999/12.5/NaN/Infinity 回退默认）；`npx tsc --noEmit` 通过。
- 语义逐项核对（重构前 vs 重构后）：
  1. bool 字段组：未动。
  2. 枚举白名单 6 项（mouse_precision / keyboard_capture_mode / theme / locale / detail_time_display_mode / log_level）：白名单值与原文一致，`includes` 严格相等比较与逐项 `===` 等价；`as string` 断言运行时安全（number/undefined/object 与 string 不匹配即回退）。
  3. 整数下限组：max_body_capture_bytes / inline_text_max_bytes 下限 0 不变；log_max_size_mb 原 `Number.isInteger(v) && v > 0` 改为 `>= 1`，对整数两式等价（`Number.isInteger` 前置保留，NaN/Infinity 仍被拒绝）。
  4. 字符串组：原 5 项 + browser_label（原独立 `typeof === 'string'` if，语义不变）。
  5. system_time_timezone：`typeof string && length > 0` 不变，仅去掉冗余类型断言（`c` 已是 `Record<string, unknown>`）。
  6. agent_bridge_poll_interval_ms：抽为 `is_valid_poll_interval` helper，条件逐字等价（`typeof number && isInteger && MIN ≤ v ≤ MAX`）。
  7. `agent_bridge_config.ts` 的 `normalize_agent_bridge_config` 为 clamp 语义，与本函数拒绝式校验本就不同，不存在行为分叉。

coverage = 2 / 2

reviewed_scope: fec94306898ee900

verdict: PASS

## Round 2 (2026-08-11 16:30 UTC+8)

reviewed_scope: f593fb8ae92c7286

本轮 diff（相对同一 anchor 5fdab14a9618a2501363aef1f6329bd32a3906ed）较 Round 1 仅新增 `tests/unit/user_config_persistence.test.ts` 的 AC-004 集成 case（130-192 行）与 task.md 处置表；生产代码 `src/shared/user_config.ts` 无新增改动（`git status` 与 Round 1 审阅时 diff 一致）。

## Findings

本轮无新 finding。

## 结论

- 前轮 finding 复核：
  - Round 1 code 路：0 finding，无待复核项。
  - t118_test_f001（test 路 minor，主任务指定本轮 code 路确认）：**已修**。新增 `tests/unit/user_config_persistence.test.ts:130-192` AC-004 集成 case，经真实 `load_user_config()`（chrome.storage mock 属既有系统边界，未 mock 被测逻辑）触达 `sanitize_user_config` 全部规则路径，逐字段 `toBe` 精确断言。独立核验（对照 `constants.ts:46-70` 默认值、`user_config.ts:392-429` 规则路径、`types.ts:664-688` 字段全集）：
    - enum_rules 6 字段：legal 全 6 键 + illegal 全 6 键（`'drag'`/`'ctrl'`/`'blue'`/`'fr'`/`'x'`/`'verbose'`）双向覆盖；表内白名单笔误（locale 漏 `zh_CN`、拼错等）必被 legal 断言捕获。
    - num_rules 3 字段：legal（1024/2048/5）+ illegal（-1/1.5/0）双向覆盖；`log_max_size_mb: 0` 精确锁定 `>=1`（原 `>0`）语义。
    - str_keys 6 字段（含 browser_label）：legal 6 键 + illegal 6 键（42/null 等非 string）双向覆盖。
    - 独立分支：system_time_timezone `'UTC+8'`（∈ VALID_UTC_OFFSETS 不被 migrate 改写）与 `''`；poll 5000（合法区间内）与 NaN。
    - bool_keys 6 字段 legal 全部非默认（false ≠ 默认 true），illegal 覆盖 4/6（缺 capture_request_body / capture_response_body）——bool_keys 为独立 for 循环非规则表（本 task 未重构面），同类拒绝语义已有 4 个代表，不构成缺口。
  - 非恒真核验：legal 23 键逐一 ≠ 默认值（mouse_precision `'full_trajectory'`≠`'clicks_scroll_drag'`、theme `'dark'`≠`'follow-system'`、locale `'zh_CN'`≠`'en'`、log_level `'warn'`≠`'debug'`、poll 5000≠1000、browser_label `'B'`≠`''`、max_body_capture_bytes 1024≠100MB、inline_text_max_bytes 2048≠32KB、6 个 bool 全 false≠true、agent_bridge_url 9999≠17831 等）；illegal 21 键也全部 ≠ 默认值。任一字段 sanitize 漏处理或误保留（含合并时 `{...DEFAULT, ...stored}` 直通）都会断言失败，不存在恒真/弱化。
- 本轮新发现：0 条
- 未进表的提示：
  - 文件过大：`src/shared/user_config.ts` 464 行，其中 351 行（11-361 行）为既有 IANA 时区数据表，天然不可拆；本 task 逻辑净增约 10 行，Round 1 结论不变。`tests/unit/user_config_persistence.test.ts` 193 行，低于测试 600 行阈值。
  - 圈复杂度：生产代码相对 Round 1 无新增分支，`sanitize_user_config` McCabe ≤ 15 结论不变；AC-004 测试为表驱动枚举，业务断言非恒真。
  - 范围外观察：无。本轮生产代码零改动。
- 总体判断：f001 已修（全规则表字段双向锁定、断言非恒真、实测 11/11 全绿），生产代码本轮零改动且 Round 1 已 PASS，无未解决 blocker。
- 系统性 follow-up：无

### AC 复验方式

- AC-001（圈复杂度 ≤ 15）：`re_verified` — 生产代码相对 Round 1 审阅时无新增改动，重读 `sanitize_user_config`（`user_config.ts:387-432`：bool for + 3 张规则表 for + timezone if + poll if），Round 1 手算 McCabe ≈ 12（最严口径含短路 15）≤ 15 仍成立。
- AC-002（配置校验行为不变）：`re_verified` — 本轮重跑 `npx vitest run tests/unit/user_config_persistence.test.ts`：11/11 通过（原 10 条 + AC-004）；AC-004 逐键非恒真与全表覆盖独立核验见前轮 finding 复核。

coverage = 2 / 2

verdict: PASS
