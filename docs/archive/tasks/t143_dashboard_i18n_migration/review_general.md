# Task review t143（reviewer_focus: 通用）

- task：`t143_dashboard_i18n_migration`
- spec：`docs/tasks/t143_dashboard_i18n_migration/spec.md`
- diff_anchor：`bfc039ecb2442f767fa09e3376570d68bf6ad2a8`
- target：`git diff bfc039ecb2442f767fa09e3376570d68bf6ad2a8`
- round：1
- reviewed_at：2026-08-12 20:10 UTC+8
- reviewed_scope: 9fce0d8a6d911882

## Findings

### t143_gen_f001 - 设置页语言切换不即时生效，AC-002 实时维度未闭环（既有行为）

- 严重度：minor
- 锚点：AC-002
- 位置：`src/extension/dashboard/dashboard_settings.ts:195`
- 问题：语言下拉 `change` 处理器只调 `set_locale(v)` + `persist({locale})`，之后不触发 `render_shell()` / `render_content()`。当前设置页（正显示的语言下拉、各 label）保持旧 locale 文案，直到用户导航到其他页再返回才按新 locale 重绘。`dashboard.ts` 的 2s 轮询（114-137 行）重渲染仅覆盖 captures/current/exports 三页与采集中的 detail，不含 settings 页，故设置页在切换语言后不会自行刷新。此为迁移前既有行为（本 task 未改 wire 逻辑），非本 task 引入的回归，但按 AC-002「设置语言切换后 dashboard 界面文案随 locale 变化」的字面实时语义，未完全闭环。
- 建议：locale change 成功后调用 `router.render_shell()`（或仅 `render_content()`）实现即时刷新；若判定「需导航才生效」可接受，应在 spec/文档中明确该语义，避免歧义。属 dashboard 小修复，可并入 t154 或单独建 task。

### t143_gen_f002 - zh 文案轻微漂移，超出「纯文案来源替换」范围

- 严重度：minor
- 锚点：行为缺陷（zh 渲染文本与迁移前不一致）
- 位置：`src/extension/dashboard/dashboard_settings.ts:45`、`src/extension/dashboard/dashboard_detail.ts:167`
- 问题：迁移在纯 t() 替换之外改变了 zh 渲染产物：
  1. 语言下拉中文选项「简体中文」→ `t('chinese')`（en/zh 两态该键值均为「中文」），zh 用户看到「中文」而非原「简体中文」；en 态下该选项也显示「中文」（保持原硬编码中文，未随 locale 出英文/拼音）。
  2. 时间线列表标题事件计数由全角括号「（N 个事件）」改为半角「(N 个事件)」（`dashboard_detail.ts:167`），`detail_search_preserve_input.test.ts` 断言随之从 `（1 个事件）` 改为 `(1 个事件)`。非功能回归，但属文本漂移，且测试更新是跟随渲染变化而非语义强化。
- 建议：若要严格保持原 zh 文案，为语言选项新增 zh 专用键（如 `languageChineseFull: '简体中文'`）或在模板保留全角括号；否则将这两处变更视为有意的文本微调并记录在 task.md 处置表。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
  - `src/extension/dashboard/dashboard.html:6` `<title>Capture All — 主面板</title>` 是仍含硬编码中文的渲染产物（浏览器标签页标题），AC-003 guard 只扫 `*.ts` 不覆盖 `.html`。该文件不在本 task「8 文件」范围内，故按范围外观察提示，建议后续随 dashboard.html 国际化一并处理。
  - AC-003 guard 鲁棒性观察（非当前违规）：行尾 `//` 前无空白（如 `x();// 中文`）不会被剥离、产生未来误报；`\blogger\.\w+` 整行跳过可能在未来掩盖同一行内的硬编码中文 UI 文案；块注释状态机只认行首 `/*`。当前 8 个 .ts 文件均无此类行，不影响本次通过。
  - 全量 `vitest run`：137 文件 / 1435 用例全过，另有 1 个非测试错误（`popup_onchanged_race.test.ts` 期间 `app_log_storage.ts` 定时器 flush 泄漏噪音），相关文件均未被本 diff 触碰，属既有噪音，与 t143 无关。
- AC 复验方式：
  - AC-001：`re_verified`。对 `src/extension/dashboard/` 手动 grep 全 CJK 行，残留中文仅存在于注释行、`*.css` 注释与 `dashboard.html` title；6 个被迁移 .ts 渲染代码零硬编码中文。
  - AC-002：`re_verified`。`t()`（`i18n.ts:803-805`）读 `current_locale`；`settings_ui.test.ts` 默认 en、隐私/日志级别用例切 zh 断言中文渲染，两态均覆盖且通过；`detail_search_preserve_input` 设 zh 渲染通过。实时生效维度缺口见 f001。
  - AC-003：`re_verified`。运行 `npx vitest run tests/unit/ui_strings.test.ts`（9 passed）；guard 逻辑非恒真——非注释/非 logger 行含 CJK 即入违规列表，当前为 0 违规。
  - coverage = 3 / 3
- 总体判断：三条 AC 均以测试守卫 + 代码核对复验通过，无未解决 critical/important；两条 minor 为既有行为与文本微调，不阻断合并。
- 系统性 follow-up：f001 的 locale 切换即时重渲染与 dashboard.html title 国际化，建议并入既有 backlog t154（dashboard/popup 小修复集）或新建 `dashboard_locale_switch_rerender` / `dashboard_html_title_i18n` 类 task，阻断性均为低。

verdict: PASS
