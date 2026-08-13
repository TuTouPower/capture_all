# Task review t174（reviewer_focus: 测试）

- task：`t174_fix_hmac_secret_doc_migration`
- spec：`docs/tasks/t174_fix_hmac_secret_doc_migration/spec.md`
- diff_anchor：`8d3b5d53fbb67f9bf43e4f6ebe88d3c4d1af759c`
- target：`git diff 8d3b5d53fbb67f9bf43e4f6ebe88d3c4d1af759c`
- round：1
- reviewed_at：2026-08-13 19:52 UTC+8

## Findings

### t174_test_f001 - AC-004 覆盖缺口：websocket 通道残留无条件宣称注释，测试仅扫两通道

- 严重度：important
- 锚点：AC-004「代码注释与 ADR 对威胁模型边界的描述一致，不宣称可对抗观察注入过程的页面」——websocket 通道注释与 ADR-020 不一致，测试未覆盖故全绿。
- 位置：`tests/unit/hmac_secret_doc_migration.test.ts:31-37`（AC-004a 只读 `network_hook.ts` + `storage_capture.ts`，漏 `websocket_capture.ts`）；`src/extension/content/websocket_capture.ts:35`
- 问题：`websocket_capture.ts:35` 仍是无条件宣称旧注释「secret 内联进注入脚本闭包（不写 window），页面脚本无法读取，构造不了合法签名。」——无「普通页面」限定、无残余风险说明，正是 t174 要纠正的 SEC-005 旧表述，与 ADR-020（decisions.md `## 020`：对抗性页面可经 DOM hook 窃取内联 secret，该暴露面不在防御范围）及本 diff 已更新的三处注释（content_page_script.ts:23-27 / network_hook.ts:24 / storage_capture.ts:37）直接矛盾。测试 it 标题自称「三通道注释普通页面限定」，断言却只覆盖 network/storage 两通道；把 `websocket_capture.ts` 纳入同一 regex `not.toMatch(/页面脚本无法读取[^（(]*。/)` 会命中（「页面脚本无法读取，构造不了合法签名。」后无括号、以句号结尾）→ 红。当前测试 4/4 全绿，说明 AC-004 在第三通道未闭合而测试无感。该文件不在本 diff 改动内，属实施遗漏 + 测试扫描范围与 AC 范围不一致。
- 建议：AC-004a 增加 `websocket_capture.ts` 扫描（`toContain('普通页面')` + 同一 `not.toMatch`）；并修正 `websocket_capture.ts:35` 注释为「普通页面」限定 + t174 残余风险说明，与 network_hook/storage_capture 措辞一致。另注意 regex 只匹配「页面脚本无法读取」精确短语，防不了「无法读取」「读不到」等变体，建议同时断言「普通页面」限定短语在全部三通道出现。

### t174_test_f002 - AC-001 断言未锚定拒绝规则全类与生命周期/三通道章节

- 严重度：minor
- 锚点：AC-001「包含…拒绝缺失/畸形/失配/过期签名」及「stop/start 生命周期、三通道实现与测试」
- 位置：`tests/unit/hmac_secret_doc_migration.test.ts:14-23`
- 问题：拒绝规则只断言「缺失签名」「nonce 过期」两个短语，AC-001 明确列出的「畸形签名」「签名不匹配」未锚定；「生命周期」「相关实现」章节（stop/start 与三通道实现/测试要求）也未断言。spec 当前实际内容含全部要素（「拒绝规则」段、`## 生命周期`、`## 相关实现`），非假行为，属断言可更全——若实现删掉「畸形签名 / 签名不匹配」或生命周期章节，测试仍绿。
- 建议：补 `toContain('畸形签名')`、`toContain('签名不匹配')`，并锚定 `toContain('生命周期')` / `toContain('相关实现')`（或 `page_script_reinstall_guard` 等实现引用）。

## 结论

- 前轮 finding 复核：Round 1，无
- 改测方向复核：无。diff 无既有测试改动（仅新增 `hmac_secret_doc_migration.test.ts` 一个测试文件）；`spec.md` 仅「未知契约清单」条目由 `UNVERIFIED-SPIKE` 改为 spike/finding 核实结论，AC 措辞未动，无「迁就实现」改测。
- 本轮新发现：2 条（f001 important、f002 minor）
- 未进表的提示：
  - `content_hmac.ts:2-3` 注释的「普通页面；对抗页面可读 secret，ADR-020」未被任何断言守护（AC-004a 只扫两通道文件 + preamble）。若该文件注释回退为无条件宣称，测试无感；可并入 f001 的扫描扩展（范围外，未单列）。
  - spec「canonical payload」定义为「关键字段（各通道按实现）的规范化序列」，未给具体序列——若 spec 要求精确可验证，属 spec 内容质量（非测试职责），可另议。
- 总体判断：AC-001/002 断言与 spec/注释实际文本逐一吻合、代入旧实现均红，AC-003 由既有 HMAC/nonce 测试回归（实跑全绿）；但 AC-004 测试声称三通道只扫两通道，websocket 通道残留无条件宣称注释（`websocket_capture.ts:35`），AC-004 未闭合而测试仍 PASS，存在 blocking finding。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`——断言 6 个短语逐条与 `docs/specs/content_postmessage_nonce.md` 现文核对存在（combined 契约/canonical payload/拒绝规则/非 window 暴露），且 anchor 版旧 spec 无任一短语（代入旧实现红）。
- AC-002：`re_verified`——`content_page_script.ts:23-27` 注释含「残余风险」「ADR-020」「对抗页面」；anchor 版该处无残余风险注释（代入旧实现红）。
- AC-003：`re_verified`——实跑 `npx vitest run hmac_secret_doc_migration content_hmac_vectors content_postmessage_nonce`：24 用例全绿（新测试 4 + 向量 5 + nonce 15）；diff 无测试删除，`content_hmac.ts` 仅注释行改动，无逻辑变更。
- AC-004：`re_verified`（不通过）——network_hook/storage_capture 注释已「普通页面」限定且无「页面脚本无法读取」宣称，与 ADR-020（decisions.md `## 020`「威胁模型边界」段）一致；但 `websocket_capture.ts:35` 残留无条件宣称 → AC-004 第三通道未闭合（f001）。ADR-020 编号存在性已核实：decisions.md `## 020 content 采集认证升级为 per-message HMAC`。

coverage = 4 / 4

reviewed_scope: 58a6fb02a1dff1a4

verdict: FAIL

## Round 2 (2026-08-13 19:54 UTC+8)

### 前轮 finding 复核（以 diff 为准）

- **t174_test_f001（important）→ 已消除**。AC-004a 改为三通道循环（`tests/unit/hmac_secret_doc_migration.test.ts:36-39`：`for (const src of [network_hook_src, storage_src, websocket_src])`，逐一断言 `toContain('普通页面')` + `not.toMatch(/页面脚本无法读取[^（(]*。/)`）；生产侧 `src/extension/content/websocket_capture.ts:35` 注释已修正为「普通页面无法读取构造签名」+ t174 残余风险说明（ADR-020 威胁模型排除），与 network_hook/storage_capture 措辞一致。代入旧实现验证：旧 websocket 注释「页面脚本无法读取，构造不了合法签名。」命中 regex（后无括号、句号结尾）且无「普通页面」→ 两项断言均红。AC-004 三通道闭合。
- **t174_test_f002（minor）→ 已消除**。`hmac_secret_doc_migration.test.ts:21-22` 补 `toContain('畸形签名')`、`toContain('签名不匹配')`，与 spec「拒绝规则」段「缺失签名 / 畸形签名 / 签名不匹配 / nonce 过期」逐一吻合。AC-001 拒绝规则四类全锚定。
- 危险模式扫描（本轮新增代码）：三通道 for 循环数组为固定三元素常量，非运行时条件跳过；无恒真断言 / skip / only / ts-ignore / 弱化断言，无新命中。

### 结论

- 前轮 finding 复核：f001、f002 均以 diff 核实消除
- 改测方向复核：无（仍仅新增测试文件，无既有测试改动）
- 本轮新发现：0 条
- 未进表提示：`content_hmac.ts:2-3` 注释的「普通页面；对抗页面可读 secret，ADR-020」不在三通道循环扫描范围内（Round 1 已提示，维持范围外，非阻断）
- 总体判断：f001/f002 修复到位，AC-001~004 覆盖闭合；实跑新测试 4 + 既有 HMAC/nonce 20 用例全绿（AC-003 回归通过）。无未解决 critical / important。
- 系统性 follow-up：无

### AC 复验方式（Round 2）

- AC-001：`re_verified`——断言 8 短语与 spec 现文逐一核对存在（含新增「畸形签名」「签名不匹配」），实跑通过。
- AC-002：`re_verified`——Round 1 已验证，无新改动。
- AC-003：`re_verified`——`npx vitest run hmac_secret_doc_migration content_hmac_vectors content_postmessage_nonce` 24/24 绿；diff 无测试删除，content_hmac.ts 仅注释行。
- AC-004：`re_verified`——三通道循环扫描 + websocket_capture.ts:35 注释修正，代入旧注释红；与 ADR-020（decisions.md `## 020`）一致。

coverage = 4 / 4

reviewed_scope: 42e0503890950090

verdict: PASS
