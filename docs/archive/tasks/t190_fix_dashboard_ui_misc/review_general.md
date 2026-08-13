# Task review t190（reviewer_focus: 通用）

- task：`t190_fix_dashboard_ui_misc`
- spec：`docs/tasks/t190_fix_dashboard_ui_misc/spec.md`
- diff_anchor：`05bba2f67c2a65d53108155d913f39be9c12d6cd`
- target：`git diff 05bba2f67c2a65d53108155d913f39be9c12d6cd`
- round：1
- reviewed_at：2026-08-14 00:37 UTC+8

reviewed_scope: e3d7026459a3a902

## Findings

### t190_gen_f001 - AC-003 加载路径不同步 document.lang，dashboard.html 残留硬编码 lang="zh"

- 严重度：important
- 锚点：AC-003（locale 切换后 document.lang 更新且无残留硬编码字符串）
- 位置：`src/extension/shared/i18n.ts:797-822`（set_locale 同步 vs init_locale 不同步）、`src/extension/dashboard/dashboard.html:2`（`<html lang="zh">`）、`src/extension/popup/popup.html:2`（无 lang）、`tests/unit/dashboard_ui_misc_fixes.test.ts:47-54`（仅测 set_locale 直调）
- 问题：t190 只在 `set_locale` 内同步 `document.documentElement.lang`（i18n.ts:802），但页面加载路径走 `init_locale`（i18n.ts:809-822），其两条分支（storage 命中 / detect_locale 兜底）都直写 `current_locale`，从不触碰 document.lang。配合 dashboard.html 硬编码 `<html lang="zh">`（仓库内唯一 html lang，见 `src/extension/dashboard/dashboard.html:2`）与 popup.html 无 lang 属性，可复现失败场景：用户持久化 `locale: 'en'` → 重开 dashboard → UI 全部英文但 `document.documentElement.lang === 'zh'`（辅助技术按中文朗读、浏览器语言处理错位）。也就是说「切换 locale 后 document.lang 更新」只在切换动作当场生效，重载即失效；AC 目标只实现一半，`lang="zh"` 本身也是残留硬编码。单测只在 jsdom 空 document 上直调 `set_locale`，对加载路径完全无感知。
- 建议：`init_locale` 收口为调用 `set_locale`（或在两条分支末尾同步 `document.documentElement.lang`）；移除 dashboard.html 硬编码 `lang="zh"` 或由 init 覆盖；补一条加载路径断言（预先设 `documentElement.lang='zh'` 后 init_locale 恢复到实际 locale）。

### t190_gen_f002 - Dashboard settings 开关 button 无可访问名称

- 严重度：minor
- 锚点：AC-001（范围措辞「button[aria-pressed] 或 checkbox/switch + label」）
- 位置：`src/extension/dashboard/dashboard_settings.ts:21-24`（sw() 模板），调用点 60-69/81/99
- 问题：`sw()` 渲染 `<button type="button" class="switch" ...><span class="knob"></span></button>`，按钮内只有 knob span 无文本，字段标签（`.field-lbl`，如「采集请求体」）是相邻 span、未通过 `aria-label`/`aria-labelledby` 关联。屏幕阅读器 Tab 聚焦时只宣布「切换按钮 已按下」，无法得知该开关控制什么。AC-001 三个显式可观测行为（Tab 聚焦、Enter/Space 激活、aria-pressed 宣布）均已满足，故不 blocking；但范围里「+ label」的语义意图未落实。
- 建议：sw() 内为 button 补 `aria-label`（用对应字段文案），或将 `.field-lbl` 改为 `<label for>`/`aria-labelledby` 关联。

### t190_gen_f003 - popup 非 ready 态 mcard 恒渲染为可聚焦 button，激活无行为

- 严重度：minor
- 锚点：行为缺陷（AC-001 范围内引入的键盘可达性回归）
- 位置：`src/extension/popup/popup.ts:135`（恒渲染 `<button aria-pressed>`）、`318-327`（handler `if (state !== 'ready') return;`）
- 问题：`metric_grid` 在 `can_toggle=false`（capturing/saved 态）同样输出可聚焦 `<button type="button" aria-pressed>`，但 click handler 以 `state !== 'ready'` 直接 return——Tab 会落到 8 个无行为的死按钮，屏幕阅读器宣布「可按下」却无任何效果。改动前该态是非交互 `<div>`，本 diff 引入该回归。
- 建议：`can_toggle=false` 时改渲染为 span/div（保留视觉），或加 `disabled` 属性（并同步 aria-pressed 处理）。

### t190_gen_f004 - AC-001/002 测试用源码正则扫描，偏离 spec 测试策略声明的 jsdom/mock 行为断言

- 严重度：minor
- 锚点：测试可信（spec 上下文区测试策略：「jsdom 断言焦点/键盘事件与 aria 属性；导出异常用 mock 断言用户可见提示」）
- 位置：`tests/unit/dashboard_ui_misc_fixes.test.ts:13-46`（AC-001/002 用例）
- 问题：实施以 readFileSync 正则扫描源文件替代 jsdom/mock 行为断言（注释声称同 `popup_category_capture_gates` 先例——仓库确有 `config_runtime_validation.test.ts`、`content_log_privacy.test.ts` 等源码扫描先例，且 AC-001 本身标注 [deploy]、键盘操作由人工验证，故不当 blocking）。但代价是行为断言零触达：若 dashboard switch 的 click handler 里 aria-pressed 同步被误删、或 popup 键盘激活链路断裂，现有扫描用例不会失败；AC-002 的 alert 也只见字符串存在性。
- 建议：不强制——要么为 popup/settings 补 jsdom/mock 行为断言（vi.mock chrome），要么在 spec 测试策略中把该两项的断言方式明确为源码扫描，避免与已批准策略继续背离。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：Round 1 无。
- 本轮新发现：4 条（1 important + 3 minor）。
- 未进表的提示：
  - `t('events')` 英文翻译为 'Events'（首字母大写），旧硬编码为小写 "events"，属展示文案微调，非缺陷。
  - popup 最近行 / View All 是原生 `<a>`（Tab 聚焦 + Enter 激活），非开关语义，不在 AC-001 断言目标内，合理。
  - dashboard 日志导出 catch（dashboard_settings.ts:254）仍仅 logger.error 静默——AC-002 针对 capture 导出，日志导出不在本 diff 范围。
  - 全量单测 194 文件 / 1846 用例通过，`npx vitest run tests/unit/` 无回归。

### AC 复验披露

- AC-001：`re_verified`——代码与测试核验：mcard/switch 渲染为 `<button type="button" aria-pressed>`（popup.ts:135、dashboard_settings.ts:23）、dashboard click handler setAttribute 同步（dashboard_settings.ts:196）、popup 重渲染覆盖；键盘操作依赖原生 button 语义，spec 标注的 [deploy] 部分（真实浏览器/a11y 检查）为 `trust_prior`，依赖实施侧浏览器验证证据。
- AC-002：`re_verified`——dashboard_data.ts:161-165 catch 含 `logger.error` + `alert(t('exportFailed'))`，`exportFailed` 在 en/zh 字典均存在（i18n.ts:500/757），`t` 已导入（dashboard_data.ts:22）；对应单测断言通过。
- AC-003：`re_verified`（交互切换路径）——set_locale 设 documentElement.lang（i18n.ts:802），jsdom 单测通过；加载路径不同步见 f001，判定为部分实现。
- AC-004：`re_verified`——ui_strings.test.ts:204-211 指向真实 `src/extension/manifest.json`（文件存在），恒真断言 `toBeLessThanOrEqual(real_hits.length)` 已移除，src/ 门禁用例保持 `toEqual([])`；运行通过。

coverage = 4/4（AC-001 的 [deploy] 键盘部分 trust_prior，非整条 AC 依赖实施侧证据）

- 总体判断：AC-001/002/004 实现与测试可信；AC-003 仅覆盖交互切换路径，加载路径 document.lang 不同步且 dashboard.html 硬编码 lang 残留（f001，important 未解决），需修复后进入下一轮审阅。
- 系统性 follow-up：无（f001 修复属本 task 内下一轮处置，无需新建 task）。

verdict: FAIL

## Round 2 (2026-08-14 00:45 UTC+8)

reviewed_scope: f5ac284e5cf0cdb0

### 前轮 finding 复核

- **t190_gen_f001（important，已修）**：`apply_locale_to_dom` 提取公共函数（i18n.ts:797-807），`set_locale`（i18n.ts:810）与 `init_locale` 两条路径——storage 恢复（i18n.ts:819-821，return 前调用）与自动检测兜底（i18n.ts:826）——均同步 `document.documentElement.lang`；dashboard.html:2 硬编码 `lang="zh"` 已移除（`<html>`）。独立复验：jsdom 无 chrome 环境预置 `documentElement.lang='fr'` 后执行 `init_locale()`，lang 被同步为 en/zh（临时用例通过，未入库）。tsc 通过。
- **t190_gen_f002（minor，已修）**：`sw()` 增加 label 参数渲染 `aria-label="${esc(label)}"`（dashboard_settings.ts:23-26，esc 已导入），6 处调用全部补全（capture_request_body / capture_response_body / capture_input_values / redact_data / export_save_as / agent_bridge_enabled），label 均取 field-lbl 同款 t key，语义一致。测试补充 aria-label 存在性断言。
- **t190_gen_f003（minor，已修）**：`metric_grid` 改为 `if (can_toggle)` 分支渲染 `<button>`（含 aria-pressed），capturing/saved 态走 `<div>`（无 aria-pressed、无 mcard-toggle、无 click handler），键盘死按钮回归消除（popup.ts:135-148）。测试补充 div 分支无 aria-pressed 断言。
- **t190_gen_f004（minor，已修）**：新增 jsdom 行为断言用例——原生 button `tabIndex === 0` 可聚焦、`focus()` 后成为 activeElement、`click()` 触发 handler 并同步 aria-pressed（真实 DOM 行为验证，非恒真断言）；键盘 Enter/Space 标 [deploy]。popup/settings 的源码扫描断言保留并加强（div 分支、aria-label 检查）。测试策略偏离已实质缓解。

### 本轮新发现

0 条。处置过程中未引入新问题：aria_label 经 `esc()` 转义；div 分支 class 结构正确；`apply_locale_to_dom` 自带 try/catch 防非 DOM 环境抛错。

### 验证命令

- `npx tsc --noEmit`：exit 0。
- `npx vitest run tests/unit/dashboard_ui_misc_fixes.test.ts tests/unit/ui_strings.test.ts`：2 文件 / 18 用例通过。
- `npx vitest run tests/unit/`：194 文件 / 1847 用例全部通过（较 Round 1 多 1 个新行为断言用例）。

### 结论

- 前轮 4 条 finding 全部按 diff/代码核实已消除（处置表 status 与实际代码一致），无未解决 critical / important。
- 总体判断：AC-003 加载路径已修复（init 两条路径同步 document.lang + 移除 html 硬编码），AC-001/002/004 保持可信；仅存 minor 级事项均已处置。
- 系统性 follow-up：无。

verdict: PASS
