# Task review t163（reviewer_focus: 通用）

- task：`t163_strengthen_e2e_assertions`
- spec：`docs/tasks/t163_strengthen_e2e_assertions/spec.md`
- diff_anchor：`a3d617317ea15f4021c7bf6efc892849f7b9ddae`
- target：`git diff a3d617317ea15f4021c7bf6efc892849f7b9ddae`
- round：1
- reviewed_at：2026-08-13 17:38 UTC+8

## Findings

### t163_gen_f001 - `[data-tab="events"]` 在 dashboard 中不存在，AC-004 测试 1 真实环境必然红

- 严重度：important
- 锚点：AC-004
- 位置：`tests/e2e/e2e-console-errors.spec.ts:71`（`dashboard.locator('[data-tab="events"]')`）与 `:74`（`await expect(events_tab_btn, ...).toBeVisible({ timeout: 5000 })`）
- 问题：旧代码 `if (await events_tab_btn.isVisible()) { ... }` 对不存在的选择器静默跳过；t163 把该守卫改为硬断言 `toBeVisible`。但 dashboard 详情页的 tab key 来自 `DT_TABS`：`overview/timeline/user_action/navigation/network/console/error/storage/cookie/config`（`src/extension/dashboard/dashboard_detail.ts:25-30`，错误异常 tab 的 key 是 `error` 不是 `events`）。全仓 grep 确认 `data-tab="events"` 仅出现在本测试文件。真实环境打开详情页后该 locator 匹配 0 个元素 → `toBeVisible` 等待 5s 超时 → 测试必然失败，AC-004 的错误 tab 断言全部不可达。本 diff 将「静默跳过」改写为「必然失败」，属 t163 引入的保证红。
- 建议：选择器改为 `[data-tab="error"]`（与 DT_TABS 一致），并同步核对下方 `events_text` 断言（见 f002）。

### t163_gen_f002 - error tab 不渲染异常消息文本，`toContain('E2E async uncaught exception')` 必然失败

- 严重度：important
- 锚点：AC-004
- 位置：`tests/e2e/e2e-console-errors.spec.ts:77`（`expect(events_text, 'error Tab 应含未捕获异常 marker').toContain('E2E async uncaught exception')`）
- 问题：error tab 渲染路径为 `render_simple_events(['runtime_exception', ...], ...)`（`dashboard_detail.ts:107`），每行五列依次是 `rel_time / kind_label / event_title / event_detail / source`。`event_title` 与 `event_detail`（`dashboard_shared.ts:180-240`）对 `runtime_exception` 均无分支，走 `default`：`event_title` 返回 `e.type`（即字符串 `runtime_exception`），`event_detail` 返回 `''`。异常消息存于 `e.data.message`（`exception_capture.ts:144-154`）但**任何一列都不渲染它**。因此即使修正 f001 的 tab 选择器，error tab 的可见文本中也不含 `'E2E async uncaught exception'`，`toContain` 恒失败。断言假设了产品不提供的行为（异常消息在 error tab 可见）。未捕获异常经 `Runtime.exceptionThrown` 只进 error events（`console_capture.ts:136` 仅监听 `consoleAPICalled`），不会作为 console 事件出现，故该消息在页面任何 tab 都不可见。
- 建议：断言改为 error tab 可观察行为——例如 `[data-tab="error"]` 下出现 `runtime_exception` 行（`render_simple_events` 的 type 列会显示 `runtime_exception`）且 `error_count` 统计非零；或先在产品侧为 error tab 补消息渲染（见结论 follow-up）再断言文本。

### t163_gen_f003 - detail-tabs 的 console tab 内容容器类名不在选择器内，`toHaveCount(1)` 必然失败

- 严重度：important
- 锚点：AC-005
- 位置：`tests/e2e/e2e-detail-tabs.spec.ts:65-66`（locator `.dt-body, .simple-pad, .dt-overview` + `toHaveCount(1)`）
- 问题：tabs 循环覆盖 `overview/timeline/network/console/navigation`。各 tab 内容容器逐一核对：overview → `.simple-pad`（`dashboard_detail.ts:422`）、timeline → `.dt-body`（`:111`）、network → `.dt-body`（`:102`）、navigation → `.simple-pad`（`:106`）均命中；唯独 console tab 的内容容器是 `<div class="dt-list" style="flex:1;min-height:0">`（`dashboard_detail.ts:104`），不含 `.dt-body/.simple-pad/.dt-overview` 中任一。旧代码 `if (body_count > 0)` 静默跳过；t163 改为 `toHaveCount(1)` 后，console tab 迭代必然 count=0 → 测试在真实环境红。AC-005「容器缺失即 fail」方向正确，但选择器漏掉了 console tab 的实际容器类。
- 建议：选择器加入 `.dt-list`（如 `.dt-body, .simple-pad, .dt-overview, .dt-list`），或为 console tab 单独断言容器存在。

### t163_gen_f004 - console level 分类断言 `toContain('error')` 弱，未真正验证 level 分类

- 严重度：minor
- 锚点：AC-004（部分）
- 位置：`tests/e2e/e2e-console-errors.spec.ts:68`
- 问题：`expect(console_text, 'console Tab 应显示 error 级别分类').toContain('error')` 意图验证 console level 分类，但上一行断言的消息 `'E2E test console error: something went wrong'` 自身含子串 `error`——即使 level tag 缺失、level 分类未渲染，该断言也通过。属弱断言残留（非恒真，但信号被消息文本稀释）。console tab 实际渲染 `<span class="lvl-tag" data-lvl="${l.level}">`（`dashboard_detail.ts:397`），有明确的可断言结构。
- 建议：改为断言 `[data-lvl="error"]` 元素存在（`dashboard.locator('.lvl-tag[data-lvl="error"]')`），或断言含 error 的 console 行数 > 0，而非整页文本子串。

## 结论

- 前轮 finding 复核：本轮为 Round 1，无。
- 本轮新发现：4 条（f001/f002/f003 important，f004 minor）。
- 未进表的提示（范围外/预接线，非本 diff 引入，判 AC 时不阻塞）：
  - fixture server 自起路径与文件不符：`e2e-cdp-retry.spec.ts:11` 用 `tests/e2e/fixtures/server.ts`（不存在，实际在 `tests/support/fixtures/server.ts`）；`e2e-export-content.spec.ts:18` 用 `tests/fixtures/server.ts`（同样不存在）。真实运行依赖 playwright `webServer` 全局启动的 `npm run test:e2e:server`（`playwright.config.ts:32-37`，`package.json` 指向 `tests/support/fixtures/server.ts`）兜底。
  - `e2e-realtime-detail.spec.ts:60` 新增的 `goto('http://localhost:17832/test-page.html')` 不自行起服务器，依赖上述 webServer（`webServer` 已配置、等待 URL 就绪，属真实运行路径）；单独以裸运行方式跑该文件会连接失败。webServer 覆盖标准运行路径，不判 finding。
  - cdp-retry / export-content 不在任何 project 的 `testMatch` 内（`playwright.config.ts:40-140`），本任务范围内未改动接线（属 t162 依赖）。
- 总体判断：AC-001/002/003/006 的强化断言经代码级查证与 fixture/产品行为一致；AC-004（f001/f002）与 AC-005（f003）的强化把「静默跳过」改成了「必然失败」——断言假设与 dashboard 实际 DOM/渲染不符，真实环境必红，未解决 important 达 3 条，FAIL。
- 系统性 follow-up：建议标题「detail error tab 渲染异常消息文本」，slug `detail_error_tab_render_message`（产品侧：`event_title`/`event_detail` 补 `runtime_exception` 等 error 类型分支，渲染 `e.data.message`；供 AC-004 文本断言落地）。阻断性：不阻断本 task 的断言修正，作为产品能力缺口登记。

### AC 复验披露

- AC-001：`re_verified`。代码级查证：`export_json` 含 `capture`（含 `body_capture_mode`，`types.ts:359`）、`network_requests`（含 `response_body_status`/`response_body`，`types.ts:346-348`，`strip_response_body` 仅当 `include_response_body===false` 才剥离，`exporter.ts:42-47`）、`console_events`（含 `args_preview`，`types.ts:401`，`console_capture.ts:156`）；fixture `/api/test` 返回 `{status:'ok',message:'E2E_API_MARKER'}`、页面加载时 `console.log('E2E_LOG_MARKER')` 与 `fetch('/api/test')`（`test-page.html`）；body 内容不做值脱敏（脱敏仅限 headers/URL）。
- AC-002：`re_verified`。代码级查证：`build_har_entry` 中 `response.content.text = r.response_body`（`exporter.ts:332-337`）；fixture 响应体含 `E2E_API_MARKER`。
- AC-003：`re_verified`。代码级查证：console 事件并入 timeline 的 `detail_events`（`dashboard_shared.ts` `merge_detail_events`），timeline 默认 list 视图（`_dt_view='list'`）渲染 `tr[data-ev]`（`dashboard_detail.ts:176`），`event_detail` 对 `console_event` 拼接 `args_preview`（含 `E2E_BTN_CLICKED`）；采集中 dashboard 每 2s 增量 `load_detail`（`dashboard.ts:144,158`），SW flush 间隔 1s；fixture `#btn-click` 点击产 `E2E_BTN_CLICKED`。6s 等待覆盖 flush+poll 周期，严格增长可成立。
- AC-004：`re_verified`（结论为不通过）。代码级查证：console tab 渲染 level tag 与 `args_preview` 消息（`dashboard_detail.ts:397`，console 部分断言成立）；error tab 不渲染异常消息（f002）、无 `events` tab（f001）。
- AC-005：`re_verified`（结论为不通过）。代码级查证：逐 tab 核对内容容器类，console tab 为 `.dt-list`（f003）。
- AC-006：`re_verified`。代码级查证：`design_tokens.css:12,60` `--canvas` 分别为 `#e7e6e3` / `#131316`，均匹配 `/^(#|rgb|hsl)/` 且互异；移除 `expect(true).toBe(true)` 死占位符合 AC-006 范围。

覆盖率：`coverage = 6 / 6`（全部代码级查证；本地 E2E 未实跑——playwright testMatch 未含 cdp-retry/export-content、`launch_extension` 环境限制，运行时通过性仍待真实环境确认，本报告运行级结论仅 `trust_prior`）。

verdict: FAIL
reviewed_scope: 142fcde6e20b484b

## Round 2 (2026-08-13 17:50 UTC+8)

复核对象：`git diff a3d617317ea15f4021c7bf6efc892849f7b9ddae` 中 `tests/e2e/e2e-console-errors.spec.ts` 与 `tests/e2e/e2e-detail-tabs.spec.ts` 的修复后版本（含 Round 1 四处处置）。两文件 `npx esbuild --loader:.ts=ts --format=esm` 语法检查通过。

### 前轮 finding 复核

- **t163_gen_f001 已修**：选择器改为 `[data-tab="error"]`（`e2e-console-errors.spec.ts:74`），与 `DT_TABS` 实际 key 一致（`dashboard_detail.ts:27`，`error`）。`toBeVisible` 现匹配存在元素，断言可达。
- **t163_gen_f002 已修**：error tab 断言改为 `toContain('runtime_exception')`（`e2e-console-errors.spec.ts:85`）。核对渲染路径：error tab 经 `render_simple_events(['runtime_exception', ...])`（`dashboard_detail.ts:107`）逐行渲染 `event_title(e)`，而 `event_title` 对 `runtime_exception` 无分支、走 default 返回 `e.type` 即 `'runtime_exception'`（`dashboard_shared.ts`）。有该事件时文本必现；断言从「消息文本」改为「分类文本」，语义与产品可观察行为一致（异常消息本身产品不渲染，见 Round 1 结论 follow-up）。`not.toContain('runtime_exception')` 在 console tab 亦成立——console 事件不产生该文本（console 捕获仅 `consoleAPICalled`，`console_capture.ts:136`）。
- **t163_gen_f003 已修**：容器选择器加入 `.dt-list`（`e2e-detail-tabs.spec.ts:65`）。console tab 内容容器确为 `<div class="dt-list">`（`dashboard_detail.ts:104`）；逐 tab 核对：overview `.simple-pad`（`:422`）、timeline `.dt-body`（`:111`）、network `.dt-body`（`:102`）、navigation `.simple-pad`（`:106`）、console `.dt-list`（`:104`），五个 tab 均命中 `toHaveCount(1)`。
- **t163_gen_f004 已修**：level 分类断言改为 `.lvl-tag[data-lvl="error"]` `toBeVisible`（`e2e-console-errors.spec.ts:70-72`）。`render_con_table` 对每条 console 记录渲染 `<span class="lvl-tag" data-lvl="${l.level}">`（`dashboard_detail.ts:397`）；console.error 记录 level='error'，断言真实触达分类渲染，不再被消息文本子串稀释。

### 本轮新发现

0 条。提示（不进 finding 表）：`e2e-detail-tabs.spec.ts:64` 注释「overview=dt-overview」与实现不符（`render_dt_overview` 返回 `.simple-pad`），仅注释误差，选择器已含 `.simple-pad` 覆盖，无功能影响。

### 结论

- 前轮 finding 复核：f001/f002/f003/f004 均按 diff 核实已消除（选择器、断言、容器类与产品渲染分支逐一对照）。
- 本轮新发现：0 条。
- 未进表的提示：同上注释小误差；其余同 Round 1（预接线环境限制，无变化）。
- 总体判断：AC-004 / AC-005 的强化断言现与 dashboard 实际 DOM 与渲染行为一致，无未解决 critical / important。
- 系统性 follow-up：同 Round 1（detail error tab 渲染异常消息文本，`detail_error_tab_render_message`），产品能力缺口，不阻断。

### AC 复验披露（Round 2 增量）

- AC-004：`re_verified`。修复后断言逐一对照 `dashboard_detail.ts` DT_TABS / render 分支与 `dashboard_shared.ts` `event_title` 确认可达且非恒真。
- AC-005：`re_verified`。五 tab 容器类逐一核对命中。
- 覆盖率（累计）：`coverage = 6 / 6`（全部代码级查证；本地 E2E 未实跑，环境限制同 Round 1，运行级结论 trust_prior）。

verdict: PASS
reviewed_scope: af110d1d60636653
