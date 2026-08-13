# Task review t193（reviewer_focus: 通用）

- task：`t193_fix_perf_budget_leftovers`
- spec：`docs/tasks/t193_fix_perf_budget_leftovers/spec.md`
- diff_anchor：`edc7619a630df17209128ea4aaa182365b1b4a92`
- target：`git diff edc7619a630df17209128ea4aaa182365b1b4a92`
- round：1
- reviewed_at：2026-08-14 01:51 UTC+8
reviewed_scope: 4099ea47b9f6cfee

## Findings

### t193_gen_f001 - AC-005 ZIP「流式组装」未实现：diff 无功能改动，注释主张与 fflate 实际行为不符

- 严重度：important
- 锚点：AC-005（输入 snapshot、enriched arrays、JSONL strings、bytes、输出 ZIP 不全部同时驻留）
- 位置：`src/extension/shared/archive_builder.ts:423-426`（新增注释）、`tests/unit/perf_budget_leftovers.test.ts:59-69`（AC-005 测试）
- 问题：
  - `git diff edc7619` 对 `archive_builder.ts` 仅有注释新增，`zip(files, (err, data) => …)` 调用在 anchor（edc7619）已存在（`git show edc7619:src/extension/shared/archive_builder.ts` 可证）。AC-005 在本次 diff 中没有任何功能改动。
  - 按项目实际使用的 fflate 0.8.3 源码（`node_modules/fflate/esm/browser.js:2193-2292`），`zip(files, cb)` 在全部文件压缩完成后由 `cbf()` 一次性构建完整输出缓冲 `new u8(tot + 22)`，并**单次**回调 `cb(null, out)`——回调不「分块」；所有输入（`files` 对象内 manifest/readme/jsonl 字符串/body bytes）与完整输出同时驻留。注释中「fflate zip(files, cb) 回调分块（非同步全量压缩）」「输出流式」与库实现不符；「输入、输出 ZIP 不全部同时驻留」的结构性前提不成立，峰值内存与 `zipSync` 同阶（仅 ≥160KB 的大文件 deflate 走 worker，小文件仍 `deflateSync` 内联）。
  - 注释声称「回退 Zip/ZipDeflate 流式类因 vitest 并行 worker 竞争（flaky）」，但 diff 中从未出现 Zip 类代码，该尝试无 diff 证据；真实流式 API（`Zip`/`ZipDeflate`，`ondata` 分块回调）未采用。
- 建议：采用 `Zip`/`ZipDeflate` 流式类并解决测试稳定性（该用例串行/隔离 worker），使「输入与输出不全部同时驻留」成立；若维持现状，应如实改写 AC-005 语义（如「ZIP 组装使用异步回调 API，主线程不阻塞」）与注释，不得以注释+源码模式测试宣称未实现的性质。峰值内存属 `[deploy]`，但结构性前提已可从库实现核验为不满足。

### t193_gen_f002 - AC-002/AC-004 新逻辑无行为测试；AC 测试全部为源码模式匹配，未按测试策略断言预算量

- 严重度：important
- 锚点：AC-002（排序/分页语义不变且 offset 下推）、AC-004（DOM 节点数受窗口预算约束）；spec 测试策略「断言读取量/节点数/字符串大小受预算约束；bundle 门禁用构建产物大小断言」
- 位置：`tests/unit/perf_budget_leftovers.test.ts:1-82`
- 问题：
  - 六组测试全部是 `readFileSync` + 正则匹配源码片段，未断言任何可观察量（读取量、DOM 节点数、字符串大小、产物大小）。AC-006 测试只检查脚本文本含 `bridge.mjs`/`process.exit(1)` 等关键词与 package.json 注册，既不运行 `check_bundle_budget.mjs` 也不断言产物大小。
  - AC-002 新增的 `offset` 参数（`cursor.advance(skip)` 新逻辑）零行为覆盖：offset ≥ total、asc + offset、offset+limit 截断交互等边界均未验证；若 advance 后 limit 截断失效或 offset 越界返回非空，测试仍绿。本项目同函数已有行为测试先例：`tests/unit/list_captures_limit.test.ts`（fake-indexeddb 测 limit，t153）、`tests/unit/agent_query_pushdown.test.ts`（t161 对拍），offset 行为测试完全可行。
  - AC-004 的 `render_dt_list` 是纯字符串函数，对 2000 事件输入统计 `<tr` 行数断言 ≤ 窗口预算零成本可行；现测试只匹配源码含 `LIST_WINDOW = 500`，若渲染误用全量 `list.map`（忽略 `visible`），DOM 无界而测试仍绿。
  - 危险性质：源码匹配测试在代码演化后仍可能通过（如 `visible` 变死代码），属「AC 看似覆盖但未验证可观察行为」。
- 建议：补 AC-002 行为测试（fake-indexeddb：`list_captures(limit, 'prev', offset)` 与 `(limit, 'next', offset)` 分页、offset ≥ total 返回空、offset+limit 越界）；补 AC-004 行数断言（>500 事件时输出行数 ≤ 500 + 提示行）；AC-006 改为执行脚本断言产物大小与退出码（构建产物存在时）。

### t193_gen_f003 - AC-004 windowed 截断使 >500 事件在列表视图不可达（无分页/滚动回填）

- 严重度：minor
- 锚点：行为缺陷——Dashboard 详情列表行为改变（diff 范围内可观测）
- 位置：`src/extension/dashboard/dashboard_detail.ts:163-192`
- 问题：`list = filtered_events()` 中 `detail_events` 按类别拼接（user→nav→error→storage→cookie→network→console，`dashboard_format.ts:141-145`），`visible = list.slice(0, 500)` 取前 500 条；大 capture 下 network/console（通常占事件多数）在列表视图无翻页或滚动回填路径，仅能靠搜索/筛选把窗口缩小到 500 条内才能触及；选中事件 idx ≥ 500（如从 trace 视图选中）时列表视图无对应高亮行（`data-ev` 越出已渲染行）。与改动前全量列表行为相比属功能语义变化。缓解：溢出提示行 + 搜索/筛选可缩小窗口，AC-004 的 DOM 预算本身已达成。
- 建议：增加「加载更多/下一页」或滚动回填；或在溢出提示行指引用户经 trace 视图/搜索查看隐藏事件。

## 结论

- 前轮 finding 复核（Round 1）：不适用
- 本轮新发现：3 条（f001 important、f002 important、f003 minor）
- 未进表的提示：
  - `render_trace()`（`dashboard_detail.ts:250-275`）对全部 detail_events 渲染 lane 标记，无窗口化——AC-004 按「大列表」边界不入 finding，但大 capture 下仍是 PERF-H004 目标的 DOM 峰值点。
  - AC-001：trim 后 estimate 设为保留字节 ≤ max，修复正确；但非 trim 返回路径（`app_log_storage.ts:227-229`，估算偏离时 estimate 重置 0）仍可能接近 2×——既有行为且 UTF-8 估算通常偏保守，未入 finding；`app_log_storage.ts:227-228` 注释「此后按新写入重新累计」与新行为部分过时。
  - `check_bundle_budget.mjs:44`：`dist/` 缺失时静默跳过（不 fail），build 链前置保证存在，未入 finding。
- 总体判断：AC-001/002/003/006 实现正确（f002 之外）；AC-005 核心性质未实现且注释与库行为不符（f001），AC-002/004 新逻辑无行为测试（f002）——存在未解决 important，FAIL。
- 系统性 follow-up：无既有 task 覆盖（`task.py list` 无 ZIP 流式/测试行为化条目；p044 属 exporter 尺寸断言、p045 即 AC-003 来源，均已由本任务处理）。建议（若遗留）：
  - AC-005 真流式：title「ZIP 导出真流式化并解决 vitest worker 竞争」，slug `fix_zip_true_streaming`，阻断性 important。
  - 行为级断言：title「perf 预算行为级断言补全（list offset / DOM 节点数 / bundle 产物大小）」，slug `perf_budget_behavioral_assertions`，阻断性 important。

### AC 复验方式

- AC-001：re_verified——读 `trim_if_needed` 全逻辑：trim 后 `_estimated_bytes = max(0, total_bytes - freed) ≤ max`，下次 trim 在再写入约 max 字节时触发，峰值 ≈ max + flush 粒度，不再接近 2×；`npx vitest run tests/unit/perf_budget_leftovers.test.ts` 通过。
- AC-002：re_verified（代码路径）——读 dispatcher（offset 经 `get_optional_non_negative_int` 校验非负整数、limit 默认 100）与 `list_captures`（advance 跳过后按序取 limit，与旧 slice(offset, offset+limit) 返回集等价；offset ≥ total 时 advance 后 cursor 为 null 返回空）；行为边界（fake-indexeddb 下 advance 语义、asc 方向、越界组合）无测试覆盖，见 f002。
- AC-003：re_verified——`count` 与 `get_entries` 过滤条件逐字段一致，`limit = min(total, 100000)` 读取量与改动前相同，超限追加 `[truncated: …]` 标记，导出内容除标记外不变。
- AC-004：re_verified（代码路径）——`visible = list.slice(0, LIST_WINDOW)` 使 `<tbody>` 行数 ≤ 500 + 提示行，DOM 有界；行为缺口（不可达事件、无节点数断言）见 f002/f003。
- AC-005：re_verified（结构性核验，结论与实施侧声称相反）——从 fflate 0.8.3 源码确认 `zip(files, cb)` 单次回调返回完整 ZIP、输入与输出全量同时驻留，见 f001；`[deploy]` 的峰值内存实测项无实施侧基准证据，trust_prior（依赖实施侧 `handoff.json` ac_evidence 声明，但注释声称与库实现不符，不可采信）。
- AC-006：re_verified——实际运行 `node scripts/check_bundle_budget.mjs` 输出 4 项全部 ok、exit=0，阈值与 spec 未知契约清单结论一致；`package.json` build 链尾 `&& npm run check:bundle` 注册正确。

coverage = 5/6（AC-005 峰值内存维度 trust_prior，占比 16.7%，≤30%）

verdict: FAIL

## Round 2 复核（2026-08-14 02:00 UTC+8）

### 前轮 finding 复核（以当前 diff 为准）

- **t193_gen_f001（important，AC-005）：已修。** `archive_builder.ts` 现为 `Zip` + `ZipPassThrough` 流式组装（`src/extension/shared/archive_builder.ts:423-469`）：逐文件 `add` + `push(data, true)`、`zipper.end()`，输出经 Zip 回调按 chunk 收集、final 拼接。功能改动真实存在（diff 由注释-only 变为实现替换）；注释「输出分块收集」「无压缩 worker 无并行竞争」与 fflate Zip 类行为一致（`ZipPassThrough` 为 store 模式，不触发 deflate worker）；不再有旧 `zip(files, cb)` 内部「全量输入 + 每文件压缩结果 + 完整输出」三重驻留。输出正确性由 `archive_builder.test.ts` unzipSync 往返断言（11 tests 全绿）行为验证。残留：输出最终仍拼接为完整 `Uint8Array`（`Promise<Uint8Array>` 返回契约决定），峰值内存维度属 AC-005 `[deploy]`，留待真实大 capture 基准。
- **t193_gen_f002（important，AC-002/004 测试）：已修。** `tests/unit/list_captures_limit.test.ts:51-62` 新增 fake-indexeddb 行为测试：`list_captures(2, 'prev', 2)` → `['c4','c3']`、`list_captures(1, 'next', 1)` → `['c2']`，断言具体顺序（排序/分页语义与 slice 等价）；`tests/unit/detail_render_consistency.test.ts:109-125` 对 600 事件断言行数 ≤ 502 且含 `hidden (windowed)`，直接触达 AC-004 的 DOM 节点预算（回归为全量渲染会红）。`perf_budget_leftovers.test.ts` AC-005 源码断言已同步更新为 `new Zip(` / `new ZipPassThrough(entry.name)` / `file.push(entry.data, true)`。
- **t193_gen_f003（minor，AC-004 语义）：已修。** `task.md` 处置表明确「windowed 截断前 500 语义说明（预算优先，搜索可缩小窗口）——保留设计并注释明确」；`dashboard_detail.ts:163-166,189-192` 注释与溢出提示行已说明预算约束与窗口缩小途径。minor 按处置规则接受保留设计。

### 本轮新发现

### t193_gen_f004 - 「ADR-012」误引：ZIP 流式决策引用了一个含义不同的既有编号，且「ADR-012 更新」无对应 diff

- 严重度：minor
- 锚点：文档/注释一致性（不违反任何 AC）
- 位置：`src/extension/shared/archive_builder.ts:424`（注释 `PERF-H004 组装部分；ADR-012`）、`docs/tasks/t193_fix_perf_budget_leftovers/task.md` 处置表 f001 行（「ADR-012 更新」）
- 问题：ADR-012 是 t156 的既有决策编号，内容为「否决固定上限、分页读取至耗尽」（`docs/specs/fix_ui_export_100k_truncation.md:5`），与 ZIP 流式组装（Zip/ZipPassThrough）无关；`docs/blueprint/decisions.md` 中亦无 ADR-012 条目。将「ADR-012」挂为 ZIP 流式决策依据属误引——未来维护者查 ADR-012 会得到不相关决策；且 diff 中 `docs/blueprint/`、`docs/specs/` 无任何更新，「ADR-012 更新」声称无对应改动。
- 建议：删除该编号引用，或新增独立决策（写入 `docs/blueprint/decisions.md`）后再引用；task.md 处置表描述与 diff 对齐。

### 验证记录

- `npx vitest run tests/unit/list_captures_limit.test.ts tests/unit/detail_render_consistency.test.ts tests/unit/archive_builder.test.ts tests/unit/perf_budget_leftovers.test.ts`：4 文件 27 tests 全绿。
- `npm test` 双跑：均 197 文件 / 1881 tests 通过、退出码 0（稳定）。
- `npx tsc --noEmit`：退出码 0。

### 结论

- 前轮 finding 复核：f001 / f002 / f003 均确认已修（以代码与测试为准，不采信处置表自述）。
- 本轮新发现：1 条（t193_gen_f004 minor）。
- 总体判断：Round 1 的 2 条 important 已消除；本轮仅 1 条 minor（文档编号引用），无未解决 critical / important → PASS。
- AC-005 复验更新：由 Round 1 的「结构性核验不满足」转为「流式 API 落地 + 往返测试验证输出正确性」，峰值内存 `[deploy]` 维度仍待真实基准（trust_prior）。

verdict: PASS
reviewed_scope: 61cdf830b2caf813

## Round 3 复核（2026-08-14 02:10 UTC+8）

### 前轮 finding 复核（以当前 diff 为准）

- **t193_gen_f004（minor，ADR 引用）：修不彻底。** 处置只完成了编号替换，决策条目未落地：
  - 已同步：`src/extension/shared/archive_builder.ts:425` 注释与 `task.md:45` 处置表均已改「ADR-025」。
  - 未完成：`docs/blueprint/decisions.md` 中**不存在**「## 025 性能预算与流式导出」条目——`grep -n "^## 02"` 编号止于 024；全仓 grep「025 性能预算」「性能预算与流式导出」「ADR-025」仅命中 `archive_builder.ts` 与 `task.md`；`git status/diff` 显示 `docs/blueprint/` 无任何改动。task.md 处置表「ADR-025（新条目）」声称的新条目从未创建，注释引用的 ADR-025 无法解析——f004 的核心问题（声称决策记录但无对应写入）同构复发，只是编号从 012 换成不存在的 025。

### 本轮新发现

### t193_gen_f005 - ADR-025 悬引：decisions.md 无 025 条目，「ADR-025（新条目）」无对应决策记录

- 严重度：minor
- 锚点：文档/注释一致性（不违反任何 AC）
- 位置：`src/extension/shared/archive_builder.ts:425`（注释「PERF-H004 组装部分；ADR-025」）、`docs/tasks/t193_fix_perf_budget_leftovers/task.md:45`（处置表「ADR-025（新条目）」）
- 问题：f004 处置仅将引用编号 012→025，但 `docs/blueprint/decisions.md` 未新增「## 025」条目（编号止于 024，`grep -c "^## 012"` = 1 无重复、`grep -n "^## 025"` 空、`git diff --stat edc7619.. -- docs/blueprint/decisions.md` 无输出）。「ADR-025（新条目）」是声称不是证据——引用仍悬空，未来维护者无法解析该决策。
- 建议：在 `docs/blueprint/decisions.md` 创建「## 025 性能预算与流式导出（2026-08-14）」条目（记录：Zip/ZipPassThrough store 流式、无压缩 worker、输出 chunk 收集后拼接、峰值内存 `[deploy]` 待基准、预算阈值 bridge ≤200KB / mcp ≤2MB / extension.zip ≤500KB / dist ≤2MB）；或删除 `archive_builder.ts` 注释与 task.md 处置表中的编号引用。创建后需下轮复核。

### 验证记录

- `grep -c "^## 012" docs/blueprint/decisions.md` = 1（无重复 012，t156 决策保留）。
- `grep -n "^## 025" docs/blueprint/decisions.md`：空——025 条目不存在。
- `npx tsc --noEmit`：退出码 0。

### 结论

- 前轮 finding 复核：f004 修不彻底（引用改号完成、决策条目未创建，见 f005）；f001/f002/f003 仍为已修（上轮已核实，本轮改动仅文档，不影响）。
- 本轮新发现：1 条（t193_gen_f005 minor）。
- 总体判断：处置表「已修」与 diff 事实不符（025 条目缺失），f004 处置未闭环——按本轮指示，处置不充分判 FAIL，需下轮创建 025 条目或删除引用后复核。两条 finding 均为 minor（不满足 blocking 硬阈值），FAIL 依据为「处置不充分、声称与事实不符，须强制下一轮核实」。

verdict: FAIL
reviewed_scope: 84f7c6f3df1e618a

## Round 4 复核（2026-08-14 02:20 UTC+8）

### 前轮 finding 复核（以当前 diff 为准）

- **t193_gen_f005（minor，ADR-025 悬引）：已修。** `docs/blueprint/decisions.md` 尾部新增「## 025 性能预算与流式导出（2026-08-14）」条目（+12 行，`git diff --stat` 确认）：背景覆盖 PERF-L008/L009/L010/H004/I011，六项决策（app log trim estimate 保留字节、captures.list offset 下推、app log 导出显式上限 + truncated 标记、Dashboard windowed LIST_WINDOW=500、ZIP 用 fflate `Zip`+`ZipPassThrough` store 流式逐文件 add+push / chunk 收集拼接、bundle 门禁阈值 bridge ≤200KB / mcp ≤2MB / extension.zip ≤500KB / dist ≤2MB 且 build 链尾执行）与实现及 spec 未知契约清单一致；`archive_builder.ts:425` 与 task.md 处置表的 ADR-025 引用现可解析。
- 前轮 f001/f002/f003/f004：维持已修结论（f004 随 025 条目创建闭环；其余本轮改动仅文档，不影响）。

### 验证记录

- `grep -c "^## 025" docs/blueprint/decisions.md` = 1（条目存在且唯一）。
- 025 条目内容与实现/spec 一致（trim estimate、offset 下推、导出上限标记、windowed、Zip 流式、bundle 阈值）。
- `npx tsc --noEmit`：退出码 0。

### 结论

- 前轮 finding 复核：f005 已修；f001~f004 维持已修。全部 finding（f001~f005）处置闭环。
- 本轮新发现：0 条。
- 总体判断：无未解决 critical / important / minor，处置表与 diff 一致 → PASS。

verdict: PASS
reviewed_scope: 118b4aab1aaf78f7
