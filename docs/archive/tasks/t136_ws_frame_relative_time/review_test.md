# Task review t136（reviewer_focus: 测试）

- task：`t136_ws_frame_relative_time`
- spec：`docs/tasks/t136_ws_frame_relative_time/spec.md`
- diff_anchor：`730b003a26736c230e597554054dff582ba13eb2`
- target：`git diff 730b003a26736c230e597554054dff582ba13eb2`
- round：1
- reviewed_at：2026-08-12 14:00 UTC+8

reviewed_scope: 1c59829e91b6fe6c

## Findings

### t136_test_f001 - `_ws_frame_relative_time_for_test` 是测试专用平行实现，非生产逻辑薄包装

- 严重度：important
- 锚点：AC-001（可测试性声明「AC-001/002: network_capture 测试新增 ws_frame 相对时间断言」）
- 位置：`src/extension/background/network_capture.ts:297-299`；`tests/unit/t136_ws_frame_relative_time.test.ts:7-20`
- 问题：生产路径 `send_ws_frame`（`network_capture.ts:348`）直接写 `relative_time_ms: Date.now() - start_time`，从不调用 `_ws_frame_relative_time_for_test`。全仓 grep 确认该函数定义后唯一引用处是测试文件，生产零调用。因此它不是「包装生产逻辑的薄包装」，而是复刻 `now - start` 算术的测试专用空转函数。AC-001 / AC-001b 断言的是这个平行实现，而非真实 ws_frame 事件构造路径（`create_base_event` + `send_to_background` 链路）。一旦生产公式偏离（加 clamp、换基准、改取整），AC-001 / AC-001b 照常通过，生产侧唯一约束只剩 AC-002 的源码字符串断言（其脆弱性见 f003）。属「测试只能在测试中复制生产逻辑 → 平行实现冒充覆盖」缺口，生产逻辑不可直接触达。
- 建议：二选一。（a）让生产真正调用该函数——去 `_for_test` 后缀并改名（如 `ws_frame_relative_time(now, start)`），`send_ws_frame` 处改为 `relative_time_ms: ws_frame_relative_time(Date.now(), start_time)`，使 AC-001 断言直接触达生产逻辑；（b）走行为路径：mock Chrome 环境，经 `handle_cdp_event`（`network_capture.ts:724/728`）触发 ws 帧 CDP 事件，断言 `send_to_background` 发出的 event `relative_time_ms` 为 now-start 且非负。

### t136_test_f002 - AC-003 边界用例完全无测试

- 严重度：important
- 锚点：AC-003（可测试性声明明确「AC-003: 边界用例」）
- 位置：`tests/unit/t136_ws_frame_relative_time.test.ts`（全文件仅 AC-001 / AC-001b / AC-002 三用例）
- 问题：AC-003「timeline 查询对既有负值数据不崩溃」无可测实现对应的测试。契约区「有意不测」为「无」，可测试性声明承诺边界用例，但 diff 未新增任何负 `relative_time_ms` 数据的查询用例。目标函数 `get_timeline_from_capture_data` / `get_record_sort_key`（`src/extension/background/agent_data_queries.ts:136-161`）为纯函数，注入含负 `relative_time_ms` 的 fixture 即可断言不崩溃、排序正确、时间窗过滤不误伤，`tests/unit/agent_data_queries.test.ts` 已具同类测试但无负值用例。此 AC 完全无测试。
- 建议：补 AC-003 边界用例——构造含负 `relative_time_ms`（如 -1.7e12）的 fixture，断言 `get_timeline_from_capture_data` 不抛异常且按 `get_record_sort_key` 数值排序/过滤正常。

### t136_test_f003 - AC-002 源码断言存在可被绕过的回归盲区

- 严重度：minor
- 锚点：AC-002（源码断言对生产 `send_ws_frame` 的约束强度）
- 位置：`tests/unit/t136_ws_frame_relative_time.test.ts:22-32`
- 问题：AC-002 的断言对**当前**生产块（slice 为 `network_capture.ts:301-356`，正确覆盖 348 行 `Date.now() - start_time`）真实成立、确能约束现状。但断言对可逃逸写法有盲区：正则 `/params\?\.timestamp/` 只匹配可选链拼写 `params?.timestamp`，若回归写成 `params.timestamp ? params.timestamp * 1000 : Date.now() - start_time`（无 `?`），则 `toContain('Date.now() - start_time')` 仍命中（else 分支保留该字面量），`not.toMatch(/params\?\.timestamp/)` 也不报——两条断言同时通过而旧 bug 分支已复现。另有 slice 依赖 `indexOf('function send_ws_frame')` / `indexOf('function handle_cdp_event')` 定位，函数改名或重排会使切片静默失真。属源码字符串断言固有的脆弱性。
- 建议：将 `not.toMatch(/params\?\.timestamp/)` 改为 `not.toMatch(/params\.timestamp/)`（当前块内无 `params.timestamp`，改后仍通过且同时拦截可选链与非可选链两种拼写）；理想做法仍是 f001 建议的行为路径断言。

## 结论

- 前轮 finding 复核：本轮为第一轮，无前轮 finding。
- 改测方向复核：无。diff 未修改任何既有测试，仅新增 `tests/unit/t136_ws_frame_relative_time.test.ts`，不存在「迁就实现」的改测。
- 本轮新发现：3 条（t136_test_f001 ~ f003）。
- 未进表的提示：无。AC-001b 的 `toBeLessThan(1e9)` 上界在当前输入下是正常单值断言，非阈值掩盖，不单独出 finding。
- 总体判断：AC-001 被测为平行实现（生产不可达）、AC-003 完全无测试，存在 2 条未解决 important，FAIL。
- 系统性 follow-up：无。未发现跨 task 测试基建缺口（`ws_absolute_time_wiring.test.ts` 走 DB 接线，不覆盖本 AC）。

### AC 复验方式

- AC-001：`re_verified`。逐一复核测试断言与生产公式：AC-001/AC-001b 断言 helper `now - start` 的 delta 与非负性；生产 `network_capture.ts:348` 为 `Date.now() - start_time`，与 helper 同式，但 helper 未被生产调用，测试可达性缺口见 f001。
- AC-002：`re_verified`。用 `indexOf` 复算 slice 边界（`send_ws_frame`@301 → `handle_cdp_event`@357，覆盖 348 行），确认 `not.toMatch(/params\?\.timestamp/)` 与 `toContain('Date.now() - start_time')` 当前成立且切中真实生产块；断言可被非可选链写法绕过见 f003。
- AC-003：`trust_prior`。本 task 无对应测试；依赖既有实现 `get_record_sort_key`（`agent_data_queries.ts:156-161`）数值排序天然不崩溃，但无边界用例验证，缺口见 f002。

coverage = 2 / 3
建议合并前人工抽查 trust_prior 项（AC-003）。

verdict: FAIL

## Round 2 (2026-08-12 15:59 UTC+8)

reviewed_scope: 0081e42ffa788686

### 前轮 finding 复核（以 diff 与代码为准）

- **t136_test_f001 — 已消除**。生产 `send_ws_frame`（`network_capture.ts:348`）现改为 `relative_time_ms: ws_frame_relative_time(Date.now(), start_time)`，直接调用真实函数；`network_capture.ts:300` `export const _ws_frame_relative_time_for_test = ws_frame_relative_time` 为同一函数符号的导出别名，非平行副本。AC-001 / AC-001b 断言 `_ws_frame_relative_time_for_test` 即断言生产函数本体，生产逻辑可达，薄包装成立。逐行核对生产调用点与别名绑定，无残留。
- **t136_test_f002 — 已消除**。`tests/unit/t136_ws_frame_relative_time.test.ts:35-56` 新增 AC-003 用例，直调 `get_timeline_from_capture_data`（`agent_data_queries.ts:136`），fixture 含 `relative_time_ms: -1.7e12` 负值记录。逐行核验生产逻辑：默认 `order` 为 asc，`sort_records` 按 `get_record_sort_key` 数值升序（`agent_data_queries.ts:203-206`），负值 n1 排前、n2 在后；`to_record_preview` 的 `time` 字段即 sort key（`agent_data_queries.ts:213`），故 `records[0].time < 0`、`records[1].time >= 0`、`total === 2` 成立；调用不抛异常即「不崩溃」证据。断言触达真实查询逻辑，非平行实现。
- **t136_test_f003 — 修不彻底（残留 minor，非阻断）**。断言由 `toContain('Date.now() - start_time')` 改为 `toContain('ws_frame_relative_time(Date.now(), start_time)')`，符号耦合显著加强，且精确命中生产调用（`network_capture.ts:348`）。但建议的 `/params\.timestamp/` 未采纳，正则仍为 `/params\?\.timestamp/`，仅拦可选链拼写；若回归写成 `params.timestamp ? params.timestamp * 1000 : ws_frame_relative_time(Date.now(), start_time)`（无 `?`），`toContain` 命中 else 分支字面量、`not.toMatch` 也不报，旧 bug 分支可复现而两条断言同时通过。此残留为原 minor 的未闭合分支，不阻断 PASS。

### 改测方向复核

无。本轮未修改任何既有测试；对既有测试的改动仅新增文件 `tests/unit/t136_ws_frame_relative_time.test.ts`，无「迁就实现」的改测。

### 本轮新发现

0 条。

### 未进表的提示

- AC-003 用例用 `data as never` 强转绕过 TS 类型（fixture 缺 `capture` 字段），运行时 `get_timeline_from_capture_data` 不访问 `data.capture`，无行为影响；更严谨可用 `as unknown as AgentCaptureData`。风格级，未入表。

### 总体判断

f001、f002 两条 important 已按真实生产逻辑修复并复核通过；f003 残留为 minor 且非阻断。当前无未解决 critical / important，PASS。

verdict: PASS

## Round 3 (2026-08-12 16:07 UTC+8)

reviewed_scope: 0081e42ffa788686

### 前轮 finding 复核（以 diff 与代码为准）

- **t136_test_f003 — 已消除（正则修复）**。`tests/unit/t136_ws_frame_relative_time.test.ts:32` 正则由 `/params\?\.timestamp/` 改为 `/params\.timestamp/`。逐条核验：
  - 直接访问拼写 `params.timestamp`（含实际旧 bug 真分支 `params.timestamp * 1000`）现被 `not.toMatch(/params\.timestamp/)` 拦截——正是 f003 原文描述的「无 `?` 回归」场景，f003 定义的缺口已闭合。
  - 当前生产块（`send_ws_frame` → `handle_cdp_event`，`network_capture.ts:301-357`）仅含 `params?.response` 与 `ws_frame_relative_time(Date.now(), start_time)`，无任何 `params.timestamp`；故 `not.toMatch(/params\.timestamp/)` 与 `toContain('ws_frame_relative_time(Date.now(), start_time)')` 均通过。静态核验测试应全绿（未运行测试）。
- **t136_test_f001 / f002 — 维持已消除**。生产代码与 AC-003 用例本轮无改动，前轮复核结论仍成立。

### 本轮新发现

- **t136_test_f004（minor，非阻断）**：`/params\.timestamp/` 仅拦直接访问拼写，不再拦可选链拼写 `params?.timestamp`（Round 1 旧正则 `/params\?\.timestamp/` 原本覆盖）。若回归写成 `params?.timestamp ? params?.timestamp * 1000 : ws_frame_relative_time(Date.now(), start_time)`（全程可选链、无直接访问），`toContain` 命中 else 分支字面量、`not.toMatch` 不报，两条断言同时通过而旧 bug 分支可复现。属源码断言单模式固有盲区，非恒真/弱化。建议改为 `/params\??\.timestamp/`（同时匹配 `params.timestamp` 与 `params?.timestamp`）。生产块当前无 timestamp 引用且实际历史 bug 已被拦，影响限于防御性加固。

### 改测方向复核

无。f003 修正仅改动正则字符，未改断言预期方向，无「迁就实现」迹象。

### 未进表的提示

- 指纹口径盲区（范围外观察）：`tests/unit/t136_ws_frame_relative_time.test.ts` 为 untracked 文件，`git diff <anchor>` 不含未跟踪文件，故 reviewed_scope 指纹（当前 `0081e42ffa788686` 实为 `network_capture.ts` 单文件 hash）无法感知测试文件后续改动。f003 本次正则改动即未被指纹捕获。建议实施方确认测试文件随 task 收尾提交入库（入库后进入 git 跟踪即纳入指纹），或评估指纹口径是否纳入 untracked 测试文件。

### 总体判断

f003 原文缺口（直接访问拼写）已由 `/params\.timestamp/` 闭合；f001、f002 两条 important 均已消除。f004 为 minor 且非阻断。当前无未解决 critical / important，PASS。

verdict: PASS
