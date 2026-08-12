# Task review t135（reviewer_focus: 测试）

- task：`t135_popup_onchanged_race`
- spec：`docs/tasks/t135_popup_onchanged_race/spec.md`
- diff_anchor：`10d59918eeb5b1031d8ed0a4e06e7c2bf42f2e6e`
- target：`git diff 10d59918eeb5b1031d8ed0a4e06e7c2bf42f2e6e`
- round：1
- reviewed_at：2026-08-12 14:34 UTC+8

reviewed_scope: 33f40e00e5c77a59

## Findings

### t135_test_f001 - AC-001/AC-002 无行为断言，可测试性声明未兑现，竞态时序假设未验证

- 严重度：important
- 锚点：AC-001、AC-002
- 位置：`tests/unit/popup_onchanged_race.test.ts`（全文 4 个 it）
- 问题：测试全部为源码字符串结构断言（`readFileSync(popup.ts)` + `indexOf`/`toContain`），无任何行为测试。可测试性声明明确约定「AC-001: 单测模拟 storage.onChanged 触发时序，断言最终态为 saved」「AC-002: 外部变更同步用例」，均未兑现。
  - AC-001 测试只验证 guard 文本存在与位置（监听块 `if (_self_transition) return;` 在 `load_state()` 前、stop_capture 内 `_self_transition = true` 在 `set` 前、`setTimeout` 重置在 `set` 后）。从不触发 `onChanged`，从不断言「stop 后最终态稳定为 saved」。本次修复的承重假设——onChanged 异步派发先于 `setTimeout(0)` 重置回调——无任何测试验证。若该时序假设失效（重置先跑、onChanged 后到，load_state 把 saved 覆盖回 ready），AC-001 失败但测试仍绿（假绿）。
  - AC-002 测试只断言监听块内存在 `load_state()`/`render()`/`start_timer()`/`stop_timer()` 字符串（存在即通过），未跑「外部变更同步用例」，无法证明外部 MCP/SW 写入路径真实保留。
  - 行为测试可行且项目有先例：`tests/unit/popup_start_timing.test.ts:76` 用 jsdom + chrome mock + 动态 `import('../../src/extension/popup/popup.ts')` 直接触达 popup.ts 生产逻辑；`popup_immediate_refresh.test.ts` 建了同一套基础设施。可注册 `chrome.storage.onChanged.addListener` 捕获处理器、以构造 changes 对象调用，断言最终态——正是可测试性声明描述的方案，未采用。
- 建议：按可测试性声明实现行为测试——jsdom 环境 import popup.ts，捕获 onChanged handler，模拟「stop 写入 → onChanged 派发 → 延时重置」时序，断言 `state`/`render` 后 UI 停留 saved；外部变更用例断言 load_state 同步刷新路径仍走。

### t135_test_f002 - 结构断言固定窗口脆弱，无关格式微调即误报红

- 严重度：minor
- 锚点：无直接 AC 违反（测试自身健壮性）
- 位置：`tests/unit/popup_onchanged_race.test.ts:19`（600 字符窗口）、`:56`（700 字符窗口）、`:32-37`（花括号解析器）
- 问题：监听块用硬编码字符窗口切片。实测 `load_state()` 距 addListener 偏移 392（余量仅 208 字符），`stop_timer()` 偏移 615（余量仅 85 字符）。监听块内新增一行注释、空行或 key 筛选变长即超出窗口，测试误报红。`stop_capture` 函数体用逐字符花括号计数解析，函数内字符串字面量若出现 `{`/`}`（如新增文案）即切错边界。测试 2 末尾 `const reset = ...` 仅以 `void reset;` 消费，属死代码。
- 建议：解析改为「定位监听器结尾右括号/函数结尾」而非定长窗口；或删除窗口上限依赖，改用子串起始偏移。`reset` 变量删除。

### t135_test_f003 - AC-003「无新监听泄漏」无直接断言；start_capture guard 接线未测

- 严重度：minor
- 锚点：AC-003（覆盖可更广）
- 位置：`tests/unit/popup_onchanged_race.test.ts:64-71`、`src/extension/popup/popup.ts:380-383`
- 问题：AC-003「修复后无新监听泄漏（render 次数有界）」最直接的证据是「监听器数量不变」——测试未断言源码 `onChanged.addListener` 出现次数（泄漏检测），只断言 key 筛选字符串存在。另 `start_capture` 自身 `_self_transition = true` 接线（popup.ts:380-383）无独立断言；监听侧共用 guard 检查可间接兜底，但若 start 路径漏置 flag 测试不红。start 路径重复 render 因状态相同属良性，故不阻断。
- 建议：加 `(popup_src.match(/onChanged\.addListener/g) || []).length === 1` 断言；start_capture 接线断言（可并入 f001 行为测试覆盖）。

## 结论

- 前轮 finding 复核（Round 1）：无
- 改测方向复核：无。diff 未改动任何既有测试（仅新增 `popup_onchanged_race.test.ts` 与修改 popup.ts、task.md），不存在「迁就实现」改测。
- 本轮新发现：3 条
- 未进表的提示：`readFileSync` 源字符串结构断言是项目既有模式（`content_page_script.test.ts`、`network_hook_config_gate.test.ts` 等同款），本测试沿用该模式本身不算新缺口；缺口在于本 task 的 AC 是行为/时序型（竞态），结构断言替代不了可测试性声明约定的行为验证。start_capture guard 接线已并入 f003。
- 总体判断：FAIL。f001 important 未解决——AC-001/AC-002 可观察行为与时序假设无测试，测试通过不证明竞态已修。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`。reviewer 独立逐条核对测试断言与 `src/extension/popup/popup.ts` 接线（监听 guard 位置、stop_capture 内 true 在 set 前、setTimeout 重置在 set 后），确认测试仅结构断言、未验证「stop 后最终态 saved」与 onChanged 时序；并对当前源码手工推算各断言均成立（未运行测试，只读约束）。该 AC 可观察行为无行为测试，即 f001。
- AC-002：`re_verified`。核对监听块存在性断言（load_state/render/start_timer/stop_timer 字符串），确认无「外部变更同步用例」行为测试，即 f001。
- AC-003：`re_verified`。核对 key 筛选断言存在，确认无监听数/泄漏直接断言，即 f003。
- 覆盖率行：coverage = 3/3。三条 AC 的测试是否存在及断言内容均为 reviewer 静态可查证；但 AC-001/002 的**行为达成度**未被任何测试验证（f001），合并前建议人工抽查真实 popup 时序或补行为测试。

verdict: FAIL

## Round 2 (2026-08-12 15:05 UTC+8)

实现方将生产方案从 `_self_transition` 布尔 + `setTimeout(0)` 改为 `SELF_WRITE_KEY` token（`src/extension/popup/popup.ts:382,413` 的 set 同批写入标记键；`:493-496` 监听检测到即 `remove` + `return`）。以下逐条复核。

### 前轮 finding 复核

- **t135_test_f001（important，仍存在）**：
  - diff 证实设计变更**消除了 f001 原指的时序承重假设**——token 与状态同批写入，Chrome storage onChanged 的 changes 对象含本次全部写入键，机制上无 setTimeout(0) 复位竞态。该半 f001 已由设计解决，如实承认。
  - 但 f001 核心——**AC-001/AC-002 无可观察行为测试**——仍成立：新测试仍为 `readFileSync` 源字符串断言（`tests/unit/popup_onchanged_race.test.ts:15-52`），不触发 onChanged、不断言最终态 saved、无外部变更同步用例；可测试性声明「单测模拟 storage.onChanged 触发时序，断言最终态为 saved」「外部变更同步用例」仍零兑现。
  - 新增具体洞：AC-001b 的 `expect(listener_block).toContain('return;')`（`test.ts:29`）在 600 字符窗口内被 offset 88 的 `if (area !== 'local') return;` 满足（`popup.ts:490`），key 块自身的 `return;` 在 offset ~300（`popup.ts:496`）。若实现移除 key 块 `return` 而 fall-through 到刷新（stop 后渲染 ready 而非 saved，AC-001 行为坏），测试仍绿。承重语义「消费即返回、跳过刷新」未被钉住。
- **t135_test_f002（minor，已修）**：700 定窗（AC-002/003）改为动态 `indexOf('});')` 结尾（`test.ts:38,48`）；stop_capture 花括号解析器删除；`void reset;` 死代码删除。均属实。AC-001b 残留 600 定窗但断言落 offset 88-300，余量充足，接受。
- **t135_test_f003（minor，已修）**：start_capture 接线现被 AC-001 测试钉住（`test.ts:18` 断言 `capture_toggles: toggles, [SELF_WRITE_KEY]`）。残余 addListener 计数断言仍缺，属 f001 行为缺口一部分，不单独阻断。

### 改测方向复核

无「迁就实现」改测。测试与生产设计同步重写，且新设计本身消除原时序竞态，属合法实现改进 + 测试跟进。但测试策略偏离（可测试性声明约定的行为测试仍缺）构成 f001 实质，不因设计变更自动消解。

### 本轮新发现

**t135_test_f004（minor）** - AC-002/003 动态结尾脆弱

- 严重度：minor
- 锚点：无直接 AC 违反（测试自身健壮性）
- 位置：`tests/unit/popup_onchanged_race.test.ts:38,48`
- 问题：`slice(listener_start, indexOf('});', listener_start) + 3)` 取首个 `});`，当前命中 `.then()` 回调闭合（`popup.ts:504`），非监听器自身闭合（`:505`）。若监听体前部新增箭头闭包（如 key 块改 `remove(...).then(() => {})`），切片提前截断，AC-002/003 对仍正确的实现误报红。
- 建议：锚定监听器自身闭合（数括号层级）或按两连 `});` 定位。

### 未进表的提示

- 新设计正确性（实施侧已改、范围外）静态复核通过：自写 set 带 token → onChanged 含 token → 消费跳过无刷新；remove 触发的二次 onChanged 同样含 token 被消费，无循环；外部 SW/MCP 写入不含 token，同步刷新保留（`popup.ts:493-505`）；popup 关闭残留 token 无害（onChanged 仅响应变更，外部写不含该键）。
- f003 的 addListener 计数建议并入 f001 行为缺口，不单列。

### 总体判断

f001（important）未解决：AC-001/AC-002 可观察行为仍无任何测试验证，且关键结构断言 `return;` 未钉住「消费即返回」，测试通过仍不能证明竞态已修。f002/f003 已修。verdict 维持 FAIL。

### AC 复验方式（Round 2）

- AC-001：`re_verified`。逐条核验新测试断言与 `popup.ts` token 接线（start/stop set 均带键、监听消费跳过），确认仍无「触发 onChanged / 断言最终态 saved」行为测试，且 `return;` 断言被 area-filter 满足。
- AC-002：`re_verified`。核验监听块含 load_state/render/start_timer/stop_timer 字符串，确认仍无外部变更同步行为用例。
- AC-003：`re_verified`。核验 key 筛选断言存在，无监听数/泄漏直接断言。
- 覆盖率行：coverage = 3/3（静态可查证）；行为达成度 AC-001/002 仍无测试（f001）。

reviewed_scope: c9bbfd9a94f6bd2f

verdict: FAIL

## Round 3 (2026-08-12 15:20 UTC+8)

测试重写为行为级：真实 `import popup.ts` + `DOMContentLoaded` 触发 + storage mock 异步派发 onChanged，监听闭包为生产逻辑真实执行。以下复核。

### 前轮 finding 复核

- **t135_test_f001（important，修不彻底）**：
  - 已消除部分：监听器消费机制已行为化——`tests/unit/popup_onchanged_race.test.ts:109-127` 真实触发 onChanged（set mock 跨 tick 派发）、真实执行监听闭包，断言 `storage_remove_mock` 被调、`storage_get`（load_state）不被调；AC-002（`:129-153`）外部变更触发 load_state、AC-003（`:155-166`）非关键变更不触发均真实执行监听器。较 R2 纯字符串断言实质进步。
  - 未消除部分（仍 important）：**stop_capture 真实路径未测**。`test.ts:117` 手动调用 `storage_set_mock({ is_capturing: false, current_capture: null, _popup_self_write: Date.now() })` 并手动注入 `_popup_self_write` 键，绕过了生产 `stop_capture()` 与 `popup.ts:413` 的 `[SELF_WRITE_KEY]: Date.now()` 接线。测试注释「与 popup.ts stop_capture 的 set 完全同形」是手工维持的同形——R2 曾以结构断言 `current_capture: null, [SELF_WRITE_KEY]`（旧 test.ts:20）钉住该接线，R3 重写后此覆盖丢失。若未来 stop_capture 忘记写 key，AC-001 测试仍绿（测试手动注入 key）而真实行为坏（stop 后 onChanged 走 load_state 覆盖 saved）。
  - 可测试性声明「断言最终态为 saved」未兑现：测试未建立 saved 态、未断言 state 保持 saved，仅断言 load_state 不被调（机制级）。
  - 端到端可行：DOM stub 含 `#stopBtn`（test.ts:64），`wire_view` 将 click 绑定到 `stop_capture`（`popup.ts:249`），点击可走真实 stop_capture → 真实 set（带 key）→ 真实 onChanged → 断言 state 保持 saved。
- **t135_test_f002（minor，已修）**：结构定窗/花括号解析器/`void reset;` 全部随重写消失。
- **t135_test_f003（minor，已修）**：addListener 计数与 start 接线结构断言消失，但行为测试以真实触发替代覆盖（监听器消费/外部刷新/键筛选均真实执行）。start_capture 的 set 接线与 stop 同理未端到端，并入 f001 残留。
- **t135_test_f004（minor，已修）**：动态 `});` 切片已随行为化消失。

### 改测方向复核

无「迁就实现」改测。测试重写为更接近可测试性声明的行为级，断言真实行为（remove 被调、load_state 不触发、外部变更触发），方向正确。

### 本轮新发现

**t135_test_f005（minor）** - AC-002 仅断言 load_state 触发，未断言外部变更后状态转换

- 严重度：minor
- 锚点：AC-002（覆盖可更广）
- 位置：`tests/unit/popup_onchanged_race.test.ts:151`
- 问题：`expect(storage_get_mock.mock.calls.length).toBeGreaterThan(before)` 只证明 load_state 被调（机制级），未断言 state 转为 'capturing'（外部 start 的可观察结果）。监听器真实执行后 load_state 会因 backing 含 is_capturing:true 而设 state='capturing'，可断言。
- 建议：断言 `state` 或 DOM（is-rec class / 采集视图）反映 capturing。

**t135_test_f006（minor）** - AC-002 触发真实 start_timer 的 setInterval，测试未清理

- 严重度：minor
- 锚点：测试资源泄漏/潜在 flakiness
- 位置：`tests/unit/popup_onchanged_race.test.ts:129-153`
- 问题：外部变更被监听处理后 `start_timer()`（`popup.ts:503`）会 `setInterval` 真实 1s 定时器，测试结束未 `stop_timer` 清理。jsdom 下 interval 持续至进程退出，CI 慢时可能造成定时器泄漏或跨测试干扰。当前未引发失败（用户报 1404 全绿），但属潜在风险。
- 建议：teardown 清理（dispatch 空变更触发 stop_timer 或直接 clearInterval），或断言后显式停表。

### 未进表的提示

- 手动注入 `_popup_self_write` 键与生产 `SELF_WRITE_KEY` 常量同名（当前 `'_popup_self_write'`），若生产改常量名，监听器判断新名、测试注入旧名 → 不消费 → load_state 被调 → 断言红。故 key 改名会正确红，无假绿。
- remove 递归触发二次 onChanged（changes 含 `_popup_self_write`）→ 再消费 → 第三次空 changes → key filter 终止。无死循环，AC-001 的 get 计数断言在该序列下稳定成立。

### 总体判断

f001 修不彻底（important 仍存）：监听器消费机制已真实行为化，但 stop_capture 端到端路径（含 set 携带 key 接线）与「最终态 saved」断言缺失——该接线覆盖在重写中从结构断言丢失，手动构造载荷无法防 stop_capture 接线回归。f002/f003/f004 已修；f005/f006 minor。verdict 维持 FAIL。

### AC 复验方式（Round 3）

- AC-001：`re_verified`。核对 `test.ts:109-127` 真实触发 onChanged、真实执行监听闭包、断言 remove 被调与 load_state 不触发；确认未走真实 stop_capture、未断言 state 保持 saved、set 载荷手动构造（f001 残留）。
- AC-002：`re_verified`。核对 `test.ts:129-153` 外部变更触发真实监听器 → load_state 被调；确认未断言状态转换（f005）。
- AC-003：`re_verified`。核对 `test.ts:155-166` 非关键变更触发真实监听器 → load_state 不被调。
- 覆盖率行：coverage = 3/3（监听器侧行为均已真实验证）；AC-001 stop 端到端/最终态 saved 仍缺（f001 残留，测试运行结果依赖实施侧自述 trust_prior，本 reviewer 未运行测试）。

reviewed_scope: c9bbfd9a94f6bd2f

verdict: FAIL

## Round 4 (2026-08-12 15:35 UTC+8)

AC-001 改为真实 stopBtn 点击链路：`tests/unit/popup_onchanged_race.test.ts:114-139`。以下复核。

### 前轮 finding 复核

- **t135_test_f001（important，已修）**：
  - diff 证实真实链路成立：`storage_backing` 预置 is_capturing:true + current_capture → `dispatchEvent(new Event('DOMContentLoaded'))` → 真实 `load_state` 置 state='capturing' → `render` 生成含 `#stopBtn` 的 capturing 视图 → `stopBtn.dispatchEvent(new MouseEvent('click'))` → 触发 `wire_view` 绑定的真实 `stop_capture`（`popup.ts:249`）。`stop_capture` 内真实 `chrome.storage.local.set({ is_capturing: false, current_capture: null, [SELF_WRITE_KEY]: Date.now() })`（`popup.ts:413`）→ set mock 异步派发 onChanged → 真实监听闭包执行 `SELF_WRITE_KEY in changes` → `remove` + `return`。
  - 断言与生产接线一致：`send_message_mock` toHaveBeenCalledWith `{action:'stop'}`（真实 stop_capture 调用）、`storage_set_mock` objectContaining `{ is_capturing:false, _popup_self_write: expect.any(Number) }`（set 携带 key 接线被真实钉住）、`storage_remove_mock` toHaveBeenCalledWith `'_popup_self_write'`（消费分支执行）。三者均与 `popup.ts` 静态证据吻合。
  - R3 的核心残留——「stop_capture 写 key 接线被手工载荷绕过」——已消除：现在 set 由真实 stop_capture 发出，测试不再手动注入 key。若未来 stop_capture 忘写 key，set changes 无 key → 监听走 load_state → remove 不被调 → 断言红。核心回归点被防住。
  - 当前代码结构下 remove 被调 ⇒ 消费分支 `return` ⇒ load_state 不执行 ⇒ saved 不被覆盖，机制闭环。
  - 剩余：可测试性声明「断言最终态为 saved」的**显式断言**仍缺——测试未直接断言 `state === 'saved'`/UI。当前实现靠代码结构保证，但若未来实现把 remove 挪至 load_state 之后（remove 仍被调但 saved 被覆盖），测试会假绿。见 f007。
- **t135_test_f002（minor，已修）**：结构定窗/花括号解析器/`void reset;` 随行为化消失，无回归。
- **t135_test_f003（minor，已修）**：行为测试替代结构断言覆盖监听器消费/外部刷新/键筛选；start_capture 接线未端到端，但 stop 链路已真实验证同构逻辑，接受。
- **t135_test_f004（minor，已修）**：动态切片脆弱点随行为化消失。
- **t135_test_f005（minor，遗留）**：AC-002 仍仅断言 `storage_get` 被调（`test.ts:163`），未断言 state 转 'capturing'。非阻断。
- **t135_test_f006（minor，遗留）**：AC-002 触发真实 `start_timer()` 的 1s setInterval 未清理（`popup.ts:503`）。非阻断。

### 改测方向复核

无「迁就实现」改测。AC-001 从手动构造载荷改为真实点击链路，测试朝真实行为收敛，方向正确。

### 本轮新发现

**t135_test_f007（minor）** - 可测试性声明「断言最终态为 saved」未显式兑现

- 严重度：minor
- 锚点：AC-001 可测试性声明「单测模拟 storage.onChanged 触发时序，断言最终态为 saved」
- 位置：`tests/unit/popup_onchanged_race.test.ts:114-139`
- 问题：测试断言了消费机制（remove 被调、set 带 key、sendMessage stop），但未显式断言 `state === 'saved'` 或渲染为 saved 视图。当前实现靠消费分支 `return`（`popup.ts:495-496`）在代码结构上保证 saved 不被覆盖；但若未来实现将 remove 置于 load_state 之后（remove 仍被调、测试仍绿），onChanged 会把 state 从 saved 覆盖为 ready——AC-001 行为坏而测试假绿。一行显式最终态断言可消除该盲区。
- 建议：断言 `state` 或 DOM（如 saved 视图存在 / popup 无 is-rec class）在 await_ticks 后仍为 saved。

### 未进表的提示

- DOM stub 存在 `id="stopBtn"` 与 render_capturing 生成 view 内 `#stopBtn` 的 id 冲突（`test.ts:64`），`getElementById` 取文档序第一个；当前 AC-001 初始 state=capturing 时 view 内按钮文档序靠前，点击到已绑定的真实按钮，断言成立。render_ready 时（AC-002/003）getElementById 会取未绑定的 stub 按钮，但那些测试不点击 stopBtn，无影响。属潜在混淆点，可留可清。
- f005/f006/f007 均为 minor，可并入处置表一次性处理。

### 总体判断

f001 已修（真实 stop_capture 链路行为化，set 携带 key 接线与监听消费机制被真实钉住）；f002/f003/f004 已修；f005/f006/f007 为 minor 非阻断。危险模式扫描无命中。无未解决 important → verdict PASS。

### AC 复验方式（Round 4）

- AC-001：`re_verified`。核对 `test.ts:114-139` 真实链路（预置 capturing → dispatch DOMContentLoaded → click stopBtn → 真实 stop_capture → set 带 key → onChanged 消费 remove）与 `popup.ts` 接线（`#stopBtn` click→stop_capture、set 含 `[SELF_WRITE_KEY]`、监听 `SELF_WRITE_KEY in changes`→remove+return）静态吻合；断言均指向真实副作用。最终态 saved 显式断言缺 → f007。
- AC-002：`re_verified`。`test.ts:141-165` 外部变更触发真实监听器 → load_state 被调；未断言状态转换 → f005。
- AC-003：`re_verified`。`test.ts:167-178` 非关键变更触发真实监听器 → load_state 不被调。
- 覆盖率行：coverage = 3/3（三条 AC 均行为级触达真实 popup.ts 监听逻辑；测试运行结果 1404 passed + tsc 依赖实施侧自述 trust_prior，本 reviewer 未运行测试）。

reviewed_scope: c9bbfd9a94f6bd2f

verdict: PASS
