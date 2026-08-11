# Task review t113（reviewer_focus: 测试）

- task：`t113_logger_url_boundary_detection`
- spec：`docs/tasks/t113_logger_url_boundary_detection/spec.md`
- diff_anchor：`8b794bc9c218d63936c0957506654b8a9f3f5068`
- target：`git diff 8b794bc9c218d63936c0957506654b8a9f3f5068`
- round：1
- reviewed_at：2026-08-11 12:21 UTC+8

reviewed_scope: 71bd02274bd37989

## 审阅范围与方法

- 仓库根 `git rev-parse --show-toplevel` = `/home/karon/karson_ubuntu/capture_all_t113`，与 task 目录同仓。
- diff 内测试改动：仅新增 `tests/unit/t113_logger_url_boundary.test.ts`（60 行，13 用例：5 负例 + 8 正例）；无既有测试被修改/删除。
- 复验执行：
  - `npx vitest run tests/unit/t113_logger_url_boundary.test.ts` → 13 passed。
  - 直接调用生产 `sanitize_log_value` 逐 case 复核真实输出（见 AC 复验小节证据），确认断言非巧合通过。

## Findings

### t113_test_f001 - 对象形态负例未断言逐字保留，细节被吞/置空仍可绿

- 严重度：minor
- 锚点：AC-001「message、嵌套 details 与 Error 文本中的同类三元形态均不被 [REDACTED] 改写」；spec 测试策略「负例断言三元文本逐字保留」
- 位置：`tests/unit/t113_logger_url_boundary.test.ts:52-53`（it.each 负例块）
- 问题：`三元嵌套 details`（`{ detail: 'cond?token=x:y' }`）与 `三元 Error message`（`{ message: 'Error: got cond?token=x:y in line 3' }`）两个对象用例只断言 `contains_redacted(out)` 为 false。若实现把嵌套对象整体丢弃 / 置空 / 返回 `undefined`，断言仍绿，未验证「逐字保留」。字符串形态 3 例（三元 message / 可选链 / 无斜杠相对路径）有 `expect(out).toBe(input)` 强断言，且与对象用例走同一 `sanitize_string` 路径，故实际误改会被字符串用例抓住——不构成 AC 假绿，仅对象路径缺少原文保留证据。
- 建议：对象用例追加原文保留断言，如 `expect(JSON.stringify(out)).toContain('cond?token=x:y')`。

### t113_test_f002 - Error 实例路径（instanceof Error 分支）未被直接触达

- 严重度：minor
- 锚点：AC-001「Error 文本中的同类三元形态均不被 [REDACTED] 改写」
- 位置：`tests/unit/t113_logger_url_boundary.test.ts:30`（`三元 Error message` 用例）
- 问题：用例以普通对象 `{ message: ... }` 模拟 Error，走 `sanitize_value` 的 Object.entries 递归分支；生产 `value instanceof Error` 分支（logger.ts:50-57，name/message/stack 三条字符串分别过 `sanitize_string`）未被覆盖。当前实现中 Error.message 与普通字符串同函数处理，等价性明显，不构成误改风险；但「Error 文本」对应的真实分支无任何用例。
- 建议：补 `new Error('cond?token=x:y')` 用例（顺带覆盖 stack 走 `sanitize_string` 的路径）。

### t113_test_f003 - lookbehind 边界分支覆盖不全，逗号用例语义偏差

- 严重度：minor
- 锚点：AC-002 / AC-003 正例边界；spec 未知契约清单 lookbehind `(?<=^|[\s([,<"'])`
- 位置：`tests/unit/t113_logger_url_boundary.test.ts:37-45`（正例表）
- 问题：lookbehind 字符类 `[\s([,<"']` 与 `^` 共 7 个边界分支，测试只覆盖了空白（正例 2/3）、`(`（正例 4）。`^`（行首）、`[`、`,`（作为前置边界，如 `list:,/a?token=x`）、`<`、`"`、`'` 无用例。另：`逗号分隔 /path?query` 用例输入 `list: /a?token=SECRET, /b` 中逗号位于匹配段内（URL 字符集 `[^\s"'<>`)]` 含逗号，被吞入段后被 redact 丢弃），实际验证的是「列表上下文中 path-query 被脱敏」，并非「逗号作为前置边界」。当前实现经实测该场景脱敏正确（输出 `list: /a?token=[REDACTED] /b`），断言有效，无假绿。
- 建议：补充行首与引号/逗号前置边界用例（如 `?token=x` 置于串首、`"path?token=x"`、`list:,/a?token=x`）。

## 结论

- 前轮 finding 复核：无（round 1）
- 改测方向复核：无——diff 未修改任何既有测试，仅新增独立测试文件，无「迁就实现」改测。
- 本轮新发现：3 条（均 minor）
- 未进表的提示：
  - 「逗号分隔」用例实测输出为 `list: /a?token=[REDACTED] /b`（逗号被 URL 字符集吞入并随脱敏丢弃）。逗号消失属生产扫描行为，AC 未约束分隔符保留，非测试缺陷；若视为问题属实现侧（code review 范畴），不在本报告 finding 表。
  - 正例断言组合（`REDACTED` 出现 + `SECRET`/`QUJDRA==`/`abc:def` 不残留）理论上无法区分「全值脱敏」与「半脱敏」输出（如 `token=abc:[REDACTED]`）；当前实现为全值替换（实测输出 `token=%5BREDACTED%5D`），非实际风险，仅作未来断言加固方向。
  - 生产实现细节：绝对 URL 分支经 `new URL` 序列化，`[REDACTED]` 被 percent-encode 为 `%5BREDACTED%5D`；测试 `includes('REDACTED')` 仍命中，无依赖方括号的脆弱断言。
- 总体判断：13 用例直接触达生产 `sanitize_log_value`，负例有 `toBe` 逐字保留强断言，正例双断言（占位符存在 + 敏感明文不残留），AC-001~003 覆盖完整，无危险模式命中，无 blocking finding；仅 3 条 minor 增强建议。PASS。
- AC 复验方式：
  - AC-001：`re_verified` — 实测 `sanitize_log_value('branch result: cond?token=x:y')` / `'value user?.token missing'` / `'open file?token=SECRET now'` 均原样返回；嵌套对象输出保留原文；vitest 13/13 绿。
  - AC-002：`re_verified` — 实测绝对 URL → `token=%5BREDACTED%5D`、`?token=SECRET` → `?token=[REDACTED]`、`/login?token=SECRET` → `/login?token=[REDACTED]`，敏感值消失、占位符保留。
  - AC-003：`re_verified` — 实测 `token=abc:def` → `token=%5BREDACTED%5D`、data URL/base64 value 与 `QUJDRA==` padding 均被全值替换，明文不残留断言 + 直接调用双重确认。
  - coverage = 3/3
- 系统性 follow-up：无

verdict: PASS

## Round 2 (2026-08-11 12:39 UTC+8)

- 审阅范围：`git diff 8b794bc9c218d63936c0957506654b8a9f3f5068` 相对当前工作区（测试文件由 60 行 13 用例扩为 84 行 23 用例）。复验执行：`npx vitest run tests/unit/t113_logger_url_boundary.test.ts` → 23 passed。
- 危险模式扫描：无命中——无恒真/弱化/注释断言、无删 expect、无 `.skip`/`.only`、无 `@ts-ignore`/eslint-disable、无 mock、无 timeout 掩盖；负例块的 `if (typeof input === 'string') … else …` 两分支均有断言（`toBe` / `toEqual` 逐字），非条件跳过。

reviewed_scope: 42461545c8f7f94d

### 前轮 finding 复核

- **t113_test_f001（对象负例逐字保留）— 已修**：`tests/unit/t113_logger_url_boundary.test.ts:60-64`，对象形态（`三元嵌套 details` / `三元 Error message`）由仅查 `contains_redacted` 改为 `expect(out).toEqual(input)` 逐字断言；实现把对象吞掉 / 置空 / 返回 undefined 均会使断言失败，不再假绿。字符串形态保持 `toBe` 逐字。
- **t113_test_f002（Error 实例分支未直触达）— 已修**：`tests/unit/t113_logger_url_boundary.test.ts:67-73` 新增独立 it 用例，以 `{ error: new Error('Error: got cond?token=x:y in line 3') }` 输入，直触达生产 `value instanceof Error` 分支（logger.ts:50-57）；`out.error.message` `toBe` 逐字、`out.error.stack` `toContain('cond?token=x:y')`（stack 含环境信息，`toContain` 有正当理由，非弱化）。message/stack 均走 `sanitize_string` 的路径已被覆盖。
- **t113_test_f003（lookbehind 边界分支覆盖）— 基本已修，一处未完全落实**：行首 path/bare（`^`）、等号前置 path/bare（`=`）、方括号（`[`）、尖括号（`<`）、双引号（`"`）、单引号（`'`）边界用例均已补齐；唯逗号前置分支（如 `list:,/a?token=x`）仍无直接用例。处置表 rationale 成立：`,` 与 `[`/`<`/`"`/`'` 同属 lookbehind 字符类成员，机制相同，缺失一分支 direct case 属覆盖扩展建议（minor），不阻断。原「逗号分隔」用例保留，验证的是列表上下文 path-query 脱敏（Round 1 已述），语义无变化。

### 结论

- 前轮 finding 复核：见上（f001/f002 已修，f003 基本已修、逗号前置分支缺直接用例属 minor 扩展）。
- 改测方向复核：无——相对 8b794bc9 的测试改动全部为新增用例，无「迁就实现」改测。
- 本轮新发现：0 条。
- 未进表的提示：lookbehind 字符类仅 `,` 分支无直接前置用例；正例双断言（占位符出现 + 敏感明文 `SECRET`/`QUJDRA==`/`abc:def` 不残留）无法区分「全值替换」与「半脱敏」输出，当前实现为全值替换（实测 `token=%5BREDACTED%5D`），非实际风险。
- 总体判断：Round 1 三条 minor 均按建议落实，23 用例直接触达生产 `sanitize_log_value`，负例逐字保留强断言覆盖字符串/对象/Error 实例三形态，正例覆盖 AC-002/003 全部脱敏形态与 6/7 lookbehind 边界分支，23/23 通过，无危险模式命中，无 blocking。PASS。
- AC 复验方式：
  - AC-001：`re_verified` — 负例 5 例（三元 message/嵌套 details/Error message 对象/可选链/无斜杠相对路径）字符串 `toBe`、对象 `toEqual` 逐字；Error 实例用例 message `toBe` + stack `toContain`；vitest 23/23 绿。
  - AC-002：`re_verified` — 绝对 URL/独立 `?query`/`/path?...` 及行首、等号、括号、方括号、尖括号、引号前置各形态正例双断言，占位符存在且 `SECRET` 不残留。
  - AC-003：`re_verified` — 合法冒号 query（`abc:def` 不残留）、data URL/base64（`QUJDRA==` 不残留）、`=` padding 正例双断言。
  - coverage = 3/3
- 系统性 follow-up：无

verdict: PASS
