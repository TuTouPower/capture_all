# Task review t133（reviewer_focus: 代码）

- task：`t133_html_export_embed_escape`
- spec：`docs/tasks/t133_html_export_embed_escape/spec.md`
- diff_anchor：`d5421189251ad6a703c4d478d84d0e9a2618428b`
- target：`git diff d5421189251ad6a703c4d478d84d0e9a2618428b`
- round：1
- reviewed_at：2026-08-12 14:10 UTC+8

## Findings

### t133_code_f001 - escape_for_html_embed 控制符替换对唯一调用点恒为 no-op，注释归因机制与实际不符

- 严重度：minor
- 锚点：无 AC 违反；代码质量（注释与实现机制不符 + 冗余分支）
- 位置：`src/shared/escape.ts:20-24`（`\r\n\t\f\v` 五条 replace），注释 `src/shared/escape.ts:4-7`
- 问题：`escape_for_html_embed` 唯一调用点为 `exporter.ts:157`，输入恒为 `JSON.stringify` 输出。ECMAScript `QuoteJSONString` 会把字符串值中所有 code point < 0x20 的控制符（含 \n \t \r \f \v \b）序列化为两字符转义序列（如 `\n`），JSON 文本中从不出现裸控制字符。因此 `src/shared/escape.ts:20-24` 的五条 `.replace(/\r|...|g, '\\x')` 对实际输入永不命中——真正防 JS 单引号字面量被击穿的是第 14 行 `\\`→`\\\\` 反斜杠翻倍（JSON 文本内 `\n` 两字符经翻倍成 `\\n`，JS 解析为反斜杠+n 明文，`JSON.parse` 再解出换行）。第 4-7 行注释称"控制符……否则 JS 解析成真实换行/截断字面量"，把实际机制归因到这些不命中的替换上，有误导性，后续维护者可能误删第 14 行翻倍或错误依赖第 20-24 行。此五条替换在非 JSON 裸字符串输入时才会生效，属防御性兜底，非错误。
- 建议：保留 U+2028/U+2029 两条显式替换（JSON.stringify 不转义 U+2028/29，此路径真实命中，且对旧 JS 引擎防行分隔符终结字面量）；对 `\r\n\t\f\v` 五条要么删除（若函数契约限定输入为 JSON 文本），要么保留并修正注释，明确"主机制为反斜杠翻倍，这些替换仅在裸控制符输入时兜底"。

## 结论

- 前轮 finding 复核：Round 1，无
- 本轮新发现：1 条（均为 minor，无 blocking）
- 未进表的提示：
  - 文件过大：无。`src/shared/escape.ts` 34 行、`tests/unit/exporter.test.ts` 289 行，均远低于阈值（实现 400/800、测试 600/1200）。
  - 圈复杂度：无。`escape_for_html_embed` 为 replace 链，CC≈1。
  - 范围外观察（不构成 finding）：`tests/unit/exporter.test.ts:186` 的 `extract_embedded_json` 用正则 `/JSON\.parse\('([\s\S]*?)'\);/` 非贪婪截断，若导出数据中出现 `'` 紧跟 `);` 的序列（如数据 `x');y`），转义后的 `\'` 会令正则提前终止、回灌解析失败。当前 fixture 不含该模式，生产路径（JS 引擎正确解析 `\'`）不受影响；属测试 helper 边界限制，归 test reviewer 职责。

### AC 复验方式

- AC-001：`re_verified`。静态追踪 `capture_id="it's"` 全链：JSON 文本内裸 `'` → `'`→`\'` 转义 → 嵌入 `JSON.parse('...it\'s...')` → JS 引擎 `\'`→`'` → JSON.parse 得完整数据；测试断言 `parsed.capture.capture_id` toBe `"it's"`（`exporter.test.ts:200`）。注：未实际执行测试套件（审查被限只读、禁副作用命令），证据为代码与断言级静态核验。
- AC-002：`re_verified`。静态追踪换行/制表：JSON.stringify 将裸换行/制表序列化为 `\n`/`\t` 两字符 → 第 14 行翻倍为 `\\n`/`\\t` → JS 解析回 `\n`/`\t` → JSON.parse 解出真实换行/制表，断言 toBe `'line1\nline2\tend'`（`exporter.test.ts:211`）成立。
- AC-003：`re_verified`。既有 `escape.test.ts:6-11` 断言仍成立（`</script>`→`<\/script>`，`not.toContain('</script>')` 在翻倍/引号转义后不受影响）；新增回灌测试同时断言 `toContain('\\u003c\\/script\\u003e')` 且往返数据完整（`exporter.test.ts:222-225`）。HTML 中 `<` 全量转义 `<`，script 闭合标签无法以原文出现，安全语义不回退。
- AC-004：`re_verified`。`extract_embedded_json` helper（`exporter.test.ts:185-190`）对生成 HTML 提取内嵌 JSON、还原 JS 字面量转义并 `JSON.parse` 回灌，三条 AC 用例均走该路径。还原顺序 `\'` 先于 `\\` 经核验对含反斜杠+引号组合的数据亦正确。

coverage = 4 / 4

- 总体判断：生产实现正确，AC 全覆盖，测试真实触达生产转义路径；唯一 finding 为注释误导性 minor，不阻断。
- 系统性 follow-up：无

reviewed_scope: 12da547b825906c4

verdict: PASS

## Round 2 (2026-08-12 14:20 UTC+8)

### 前轮 finding 复核

- **t133_code_f001 已消除**：以 `git diff d5421189251ad6a703c4d478d84d0e9a2618428b` 为准，`src/shared/escape.ts` 已删除 `\r\n\t\f\v` 五条对 JSON.stringify 输入恒为 no-op 的替换，现仅保留三类真实命中处理（`\\` 翻倍、`'` 转义、U+2028/29），与 f001 建议一致；注释同步重写，正确归因到「反斜杠翻倍为主机制」，误导性消除。转义链顺序逐一核验无回归：`\` 翻倍先于 `'`（`\\'` 组合往返正确）、`</script>` 加固先于 `<` 全量转义（产物 `<\\/script>` 与 AC-003 断言一致）、U+2028/29 用 `new RegExp` 构造且不干扰 ` ` 字面文本。JSON.stringify 对 `\b\v\f` 亦输出两字符转义，翻倍后 JS/JSON 双层解回正确，无漏转义。
- 测试侧同批改进（归 test 轴，仅确认与 code 无冲突）：`extract_embedded_json` 从手工 unescape 改为 `new Function` 走真实 JS 字符串字面量语义，pre-fix 缺陷（`'`/`\n` 未转义）会在构造时抛 SyntaxError 而非被宽恕式解码吞掉，回归捕获更严；`new Function` 注入面核验安全——`'` 全量转义、`\` 翻倍，无法逃出 `return '...'` 字面量。

### 本轮新发现

- 0 条。

### 未进表的提示

- `tests/unit/exporter.test.ts:186` `extract_embedded_json` 的正则 `/JSON\.parse\('([\s\S]*?)'\);/` 非贪婪截断边界仍存在：数据含 `');` 序列时（转义为 `\');`）正则会提前终止。属测试 helper 限制，生产路径（JS 引擎正确解析 `\'`）不受影响；归 test 轴职责，未在本 code 报告列 finding。

### AC 复验方式（Round 2）

- AC-001/002/003/004：`re_verified`（复核不变）。删除的 5 条控制符替换对 `JSON.stringify` 输入本为 no-op，escape 行为语义与 Round 1 复验一致，四条 AC 的实现与测试断言均未回退。

coverage = 4 / 4

- 总体判断：f001 修复彻底且无新 code 轴问题，实现与测试均无 blocking；本报告唯一 finding（minor）已消除。
- 系统性 follow-up：无

reviewed_scope: 448ddce8adca6072

verdict: PASS
