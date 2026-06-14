# Capture All — TASKS.md

> 基准：`docs/design/caputue-all/project/record-all/` (commit `f7fe756`)
> 已完成任务（✅）归档至 `docs/archive/completed_tasks_2026-06-13.md`

---

主面板采集中没有及时刷新，我点击开始采集后，操作网页去了，然后再点击按钮出现采集中的弹窗，里面的数据标签统计都是空的，过了一秒才刷新，没有实时更新



## P0 · 功能缺陷（待修复）

---

## P1 · 功能增强（待实现）

### FEAT-001：剪贴板 API 监控

**状态**：待实现

**现象**：ChatGPT 等网站的分享按钮调用 `navigator.clipboard.writeText()` 复制链接，扩展无法捕获此操作。采集记录中无任何痕迹。

**影响**：用户行为标签遗漏「复制到剪贴板」操作，对需要还原用户操作序列的场景（如 AI Agent 回放）信息不完整。

**预期行为**：content_script 拦截 `navigator.clipboard.writeText()` / `readText()`，生成 `user_action` 类事件，type 为 `clipboard_write` / `clipboard_read`，data 包含操作类型（出于隐私不记录具体内容）。

**涉及文件**：
- `src/content/content_script.ts` — 注入 clipboard 拦截
- `src/shared/types.ts` — 新增事件 type
- `src/shared/event_category.ts` — 映射到 `user_action` category

**注意事项**：
- 仅记录操作类型，不记录剪贴板内容（隐私安全）
- 需处理 `document.execCommand('copy')` 旧式复制
- 需 site permission 检查，无权限时静默跳过

---

## 测试审计报告 (2026-06-12)

10 组并行审计，检查「测试通过但功能不工作」的脱节模式。

### 审计发现汇总

| 组 | 范围 | 脱节数 | 严重度 |
|----|------|--------|--------|
| 1 | popup_layout | 全部 54 测试 | **严重** |
| 2 | export_settings/system_time | 2 | 高 |
| 3 | dashboard | 3 + 1 潜伏 bug | 高 |
| 4 | E2E export | 5 | 高 |
| 5 | E2E detail tabs | 5/8 tab 未覆盖 | 高 |
| 6 | settings | 2 | 中 |
| 7 | network | 6 | **严重** |
| 8 | E2E capture | 5 | 高 |
| 9 | agent/bridge | 0 | ✅ 干净 |
| 10 | 剩余单元测试 | 6 | 高 |

### 关键发现

**G1 popup** — `popup_layout.test.ts` 54 个测试全部是布局常量断言（宽/高/列数），零交互测试。所有按钮的 click handler、chrome.runtime.sendMessage 调用、状态转换逻辑均无测试覆盖。

**G7 network** — `resolve_resource_type()` 仅在 webRequest 路径被调用，CDP 初次存储和 `network_correlator.ts` 三个构建函数（`merge_matched`/`build_cdp_only_request`/`build_web_request_only_request`）全部直接透传原始 type 值，不归一化。测试未覆盖 CDP PascalCase 输入。

**G3 dashboard** — `event_category.ts` 潜伏 bug：`category_for_event_type()` 对 `network_request`/`console_event`/`capture_config_changed` 等会错误落到 `'dom_data'` category（目前因生产者显式设 category 未触发）。

**G2 export** — `export_session()` 硬编码文件名 `capture_all_${id}.${ext}`，`build_export_filename()` 及 `{date}` 模板从未参与实际下载路径。`migrate_iana_timezone()` 测试仅纯函数，不覆盖 `load_user_config()` 完整加载路径。

**G4 E2E export** — 未断言 filename 含 date、未断言 `started_at` 非 UTC、未断言 `system_time_timezone` 非空、未断言 `resource_type` 无 PascalCase、`console_events` 非空用条件跳过。

**G5 E2E detail** — 8 个 tab 中 5 个未验证（user_action/navigation/cookie/error/config），selector 与实际 DOM 不匹配。

**G8 E2E capture** — 停止采集不验证 `success=true` 返回值；CDP 测试不验证 `response_body` 非空；状态测试缺多个元素。

**G10 单元测试** — `session_manager` 测试自测自（不调生产代码）、`console_capture` 测试不触 CDP 监听器、`redaction` 测试的脱敏函数在 `exporter.ts` 中零调用、`tab_events` 不覆盖受限 URL 重试、`ui_strings` 不扫 `session` 残留词、`event_category` 仅覆盖 2/20+ 映射。

### 脱节模式分类

1. **纯函数测试，不知生产调用方**（最常见）：函数被完整测试但无人验证它在真实路径被调用。例：`build_export_filename`、redaction 函数。
2. **DOM 存在性断言，无交互验证**：断言元素 id/class 存在，不模拟 click、不验证事件副作用。例：popup_layout 全部测试。
3. **mock 数据与小写/标准值，CDP 实际给 PascalCase**：例：network 测试全用小写输入，CDP 给 `Document`/`Fetch`。
4. **条件跳过代替强制断言**：`if (length > 0) { expect... }` 掩盖零数据问题。

---

# 已知 Bug 根因分析、TDD 修复与防复发记录

记录日期：2026-06-14

## 总结

- 已分析的已知 bug 数量：5（BUG-001 ~ BUG-005）
- 已修复的 bug 数量：5
- 部分修复的 bug 数量：0
- 未修复或需要人工确认的问题：0（连带问题已记录，独立立项）
- 是否存在共同根因：是（局部）
- 共同根因说明：
  - BUG-001 / BUG-002 都在归档导出层（archive_builder），一个是「字段过滤缺失」、一个是「jsonl 末尾换行符缺失」，共同暴露归档出口缺少契约测试与字段白名单。
  - BUG-003 / BUG-004 都涉及「子模块对采集开始事件不可达」：BUG-003 是 CDP 子目标 lifecycle 漏处理 Runtime 域，BUG-004 是 content_script 对 SW 采集开始消息一次性订阅错过。两者均表现为「标签开启但 0 数据」。
- 主要测试缺口：
  - 归档层无「counts 与 jsonl 行数一致」「字段不含已删概念」的契约测试。
  - console_capture 测试为纯函数副本，未触真实 CDP 事件链路。
  - content_script 不可直接 import，导致其与 SW 的时序无单测覆盖。
  - network_capture 无「自身 origin / Bridge URL 应排除」的边界规则测试。
- 主要文档或需求问题：
  - jsonl 行终止符规范未在 docs/specs/data_model.md 显式约定。
  - content_script ↔ SW 时序在 docs/specs/data_flow.md 描述较薄。
  - CDP 子目标 lifecycle 架构约束未文档化。
- 已增加的防复发措施：
  - archive_builder 新增 jsonl 末尾换行符契约测试 + mode 字段过滤契约测试。
  - console_capture 重写为真实 CDP 事件链路测试（主目标/子目标/非 console 三路径）。
  - content_script 新增静态源码契约测试 + poll_capture_status 独立模块单测。
  - network_capture 新增 is_self_origin_url 7 用例。
  - 5 个 bug 均补充反向回归断言。
- 已运行的验证命令：
  - `npx tsc --noEmit` — 无错误
  - `npm test`（vitest 全量） — 654/654 PASS
  - `npm run build` — 成功，输出 artifacts/dist/
- 失败或跳过的验证命令：
  - E2E（npm run test:e2e）— 需宿主 Chrome（Windows）环境，本会话未运行；子代理已用单测+契约测试覆盖核心路径。
- 剩余风险：
  - BUG-003 连带：exception_capture 存在同类子目标 Runtime.enable 缺口（未修，独立立项）。
  - BUG-002 连带：stats.request_count vs counts.network、stats.event_count vs counts.events 口径偏差（未修，独立立项）。
  - BUG-001 连带：agent_mcp_client.test.ts 仍传 `mode: 'standard'` 作为 MCP start_recording 参数（测透传语义，service_worker 已不消费，MCP 接口层清理独立立项）。
  - BUG-004 连带：SW 端 chrome.tabs.sendMessage 失败未重试（建议加 2~3 次短延迟重试，与 content_script 轮询形成双保险）。
  - 真实 ChatGPT 环境 CDP / content_script 行为需 E2E 验证。

## Bug 详情

### BUG-001：manifest mode:standard 脏数据

#### 负责子代理

BUG-001 子代理

#### 状态

已修复

#### Bug 现象

导出的采集归档 manifest.json 中 `capture` 对象包含 `"mode": "standard"` 字段，违反 CLAUDE.md「已删除概念：模式切换/标准采集」。

#### 触发条件

任意一次采集完成后导出 ZIP 归档，解压检查 manifest.json。

#### 影响范围

所有导出归档的 manifest.json。字段为纯死数据，无业务消费，但污染导出产物、违反产品术语约定、可能误导下游消费者（如 AI Agent）认为存在模式切换功能。

#### 涉及文件

- 源码文件：src/shared/types.ts、src/background/service_worker.ts、src/background/session_manager.ts、src/popup/popup.ts、src/shared/archive_builder.ts
- 测试文件：tests/archive_builder.test.ts、tests/e2e-capture-local.spec.ts、tests/e2e-capture-baidu.spec.ts、tests/system_time.test.ts、tests/agent_data_queries.test.ts、tests/session_manager.test.ts、tests/stop_capture.test.ts
- 文档文件：无（CLAUDE.md 已有约定，本次无需补充）

#### 代码根因分析

- 相关调用链：service_worker/popup 构造 CaptureRecord（写入 mode:'standard'）→ 存 IndexedDB → archive_builder.build_archive 读取 → `capture: capture_with_times` 整对象序列化进 manifest.capture
- 直接原因：CaptureRecord 和 CaptureStartedData 类型保留了 `mode: 'standard'` 死字段，4 个构造点照写，archive_builder 无过滤直接序列化
- 深层原因：模式切换功能删除时，类型字段和写入点未同步清理；archive_builder 作为导出出口无字段白名单/黑名单机制
- 错误状态如何产生：字段在类型层存活，运行时被写入并随数据流自然流入导出层
- 是否存在同类代码模式：是。archive_builder 对 capture 对象无字段过滤，任何上游残留字段都会漏出
- 是否发现相关连带问题：未发现 depth/density 等其他已删概念残留（grep 确认 dom_capture.ts 的 depth 是 DOM 路径深度，不同概念）

#### 为什么现有测试没有发现

- archive_builder.test.ts 的 build_archive 测试只断言 `manifest.format` 和 `manifest.counts.network`，从未断言 `manifest.capture` 的字段内容
- make_capture 工厂用 `as CaptureRecord` 绕过类型检查，构造的对象本身不含 mode，测试时 manifest 自然干净，无法暴露生产路径的脏数据
- e2e-capture-local.spec.ts:165 和 e2e-capture-baidu.spec.ts:78 反而**正向断言** `mode === 'standard'`，把 bug 当预期固化
- session_manager.test.ts、stop_capture.test.ts 等 mock 对象主动写入 mode，进一步强化字段合法性
- 根因：无「废弃字段不应流入导出」的契约测试，且测试 mock 与生产代码同步保留了死字段

#### 测试处理方式

新增并修改测试

说明：新增 archive_builder 契约测试（验证历史脏数据 mode 被过滤）；修改 2 个 E2E 断言为反向回归（mode 应 undefined）；清理 5 个测试文件的 mock 残留 mode 引用。

#### 文档和需求分析

- 文档是否定义了正确行为：是。CLAUDE.md 明确「已删除概念：模式切换/标准采集/密度」
- 代码是否违反文档：是。类型与写入点保留 mode 字段
- 测试是否体现文档要求：否。测试反向固化了 bug
- 文档是否存在缺失、错误或歧义：无
- 是否需要补充文档：否
- 本次是否已补充文档：否

#### 问题归因

多方共同问题

原因说明：功能删除时类型/写入点清理不彻底（实现问题）+ 测试反向固化 bug 且无导出契约测试（测试设计问题）+ 导出层无字段过滤防御（架构问题）。

#### TDD 修复记录

- 修复前失败测试：build_archive > strips deprecated mode field from manifest.capture
- 测试文件：tests/archive_builder.test.ts
- 测试名称：strips deprecated mode field from manifest.capture
- 测试输入：含 `mode: 'standard'` 的脏 capture 对象（模拟历史 IndexedDB 数据）
- 期望断言：`expect(manifest.capture.mode).toBeUndefined()`
- 修复前失败原因：archive_builder 原样序列化 capture 对象，mode 流入 manifest
- 修改的源码文件：src/shared/types.ts（删 2 处字段）、src/background/service_worker.ts（删 2 处写入）、src/background/session_manager.ts（删 1 处）、src/popup/popup.ts（删 1 处）、src/shared/archive_builder.ts（增防御过滤）
- 最小修复说明：删除类型定义 + 4 个写入点 + 归档层防御过滤
- 回归测试：strips deprecated mode field from manifest.capture（archive_builder）、e2e-capture-local/baidu 的 mode 反向断言
- 修复后测试结果：相关单测 97 PASS 0 FAIL；tsc 无错误；全量 npm test 654/654 PASS

#### 防复发措施

- 测试层面：archive_builder 增字段级契约测试；E2E 反向断言 mode 不存在；模式可复用于未来废弃字段
- 代码层面：archive_builder 导出层增防御过滤，阻断上游残留流入产物
- 文档层面：CLAUDE.md 已有约定，代码现已对齐
- CI / 工具链层面：tsc strict 兜底捕获新代码对已删字段的引用
- 其他措施：建议后续 archive_builder 引入 capture 字段白名单（架构改进，独立任务）

#### 验证结果

- 已运行命令：npx vitest run tests/archive_builder.test.ts tests/system_time.test.ts tests/agent_data_queries.test.ts tests/session_manager.test.ts tests/stop_capture.test.ts（97 PASS）；npx tsc --noEmit（无错误）；npm test 全量（654 PASS）；npm run build（成功）
- 结果：全部通过
- 未运行命令及原因：E2E（需宿主 Chrome，本会话未运行）
- 失败命令及原因：无
- 剩余风险：agent_mcp_client.test.ts 仍传 `mode: 'standard'` 作为 MCP start_recording 参数（测透传语义，service_worker 已不消费，无功能影响，MCP 接口层清理独立任务）；历史已导出的 ZIP 归档仍含 mode（无法回溯修复，仅影响旧产物）

### BUG-002：manifest counts 计数 +1 偏差

#### 负责子代理

BUG-002 子代理

#### 状态

已修复

#### Bug 现象

导出归档 manifest.json 中 counts.network/counts.events 用标准工具（wc -l）核对，比 jsonl 实际行数多 1。实测 counts.network=476，但 `wc -l network.jsonl` = 475；counts.events=459，`wc -l events.jsonl` = 458。

#### 触发条件

任何含 ≥1 条 network 或 event 的归档导出。

#### 影响范围

所有归档 zip 的 jsonl 文件（network.jsonl / events.jsonl / console.jsonl）。下游用 `wc -l`、`grep -c`、文本编辑器计行数的消费者都会少算 1 行，误判数据丢失。

#### 涉及文件

- 源码文件：src/shared/archive_builder.ts
- 测试文件：tests/archive_builder.test.ts
- 文档文件：无（建议后续在 docs/specs/data_model.md 注明 jsonl 行终止符规范）

#### 代码根因分析

- 相关调用链：`build_archive` → `network_lines.join('\n')` → `strToU8` → ZIP 写入；同时 `counts.network = network_requests.length` 直接取数组长度
- 直接原因：`Array.prototype.join('\n')` 对 N 个元素的数组只插入 N-1 个分隔符，**末尾不加换行符**。N 行 JSON 数据实际只有 N-1 个 `\n` 字节
- 深层原因：违反 POSIX 文本规范（每行应以 \n 结尾）。`wc -l` 按 `\n` 字节数计行，所以少算最后一行。counts 用数组长度（正确），但 jsonl 文件不符合规范（错误），二者表面看是 +1 偏差，实则是 jsonl 缺末尾换行符
- 错误状态如何产生：`build_archive` 直接 `strToU8(network_lines.join('\n'))`，未追加末尾 `\n`
- 是否存在同类代码模式：是。`events.jsonl`、`console.jsonl` 同样使用 `join('\n')`，三处一并修复
- 是否发现相关连带问题：是，但不在本次修复范围 —
  1. `stats.request_count`（452）与 `counts.network`（476）偏差 24 条，因 stats 仅统计 http 请求，counts.network 含 24 条 `capture_method=unknown`（疑似 WS/streaming 混入），两套口径
  2. `stats.event_count`（481）与 `counts.events`（459）偏差 22，同样是 stats 实时计数器 vs 归档数组两套口径

#### 为什么现有测试没有发现

`tests/archive_builder.test.ts` 既有 `produces valid zip` 测试只断言 `manifest.counts.network === 1`（数组长度，与 mock 一致），**从未验证 jsonl 文件本身的行数**。测试没有「counts 与 jsonl 文件行数一致」的契约断言，所以 join 缺末尾换行符的问题不会被捕获。

#### 测试处理方式

新增测试

说明：新增 `build_archive — jsonl 末尾换行符契约` describe 块（3 个测试），用 wc -l 语义（按 \n 字节计数）验证 counts.network/counts.events 与对应 jsonl 行数一致，并覆盖空文件边界。

#### 文档和需求分析

- 文档是否定义了正确行为：未显式定义，但 POSIX 文本规范是事实标准，counts 与 jsonl 行数一致是隐含契约
- 代码是否违反文档：是（违反 POSIX 文本规范）
- 测试是否体现文档要求：修复后是（新增契约测试）
- 文档是否存在缺失、错误或歧义：是 — 未明确 jsonl 行终止符要求
- 是否需要补充文档：建议后续在 docs/specs/data_model.md 注明「jsonl 每行以 \n 结尾，含最后一行」
- 本次是否已补充文档：否

#### 问题归因

实现疏漏（off-by-one 在文件级，非循环级）

原因说明：开发者用 `join('\n')` 拼接 jsonl 时未考虑 POSIX 行终止符规范，漏掉末尾换行符。counts 用数组长度（正确），但 jsonl 文件实际可被标准工具识别的行数少 1，造成「counts 比 jsonl 行数多 1」的表面现象。

#### TDD 修复记录

- 修复前失败测试：
  1. `network.jsonl 行数 = manifest.counts.network（末尾换行符存在）` — expected 2 to be 3
  2. `events.jsonl 行数 = manifest.counts.events` — expected 1 to be 2
- 测试文件：tests/archive_builder.test.ts
- 测试名称：见上
- 测试输入：network=[req1,req2,req3]（3 条），events=[e1,e2]（2 条），空 console
- 期望断言：jsonl 中 `\n` 字节数 == manifest.counts.<category>
- 修复前失败原因：`join('\n')` 对 N 元素数组只产生 N-1 个 `\n`
- 修改的源码文件：src/shared/archive_builder.ts
- 最小修复说明：将 `strToU8(network_lines.join('\n'))` 改为对非空数组追加 `'\n'`，空数组返回空字符串（保持 0 字节）。events/console 同改
- 回归测试：`空 jsonl（0 条）保持为空文件，不追加换行符`
- 修复后测试结果：archive_builder 10/10 PASS；全量 npm test 654/654 PASS；tsc 无错误

#### 防复发措施

- 测试层面：新增 jsonl 行数契约测试，覆盖 network/events/console 三类及空文件边界
- 代码层面：注释明确 POSIX 文本规范要求，空数组分支显式返回空字符串避免误加 \n
- 文档层面：建议后续在 data_model spec 注明 jsonl 行终止符规范
- CI / 工具链层面：建议 e2e-export 后续增加 `wc -l` 校验 counts 一致性断言
- 其他措施：连带问题（stats vs counts 口径偏差）建议单独立项统一

#### 验证结果

- 已运行命令：npx vitest run tests/archive_builder.test.ts（10 PASS）；npx tsc --noEmit（无错误）；npm test 全量（654 PASS）；npm run build（成功）
- 结果：通过
- 未运行命令及原因：E2E（需宿主 Chrome）
- 失败命令及原因：无
- 剩余风险：连带问题（stats.request_count vs counts.network、stats.event_count vs counts.events 的口径偏差）未修，建议主代理评估是否单独立项

### BUG-003：console 采集启用但 0 条

#### 负责子代理

BUG-003 子代理

#### 状态

已修复

#### Bug 现象

配置 `capture_console: true`，但导出归档中 `console.jsonl` 完全空（0 行），`stats.log_count = 0`。ChatGPT（chatgpt.com）正常使用必然有 console 输出。同次采集 network.jsonl 有 475 行、events.jsonl 有 458 行（cookie/navigation 正常），证明 background 基础链路 OK。

#### 触发条件

- 目标站点为重 SPA（ChatGPT 等），大量 console 输出来自 worker / iframe / OOPIF 子目标上下文
- `capture_network` + `capture_response_body` 启用，触发 network_capture 调用 `Target.setAutoAttach({autoAttach:true, waitForDebuggerOnStart:true, flatten:true})`
- `capture_console` 启用

#### 影响范围

所有启用 console 采集的重 SPA 站点。console.jsonl 完全空，stats.log_count = 0，7 大数据标签中「控制台」标签 0 数据。不影响 network/events/cookie/storage。

#### 涉及文件

- 源码文件：src/background/console_capture.ts（核心修复）、src/background/cdp_event_router.ts（复用，未改）
- 测试文件：tests/console_capture.test.ts（重写）、tests/__mocks__/chrome_debugger.ts（mock 增量）
- 文档文件：本段

#### 代码根因分析

- 相关调用链：
  1. `service_worker.start_capture` → `chrome.dbg.attach` 主 tab → `start_console_capture`（仅对主 tab 发 `Runtime.enable`）
  2. 之后 `enable_response_body_capture` → `Target.setAutoAttach({flatten:true})` → worker/iframe 子目标自动 attach
  3. network_capture 的 `handle_cdp_event` 处理 `Target.attachedToTarget`，对子 session 发 `Network.enable` + `Runtime.runIfWaitingForDebugger`，但**不发 `Runtime.enable`**
  4. console_capture 的 `handle_debugger_event` 只过滤 `Runtime.consoleAPICalled`，不处理子目标 lifecycle
- 直接原因：子目标（worker/iframe/OOPIF）的 Runtime 域从未被 enable，`Runtime.consoleAPICalled` 事件不会从这些上下文发出。ChatGPT 大量 console 输出来自 worker/iframe，导致 0 事件
- 深层原因：console_capture 与 network_capture 对子目标 lifecycle 处理不对齐。network_capture 有完整 `Target.attachedToTarget`/`detachedFromTarget` 分支并启用 Network 域，console_capture 完全没有对应分支，未启用 Runtime 域
- 错误状态如何产生：CDP 事件链路本身无错误（log 显示 "Console capture started" + "CDP debugger attached" 成功），但子目标 Runtime 域静默未启用，事件源永不触发，表现为 0 条而非报错
- 是否存在同类代码模式：exception_capture.ts 同样只对主 tab 发 `Runtime.enable`，理论上 `Runtime.exceptionThrown` 也存在子目标遗漏风险
- 是否发现相关连带问题：是 — exception_capture 的子目标 exception 捕获存在相同缺口（本次未修，独立立项）

#### 为什么现有测试没有发现

`tests/console_capture.test.ts` 修复前是 P0.30 的纯逻辑副本：定义一个 `handle_console_log_safe` 函数，仅测 `capture_id` 是否为空、data 是否 null/undefined。完全没有测真实 CDP `Runtime.consoleAPICalled` 事件链路，没有测 `Target.attachedToTarget` 子目标处理，没有测子目标 Runtime.enable 是否发送。测试假设事件会到达，但从未验证到达条件（Runtime 域启用）。

#### 测试处理方式

新增并修改测试

说明：完全重写 `tests/console_capture.test.ts`。保留 1 个原 P0.30 capture_id 回归测试（改为走真实 start_console_capture 链路），新增 4 个 BUG-003 测试覆盖主目标转发、子目标 Runtime.enable、子目标 console 转发、非 console 事件忽略。使用 `mock_chrome_debugger` 的 `emit_event` 模拟真实 CDP 事件分发。

#### 文档和需求分析

- 文档是否定义了正确行为：是 — 7 大数据标签包含「控制台」，PRD/SPEC 要求 capture_console=true 时采集 console 事件
- 代码是否违反文档：是 — 启用采集但实际 0 条
- 测试是否体现文档要求：修复前否（纯逻辑副本），修复后是（真实事件链路）
- 文档是否存在缺失、错误或歧义：文档未明确「console 采集必须覆盖子目标（worker/iframe）上下文」这一 CDP 架构约束
- 是否需要补充文档：建议补充 CDP 子目标 lifecycle 架构说明
- 本次是否已补充文档：否（约束记录在本 TASKS.md 段落）

#### 问题归因

代码实现缺陷（子目标 lifecycle 处理遗漏）

原因说明：console_capture 模块在引入 network_capture 的 `Target.setAutoAttach({flatten:true})` 后，未同步实现子目标 Runtime 域启用逻辑。两模块对子目标 lifecycle 处理不对齐，console_capture 静默漏掉子目标 Runtime.enable，导致 worker/iframe 上下文的 console 事件永不触发。

#### TDD 修复记录

- 修复前失败测试：`enables Runtime on auto-attached sub-target so worker console events fire`
- 测试文件：tests/console_capture.test.ts
- 测试名称：`BUG-003: console capture must emit event on Runtime.consoleAPICalled enables Runtime on auto-attached sub-target so worker console events fire`
- 测试输入：emit `Target.attachedToTarget` 事件（sessionId='child-session-abc'），然后断言 `send_command_calls` 中存在 `command==='Runtime.enable' && sessionId==='child-session-abc'` 的记录
- 期望断言：`sub_target_runtime_enable.length >= 1`
- 修复前失败原因：`AssertionError: expected 0 to be greater than or equal to 1`（console_capture 修复前从不向子 session 发 Runtime.enable）
- 修改的源码文件：src/background/console_capture.ts
- 最小修复说明：`handle_debugger_event` 新增 `Target.attachedToTarget`/`Target.detachedFromTarget` 分支。attach 时 `register_session(child_session)` + 对子 session 发 `Runtime.enable`；detach 时 `unregister_session`。导入共享 `cdp_event_router` 的 register/unregister
- 回归测试：
  - `forwards a main-target consoleAPICalled event to sender`（主链路不退化）
  - `forwards consoleAPICalled from a sub-target session (worker/iframe)`
  - `ignores non-console CDP events`
  - `network_cdp.test.ts` 全 20 测试（验证 mock 增量向后兼容）
- 修复后测试结果：console_capture 5/5 PASS，network_cdp 20/20 PASS，tsc 无错误，全量 npm test 654/654 PASS

#### 防复发措施

- 测试层面：新增真实 CDP 事件链路单测，覆盖主目标/子目标/非 console 三路径；mock 增量记录 sessionId，后续子目标命令可断言
- 代码层面：console_capture 与 network_capture 共享 cdp_event_router session 注册表，子目标 lifecycle 处理模式对齐
- 文档层面：记录 CDP 架构约束 — 任何依赖 CDP Runtime/Network 域的子系统都必须处理 auto-attach 子目标
- CI / 工具链层面：现有 `npm test` 已覆盖，无需额外配置
- 其他措施：建议后续修复 exception_capture 的同类子目标缺口（连带问题）

#### 验证结果

- 已运行命令：npx vitest run tests/console_capture.test.ts（5 PASS）；npx vitest run tests/network_cdp.test.ts（20 PASS）；npx tsc --noEmit（无错误）；npm test 全量（654 PASS）；npm run build（成功）
- 结果：全部通过
- 未运行命令及原因：E2E（需宿主 Chrome）
- 失败命令及原因：无
- 剩余风险：exception_capture 存在同类子目标 Runtime.enable 缺口（本次未修，超出 BUG-003 范围）；真实 ChatGPT 环境 CDP 行为需 E2E 验证

### BUG-004：user_action/storage 0 事件

#### 负责子代理

BUG-004 子代理

#### 状态

已修复

#### Bug 现象

采集标签包含「用户行为」「Storage」，且 config 开启 `event_count_enabled=true`、`storage_change_count_enabled=true`、`capture_input_values=true`、`mouse_precision='clicks_scroll_drag'`，但导出数据中 `user_action_count=0`、`storage_change_count=0`。实测归档（capture_1781363043195_v38buk8）：events.jsonl 458 行，仅 navigation 10 + cookie 449，无 user_action 无 storage。

#### 触发条件

1. 用户先打开目标页面（如 chatgpt.com），content_script 加载完成
2. 此时 SW 未在采集，content_script 加载时执行 `get_status` → `is_capturing=false` → fallback 退出
3. 用户随后开始采集，SW 给所有 tab 发 `sendMessage({action:'start'})`
4. 因目标 tab 的 content_script 已经过了主动检查阶段，且 Chrome 此刻报 `Could not establish connection. Receiving end does not exist.`，start 消息丢失
5. 整个采集期间目标 tab 上无 mouse/keyboard/scroll/dom/storage 任何事件

#### 影响范围

- 用户行为采集（click/scroll/input/drag/keyboard）完全失效
- Storage 变更采集（localStorage/sessionStorage setItem/removeItem/clear）完全失效
- 实测：整个 2 分钟 chatgpt.com 采集期间 0 条事件
- network/cookie/console 不受影响（这些走 background CDP / chrome.cookies，不依赖 content_script）

#### 涉及文件

- 源码文件：
  - src/content/content_script.ts（fallback 改为轮询）
  - src/shared/poll_capture_status.ts（新增，可注入轮询工具）
- 测试文件：
  - tests/poll_capture_status.test.ts（新增，6 测）
  - tests/content_script_uses_poll.test.ts（新增，3 测契约）
- 文档文件：无（建议后续在 docs/specs/data_flow.md 增补 content_script ↔ SW 时序）

#### 代码根因分析

- 相关调用链：
  - `chrome.tabs.sendMessage(tab.id, {action:'start'})` (service_worker.ts:387) → chatgpt.com tab content_script onMessage → **失败：Receiving end does not exist**
  - `chrome.tabs.sendMessage(tab.id, {action:'start'})` (service_worker.ts:709, tab 切换时重试) → 同样失败
  - content_script.ts 加载时 `chrome.runtime.sendMessage({action:'get_status'})` → 当时 `is_capturing=false` → 不启动 → 之后无重试
- 直接原因：content_script.ts 加载时只调用一次 `get_status`，若 SW 未采集就退出，之后 SW 开始采集时无法通知到该 tab
- 深层原因：
  1. Chrome MV3 content_script 与 SW 的双向消息没有"采集开始"的可靠广播机制（sendMessage 是点对点，需要接收方已就绪）
  2. `chrome.tabs.sendMessage` 在 content_script 上下文未 ready 时报 "Receiving end does not exist"，SW 端 catch 后只 warn 不重试
  3. content_script 的 fallback 是一次性 poll，不是持续 poll，错过了 SW 后续的状态变化
- 错误状态如何产生：SW 发 start 失败 → 该 tab 不进入采集态 → 用户在该 tab 上的所有交互事件无人订阅转发 → events.jsonl 中该 tab 来源事件为 0
- 是否存在同类代码模式：所有依赖"SW → content_script 一次性消息触发"的链路都有类似风险
- 是否发现相关连带问题：
  - SW 端 `chrome.tabs.sendMessage` 失败后未重试（service_worker.ts:395-397、474-477）。建议未来加 2~3 次短延迟重试
  - content_script 没有"被 SW 主动 ping 检测存活"的机制

#### 为什么现有测试没有发现

- `tests/tab_events.test.ts` 测的是纯函数（navigation 去重、事件构造），未覆盖 content_script 与 SW 的真实消息时序
- `tests/p036_user_action_filter.test.ts` 测的是 event_type → category 映射常量一致性，不涉及采集启动链路
- 全仓没有针对 "content_script 加载时序 vs SW 采集开始时序" 的集成测试
- content_script.ts 顶层执行 `chrome.runtime.onMessage.addListener`，node 环境无法直接 import，阻碍了模块级单测

#### 测试处理方式

新增测试

说明：新增 2 个测试文件共 9 个测试用例。`poll_capture_status.test.ts` 用依赖注入（mock get_status/setInterval/clearInterval）隔离浏览器 API；`content_script_uses_poll.test.ts` 用静态源码扫描（fs.readFileSync）规避 content_script 不能直接 import 的问题，做契约级回归防御。

#### 文档和需求分析

- 文档是否定义了正确行为：是。CLAUDE.md / PRD 要求 7 数据标签全部生效，「用户行为」/「Storage」是核心标签
- 代码是否违反文档：是。content_script 的 fallback 实现导致用户已开启的标签实际不工作
- 测试是否体现文档要求：之前没有，本次新增
- 文档是否存在缺失、错误或歧义：docs/specs/data_flow.md 对 content_script ↔ SW 时序的描述较薄
- 是否需要补充文档：建议在 docs/specs/data_flow.md 增补"content_script 加载 → start_status_poll 轮询"链路
- 本次是否已补充文档：否

#### 问题归因

代码实现缺陷（content_script 状态同步不可靠）

原因说明：content_script 加载时的一次性 get_status 是"开环"设计——假设 SW 在 content_script 加载瞬间已经处于最终状态。实际 SW 采集开始是用户后续操作，时序错配导致 content_script 永远不知道采集已开始。修复改为"闭环"轮询。

#### TDD 修复记录

- 修复前失败测试：`tests/content_script_uses_poll.test.ts > content_script source integrates start_status_poll (regression guard)`
- 测试文件：tests/content_script_uses_poll.test.ts
- 测试名称：`BUG-004 contract: content_script uses status polling > content_script source integrates start_status_poll (regression guard)`
- 测试输入：将 `src/content/content_script.ts` 临时回退到旧"一次性 get_status"实现，运行契约测试
- 期望断言：源码匹配 `/start_status_poll\s*\(\s*\{/`（必须实际调用轮询）
- 修复前失败原因：旧实现无此调用，正则不匹配
- 修改的源码文件：
  - src/shared/poll_capture_status.ts（新增）
  - src/content/content_script.ts（接入轮询）
- 最小修复说明：抽出 `start_status_poll` 工具模块（依赖注入），content_script 加载时启动轮询替代一次性 get_status；stop_capture 时停止轮询
- 回归测试：
  - `REGRESSION BUG-004: when first get_status returns not_capturing, keeps polling and fires on_active once SW starts`
  - `REGRESSION BUG-004: get_status rejection does not break the polling loop`
  - `REGRESSION BUG-004: content_script stop_capture calls stop_status_poll`
- 修复后测试结果：新增 9 测全 PASS；全量 npm test 654/654 PASS；tsc 无错误

#### 防复发措施

- 测试层面：契约测试静态扫描 content_script.ts 源码，强制 `start_status_poll` 调用 + stop_capture 清理 + 禁用旧 fallback 模式；poll 模块自身有完整单测覆盖正常/reject/stop 路径
- 代码层面：轮询逻辑抽到独立模块，依赖注入便于复用与测试；5 分钟最大轮询上限防泄漏；stop_status_poll 在采集结束时清理
- 文档层面：源码内嵌详细注释（根因 + 修复思路），指向测试文件
- CI / 工具链层面：依赖现有 vitest + tsc gate
- 其他措施：建议主代理后续在 SW 端 `chrome.tabs.sendMessage` 失败时加 2~3 次短延迟重试，与 content_script 轮询形成双保险

#### 验证结果

- 已运行命令：npx vitest run tests/poll_capture_status.test.ts tests/content_script_uses_poll.test.ts（9 PASS）；npx vitest run 含相关模块（41 PASS）；npx tsc --noEmit（无错误）；npm test 全量（654 PASS）；npm run build（成功）
- 结果：全部通过
- 未运行命令及原因：E2E（需真实 Chrome 扩展环境）
- 失败命令及原因：无
- 剩余风险：
  - 轮询有 2 秒间隔，最坏情况下采集开始后 2 秒 content_script 才同步启动，可能丢失最初 2 秒的用户行为（可接受）
  - 若 tab 完全冻结（Chrome 节能），setInterval 不执行，仍无法补救——但此时页面也无法产生用户事件，无影响
  - SW 端 sendMessage 失败未重试，仍可能延迟首次同步

### BUG-005：Bridge 自身 URL 未排除致 cdp_failed

#### 负责子代理

BUG-005 子代理

#### 状态

已修复

#### Bug 现象

119 个 response_body_status=cdp_failed，其中 117 个 URL 为 `http://127.0.0.1:9777/log`（项目自身 Bridge 日志上报端点），2 个为 text/event-stream（SSE，预期失败可接受）。

#### 触发条件

开启采集后，扩展自身组件（Bridge 客户端轮询、日志上报等）向本地 Bridge（127.0.0.1:<port>）发起 HTTP 请求时，这些请求被 webRequest 与 CDP 一并捕获并尝试采集 response body。

#### 影响范围

- 117 个无效 cdp_failed 计数，污染 capture stats
- body_capture_status 统计失真
- 不影响正常外部 URL 采集

#### 涉及文件

- 源码文件：src/background/network_capture.ts
- 测试文件：tests/network_capture.test.ts
- 文档文件：无

#### 代码根因分析

- 相关调用链：webRequest `handle_before_request`（`<all_urls>` 注册）→ `pending_requests.set`；CDP `Network.requestWillBeSent` → `cdp_request_meta.set` → `Network.loadingFinished` → `Network.getResponseBody` 失败 → `cdp_failed`
- 直接原因：两个采集入口均无 URL origin 过滤，Bridge 的 `http://127.0.0.1:<port>/log` 等请求被当作普通网络请求采集
- 深层原因：webRequest 以 `<all_urls>` 注册且无 URL filter；CDP 事件入口未区分请求来源 origin
- 错误状态如何产生：Bridge 是本地 HTTP 服务，其响应生命周期与 CDP getResponseBody 时序不匹配，CDP 返回 -32000（No resource）或无 body，因 method 非 OPTIONS/HEAD 被标记为 cdp_failed
- 是否存在同类代码模式：是——webRequest 全部 5 个 handler 与 CDP 全部事件均无 origin 过滤
- 是否发现相关连带问题：chrome-extension:// 内部跳转同样会被采集（已在同一修复中覆盖）

#### 为什么现有测试没有发现

现有测试均为纯函数（redaction、truncation、body parsing、CDP 匹配）或直接操作内部 Map 的集成测试，从未构造指向 127.0.0.1/localhost/chrome-extension 的请求 URL 验证「自身 origin 应被排除」这一采集边界规则。测试缺口是「采集入口 URL 过滤」这条横切规则完全没有被测覆盖。

#### 测试处理方式

新增测试

说明：新增 `is_self_origin_url (BUG-005)` describe block（7 用例），锁定过滤函数行为。

#### 文档和需求分析

- 文档是否定义了正确行为：是——CLAUDE.md 明确「Bridge 仅绑定 127.0.0.1」，隐含 Bridge 流量属自身内部流量不应采集
- 代码是否违反文档：是——采集入口未尊重 Bridge origin 边界
- 测试是否体现文档要求：修复前否，现已补齐
- 文档是否存在缺失、错误或歧义：否
- 是否需要补充文档：否
- 本次是否已补充文档：否

#### 问题归因

设计遗漏（采集入口缺少 origin 边界过滤）

原因说明：网络采集模块以「采集一切」为默认（`<all_urls>`），但未考虑扩展自身与本地 Bridge 的请求属于内部基础设施流量，既无业务价值又会因 CDP 时序问题产生噪声失败。缺少一个统一的 origin 边界判定函数。

#### TDD 修复记录

- 修复前失败测试：`is_self_origin_url is not a function`
- 测试文件：tests/network_capture.test.ts
- 测试名称：`is_self_origin_url (BUG-005) > excludes 127.0.0.1 bridge log endpoint`（及同 block 其余 6 个）
- 测试输入：`'http://127.0.0.1:9777/log'`、`'http://127.0.0.1:17831/extension/heartbeat'`、`'http://localhost:9777/log'`、`'chrome-extension://abc123/options.html'`、`'https://example.com/api/data'` 等
- 期望断言：自身 origin URL 返回 true，外部 URL 返回 false
- 修复前失败原因：函数未导出，TypeError
- 修改的源码文件：src/background/network_capture.ts
- 最小修复说明：新增导出 `is_self_origin_url`（按 hostname 判定 127.0.0.1/localhost + chrome-extension 前缀）；在 `handle_before_request` 与 `Network.requestWillBeSent` 入口调用，命中即 return 不采集
- 回归测试：7 个用例覆盖各端口/origin 组合及误杀防护
- 修复后测试结果：network_capture 92/92 PASS，network_cdp+correlator 51/51 PASS，tsc 无错误，全量 npm test 654/654 PASS

#### 防复发措施

- 测试层面：`is_self_origin_url` 单测锁定行为；未来若放松过滤（误放行 127.0.0.1）测试即红
- 代码层面：过滤位于两个入口最早处，Bridge URL 永不进入内部数据结构；端口按 host 排除不硬编码
- 文档层面：CLAUDE.md 已有 Bridge 127.0.0.1 约定，无需补充
- CI / 工具链层面：依赖现有 vitest + tsc 闸门
- 其他措施：设计上建议未来若引入更多自身端点（如 devtools page），同样会被 hostname 规则覆盖

#### 验证结果

- 已运行命令：
  - npx vitest run tests/network_capture.test.ts -t "is_self_origin_url" → 7 PASS
  - npx vitest run tests/network_capture.test.ts → 92 PASS
  - npx vitest run tests/network_cdp.test.ts tests/network_correlator.test.ts → 51 PASS
  - npx tsc --noEmit → 无错误
  - npm test 全量 → 654 PASS
  - npm run build → 成功
- 结果：全部通过
- 未运行命令及原因：E2E（需宿主 Chrome）
- 失败命令及原因：无
- 剩余风险：2 个 SSE（text/event-stream）cdp_failed 属预期失败（流式响应无法一次性 getResponseBody），不在本 bug 范围；若未来 Bridge 改用非 localhost host（如 0.0.0.0），需扩展 hostname 判定
