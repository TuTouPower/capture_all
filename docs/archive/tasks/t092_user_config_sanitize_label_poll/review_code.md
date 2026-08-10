# Task review t092（reviewer_focus: 代码）

- task：`t092_user_config_sanitize_label_poll`
- spec：`docs/tasks/t092_user_config_sanitize_label_poll/spec.md`
- diff_anchor：`1b99efb7d80a355306e46493f80036e237b56c0d`
- target：`git diff 1b99efb7d80a355306e46493f80036e237b56c0d`
- round：1
- reviewed_at：2026-08-11 02:01 UTC+8

reviewed_scope: 6922f3c572f38055

## Findings

### t092_code_f001 - sanitize_user_config 圈复杂度已超 15 阈值且本 task 继续新增分支

- 严重度：minor
- 锚点：非 AC 违反，属「圈复杂度标准」≥15 且本 task 增加分支的触发条件
- 位置：`src/shared/user_config.ts:379-422`（`sanitize_user_config`）
- 问题：手算近似 McCabe ≈ 29（基数 1 + 3 个 `for` + 约 10 个 `if` + 多路 `||`/`&&` 短路，含既有字段校验）。本 task 新增 `browser_label` 与 `agent_bridge_poll_interval_ms` 两个分支（poll 条件含 3 个 `&&`），在已超阈值函数上继续加分支。函数结构扁平、无嵌套、无漏分支，未观察到可观测缺陷，故不 blocking。
- 建议：`browser_label` 可并入既有 `str_keys` 表驱动数组；poll 区间校验可抽为带 validator 的表条目或独立 helper（如 `is_valid_poll_interval(v)`），降低单函数分支密度。非阻塞，可由 implementer 决定采纳或遗留。

## 结论

- 前轮 finding 复核：本轮 round 1，无。
- 本轮新发现：1 条（均 minor，无 critical / important）。
- 未进表的提示：
  - 文件过大：`src/shared/user_config.ts` 共 454 行（≥400 阈值），本 task 净增约 9 行。体量大头为既有 `IANA_TO_OFFSET` 时区表（约 350 行数据），逻辑段仅 ~80 行；未因文件大直接产生缺陷，故不进 finding 表，仅记录。`src/shared/agent_bridge_config.ts` 86 行、`tests/unit/user_config_persistence.test.ts` 105 行，均未超阈值。
  - 范围外观察：`sanitize_user_config` 对 `browser_label` 不做 trim，而 `normalize_agent_bridge_config` 使用前 trim；两者职责不同（持久化校验 vs 运行时归一），spec 未要求持久化 trim，非缺陷，不处理。
- 总体判断：实现精准命中 spec 范围（白名单新增两字段、poll 区间与 agent_bridge_config 共享常量、partial save 不抹字段），测试真实触达 AC 行为，全量测试 105 文件 1162 例通过。仅 1 条 minor，无未解决 blocker，判 PASS。

### AC 复验方式

- AC-001：`re_verified` — 独立运行 `npx vitest run tests/unit/user_config_persistence.test.ts` 通过；读码确认 `load_user_config` → `sanitize_user_config` 对合法 string label 与 [250, 300000] 内整数 poll 均拷贝。
- AC-002：`re_verified` — 测试「仅保存不含 label/poll 的 partial 后仍保留原值」通过；读码确认 `save_user_config` 先 `load_user_config()`（已含 label/poll）再合并 patch 写回，未抹字段。无修复前该测试会失败（旧 sanitize 不拷贝 label/poll）。
- AC-003：`re_verified` — 测试覆盖非法 poll（100 低于下限、999999 高于上限、12.5 非整数）与非法 label（42 非 string）均回退默认；读码确认校验条件（typeof number + `Number.isInteger` + 区间边界）与 agent_bridge_config 的 [250, 300000] 一致，非 string label 回退默认空串。

`coverage = 3 / 3`

- 系统性 follow-up：无。

verdict: PASS
