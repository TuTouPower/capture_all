# Task review t108（reviewer_focus: 通用）

- task：`t108_detail_search_preserve_input`
- spec：`docs/tasks/t108_detail_search_preserve_input/spec.md`
- diff_anchor：`3a0c79edb499de35d860e97ec6fbc9ff9765c532`
- target：`git diff 3a0c79edb499de35d860e97ec6fbc9ff9765c532`
- round：1
- reviewed_at：2026-08-11 08:05 UTC+8

reviewed_scope: b858a7a70e529562

## Findings

### t108_gen_f001 - AC-002 无自动化测试覆盖

- 严重度：minor
- 锚点：AC-002；spec「可测试性声明」声明「全部 AC 可自动测试」
- 位置：`tests/unit/detail_search_preserve_input.test.ts:22-43`
- 问题：提交的测试仅覆盖 AC-001（3 个 case：保留、空值、转义），无任何 case 断言 AC-002 的过滤语义（可见列表仅含匹配项）。spec 可测试性声明两 AC 均可自动测试，测试策略也写明「测 dashboard_detail 搜索处理函数」，但 `filtered_events` 的过滤行为无回归测试。这不是功能缺陷——`filtered_events` 未改、仍读 `#dtSearch.value`，value 保留后过滤按构造成立，reviewer 已独立复验（见结论）。缺的是未来过滤逻辑回归时的守护。
- 建议：补一条 AC-002 测试，种子 `set_detail_events` 后经 `render_detail()` 渲染，断言查询串下匹配项存在、非匹配项缺席；或对 `filtered_events` 建立等价可测路径。

### t108_gen_f002 - 手写部分转义，未复用已有 esc 助手

- 严重度：minor
- 锚点：无 AC 违反；复用/一致性
- 位置：`src/extension/dashboard/dashboard_detail.ts:128`
- 问题：value 转义内联手写 `String(...).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')`，仅覆盖 `& " <`。同模块已导入 `esc`（即 `src/shared/escape.ts:13` 的 `escape_html`，转义 `& < > " '`），直接 `esc(value)` 可覆盖同样语义且更严。当前转义对双引号属性上下文安全（`>`、`'` 在 `value="..."` 内无害），reviewer 已验证 `& " <` 顺序正确、DOM 解析回读 round-trip 正确，无 XSS/双重转义问题。属复用一致性建议。
- 建议：改为 `value="${esc(String(...))}"`，删除内联 replace 链，与代码库既有转义口径一致。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
  - 焦点/光标未恢复：整页 `innerHTML` 替换后 `#dtSearch` 被重建，debounce 重绘后输入框失焦，用户需点击回框才能继续输入。AC-001 只要求「至少保留字符串」，spec 风险区已明示该风险并接受回退，故不入 finding。属范围外 UX 观察。
  - value 保留仅在 timeline 标签内成立：切到其它标签再返回会因 `#dtSearch` 已不存在而丢值。非本次回归，也非 AC 范围。
- 总体判断：实现正确。value 保留机制（重绘前读旧 DOM + 属性转义）时序与转义均正确，AC-001/AC-002 行为经独立复验通过；仅有 2 条 minor，无未解决 critical/important，PASS。
- 系统性 follow-up：无

### AC 复验披露

- AC-001：`re_verified`。证据：跑提交单测 `npx vitest run tests/unit/detail_search_preserve_input.test.ts`（3 passed）；另在 `.scratch` 独立验证转义字符串经 jsdom 解析后 `input.value` round-trip 正确（含 `a&b`、`a"b`、`a<b>`、`&quot;`、`<script>` 等输入）。
- AC-002：`re_verified`。证据：在 `.scratch` 独立种子 `set_detail_events` 后经 `render_detail()` 验证——查询 `example.com/home` 时匹配项在场、非匹配项缺席；空查询显示全部；完整「seed value → render → parse → filter」链路 value 保留且过滤生效。

coverage = 2 / 2

verdict: PASS
