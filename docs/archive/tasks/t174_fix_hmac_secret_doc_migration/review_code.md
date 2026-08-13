# Task review t174（reviewer_focus: 代码）

- task：`t174_fix_hmac_secret_doc_migration`
- spec：`docs/tasks/t174_fix_hmac_secret_doc_migration/spec.md`
- diff_anchor：`8d3b5d53fbb67f9bf43e4f6ebe88d3c4d1af759c`
- target：`git diff 8d3b5d53fbb67f9bf43e4f6ebe88d3c4d1af759c`
- round：1
- reviewed_at：2026-08-13 19:51 UTC+8
reviewed_scope: 58a6fb02a1dff1a4

## Findings

### t174_code_f001 - websocket_capture.ts 残留无条件「页面脚本无法读取」注释，违反 AC-004

- 严重度：important
- 锚点：AC-004「代码注释与 ADR 对威胁模型边界的描述一致，不宣称可对抗观察注入过程的页面」
- 位置：`src/extension/content/websocket_capture.ts:35`
- 问题：`websocket_capture.ts:35` 仍保留 t121 原始无条件声明「secret 内联进注入脚本闭包（不写 window），页面脚本无法读取，构造不了合法签名」，无「普通页面」限定。本 task 已把同模式注释在 `content_hmac.ts:3`、`network_hook.ts:24`、`storage_capture.ts:37`、`content_page_script.ts:23-27` 全部修正为「普通页面 + ADR-020 对抗页面排除」，唯独 WebSocket 通道漏改——与 ADR-020（decisions.md:166「对抗性页面可窃取内联 secret，不在防御范围」）不一致，仍宣称可对抗观察注入过程的页面。重复注释模式已造成修复遗漏。新增测试 `tests/unit/hmac_secret_doc_migration.test.ts` AC-004a 用例命名为「三通道注释不宣称…」，但只断言 `network_hook_src` / `storage_src` 两个文件，未覆盖 `websocket_capture.ts`，未捕获此残留。
- 建议：将 `websocket_capture.ts:35` 注释改为与 `network_hook.ts:24` / `storage_capture.ts:37` 一致的表述（加「普通页面」限定 + ADR-020 威胁模型排除，指向 content_page_script.ts 注释）；测试 AC-004a 补 `websocket_capture_src` 的「普通页面」限定断言。

### t174_code_f002 - spec 契约区对 secret 生成器描述与实现不符

- 严重度：minor
- 锚点：AC-001 契约描述的准确性（审阅重点：文档契约与实际实现一致）
- 位置：`docs/specs/content_postmessage_nonce.md`「通道」节
- 问题：spec 写「content 每次 start 生成 per-start secret（`generate_secret()`：优先 `crypto.randomUUID`，http 非 secure context fallback Math.random）与 nonce（同源生成器）」。实际 `content_hmac.ts:113-126` 的 `generate_secret()` 优先 `crypto.getRandomValues`（32 字节 → 64 位 hex），fallback Math.random；nonce 用 `content_nonce.ts:3` 的 `generate_nonce()`（优先 `crypto.randomUUID`）——两生成器并非同源，且 secret 不用 randomUUID。spec 描述会误导后续实现（如按 spec 改用 randomUUID 会改变 secret 格式）。实现本身正确，属 spec 文档描述错误。
- 建议：spec 改为「`generate_secret()`：优先 `crypto.getRandomValues`（32 字节 hex），http 非 secure context fallback Math.random；nonce 用 `generate_nonce()`（优先 `crypto.randomUUID`）」，删除「同源生成器」表述。

## 结论

- 前轮 finding 复核：Round 1，无前轮。
- 本轮新发现：2 条（f001 important，f002 minor）
- 未进表的提示：
  - 文件过大：无（本 task 净增行数：content_page_script.ts +5、content_hmac.ts +0（1 行改注释）、network_hook.ts +0、storage_capture.ts +0、新测试 43 行；均远低于阈值）。
  - 圈复杂度：本 task 未新增/修改函数体，无计量对象。
  - 范围外观察：spec 上下文区测试策略写「断言注入脚本文本不含明文 secret」，实际新测试因走 AC-002 残余风险路径未做该断言、改为断言注释关键词——测试策略文字与实测不符（测试层，归 test reviewer）。
  - s007/d009 结论与 spec「未知契约清单」一致（manifest.json 无 `scripting` 权限、content_page_script.ts:23-27 字面量注入、ADR-020 排除），无偏差。
- AC 复验方式：
  - AC-001：`re_verified`——逐段比对 spec 与实现（generate_nonce/verify_payload/SYNC_HMAC_JS/canonical_payload 存在性、拒绝规则、生命周期，见 f002 例外）。
  - AC-002：`re_verified`——`content_page_script.ts:23-27` 注释明确残余风险与 executeScript 不采纳说明。
  - AC-003：`re_verified`——重跑 `vitest run`：hmac_secret_doc_migration（4）/ content_hmac_vectors（5）/ content_postmessage_nonce（15）/ 三通道 8 文件（61）全部通过。
  - AC-004：`re_verified`——三处通道注释 + preamble + content_hmac 已改；websocket_capture.ts:35 残留违反（f001）。
  - coverage = 4 / 4
- 总体判断：主要文档迁移与三通道注释修正质量良好、测试全绿，但 WebSocket 通道残留无条件抗伪造声明，AC-004 未全部落实，需修复后重审。
- 系统性 follow-up：无

verdict: FAIL

## Round 2 (2026-08-13 19:55 UTC+8)

前轮 finding 复核（以 `git diff 8d3b5d53fbb67f9bf43e4f6ebe88d3c4d1af759c` 与当前代码为准）：

- **t174_code_f001（important，AC-004）— 已消除**：`websocket_capture.ts:35` 注释已改为与 `network_hook.ts:24` / `storage_capture.ts:37` 完全同款「不写 window，普通页面无法读取构造签名；t174：注入脚本文本可被观察注入过程的对抗页面读取（ADR-020 威胁模型排除，见 content_page_script.ts 注释）」，无条件「页面脚本无法读取」声明已消失。测试 `AC-004a` 改为循环覆盖 `[network_hook_src, storage_src, websocket_src]` 三文件（`tests/unit/hmac_secret_doc_migration.test.ts:36`），三通道断言名实相符。
- **t174_code_f002（minor，AC-001）— 已消除**：spec「通道」节已改为「`generate_secret()`：优先 `crypto.getRandomValues` 32B hex，http 非 secure context fallback」与「`generate_nonce()`：优先 `crypto.randomUUID`，fallback Math.random」，删除「同源生成器」表述；与 `content_hmac.ts:113-126`（getRandomValues 32B→64 hex）及 `content_nonce.ts`（randomUUID）实现一致。

本轮新发现：0 条。

复验证据：
- `npx vitest run tests/unit/hmac_secret_doc_migration.test.ts`：4/4 通过。
- `npx tsc --noEmit`：exit 0。
- 三通道注释逐字比对一致（network_hook/storage/websocket 三行同款）；content_hmac.ts:3 与 preamble 注释边界描述与 ADR-020（decisions.md:166）一致。

未进表的提示：无。

总体判断：f001/f002 修复到位且未引入新问题，spec 与实现匹配，三通道注释一致，测试与类型检查全绿。

reviewed_scope: 42e0503890950090

verdict: PASS
