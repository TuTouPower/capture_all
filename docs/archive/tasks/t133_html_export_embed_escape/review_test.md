# Task review t133（reviewer_focus: 测试）

- task：`t133_html_export_embed_escape`
- spec：`docs/tasks/t133_html_export_embed_escape/spec.md`
- diff_anchor：`d5421189251ad6a703c4d478d84d0e9a2618428b`
- target：`git diff d5421189251ad6a703c4d478d84d0e9a2618428b`
- round：1
- reviewed_at：2026-08-12 14:17 UTC+8

## Findings

### t133_test_f001 - extract_embedded_json 为宽容平行解码，AC-001/002 对本次修复的回归呈假绿

- 严重度：important
- 锚点：AC-001、AC-002（及 AC-004 回灌辅助函数本身）
- 位置：`tests/unit/exporter.test.ts:185-190`（`extract_embedded_json`）、`192-212`（AC-001 / AC-002 用例）
- 问题：回灌解码器 `extract_embedded_json` 用「非贪婪正则提取 + 手工 unescape」模拟 JS 字符串字面量解码，但该解码比真实 JS 引擎宽容，无法区分「内嵌 JSON 合法嵌入」与「本 task 修复的击穿回归」。用 node 独立复验（对 pre-fix 转义实现跑同一提取逻辑）：
  - AC-001 pre-fix（无 `'` 转义）：产物 HTML 中 `JSON.parse('{"capture":{"capture_id":"it's"}}')` 是**真实 JS 语法错误**（字面量在 `"it'` 处提前闭合）；但测试正则非贪婪抓取到完整 JSON、unescape 后 `JSON.parse` 成功，断言 `capture_id === "it's"` 通过。
  - AC-002 pre-fix（无反斜杠加倍）：产物字面量 `'...\n...'` 经真实 JS 字面量解码会把 `\n` 解码成真实换行，运行时 `JSON.parse` 抛 "bad control character"；但测试把 `\n` 当 JSON 转义处理，`JSON.parse` 成功，断言通过。
  - 即：这两条用例在修复前的缺陷实现下仍是绿色，**不能守住所声称的 AC 行为**（"产物中 JSON.parse 可成功解析"），存在覆盖缺口——AC 看似覆盖、实际未验证嵌入可解析性。
- 建议：解码改走真实 JS 字面量语义，让引擎做解码，替代手工 unescape。最小改法（保留正则提取 m[1]，仅替换解码部分）：
  ```ts
  const literal = new Function("return '" + m[1] + "';")(); // 真实 JS 字符串字面量解码
  return JSON.parse(literal);
  ```
  这样 pre-fix 下 `'"it's"'` 在 Function 构造即抛 SyntaxError、`\n` 解码为真实换行触发 `JSON.parse` 抛错，从而真实捕获本次修复的回归。若担心字面量含 `'` 干扰提取正则，可先验证提取边界（内嵌 JSON 无 `)`，闭合 `')` 唯一）。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无（本轮 Round 1）
- 改测方向复核：无。diff 未修改任何既有测试（`should export capture data as HTML` 等仅作上下文未动），只新增 3 个 `it` 块，无「迁就实现」的改测。
- 本轮新发现：1 条
- 未进表的提示：
  - AC-001 设置了 event text `"it's a test"` fixture 但只断言 capture_id，未断言该字段；capture_id 已覆盖单引号转义，属冗余断言，可补可不补。
  - `extract_embedded_json` 的提取正则对含 `')` 序列的数据会截断（fixture 不含，helper 鲁棒性限制）；若采纳 f001 建议用 `new Function` 解码，建议同时约束提取正则。
  - escape_for_html_embed 新增的 `\f`/`\v`/U+2028/U+2029 转义分支无 fixture（AC-002 仅覆盖 `\n`/`\t`），可作扩展。
- 总体判断：AC-001/002 的回灌测试因解码器宽容而对本次修复的回归呈假绿，测试可信度不足以支撑 AC 覆盖；1 条未解决 important → FAIL。
- 系统性 follow-up：无

### AC 复验披露

- AC-001：re_verified —— node 独立复验：post-fix 产物经真实 JS 字面量解码 + `JSON.parse` 成功，`capture_id === "it's"` 与源一致；pre-fix 产物为真实 JS 语法错误（见 f001）。
- AC-002：re_verified —— node 独立复验：post-fix 产物解码后 `text` 含真实换行/制表且与源一致，`JSON.parse` 成功；pre-fix 产物运行时 `JSON.parse` 抛错（见 f001）。
- AC-003：re_verified —— node 独立复验：产物含转义形式 `<\/script>`（toContain 断言成立），回灌后文本完整为注入串；内嵌 JSON 区域无字面量 `<`。
- AC-004：re_verified —— `extract_embedded_json` 已实现并被 3 用例调用（AC 要求的回灌用例存在）；但其宽容解码致 AC-001/002 假绿，见 f001。

coverage = 4 / 4

reviewed_scope: 12da547b825906c4

verdict: FAIL

## Round 2 (2026-08-12 14:20 UTC+8)

## Findings

本轮无新 finding。

## 结论

- 前轮 finding 复核：
  - `t133_test_f001` —— 已消除。diff 中 `tests/unit/exporter.test.ts:185-191` 的 `extract_embedded_json` 已改为真实 JS 字面量语义解码：`new Function("\"use strict\"; return '${m[1]}';")()` 后 `JSON.parse(decoded)`，不再手工 unescape。node 独立复验：
    - post-fix 三个 AC 产物经该 extract 均 parse 成功且数据完整（`capture_id === "it's"`、`text === 'line1\nline2\tend'`、`text === '</script><script>alert(1)</script>'`）。
    - pre-fix 缺陷实现（缺 `'` 转义 / 缺反斜杠加倍）下该 extract 抛 SyntaxError（AC-001 `Unexpected identifier 's'`、AC-002 `Bad control character`），证明测试能真实捕获本次修复的回归，假绿路径已堵死。
  - 复核以 diff 与代码实测为准，未采信处置表自述。
- 改测方向复核：无。未修改任何既有测试；AC-001/002/003 的 `it` 块语义与 Round 1 一致，仅 helper 解码方式变化，无「迁就实现」改测。
- 本轮新发现：0 条
- 未进表的提示：
  - `extract_embedded_json` 用模板字符串内插 `m[1]`（`return '${m[1]}'`），若被测数据含反引号或 `${` 会致 Function 构造断裂；当前 fixture 均不含且只会抛错（非假绿），属 helper 鲁棒性防御观察，不阻断。
- 总体判断：f001 已按建议修复且经独立复验能捕获回归，无未解决 critical / important → PASS。
- 系统性 follow-up：无

### AC 复验披露（Round 2）

- AC-001 / AC-002 / AC-003 / AC-004：re_verified —— 本轮对修复后 `extract_embedded_json` 用 node 实测（post-fix 三个 AC 产物 parse 成功且数据完整；pre-fix 缺陷下抛 SyntaxError），覆盖方式与断言目标均已核实。

coverage = 4 / 4

reviewed_scope: 448ddce8adca6072

verdict: PASS
